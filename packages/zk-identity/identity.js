/**
 * 1.nce :: core/identity.js
 *
 * ONE identity. ONE login. Control everything.
 *
 * A 1.nce identity is:
 *   - A cryptographic keypair (your master key)
 *   - Biometrically bound (face, fingerprint, or device)
 *   - Connected to every account you own (bank, DMV, insurance, etc.)
 *   - Zero-knowledge: proves WHO you are without leaking everything about you
 *
 * What you control from one login:
 *   SECURITY    → All your devices, sessions, access grants
 *   FINANCE     → Bank accounts, crypto wallets, investments
 *   GOVERNMENT  → Driver's license, vehicle registration, tax records
 *   HEALTHCARE  → Insurance, prescriptions, medical records
 *   COMMERCE    → Car buying, real estate, contracts
 *   IDENTITY    → Passports, SSN lookups, background checks
 *
 * Privacy model:
 *   When a car dealer needs to know you can afford a car:
 *     Old way: submit bank statements, SSN, credit report
 *     1.nce way: prove "income ≥ $X" without revealing the number
 *   When a bar needs to verify your age:
 *     Old way: hand over your license (they see name, address, DOB)
 *     1.nce way: prove "age ≥ 21" — nothing else revealed
 */

const crypto  = require('crypto');
const { ed25519 } = require('@noble/curves/ed25519.js');
const { sha256 }  = require('@noble/hashes/sha2.js');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────
// IDENTITY TIERS
// ─────────────────────────────────────────────
const VerificationLevel = {
  SELF:        0,   // self-attested (email/phone only)
  BASIC:       1,   // government ID scan
  VERIFIED:    2,   // government ID + biometric match
  FULL:        3,   // verified + in-person + financial
};

// ─────────────────────────────────────────────
// CREDENTIAL TYPES (what 1.nce can prove about you)
// ─────────────────────────────────────────────
const CredentialType = {
  // Identity
  LEGAL_NAME:       'legal_name',
  DATE_OF_BIRTH:    'date_of_birth',
  AGE_OVER_18:      'age_over_18',
  AGE_OVER_21:      'age_over_21',
  CITIZEN:          'citizen',
  RESIDENT:         'resident',

  // Financial
  INCOME_RANGE:     'income_range',        // prove income bracket, not exact
  CREDIT_SCORE:     'credit_score',        // prove score >= X, not the number
  ACCOUNT_BALANCE:  'account_balance',     // prove balance >= X
  DEBT_FREE:        'debt_free',
  EMPLOYED:         'employed',
  ACCREDITED_INV:   'accredited_investor',

  // Government
  DRIVERS_LICENSE:  'drivers_license',
  LICENSE_VALID:    'license_valid',
  VEHICLE_OWNER:    'vehicle_owner',
  INSURANCE_ACTIVE: 'insurance_active',
  TAX_COMPLIANT:    'tax_compliant',
  NO_WARRANTS:      'no_warrants',

  // Healthcare
  INSURED:          'insured',
  VACCINATION:      'vaccination',

  // Commerce
  HOMEOWNER:        'homeowner',
  SIGNATURE_AUTH:   'signature_authority',
};

// ─────────────────────────────────────────────
// 1.nce CREDENTIAL
// A verified fact about you — disclosed selectively
// ─────────────────────────────────────────────
class OnceCredential {
  constructor({ type, value, issuer, expiresAt, metadata = {} }) {
    this.id        = uuidv4();
    this.type      = type;
    this.value     = value;          // PRIVATE — never leaves your device
    this.issuer    = issuer;         // who verified this
    this.issuedAt  = Date.now();
    this.expiresAt = expiresAt ?? this.issuedAt + 365 * 24 * 3600 * 1000;
    this.metadata  = metadata;

    // Commitment: a fingerprint of this credential that can be shared publicly
    // Without revealing the value
    this.commitment = this._commit();
  }

  _commit() {
    const data = `${this.type}:${JSON.stringify(this.value)}:${this.issuer}:${this.issuedAt}`;
    return Buffer.from(sha256(new TextEncoder().encode(data))).toString('hex');
  }

  isValid() { return !this.revoked && Date.now() < this.expiresAt; }

  // Prove this credential satisfies a condition WITHOUT revealing the value
  prove(condition) {
    if (!this.isValid()) return { success: false, reason: 'CREDENTIAL_INVALID' };

    let satisfied = false;
    switch (condition.op) {
      case 'eq':  satisfied = this.value === condition.value; break;
      case 'gte': satisfied = this.value >= condition.value; break;
      case 'lte': satisfied = this.value <= condition.value; break;
      case 'gt':  satisfied = this.value > condition.value; break;
      case 'lt':  satisfied = this.value < condition.value; break;
      case 'in':  satisfied = condition.values?.includes(this.value); break;
      case 'bool':satisfied = Boolean(this.value) === condition.value; break;
      default:    satisfied = false;
    }

    if (!satisfied) return { success: false, reason: 'CONDITION_NOT_MET' };

    // Generate a ZK-style proof (commitment + nullifier — value NOT revealed)
    const nullifier = Buffer.from(sha256(
      new TextEncoder().encode(`${this.commitment}:${condition.context ?? 'default'}`)
    )).toString('hex');

    return {
      success:    true,
      type:       this.type,
      condition,
      nullifier,          // prevents reuse
      commitment: this.commitment,
      issuer:     this.issuer,
      expiresAt:  this.expiresAt,
      // The verifier sees ONLY: credential type, condition met, issuer, expiry
      // NOT: the actual value
    };
  }

  // Reveal (explicit — user consciously discloses full value)
  reveal(reason) {
    return {
      type:       this.type,
      value:      this.value,
      issuer:     this.issuer,
      issuedAt:   new Date(this.issuedAt).toISOString(),
      expiresAt:  new Date(this.expiresAt).toISOString(),
      revealedFor: reason,
    };
  }
}

// ─────────────────────────────────────────────
// 1.nce IDENTITY
// Your master identity — one object, everything inside
// ─────────────────────────────────────────────
class OnceIdentity {
  constructor({ name, email, phone, masterKey } = {}) {
    // Cryptographic identity
    this.masterKey    = masterKey ?? crypto.randomBytes(32);
    this.publicKey    = ed25519.getPublicKey(this.masterKey);
    this.pubKeyHex    = Buffer.from(this.publicKey).toString('hex');
    this.did          = `did:once:${this.pubKeyHex.slice(0, 32)}`;

    // Human identity (stored locally, never transmitted without consent)
    this.profile      = { name, email, phone };
    this.createdAt    = Date.now();
    this.id           = uuidv4();

    // Credential store (ALL your verified facts)
    this.credentials  = new Map();   // type → OnceCredential

    // Connected accounts
    this.connections  = new Map();   // serviceId → ConnectionRecord

    // Active sessions
    this.sessions     = new Map();   // sessionId → SessionRecord

    // Access log
    this.accessLog    = [];          // what was accessed, when, by whom

    // Verification level
    this.verificationLevel = VerificationLevel.SELF;

    // Biometric binding
    this.biometricBound = false;
    this.biometricHash  = null;
  }

  // ── BIND BIOMETRIC ────────────────────────
  bindBiometric(biometricData) {
    // In production: AuraMe face hash or device fingerprint
    // biometricData is NEVER stored — only a hash of it
    const hash = Buffer.from(sha256(
      new TextEncoder().encode(JSON.stringify(biometricData))
    )).toString('hex');

    this.biometricHash  = hash;
    this.biometricBound = true;

    return { bound: true, hash: hash.slice(0, 16) + '...' };
  }

  // ── ADD CREDENTIAL ────────────────────────
  addCredential(credential) {
    if (!credential.isValid()) return { success: false, reason: 'INVALID_CREDENTIAL' };
    this.credentials.set(credential.type, credential);
    return { success: true, type: credential.type };
  }

  has(credentialType)   { return this.credentials.get(credentialType)?.isValid() ?? false; }
  get(credentialType)   { return this.credentials.get(credentialType) ?? null; }

  // ── PROVE A CLAIM ─────────────────────────
  prove(credentialType, condition) {
    const cred = this.credentials.get(credentialType);
    if (!cred) return { success: false, reason: `No credential: ${credentialType}` };
    return cred.prove(condition);
  }

  // ── SIGN ──────────────────────────────────
  sign(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const sig   = ed25519.sign(bytes, this.masterKey);
    return Buffer.from(sig).toString('hex');
  }

  verify(data, signature, pubKey) {
    try {
      const bytes  = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const sigBuf = Buffer.from(signature, 'hex');
      const pkBuf  = Buffer.from(pubKey ?? this.pubKeyHex, 'hex');
      return ed25519.verify(sigBuf, bytes, pkBuf);
    } catch { return false; }
  }

  // ── CONNECT A SERVICE ─────────────────────
  connect({ serviceId, serviceName, grantedScopes, expiresIn }) {
    const connection = {
      id:           uuidv4(),
      serviceId,
      serviceName,
      grantedScopes,           // exactly which credentials this service can access
      connectedAt:  Date.now(),
      expiresAt:    Date.now() + (expiresIn ?? 365 * 24 * 3600 * 1000),
      accessCount:  0,
      lastAccess:   null,
      active:       true,
    };
    this.connections.set(serviceId, connection);
    return connection;
  }

  // ── REVOKE A SERVICE ─────────────────────
  revoke(serviceId) {
    const conn = this.connections.get(serviceId);
    if (!conn) return { success: false, reason: 'NOT_CONNECTED' };
    conn.active = false;
    conn.revokedAt = Date.now();
    return { success: true, serviceId, revokedAt: conn.revokedAt };
  }

  // ── SUMMARY ───────────────────────────────
  summary() {
    return {
      did:              this.did,
      name:             this.profile.name,
      verificationLevel: this.verificationLevel,
      biometricBound:   this.biometricBound,
      credentials:      [...this.credentials.keys()],
      connections:      this.connections.size,
      activeSessions:   this.sessions.size,
    };
  }
}

// ─────────────────────────────────────────────
// IDENTITY REGISTRY (global directory)
// Maps DIDs to public keys — no personal data
// ─────────────────────────────────────────────
class IdentityRegistry {
  constructor() {
    this.records  = new Map();  // did → { pubKey, createdAt, verificationLevel }
    this.nullifiers = new Set();
  }

  register(identity) {
    this.records.set(identity.did, {
      did:               identity.did,
      pubKey:            identity.pubKeyHex,
      createdAt:         identity.createdAt,
      verificationLevel: identity.verificationLevel,
    });
    return { registered: true, did: identity.did };
  }

  lookup(did) { return this.records.get(did) ?? null; }

  verifyProof(proof) {
    if (!proof.nullifier || !proof.commitment) return false;
    if (this.nullifiers.has(proof.nullifier)) return false;
    this.nullifiers.add(proof.nullifier);
    return proof.success === true;
  }

  stats() {
    return {
      identities: this.records.size,
      usedNulls:  this.nullifiers.size,
    };
  }
}

module.exports = { OnceIdentity, OnceCredential, IdentityRegistry, CredentialType, VerificationLevel };
