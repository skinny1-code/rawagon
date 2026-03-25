const { AllCard } = require('../index');

describe('allcard-sdk', () => {
  describe('AllCard.create()', () => {
    it('creates a card with a 64-char hex key', () => {
      const card = AllCard.create();
      expect(card.key).toMatch(/^[0-9a-f]{64}$/);
    });
    it('starts with nonce 0', () => {
      expect(AllCard.create().n).toBe(0);
    });
    it('each card gets a unique key', () => {
      expect(AllCard.create().key).not.toBe(AllCard.create().key);
    });
  });

  describe('shift()', () => {
    it('returns a formatted 16-digit PAN', () => {
      const { pan } = AllCard.create().shift();
      expect(pan).toMatch(/^\d{4} \d{4} \d{4} \d{4}$/);
    });
    it('increments nonce each call', () => {
      const card = AllCard.create();
      card.shift();
      expect(card.n).toBe(1);
      card.shift();
      expect(card.n).toBe(2);
    });
    it('produces a different PAN each shift', () => {
      const card = AllCard.create();
      const p1 = card.shift().pan;
      const p2 = card.shift().pan;
      expect(p1).not.toBe(p2);
    });
    it('same card + same nonce → same PAN (deterministic)', () => {
      const card = new (require('../index').AllCard)('a'.repeat(64));
      expect(card.shift().pan).toBe(new (require('../index').AllCard)('a'.repeat(64)).shift().pan);
    });
  });

  describe('prove()', () => {
    it('returns proof, commitment, and ts', () => {
      const r = AllCard.create().prove({ userId: 'u1' });
      expect(r).toHaveProperty('proof');
      expect(r).toHaveProperty('commitment');
      expect(r).toHaveProperty('ts');
    });
    it('commitment is 0x-prefixed hex', () => {
      expect(AllCard.create().prove({ x: 1 }).commitment).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });
});
