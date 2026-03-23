import { describe, it, expect } from 'vitest';
import { derivePAN, commit, prove, bioDerive, genKey } from '../src/index';

describe('genKey', () => {
  it('returns a 64-char hex string', () => {
    const key = genKey();
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  it('returns a different key each call', () => {
    expect(genKey()).not.toBe(genKey());
  });
});

describe('derivePAN', () => {
  const key = genKey();

  it('returns a 19-char formatted PAN', () => {
    const { pan, nonce } = derivePAN(key, 0);
    expect(pan).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
    expect(nonce).toBe(0);
  });

  it('produces different PANs for different nonces', () => {
    expect(derivePAN(key, 0).pan).not.toBe(derivePAN(key, 1).pan);
  });
});

describe('commit', () => {
  const key = genKey();

  it('returns a 0x-prefixed 64-char hex', () => {
    const c = commit({ id: 'user1' }, key);
    expect(c).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const creds = { id: 'user1', scope: 2 };
    expect(commit(creds, key)).toBe(commit(creds, key));
  });
});

describe('prove', () => {
  const key = genKey();
  const creds = { id: 'user1' };

  it('commitment matches commit()', () => {
    const { commitment } = prove(creds, key);
    expect(commitment).toBe(commit(creds, key));
  });

  it('includes a ts timestamp', () => {
    expect(prove(creds, key).ts).toBeGreaterThan(0);
  });
});

describe('bioDerive', () => {
  it('returns a masterKey and salt', () => {
    const { masterKey, salt } = bioDerive([0.1, 0.2, 0.3]);
    expect(masterKey).toHaveLength(64);
    expect(salt).toHaveLength(64);
  });

  it('uses provided salt deterministically', () => {
    const salt = genKey();
    const vec = [0.1, 0.9];
    expect(bioDerive(vec, salt).masterKey).toBe(bioDerive(vec, salt).masterKey);
  });
});
