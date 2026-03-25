// globals: describe, it, expect, vi, beforeAll injected by vitest (globals: true)

// Stub global fetch before the module is loaded so the cache starts with mock data
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeYahooResponse(price) {
  return {
    ok: true,
    json: async () => ({
      chart: { result: [{ meta: { regularMarketPrice: price } }] },
    }),
  };
}

// GLD ETF ≈ $220 → gold spot ≈ $2200/troy oz
// SLV ETF ≈ $23  → silver spot ≈ $23 / 0.9395 ≈ $24.48/troy oz
beforeAll(() => {
  mockFetch.mockImplementation((url) => {
    if (url.includes('GLD')) return Promise.resolve(makeYahooResponse(220));
    if (url.includes('SLV')) return Promise.resolve(makeYahooResponse(23));
    return Promise.reject(new Error('unexpected URL'));
  });
});

const { gold, silver, pawn } = require('../index');

describe('gold-oracle', () => {
  describe('gold()', () => {
    it('returns spot and etf prices', async () => {
      const r = await gold();
      expect(r).toHaveProperty('spot');
      expect(r).toHaveProperty('etf');
    });
    it('spot = etf × 10 (GLD holds ~1/10 oz)', async () => {
      const r = await gold();
      expect(r.spot).toBeCloseTo(r.etf * 10, 5);
    });
  });

  describe('silver()', () => {
    it('returns spot and etf prices', async () => {
      const r = await silver();
      expect(r).toHaveProperty('spot');
      expect(r).toHaveProperty('etf');
    });
    it('spot = etf / 0.9395', async () => {
      const r = await silver();
      expect(r.spot).toBeCloseTo(r.etf / 0.9395, 4);
    });
  });

  describe('pawn()', () => {
    it('returns melt, pawnOffer, buyOffer, spot for gold', async () => {
      const r = await pawn('gold', 10, 24);
      expect(r).toHaveProperty('melt');
      expect(r).toHaveProperty('pawnOffer');
      expect(r).toHaveProperty('buyOffer');
      expect(r).toHaveProperty('spot');
    });
    it('pawnOffer < buyOffer < melt value', async () => {
      const r = await pawn('gold', 10, 24);
      expect(r.pawnOffer).toBeLessThan(r.buyOffer);
      expect(r.buyOffer).toBeLessThan(r.melt);
    });
    it('pawnOffer = melt × ltv', async () => {
      const r = await pawn('gold', 10, 24, 0.6);
      expect(r.pawnOffer).toBeCloseTo(r.melt * 0.6, 5);
    });
    it('handles 14k gold (karat < 24)', async () => {
      const pure = await pawn('gold', 10, 24);
      const k14 = await pawn('gold', 10, 14);
      expect(k14.melt).toBeLessThan(pure.melt);
    });
    it('handles silver', async () => {
      const r = await pawn('silver', 10, 925);
      expect(r.melt).toBeGreaterThan(0);
    });
  });
});
