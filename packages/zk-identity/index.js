/**
 * @package @rawagon/zk-identity
 * ZK proof generation + AuraMe biometric key derivation
 * Patent pending: RAW-2026-PROV-001
 */

const { hmac } = require('@noble/hashes/hmac');
const { sha256 } = require('@noble/hashes/sha256');
const { bytesToHex, randomBytes } = require('@noble/hashes/utils');

// ─── ALLCARD SHIFTING PAN DERIVATION ──────────────────────────
// HD path: m/44'/60'/0'/0/n  (BIP-44, n = tx nonce)
// Returns: ISO 7812-compliant 16-digit PAN

function derivePAN(masterKeyHex, nonce) {
  const path = `m/44'/60'/0'/0/${nonce}`;
  const pathBytes = new TextEncoder().encode(path);
  const masterKey = hexToBytes(masterKeyHex);
  const derived = hmac(sha256, masterKey, pathBytes);
  // Take first 8 bytes → 16 hex digits → format as card number
  const raw = BigInt('0x' + bytesToHex(derived.slice(0, 8)));
  // Force into 16-digit range [1000000000000000, 9999999999999999]
  const digits = String(raw % 9000000000000000n + 1000000000000000n);
  const pan = `${digits.slice(0,4)} ${digits.slice(4,8)} ${digits.slice(8,12)} ${digits.slice(12,16)}`;
  return { pan, path, nonce };
}

// Luhn check digit (ISO 7812)
function luhnCheck(number) {
  const digits = number.replace(/\s/g, '').split('').map(Number);
  let sum = 0;
  for (let i = digits.length - 2; i >= 0; i -= 2) {
    let d = digits[i] * 2;
    if (d > 9) d -= 9;
    sum += d;
  }
  for (let i = digits.length - 1; i >= 0; i -= 2) sum += digits[i];
  return sum % 10 === 0;
}

// ─── ZK PROOF SIMULATION ───────────────────────────────────────
// In production: replace with @aztec/bb.js or snarkjs Groth16

function generateZKProof(credentialData, masterKeyHex) {
  const commitment = generateCommitment(credentialData, masterKeyHex);
  // Simulate proof — real impl uses Groth16 proving key
  const proofBytes = hmac(sha256, hexToBytes(masterKeyHex),
    new TextEncoder().encode(JSON.stringify(credentialData)));
  return {
    proof: bytesToHex(proofBytes),
    commitment,
    timestamp: Date.now(),
    version: '1.0.0-sim',
  };
}

function verifyAttributeProof(proof, commitment, attribute, expectedValue) {
  // Stub verifier — replace with on-chain ZKVerifier call in production
  return proof.commitment === commitment && proof.proof.length === 64;
}

// ─── CREDENTIAL COMMITMENT ────────────────────────────────────

function generateCommitment(credentialData, masterKeyHex) {
  const data = typeof credentialData === 'string'
    ? credentialData
    : JSON.stringify(credentialData);
  const key = hexToBytes(masterKeyHex);
  const msg = new TextEncoder().encode(data);
  return '0x' + bytesToHex(hmac(sha256, key, msg));
}

// ─── BIOMETRIC KEY DERIVATION (AuraMe) ───────────────────────
// In production: keystroke/voice/gait signals → feature vector → PBKDF2

function deriveKeyFromBiometric(biometricVector, salt = null) {
  const saltBytes = salt ? hexToBytes(salt) : randomBytes(32);
  const vectorBytes = new TextEncoder().encode(JSON.stringify(biometricVector));
  // Simulate PBKDF2 — real impl: crypto.subtle.deriveBits with 100000 iterations
  const derived = hmac(sha256, saltBytes, vectorBytes);
  return {
    masterKey: bytesToHex(derived),
    salt: bytesToHex(saltBytes),
    algorithm: 'PBKDF2-HMAC-SHA256-sim',
  };
}

// ─── HELPERS ──────────────────────────────────────────────────

function hexToBytes(hex) {
  const clean = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function generateMasterKey() {
  return bytesToHex(randomBytes(32));
}

module.exports = {
  derivePAN,
  luhnCheck,
  generateZKProof,
  verifyAttributeProof,
  generateCommitment,
  deriveKeyFromBiometric,
  generateMasterKey,
};
