const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);

// ── WebSocket Server with 16MB max payload for encrypted file sharing ──
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 * 1024 });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Room management
const rooms = new Map();

// File-based Transient E2EE Message Store
const fs = require('fs');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (e) {
    console.error('Failed to load messages from file:', e);
  }
  return [];
}

function saveMessages(messages) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save messages to file:', e);
  }
}

function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

function broadcastToRoom(roomCode, message, excludeWs = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  // Update room activity timestamp
  room.lastActivity = Date.now();
  room.users.forEach(user => {
    if (user.ws && user.ws !== excludeWs && user.ws.readyState === 1) {
      user.ws.send(JSON.stringify(message));
    }
  });
}

// ── Per-connection rate limiter ──
// Max 30 messages per 10 seconds per connection
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
    // Reset window
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

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentUser = null;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    // Rate limit check (allow ping and join/create freely)
    if (msg.type !== 'ping' && msg.type !== 'create-room' && msg.type !== 'join-room') {
      if (isRateLimited(ws)) {
        ws.send(JSON.stringify({ type: 'error', message: 'Too many messages. Please slow down.' }));
        return;
      }
    }

    switch (msg.type) {

      case 'create-room': {
        const roomCode = msg.roomCode;
        if (rooms.has(roomCode)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room already exists' }));
          return;
        }
        currentUser = { id: generateUserId(), username: msg.username, ws };
        currentRoom = roomCode;
        rooms.set(roomCode, { users: [currentUser], createdAt: Date.now(), lastActivity: Date.now() });
        ws.send(JSON.stringify({
          type: 'room-created',
          roomCode,
          userId: currentUser.id
        }));
        break;
      }

      case 'join-room': {
        const roomCode = msg.roomCode;
        let room = rooms.get(roomCode);
        if (!room) {
          if (roomCode.startsWith('P')) {
            room = { users: [], createdAt: Date.now(), lastActivity: Date.now() };
            rooms.set(roomCode, room);
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found. Check room code.' }));
            return;
          }
        }

        // Check if this is a reconnecting user resuming their session
        let existingUser = null;
        if (msg.userId) {
          existingUser = room.users.find(u => u.id === msg.userId);
        }

        if (existingUser) {
          // Clear the pending disconnect timeout since the user has returned
          if (existingUser.disconnectTimeout) {
            clearTimeout(existingUser.disconnectTimeout);
            existingUser.disconnectTimeout = null;
          }
          // Update the WebSocket instance to the new active connection
          existingUser.ws = ws;
          currentUser = existingUser;
          currentRoom = roomCode;
          room.lastActivity = Date.now();

          const peer = room.users.find(u => u.id !== currentUser.id);

          // Confirm re-join session to the client
          ws.send(JSON.stringify({
            type: 'room-joined',
            roomCode,
            userId: currentUser.id,
            peerUsername: peer ? peer.username : null,
            resumed: true
          }));

          // Notify peer that the user reconnected
          if (peer && peer.ws && peer.ws.readyState === 1) {
            peer.ws.send(JSON.stringify({
              type: 'peer-reconnected',
              peerUsername: currentUser.username
            }));
          }

          // Send stored room messages (resending ensures client captures anything missed)
          const allMessages = loadMessages();
          const roomHistory = allMessages.filter(m => m.roomCode === roomCode);
          if (roomHistory.length > 0) {
            ws.send(JSON.stringify({
              type: 'message-history',
              messages: roomHistory
            }));
          }
          break;
        }

        // Normal new join flow
        if (room.users.length >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 2 users).' }));
          return;
        }
        currentUser = { id: generateUserId(), username: msg.username, ws };
        currentRoom = roomCode;
        room.users.push(currentUser);
        room.lastActivity = Date.now();

        const peer = room.users.find(u => u.id !== currentUser.id);

        // Notify the joiner
        ws.send(JSON.stringify({
          type: 'room-joined',
          roomCode,
          userId: currentUser.id,
          peerUsername: peer ? peer.username : null
        }));

        // Send history of stored messages for this room
        const allMessages = loadMessages();
        const roomHistory = allMessages.filter(m => m.roomCode === roomCode);
        if (roomHistory.length > 0) {
          ws.send(JSON.stringify({
            type: 'message-history',
            messages: roomHistory
          }));
        }

        // Notify existing user that peer joined
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
        // Relay the public key to the other user in the room
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

        // Persist message for offline/asynchronous delivery
        const allMessages = loadMessages();
        allMessages.push(savedMsg);
        saveMessages(allMessages);

        // Relay encrypted message — server NEVER decrypts
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

      case 'message-opened': {
        if (!currentRoom || !currentUser) return;
        // Delete message from persistent store upon opening
        const allMsgsOpened = loadMessages();
        const updatedMsgsOpened = allMsgsOpened.filter(m => !(m.roomCode === currentRoom && m.messageId === msg.messageId));
        saveMessages(updatedMsgsOpened);

        broadcastToRoom(currentRoom, {
          type: 'message-opened',
          messageId: msg.messageId
        }, ws);
        break;
      }

      case 'message-read': {
        if (!currentRoom || !currentUser) return;
        // Delete message from persistent store upon reading
        const allMsgsRead = loadMessages();
        const updatedMsgsRead = allMsgsRead.filter(m => !(m.roomCode === currentRoom && m.messageId === msg.messageId));
        saveMessages(updatedMsgsRead);

        broadcastToRoom(currentRoom, {
          type: 'message-read',
          messageId: msg.messageId
        }, ws);
        break;
      }

      case 'edit-message': {
        if (!currentRoom || !currentUser) return;
        // Update the stored message with new encrypted content
        const allMsgsEdit = loadMessages();
        const msgIndex = allMsgsEdit.findIndex(m => m.roomCode === currentRoom && m.messageId === msg.messageId && m.from === currentUser.id);
        if (msgIndex !== -1) {
          allMsgsEdit[msgIndex].iv = msg.iv;
          allMsgsEdit[msgIndex].ciphertext = msg.ciphertext;
          allMsgsEdit[msgIndex].edited = true;
          saveMessages(allMsgsEdit);
        }
        // Broadcast edit to peer
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
        // Delete from stored messages
        const allMsgsUnsend = loadMessages();
        const updatedMsgsUnsend = allMsgsUnsend.filter(m => !(m.roomCode === currentRoom && m.messageId === msg.messageId && m.from === currentUser.id));
        saveMessages(updatedMsgsUnsend);
        // Broadcast unsend to peer
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
        const threshold = Date.now() - 600000; // 10 minutes ago in ms
        const allMsgsDestroy = loadMessages();
        
        // Delete messages older than 10 minutes for this specific room
        const updatedMsgsDestroy = allMsgsDestroy.filter(m => !(m.roomCode === currentRoom && m.timestamp < threshold));
        saveMessages(updatedMsgsDestroy);
        
        // Broadcast to everyone in the room (including the sender)
        broadcastToRoom(currentRoom, {
          type: 'old-messages-destroyed',
          threshold: threshold
        });
        break;
      }

      case 'leave-room': {
        if (currentRoom && currentUser) {
          const room = rooms.get(currentRoom);
          if (room) {
            // Clear any pending disconnect timeout
            if (currentUser.disconnectTimeout) {
              clearTimeout(currentUser.disconnectTimeout);
              currentUser.disconnectTimeout = null;
            }
            // Remove user immediately since they explicitly chose to leave
            room.users = room.users.filter(u => u.id !== currentUser.id);
            broadcastToRoom(currentRoom, {
              type: 'peer-left',
              username: currentUser.username
            });
            if (room.users.length === 0) {
              rooms.delete(currentRoom);
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
      currentUser.ws = null; // Mark socket as closed

      const room = rooms.get(currentRoom);
      if (room) {
        // Set a 15-second disconnect timeout — if the user doesn't reconnect,
        // notify the peer and remove the user from the room
        const disconnectedUser = currentUser;
        const disconnectedRoom = currentRoom;

        disconnectedUser.disconnectTimeout = setTimeout(() => {
          const r = rooms.get(disconnectedRoom);
          if (!r) return;

          // Broadcast peer-left to the remaining user
          broadcastToRoom(disconnectedRoom, {
            type: 'peer-left',
            username: disconnectedUser.username
          });

          // Remove the disconnected user from the room
          r.users = r.users.filter(u => u.id !== disconnectedUser.id);
          if (r.users.length === 0) {
            rooms.delete(disconnectedRoom);
          }
        }, 15000);
      }
    }
  });

  ws.on('error', () => {
    // Silently handle WebSocket errors
  });
});

// Cleanup stale rooms & auto-purge old messages every 30 minutes
setInterval(() => {
  const now = Date.now();

  // ── Room cleanup ──
  rooms.forEach((room, code) => {
    // Clean up if all users in the room have closed connections for over 2 hours since last activity
    const allDisconnected = room.users.every(u => !u.ws || u.ws.readyState !== 1);
    if (allDisconnected && now - room.lastActivity > 7200000) {
      rooms.delete(code);
    }
  });

  // ── Auto-purge messages older than 24 hours ──
  try {
    const allMessages = loadMessages();
    const dayAgo = now - 86400000;
    const freshMessages = allMessages.filter(m => m.timestamp && m.timestamp > dayAgo);
    if (freshMessages.length < allMessages.length) {
      saveMessages(freshMessages);
      console.log(`[Auto-purge] Cleaned ${allMessages.length - freshMessages.length} stale messages.`);
    }
  } catch (e) {
    console.error('Auto-purge failed:', e);
  }
}, 1800000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🔐 CryptChat Server running at:`);
  console.log(`     → Local:   http://localhost:${PORT}`);
  console.log(`     → Network: http://0.0.0.0:${PORT}\n`);
});
