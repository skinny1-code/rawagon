const { derivePAN, commit, prove, bioDerive, genKey } = require('../index');

describe('zk-identity', () => {
  describe('genKey()', () => {
    it('returns a 64-char hex string', () => {
      expect(genKey()).toMatch(/^[0-9a-f]{64}$/);
    });
    it('returns a different key each call', () => {
      expect(genKey()).not.toBe(genKey());
    });
  });

  describe('derivePAN()', () => {
    it('returns formatted 16-digit PAN and nonce', () => {
      const { pan, nonce } = derivePAN(genKey(), 0);
      expect(pan).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
      expect(nonce).toBe(0);
    });
    it('is deterministic for same key + nonce', () => {
      const key = genKey();
      expect(derivePAN(key, 5).pan).toBe(derivePAN(key, 5).pan);
    });
    it('produces different PANs for different nonces', () => {
      const key = genKey();
      expect(derivePAN(key, 0).pan).not.toBe(derivePAN(key, 1).pan);
    });
    it('produces different PANs for different keys', () => {
      expect(derivePAN(genKey(), 0).pan).not.toBe(derivePAN(genKey(), 0).pan);
    });
  });

  describe('commit()', () => {
    it('returns 0x-prefixed 64-char hex', () => {
      expect(commit({ id: 'test' }, genKey())).toMatch(/^0x[0-9a-f]{64}$/);
    });
    it('is deterministic', () => {
      const key = genKey();
      expect(commit({ id: 'x' }, key)).toBe(commit({ id: 'x' }, key));
    });
  });

  describe('prove()', () => {
    it('returns proof, commitment, and ts', () => {
      const r = prove({ id: 'test' }, genKey());
      expect(r).toHaveProperty('proof');
      expect(r).toHaveProperty('commitment');
      expect(r).toHaveProperty('ts');
    });
    it('commitment matches commit()', () => {
      const key = genKey();
      const creds = { id: 'abc' };
      expect(prove(creds, key).commitment).toBe(commit(creds, key));
    });
  });

  describe('bioDerive()', () => {
    it('returns masterKey and salt', () => {
      const r = bioDerive([1, 2, 3]);
      expect(r.masterKey).toMatch(/^[0-9a-f]{64}$/);
      expect(r.salt).toMatch(/^[0-9a-f]{64}$/);
    });
    it('is deterministic with same salt', () => {
      const vec = [0.1, 0.9, 0.5];
      const { masterKey, salt } = bioDerive(vec);
      expect(bioDerive(vec, salt).masterKey).toBe(masterKey);
    });
    it('produces different keys for different vecs', () => {
      const salt = genKey();
      expect(bioDerive([1, 2], salt).masterKey).not.toBe(bioDerive([3, 4], salt).masterKey);
    });
  });
});
