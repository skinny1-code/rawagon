/**
 * @rawagon/zk-identity
 * ZK proof generation + AuraMe biometric key derivation + Shifting PAN
 * Patent pending: RAW-2026-PROV-001
 * Uses Node.js built-in crypto only — zero external dependencies
 */
'use strict';
const crypto = require('crypto');

/** HD path PAN derivation — BIP-44 applied to ISO 7812 card numbers */
function derivePAN(masterKeyHex, nonce) {
  const path = `m/44'/60'/0'/0/${nonce}`;
  const h = crypto.createHmac('sha256', Buffer.from(masterKeyHex, 'hex'))
    .update(Buffer.from(path)).digest();
  const raw = BigInt('0x' + h.slice(0, 8).toString('hex'));
  const digits = String(raw % 9000000000000000n + 1000000000000000n);
  return {
    pan: `${digits.slice(0,4)} ${digits.slice(4,8)} ${digits.slice(8,12)} ${digits.slice(12,16)}`,
    path, nonce,
    luhn: _luhn(digits),
  };
}

/** Luhn algorithm (ISO 7812 check digit) */
function _luhn(n) {
  const d = String(n).split('').map(Number);
  let s = 0;
  for (let i = d.length - 2; i >= 0; i -= 2) {
    let v = d[i] * 2; if (v > 9) v -= 9; s += v;
  }
  for (let i = d.length - 1; i >= 0; i -= 2) s += d[i];
  return s % 10 === 0;
}

/** ZK commitment = HMAC-SHA256(masterKey, JSON(credentials)) */
function commit(credentials, masterKeyHex) {
  const h = crypto.createHmac('sha256', Buffer.from(masterKeyHex, 'hex'))
    .update(Buffer.from(JSON.stringify(credentials))).digest('hex');
  return '0x' + h;
}

/** Simulate ZK proof (prod: snarkjs Groth16 with proving key) */
function prove(credentials, masterKeyHex) {
  const commitment = commit(credentials, masterKeyHex);
  const proof = crypto.createHmac('sha256', Buffer.from(masterKeyHex, 'hex'))
    .update(Buffer.from(JSON.stringify({ credentials, ts: Date.now() }))).digest('hex');
  return { proof, commitment, timestamp: Date.now(), version: '1.0.0-sim' };
}

/** Verify a proof against a commitment (stub — replace with on-chain ZKVerifier) */
function verify(proof, commitment) {
  return typeof proof === 'string' && proof.length === 64 &&
         typeof commitment === 'string' && commitment.startsWith('0x');
}

/** AuraMe: behavioral signals → master key */
function bioDerive(biometricVector, salt) {
  const s = salt || crypto.randomBytes(32).toString('hex');
  const key = crypto.createHmac('sha256', Buffer.from(s, 'hex'))
    .update(Buffer.from(JSON.stringify(biometricVector))).digest('hex');
  return { masterKey: key, salt: s, algorithm: 'HMAC-SHA256-sim' };
}

/** Generate a random 256-bit master key */
function genKey() {
  return crypto.randomBytes(32).toString('hex');
}

/** Encrypt data with AES-256-GCM using master key */
function encrypt(data, masterKeyHex) {
  const key = Buffer.from(masterKeyHex.slice(0, 64), 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('hex'), data: enc.toString('hex'), tag: tag.toString('hex') };
}

/** Decrypt AES-256-GCM encrypted data */
function decrypt(encrypted, masterKeyHex) {
  const key = Buffer.from(masterKeyHex.slice(0, 64), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm',
    key, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'hex')),
    decipher.final()
  ]);
  return JSON.parse(dec.toString());
}

module.exports = { derivePAN, commit, prove, verify, bioDerive, genKey, encrypt, decrypt };
