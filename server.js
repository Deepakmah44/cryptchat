const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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
  room.users.forEach(user => {
    if (user.ws !== excludeWs && user.ws.readyState === 1) {
      user.ws.send(JSON.stringify(message));
    }
  });
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

    switch (msg.type) {

      case 'create-room': {
        const roomCode = msg.roomCode;
        if (rooms.has(roomCode)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room already exists' }));
          return;
        }
        currentUser = { id: generateUserId(), username: msg.username, ws };
        currentRoom = roomCode;
        rooms.set(roomCode, { users: [currentUser], createdAt: Date.now() });
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
            room = { users: [], createdAt: Date.now() };
            rooms.set(roomCode, room);
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found. Check room code.' }));
            return;
          }
        }
        if (room.users.length >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 2 users).' }));
          return;
        }
        currentUser = { id: generateUserId(), username: msg.username, ws };
        currentRoom = roomCode;
        room.users.push(currentUser);

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
        if (peer && peer.ws.readyState === 1) {
          peer.ws.send(JSON.stringify({
            type: 'peer-joined',
            peerUsername: currentUser.username
          }));
        }
        break;
      }

      case 'key-exchange': {
        // Relay the public key to the other user in the room
        broadcastToRoom(currentRoom, {
          type: 'key-exchange',
          publicKey: msg.publicKey,
          from: currentUser.id
        }, ws);
        break;
      }

      case 'encrypted-message': {
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
        broadcastToRoom(currentRoom, {
          type: 'typing',
          from: currentUser.username,
          isTyping: msg.isTyping
        }, ws);
        break;
      }

      case 'message-delivered': {
        broadcastToRoom(currentRoom, {
          type: 'message-delivered',
          messageId: msg.messageId
        }, ws);
        break;
      }

      case 'message-opened': {
        // Delete message from persistent store upon opening (Snapchat-style)
        const allMessages = loadMessages();
        const updatedMessages = allMessages.filter(m => !(m.roomCode === currentRoom && m.messageId === msg.messageId));
        saveMessages(updatedMessages);

        broadcastToRoom(currentRoom, {
          type: 'message-opened',
          messageId: msg.messageId
        }, ws);
        break;
      }

      case 'message-read': {
        // Delete message from persistent store upon reading (Snapchat-style)
        const allMessages = loadMessages();
        const updatedMessages = allMessages.filter(m => !(m.roomCode === currentRoom && m.messageId === msg.messageId));
        saveMessages(updatedMessages);

        broadcastToRoom(currentRoom, {
          type: 'message-read',
          messageId: msg.messageId
        }, ws);
        break;
      }

      case 'call-invite':
      case 'call-accept':
      case 'call-decline':
      case 'call-hangup':
      case 'webrtc-signal': {
        broadcastToRoom(currentRoom, msg, ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoom && currentUser) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.users = room.users.filter(u => u.id !== currentUser.id);
        broadcastToRoom(currentRoom, {
          type: 'peer-left',
          username: currentUser.username
        });
        if (room.users.length === 0) {
          rooms.delete(currentRoom);
        }
      }
    }
  });

  ws.on('error', () => {
    // Silently handle WebSocket errors
  });
});

// Cleanup stale rooms every 30 minutes
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    if (room.users.length === 0 && now - room.createdAt > 1800000) {
      rooms.delete(code);
    }
  });
}, 1800000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🔐 CryptChat Server running at:`);
  console.log(`     → Local:   http://localhost:${PORT}`);
  console.log(`     → Network: http://0.0.0.0:${PORT}\n`);
});
