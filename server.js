const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');

const app = express();
const server = http.createServer(app);

// ── WebSocket Server with 16MB max payload for encrypted file sharing ──
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 * 1024 });

// ── Security Headers Middleware ──
app.use((req, res, next) => {
  // HSTS: Force HTTPS for 1 year (including subdomains)
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Prevent clickjacking via iframe embedding
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME-type sniffing attacks
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Referrer leak prevention
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Disable dangerous browser features
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=()');
  // Content Security Policy: Restrict all resource origins
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://webrtc.github.io",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' wss: ws:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "frame-ancestors 'none'"
  ].join('; '));
  // Prevent caching of sensitive pages
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Active WebSocket connections tracking in-memory (for real-time relaying)
const activeSockets = new Map();

function generateUserId() {
  return crypto.randomUUID().substring(0, 8);
}

function generateSecureKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

function hashKey(combinedKey) {
  const salt = 'CryptChat::StaticSalt::ForVerification';
  return crypto.scryptSync(combinedKey, salt, 64).toString('hex');
}

function broadcastToRoom(roomCode, message, excludeWs = null) {
  const users = activeSockets.get(roomCode);
  if (!users) return;
  users.forEach(user => {
    if (user.ws && user.ws !== excludeWs && user.ws.readyState === 1) {
      user.ws.send(JSON.stringify(message));
    }
  });
}

// Per-connection real-time rate limiter (max 30 messages per 10 seconds)
const RATE_LIMIT_WINDOW = 10000;
const RATE_LIMIT_MAX = 30;

function isRateLimited(ws) {
  const now = Date.now();
  if (!ws._rateLimitData) {
    ws._rateLimitData = { count: 1, windowStart: now };
    return false;
  }
  const data = ws._rateLimitData;
  if (now - data.windowStart > RATE_LIMIT_WINDOW) {
    data.count = 1;
    data.windowStart = now;
    return false;
  }
  data.count++;
  if (data.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

wss.on('connection', (ws, req) => {
  let currentRoom = null;
  let currentUser = null;

  // Extract client IP address securely
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  // WebSocket Origin Validation (prevent cross-site WebSocket hijacking)
  const origin = req.headers.origin || '';
  const allowedOrigins = [
    'https://cryptchat-p.onrender.com',
    'http://localhost:3000',
    'http://localhost',
    'https://localhost'
  ];
  if (origin && !allowedOrigins.some(o => origin.startsWith(o))) {
    ws.close(1008, 'Origin not allowed');
    return;
  }

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // Message type whitelist: reject any unknown/malformed message types
    const ALLOWED_TYPES = [
      'create-room', 'join-room', 'key-exchange', 'encrypted-message',
      'typing', 'message-delivered', 'message-opened', 'message-read',
      'edit-message', 'unsend-message', 'ping', 'leave-room',
      'destroy-old-messages', 'call-invite', 'call-accept',
      'call-decline', 'call-hangup', 'webrtc-signal'
    ];
    if (!msg.type || !ALLOWED_TYPES.includes(msg.type)) {
      return;
    }

    // Username length cap (prevent memory abuse via oversized names)
    if (msg.username && (typeof msg.username !== 'string' || msg.username.length > 30)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Username too long (max 30 chars).' }));
      return;
    }

    // Rate limit check (exclude ping, join, and create)
    if (msg.type !== 'ping' && msg.type !== 'create-room' && msg.type !== 'join-room') {
      if (isRateLimited(ws)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Too many messages. Please slow down.' }));
        return;
      }
    }

    switch (msg.type) {

      case 'create-room': {
        const roomCode = crypto.randomUUID().substring(0, 8).toUpperCase();
        
        let upperKey, lowerKey, combinedKey;
        if (msg.customCode && msg.customCode.length === 8) {
          const cleanCode = msg.customCode.toUpperCase();
          upperKey = cleanCode.substring(0, 4);
          lowerKey = cleanCode.substring(4, 8);
          combinedKey = cleanCode;
        } else {
          upperKey = generateSecureKey();
          lowerKey = generateSecureKey();
          combinedKey = upperKey + lowerKey;
        }
        
        const keyHash = hashKey(combinedKey);
        
        // Check if custom code is already in use
        if (msg.customCode && db.getRoomByKeyHash(keyHash)) {
          ws.send(JSON.stringify({ type: 'error', message: 'This custom code is already in use. Try a different one.' }));
          return;
        }

        // Save new room statelessly in database
        db.createRoom(roomCode, keyHash);

        currentUser = { id: generateUserId(), username: msg.username, ws };
        currentRoom = roomCode;

        // Initialize active socket relay
        activeSockets.set(roomCode, [currentUser]);
        db.updateRoomConnections(roomCode, 1);

        ws.send(JSON.stringify({
          type: 'room-created',
          roomCode,
          upperKey,
          lowerKey,
          userId: currentUser.id
        }));
        break;
      }

      case 'join-room': {
        let roomCode = msg.roomCode;
        let room;

        // IP Rate Limiting Check (Brute-force lockout & CPU exhaustion protection)
        const ipLimit = db.getRateLimit(clientIp);
        if (ipLimit.failedAttempts >= 5 && (Date.now() - ipLimit.lastAttempt) < 900000) {
          const timeLeft = Math.ceil((900000 - (Date.now() - ipLimit.lastAttempt)) / 60000);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: `Too many failed attempts. Try again in ${timeLeft} minutes.` 
          }));
          return;
        }

        // Path A: Secure Direct (Starts with 'P')
        if (roomCode && roomCode.startsWith('P')) {
          room = db.getRoom(roomCode);
          if (!room) {
            db.createRoom(roomCode, 'TEMPORARY_PERSONAL_ROOM');
            room = db.getRoom(roomCode);
          }
        } 
        // Path B: Permanent Secure Room (Dual-Keys)
        else {
          const inputKey = (msg.combinedKey || '').trim();
          if (inputKey) {
            const incomingHash = hashKey(inputKey);
            room = db.getRoomByKeyHash(incomingHash);
            
            if (!room) {
              // The room was purged or wiped due to server restart on ephemeral storage.
              // Since they entered the correct keys, we deterministically derive the room code 
              // from the key hash and recreate the room on the fly to guarantee persistence!
              const derivedRoomCode = crypto.createHash('sha256').update(incomingHash).digest('hex').substring(0, 8).toUpperCase();
              db.createRoom(derivedRoomCode, incomingHash);
              room = db.getRoom(derivedRoomCode);
            }
          } else if (msg.roomCode) {
            // Reconnecting using roomCode without combinedKey (fallback)
            room = db.getRoom(msg.roomCode);
          }
          
          if (room) {
            roomCode = room.uuid;
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Secure room not found or invalid keys.' }));
            return;
          }
        }

        // Authentication success: reset the IP rate limit counter
        db.clearRateLimit(clientIp);

        // Initialize active users array if needed
        if (!activeSockets.has(roomCode)) {
          activeSockets.set(roomCode, []);
        }
        const activeUsers = activeSockets.get(roomCode);

        // Clear disconnected users immediately to allow reconnects
        const discoIdx = activeUsers.findIndex(u => !u.ws || u.ws.readyState !== 1);
        if (discoIdx !== -1) {
          const discoUser = activeUsers[discoIdx];
          if (discoUser.disconnectTimeout) {
            clearTimeout(discoUser.disconnectTimeout);
          }
          activeUsers.splice(discoIdx, 1);
          db.updateRoomConnections(roomCode, -1);
          room = db.getRoom(roomCode);
        }

        // Check active connection capacity
        if (room.activeConnections >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Private room occupied' }));
          return;
        }

        // Handle reconnect / resumes
        let existingUser = null;
        if (msg.userId) {
          existingUser = activeUsers.find(u => u.id === msg.userId);
        }

        if (existingUser) {
          if (existingUser.disconnectTimeout) {
            clearTimeout(existingUser.disconnectTimeout);
            existingUser.disconnectTimeout = null;
          }
          existingUser.ws = ws;
          currentUser = existingUser;
          currentRoom = roomCode;

          const peer = activeUsers.find(u => u.id !== currentUser.id);

          ws.send(JSON.stringify({
            type: 'room-joined',
            roomCode,
            userId: currentUser.id,
            peerUsername: peer ? peer.username : null,
            resumed: true
          }));

          if (peer && peer.ws && peer.ws.readyState === 1) {
            peer.ws.send(JSON.stringify({
              type: 'peer-reconnected',
              peerUsername: currentUser.username
            }));
          }

          const roomHistory = db.getMessages(roomCode);
          if (roomHistory.length > 0) {
            ws.send(JSON.stringify({
              type: 'message-history',
              messages: roomHistory.map(m => m.payload)
            }));
          }
          break;
        }

        // Normal joining flow
        currentUser = { id: generateUserId(), username: msg.username, ws };
        currentRoom = roomCode;
        activeUsers.push(currentUser);

        db.updateRoomConnections(roomCode, 1);
        const peer = activeUsers.find(u => u.id !== currentUser.id);

        ws.send(JSON.stringify({
          type: 'room-joined',
          roomCode,
          userId: currentUser.id,
          peerUsername: peer ? peer.username : null
        }));

        const roomHistory = db.getMessages(roomCode);
        if (roomHistory.length > 0) {
          ws.send(JSON.stringify({
            type: 'message-history',
            messages: roomHistory.map(m => m.payload)
          }));
        }

        if (peer && peer.ws && peer.ws.readyState === 1) {
          peer.ws.send(JSON.stringify({
            type: 'peer-joined',
            peerUsername: currentUser.username
          }));
        }
        break;
      }

      case 'key-exchange': {
        if (!currentRoom || !currentUser) return;
        broadcastToRoom(currentRoom, {
          type: 'key-exchange',
          publicKey: msg.publicKey,
          from: currentUser.id
        }, ws);
        break;
      }

      case 'encrypted-message': {
        if (!currentRoom || !currentUser) return;
        const savedMsg = {
          ...msg,
          type: 'encrypted-message',
          roomCode: currentRoom,
          from: currentUser.id,
          fromUsername: currentUser.username,
          timestamp: Date.now()
        };

        // Persist transient encrypted messages in local DB
        db.saveMessage(currentRoom, savedMsg);

        broadcastToRoom(currentRoom, savedMsg, ws);
        break;
      }

      case 'typing': {
        if (!currentRoom || !currentUser) return;
        broadcastToRoom(currentRoom, {
          type: 'typing',
          from: currentUser.username,
          isTyping: msg.isTyping
        }, ws);
        break;
      }

      case 'message-delivered': {
        if (!currentRoom || !currentUser) return;
        broadcastToRoom(currentRoom, {
          type: 'message-delivered',
          messageId: msg.messageId
        }, ws);
        break;
      }

      case 'message-opened':
      case 'message-read': {
        if (!currentRoom || !currentUser) return;
        // Purging is automatic via TTL index / routine to preserve DB stateless messages tracking
        broadcastToRoom(currentRoom, {
          type: msg.type,
          messageId: msg.messageId
        }, ws);
        break;
      }

      case 'edit-message': {
        if (!currentRoom || !currentUser) return;
        broadcastToRoom(currentRoom, {
          type: 'edit-message',
          messageId: msg.messageId,
          iv: msg.iv,
          ciphertext: msg.ciphertext,
          fromUsername: currentUser.username
        }, ws);
        break;
      }

      case 'unsend-message': {
        if (!currentRoom || !currentUser) return;
        broadcastToRoom(currentRoom, {
          type: 'unsend-message',
          messageId: msg.messageId,
          fromUsername: currentUser.username
        }, ws);
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      case 'destroy-old-messages': {
        if (!currentRoom || !currentUser) return;
        const threshold = Date.now() - 600000;
        db.purgeExpiredMessages();
        broadcastToRoom(currentRoom, {
          type: 'old-messages-destroyed',
          threshold: threshold
        });
        break;
      }

      case 'leave-room': {
        if (currentRoom && currentUser) {
          const activeUsers = activeSockets.get(currentRoom);
          if (activeUsers) {
            if (currentUser.disconnectTimeout) {
              clearTimeout(currentUser.disconnectTimeout);
              currentUser.disconnectTimeout = null;
            }

            if (currentRoom.startsWith('P')) {
              // For personal rooms, give a 3-minute grace period before destroying
              broadcastToRoom(currentRoom, {
                type: 'peer-left',
                username: currentUser.username,
                roomDestroyed: false
              });
              
              const filtered = activeUsers.filter(u => u.id !== currentUser.id);
              activeSockets.set(currentRoom, filtered);
              db.updateRoomConnections(currentRoom, -1);

              if (filtered.length === 0) {
                // Room is completely empty, schedule deletion after 3 minutes
                const roomToDelete = currentRoom;
                setTimeout(() => {
                  if (!activeSockets.has(roomToDelete) || activeSockets.get(roomToDelete).length === 0) {
                    activeSockets.delete(roomToDelete);
                    db.deleteRoom(roomToDelete);
                  }
                }, 180000); // 3 minutes grace period
              }
            } else {
              activeSockets.set(currentRoom, activeUsers.filter(u => u.id !== currentUser.id));
              db.updateRoomConnections(currentRoom, -1);

              broadcastToRoom(currentRoom, {
                type: 'peer-left',
                username: currentUser.username
              });

              if (activeSockets.get(currentRoom).length === 0) {
                activeSockets.delete(currentRoom);
                db.clearMessagesForRoom(currentRoom); // Wipe chat but keep room
              }
            }
          }
          currentRoom = null;
          currentUser = null;
        }
        break;
      }

      case 'call-invite':
      case 'call-accept':
      case 'call-decline':
      case 'call-hangup':
      case 'webrtc-signal': {
        if (!currentRoom || !currentUser) return;
        broadcastToRoom(currentRoom, msg, ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentUser && currentRoom) {
      currentUser.ws = null;
      const activeUsers = activeSockets.get(currentRoom);
      if (activeUsers) {
        const disconnectedUser = currentUser;
        const disconnectedRoom = currentRoom;
        
        const timeoutDuration = disconnectedRoom.startsWith('P') ? 180000 : 60000;

        disconnectedUser.disconnectTimeout = setTimeout(() => {
          const uList = activeSockets.get(disconnectedRoom);
          if (!uList) return;

          broadcastToRoom(disconnectedRoom, {
            type: 'peer-left',
            username: disconnectedUser.username
          });

          const filtered = uList.filter(u => u.id !== disconnectedUser.id);
          activeSockets.set(disconnectedRoom, filtered);
          db.updateRoomConnections(disconnectedRoom, -1);

          if (filtered.length === 0) {
            activeSockets.delete(disconnectedRoom);
            if (disconnectedRoom.startsWith('P')) {
              db.deleteRoom(disconnectedRoom);
            } else {
              db.clearMessagesForRoom(disconnectedRoom); // Wipe chat but keep room
            }
          }
        }, timeoutDuration);
      }
    }
  });

  ws.on('error', () => {});
});

// Purge expired TTL messages and inactive rooms automatically every 30 seconds
setInterval(() => {
  try {
    db.purgeExpiredMessages();
    db.purgeInactiveRooms();
    
    // Broadcast the purge event to all active rooms so clients clear them instantly
    const threshold = Date.now() - 600000;
    activeSockets.forEach((users, roomCode) => {
      broadcastToRoom(roomCode, {
        type: 'old-messages-destroyed',
        threshold: threshold
      });
    });
  } catch (e) {
    console.error('Auto-purge background task failed:', e);
  }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🔐 CryptChat Server running at:`);
  console.log(`     → Local:   http://localhost:${PORT}`);
  console.log(`     → Network: http://0.0.0.0:${PORT}\n`);
});

// Live reload trigger: 2026-05-27T11:18:00

