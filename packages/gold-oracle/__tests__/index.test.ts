import { describe, it, expect } from 'vitest';
import { meltValue } from '../index';

// Note: goldSpot/silverSpot require network — test meltValue only (pure function)
describe('meltValue()', () => {
  it('1 troy oz 24k at $4133.80 = spot price', () => {
    const r = meltValue('gold', 31.1035, 24, 4133.80);
    expect(r.meltValue).toBeCloseTo(4133.80, 0);
  });
  it('14k purity = 14/24', () => {
    const r = meltValue('gold', 31.1035, 14, 4133.80);
    expect(r.purity).toBeCloseTo(14/24, 5);
  });
  it('5g 14k at $4133.80 ≈ $390', () => {
    const r = meltValue('gold', 5, 14, 4133.80);
    expect(r.meltValue).toBeGreaterThan(380);
    expect(r.meltValue).toBeLessThan(400);
  });
  it('returns all required fields', () => {
    const r = meltValue('gold', 10, 18, 4133.80);
    expect(r).toHaveProperty('meltValue');
    expect(r).toHaveProperty('pureOz');
    expect(r).toHaveProperty('purity');
    expect(r).toHaveProperty('grams');
    expect(r).toHaveProperty('spotPrice');
    expect(r).toHaveProperty('metalType');
  });
  it('pureOz = (grams / 31.1035) * purity', () => {
    const r = meltValue('gold', 10, 18, 5000);
    const expected = (10 / 31.1035) * (18/24);
    expect(r.pureOz).toBeCloseTo(expected, 5);
  });
  it('sterling silver (925) purity', () => {
    const r = meltValue('silver', 31.1035, 0.925, 32.50);
    expect(r.purity).toBe(0.925);
    expect(r.meltValue).toBeCloseTo(30.06, 1);
  });
});
