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
  pendingCandidates: [],
  callTimerInterval: null,
  cameraFacingMode: 'user',
  pendingSendQueue: [],
  proximityBlackout: false,
  isCaller: false,
  voiceChangerActive: false,
  voiceContext: null,
  voiceDest: null,
  voiceNodes: null,
  originalAudioTrack: null,
  minimizedAutoHideTimer: null,
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
  cleanLogsBtn: null,
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
  callFlipCameraBtn: $('#call-flip-camera-btn'),
  callSpeakerBtn: $('#call-speaker-btn'),
  callHangupBtn: $('#call-hangup-btn'),
  callProximityOverlay: $('#call-proximity-overlay'),
  callMinimizeBtn: $('#call-minimize-btn'),
  callVoiceChangeBtn: $('#call-voice-change-btn'),
  minimizedControlsOverlay: $('#minimized-controls-overlay'),
  minimizedMaximizeBtn: $('#minimized-maximize-btn'),
  minimizedHangupBtn: $('#minimized-hangup-btn'),
  // Emoji Picker DOM Refs (Removed in favor of native system keyboard emoji selector)
  emojiBtn: null,
  emojiPickerPanel: null,
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
  let isPaused = false;
  
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // Throttle resize handler to prevent layout thrashing on mobile orientation change
  let resizeTimeout;
  function throttledResize() {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      resize();
      // If paused, draw once statically to match new dimensions
      if (isPaused || prefersReducedMotion) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => p.draw());
      }
    }, 100);
  }
  
  resize();
  window.addEventListener('resize', throttledResize, { passive: true });

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
      if (prefersReducedMotion) return;
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
    if (isPaused || prefersReducedMotion) return;
    
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

  function pause() {
    if (!isPaused) {
      isPaused = true;
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
    }
  }

  function resume() {
    if (prefersReducedMotion) return;
    if (isPaused) {
      isPaused = false;
      animate();
    }
  }

  // Bind visibility and focus handlers to save battery in background
  const onVisibilityChange = () => {
    if (document.hidden) pause();
    else resume();
  };
  
  document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });
  window.addEventListener('blur', pause, { passive: true });
  window.addEventListener('focus', resume, { passive: true });

  // Draw once initially
  if (prefersReducedMotion) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => p.draw());
  } else {
    animate();
  }
}

// ═══════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════
function getWsUrl() {
  // Agar website github par chal rahi hai to naya render wala backend url use karo
  if (location.hostname.includes('github.io')) {
    return 'wss://cryptchat-p.onrender.com'; 
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
      
      // Aggressive heartbeat check: if no response in 15 seconds, trigger instant reconnect
      if (Date.now() - lastPong > 15000) {
        console.warn('WebSocket heartbeat timeout. Reconnecting...');
        state.ws.close(); // Triggers onclose and reconnection automatically
      }
    }
  }, 7000); // Ping every 7 seconds for ultra-responsive connection detection
  
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
        // Reset heartbeat on any incoming server message (Bug #14)
        if (state._heartbeatReset) {
          state._heartbeatReset();
        }
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
  
  // Ultra-rapid Aggressive Reconnection backoff
  // First attempt triggers in 500ms (0.5 seconds), subsequent scale slightly but cap at a strict 3000ms max (3 seconds)
  const delay = state.reconnectAttempts === 1 
    ? 500 
    : Math.min(1000 * Math.pow(1.5, state.reconnectAttempts), 3000);
  
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
        userId: state.userId,
        combinedKey: state.combinedKey
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
      state.combinedKey = msg.upperKey + msg.lowerKey; // Set combinedKey for room creator (Bug #12)
      
      // Save session to storage for persistence across reloads/background sleep
      saveSessionToStorage();
      
      // Render one-time visualization keys
      document.getElementById('created-upper-key').textContent = msg.upperKey;
      document.getElementById('created-lower-key').textContent = msg.lowerKey;
      document.getElementById('created-keys-container').classList.remove('hidden');

      // Derive E2EE key locally via PBKDF2 symmetrically
      await state.crypto.deriveKeyFromSecret(msg.upperKey + msg.lowerKey, msg.roomCode);
      state.crypto.setRoomContext(msg.roomCode);
      state.isEncrypted = true;
      updateEncryptionStatus(true);
      enableInput();
      addSystemNotice('🔒 E2E Encrypted');
      flushPendingSendQueue();
      // Clear key materials from memory after key derivation (Bug #17)
      state.combinedKey = null;
      state.secretPhrase = null;
      saveSessionToStorage();

      // Reset button
      dom.createRoomBtn.disabled = false;
      dom.createRoomBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> + Create unique owned room`;
      break;

    case 'room-joined':
      state.roomCode = msg.roomCode;
      state.userId = msg.userId;
      state.peerUsername = msg.peerUsername;
      
      // Save session to storage for persistence across reloads/background sleep
      saveSessionToStorage();
      
      // Reset connect button states
      dom.personalConnectBtn.disabled = false;
      dom.personalConnectBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Connect Privately`;
      dom.joinRoomBtn.disabled = false;
      dom.joinRoomBtn.innerHTML = `Join Private Room`;
      
      switchToChat();
      
      if (msg.resumed) {
        dom.chatPeerName.textContent = msg.peerUsername || 'Waiting for peer...';
        updateConnectionStatus(msg.peerUsername ? 'online' : 'waiting', msg.peerUsername ? 'Online' : 'Room ready');
        
        if (msg.roomCode.startsWith('P')) {
          if (!state.isEncrypted) {
            addSystemNotice('Re-establishing secure E2E encryption...');
            await initiateKeyExchange();
          } else {
            updateEncryptionStatus(state.isEncrypted);
            enableInput();
          }
        } else {
          // Symmetrically derive E2EE key from the stored combined key
          if (state.combinedKey && !state.isEncrypted) {
            await state.crypto.deriveKeyFromSecret(state.combinedKey, msg.roomCode);
            state.crypto.setRoomContext(msg.roomCode);
            state.isEncrypted = true;
            updateEncryptionStatus(true);
            addSystemNotice('🔒 E2E Encrypted');
            // Clear key materials from memory after key derivation (Bug #17)
            state.combinedKey = null;
            state.secretPhrase = null;
            saveSessionToStorage();
          } else {
            updateEncryptionStatus(state.isEncrypted);
          }
          enableInput();
        }
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
      
      if (msg.roomCode.startsWith('P')) {
        enableInput();
        if (msg.peerUsername) {
          try {
            await state.crypto.generateKeyPair();
            const publicKey = await state.crypto.exportPublicKey();
            send({ type: 'key-exchange', publicKey, isInitiator: true });
          } catch (err) {
            console.error('ECDH key generation failed:', err);
          }
        }
        flushPendingSendQueue();
        break;
      }
      
      // Symmetrically derive E2EE key from the inputted combined key
      await state.crypto.deriveKeyFromSecret(state.combinedKey, msg.roomCode);
      state.crypto.setRoomContext(msg.roomCode);
      state.isEncrypted = true;
      updateEncryptionStatus(true);
      enableInput();
      addSystemNotice('🔒 E2E Encrypted');
      flushPendingSendQueue();
      // Clear key materials from memory after key derivation (Bug #17)
      state.combinedKey = null;
      state.secretPhrase = null;
      saveSessionToStorage();
      break;

    case 'peer-joined':
      state.peerUsername = msg.peerUsername;
      dom.chatPeerName.textContent = msg.peerUsername;
      updateConnectionStatus('online', 'Online');
      addSystemNotice(`${msg.peerUsername} joined the room`);
      // Re-enable call buttons when peer joins (they may have been disabled on peer-left)
      enableInput();
      // For private rooms (starts with 'P'), when peer joins, we initiate key exchange
      if (state.roomCode.startsWith('P')) {
        await initiateKeyExchange();
      }
      break;

    case 'key-exchange':
      await handleKeyExchange(msg.publicKey, msg.isInitiator);
      break;

    case 'message-history':
      await handleMessageHistory(msg.messages);
      break;

    case 'peer-reconnected':
      // Peer came back online after a brief disconnect
      state.peerUsername = msg.peerUsername;
      dom.chatPeerName.textContent = msg.peerUsername;
      updateConnectionStatus('online', 'Online');
      // Re-enable call buttons — they were disabled when peer disconnected
      if (state.isEncrypted) enableInput();
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
      if (msg.roomDestroyed) {
        switchToJoin();
        showJoinError('Chat ended and room has been destroyed securely.');
        break;
      }
      state.peerUsername = null;
      state.isEncrypted = false;
      state.crypto = new CryptoEngine();
      dom.chatPeerName.textContent = 'Waiting for peer...';
      updateConnectionStatus('waiting', 'Peer disconnected');
      updateEncryptionStatus(false);
      disableInput();
      addSystemNotice(`${msg.username} left the room`);
      
      // Clean up call if peer left during active call (Bug Fix)
      if (state.callState !== 'idle') {
        resetCallUI();
      }
      break;

    case 'error':
      // Clear persistent session storage on join error
      sessionStorage.removeItem('cryptchat_room_code');
      sessionStorage.removeItem('cryptchat_user_id');
      sessionStorage.removeItem('cryptchat_username');
      sessionStorage.removeItem('cryptchat_secret_phrase');
      sessionStorage.removeItem('cryptchat_combined_key');

      // For personal chat: if room doesn't exist, create it automatically
      if (state._personalRoomCode && msg.message.includes('not found')) {
        send({ type: 'create-room', roomCode: state._personalRoomCode, username: state.username });
        state._personalRoomCode = null; // Clear the flag
        return;
      }
      state._personalRoomCode = null;
      showJoinError(msg.message);
      
      // Reset connect button states
      if (dom.personalConnectBtn.disabled) {
        dom.personalConnectBtn.disabled = false;
        dom.personalConnectBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Connect Privately`;
      }
      dom.joinRoomBtn.disabled = false;
      dom.joinRoomBtn.innerHTML = `Join Private Room`;
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
    send({ type: 'key-exchange', publicKey, isInitiator: true });
  } catch (err) {
    console.error('Key generation failed:', err);
    addSystemNotice('⚠️ Encryption setup failed. Refresh and try again.');
  }
}

async function handleKeyExchange(peerPublicKeyJwk, isInitiator) {
  try {
    // If we don't have a key pair yet, generate one
    if (!state.crypto.keyPair) {
      await state.crypto.generateKeyPair();
    }

    // If the peer initiated this exchange, we MUST reply with our own public key
    if (isInitiator) {
      const publicKey = await state.crypto.exportPublicKey();
      send({ type: 'key-exchange', publicKey, isInitiator: false });
    }

    const peerPublicKey = await state.crypto.importPeerPublicKey(peerPublicKeyJwk);
    await state.crypto.deriveSharedKey(peerPublicKey);
    state.crypto.setRoomContext(state.roomCode);
    state.isEncrypted = true;
    
    updateEncryptionStatus(true);
    enableInput();
    addSystemNotice('🔒 End-to-end encryption activated');
    await flushPendingSendQueue();
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
  if (!text) return;
  // If it's a private room (P-room) and no peer is connected yet, we allow queuing messages
  if (!state.isEncrypted && !(state.roomCode && state.roomCode.startsWith('P'))) return;

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
    const isOffline = !state.ws || state.ws.readyState !== WebSocket.OPEN;
    
    if (!state.isEncrypted) {
      // If we are in a P-room waiting for peer to establish dynamic E2EE
      if (state.roomCode && state.roomCode.startsWith('P')) {
        if (!state.pendingSendQueue) state.pendingSendQueue = [];
        state.pendingSendQueue.push({
          type: 'pending-plaintext',
          text,
          messageId
        });
        
        appendMessage({
          text,
          isSent: true,
          timestamp: Date.now(),
          messageId,
          isSending: true
        });

        dom.messageInput.value = '';
        dom.messageInput.style.height = 'auto';
        sendTypingStatus(false);
        setTimeout(() => dom.messageInput.focus(), 50);
        return;
      }
      return;
    }

    const { iv, ciphertext } = await state.crypto.encrypt(text);
    const payload = {
      type: 'encrypted-message',
      iv,
      ciphertext,
      messageId
    };

    if (isOffline) {
      if (!state.pendingSendQueue) state.pendingSendQueue = [];
      state.pendingSendQueue.push(payload);
    } else {
      send(payload);
    }

    // Show locally
    appendMessage({
      text,
      isSent: true,
      timestamp: Date.now(),
      messageId,
      isSending: isOffline
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

// Simple and robust helper to avoid E2EE race conditions during page reload / reconnect handshakes
function ensureE2EEReady() {
  if (state.isEncrypted) return Promise.resolve();
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (state.isEncrypted) {
        clearInterval(check);
        resolve();
      }
    }, 50);
    // Timeout after 10 seconds just to avoid infinite loop
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, 10000);
  });
}

async function handleEncryptedMessage(msg) {
  // Wait for E2EE keys to be fully derived/re-established before decrypting
  await ensureE2EEReady();
  
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
  
  // Wait for E2EE keys to be fully derived/re-established before processing history
  await ensureE2EEReady();
  
  for (const msg of messages) {
    try {
      // Avoid duplicate appending if message is already on screen
      if (document.querySelector(`[data-message-id="${msg.messageId}"]`)) {
        continue;
      }

      const isSent = msg.from === state.userId;
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
function appendMessage({ text, isSent, senderName, timestamp, messageId, file, fileName, fileType, fileSize, isSending }) {
  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
  if (messageId) wrapper.dataset.messageId = messageId;
  wrapper.dataset.timestamp = timestamp;

  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // WhatsApp-compliant metadata block (nested inside bubbles)
  let metaHtml = `<div class="message-meta-whatsapp">`;
  metaHtml += `<span class="message-time-whatsapp">${time}</span>`;
  if (isSent) {
    if (isSending) {
      metaHtml += `<span class="message-status message-status-whatsapp sending" data-mid="${messageId || ''}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </span>`;
    } else {
      metaHtml += `<span class="message-status message-status-whatsapp" data-mid="${messageId || ''}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>`;
    }
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

function markMessageSent(messageId) {
  const wrapper = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!wrapper) return;
  const statusEl = wrapper.querySelector('.message-status');
  if (statusEl && statusEl.classList.contains('sending')) {
    statusEl.classList.remove('sending');
    statusEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  }
}

async function flushPendingSendQueue() {
  if (state.pendingSendQueue && state.pendingSendQueue.length > 0) {
    console.log(`Flushing ${state.pendingSendQueue.length} pending messages...`);
    const queue = [...state.pendingSendQueue];
    state.pendingSendQueue = [];
    for (const item of queue) {
      if (item.type === 'pending-plaintext') {
        if (state.isEncrypted) {
          try {
            const { iv, ciphertext } = await state.crypto.encrypt(item.text);
            send({
              type: 'encrypted-message',
              iv,
              ciphertext,
              messageId: item.messageId
            });
            markMessageSent(item.messageId);
          } catch (err) {
            console.error('Failed to encrypt queued message:', err);
          }
        } else {
          // Put back in queue if encryption still not ready
          state.pendingSendQueue.push(item);
        }
      } else {
        send(item);
        markMessageSent(item.messageId);
      }
    }
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
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(() => {
    dom.messagesContainer.scrollTo({
      top: dom.messagesContainer.scrollHeight,
      behavior: prefersReducedMotion ? 'auto' : 'smooth'
    });
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
    document.addEventListener('touchstart', closeContextMenuOnOutside, { passive: true });
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
  // Reset any active call UI and media tracks (Bug Fix)
  resetCallUI();

  dom.chatScreen.classList.remove('active');
  dom.joinScreen.classList.add('active');
  
  // Clear persistent session storage on explicit leave
  sessionStorage.removeItem('cryptchat_room_code');
  sessionStorage.removeItem('cryptchat_user_id');
  sessionStorage.removeItem('cryptchat_username');
  sessionStorage.removeItem('cryptchat_secret_phrase');
  sessionStorage.removeItem('cryptchat_combined_key');

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
    if (dom.emojiPickerPanel) {
      dom.emojiPickerPanel.classList.add('hidden');
    }
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
    let username = dom.usernameInput.value.trim();
    const phrase = dom.secretPhraseInput.value.trim();
    if (!username) {
      username = 'Anonymous_' + Math.floor(Math.random() * 10000);
      dom.usernameInput.value = username;
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
    let username = dom.usernameInput.value.trim();
    if (!username) {
      username = 'Anonymous_' + Math.floor(Math.random() * 10000);
      dom.usernameInput.value = username;
    }
    state.username = username;
    
    const customCodeInput = document.getElementById('custom-room-code-input');
    let customCode = customCodeInput ? customCodeInput.value.trim().toUpperCase() : '';
    if (customCode && customCode.length !== 8) {
      showJoinError('Custom code must be exactly 8 characters long.');
      return;
    }

    try {
      dom.createRoomBtn.disabled = true;
      dom.createRoomBtn.textContent = 'Creating...';
      await connectWebSocket();
      send({ type: 'create-room', username, customCode });
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
    let username = dom.usernameInput.value.trim();
    if (!username) {
      username = 'Anonymous_' + Math.floor(Math.random() * 10000);
      dom.usernameInput.value = username;
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

  // Silently purge messages older than 10 minutes from the UI automatically every 10 seconds
  setInterval(() => {
    const threshold = Date.now() - 600000;
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
  }, 10000);

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

  // Close room info when clicking outside
  document.addEventListener('click', (e) => {
    if (!dom.roomInfoPanel.contains(e.target) && !dom.roomInfoBtn.contains(e.target)) {
      hideRoomInfo();
    }
  });

  // ── Call Buttons ──
  dom.audioCallBtn.addEventListener('click', () => startCall('audio'));
  dom.videoCallBtn.addEventListener('click', () => startCall('video'));

  // ── Call Screen Controls ──
  dom.callAcceptBtn.addEventListener('click', acceptCall);
  dom.callDeclineBtn.addEventListener('click', declineCall);
  dom.callHangupBtn.addEventListener('click', hangupCall);
  dom.callMuteBtn.addEventListener('click', toggleMute);
  dom.callVideoToggleBtn.addEventListener('click', toggleVideo);
  if (dom.callFlipCameraBtn) {
    dom.callFlipCameraBtn.addEventListener('click', flipCamera);
  }
  dom.callSpeakerBtn.addEventListener('click', toggleLoudspeaker);
  if (dom.callVoiceChangeBtn) {
    dom.callVoiceChangeBtn.addEventListener('click', toggleVoiceChanger);
  }
  if (dom.callProximityOverlay) {
    dom.callProximityOverlay.addEventListener('dblclick', () => {
      toggleProximityOverlay(false);
    });
  }

  // ── Floating Minimized Call Listeners ──
  if (dom.callMinimizeBtn) {
    dom.callMinimizeBtn.addEventListener('click', minimizeCall);
  }
  if (dom.minimizedMaximizeBtn) {
    dom.minimizedMaximizeBtn.addEventListener('click', maximizeCall);
  }
  if (dom.minimizedHangupBtn) {
    dom.minimizedHangupBtn.addEventListener('click', hangupCall);
  }
  if (dom.callOverlay) {
    dom.callOverlay.addEventListener('click', (e) => {
      if (dom.callOverlay.classList.contains('minimized')) {
        if (e.target.closest('#minimized-hangup-btn')) return;
        if (e.target.closest('#minimized-maximize-btn')) {
          maximizeCall();
          return;
        }
        // Suppress toggle if user just finished dragging (hasMoved flag)
        if (hasMoved) return;

        triggerMinimizedControlsTouched();
      }
    });
  }

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

  // Initialize floating and resizable drag-snapping call popup handlers
  setupFloatingCallControls();
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
        userId: state.userId,
        combinedKey: state.combinedKey
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
  state.isCaller = false;
  dom.callPeerTitle.textContent = state.peerUsername || 'Someone';
  dom.callStatusLabel.textContent = `Incoming ${msg.callType} call...`;
  
  dom.callActionsIncoming.classList.remove('hidden');
  dom.callActionsActive.classList.add('hidden');
  
  if (msg.callType === 'video') {
    dom.videoGrid.classList.remove('hidden');
    dom.audioCallUi.classList.add('hidden');
    state.speakerMode = 'speaker'; // Video call defaults to loudspeaker
    dom.callSpeakerBtn.classList.add('active');
    dom.callSpeakerBtn.title = 'Switch to Earpiece';
    dom.callOverlay.classList.add('video-active');
  } else {
    dom.videoGrid.classList.add('hidden');
    dom.audioCallUi.classList.remove('hidden');
    state.speakerMode = 'earpiece'; // Both audio and video calls default to earpiece
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
  state.isCaller = true;
  dom.callPeerTitle.textContent = state.peerUsername || 'Someone';
  dom.callStatusLabel.textContent = `Calling...`;

  dom.callActionsIncoming.classList.add('hidden');
  dom.callActionsActive.classList.remove('hidden');
  dom.callMuteBtn.classList.remove('active');
  dom.callVideoToggleBtn.classList.remove('active');
  
  if (type === 'video') {
    dom.videoGrid.classList.remove('hidden');
    dom.audioCallUi.classList.add('hidden');
    state.speakerMode = 'speaker'; // Video call defaults to loudspeaker
    dom.callSpeakerBtn.classList.add('active');
    dom.callSpeakerBtn.title = 'Switch to Earpiece';
    dom.callOverlay.classList.add('video-active');
  } else {
    dom.videoGrid.classList.add('hidden');
    dom.audioCallUi.classList.remove('hidden');
    state.speakerMode = 'earpiece'; // Both audio and video calls default to earpiece
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
      autoGainControl: true
    },
    video: state.callType === 'video' ? {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 },
      facingMode: { ideal: state.cameraFacingMode || 'user' }
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
    
    // Show/hide voice changer based on caller identity
    if (dom.callVoiceChangeBtn) {
      if (state.isCaller) {
        dom.callVoiceChangeBtn.classList.remove('hidden');
      } else {
        dom.callVoiceChangeBtn.classList.add('hidden');
      }
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
    
    const track = event.track;
    if (track) {
      if (!state.remoteStream.getTracks().find(t => t.id === track.id)) {
        state.remoteStream.addTrack(track);
      }
    }

    const streams = event.streams;
    if (streams && streams.length > 0) {
      streams[0].getTracks().forEach(t => {
        if (!state.remoteStream.getTracks().find(x => x.id === t.id)) {
          state.remoteStream.addTrack(t);
        }
      });
    }

    state.callState = 'connected';
    if (!state.callStartTime) {
      state.callStartTime = Date.now();
    }
    
    // Start active call timer display — only once per connected call
    startCallTimer();



    // Apply audio routing (Earpiece default for both audio & video calls)
    applyAudioRouting();

    // Start proximity sensor for earpiece mode (ONLY for audio calls)
    if (state.speakerMode === 'earpiece' && state.callType !== 'video') {
      startProximitySensor();
    }
  };

  state.localStream.getTracks().forEach(track => {
    state.peerConnection.addTrack(track, state.localStream);
  });

  // ═══ BITRATE OPTIMIZATION (Low Data Usage) ═══
  // Limit bandwidth: Audio=32kbps (Opus), Video=500kbps
  _applyBitrateLimits();

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

      // Process any queued candidates now that remote description is set
      if (state.pendingCandidates && state.pendingCandidates.length > 0) {
        console.log(`Processing ${state.pendingCandidates.length} queued ICE candidates`);
        for (const candidate of state.pendingCandidates) {
          try {
            await state.peerConnection.addIceCandidate(candidate);
          } catch (e) {
            console.error('Error adding queued ICE candidate:', e);
          }
        }
        state.pendingCandidates = [];
      }
    } else if (msg.candidate) {
      const candidate = new RTCIceCandidate(msg.candidate);
      if (state.peerConnection.remoteDescription && state.peerConnection.remoteDescription.type) {
        await state.peerConnection.addIceCandidate(candidate);
      } else {
        if (!state.pendingCandidates) state.pendingCandidates = [];
        state.pendingCandidates.push(candidate);
        console.log('Queued incoming ICE candidate (remoteDescription not yet set)');
      }
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

// ═══ PROXIMITY SENSOR SYSTEM (WhatsApp-like) ═══
// Uses layered approach: ProximitySensor API > Generic Sensor > DeviceOrientation fallback
let _proximitySensor = null;
let _wakeLock = null;

function toggleProximityOverlay(show) {
  if (!dom.callProximityOverlay) return;
  if (show) {
    dom.callProximityOverlay.classList.remove('hidden');
    state.proximityBlackout = true;
    // Acquire Wake Lock to keep call alive while screen is dimmed
    _acquireWakeLock();
  } else {
    dom.callProximityOverlay.classList.add('hidden');
    state.proximityBlackout = false;
    _releaseWakeLock();
  }
}

async function _acquireWakeLock() {
  try {
    if ('wakeLock' in navigator && !_wakeLock) {
      _wakeLock = await navigator.wakeLock.request('screen');
      _wakeLock.addEventListener('release', () => { _wakeLock = null; });
    }
  } catch (e) { /* Wake Lock not supported or denied */ }
}

function _releaseWakeLock() {
  try {
    if (_wakeLock) {
      _wakeLock.release();
      _wakeLock = null;
    }
  } catch (e) {}
}

function startProximitySensor() {
  // Proximity sensor lock should only work in audio calls, never in video calls
  if (state.callType === 'video') return;

  // Only enable proximity detection in earpiece mode during active calls
  if (state.callState !== 'connected' && state.callState !== 'connecting') return;

  // Strategy 1: Native ProximitySensor API (Chrome Android 90+)
  if ('ProximitySensor' in window) {
    try {
      _proximitySensor = new ProximitySensor();
      _proximitySensor.addEventListener('reading', () => {
        if (state.callState !== 'connected') return;
        if (state.speakerMode !== 'earpiece') {
          toggleProximityOverlay(false);
          return;
        }
        // near = true when object is close to sensor
        if (_proximitySensor.near) {
          toggleProximityOverlay(true);
        } else {
          toggleProximityOverlay(false);
        }
      });
      _proximitySensor.addEventListener('error', () => {
        // Fallback to gyroscope
        _startGyroscopeProximity();
      });
      _proximitySensor.start();
      return;
    } catch (e) {
      // Fall through to next strategy
    }
  }

  // Strategy 2: Generic Sensor API with 'proximity' type
  if ('Sensor' in window) {
    try {
      const sensor = new Sensor({ frequency: 5 });
      // If generic proximity not supported, fall through
    } catch (e) {}
  }

  // Strategy 3: DeviceOrientation gyroscope fallback (works on all mobiles)
  _startGyroscopeProximity();
}

function _startGyroscopeProximity() {
  // Use accelerometer + gyroscope to detect phone-to-ear gesture
  // Beta > 70° = phone is vertical and likely near ear
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  window.addEventListener('deviceorientation', handleDeviceOrientation);
}

function stopProximitySensor() {
  // Stop native sensor
  if (_proximitySensor) {
    try { _proximitySensor.stop(); } catch (e) {}
    _proximitySensor = null;
  }
  // Remove gyroscope listener
  window.removeEventListener('deviceorientation', handleDeviceOrientation);
  // Release wake lock
  _releaseWakeLock();
  // Hide overlay
  toggleProximityOverlay(false);
}

function handleDeviceOrientation(event) {
  if (state.callState !== 'connected') {
    toggleProximityOverlay(false);
    return;
  }
  // Only activate proximity screen-off in earpiece mode
  if (state.speakerMode !== 'earpiece') {
    toggleProximityOverlay(false);
    return;
  }
  if (event && event.beta !== null) {
    const beta = Math.abs(event.beta);
    // Phone held vertically (> 70°) = near ear gesture
    if (beta > 70) {
      toggleProximityOverlay(true);
    } else if (beta < 45) {
      toggleProximityOverlay(false);
    }
  }
}

async function flipCamera() {
  if (state.callType !== 'video' || !state.localStream || !state.peerConnection) return;
  const videoTracks = state.localStream.getVideoTracks();
  if (videoTracks.length === 0) return;

  dom.callFlipCameraBtn.disabled = true;
  const originalContent = dom.callFlipCameraBtn.innerHTML;
  dom.callFlipCameraBtn.innerHTML = `<svg class="spin-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`;

  const previousFacingMode = state.cameraFacingMode;
  state.cameraFacingMode = state.cameraFacingMode === 'user' ? 'environment' : 'user';

  // Lenient constraints to guarantee compatibility across all mobile devices
  const constraints = {
    video: {
      facingMode: { ideal: state.cameraFacingMode },
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 }
    }
  };

  try {
    // 1. Stop the old video track first to unlock the camera hardware on mobile devices
    videoTracks.forEach(track => track.stop());

    // 2. Request the new stream with relaxed constraints
    let newStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (captureErr) {
      console.warn('Primary camera flip failed, trying fallback without resolution constraints:', captureErr);
      // Fallback: request only facingMode without any resolution/framerate constraints
      newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: state.cameraFacingMode } }
      });
    }

    const newTrack = newStream.getVideoTracks()[0];

    // 3. Update WebRTC peer connection sender
    const senders = state.peerConnection.getSenders();
    const videoSender = senders.find(s => s.track && s.track.kind === 'video');
    if (videoSender) {
      await videoSender.replaceTrack(newTrack);
    }

    // 4. Update local stream reference and UI
    state.localStream.removeTrack(videoTracks[0]);
    state.localStream.addTrack(newTrack);
    dom.localVideo.srcObject = state.localStream;
    addCallSystemNotice('📷 Camera flipped successfully', false);
  } catch (err) {
    console.error('Camera flip failed completely:', err);
    state.cameraFacingMode = previousFacingMode;
    
    // Restore the old camera stream if possible
    try {
      const restoreStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: state.cameraFacingMode },
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 }
        }
      });
      const restoreTrack = restoreStream.getVideoTracks()[0];
      const senders = state.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(restoreTrack);
      }
      state.localStream.removeTrack(videoTracks[0]);
      state.localStream.addTrack(restoreTrack);
      dom.localVideo.srcObject = state.localStream;
    } catch (restoreErr) {
      console.error('Failed to restore original camera stream:', restoreErr);
    }
    
    addCallSystemNotice('⚠️ Camera flip failed', true);
  } finally {
    dom.callFlipCameraBtn.innerHTML = originalContent;
    dom.callFlipCameraBtn.disabled = false;
  }
}

async function toggleLoudspeaker() {
  if (!state.remoteStream) return;

  // Toggle state
  if (state.speakerMode === 'speaker') {
    state.speakerMode = 'earpiece';
    // Start proximity detection in earpiece mode (ONLY for audio calls)
    if (state.callType !== 'video') {
      startProximitySensor();
    }
  } else {
    state.speakerMode = 'speaker';
    // Stop proximity detection in speaker mode
    stopProximitySensor();
  }

  // Apply real-time physical track routing
  applyAudioRouting();
}

function applyAudioRouting() {
  if (!state.remoteStream) return;

  const audioTracks = state.remoteStream.getAudioTracks();
  if (audioTracks.length === 0) return;

  if (state.speakerMode === 'speaker') {
    // ═══ LOUDSPEAKER MODE ═══
    // Route full stream (audio+video) through <video> element at full volume
    // Only re-bind if the source stream has changed or lacks audio tracks, preventing black screens/glitches
    const currentStream = dom.remoteVideo.srcObject;
    if (currentStream !== state.remoteStream || !currentStream || currentStream.getAudioTracks().length === 0) {
      dom.remoteVideo.srcObject = state.remoteStream;
      dom.remoteVideo.muted = false;
      dom.remoteVideo.volume = 1.0;
      dom.remoteVideo.play().catch(() => {});
      _trySetSinkId(dom.remoteVideo, 'speaker');
    }
    
    if (dom.remoteAudio.srcObject) {
      dom.remoteAudio.srcObject = null;
    }

    dom.callSpeakerBtn.classList.add('active');
    dom.callSpeakerBtn.title = 'Switch to Earpiece';
    addCallSystemNotice('🔊 Switched to Loudspeaker', false);

  } else {
    // ═══ EARPIECE MODE ═══
    // Critical: Route audio through a SEPARATE <audio> element.
    const audioOnlyStream = new MediaStream(audioTracks);
    if (!dom.remoteAudio.srcObject || dom.remoteAudio.srcObject.getAudioTracks()[0]?.id !== audioTracks[0].id) {
      dom.remoteAudio.srcObject = audioOnlyStream;
      dom.remoteAudio.muted = false;
      dom.remoteAudio.volume = 1.0;
      
      const playPromise = dom.remoteAudio.play();
      if (playPromise) {
        playPromise.catch(() => {
          setTimeout(() => { dom.remoteAudio.play().catch(() => {}); }, 200);
        });
      }
      _trySetSinkId(dom.remoteAudio, 'earpiece');
    }

    // Handle remote video element in earpiece mode (Bug fix: prevent black screen in video calls and force earpiece audio routing)
    if (state.callType === 'video') {
      const videoTracks = state.remoteStream.getVideoTracks();
      const videoOnlyStream = new MediaStream(videoTracks);
      const currentStream = dom.remoteVideo.srcObject;
      const currentTrackId = currentStream && currentStream.getVideoTracks()[0]?.id;
      const newTrackId = videoTracks[0]?.id;

      if (!currentStream || currentTrackId !== newTrackId || currentStream.getAudioTracks().length > 0) {
        dom.remoteVideo.srcObject = videoOnlyStream;
        dom.remoteVideo.play().catch(() => {});
      }
      dom.remoteVideo.muted = true; // Mute video element to prevent forcing loudspeaker output on some browsers
    } else {
      if (dom.remoteVideo.srcObject) {
        dom.remoteVideo.srcObject = null;
      }
    }

    dom.callSpeakerBtn.classList.remove('active');
    dom.callSpeakerBtn.title = 'Switch to Loudspeaker';
    addCallSystemNotice('🔇 Switched to Earpiece', false);
  }
}

// ═══ Hardware Audio Output Routing via setSinkId ═══
async function _trySetSinkId(element, targetMode) {
  try {
    if (typeof element.setSinkId !== 'function') return;
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
    
    if (audioOutputs.length <= 1) return; // No alternative outputs

    let target;
    if (targetMode === 'earpiece') {
      target = audioOutputs.find(d => {
        const l = d.label.toLowerCase();
        return l.includes('earpiece') || l.includes('receiver') || 
               l.includes('handset') || l.includes('phone');
      });
      // If no earpiece found, use default ('' = system default = earpiece on calls)
      if (!target) {
        await element.setSinkId('');
        return;
      }
    } else {
      target = audioOutputs.find(d => {
        const l = d.label.toLowerCase();
        return l.includes('speaker') || l.includes('loudspeaker') || 
               l.includes('external');
      });
    }
    
    if (target) {
      await element.setSinkId(target.deviceId);
    }
  } catch (e) {
    // setSinkId not supported or permission denied — silent fallback
  }
}

// ═══ BITRATE LIMITS FOR LOW DATA USAGE ═══
// Caps bandwidth: Audio 32kbps (Opus), Video 500kbps
// WhatsApp uses similar limits for efficient mobile calling
function _applyBitrateLimits() {
  if (!state.peerConnection) return;
  
  const senders = state.peerConnection.getSenders();
  
  senders.forEach(sender => {
    if (!sender.track) return;
    
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      
      if (sender.track.kind === 'audio') {
        // Opus codec at 32kbps — excellent voice quality, minimal data
        params.encodings[0].maxBitrate = 32000;
      } else if (sender.track.kind === 'video') {
        // 500kbps video — good for mobile, ~3.75 MB/min
        params.encodings[0].maxBitrate = 500000;
        // Scale down resolution on slow connections
        params.encodings[0].scaleResolutionDownBy = params.encodings[0].scaleResolutionDownBy || 1.0;
      }
      
      sender.setParameters(params).catch(() => {});
    } catch (e) {
      // setParameters not supported in this browser — silent fallback
    }
  });
}

function startCallTimer() {
  stopCallTimer(); // Ensure any existing timer is cleared
  // Do NOT overwrite callStartTime here — it is set once in ontrack to preserve accuracy
  if (!state.callStartTime) {
    state.callStartTime = Date.now();
  }
  
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

function triggerMinimizedControlsTouched() {
  if (!dom.callOverlay || !dom.callOverlay.classList.contains('minimized')) return;
  dom.callOverlay.classList.add('touched');
  if (state.minimizedAutoHideTimer) clearTimeout(state.minimizedAutoHideTimer);
  state.minimizedAutoHideTimer = setTimeout(() => {
    dom.callOverlay.classList.remove('touched');
    state.minimizedAutoHideTimer = null;
  }, 1000);
}

function minimizeCall() {
  if (state.callState === 'idle') return;
  // Clear any previous dragging inline styles first
  dom.callOverlay.style.width = '';
  dom.callOverlay.style.height = '';
  dom.callOverlay.style.top = '';
  dom.callOverlay.style.left = '';
  dom.callOverlay.style.bottom = '';
  dom.callOverlay.style.right = '';
  dom.callOverlay.classList.add('minimized');
  addCallSystemNotice('🗗 Call minimized', false);
  
  // Show minimized controls overlay for 1 second and then auto-hide
  triggerMinimizedControlsTouched();
}

function maximizeCall() {
  dom.callOverlay.classList.remove('minimized');
  dom.callOverlay.classList.remove('touched');
  // Clear drag & resize inline styles so default fullscreen CSS takes over
  dom.callOverlay.style.width = '';
  dom.callOverlay.style.height = '';
  dom.callOverlay.style.top = '';
  dom.callOverlay.style.left = '';
  dom.callOverlay.style.bottom = '';
  dom.callOverlay.style.right = '';
  addCallSystemNotice('🗖 Call maximized', false);
}

let isDragging = false;
let isResizing = false;
let startX = 0, startY = 0;
let startWidth = 0, startHeight = 0;
let overlayLeft = 0, overlayTop = 0;
let dragThreshold = 5;
let hasMoved = false;

function setupFloatingCallControls() {
  const overlay = dom.callOverlay;
  const resizeHandle = document.getElementById('minimized-resize-handle');

  let lastTap = 0;
  overlay.addEventListener('pointerdown', (e) => {
    if (!overlay.classList.contains('minimized')) return;
    
    if (e.target.closest('.minimized-action-btn') || e.target.closest('#minimized-resize-handle')) {
      return;
    }

    const now = Date.now();
    if (now - lastTap < 300) {
      e.preventDefault();
      toggleMinimizedSize();
      return;
    }
    lastTap = now;

    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = overlay.getBoundingClientRect();
    overlayLeft = rect.left;
    overlayTop = rect.top;

    overlay.classList.add('dragging');
    overlay.setPointerCapture(e.pointerId);
  });

  overlay.addEventListener('pointermove', (e) => {
    if (!overlay.classList.contains('minimized')) return;

    if (isDragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!hasMoved && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
        hasMoved = true;
        overlay.style.bottom = 'auto';
        overlay.style.right = 'auto';
      }

      if (hasMoved) {
        let newLeft = overlayLeft + dx;
        let newTop = overlayTop + dy;

        const rect = overlay.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width;
        const maxTop = window.innerHeight - rect.height;

        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        overlay.style.left = `${newLeft}px`;
        overlay.style.top = `${newTop}px`;
      }
    }
  });

  const endDrag = (e) => {
    if (!overlay.classList.contains('minimized')) return;

    if (isDragging) {
      isDragging = false;
      overlay.classList.remove('dragging');
      try { overlay.releasePointerCapture(e.pointerId); } catch (err) {}

      if (hasMoved) {
        const rect = overlay.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const margin = 16;
        const topMargin = 16;
        const bottomMargin = 100;

        let targetLeft = margin;
        if (rect.left + rect.width / 2 > screenWidth / 2) {
          targetLeft = screenWidth - rect.width - margin;
        }

        let targetTop = rect.top;
        if (targetTop < topMargin) targetTop = topMargin;
        if (targetTop > screenHeight - rect.height - bottomMargin) {
          targetTop = screenHeight - rect.height - bottomMargin;
        }

        overlay.style.left = `${targetLeft}px`;
        overlay.style.top = `${targetTop}px`;
      }
    }
  };

  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);

  if (resizeHandle) {
    resizeHandle.addEventListener('pointerdown', (e) => {
      if (!overlay.classList.contains('minimized')) return;
      e.stopPropagation();
      e.preventDefault();

      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = overlay.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;

      overlay.classList.add('dragging');
      resizeHandle.setPointerCapture(e.pointerId);
    });

    resizeHandle.addEventListener('pointermove', (e) => {
      if (!isResizing) return;
      e.stopPropagation();

      const dx = startX - e.clientX; 
      const dy = e.clientY - startY; 

      const aspect = 140 / 210;
      let newWidth = startWidth + dx;
      
      const minW = 120;
      const maxW = 260;
      
      if (newWidth < minW) newWidth = minW;
      if (newWidth > maxW) newWidth = maxW;

      let newHeight = newWidth / aspect;

      const rect = overlay.getBoundingClientRect();
      const currentTop = rect.top;
      let newLeft = rect.right - newWidth;

      if (newLeft < 0) {
        newWidth = rect.right;
        newHeight = newWidth / aspect;
        newLeft = 0;
      }

      if (currentTop + newHeight > window.innerHeight - 20) {
        newHeight = window.innerHeight - 20 - currentTop;
        newWidth = newHeight * aspect;
        newLeft = rect.right - newWidth;
      }

      overlay.style.width = `${newWidth}px`;
      overlay.style.height = `${newHeight}px`;
      overlay.style.left = `${newLeft}px`;
      overlay.style.bottom = 'auto';
      overlay.style.right = 'auto';
    });

    const endResize = (e) => {
      if (isResizing) {
        isResizing = false;
        overlay.classList.remove('dragging');
        try { resizeHandle.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    };

    resizeHandle.addEventListener('pointerup', endResize);
    resizeHandle.addEventListener('pointercancel', endResize);
  }
}

function toggleMinimizedSize() {
  const overlay = dom.callOverlay;
  if (!overlay.classList.contains('minimized')) return;

  const rect = overlay.getBoundingClientRect();
  const currentWidth = rect.width;
  
  const isCompact = currentWidth < 170;
  const targetWidth = isCompact ? 200 : 140;
  const targetHeight = isCompact ? 300 : 210;

  let targetLeft = rect.right - targetWidth;
  if (targetLeft < 16) targetLeft = 16;
  if (targetLeft + targetWidth > window.innerWidth - 16) {
    targetLeft = window.innerWidth - targetWidth - 16;
  }

  let targetTop = rect.top;
  if (targetTop + targetHeight > window.innerHeight - 100) {
    targetTop = window.innerHeight - targetHeight - 100;
  }
  if (targetTop < 16) targetTop = 16;

  overlay.style.width = `${targetWidth}px`;
  overlay.style.height = `${targetHeight}px`;
  overlay.style.left = `${targetLeft}px`;
  overlay.style.top = `${targetTop}px`;
  overlay.style.bottom = 'auto';
  overlay.style.right = 'auto';

  addCallSystemNotice(isCompact ? '🗖 Floating window enlarged' : '🗗 Floating window compressed', false);
}

async function initVoiceChanger() {
  if (state.voiceContext) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  state.voiceContext = new AudioContextClass({ latencyCategory: 'interactive' });

  const workletCode = `
  class PitchShifterProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{ name: 'pitch', defaultValue: 1.45, minValue: 0.5, maxValue: 2.0 }];
    }

    constructor() {
      super();
      this.bufferSize = 4096;
      this.buffer = new Float32Array(this.bufferSize);
      this.writePos = 0;
      
      // Grain size: 768 samples is the magic sweet spot. Lower values sound buzzy, higher sound like metallic echo.
      this.grainSize = 768; 
      this.numGrains = 4;
      this.grainOffsets = new Float32Array(this.numGrains);
      for (let i = 0; i < this.numGrains; i++) {
        this.grainOffsets[i] = (i * this.grainSize) / this.numGrains;
      }
    }

    process(inputs, outputs, parameters) {
      const input = inputs[0];
      const output = outputs[0];
      if (!input || input.length === 0 || !input[0]) return true;

      const inputChannel = input[0];
      const outputChannel = output[0];
      const len = inputChannel.length;
      const pitch = parameters.pitch ? parameters.pitch[0] : 1.45;

      for (let i = 0; i < len; i++) {
        this.buffer[this.writePos] = inputChannel[i];

        let outSample = 0;
        let sumWindow = 0;

        for (let g = 0; g < this.numGrains; g++) {
          const offset = this.grainOffsets[g];
          const phase = offset / this.grainSize;
          
          // Hann window power-complementary crossfade
          const win = Math.sin(Math.PI * phase);
          const winSquared = win * win;

          // Read index
          const tapPos = (this.writePos - offset + this.bufferSize) % this.bufferSize;
          
          // Linear interpolation for smooth pitch resample
          const tapInt = Math.floor(tapPos);
          const tapFrac = tapPos - tapInt;
          const val = (1 - tapFrac) * this.buffer[tapInt] + tapFrac * this.buffer[(tapInt + 1) % this.bufferSize];

          outSample += val * winSquared;
          sumWindow += winSquared;

          // Shift phase position based on pitch ratio
          const step = 1.0 - pitch;
          this.grainOffsets[g] = (this.grainOffsets[g] + step + this.grainSize) % this.grainSize;
        }

        // Avoid division by zero, normalize to prevent tremolo
        outputChannel[i] = sumWindow > 0.001 ? outSample / sumWindow : outSample;
        this.writePos = (this.writePos + 1) % this.bufferSize;
      }

      for (let c = 1; c < output.length; c++) {
        if (output[c]) {
          output[c].set(outputChannel);
        }
      }

      return true;
    }
  }

  registerProcessor('pitch-shifter-processor', PitchShifterProcessor);
  `;

  const blob = new Blob([workletCode], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    await state.voiceContext.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toggleVoiceChanger() {
  if (!state.localStream || !state.peerConnection) return;
  const audioTrack = state.localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  // Save original mic track reference for reliable restore
  if (!state.originalAudioTrack) {
    state.originalAudioTrack = audioTrack;
  }

  const sender = state.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
  if (!sender) return;

  state.voiceChangerActive = !state.voiceChangerActive;

  if (state.voiceChangerActive) {
    try {
      dom.callVoiceChangeBtn.disabled = true;
      dom.callVoiceChangeBtn.title = "Initializing Voice Changer...";

      await initVoiceChanger();

      if (state.voiceContext.state === 'suspended') {
        await state.voiceContext.resume();
      }

      const micStream = new MediaStream([audioTrack]);
      const sourceNode = state.voiceContext.createMediaStreamSource(micStream);

      const hpFilter = state.voiceContext.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.setValueAtTime(170, state.voiceContext.currentTime);
      hpFilter.Q.setValueAtTime(1.0, state.voiceContext.currentTime);

      const bodyFilter = state.voiceContext.createBiquadFilter();
      bodyFilter.type = 'peaking';
      bodyFilter.frequency.setValueAtTime(260, state.voiceContext.currentTime);
      bodyFilter.Q.setValueAtTime(1.2, state.voiceContext.currentTime);
      bodyFilter.gain.setValueAtTime(4.0, state.voiceContext.currentTime);

      const nasalCutFilter = state.voiceContext.createBiquadFilter();
      nasalCutFilter.type = 'peaking';
      nasalCutFilter.frequency.setValueAtTime(680, state.voiceContext.currentTime);
      nasalCutFilter.Q.setValueAtTime(1.5, state.voiceContext.currentTime);
      nasalCutFilter.gain.setValueAtTime(-6.0, state.voiceContext.currentTime);

      const pitchNode = new AudioWorkletNode(state.voiceContext, 'pitch-shifter-processor');
      const pitchParam = pitchNode.parameters.get('pitch');
      if (pitchParam) {
        pitchParam.setValueAtTime(1.42, state.voiceContext.currentTime); // Sweet young female ratio (around 1.42 - 1.45)
      }

      const presenceFilter = state.voiceContext.createBiquadFilter();
      presenceFilter.type = 'peaking';
      presenceFilter.frequency.setValueAtTime(1300, state.voiceContext.currentTime);
      presenceFilter.Q.setValueAtTime(1.0, state.voiceContext.currentTime);
      presenceFilter.gain.setValueAtTime(3.0, state.voiceContext.currentTime);

      const sparkleFilter = state.voiceContext.createBiquadFilter();
      sparkleFilter.type = 'peaking';
      sparkleFilter.frequency.setValueAtTime(3600, state.voiceContext.currentTime);
      sparkleFilter.Q.setValueAtTime(1.5, state.voiceContext.currentTime);
      sparkleFilter.gain.setValueAtTime(6.0, state.voiceContext.currentTime);

      const airFilter = state.voiceContext.createBiquadFilter();
      airFilter.type = 'highshelf';
      airFilter.frequency.setValueAtTime(7000, state.voiceContext.currentTime);
      airFilter.gain.setValueAtTime(2.0, state.voiceContext.currentTime);

      state.voiceDest = state.voiceContext.createMediaStreamDestination();

      sourceNode.connect(hpFilter);
      hpFilter.connect(bodyFilter);
      bodyFilter.connect(nasalCutFilter);
      nasalCutFilter.connect(pitchNode);
      pitchNode.connect(presenceFilter);
      presenceFilter.connect(sparkleFilter);
      sparkleFilter.connect(airFilter);
      airFilter.connect(state.voiceDest);

      const processedTrack = state.voiceDest.stream.getAudioTracks()[0];
      await sender.replaceTrack(processedTrack);

      state.voiceNodes = {
        sourceNode,
        hpFilter,
        bodyFilter,
        nasalCutFilter,
        pitchNode,
        presenceFilter,
        sparkleFilter,
        airFilter
      };

      dom.callVoiceChangeBtn.classList.add('active');
      dom.callVoiceChangeBtn.title = "Voice Changer Active (Female)";
      addCallSystemNotice("✨ Female voice filter enabled", false);
    } catch (err) {
      console.error("Failed to start voice changer:", err);
      state.voiceChangerActive = false;
      dom.callVoiceChangeBtn.classList.remove('active');
      dom.callVoiceChangeBtn.title = "Toggle Voice Changer (Female)";
      addCallSystemNotice("⚠️ Voice changer activation failed", true);
    } finally {
      dom.callVoiceChangeBtn.disabled = false;
    }
  } else {
    try {
      // Restore original mic track (not the currently toggled muted state)
      const restoreTrack = state.originalAudioTrack || state.localStream.getAudioTracks()[0];
      await sender.replaceTrack(restoreTrack);
      state.originalAudioTrack = null;

      if (state.voiceNodes) {
        Object.values(state.voiceNodes).forEach(node => {
          try { node.disconnect(); } catch (e) {}
        });
        state.voiceNodes = null;
      }

      if (state.voiceContext && state.voiceContext.state !== 'closed') {
        await state.voiceContext.suspend();
      }

      dom.callVoiceChangeBtn.classList.remove('active');
      dom.callVoiceChangeBtn.title = "Toggle Voice Changer (Female)";
      addCallSystemNotice("✨ Voice changer disabled", false);
    } catch (err) {
      console.error("Failed to stop voice changer:", err);
    }
  }
}

function resetCallUI() {
  stopRingtone();
  stopCallTimer();

  // Stop all proximity detection (sensor + gyroscope + wake lock)
  stopProximitySensor();

  state.isCaller = false;
  state.voiceChangerActive = false;
  state.originalAudioTrack = null;
  state.voiceNodes = null;
  if (state.voiceContext) {
    if (state.voiceContext.state !== 'closed') {
      state.voiceContext.close().catch(() => {});
    }
    state.voiceContext = null;
    state.voiceDest = null;
  }
  if (dom.callVoiceChangeBtn) {
    dom.callVoiceChangeBtn.classList.remove('active');
    dom.callVoiceChangeBtn.classList.add('hidden');
    dom.callVoiceChangeBtn.title = "Toggle Voice Changer (Female)";
  }
  
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
  state.pendingCandidates = [];
  
  // Reset speaker defaults (Default both to earpiece)
  state.speakerMode = 'earpiece';
  if (dom.callSpeakerBtn) {
    dom.callSpeakerBtn.classList.remove('active');
    dom.callSpeakerBtn.title = 'Switch to Loudspeaker';
  }
  
  dom.callOverlay.classList.remove('minimized');
  dom.callOverlay.classList.remove('touched');
  dom.callOverlay.classList.remove('video-active');
  dom.callOverlay.classList.add('hidden');
  
  // Clear drag & resize inline styles
  dom.callOverlay.style.width = '';
  dom.callOverlay.style.height = '';
  dom.callOverlay.style.top = '';
  dom.callOverlay.style.left = '';
  dom.callOverlay.style.bottom = '';
  dom.callOverlay.style.right = '';
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
      
      const isOffline = !state.ws || state.ws.readyState !== WebSocket.OPEN;
      const payload = {
        type: 'encrypted-message',
        iv,
        ciphertext,
        messageId,
        file: true,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      };

      if (isOffline) {
        if (!state.pendingSendQueue) state.pendingSendQueue = [];
        state.pendingSendQueue.push(payload);
      } else {
        send(payload);
      }

      // Show locally
      appendMessage({
        text: dataUrl,
        isSent: true,
        timestamp: Date.now(),
        messageId,
        file: true,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        isSending: isOffline
      });
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('File encryption failed:', err);
    addSystemNotice('⚠️ File encryption failed.');
  }
}

function detectInAppBrowser() {
  const ua = navigator.userAgent || navigator.vendor || '';
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
  document.addEventListener('click', primeAudioContext, { passive: true });
  document.addEventListener('touchstart', primeAudioContext, { passive: true });

  dom.usernameInput.focus();
  
  // Attempt to restore persistent session across refreshes/background discards
  restoreSavedSession();
}

// ═══════════════════════════════════════════
// PERSISTENT SESSION MANAGEMENT
// ═══════════════════════════════════════════
function saveSessionToStorage() {
  if (state.roomCode) {
    sessionStorage.setItem('cryptchat_room_code', state.roomCode);
    sessionStorage.setItem('cryptchat_user_id', state.userId);
    sessionStorage.setItem('cryptchat_username', state.username);
    // Plaintext secrets NEVER written to sessionStorage to prevent XSS readout (Bug #6)
  }
}

async function restoreSavedSession() {
  const savedRoomCode = sessionStorage.getItem('cryptchat_room_code');
  const savedUserId = sessionStorage.getItem('cryptchat_user_id');
  const savedUsername = sessionStorage.getItem('cryptchat_username');
  const savedSecretPhrase = sessionStorage.getItem('cryptchat_secret_phrase');
  const savedCombinedKey = sessionStorage.getItem('cryptchat_combined_key');

  if (savedRoomCode && savedUsername) {
    console.log('Restoring saved session for room:', savedRoomCode);
    state.roomCode = savedRoomCode;
    state.userId = savedUserId;
    state.username = savedUsername;
    
    // Fill the UI fields
    dom.usernameInput.value = savedUsername;
    if (savedSecretPhrase) {
      dom.secretPhraseInput.value = savedSecretPhrase;
      state.secretPhrase = savedSecretPhrase;
    }
    if (savedCombinedKey) {
      const boxes = document.querySelectorAll('.key-box');
      boxes.forEach((box, idx) => {
        if (box) box.value = savedCombinedKey[idx] || '';
      });
      state.combinedKey = savedCombinedKey;
    }

    try {
      // Show reconnecting states
      if (savedRoomCode.startsWith('P')) {
        dom.personalConnectBtn.disabled = true;
        dom.personalConnectBtn.textContent = 'Restoring...';
      } else {
        dom.joinRoomBtn.disabled = true;
        dom.joinRoomBtn.textContent = 'Restoring...';
      }

      await connectWebSocket();
      
      // Send rejoin message to resume session
      send({
        type: 'join-room',
        roomCode: savedRoomCode,
        username: savedUsername,
        userId: savedUserId,
        combinedKey: state.combinedKey
      });
    } catch (err) {
      console.error('Session restoration WebSocket connection failed:', err);
      // Reset buttons
      dom.personalConnectBtn.disabled = false;
      dom.personalConnectBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> Connect Privately`;
      dom.joinRoomBtn.disabled = false;
      dom.joinRoomBtn.innerHTML = `Join Private Room`;
    }
  }
}

init();
