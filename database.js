const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');

// Helper to load DB
function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initial = { rooms: {}, rateLimits: {}, messages: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
      return initial;
    }
    const content = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(content || '{"rooms":{},"rateLimits":{},"messages":[]}');
  } catch (err) {
    console.error('Database load error, resetting...', err);
    return { rooms: {}, rateLimits: {}, messages: [] };
  }
}

// Helper to save DB atomically
function saveDB(data) {
  const tempPath = DB_PATH + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
    fs.renameSync(tempPath, DB_PATH);
  } catch (err) {
    console.error('Database save error', err);
  }
}

module.exports = {
  // Rooms
  getRoom(uuid) {
    const db = loadDB();
    return db.rooms[uuid] || null;
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
    saveDB(db);
    return db.rooms[uuid];
  },
  updateRoomConnections(uuid, delta) {
    const db = loadDB();
    if (db.rooms[uuid]) {
      db.rooms[uuid].activeConnections = Math.max(0, db.rooms[uuid].activeConnections + delta);
      db.rooms[uuid].lastActivity = Date.now();
      saveDB(db);
      return db.rooms[uuid];
    }
    return null;
  },
  deleteRoom(uuid) {
    const db = loadDB();
    delete db.rooms[uuid];
    db.messages = db.messages.filter(m => m.roomUuid !== uuid);
    saveDB(db);
  },

  // Rate Limiting
  getRateLimit(ip) {
    const db = loadDB();
    const limit = db.rateLimits[ip];
    if (!limit) return { failedAttempts: 0, lastAttempt: 0 };
    // Clear limit after 15 mins (900000ms) of inactivity
    if (Date.now() - limit.lastAttempt > 900000) {
      delete db.rateLimits[ip];
      saveDB(db);
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
    saveDB(db);
    return db.rateLimits[ip];
  },
  clearRateLimit(ip) {
    const db = loadDB();
    if (db.rateLimits[ip]) {
      delete db.rateLimits[ip];
      saveDB(db);
    }
  },

  // Ephemeral Messages
  saveMessage(roomUuid, payload) {
    const db = loadDB();
    const msg = {
      id: Math.random().toString(36).substring(2, 9),
      roomUuid,
      payload,
      createdAt: Date.now()
    };
    db.messages.push(msg);
    saveDB(db);
    return msg;
  },
  getMessages(roomUuid) {
    const db = loadDB();
    return db.messages.filter(m => m.roomUuid === roomUuid);
  },
  purgeExpiredMessages() {
    const db = loadDB();
    const tenMinutesAgo = Date.now() - 600000;
    const initialCount = db.messages.length;
    db.messages = db.messages.filter(m => m.createdAt > tenMinutesAgo);
    if (db.messages.length !== initialCount) {
      saveDB(db);
    }
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
      saveDB(db);
    }
  }
};
