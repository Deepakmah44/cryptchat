/**
 * CryptChat — Main Application
 * WebSocket client, UI logic, and E2E encryption orchestration
 */

import CryptoEngine from './crypto.js';

// ── State ──
const state = {
  ws: null,
  crypto: new CryptoEngine(),
  roomCode: null,
  username: null,
  userId: null,
  peerUsername: null,
  isEncrypted: false,
  isConnected: false,
  reconnectAttempts: 0,
  reconnectTimeoutId: null,
  typingTimeout: null,
  isTyping: false,
  messageIdCounter: 0,
  unreadReceivedMsgs: [],
  secretPhrase: null,

  // Edit State
  editingMessageId: null,
  editingOriginalText: null,

  // Call State Variables
  localStream: null,
  remoteStream: null,
  peerConnection: null,
  callState: 'idle',
  callType: null,
  ringtoneOscillators: [],
  audioCtx: null,
  callStartTime: null,
  pendingWebRTCSignals: [],
  callTimerInterval: null,
};

// ── DOM Refs ──
const $ = (sel) => document.querySelector(sel);
const dom = {
  // Screens
  joinScreen: $('#join-screen'),
  chatScreen: $('#chat-screen'),
  // Join
  usernameInput: $('#username-input'),
  createRoomBtn: $('#create-room-btn'),
  joinRoomBtn: $('#join-room-btn'),
  joinError: $('#join-error'),
  // Personal chat
  secretPhraseInput: $('#secret-phrase-input'),
  personalConnectBtn: $('#personal-connect-btn'),
  toggleSecretVisibility: $('#toggle-secret-visibility'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  // Chat header
  chatPeerName: $('#chat-peer-name'),
  statusDot: null,
  statusLabel: $('#status-label'),
  encryptionBadge: $('#encryption-badge'),
  leaveBtn: $('#leave-btn'),
  roomInfoBtn: $('#room-info-btn'),
  roomInfoPanel: $('#room-info-panel'),
  displayRoomCode: $('#display-room-code'),
  copyRoomCode: $('#copy-room-code'),
  // Messages
  messagesContainer: $('#messages-container'),
  messagesList: $('#messages-list'),
  typingIndicator: $('#typing-indicator'),
  typingName: $('#typing-name'),
  // Input
  messageInput: $('#message-input'),
  cleanLogsBtn: $('#clean-logs-btn'),
  attachBtn: $('#attach-btn'),
  fileInput: $('#file-input'),
  sendBtn: $('#send-btn'),
  // WebRTC Call DOM Refs
  audioCallBtn: $('#audio-call-btn'),
  videoCallBtn: $('#video-call-btn'),
  callOverlay: $('#call-overlay'),
  videoGrid: $('#video-grid'),
  remoteVideo: $('#remote-video'),
  remoteAudio: $('#remote-audio'),
  localVideo: $('#local-video'),
  localVideoPlaceholder: $('#local-video-placeholder'),
  audioCallUi: $('#audio-call-ui'),
  callPeerTitle: $('#call-peer-title'),
  callStatusLabel: $('#call-status-label'),
  callActionsIncoming: $('#call-actions-incoming'),
  callActionsActive: $('#call-actions-active'),
  callDeclineBtn: $('#call-decline-btn'),
  callAcceptBtn: $('#call-accept-btn'),
  callMuteBtn: $('#call-mute-btn'),
  callVideoToggleBtn: $('#call-video-toggle-btn'),
  callSpeakerBtn: $('#call-speaker-btn'),
  callHangupBtn: $('#call-hangup-btn'),
  // Emoji Picker DOM Refs
  emojiBtn: $('#emoji-btn'),
  emojiPickerPanel: $('#emoji-picker-panel'),
  // Lightbox DOM Refs
  lightboxModal: $('#lightbox-modal'),
  lightboxImg: $('#lightbox-img'),
  lightboxClose: document.querySelector('.lightbox-close'),
  // Canvas
  particlesCanvas: $('#particles-canvas'),
};

// Get status dot after DOM is ready
dom.statusDot = document.querySelector('.status-dot');

// ═══════════════════════════════════════════
// PARTICLES BACKGROUND
// ═══════════════════════════════════════════
function initParticles() {
  const canvas = dom.particlesCanvas;
  const ctx = canvas.getContext('2d');
  let particles = [];
  let animId;
  
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * canvas.width;
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 1.5 + 0.5;
      this.speedX = (Math.random() - 0.5) * 0.25;
      this.speedY = (Math.random() - 0.5) * 0.25;
      this.opacity = Math.random() * 0.35 + 0.15;
      // Professional theme: elegant slate-grey and secure corporate blue
      this.color = Math.random() > 0.5 ? '100, 116, 139' : '37, 99, 235';
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
      if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
      ctx.fill();
    }
  }

  // Fewer particles on mobile for ultra performance (16 particles)
  const isMobile = window.innerWidth < 768;
  const count = isMobile ? 16 : 65;
  particles = Array.from({ length: count }, () => new Particle());

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Update and draw particles in a single pass
    particles.forEach(p => { 
      p.update(); 
      p.draw(); 
    });

    // Draw lines only between close particles
    // On mobile, reduce connection distance to keep it clean and fast
    const maxDist = isMobile ? 85 : 120;
    const maxDistSq = maxDist * maxDist;

    for (let i = 0; i < particles.length; i++) {
      const pi = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const pj = particles[j];
        const dx = pi.x - pj.x;
        const dy = pi.y - pj.y;
        
        // Fast box check first
        if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
        
        // Fast squared distance check to avoid heavy square root calculations
        const distSq = dx * dx + dy * dy;
        if (distSq < maxDistSq) {
          const dist = Math.sqrt(distSq);
          ctx.beginPath();
          ctx.moveTo(pi.x, pi.y);
          ctx.lineTo(pj.x, pj.y);
          // Subtle glowing connection
          ctx.strokeStyle = `rgba(0, 212, 255, ${0.08 * (1 - dist / maxDist)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
    animId = requestAnimationFrame(animate);
  }
  animate();
}

// ═══════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════
function getWsUrl() {
  // Agar website github par chal rahi hai to naya render wala backend url use karo
  if (location.hostname.includes('github.io')) {
    // NOTE: Yahan par aapko apna actual Render WebSocket URL daalna padega
    return 'wss://YOUR_RENDER_APP_NAME.onrender.com'; 
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}`;
}

let heartbeatInterval = null;
function startHeartbeat() {
  stopHeartbeat();
  let lastPong = Date.now();
  
  heartbeatInterval = setInterval(() => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      send({ type: 'ping' });
      
      // If we haven't received a pong in 35 seconds, connection is dead
      if (Date.now() - lastPong > 35000) {
        console.warn('WebSocket heartbeat timeout. Reconnecting...');
        state.ws.close(); // Triggers onclose and reconnection automatically
      }
    }
  }, 15000); // Ping every 15 seconds
  
  state._heartbeatReset = () => {
    lastPong = Date.now();
  };
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function connectWebSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(getWsUrl());
    
    ws.onopen = () => {
      state.ws = ws;
      state.isConnected = true;
      state.reconnectAttempts = 0;
      startHeartbeat();
      resolve(ws);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('Failed to parse server message:', err);
      }
    };

    ws.onclose = () => {
      state.isConnected = false;
      stopHeartbeat();
      if (state.roomCode) {
        updateConnectionStatus('offline', 'Disconnected');
        attemptReconnect();
      }
    };

    ws.onerror = () => {
      stopHeartbeat();
      reject(new Error('WebSocket connection failed'));
    };
  });
}

function attemptReconnect() {
  state.reconnectAttempts++;
  if (state.roomCode) {
    updateConnectionStatus('offline', 'Disconnected');
  }
  const delay = Math.min(1000 * Math.pow(2, Math.min(state.reconnectAttempts, 8)), 30000);
  
  if (state.reconnectTimeoutId) {
    clearTimeout(state.reconnectTimeoutId);
  }

  state.reconnectTimeoutId = setTimeout(async () => {
    try {
      await connectWebSocket();
      // Re-join the room with original userId to resume same session
      send({
        type: 'join-room',
        roomCode: state.roomCode,
        username: state.username,
        userId: state.userId
      });
    } catch {
      attemptReconnect();
    }
  }, delay);
}

function send(data) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(data));
  }
}

// ═══════════════════════════════════════════
// SERVER MESSAGE HANDLER
// ═══════════════════════════════════════════
async function handleServerMessage(msg) {
  switch (msg.type) {
    case 'room-created':
      state.roomCode = msg.roomCode;
      state.userId = msg.userId;
      state.upperKey = msg.upperKey;
      state.lowerKey = msg.lowerKey;
      
      // Render one-time visualization keys
      document.getElementById('created-upper-key').textContent = msg.upperKey;
      document.getElementById('created-lower-key').textContent = msg.lowerKey;
      document.getElementById('created-keys-container').classList.remove('hidden');

      // Derive E2EE key locally via PBKDF2 symmetrically
      await state.crypto.deriveKeyFromSecret(msg.upperKey + msg.lowerKey, msg.roomCode);
      state.isEncrypted = true;
      updateEncryptionStatus(true);
      enableInput();
      addSystemNotice('🔒 E2E Encrypted');

      // Reset button
      dom.createRoomBtn.disabled = false;
      dom.createRoomBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> + Create unique owned room`;
      break;

    case 'room-joined':
      state.roomCode = msg.roomCode;
      state.userId = msg.userId;
      state.peerUsername = msg.peerUsername;
      switchToChat();
      
      if (msg.resumed) {
        dom.chatPeerName.textContent = msg.peerUsername || 'Waiting for peer...';
        updateConnectionStatus(msg.peerUsername ? 'online' : 'waiting', msg.peerUsername ? 'Online' : 'Room ready');
        updateEncryptionStatus(state.isEncrypted);
        enableInput();
        break;
      }

      state.isEncrypted = false;
      updateEncryptionStatus(false);

      dom.chatPeerName.textContent = msg.peerUsername || 'Waiting for peer...';
      updateConnectionStatus(msg.peerUsername ? 'online' : 'waiting', msg.peerUsername ? 'Online' : 'Room ready');
      if (msg.peerUsername) {
        addSystemNotice(`Connected with ${msg.peerUsername}`);
      } else {
        addSystemNotice('Room ready. Waiting for peer to connect.');
      }
      
      // Symmetrically derive E2EE key from the inputted combined key
      await state.crypto.deriveKeyFromSecret(state.combinedKey, msg.roomCode);
      state.isEncrypted = true;
      updateEncryptionStatus(true);
      enableInput();
      addSystemNotice('🔒 E2E Encrypted');
      break;

    case 'peer-joined':
      state.peerUsername = msg.peerUsername;
      dom.chatPeerName.textContent = msg.peerUsername;
      updateConnectionStatus('online', 'Online');
      addSystemNotice(`${msg.peerUsername} joined the room`);
      break;

    case 'key-exchange':
      if (!state.roomCode.startsWith('P')) {
        await handleKeyExchange(msg.publicKey);
      }
      break;

    case 'message-history':
      await handleMessageHistory(msg.messages);
      break;

    case 'peer-reconnected':
      // Peer came back online after a brief disconnect
      state.peerUsername = msg.peerUsername;
      dom.chatPeerName.textContent = msg.peerUsername;
      updateConnectionStatus('online', 'Online');
      break;

    case 'old-messages-destroyed': {
      const threshold = msg.threshold;
      const messageElements = document.querySelectorAll('.message-wrapper');
      messageElements.forEach(el => {
        const tsVal = el.dataset.timestamp;
        if (tsVal) {
          const timestamp = parseInt(tsVal, 10);
          if (timestamp < threshold) {
            el.style.transition = 'all 0.4s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-10px)';
            setTimeout(() => el.remove(), 400);
          }
        }
      });
      addSystemNotice('⏰ 10 minute pehele ke saare logs permanently destroy kar diye gaye hain.');
      break;
    }

    case 'encrypted-message':
      await handleEncryptedMessage(msg);
      break;

    case 'pong':
      if (state._heartbeatReset) {
        state._heartbeatReset();
      }
      break;

    case 'typing':
      handleTypingIndicator(msg.from, msg.isTyping);
      break;

    case 'message-delivered':
      markMessageDelivered(msg.messageId);
      break;

    case 'message-opened':
      markMessageOpened(msg.messageId);
      break;

    case 'message-read':
      markMessageRead(msg.messageId);
      break;

    case 'edit-message':
      await handleEditMessage(msg);
      break;

    case 'unsend-message':
      handleUnsendMessage(msg);
      break;

    case 'call-invite':
      handleIncomingCall(msg);
      break;

    case 'call-accept':
      handleCallAccepted(msg);
      break;

    case 'call-decline':
      handleCallDeclined(msg);
      break;

    case 'call-hangup':
      handleCallHangup(msg);
      break;

    case 'webrtc-signal':
      handleWebRTCSignal(msg);
      break;

    case 'peer-left':
      state.peerUsername = null;
      state.isEncrypted = false;
      state.crypto = new CryptoEngine();
      dom.chatPeerName.textContent = 'Waiting for peer...';
      updateConnectionStatus('waiting', 'Peer disconnected');
      updateEncryptionStatus(false);
      disableInput();
      addSystemNotice(`${msg.username} left the room`);
      break;

    case 'error':
      // For personal chat: if room doesn't exist, create it automatically
      if (state._personalRoomCode && msg.message.includes('not found')) {
        send({ type: 'create-room', roomCode: state._personalRoomCode, username: state.username });
        state._personalRoomCode = null; // Clear the flag
        return;
      }
      state._personalRoomCode = null;
      showJoinError(msg.message);
      // Reset personal connect button if it was used
      if (dom.personalConnectBtn.disabled) {
        dom.personalConnectBtn.disabled = false;
        dom.personalConnectBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Connect Privately`;
      }
      break;
  }
}

// ═══════════════════════════════════════════
// E2E ENCRYPTION HANDSHAKE
// ═══════════════════════════════════════════
async function initiateKeyExchange() {
  try {
    await state.crypto.generateKeyPair();
    const publicKey = await state.crypto.exportPublicKey();
    send({ type: 'key-exchange', publicKey });
  } catch (err) {
    console.error('Key generation failed:', err);
    addSystemNotice('⚠️ Encryption setup failed. Refresh and try again.');
  }
}

async function handleKeyExchange(peerPublicKeyJwk) {
  try {
    // If we don't have a key pair yet, generate one and send ours
    if (!state.crypto.keyPair) {
      await state.crypto.generateKeyPair();
      const publicKey = await state.crypto.exportPublicKey();
      send({ type: 'key-exchange', publicKey });
    }

    const peerPublicKey = await state.crypto.importPeerPublicKey(peerPublicKeyJwk);
    await state.crypto.deriveSharedKey(peerPublicKey);
    state.isEncrypted = true;
    
    updateEncryptionStatus(true);
    enableInput();
    addSystemNotice('🔒 End-to-end encryption activated');
  } catch (err) {
    console.error('Key exchange failed:', err);
    addSystemNotice('⚠️ Encryption handshake failed. Please refresh.');
  }
}

// ═══════════════════════════════════════════
// MESSAGING
// ═══════════════════════════════════════════
async function sendMessage() {
  const text = dom.messageInput.value.trim();
  if (!text || !state.isEncrypted) return;

  // ── EDIT MODE: Update existing message ──
  if (state.editingMessageId) {
    try {
      const { iv, ciphertext } = await state.crypto.encrypt(text);
      send({
        type: 'edit-message',
        messageId: state.editingMessageId,
        iv,
        ciphertext
      });
      // Update locally — only update the text content, preserve meta (timestamp, status)
      const wrapper = document.querySelector(`[data-message-id="${state.editingMessageId}"]`);
      if (wrapper) {
        const textEl = wrapper.querySelector('.message-text');
        if (textEl) {
          textEl.textContent = text;
        }
        // Add edited tag if not present
        const metaWA = wrapper.querySelector('.message-meta-whatsapp');
        if (metaWA && !metaWA.querySelector('.edited-tag')) {
          const editTag = document.createElement('span');
          editTag.className = 'edited-tag';
          editTag.textContent = '(edited)';
          metaWA.insertBefore(editTag, metaWA.firstChild);
        }
      }
      cancelEditMode();
      dom.messageInput.value = '';
      dom.messageInput.style.height = 'auto';
      // Keep keyboard open on mobile
      setTimeout(() => dom.messageInput.focus(), 50);
      return;
    } catch (err) {
      console.error('Edit encryption failed:', err);
      addSystemNotice('⚠️ Failed to edit message.');
      return;
    }
  }

  // ── NORMAL SEND ──
  const messageId = `${state.userId}-${++state.messageIdCounter}`;

  try {
    const { iv, ciphertext } = await state.crypto.encrypt(text);
    send({
      type: 'encrypted-message',
      iv,
      ciphertext,
      messageId
    });

    // Show locally
    appendMessage({
      text,
      isSent: true,
      timestamp: Date.now(),
      messageId
    });

    dom.messageInput.value = '';
    dom.messageInput.style.height = 'auto';
    sendTypingStatus(false);
    // Keep keyboard open on mobile after sending
    setTimeout(() => dom.messageInput.focus(), 50);
  } catch (err) {
    console.error('Encryption failed:', err);
    addSystemNotice('⚠️ Failed to encrypt message.');
  }
}

async function handleEncryptedMessage(msg) {
  try {
    const plaintext = await state.crypto.decrypt(msg.iv, msg.ciphertext);
    appendMessage({
      text: plaintext,
      isSent: false,
      senderName: msg.fromUsername,
      timestamp: msg.timestamp,
      messageId: msg.messageId,
      file: msg.file,
      fileName: msg.fileName,
      fileType: msg.fileType,
      fileSize: msg.fileSize
    });

    // Send delivery receipt
    send({ type: 'message-delivered', messageId: msg.messageId });

    // Send read receipt if tab is focused, otherwise queue it
    if (!document.hidden) {
      send({ type: 'message-read', messageId: msg.messageId });
    } else {
      if (!state.unreadReceivedMsgs) state.unreadReceivedMsgs = [];
      state.unreadReceivedMsgs.push(msg.messageId);
    }

    // Play notification if tab not focused
    if (document.hidden) {
      window.playNotificationSound();
    }
  } catch (err) {
    console.error('Decryption failed:', err);
    appendMessage({
      text: '⚠️ [Could not decrypt message]',
      isSent: false,
      senderName: msg.fromUsername,
      timestamp: msg.timestamp
    });
  }
}

async function handleMessageHistory(messages) {
  if (!messages || messages.length === 0) return;
  
  for (const msg of messages) {
    try {
      // Avoid duplicate appending if message is already on screen
      if (document.querySelector(`[data-message-id="${msg.messageId}"]`)) {
        continue;
      }

      const isSent = msg.fromUsername === state.username;
      const plaintext = await state.crypto.decrypt(msg.iv, msg.ciphertext);

      appendMessage({
        text: plaintext,
        isSent: isSent,
        senderName: msg.fromUsername,
        timestamp: msg.timestamp,
        messageId: msg.messageId,
        file: msg.file,
        fileName: msg.fileName,
        fileType: msg.fileType,
        fileSize: msg.fileSize
      });

      // Send read receipt if received and tab is focused
      if (!isSent) {
        if (!document.hidden) {
          send({ type: 'message-read', messageId: msg.messageId });
        } else {
          if (!state.unreadReceivedMsgs) state.unreadReceivedMsgs = [];
          state.unreadReceivedMsgs.push(msg.messageId);
        }
      }
    } catch (err) {
      console.error('Failed to decrypt historical message:', err);
    }
  }
}

// ═══════════════════════════════════════════
// UI — MESSAGES
// ═══════════════════════════════════════════
function appendMessage({ text, isSent, senderName, timestamp, messageId, file, fileName, fileType, fileSize }) {
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
  if (messageId) wrapper.dataset.messageId = messageId;
  wrapper.dataset.timestamp = timestamp;

  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // WhatsApp-compliant metadata block (nested inside bubbles)
  let metaHtml = `<div class="message-meta-whatsapp">`;
  metaHtml += `<span class="message-time-whatsapp">${time}</span>`;
  if (isSent) {
    metaHtml += `<span class="message-status message-status-whatsapp" data-mid="${messageId || ''}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
    </span>`;
  }
  metaHtml += `</div>`;

  let html = '';
  if (!isSent && senderName) {
    html += `<span class="sender-name">${escapeHtml(senderName)}</span>`;
  }
  
  if (file) {
    let fileHtml = '';
    const cleanText = text;
    if (fileType.startsWith('image/')) {
      fileHtml = `<img src="${cleanText}" class="chat-image-preview" alt="${escapeHtml(fileName)}" title="Click to view full image">`;
    } else if (fileType.startsWith('video/')) {
      fileHtml = `<video src="${cleanText}" class="chat-video-preview" controls playsinline></video>`;
    } else {
      const displaySize = formatBytes(fileSize);
      fileHtml = `
        <a href="${cleanText}" download="${escapeHtml(fileName)}" class="chat-file-download">
          <div class="file-icon-wrapper">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="file-info-block">
            <span class="file-name-label">${escapeHtml(fileName)}</span>
            <span class="file-size-label">${displaySize}</span>
          </div>
        </a>
      `;
    }
    html += `
      <div class="message-bubble">
        <div class="message-text">${fileHtml}</div>
        ${metaHtml}
      </div>
    `;
  } else {
    html += `
      <div class="message-bubble">
        <div class="message-text">${escapeHtml(text)}</div>
        ${metaHtml}
      </div>
    `;
  }

  wrapper.innerHTML = html;

  if (file && fileType && fileType.startsWith('image/')) {
    const imgEl = wrapper.querySelector('.chat-image-preview');
    if (imgEl) {
      imgEl.addEventListener('click', () => openLightbox(imgEl.src));
    }
  }

  // Attach context menu for sent text messages (not file)
  if (isSent && !file && messageId) {
    const bubble = wrapper.querySelector('.message-bubble');
    if (bubble) {
      // Long press for mobile
      let longPressTimer;
      bubble.addEventListener('touchstart', (e) => {
        longPressTimer = setTimeout(() => {
          e.preventDefault();
          showContextMenu(e.touches[0].clientX, e.touches[0].clientY, messageId, text);
        }, 500);
      }, { passive: false });
      bubble.addEventListener('touchend', () => clearTimeout(longPressTimer));
      bubble.addEventListener('touchmove', () => clearTimeout(longPressTimer));
      // Right-click for desktop
      bubble.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, messageId, text);
      });
    }
  }

  dom.messagesList.appendChild(wrapper);
  scrollToBottom();

  // Localized 10-minute DOM automatic fadeout and destruction
  const TTL_TIME = 600000; // 10 minutes in ms
  const timeElapsed = Date.now() - timestamp;
  const timeLeft = Math.max(0, TTL_TIME - timeElapsed);

  setTimeout(() => {
    wrapper.style.transition = 'opacity 1s ease-out, transform 1s ease-out';
    wrapper.style.opacity = '0';
    wrapper.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      wrapper.remove();
    }, 1000);
  }, timeLeft);
}

function markMessageDelivered(messageId) {
  const wrapper = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!wrapper) return;
  const statusEl = wrapper.querySelector('.message-status');
  if (statusEl) {
    statusEl.classList.add('delivered');
    statusEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 6 9 17 4 12"/><polyline points="22 6 13 17" /></svg>`;
  }
}

function markMessageOpened(messageId) {
  const wrapper = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!wrapper) return;
  const statusEl = wrapper.querySelector('.message-status');
  if (statusEl) {
    statusEl.classList.add('opened');
    statusEl.innerHTML = `<span class="opened-label" style="font-size: 0.65rem; font-weight:600; color:#fffc00; display:flex; align-items:center; gap:2px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Opened</span>`;
  }
}

function markMessageRead(messageId) {
  const wrapper = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!wrapper) return;
  const statusEl = wrapper.querySelector('.message-status');
  if (statusEl) {
    statusEl.classList.remove('delivered');
    statusEl.classList.add('read');
    statusEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="18 6 9 17 4 12"/><polyline points="22 6 13 17" /></svg>`;
  }
}

function formatDuration(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function addCallSystemNotice(text, isMissedOrDeclined) {
  const div = document.createElement('div');
  div.className = `system-notice ${isMissedOrDeclined ? 'system-notice-missed' : 'system-notice-call'}`;
  div.innerHTML = `<span>${escapeHtml(text)}</span>`;
  dom.messagesList.appendChild(div);
  scrollToBottom();
}

function addSystemNotice(text) {
  const div = document.createElement('div');
  div.className = 'system-notice';
  div.innerHTML = `<span>${escapeHtml(text)}</span>`;
  dom.messagesList.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
  });
}

function adjustChatViewport() {
  const chatScreen = document.getElementById('chat-screen');
  if (chatScreen && chatScreen.classList.contains('active')) {
    if (window.visualViewport) {
      const height = window.visualViewport.height;
      const offsetTop = window.visualViewport.offsetTop;
      
      chatScreen.style.height = `${height}px`;
      chatScreen.style.top = `${offsetTop}px`;
      
      // Clear out document double-bouncing offsets
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    } else {
      chatScreen.style.height = '100dvh';
      chatScreen.style.top = '0px';
    }
  }
}

// Bind visualViewport resize & scroll events as soon as script starts
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    adjustChatViewport();
    scrollToBottom();
  });
  window.visualViewport.addEventListener('scroll', () => {
    adjustChatViewport();
  });
}

// ═══════════════════════════════════════════
// CONTEXT MENU — EDIT & UNSEND
// ═══════════════════════════════════════════
function showContextMenu(x, y, messageId, messageText) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'msg-context-menu';
  menu.id = 'active-context-menu';
  menu.innerHTML = `
    <button class="ctx-item" data-action="edit">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Edit
    </button>
    <div class="ctx-divider"></div>
    <button class="ctx-item danger" data-action="unsend">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      Unsend
    </button>
  `;

  // Position menu, keep within viewport
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  let posX = Math.min(x, window.innerWidth - rect.width - 10);
  let posY = Math.min(y, window.innerHeight - rect.height - 10);
  posX = Math.max(10, posX);
  posY = Math.max(10, posY);
  menu.style.left = posX + 'px';
  menu.style.top = posY + 'px';

  // Handle clicks
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-item');
    if (!item) return;
    const action = item.dataset.action;
    if (action === 'edit') {
      enterEditMode(messageId, messageText);
    } else if (action === 'unsend') {
      unsendMessage(messageId);
    }
    closeContextMenu();
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeContextMenuOnOutside);
    document.addEventListener('touchstart', closeContextMenuOnOutside);
  }, 10);
}

function closeContextMenuOnOutside(e) {
  const menu = document.getElementById('active-context-menu');
  if (menu && !menu.contains(e.target)) {
    closeContextMenu();
  }
}

function closeContextMenu() {
  const menu = document.getElementById('active-context-menu');
  if (menu) menu.remove();
  document.removeEventListener('click', closeContextMenuOnOutside);
  document.removeEventListener('touchstart', closeContextMenuOnOutside);
}

function enterEditMode(messageId, originalText) {
  state.editingMessageId = messageId;
  state.editingOriginalText = originalText;
  dom.messageInput.value = originalText;
  dom.messageInput.focus();
  dom.messageInput.style.height = 'auto';
  dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight, 140) + 'px';

  // Show edit mode bar
  let editBar = document.getElementById('edit-mode-bar');
  if (!editBar) {
    editBar = document.createElement('div');
    editBar.className = 'edit-mode-bar';
    editBar.id = 'edit-mode-bar';
    editBar.innerHTML = `
      <span class="edit-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editing message
      </span>
      <button class="edit-cancel-btn" id="edit-cancel-btn">Cancel</button>
    `;
    const inputBar = document.querySelector('.chat-input-bar');
    inputBar.insertBefore(editBar, inputBar.firstChild);
    document.getElementById('edit-cancel-btn').addEventListener('click', cancelEditMode);
  }
}

function cancelEditMode() {
  state.editingMessageId = null;
  state.editingOriginalText = null;
  dom.messageInput.value = '';
  dom.messageInput.style.height = 'auto';
  const editBar = document.getElementById('edit-mode-bar');
  if (editBar) editBar.remove();
}

async function unsendMessage(messageId) {
  send({ type: 'unsend-message', messageId });
  // Update locally
  const wrapper = document.querySelector(`[data-message-id="${messageId}"]`);
  if (wrapper) {
    const bubble = wrapper.querySelector('.message-bubble');
    if (bubble) {
      bubble.className = 'message-bubble unsent-message';
      bubble.innerHTML = `<span>🚫</span> You unsent this message`;
    }
    // Remove status indicators
    const meta = wrapper.querySelector('.message-meta');
    if (meta) {
      const status = meta.querySelector('.message-status');
      if (status) status.remove();
    }
  }
}

async function handleEditMessage(msg) {
  try {
    const plaintext = await state.crypto.decrypt(msg.iv, msg.ciphertext);
    const wrapper = document.querySelector(`[data-message-id="${msg.messageId}"]`);
    if (wrapper) {
      // Only update the text content, preserve meta (timestamp, status)
      const textEl = wrapper.querySelector('.message-text');
      if (textEl) {
        textEl.textContent = plaintext;
      }
      const metaWA = wrapper.querySelector('.message-meta-whatsapp');
      if (metaWA && !metaWA.querySelector('.edited-tag')) {
        const editTag = document.createElement('span');
        editTag.className = 'edited-tag';
        editTag.textContent = '(edited)';
        metaWA.insertBefore(editTag, metaWA.firstChild);
      }
    }
  } catch (err) {
    console.error('Failed to decrypt edited message:', err);
  }
}

function handleUnsendMessage(msg) {
  const wrapper = document.querySelector(`[data-message-id="${msg.messageId}"]`);
  if (wrapper) {
    const bubble = wrapper.querySelector('.message-bubble');
    if (bubble) {
      bubble.className = 'message-bubble unsent-message';
      bubble.innerHTML = `<span>🚫</span> ${escapeHtml(msg.fromUsername)} unsent this message`;
    }
    const meta = wrapper.querySelector('.message-meta');
    if (meta) {
      const status = meta.querySelector('.message-status');
      if (status) status.remove();
      const editTag = meta.querySelector('.edited-tag');
      if (editTag) editTag.remove();
    }
  }
}

// ═══════════════════════════════════════════
// UI — SCREEN MANAGEMENT
// ═══════════════════════════════════════════
function switchToChat() {
  dom.joinScreen.classList.remove('active');
  dom.chatScreen.classList.add('active');
  dom.chatScreen.style.animation = 'screenTransition 0.45s cubic-bezier(0.16, 1, 0.3, 1) both';
  dom.displayRoomCode.textContent = state.roomCode;
  
  // Auto-fit layout and scroll to bottom
  adjustChatViewport();
  setTimeout(scrollToBottom, 150);
}

function switchToJoin() {
  dom.chatScreen.classList.remove('active');
  dom.joinScreen.classList.add('active');
  // Reset state
  state.roomCode = null;
  state.userId = null;
  state.peerUsername = null;
  state.isEncrypted = false;
  state.crypto = new CryptoEngine();
  // Reset edit state
  state.editingMessageId = null;
  state.editingOriginalText = null;
  const editBar = document.getElementById('edit-mode-bar');
  if (editBar) editBar.remove();
  // Close context menu if open
  closeContextMenu();
  // Reset UI
  dom.chatPeerName.textContent = 'Waiting for peer...';
  dom.messagesList.innerHTML = `
    <div class="system-message" id="welcome-msg">
      <div class="system-icon">🔐</div>
      <p>Messages are end-to-end encrypted. No one outside this chat can read them.</p>
    </div>`;
  disableInput();
  updateEncryptionStatus(false);
  hideRoomInfo();
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
}

// ═══════════════════════════════════════════
// UI — STATUS UPDATES
// ═══════════════════════════════════════════
function showReconnectingBanner(attempt) {
  let banner = document.getElementById('reconnecting-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'reconnecting-banner';
    banner.className = 'reconnecting-banner glass-card';
    banner.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">⚠️</span>
        <span class="banner-text">Connection lost. Reconnecting securely... (Attempt <strong id="reconnect-count">${attempt}</strong>)</span>
        <div class="banner-spinner"></div>
      </div>
    `;
    dom.chatScreen.appendChild(banner);
  } else {
    const countEl = document.getElementById('reconnect-count');
    if (countEl) countEl.textContent = attempt;
    banner.classList.remove('hidden');
  }
}

function hideReconnectingBanner() {
  const banner = document.getElementById('reconnecting-banner');
  if (banner) {
    banner.classList.add('hidden');
  }
}

function updateConnectionStatus(status, label) {
  dom.statusDot.className = `status-dot ${status}`;
  dom.statusLabel.textContent = label;

  const inputBar = document.querySelector('.chat-input-bar');
  if (status === 'offline') {
    if (inputBar) inputBar.classList.add('offline');
    showReconnectingBanner(state.reconnectAttempts || 1);
  } else {
    if (inputBar) inputBar.classList.remove('offline');
    hideReconnectingBanner();
  }
}

function updateEncryptionStatus(active) {
  if (active) {
    dom.encryptionBadge.className = 'encryption-indicator active';
    dom.encryptionBadge.title = 'End-to-End Encrypted';
  } else {
    dom.encryptionBadge.className = 'encryption-indicator pending';
    dom.encryptionBadge.title = 'Securing connection...';
  }
}

function enableInput() {
  dom.messageInput.disabled = false;
  if (dom.cleanLogsBtn) dom.cleanLogsBtn.disabled = false;
  if (dom.attachBtn) dom.attachBtn.disabled = false;
  if (dom.emojiBtn) dom.emojiBtn.disabled = false;
  dom.sendBtn.disabled = false;
  dom.messageInput.placeholder = 'Type a message...';
  dom.messageInput.focus();
  
  if (dom.audioCallBtn) dom.audioCallBtn.disabled = false;
  if (dom.videoCallBtn) dom.videoCallBtn.disabled = false;
}

function disableInput() {
  dom.messageInput.disabled = true;
  if (dom.cleanLogsBtn) dom.cleanLogsBtn.disabled = true;
  if (dom.attachBtn) dom.attachBtn.disabled = true;
  if (dom.emojiBtn) {
    dom.emojiBtn.disabled = true;
    dom.emojiPickerPanel.classList.add('hidden');
  }
  dom.sendBtn.disabled = true;
  
  if (!state.isConnected && state.roomCode) {
    dom.messageInput.placeholder = `⚠️ Offline: Reconnecting securely... (Attempt ${state.reconnectAttempts || 1})`;
  } else {
    dom.messageInput.placeholder = 'Waiting for encrypted connection...';
  }
  
  if (dom.audioCallBtn) dom.audioCallBtn.disabled = true;
  if (dom.videoCallBtn) dom.videoCallBtn.disabled = true;
}

// ═══════════════════════════════════════════
// UI — TYPING INDICATOR
// ═══════════════════════════════════════════
function sendTypingStatus(isTyping) {
  if (state.isTyping === isTyping) return;
  state.isTyping = isTyping;
  send({ type: 'typing', isTyping });
}

function handleTypingIndicator(name, isTyping) {
  dom.typingName.textContent = name;
  if (isTyping) {
    dom.typingIndicator.classList.remove('hidden');
    scrollToBottom();
  } else {
    dom.typingIndicator.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════
// UI — ROOM INFO PANEL
// ═══════════════════════════════════════════
function toggleRoomInfo() {
  dom.roomInfoPanel.classList.toggle('hidden');
}
function hideRoomInfo() {
  dom.roomInfoPanel.classList.add('hidden');
}

// ═══════════════════════════════════════════
// UI — ERRORS
// ═══════════════════════════════════════════
function showJoinError(message) {
  dom.joinError.textContent = message;
  dom.joinError.classList.remove('hidden');
  setTimeout(() => dom.joinError.classList.add('hidden'), 4000);
}

// ═══════════════════════════════════════════
// ROOM CODE GENERATOR
// ═══════════════════════════════════════════
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars
  let code = '';
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  for (const byte of array) {
    code += chars[byte % chars.length];
  }
  return code;
}

/**
 * Hash a secret phrase into a deterministic room code.
 * Both users entering the same phrase → same room.
 */
async function passphraseToRoomCode(phrase) {
  const encoder = new TextEncoder();
  // Add a salt so common phrases don't collide with random rooms
  const data = encoder.encode('CryptChat::Personal::' + phrase.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashBytes = new Uint8Array(hashBuffer);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'P'; // Prefix 'P' for personal rooms
  for (let i = 0; i < 7; i++) {
    code += chars[hashBytes[i] % chars.length];
  }
  return code;
}

// ═══════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════
function initEventListeners() {
  // ── Tab Switching ──
  dom.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      dom.tabBtns.forEach(b => b.classList.remove('active'));
      dom.tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`).classList.add('active');
    });
  });

  // ── Personal Chat — Connect with secret phrase ──
  dom.personalConnectBtn.addEventListener('click', async () => {
    const username = dom.usernameInput.value.trim();
    const phrase = dom.secretPhraseInput.value.trim();
    if (!username) {
      showJoinError('Pehle apna naam daalo.');
      dom.usernameInput.focus();
      return;
    }
    if (!phrase || phrase.length < 3) {
      showJoinError('Secret phrase kam se kam 3 characters ka hona chahiye.');
      dom.secretPhraseInput.focus();
      return;
    }
    state.username = username;
    state.secretPhrase = phrase;
    const roomCode = await passphraseToRoomCode(phrase);

    try {
      dom.personalConnectBtn.disabled = true;
      dom.personalConnectBtn.textContent = 'Connecting...';
      await connectWebSocket();
      // Try to join first; if room doesn't exist, create it
      send({ type: 'join-room', roomCode, username });
      // Store that this is a personal room attempt
      state._personalRoomCode = roomCode;
    } catch {
      showJoinError('Server se connect nahi ho paya. Kya server chal raha hai?');
      dom.personalConnectBtn.disabled = false;
      dom.personalConnectBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Connect Privately`;
    }
  });

  // Enter key on secret phrase
  dom.secretPhraseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      dom.personalConnectBtn.click();
    }
  });

  // ── Eye toggle for secret phrase ──
  dom.toggleSecretVisibility.addEventListener('click', () => {
    const input = dom.secretPhraseInput;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    // Swap icon
    dom.toggleSecretVisibility.innerHTML = isPassword
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  });

  // 4x2 Grid Auto-focus and shift logic
  const boxes = document.querySelectorAll('.key-box');
  boxes.forEach((box, idx) => {
    box.addEventListener('input', () => {
      if (box.value.length === 1 && idx < boxes.length - 1) {
        boxes[idx + 1].focus();
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && box.value.length === 0 && idx > 0) {
        boxes[idx - 1].focus();
      }
    });
  });

  // Create Room
  dom.createRoomBtn.addEventListener('click', async () => {
    const username = dom.usernameInput.value.trim();
    if (!username) {
      showJoinError('Please enter your name.');
      dom.usernameInput.focus();
      return;
    }
    state.username = username;

    try {
      dom.createRoomBtn.disabled = true;
      dom.createRoomBtn.textContent = 'Creating...';
      await connectWebSocket();
      send({ type: 'create-room', username });
    } catch {
      showJoinError('Cannot connect to server. Is it running?');
      dom.createRoomBtn.disabled = false;
      dom.createRoomBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> + Create unique owned room`;
    }
  });

  // Copy Keys and Code button inside one-time display card
  const copyBtn = document.getElementById('copy-keys-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const textToCopy = `Upper Key: ${state.upperKey}\nLower Key: ${state.lowerKey}`;
      try {
        await navigator.clipboard.writeText(textToCopy);
        copyBtn.textContent = 'Copied Successfully!';
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy Keys`;
        }, 2000);
      } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    });
  }

  // Enter Room transition button
  const enterBtn = document.getElementById('enter-created-room-btn');
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      switchToChat();
      updateConnectionStatus('waiting', 'Waiting for peer...');
      addSystemNotice('Room ready. Waiting for peer to connect.');
    });
  }

  // Join Room
  dom.joinRoomBtn.addEventListener('click', async () => {
    const username = dom.usernameInput.value.trim();
    if (!username) {
      showJoinError('Please enter your name.');
      dom.usernameInput.focus();
      return;
    }

    // Combine Upper & Lower keys from grid boxes
    let combinedKey = '';
    boxes.forEach(box => {
      combinedKey += box.value.trim();
    });

    if (combinedKey.length !== 8) {
      showJoinError('Please fill all 8 key grid boxes.');
      return;
    }

    state.username = username;
    state.combinedKey = combinedKey;

    try {
      dom.joinRoomBtn.disabled = true;
      dom.joinRoomBtn.textContent = 'Joining...';
      await connectWebSocket();
      send({ type: 'join-room', combinedKey, username });
    } catch {
      showJoinError('Cannot connect to server. Is it running?');
      dom.joinRoomBtn.disabled = false;
      dom.joinRoomBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Join Secure Room`;
    }
  });

  // Enter key on username — focus first key box
  dom.usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (boxes[0]) boxes[0].focus();
    }
  });

  // Send message
  dom.sendBtn.addEventListener('click', sendMessage);

  dom.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  dom.messageInput.addEventListener('focus', () => {
    setTimeout(() => {
      adjustChatViewport();
      scrollToBottom();
    }, 80);
  });

  // Destroy old messages (older than 10 minutes)
  dom.cleanLogsBtn.addEventListener('click', () => {
    if (confirm('Bhai, kya aap sach me 10 minute pehele ke saare messages dono side aur server se permanently destroy karna chahte hain?')) {
      send({
        type: 'destroy-old-messages',
        roomCode: state.roomCode
      });
    }
  });

  // Auto-resize textarea
  dom.messageInput.addEventListener('input', () => {
    dom.messageInput.style.height = 'auto';
    dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight, 120) + 'px';

    // Typing indicator
    clearTimeout(state.typingTimeout);
    sendTypingStatus(true);
    state.typingTimeout = setTimeout(() => sendTypingStatus(false), 2000);
  });

  // Leave room
  dom.leaveBtn.addEventListener('click', () => {
    if (confirm('Kya aap sach mein chat leave karna chahte hain? Saari chat history delete ho jayegi.')) {
      send({ type: 'leave-room' });
      switchToJoin();
    }
  });

  // Room info toggle
  dom.roomInfoBtn.addEventListener('click', toggleRoomInfo);

  // Copy room code
  dom.copyRoomCode.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      dom.copyRoomCode.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        dom.copyRoomCode.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
      }, 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = state.roomCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  });

  // Close room info and emoji picker when clicking outside
  document.addEventListener('click', (e) => {
    if (!dom.roomInfoPanel.contains(e.target) && !dom.roomInfoBtn.contains(e.target)) {
      hideRoomInfo();
    }
    if (dom.emojiPickerPanel && dom.emojiBtn && !dom.emojiPickerPanel.contains(e.target) && !dom.emojiBtn.contains(e.target)) {
      dom.emojiPickerPanel.classList.add('hidden');
    }
  });

  // ── Emoji Picker Bindings ──
  if (dom.emojiBtn) {
    dom.emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.emojiPickerPanel.classList.toggle('hidden');
    });
  }

  if (dom.emojiPickerPanel) {
    dom.emojiPickerPanel.addEventListener('click', (e) => {
      const span = e.target.closest('.emoji-picker-grid span');
      if (span) {
        e.stopPropagation();
        const emoji = span.textContent;
        const start = dom.messageInput.selectionStart;
        const end = dom.messageInput.selectionEnd;
        const val = dom.messageInput.value;
        dom.messageInput.value = val.substring(0, start) + emoji + val.substring(end);
        dom.messageInput.selectionStart = dom.messageInput.selectionEnd = start + emoji.length;
        dom.messageInput.focus();
        dom.emojiPickerPanel.classList.add('hidden');
      }
    });
  }

  // ── Call Buttons ──
  dom.audioCallBtn.addEventListener('click', () => startCall('audio'));
  dom.videoCallBtn.addEventListener('click', () => startCall('video'));

  // ── Call Screen Controls ──
  dom.callAcceptBtn.addEventListener('click', acceptCall);
  dom.callDeclineBtn.addEventListener('click', declineCall);
  dom.callHangupBtn.addEventListener('click', hangupCall);
  dom.callMuteBtn.addEventListener('click', toggleMute);
  dom.callVideoToggleBtn.addEventListener('click', toggleVideo);
  dom.callSpeakerBtn.addEventListener('click', toggleLoudspeaker);

  // ── File Attachment Trigger ──
  if (dom.attachBtn) {
    dom.attachBtn.addEventListener('click', () => {
      dom.fileInput.click();
    });
  }

  if (dom.fileInput) {
    dom.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        sendEncryptedFile(file);
        dom.fileInput.value = '';
      }
    });
  }

  // ── Lightbox Close ──
  if (dom.lightboxClose) {
    dom.lightboxClose.addEventListener('click', closeLightbox);
  }
  if (dom.lightboxModal) {
    dom.lightboxModal.addEventListener('click', (e) => {
      if (e.target === dom.lightboxModal || e.target.classList.contains('lightbox-close')) {
        closeLightbox();
      }
    });
  }

  // ── Read Receipts and Reconnection on Focus ──
  window.addEventListener('focus', handleWindowFocus);
  document.addEventListener('visibilitychange', handleWindowFocus);
}

async function handleWindowFocus() {
  if (document.hidden) return;

  // 1. Send all queued read receipts
  if (state.unreadReceivedMsgs && state.unreadReceivedMsgs.length > 0) {
    state.unreadReceivedMsgs.forEach(msgId => {
      send({ type: 'message-read', messageId: msgId });
    });
    state.unreadReceivedMsgs = [];
  }

  // 2. If disconnected but we have a roomCode, trigger instant reconnect
  if (state.roomCode && (!state.ws || state.ws.readyState !== WebSocket.OPEN)) {
    console.log('App focused/online. Triggering instant reconnect...');
    if (state.reconnectTimeoutId) {
      clearTimeout(state.reconnectTimeoutId);
      state.reconnectTimeoutId = null;
    }
    
    try {
      await connectWebSocket();
      send({
        type: 'join-room',
        roomCode: state.roomCode,
        username: state.username,
        userId: state.userId
      });
    } catch (err) {
      console.warn('Instant reconnect on focus/online failed, fallback to backoff:', err);
      attemptReconnect();
    }
  }
}


// ═══════════════════════════════════════════
// WEBRTC CALLING ENGINE
// ═══════════════════════════════════════════
function startRingtone(isIncoming) {
  stopRingtone();
  try {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const playTone = () => {
      if (!state.audioCtx || state.audioCtx.state === 'closed') return;
      
      const osc1 = state.audioCtx.createOscillator();
      const osc2 = state.audioCtx.createOscillator();
      const gainNode = state.audioCtx.createGain();
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(state.audioCtx.destination);
      
      if (isIncoming) {
        osc1.frequency.value = 440;
        osc2.frequency.value = 480;
        gainNode.gain.setValueAtTime(0.08, state.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 1.8);
        osc1.start(state.audioCtx.currentTime);
        osc2.start(state.audioCtx.currentTime);
        osc1.stop(state.audioCtx.currentTime + 1.8);
        osc2.stop(state.audioCtx.currentTime + 1.8);
        state.ringtoneOscillators = [osc1, osc2];
      } else {
        osc1.frequency.value = 480;
        osc2.frequency.value = 620;
        gainNode.gain.setValueAtTime(0.06, state.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 0.8);
        osc1.start(state.audioCtx.currentTime);
        osc2.start(state.audioCtx.currentTime);
        osc1.stop(state.audioCtx.currentTime + 0.8);
        osc2.stop(state.audioCtx.currentTime + 0.8);
        state.ringtoneOscillators = [osc1, osc2];
      }
    };
    
    playTone();
    const interval = isIncoming ? 3000 : 2000;
    state._ringInterval = setInterval(playTone, interval);
  } catch (e) {
    console.error('Ringtone failed:', e);
  }
}

function stopRingtone() {
  clearInterval(state._ringInterval);
  state.ringtoneOscillators.forEach(osc => {
    try { osc.stop(); } catch(e) {}
  });
  state.ringtoneOscillators = [];
  if (state.audioCtx) {
    state.audioCtx.close();
    state.audioCtx = null;
  }
}

function handleIncomingCall(msg) {
  if (state.callState !== 'idle') {
    send({ type: 'call-decline', reason: 'busy' });
    return;
  }

  state.callState = 'ringing';
  state.callType = msg.callType;
  dom.callPeerTitle.textContent = state.peerUsername || 'Someone';
  dom.callStatusLabel.textContent = `Incoming ${msg.callType} call...`;
  
  dom.callActionsIncoming.classList.remove('hidden');
  dom.callActionsActive.classList.add('hidden');
  
  if (msg.callType === 'video') {
    dom.videoGrid.classList.remove('hidden');
    dom.audioCallUi.classList.add('hidden');
    state.speakerMode = 'speaker';
    dom.callSpeakerBtn.classList.add('active');
    dom.callSpeakerBtn.title = 'Switch to Earpiece';
    dom.callOverlay.classList.add('video-active');
  } else {
    dom.videoGrid.classList.add('hidden');
    dom.audioCallUi.classList.remove('hidden');
    state.speakerMode = 'earpiece';
    dom.callSpeakerBtn.classList.remove('active');
    dom.callSpeakerBtn.title = 'Switch to Loudspeaker';
    dom.callOverlay.classList.remove('video-active');
  }
  
  dom.callOverlay.classList.remove('hidden');
  startRingtone(true);
}

async function startCall(type) {
  if (state.callState !== 'idle') return;

  state.callState = 'calling';
  state.callType = type;
  dom.callPeerTitle.textContent = state.peerUsername || 'Someone';
  dom.callStatusLabel.textContent = `Calling...`;

  dom.callActionsIncoming.classList.add('hidden');
  dom.callActionsActive.classList.remove('hidden');
  dom.callMuteBtn.classList.remove('active');
  dom.callVideoToggleBtn.classList.remove('active');
  
  if (type === 'video') {
    dom.videoGrid.classList.remove('hidden');
    dom.audioCallUi.classList.add('hidden');
    state.speakerMode = 'speaker';
    dom.callSpeakerBtn.classList.add('active');
    dom.callSpeakerBtn.title = 'Switch to Earpiece';
    dom.callOverlay.classList.add('video-active');
  } else {
    dom.videoGrid.classList.add('hidden');
    dom.audioCallUi.classList.remove('hidden');
    state.speakerMode = 'earpiece';
    dom.callSpeakerBtn.classList.remove('active');
    dom.callSpeakerBtn.title = 'Switch to Loudspeaker';
    dom.callOverlay.classList.remove('video-active');
  }

  dom.callOverlay.classList.remove('hidden');
  startRingtone(false);

  send({
    type: 'call-invite',
    callType: type,
    from: state.userId
  });
}

async function acceptCall() {
  if (state.callState !== 'ringing') return;
  stopRingtone();
  
  state.callState = 'connecting';
  dom.callStatusLabel.textContent = `Connecting...`;
  dom.callActionsIncoming.classList.add('hidden');
  dom.callActionsActive.classList.remove('hidden');

  send({ type: 'call-accept' });

  try {
    await setupWebRTC();
  } catch (err) {
    console.error('WebRTC setup failed:', err);
    hangupCall();
  }
}

function declineCall() {
  if (state.callState !== 'ringing') return;
  stopRingtone();
  send({ type: 'call-decline' });
  addCallSystemNotice('📞 Call declined', true);
  resetCallUI();
}

async function handleCallAccepted() {
  if (state.callState !== 'calling') return;
  stopRingtone();
  
  state.callState = 'connecting';
  dom.callStatusLabel.textContent = `Connecting...`;

  try {
    await setupWebRTC();
    
    const offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);
    
    send({
      type: 'webrtc-signal',
      sdp: offer
    });
  } catch (err) {
    console.error('WebRTC initialization or offer failed:', err);
    hangupCall();
  }
}

function handleCallDeclined(msg) {
  if (state.callState !== 'calling') return;
  stopRingtone();
  const reasonText = msg.reason === 'busy' ? '📞 Call declined — Line Busy' : '📞 Call declined';
  dom.callStatusLabel.textContent = msg.reason === 'busy' ? 'Line Busy' : 'Call Declined';
  addCallSystemNotice(reasonText, true);
  setTimeout(resetCallUI, 2000);
}

function hangupCall() {
  if (state.callState === 'idle') return;
  if (state.callState === 'calling') {
    addCallSystemNotice('📞 Call cancelled', true);
  }
  send({ type: 'call-hangup' });
  resetCallUI();
}

function handleCallHangup() {
  if (state.callState === 'ringing') {
    addCallSystemNotice('📞 Missed call', true);
  }
  resetCallUI();
}

async function setupWebRTC() {
  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000
    },
    video: state.callType === 'video' ? {
      width: { ideal: 1280, min: 640 },
      height: { ideal: 720, min: 480 },
      frameRate: { ideal: 30, min: 15 },
      facingMode: 'user'
    } : false
  };

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    if (state.callType === 'video') {
      dom.localVideo.srcObject = state.localStream;
      dom.callVideoToggleBtn.classList.remove('disabled');
    } else {
      dom.callVideoToggleBtn.classList.add('disabled');
    }
  } catch (err) {
    console.error('Media stream capture failed:', err);
    addSystemNotice('⚠️ Cam/Mic access required for calling.');
    throw err;
  }

  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      // Public TURN servers to bypass symmetric cellular/Wi-Fi firewalls
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  };
  
  state.peerConnection = new RTCPeerConnection(config);

  state.peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      send({
        type: 'webrtc-signal',
        candidate: event.candidate
      });
    }
  };

  state.peerConnection.ontrack = (event) => {
    if (!state.remoteStream) {
      state.remoteStream = new MediaStream();
    }
    event.streams[0].getTracks().forEach(track => {
      state.remoteStream.addTrack(track);
    });

    state.callState = 'connected';
    if (!state.callStartTime) {
      state.callStartTime = Date.now();
    }
    
    // Start active call timer display
    startCallTimer();

    // Apply absolute audio routing (Earpiece for audio, Speaker for video)
    applyAudioRouting();
  };

  state.localStream.getTracks().forEach(track => {
    state.peerConnection.addTrack(track, state.localStream);
  });

  // Process any WebRTC signals that arrived before setup was complete
  if (state.pendingWebRTCSignals && state.pendingWebRTCSignals.length > 0) {
    for (const pendingMsg of state.pendingWebRTCSignals) {
      await handleWebRTCSignal(pendingMsg);
    }
    state.pendingWebRTCSignals = [];
  }
}

async function handleWebRTCSignal(msg) {
  if (!state.peerConnection) {
    // Queue signals arriving before camera capture is complete
    if (!state.pendingWebRTCSignals) state.pendingWebRTCSignals = [];
    state.pendingWebRTCSignals.push(msg);
    return;
  }

  try {
    if (msg.sdp) {
      await state.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      
      if (msg.sdp.type === 'offer') {
        const answer = await state.peerConnection.createAnswer();
        await state.peerConnection.setLocalDescription(answer);
        send({
          type: 'webrtc-signal',
          sdp: answer
        });
      }
    } else if (msg.candidate) {
      await state.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
  } catch (err) {
    console.error('Error processing WebRTC signal:', err);
  }
}

function toggleMute() {
  if (!state.localStream) return;
  const audioTracks = state.localStream.getAudioTracks();
  if (audioTracks.length === 0) return;
  
  const enabled = audioTracks[0].enabled;
  audioTracks[0].enabled = !enabled;
  
  dom.callMuteBtn.classList.toggle('active', !audioTracks[0].enabled);
  dom.callMuteBtn.title = audioTracks[0].enabled ? 'Mute Microphone' : 'Unmute Microphone';
}

function toggleVideo() {
  if (state.callType !== 'video' || !state.localStream) return;
  const videoTracks = state.localStream.getVideoTracks();
  if (videoTracks.length === 0) return;
  
  const enabled = videoTracks[0].enabled;
  videoTracks[0].enabled = !enabled;
  
  dom.callVideoToggleBtn.classList.toggle('active', !videoTracks[0].enabled);
  dom.callVideoToggleBtn.title = videoTracks[0].enabled ? 'Turn Camera Off' : 'Turn Camera On';
  
  if (dom.localVideoPlaceholder) {
    if (videoTracks[0].enabled) {
      dom.localVideoPlaceholder.classList.add('hidden');
    } else {
      dom.localVideoPlaceholder.classList.remove('hidden');
    }
  }
}

async function toggleLoudspeaker() {
  if (!state.remoteStream) return;

  // Toggle state
  if (state.speakerMode === 'speaker') {
    state.speakerMode = 'earpiece';
  } else {
    state.speakerMode = 'speaker';
  }

  // Apply real-time physical track routing
  applyAudioRouting();
}

function applyAudioRouting() {
  if (!state.remoteStream) return;

  const audioTracks = state.remoteStream.getAudioTracks();
  if (audioTracks.length === 0) return;

  // Stop current active sources to prevent duplicates
  dom.remoteVideo.srcObject = null;
  dom.remoteAudio.srcObject = null;

  if (state.speakerMode === 'speaker') {
    // ROUTE TO LOUDSPEAKER (External Speaker):
    // Play full stream (including audio) through <video> element
    dom.remoteVideo.srcObject = state.remoteStream;
    dom.remoteVideo.muted = false;
    
    // De-activate hidden audio element
    dom.remoteAudio.srcObject = null;
    
    dom.callSpeakerBtn.classList.add('active');
    dom.callSpeakerBtn.title = 'Switch to Earpiece';
    addCallSystemNotice('🔊 Switched to Loudspeaker', false);

    // Dynamic setSinkId fallback for Android/Chrome
    try {
      if (typeof dom.remoteVideo.setSinkId === 'function') {
        navigator.mediaDevices.enumerateDevices().then(devices => {
          const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
          const speaker = audioOutputs.find(d => 
            d.label.toLowerCase().includes('speaker') || 
            d.label.toLowerCase().includes('loudspeaker') ||
            d.label.toLowerCase().includes('external')
          );
          if (speaker) {
            dom.remoteVideo.setSinkId(speaker.deviceId);
          }
        });
      }
    } catch (e) {}
  } else {
    // ROUTE TO EARPIECE (Handset Receiver):
    // Play audio tracks exclusively through <audio> element to trigger mobile hardware routing
    const audioOnlyStream = new MediaStream(audioTracks);
    dom.remoteAudio.srcObject = audioOnlyStream;
    dom.remoteAudio.muted = false;

    // For video calls, keep video tracks rendering inside <video> but MUTED!
    if (state.callType === 'video') {
      const videoTracks = state.remoteStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const videoOnlyStream = new MediaStream(videoTracks);
        dom.remoteVideo.srcObject = videoOnlyStream;
        dom.remoteVideo.muted = true; // MUST mute video element to force OS earpiece routing
      }
    } else {
      dom.remoteVideo.srcObject = null;
    }

    dom.callSpeakerBtn.classList.remove('active');
    dom.callSpeakerBtn.title = 'Switch to Loudspeaker';
    addCallSystemNotice('🔇 Switched to Earpiece (Normal Sound)', false);

    // Dynamic setSinkId fallback for handset earpiece
    try {
      if (typeof dom.remoteAudio.setSinkId === 'function') {
        navigator.mediaDevices.enumerateDevices().then(devices => {
          const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
          const earpiece = audioOutputs.find(d => 
            d.label.toLowerCase().includes('earpiece') || 
            d.label.toLowerCase().includes('receiver') || 
            d.label.toLowerCase().includes('handset') ||
            d.label.toLowerCase().includes('phone')
          );
          if (earpiece) {
            dom.remoteAudio.setSinkId(earpiece.deviceId);
          }
        });
      }
    } catch (e) {}
  }
}

function startCallTimer() {
  stopCallTimer(); // Ensure any existing timer is cleared
  state.callStartTime = Date.now();
  
  dom.callStatusLabel.textContent = `00:00`;
  
  state.callTimerInterval = setInterval(() => {
    if (state.callState !== 'connected') {
      stopCallTimer();
      return;
    }
    const elapsed = Date.now() - state.callStartTime;
    dom.callStatusLabel.textContent = formatDuration(elapsed);
  }, 1000);
}

function stopCallTimer() {
  if (state.callTimerInterval) {
    clearInterval(state.callTimerInterval);
    state.callTimerInterval = null;
  }
}

function resetCallUI() {
  stopRingtone();
  stopCallTimer();
  
  if (state.callStartTime) {
    const duration = Date.now() - state.callStartTime;
    const durationStr = formatDuration(duration);
    addCallSystemNotice(`📞 Call ended — ${durationStr}`, false);
    state.callStartTime = null;
  }
  
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }
  
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }

  state.remoteStream = null;
  dom.localVideo.srcObject = null;
  dom.remoteVideo.srcObject = null;
  dom.remoteAudio.srcObject = null;
  
  if (dom.localVideoPlaceholder) {
    dom.localVideoPlaceholder.classList.add('hidden');
  }
  
  state.callState = 'idle';
  state.callType = null;
  state.pendingWebRTCSignals = [];
  
  // Reset speaker defaults
  state.speakerMode = 'speaker';
  if (dom.callSpeakerBtn) {
    dom.callSpeakerBtn.classList.add('active');
    dom.callSpeakerBtn.title = 'Switch to Earpiece';
  }
  
  dom.callOverlay.classList.remove('video-active');
  dom.callOverlay.classList.add('hidden');
}

// ═══════════════════════════════════════════
// E2E ENCRYPTED FILE SHARING UTILITIES
// ═══════════════════════════════════════════
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function openLightbox(src) {
  if (dom.lightboxImg) dom.lightboxImg.src = src;
  if (dom.lightboxModal) dom.lightboxModal.classList.remove('hidden');
}

function closeLightbox() {
  if (dom.lightboxModal) dom.lightboxModal.classList.add('hidden');
  if (dom.lightboxImg) dom.lightboxImg.src = '';
}

async function sendEncryptedFile(file) {
  // Enforce 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    showJoinError('File size 10MB se chhoti honi chahiye.');
    return;
  }

  addSystemNotice(`Encrypting and uploading: ${file.name}...`);
  const messageId = `${state.userId}-${++state.messageIdCounter}`;

  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      
      const { iv, ciphertext } = await state.crypto.encrypt(dataUrl);
      
      send({
        type: 'encrypted-message',
        iv,
        ciphertext,
        messageId,
        file: true,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      });

      // Show locally
      appendMessage({
        text: dataUrl,
        isSent: true,
        timestamp: Date.now(),
        messageId,
        file: true,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      });
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('File encryption failed:', err);
    addSystemNotice('⚠️ File encryption failed.');
  }
}

function detectInAppBrowser() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  const isInApp = (
    ua.includes('FBAN') || 
    ua.includes('FBAV') || 
    ua.includes('Instagram') || 
    ua.includes('Messenger') || 
    ua.includes('Telegram') || 
    ua.includes('WhatsApp') || 
    ua.includes('Line') || 
    ua.includes('WeChat')
  );
  
  if (isInApp) {
    const warningEl = document.getElementById('secure-context-warning');
    if (warningEl) {
      warningEl.innerHTML = `⚠️ <strong>In-App Browser Detected:</strong> You are currently inside a social media in-app browser (Instagram/Facebook/Telegram). Microphone, camera, and encryption APIs are heavily restricted here. Please tap the top-right menu and choose <strong>"Open in Chrome"</strong> or <strong>"Open in Safari"</strong> for a flawless experience.`;
      warningEl.classList.remove('hidden');
    }
  }
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
function init() {
  initParticles();
  initEventListeners();
  
  // Register PWA Service Worker for offline instant loading and installability
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('ServiceWorker registered successfully'))
        .catch(err => console.error('ServiceWorker registration failed:', err));
    });
  }

  // Detect and alert on restricted in-app WebViews
  detectInAppBrowser();

  // Offline/Online resilient connection alerts
  window.addEventListener('offline', () => {
    const warningEl = document.getElementById('secure-context-warning');
    if (warningEl) {
      warningEl.innerHTML = `📡 <strong>Network Offline:</strong> Your internet connection has dropped. Attempting to reconnect...`;
      warningEl.classList.remove('hidden');
    }
  });

  window.addEventListener('online', () => {
    const warningEl = document.getElementById('secure-context-warning');
    if (warningEl && warningEl.innerHTML.includes('Network Offline')) {
      warningEl.classList.add('hidden');
    }
    // Instant foreground reconnect — handleWindowFocus is now module-scoped
    handleWindowFocus();
  });
  
  // E2EE secure context check
  const hasCrypto = !!(window.crypto && window.crypto.subtle);
  const isSecure = window.isSecureContext !== false;
  if (!hasCrypto || !isSecure) {
    const warningEl = document.getElementById('secure-context-warning');
    if (warningEl) {
      warningEl.innerHTML = `⚠️ <strong>Security Restriction:</strong> Browser has disabled encryption APIs on this address. E2EE requires a secure context (HTTPS or localhost). Please open using <strong>http://localhost:3000</strong> or connect via HTTPS.`;
      warningEl.classList.remove('hidden');
    }
  }
  
  // Safe unload alert to prevent accidental deletion on reload
  window.addEventListener('beforeunload', (e) => {
    if (state.roomCode) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Prime AudioContext on first user interaction to bypass aggressive Safari/Chrome autoplay restrictions
  const primeAudioContext = () => {
    try {
      const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (tempCtx.state === 'suspended') {
        tempCtx.resume().then(() => tempCtx.close());
      } else {
        tempCtx.close();
      }
    } catch (e) {}
    document.removeEventListener('click', primeAudioContext);
    document.removeEventListener('touchstart', primeAudioContext);
  };
  document.addEventListener('click', primeAudioContext);
  document.addEventListener('touchstart', primeAudioContext);

  dom.usernameInput.focus();
}

init();
