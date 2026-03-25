import { describe, it, expect } from 'vitest';
import { savings, transition, feeDistInflow, yieldPerLTN } from '../index';

describe('savings()', () => {
  it('Visa 2.5% on $50K/mo = $15,000/mo cost', () => {
    const r = savings(50_000);
    expect(r.visaCost).toBe(1250);       // 2.5% of $50K
    expect(r.qwksCost).toBeLessThan(10); // 0.01% of $50K = $5
  });
  it('ratio is ~250x (QWKS vs Visa)', () => {
    const r = savings(100_000);
    expect(r.ratio).toBeGreaterThan(200);
  });
  it('annual savings > monthly savings', () => {
    const r = savings(50_000);
    expect(r.yearlySavings).toBe(r.annualSavings);
    expect(r.annualSavings).toBeGreaterThan(r.monthlyFee);
  });
  it('QWKS monthly fee = 10% of savings', () => {
    const r = savings(50_000);
    const expected = (r.visaCost - r.qwksCost) * 0.10;
    expect(Math.abs(r.monthlyFee - expected)).toBeLessThan(0.01);
  });
});

describe('transition()', () => {
  it('P* = fee / (price * APY)', () => {
    const { pStar } = transition(1_200, 0.084, 0.12);
    const expected  = 1200 / (0.084 * 0.12);
    expect(Math.abs(pStar - expected)).toBeLessThan(0.01);
  });
  it('yield at P* equals annual fee', () => {
    const annualFee = 1200;
    const { pStar, apy, ltnPrice } = transition(annualFee);
    const yield_ = pStar * ltnPrice * apy;
    expect(Math.abs(yield_ - annualFee)).toBeLessThan(0.01);
  });
});

describe('feeDistInflow()', () => {
  it('0.1% of volume goes to fee pool', () => {
    const r = feeDistInflow(1_000_000);
    expect(r.fee).toBe(1000);
    expect(r.pct).toBe(0.001);
  });
  it('90% to stakers, 10% burned', () => {
    const r = feeDistInflow(10_000);
    expect(r.toStakers).toBeCloseTo(9);
    expect(r.toBurn).toBeCloseTo(1);
  });
});

describe('yieldPerLTN()', () => {
  it('50K LTN staked yields ~$504/yr at 12% APY', () => {
    const r = yieldPerLTN(50_000);
    expect(r.annualYield).toBeCloseTo(50_000 * 0.084 * 0.12, 2);
  });
  it('monthly is annual/12', () => {
    const r = yieldPerLTN(10_000);
    expect(r.monthlyYield).toBeCloseTo(r.annualYield / 12, 5);
  });
});
