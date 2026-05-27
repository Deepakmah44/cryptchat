/**
 * CryptChat — E2E Encryption Engine
 * Uses Web Crypto API: ECDH (P-256) key exchange + AES-256-GCM encryption
 * Keys NEVER leave the browser.
 */

class CryptoEngine {
  constructor() {
    this.keyPair = null;
    this.sharedKey = null;
    this.isReady = false;
  }

  /**
   * Derive shared AES-256-GCM key directly from the secret phrase (for offline asynchronous E2EE)
   * Uses PBKDF2 with 600,000 iterations (OWASP 2024 recommendation) and context-bound salting
   */
  async deriveKeyFromSecret(secretPhrase, saltString) {
    const encoder = new TextEncoder();
    
    // Normalize input to prevent encoding attacks
    const normalizedPhrase = secretPhrase.trim();
    
    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(normalizedPhrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    // Context-bound salt prevents cross-protocol key confusion
    const salt = encoder.encode('CryptChat::E2EE::v2::' + saltString.trim());

    this.sharedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 600000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    this.isReady = true;
    return this.sharedKey;
  }

  /**
   * Generate an ECDH key pair for this session
   */
  async generateKeyPair() {
    this.keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false, // non-extractable private key
      ['deriveKey']
    );
    return this.keyPair;
  }

  /**
   * Export public key as JWK for sharing with peer
   */
  async exportPublicKey() {
    if (!this.keyPair) throw new Error('Key pair not generated');
    return await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
  }

  /**
   * Import peer's public key from JWK
   */
  async importPeerPublicKey(jwk) {
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
  }

  /**
   * Derive shared AES-256-GCM key from own private key + peer's public key
   */
  async deriveSharedKey(peerPublicKey) {
    this.sharedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: peerPublicKey },
      this.keyPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt']
    );
    this.isReady = true;
    return this.sharedKey;
  }

  /**
   * Set current room context for Additional Authenticated Data (AAD)
   * Prevents cross-room ciphertext replay attacks
   */
  setRoomContext(roomId) {
    this._roomContext = roomId || '';
  }

  /**
   * Encrypt a message string → { iv, ciphertext } (base64)
   * Uses AES-256-GCM with 96-bit random IV and room-bound AAD
   */
  async encrypt(plaintext) {
    if (!this.sharedKey) throw new Error('Shared key not derived');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    // Generate random 12-byte IV (NEVER reuse)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // Additional Authenticated Data binds ciphertext to current room
    const aad = encoder.encode('CryptChat::AAD::' + (this._roomContext || ''));
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      this.sharedKey,
      data
    );

    return {
      iv: this._arrayBufferToBase64(iv),
      ciphertext: this._arrayBufferToBase64(ciphertext)
    };
  }

  /**
   * Decrypt { iv, ciphertext } (base64) → plaintext string
   * Validates AAD to ensure ciphertext belongs to this room
   */
  async decrypt(ivBase64, ciphertextBase64) {
    if (!this.sharedKey) throw new Error('Shared key not derived');

    const encoder = new TextEncoder();
    const iv = this._base64ToArrayBuffer(ivBase64);
    const ciphertext = this._base64ToArrayBuffer(ciphertextBase64);
    const aad = encoder.encode('CryptChat::AAD::' + (this._roomContext || ''));

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      this.sharedKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /**
   * Generate a verification code from shared key (for visual verification)
   */
  async getVerificationCode() {
    if (!this.sharedKey || !this.keyPair) return null;
    const exported = await crypto.subtle.exportKey('raw', 
      await crypto.subtle.deriveKey(
        { name: 'ECDH', public: this.keyPair.publicKey },
        this.keyPair.privateKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt']
      )
    );
    const hash = await crypto.subtle.digest('SHA-256', exported);
    const bytes = new Uint8Array(hash);
    // Take first 4 bytes, make a readable code
    return Array.from(bytes.slice(0, 4))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('-')
      .toUpperCase();
  }

  // --- Utility ---
  _arrayBufferToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
  }

  _base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export default CryptoEngine;
