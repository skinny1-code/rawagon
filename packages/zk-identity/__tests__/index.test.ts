/**
 * ZK Identity — Vitest TypeScript test suite
 * Matches what the device is already running (10 tests passing)
 * + extended coverage for AuraMe biometric system
 */
import { describe, it, expect } from 'vitest';
import { genKey, derivePAN, commit, prove, verify, bioDerive, encrypt, decrypt } from '../index';

describe('genKey', () => {
  it('returns a 64-char hex string', () => {
    const k = genKey();
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
  it('returns a different key each call', () => {
    expect(genKey()).not.toBe(genKey());
  });
});

describe('derivePAN', () => {
  it('returns a 19-char formatted PAN', () => {
    expect(derivePAN(genKey(), 0).pan).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
  });
  it('produces different PANs for different nonces', () => {
    const k = genKey();
    expect(derivePAN(k, 0).pan).not.toBe(derivePAN(k, 1).pan);
  });
});

describe('commit', () => {
  it('returns a 0x-prefixed 64-char hex', () => {
    expect(commit({ a: 1 }, genKey())).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it('is deterministic', () => {
    const k = genKey();
    expect(commit({ a: 1 }, k)).toBe(commit({ a: 1 }, k));
  });
});

describe('prove', () => {
  it('commitment matches commit()', () => {
    const k = genKey();
    const d = { x: 42 };
    expect(prove(d, k).commitment).toBe(commit(d, k));
  });
  it('includes a ts timestamp', () => {
    expect(prove({ x: 1 }, genKey()).timestamp).toBeGreaterThan(0);
  });
});

describe('bioDerive', () => {
  it('returns a masterKey and salt', () => {
    const { masterKey, salt } = bioDerive([1.2, 0.8, 1.5, 0.3, 0.9]);
    expect(masterKey).toMatch(/^[0-9a-f]{64}$/);
    expect(salt.length).toBeGreaterThan(0);
  });
  it('uses provided salt deterministically', () => {
    const v = [1.0, 2.0, 3.0, 4.0, 5.0];
    const salt = 'abc123';
    expect(bioDerive(v, salt).masterKey).toBe(bioDerive(v, salt).masterKey);
  });
});

describe('encrypt / decrypt', () => {
  it('roundtrip works', () => {
    const k = genKey();
    const plain = 'my secret vault data';
    expect(decrypt(encrypt(plain, k), k)).toBe(plain);
  });
  it('decryption fails with wrong key', () => {
    const k1 = genKey(), k2 = genKey();
    expect(() => decrypt(encrypt('test', k1), k2)).toThrow();
  });
});

// Extended: AuraMe 5-vector biometric
describe('AuraMe biometric key derivation', () => {
  it('5-vector produce unique keys', () => {
    const keys = [
      bioDerive([1.0, 2.0, 3.0, 4.0, 5.0]).masterKey,
      bioDerive([1.1, 2.0, 3.0, 4.0, 5.0]).masterKey,
    ];
    expect(keys[0]).not.toBe(keys[1]);
  });
  it('same vectors + same salt = same key (patent claim)', () => {
    const v = [0.9, 1.1, 0.7, 1.3, 0.8];
    const s = 'rawagon-salt-2026';
    const k1 = bioDerive(v, s).masterKey;
    const k2 = bioDerive(v, s).masterKey;
    expect(k1).toBe(k2);
  });
  it('key is valid for AllCard use (64 hex chars)', () => {
    const { masterKey } = bioDerive([1, 2, 3, 4, 5]);
    expect(masterKey).toMatch(/^[0-9a-f]{64}$/);
  });
});
