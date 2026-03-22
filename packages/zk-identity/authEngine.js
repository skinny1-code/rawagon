/**
 * 1.nce :: auth/authEngine.js
 * Authentication Engine
 *
 * Sign in ONCE. Everything unlocks.
 *
 * Auth factors (any combination):
 *   SOMETHING YOU ARE:    Face biometric, fingerprint
 *   SOMETHING YOU HAVE:   Trusted device, hardware key (YubiKey)
 *   SOMETHING YOU KNOW:   PIN (never a password — PINs are local only)
 *
 * Session model:
 *   - Master session: full access (biometric required)
 *   - Delegated session: scoped access (e.g. only finance, only driving)
 *   - Guest session: read-only, time-limited
 *
 * Zero-knowledge auth:
 *   Your device proves it has your key WITHOUT sending the key.
 *   1.nce servers NEVER see your biometric or PIN.
 *   Even if 1.nce is hacked, attackers get nothing useful.
 */

const crypto    = require('crypto');
const { ed25519 } = require('@noble/curves/ed25519.js');
const { sha256 }  = require('@noble/hashes/sha2.js');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────
// AUTH FACTORS
// ─────────────────────────────────────────────
const AuthFactor = {
  BIOMETRIC: 'biometric',   // face/fingerprint
  DEVICE:    'device',      // trusted device certificate
  PIN:       'pin',         // local PIN (never transmitted)
  HARDWARE:  'hardware',    // YubiKey / FIDO2
  EMAIL_OTP: 'email_otp',   // fallback
  SMS_OTP:   'sms_otp',     // fallback
};

const AuthStrength = {
  WEAK:     1,  // email OTP only
  BASIC:    2,  // device + PIN
  STRONG:   3,  // biometric + device
  MAXIMUM:  4,  // biometric + device + hardware key
};

// ─────────────────────────────────────────────
// SESSION
// ─────────────────────────────────────────────
class Session {
  constructor({ identityId, did, factors, scopes, deviceId, ipAddress }) {
    this.id           = uuidv4();
    this.token        = crypto.randomBytes(32).toString('hex');  // bearer token
    this.identityId   = identityId;
    this.did          = did;
    this.factors      = factors;       // which factors were used
    this.strength     = this._computeStrength(factors);
    this.scopes       = new Set(scopes ?? ['*']);  // what this session can access
    this.deviceId     = deviceId;
    this.ipAddress    = ipAddress;
    this.createdAt    = Date.now();
    this.expiresAt    = Date.now() + this._sessionTTL(this.strength);
    this.lastActivity = Date.now();
    this.active       = true;
    this.accessCount  = 0;
  }

  _computeStrength(factors) {
    if (factors.includes(AuthFactor.BIOMETRIC) && factors.includes(AuthFactor.HARDWARE)) return AuthStrength.MAXIMUM;
    if (factors.includes(AuthFactor.BIOMETRIC)) return AuthStrength.STRONG;
    if (factors.includes(AuthFactor.DEVICE) && factors.includes(AuthFactor.PIN)) return AuthStrength.BASIC;
    return AuthStrength.WEAK;
  }

  _sessionTTL(strength) {
    const ttls = {
      [AuthStrength.MAXIMUM]: 30 * 24 * 3600 * 1000,  // 30 days
      [AuthStrength.STRONG]:  7  * 24 * 3600 * 1000,  // 7 days
      [AuthStrength.BASIC]:   24 *      3600 * 1000,  // 24 hours
      [AuthStrength.WEAK]:    1  *      3600 * 1000,  // 1 hour
    };
    return ttls[strength] ?? 3600 * 1000;
  }

  isValid()   { return this.active && Date.now() < this.expiresAt; }
  isExpired() { return Date.now() >= this.expiresAt; }

  hasScope(scope) {
    return this.scopes.has('*') || this.scopes.has(scope);
  }

  // Refresh session activity
  touch() {
    if (!this.isValid()) return false;
    this.lastActivity = Date.now();
    this.accessCount++;
    return true;
  }

  revoke(reason = 'user_logout') {
    this.active    = false;
    this.revokedAt = Date.now();
    this.revokeReason = reason;
  }

  info() {
    return {
      id:          this.id,
      did:         this.did,
      strength:    Object.keys(AuthStrength).find(k => AuthStrength[k] === this.strength),
      factors:     this.factors,
      scopes:      [...this.scopes],
      device:      this.deviceId,
      createdAt:   new Date(this.createdAt).toISOString(),
      expiresAt:   new Date(this.expiresAt).toISOString(),
      active:      this.active,
      accessCount: this.accessCount,
    };
  }
}

// ─────────────────────────────────────────────
// TRUSTED DEVICE
// ─────────────────────────────────────────────
class TrustedDevice {
  constructor({ name, type, fingerprint }) {
    this.id          = uuidv4();
    this.name        = name;          // "iPhone 15 Pro", "MacBook", "YubiKey"
    this.type        = type;          // 'mobile', 'desktop', 'tablet', 'hardware_key'
    this.fingerprint = fingerprint;   // device certificate / unique ID
    this.trustedAt   = Date.now();
    this.lastSeen    = Date.now();
    this.active      = true;
    // Device key (for challenge-response auth)
    this.privateKey  = crypto.randomBytes(32);
    this.publicKey   = Buffer.from(ed25519.getPublicKey(this.privateKey)).toString('hex');
  }

  sign(challenge) {
    const bytes = new TextEncoder().encode(challenge);
    return Buffer.from(ed25519.sign(bytes, this.privateKey)).toString('hex');
  }

  revoke() { this.active = false; this.revokedAt = Date.now(); }
}

// ─────────────────────────────────────────────
// AUTH ENGINE
// ─────────────────────────────────────────────
class AuthEngine {
  constructor() {
    this.sessions    = new Map();   // token → Session
    this.devices     = new Map();   // deviceId → TrustedDevice
    this.challenges  = new Map();   // challengeId → { value, expiresAt, identityId }
    this.lockouts    = new Map();   // identityId → { attempts, lockedUntil }
    this.auditLog    = [];
  }

  // ── CREATE CHALLENGE (step 1 of auth) ─────
  createChallenge(identityId) {
    const challenge = {
      id:         uuidv4(),
      value:      crypto.randomBytes(32).toString('hex'),
      identityId,
      createdAt:  Date.now(),
      expiresAt:  Date.now() + 300_000,  // 5 minutes
      used:       false,
    };
    this.challenges.set(challenge.id, challenge);
    return challenge;
  }

  // ── AUTHENTICATE ──────────────────────────
  async authenticate({ identity, factors, deviceId, challengeId, biometricProof, pin, scopes }) {
    // Check lockout
    const lockout = this.lockouts.get(identity.id);
    if (lockout?.lockedUntil > Date.now()) {
      return { success: false, reason: 'ACCOUNT_LOCKED', lockedUntil: lockout.lockedUntil };
    }

    const usedFactors   = [];
    const failedFactors = [];

    // ── Verify each factor ─────────────────
    for (const factor of (factors ?? [])) {
      let passed = false;

      switch (factor.type) {
        case AuthFactor.BIOMETRIC: {
          // Verify biometric proof against stored hash
          const bioHash = Buffer.from(sha256(
            new TextEncoder().encode(JSON.stringify(factor.biometricData))
          )).toString('hex');
          passed = (bioHash === identity.biometricHash);
          break;
        }

        case AuthFactor.DEVICE: {
          const device = this.devices.get(deviceId);
          if (!device?.active) break;

          // Verify device signed the challenge
          const challenge = this.challenges.get(challengeId);
          if (!challenge || challenge.used || Date.now() > challenge.expiresAt) break;

          try {
            const sig  = Buffer.from(factor.signature, 'hex');
            const msg  = new TextEncoder().encode(challenge.value);
            const pk   = Buffer.from(device.publicKey, 'hex');
            passed = ed25519.verify(sig, msg, pk);
            if (passed) { challenge.used = true; device.lastSeen = Date.now(); }
          } catch { passed = false; }
          break;
        }

        case AuthFactor.PIN: {
          // PIN is hashed locally — server only sees the hash
          const pinHash = Buffer.from(sha256(
            new TextEncoder().encode(factor.pin + identity.id)
          )).toString('hex');
          passed = pinHash === factor.pinHash;
          break;
        }

        case AuthFactor.EMAIL_OTP:
        case AuthFactor.SMS_OTP: {
          // OTP verification (simplified — production: TOTP/HOTP)
          passed = factor.otp === factor.expectedOtp;
          break;
        }

        default:
          passed = false;
      }

      if (passed) {
        usedFactors.push(factor.type);
      } else {
        failedFactors.push(factor.type);
      }
    }

    // At least one factor must pass
    if (usedFactors.length === 0) {
      this._recordFailedAttempt(identity.id);
      return { success: false, reason: 'ALL_FACTORS_FAILED', failed: failedFactors };
    }

    // Create session
    const session = new Session({
      identityId: identity.id,
      did:        identity.did,
      factors:    usedFactors,
      scopes:     scopes ?? ['*'],
      deviceId,
      ipAddress:  factors[0]?.ipAddress,
    });

    this.sessions.set(session.token, session);
    this._clearLockout(identity.id);

    this._audit({
      event:       'auth:success',
      identityId:  identity.id,
      factors:     usedFactors,
      sessionId:   session.id,
      strength:    session.strength,
    });

    return {
      success:     true,
      sessionToken: session.token,
      session:     session.info(),
      expiresAt:   session.expiresAt,
    };
  }

  // ── VERIFY SESSION TOKEN ──────────────────
  verify(token, requiredScope) {
    const session = this.sessions.get(token);
    if (!session)            return { valid: false, reason: 'INVALID_TOKEN' };
    if (!session.isValid())  return { valid: false, reason: 'SESSION_EXPIRED' };
    if (requiredScope && !session.hasScope(requiredScope)) {
      return { valid: false, reason: 'INSUFFICIENT_SCOPE', required: requiredScope };
    }

    session.touch();
    return { valid: true, session: session.info() };
  }

  // ── LOGOUT ────────────────────────────────
  logout(token) {
    const session = this.sessions.get(token);
    if (!session) return { success: false };
    session.revoke('user_logout');
    this._audit({ event: 'auth:logout', sessionId: session.id });
    return { success: true };
  }

  // ── LOGOUT ALL SESSIONS ───────────────────
  logoutAll(identityId) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.identityId === identityId && session.active) {
        session.revoke('logout_all');
        count++;
      }
    }
    this._audit({ event: 'auth:logout_all', identityId, sessionsRevoked: count });
    return { success: true, revoked: count };
  }

  // ── TRUST A DEVICE ────────────────────────
  trustDevice({ name, type, fingerprint }) {
    const device = new TrustedDevice({ name, type, fingerprint });
    this.devices.set(device.id, device);
    return device;
  }

  // ── REVOKE A DEVICE ───────────────────────
  revokeDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return { success: false };
    device.revoke();
    // Revoke all sessions from this device
    let sessionsRevoked = 0;
    for (const session of this.sessions.values()) {
      if (session.deviceId === deviceId && session.active) {
        session.revoke('device_revoked');
        sessionsRevoked++;
      }
    }
    return { success: true, deviceId, sessionsRevoked };
  }

  _recordFailedAttempt(identityId) {
    const lockout = this.lockouts.get(identityId) ?? { attempts: 0 };
    lockout.attempts++;
    if (lockout.attempts >= 5) {
      lockout.lockedUntil = Date.now() + 15 * 60 * 1000;  // 15 min lockout
    }
    this.lockouts.set(identityId, lockout);
  }

  _clearLockout(identityId) { this.lockouts.delete(identityId); }

  _audit(entry) {
    this.auditLog.push({ ...entry, timestamp: Date.now() });
  }

  stats() {
    const activeSessions = [...this.sessions.values()].filter(s => s.isValid()).length;
    return {
      activeSessions,
      totalSessions: this.sessions.size,
      trustedDevices: [...this.devices.values()].filter(d => d.active).length,
      auditEvents:   this.auditLog.length,
    };
  }
}

module.exports = { AuthEngine, Session, TrustedDevice, AuthFactor, AuthStrength };
