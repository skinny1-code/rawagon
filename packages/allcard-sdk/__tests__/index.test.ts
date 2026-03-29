import { describe, it, expect } from 'vitest';
import { AllCard, MODES, createWAGONPayment } from '../index';
import type { AllCardMode } from '../index';

describe('AllCard', () => {
  it('creates with random key', () => {
    const c = new AllCard();
    expect(c.getMasterKey()).toMatch(/^[0-9a-f]{64}$/);
  });
  it('two cards have different keys', () => {
    expect(new AllCard().getMasterKey()).not.toBe(new AllCard().getMasterKey());
  });
});

describe('shift()', () => {
  it('returns PAN in correct format', () => {
    expect(new AllCard().shift().pan).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
  });
  it('nonce advances each call', () => {
    const c = new AllCard();
    expect(c.shift().nonce).toBe(0);
    expect(c.shift().nonce).toBe(1);
    expect(c.shift().nonce).toBe(2);
  });
  it('10 consecutive shifts produce unique PANs', () => {
    const c   = new AllCard();
    const pans = Array.from({ length: 10 }, () => c.shift().pan);
    expect(new Set(pans).size).toBe(10);
  });
  it('mode prefix matches MODES config', () => {
    const c = new AllCard();
    c.setMode('debit');
    const { pan } = c.shift();
    expect(pan.replace(/\s/g, '').startsWith(MODES.debit.prefix)).toBe(true);
  });
});

describe('commit()', () => {
  it('returns 0x + 64 hex chars', () => {
    expect(new AllCard().commit({ a: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('is deterministic', () => {
    const c = new AllCard('a'.repeat(64));
    expect(c.commit({ x: 1 })).toBe(c.commit({ x: 1 }));
  });
  it('different data → different commitment', () => {
    const c = new AllCard();
    expect(c.commit({ x: 1 })).not.toBe(c.commit({ x: 2 }));
  });
});

describe('vault encryption', () => {
  it('encryptVault / decryptVault roundtrip', () => {
    const c = new AllCard();
    const secret = 'SSN:123-45-6789';
    expect(c.decryptVault(c.encryptVault(secret))).toBe(secret);
  });
  it('decryption with wrong key throws', () => {
    const c1 = new AllCard();
    const c2 = new AllCard();
    expect(() => c2.decryptVault(c1.encryptVault('test'))).toThrow();
  });
});

describe('fromBiometrics()', () => {
  it('creates an AllCard from behavioral vectors', () => {
    const c = AllCard.fromBiometrics([1.2, 0.8, 1.5, 0.9, 1.1]);
    expect(c.getMasterKey()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('paymentRecord()', () => {
  it('contains no raw PII', () => {
    const rec = new AllCard().paymentRecord(42.50);
    const str = JSON.stringify(rec);
    expect(str).not.toContain('name');
    expect(str).not.toContain('email');
    expect(str).not.toContain('ssn');
  });
  it('has commitment field', () => {
    expect(new AllCard().paymentRecord(10)).toHaveProperty('commitment');
  });
  it('chainId is RAWNet (720701)', () => {
    expect(new AllCard().paymentRecord(1).chainId).toBe(720701);
  });
});

describe('MODES', () => {
  it('8 modes defined', () => {
    expect(Object.keys(MODES).length).toBe(8);
  });
  it('all modes have prefix, network, emoji', () => {
    Object.values(MODES).forEach(m => {
      expect(m.prefix).toBeTruthy();
      expect(m.network).toBeTruthy();
      expect(m.emoji).toBeTruthy();
    });
  });
});

describe('createWAGONPayment()', () => {
  it('creates valid payment record on RAWNet', () => {
    const c   = new AllCard();
    const rec = createWAGONPayment(c, 99.99);
    expect(rec.chainId).toBe(720701);
    expect(rec.commitment).toMatch(/^0x/);
  });
});
