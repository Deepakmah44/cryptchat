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

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
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
        const upperKey = generateSecureKey();
        const lowerKey = generateSecureKey();
        const combinedKey = upperKey + lowerKey;
        const keyHash = hashKey(combinedKey);

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
        const inputKey = (msg.combinedKey || '').trim();

        // Locate room by hashing the input combinedKey and querying the database
        const incomingHash = hashKey(inputKey);
        const room = db.getRoomByKeyHash(incomingHash);
        
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid secure access' }));
          return;
        }

        const roomCode = room.uuid;

        // Check active connection capacity
        if (room.activeConnections >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Private room occupied' }));
          return;
        }

        // Initialize active users array if needed
        if (!activeSockets.has(roomCode)) {
          activeSockets.set(roomCode, []);
        }
        const activeUsers = activeSockets.get(roomCode);

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
            activeSockets.set(currentRoom, activeUsers.filter(u => u.id !== currentUser.id));
            db.updateRoomConnections(currentRoom, -1);

            broadcastToRoom(currentRoom, {
              type: 'peer-left',
              username: currentUser.username
            });

            if (activeSockets.get(currentRoom).length === 0) {
              activeSockets.delete(currentRoom);
              db.deleteRoom(currentRoom);
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
            db.deleteRoom(disconnectedRoom);
          }
        }, 15000);
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
