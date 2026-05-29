const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'database.json');

let dbData = null;
let isWriting = false;
let needsWrite = false;

// Helper to load DB (in-memory caching)
function loadDB() {
  if (dbData) return dbData;
  try {
    if (!fs.existsSync(DB_PATH)) {
      dbData = { rooms: {}, rateLimits: {}, messages: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2));
      return dbData;
    }
    const content = fs.readFileSync(DB_PATH, 'utf8');
    dbData = JSON.parse(content || '{"rooms":{},"rateLimits":{},"messages":[]}');
    return dbData;
  } catch (err) {
    console.error('Database load error, resetting...', err);
    dbData = { rooms: {}, rateLimits: {}, messages: [] };
    return dbData;
  }
}

// Helper to save DB asynchronously using a non-blocking queue
async function writeToDisk() {
  if (isWriting) {
    needsWrite = true;
    return;
  }
  isWriting = true;
  needsWrite = false;
  
  const tempPath = DB_PATH + '.tmp';
  try {
    await fs.promises.writeFile(tempPath, JSON.stringify(dbData, null, 2));
    await fs.promises.rename(tempPath, DB_PATH);
  } catch (err) {
    console.error('Database save error', err);
  } finally {
    isWriting = false;
    if (needsWrite) {
      setImmediate(writeToDisk);
    }
  }
}

function saveDB() {
  writeToDisk();
}

module.exports = {
  // Rooms
  getRoom(uuid) {
    const db = loadDB();
    return db.rooms[uuid] || null;
  },
  getRoomByKeyHash(keyHash) {
    const db = loadDB();
    for (const uuid in db.rooms) {
      if (db.rooms[uuid].keyHash === keyHash) {
        return db.rooms[uuid];
      }
    }
    return null;
  },
  createRoom(uuid, keyHash) {
    const db = loadDB();
    db.rooms[uuid] = {
      uuid,
      keyHash,
      activeConnections: 0,
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    saveDB();
    return db.rooms[uuid];
  },
  updateRoomConnections(uuid, delta) {
    const db = loadDB();
    if (db.rooms[uuid]) {
      db.rooms[uuid].activeConnections = Math.max(0, db.rooms[uuid].activeConnections + delta);
      db.rooms[uuid].lastActivity = Date.now();
      saveDB();
      return db.rooms[uuid];
    }
    return null;
  },
  setRoomConnections(uuid, count) {
    const db = loadDB();
    if (db.rooms[uuid]) {
      db.rooms[uuid].activeConnections = Math.max(0, count);
      db.rooms[uuid].lastActivity = Date.now();
      saveDB();
      return db.rooms[uuid];
    }
    return null;
  },
  deleteRoom(uuid) {
    const db = loadDB();
    delete db.rooms[uuid];
    db.messages = db.messages.filter(m => m.roomUuid !== uuid);
    saveDB();
  },
  clearMessagesForRoom(uuid) {
    const db = loadDB();
    db.messages = db.messages.filter(m => m.roomUuid !== uuid);
    saveDB();
  },

  // Rate Limiting
  getRateLimit(ip) {
    const db = loadDB();
    const limit = db.rateLimits[ip];
    if (!limit) return { failedAttempts: 0, lastAttempt: 0 };
    // Clear limit after 15 mins (900000ms) of inactivity
    if (Date.now() - limit.lastAttempt > 900000) {
      delete db.rateLimits[ip];
      saveDB();
      return { failedAttempts: 0, lastAttempt: 0 };
    }
    return limit;
  },
  recordFailedAttempt(ip) {
    const db = loadDB();
    if (!db.rateLimits[ip]) {
      db.rateLimits[ip] = { failedAttempts: 0, lastAttempt: 0 };
    }
    db.rateLimits[ip].failedAttempts += 1;
    db.rateLimits[ip].lastAttempt = Date.now();
    saveDB();
    return db.rateLimits[ip];
  },
  clearRateLimit(ip) {
    const db = loadDB();
    if (db.rateLimits[ip]) {
      delete db.rateLimits[ip];
      saveDB();
    }
  },

  // Ephemeral Messages
  saveMessage(roomUuid, payload) {
    const db = loadDB();
    const msg = {
      id: crypto.randomUUID(),
      roomUuid,
      payload,
      createdAt: Date.now()
    };
    db.messages.push(msg);
    saveDB();
    return msg;
  },
  getMessages(roomUuid) {
    const db = loadDB();
    return db.messages.filter(m => m.roomUuid === roomUuid);
  },
  deleteMessage(messageId) {
    const db = loadDB();
    const initialCount = db.messages.length;
    db.messages = db.messages.filter(m => m.payload.messageId !== messageId);
    if (db.messages.length !== initialCount) {
      saveDB();
      return true;
    }
    return false;
  },
  editMessage(messageId, newIv, newCiphertext) {
    const db = loadDB();
    let updated = false;
    db.messages = db.messages.map(m => {
      if (m.payload.messageId === messageId) {
        m.payload.iv = newIv;
        m.payload.ciphertext = newCiphertext;
        m.payload.isEdited = true;
        updated = true;
      }
      return m;
    });
    if (updated) {
      saveDB();
      return true;
    }
    return false;
  },
  purgeExpiredMessages() {
    const db = loadDB();
    const tenMinutesAgo = Date.now() - 600000;
    const expiredMessages = db.messages.filter(m => m.createdAt <= tenMinutesAgo);
    if (expiredMessages.length > 0) {
      const purgedRoomUuids = new Set(expiredMessages.map(m => m.roomUuid));
      db.messages = db.messages.filter(m => m.createdAt > tenMinutesAgo);
      saveDB();
      return Array.from(purgedRoomUuids);
    }
    return [];
  },
  purgeInactiveRooms() {
    const db = loadDB();
    const thirtyDaysAgo = Date.now() - 2592000000; // 30 Days in ms
    let purged = false;
    for (const uuid in db.rooms) {
      const room = db.rooms[uuid];
      const activity = room.lastActivity || room.createdAt;
      if (activity < thirtyDaysAgo && room.activeConnections === 0) {
        delete db.rooms[uuid];
        db.messages = db.messages.filter(m => m.roomUuid !== uuid);
        purged = true;
      }
    }
    if (purged) {
      saveDB();
    }
  }
};
