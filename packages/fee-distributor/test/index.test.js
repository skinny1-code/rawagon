const { savings, transition } = require('../index');

describe('fee-distributor', () => {
  describe('savings()', () => {
    it('returns all expected fields', () => {
      const r = savings(10000, 100);
      expect(r).toHaveProperty('visaAnnual');
      expect(r).toHaveProperty('qwksAnnual');
      expect(r).toHaveProperty('netSaving');
      expect(r).toHaveProperty('qwksFee');
      expect(r).toHaveProperty('toCustomer');
      expect(r).toHaveProperty('roiPct');
    });

    it('visaAnnual = monthly volume × 12 × 2.5%', () => {
      // vol=10000/mo, visa=2.5% → annual=120000 × 0.025 = 3000
      expect(savings(10000, 0).visaAnnual).toBe(3000);
    });

    it('qwksFee is 10% of net saving, toCustomer is 90%', () => {
      const r = savings(100000, 0);
      expect(r.toCustomer).toBe(Math.round(r.netSaving * 0.9));
      expect(r.qwksFee).toBe(Math.round(r.netSaving * 0.1));
    });

    it('qwks annual fee = txCount × 12 × $0.000825', () => {
      const r = savings(0, 1000);
      expect(parseFloat(r.qwksAnnual)).toBeCloseTo(1000 * 12 * 0.000825, 4);
    });

    it('accepts custom visa rate', () => {
      const r1 = savings(10000, 0, 2.5);
      const r2 = savings(10000, 0, 3.5);
      expect(r2.visaAnnual).toBeGreaterThan(r1.visaAnnual);
    });
  });

  describe('transition()', () => {
    it('returns ltnNeeded, months, years', () => {
      const r = transition(100, 50, 1.0);
      expect(r).toHaveProperty('ltnNeeded');
      expect(r).toHaveProperty('months');
      expect(r).toHaveProperty('years');
    });

    it('ltnNeeded = fee / (price × apy)', () => {
      // fee=120, price=1.0, apy=0.12 → ltnNeeded = 120/0.12 = 1000
      expect(transition(120, 50, 1.0, 0.12).ltnNeeded).toBe(1000);
    });

    it('months = ltnNeeded / ltnMo', () => {
      // ltnNeeded=1000, ltnMo=100 → months=10
      expect(transition(120, 100, 1.0, 0.12).months).toBe(10);
    });

    it('years is a string with 1 decimal', () => {
      const { years } = transition(120, 100, 1.0, 0.12);
      expect(typeof years).toBe('string');
      expect(years).toMatch(/^\d+\.\d$/);
    });
  });
});
