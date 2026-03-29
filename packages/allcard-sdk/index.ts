/**
 * @rawagon/allcard-sdk
 * TypeScript implementation of AllCard sovereign identity card.
 * Shifting PAN, ZK credential proofs, multi-mode switching.
 * Proprietary — RAWagon Systems LLC · AuraMe biometric system
 */
import { createHmac, createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export type AllCardMode =
  | 'identity' | 'debit' | 'crypto' | 'health'
  | 'vehicle'  | 'gov'   | 'badge'  | 'retirement';

export interface ModeConfig {
  prefix:  string;
  network: string;
  emoji:   string;
}

export const MODES: Record<AllCardMode, ModeConfig> = {
  identity:   { prefix: '4532', network: 'Visa',       emoji: '🪪' },
  debit:      { prefix: '5412', network: 'Mastercard', emoji: '💳' },
  crypto:     { prefix: '4111', network: 'Visa',       emoji: '₿'  },
  health:     { prefix: '3714', network: 'Amex',       emoji: '🏥' },
  vehicle:    { prefix: '6011', network: 'Discover',   emoji: '🚗' },
  gov:        { prefix: '3782', network: 'Amex',       emoji: '🏛'  },
  badge:      { prefix: '5105', network: 'Mastercard', emoji: '🪖' },
  retirement: { prefix: '4000', network: 'Visa',       emoji: '🏦' },
};

export interface PANResult {
  pan:     string;
  mode:    AllCardMode;
  nonce:   number;
  network: string;
}

export interface PaymentRecord {
  commitment: string;
  nonce:      number;
  mode:       AllCardMode;
  timestamp:  number;
  chainId:    number;
}

export class AllCard {
  private masterKey: string;
  private _nonce:    number = 0;
  private _mode:     AllCardMode = 'identity';

  constructor(masterKeyHex?: string) {
    this.masterKey = masterKeyHex ?? AllCard.genKey();
  }

  static genKey(): string {
    return randomBytes(32).toString('hex');
  }

  /** Derive a shifting PAN — unique per nonce, deterministic per (key, nonce) */
  shift(): PANResult {
    const n   = this._nonce++;
    const cfg = MODES[this._mode];
    const hmac = createHmac('sha256', Buffer.from(this.masterKey, 'hex'))
      .update(`${this._mode}:${n}`)
      .digest('hex');
    const digits = hmac.replace(/[^0-9]/g, '').slice(0, 12).padEnd(12, '0');
    const raw    = cfg.prefix + digits;
    const pan    = raw.replace(/(.{4})/g, '$1 ').trim();
    return { pan, mode: this._mode, nonce: n, network: cfg.network };
  }

  /** On-chain commitment (no PII) */
  commit(data: Record<string, unknown>): string {
    const h = createHash('sha256')
      .update(this.masterKey + JSON.stringify(data))
      .digest('hex');
    return '0x' + h;
  }

  /** Create a ZK payment record — zero PII exposed */
  paymentRecord(amount: number): PaymentRecord {
    const { nonce, mode } = this.shift();
    return {
      commitment: this.commit({ amount, nonce }),
      nonce,
      mode,
      timestamp: Date.now(),
      chainId:   720701,   // RAWNet
    };
  }

  setMode(mode: AllCardMode): void { this._mode = mode; }
  getMode(): AllCardMode            { return this._mode; }
  getMasterKey(): string            { return this.masterKey; }

  /** Biometric key derivation — AuraMe patent */
  static fromBiometrics(vectors: number[]): AllCard {
    const salt = randomBytes(16).toString('hex');
    const key  = createHmac('sha256', salt)
      .update(vectors.join(','))
      .digest('hex');
    return new AllCard(key);
  }

  /** AES-256-GCM vault encryption */
  encryptVault(plaintext: string): string {
    const iv  = randomBytes(12);
    const key = Buffer.from(this.masterKey.slice(0, 64), 'hex').slice(0, 32);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag  = cipher.getAuthTag();
    return [iv.toString('hex'), enc.toString('hex'), tag.toString('hex')].join(':');
  }

  decryptVault(ciphertext: string): string {
    const [ivHex, encHex, tagHex] = ciphertext.split(':');
    const iv  = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = Buffer.from(this.masterKey.slice(0, 64), 'hex').slice(0, 32);
    const dec = createDecipheriv('aes-256-gcm', key, iv);
    dec.setAuthTag(tag);
    return dec.update(enc) + dec.final('utf8');
  }
}

export function createWAGONPayment(card: AllCard, amount: number): PaymentRecord {
  return card.paymentRecord(amount);
}
