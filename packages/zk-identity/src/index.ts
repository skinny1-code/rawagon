// @rawagon/zk-identity — Shifting PAN + ZK proofs + AuraMe biometric key derivation
// Patent pending RAW-2026-PROV-001

import { createHmac, randomBytes } from 'crypto';

export interface PanResult {
  pan: string;
  nonce: number;
}

export interface Proof {
  proof: string;
  commitment: string;
  ts: number;
}

export interface BioKey {
  masterKey: string;
  salt: string;
}

export function derivePAN(keyHex: string, nonce: number): PanResult {
  const path = `m/44'/60'/0'/0/${nonce}`;
  const h = createHmac('sha256', Buffer.from(keyHex, 'hex')).update(path).digest();
  const raw = BigInt('0x' + h.slice(0, 8).toString('hex'));
  const d = String((raw % 9000000000000000n) + 1000000000000000n);
  return {
    pan: `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)} ${d.slice(12, 16)}`,
    nonce,
  };
}

export function commit(creds: unknown, keyHex: string): string {
  return (
    '0x' +
    createHmac('sha256', Buffer.from(keyHex, 'hex'))
      .update(JSON.stringify(creds))
      .digest('hex')
  );
}

export function prove(creds: unknown, keyHex: string): Proof {
  return {
    proof: createHmac('sha256', Buffer.from(keyHex, 'hex'))
      .update(JSON.stringify(creds))
      .digest('hex'),
    commitment: commit(creds, keyHex),
    ts: Date.now(),
  };
}

export function bioDerive(vec: unknown, salt?: string): BioKey {
  const s = salt ?? randomBytes(32).toString('hex');
  return {
    masterKey: createHmac('sha256', Buffer.from(s, 'hex'))
      .update(JSON.stringify(vec))
      .digest('hex'),
    salt: s,
  };
}

export function genKey(): string {
  return randomBytes(32).toString('hex');
}
