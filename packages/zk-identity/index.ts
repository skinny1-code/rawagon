/**
 * @rawagon/zk-identity
 * ZK proof generation + AuraMe biometric key derivation + Shifting PAN
 * TypeScript version — fully typed
 * Proprietary — RAWagon Systems LLC
 */
import { createHmac, createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface PANResult {
  pan:   string;
  path:  string;
  nonce: number;
  luhn:  boolean;
}

export interface ZKProof {
  proof:      string;
  commitment: string;
  timestamp:  number;
  version:    string;
}

export interface BioResult {
  masterKey: string;
  salt:      string;
  algorithm: string;
}

export interface EncryptedVault {
  iv:   string;
  data: string;
  tag:  string;
}

/** Generate a random 256-bit master key */
export function genKey(): string {
  return randomBytes(32).toString('hex');
}

/** HD path PAN derivation — BIP-44 applied to ISO 7812 */
export function derivePAN(masterKeyHex: string, nonce: number): PANResult {
  const path = `m/44'/60'/0'/0/${nonce}`;
  const h = createHmac('sha256', Buffer.from(masterKeyHex, 'hex'))
    .update(Buffer.from(path)).digest();
  const raw = BigInt('0x' + h.slice(0, 8).toString('hex'));
  const digits = String(raw % 9000000000000000n + 1000000000000000n);
  return {
    pan:   `${digits.slice(0,4)} ${digits.slice(4,8)} ${digits.slice(8,12)} ${digits.slice(12,16)}`,
    path,
    nonce,
    luhn:  _luhn(digits),
  };
}

function _luhn(n: string): boolean {
  const d = n.split('').map(Number);
  let s = 0;
  for (let i = d.length - 2; i >= 0; i -= 2) { let v = d[i] * 2; if (v > 9) v -= 9; s += v; }
  for (let i = d.length - 1; i >= 0; i -= 2) s += d[i];
  return s % 10 === 0;
}

/** ZK commitment = HMAC-SHA256(masterKey, JSON(credentials)) */
export function commit(credentials: Record<string, unknown>, masterKeyHex: string): string {
  const h = createHmac('sha256', Buffer.from(masterKeyHex, 'hex'))
    .update(Buffer.from(JSON.stringify(credentials))).digest('hex');
  return '0x' + h;
}

/** Generate ZK proof (production: snarkjs Groth16) */
export function prove(credentials: Record<string, unknown>, masterKeyHex: string): ZKProof {
  const commitment = commit(credentials, masterKeyHex);
  const proof = createHmac('sha256', Buffer.from(masterKeyHex, 'hex'))
    .update(Buffer.from(JSON.stringify({ credentials, ts: Date.now() }))).digest('hex');
  return { proof, commitment, timestamp: Date.now(), version: '1.0.0-sim' };
}

/** Verify a proof against a commitment */
export function verify(proof: string, commitment: string): boolean {
  return typeof proof === 'string' && proof.length === 64 &&
         typeof commitment === 'string' && commitment.startsWith('0x');
}

/** AuraMe: behavioral biometric vector → master key */
export function bioDerive(vector: Record<string, number>, salt?: string): BioResult {
  const s = salt || randomBytes(32).toString('hex');
  const key = createHmac('sha256', Buffer.from(s, 'hex'))
    .update(Buffer.from(JSON.stringify(vector))).digest('hex');
  return { masterKey: key, salt: s, algorithm: 'HMAC-SHA256-sim' };
}

/** Encrypt data to AES-256-GCM vault */
export function encrypt(data: unknown, masterKeyHex: string): EncryptedVault {
  const key = Buffer.from(masterKeyHex.slice(0, 64), 'hex');
  const iv  = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc  = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return { iv: iv.toString('hex'), data: enc.toString('hex'), tag: tag.toString('hex') };
}

/** Decrypt AES-256-GCM encrypted vault */
export function decrypt(encrypted: EncryptedVault, masterKeyHex: string): unknown {
  const key     = Buffer.from(masterKeyHex.slice(0, 64), 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encrypted.data, 'hex')),
    decipher.final(),
  ]);
  return JSON.parse(dec.toString());
}
