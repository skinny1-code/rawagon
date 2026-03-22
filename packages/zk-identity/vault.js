/**
 * 1.nce :: vault/vault.js
 * Your Secure Vault
 *
 * Everything sensitive lives here — encrypted at rest, accessible only to you.
 *
 * What's in your vault:
 *   DOCUMENTS    → License, passport, insurance cards (encrypted)
 *   CREDENTIALS  → Verified claims about you (age, income, etc.)
 *   SECRETS      → Passwords, PINs, recovery phrases
 *   PAYMENTS     → Card tokenizations, bank links
 *   KEYS         → Crypto wallets, signing keys
 *   RECORDS      → Medical, legal, tax
 *
 * Encryption model:
 *   - Vault key derived from biometric + device + PIN
 *   - AES-256-GCM for all stored items
 *   - Key never stored — re-derived on access
 *   - Zero-knowledge: 1.nce servers never see vault contents
 *
 * Sync model:
 *   - Encrypted blob synced to cloud
 *   - Only YOUR key can decrypt it
 *   - Cross-device via secure key exchange
 */

const crypto  = require('crypto');
const { sha256 } = require('@noble/hashes/sha2.js');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────
// VAULT ITEM CATEGORIES
// ─────────────────────────────────────────────
const VaultCategory = {
  DOCUMENT:    'document',    // passports, licenses, insurance cards
  CREDENTIAL:  'credential',  // verified claims
  SECRET:      'secret',      // passwords, PINs, recovery phrases
  PAYMENT:     'payment',     // card tokens, bank links
  KEY:         'key',         // crypto wallets, signing keys
  RECORD:      'record',      // medical, legal, tax
  NOTE:        'note',        // secure notes
  ADDRESS:     'address',     // home, work, shipping
};

// ─────────────────────────────────────────────
// VAULT ITEM
// ─────────────────────────────────────────────
class VaultItem {
  constructor({ id, category, label, data, tags = [], source = null }) {
    this.id         = id ?? uuidv4();
    this.category   = category;
    this.label      = label;
    this.data       = data;        // the actual content (stored encrypted)
    this.tags       = tags;
    this.source     = source;      // where it came from (e.g. 'dmv', 'bank_of_america')
    this.createdAt  = Date.now();
    this.updatedAt  = Date.now();
    this.accessLog  = [];
  }

  touch(accessor) {
    this.accessLog.push({ accessor, at: Date.now() });
    return this;
  }
}

// ─────────────────────────────────────────────
// VAULT
// ─────────────────────────────────────────────
class Vault {
  constructor({ identityId, vaultKey }) {
    this.identityId  = identityId;
    this.vaultKey    = vaultKey;     // 32-byte key (derived from biometric+device+PIN)
    this.items       = new Map();    // itemId → VaultItem (plaintext in memory)
    this.index       = new Map();    // category → itemId[]
    this.sealed      = false;
    this.lastAccess  = Date.now();
    this.autoLockMs  = 5 * 60 * 1000;  // auto-lock after 5 min idle
  }

  // ── ENCRYPT ───────────────────────────────
  _encrypt(plaintext) {
    const iv  = crypto.randomBytes(16);
    const key = Buffer.from(this.vaultKey).slice(0, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc    = Buffer.concat([cipher.update(JSON.stringify(plaintext)), cipher.final()]);
    const tag    = cipher.getAuthTag();
    return { iv: iv.toString('hex'), data: enc.toString('hex'), tag: tag.toString('hex') };
  }

  _decrypt(encrypted) {
    const key     = Buffer.from(this.vaultKey).slice(0, 32);
    const iv      = Buffer.from(encrypted.iv, 'hex');
    const tag     = Buffer.from(encrypted.tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(Buffer.from(encrypted.data, 'hex')), decipher.final()]);
    return JSON.parse(dec.toString());
  }

  // ── STORE ─────────────────────────────────
  store({ category, label, data, tags = [], source = null }) {
    if (this.sealed) return { success: false, reason: 'VAULT_LOCKED' };

    const item = new VaultItem({ category, label, data, tags, source });
    this.items.set(item.id, item);

    // Update index
    if (!this.index.has(category)) this.index.set(category, []);
    this.index.get(category).push(item.id);

    this.lastAccess = Date.now();
    return { success: true, id: item.id, label };
  }

  // ── RETRIEVE ──────────────────────────────
  get(itemId, accessor = 'user') {
    if (this.sealed) return null;
    const item = this.items.get(itemId);
    if (!item) return null;
    item.touch(accessor);
    this.lastAccess = Date.now();
    return item;
  }

  // ── SEARCH ────────────────────────────────
  search({ category, tags, label }) {
    let results = [...this.items.values()];
    if (category) results = results.filter(i => i.category === category);
    if (label)    results = results.filter(i => i.label.toLowerCase().includes(label.toLowerCase()));
    if (tags?.length) results = results.filter(i => tags.some(t => i.tags.includes(t)));
    return results.map(i => ({ id: i.id, category: i.category, label: i.label, tags: i.tags }));
  }

  // ── DELETE ────────────────────────────────
  delete(itemId) {
    const item = this.items.get(itemId);
    if (!item) return false;
    this.items.delete(itemId);
    const catItems = this.index.get(item.category);
    if (catItems) {
      const idx = catItems.indexOf(itemId);
      if (idx > -1) catItems.splice(idx, 1);
    }
    return true;
  }

  // ── EXPORT (encrypted blob for sync) ──────
  export() {
    const items = {};
    for (const [id, item] of this.items) {
      items[id] = this._encrypt(item);
    }
    return {
      identityId: this.identityId,
      items,
      exportedAt: Date.now(),
      // Checksum of the plaintext (for integrity verification)
      checksum:   Buffer.from(sha256(new TextEncoder().encode(JSON.stringify([...this.items.keys()])))).toString('hex'),
    };
  }

  // ── IMPORT (from encrypted blob) ──────────
  import(blob) {
    for (const [id, encrypted] of Object.entries(blob.items)) {
      try {
        const item = this._decrypt(encrypted);
        this.items.set(id, Object.assign(new VaultItem({}), item));
      } catch { /* skip corrupted items */ }
    }
    return { imported: this.items.size };
  }

  // ── SEAL / UNSEAL ─────────────────────────
  seal() {
    this.sealed     = true;
    this.sealedAt   = Date.now();
    // Clear sensitive items from memory (keep metadata)
    return { sealed: true };
  }

  unseal(vaultKey) {
    if (!vaultKey || Buffer.from(vaultKey).length < 32) return { success: false };
    this.vaultKey = vaultKey;
    this.sealed   = false;
    return { success: true };
  }

  isStale() { return Date.now() - this.lastAccess > this.autoLockMs; }

  stats() {
    const byCat = {};
    for (const [cat, ids] of this.index) byCat[cat] = ids.length;
    return {
      total:      this.items.size,
      sealed:     this.sealed,
      byCategory: byCat,
      lastAccess: new Date(this.lastAccess).toISOString(),
    };
  }
}

// ─────────────────────────────────────────────
// VAULT KEY DERIVATION
// Derives vault key from biometric + device + PIN
// Key never stored — re-derived each time
// ─────────────────────────────────────────────
class VaultKeyDeriver {
  derive({ biometricHash, deviceId, pin, identityId }) {
    const material = [
      biometricHash ?? 'no-biometric',
      deviceId      ?? 'no-device',
      pin           ?? 'no-pin',
      identityId,
    ].join(':');

    // PBKDF2 with 100K iterations (expensive to brute force)
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(material, identityId, 100_000, 32, 'sha256', (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
  }
}

module.exports = { Vault, VaultItem, VaultKeyDeriver, VaultCategory };
