import { describe, it, expect } from 'vitest';
import {
  LTN_PRICE_USD, BURN_PER_TX, INITIAL_SUPPLY,
  stakingYield, simulateBurn, transitionPoint, earnRate, lifecycleProjection
} from '../index';

describe('constants', () => {
  it('LTN_PRICE_USD = $0.084', () => expect(LTN_PRICE_USD).toBe(0.084));
  it('BURN_PER_TX = 0.001', () => expect(BURN_PER_TX).toBe(0.001));
  it('initial supply = 1 billion', () => expect(INITIAL_SUPPLY).toBe(1_000_000_000));
});

describe('stakingYield()', () => {
  it('50K LTN staked at 12% APY yields ~$504/yr', () => {
    const r = stakingYield(50_000);
    expect(r.annualYield).toBeCloseTo(504, 0);
  });
  it('monthly = annual / 12', () => {
    const r = stakingYield(25_000);
    expect(r.monthly).toBeCloseTo(r.annualYield / 12, 5);
  });
  it('returns all required fields', () => {
    const r = stakingYield(10_000);
    expect(r).toHaveProperty('annualYield');
    expect(r).toHaveProperty('monthly');
    expect(r).toHaveProperty('daily');
    expect(r).toHaveProperty('apy');
  });
});

describe('simulateBurn()', () => {
  it('56,400 txns burns 56.4 LTN', () => {
    const r = simulateBurn(56_400);
    expect(r.ltnBurned).toBeCloseTo(56.4, 1);
  });
  it('supply decreases after burn', () => {
    const r = simulateBurn(1_000_000);
    expect(r.supplyAfter).toBeLessThan(INITIAL_SUPPLY);
  });
  it('burnPct is tiny fraction', () => {
    const r = simulateBurn(100_000);
    expect(r.burnPct).toBeLessThan(0.01);
  });
});

describe('transitionPoint()', () => {
  it('P* math: $1200/yr fee at $0.084 / 12% APY', () => {
    const p = transitionPoint(1200);
    expect(p).toBeCloseTo(1200 / (0.084 * 0.12), 2);
  });
  it('yield at P* = annual fee', () => {
    const fee = 990;
    const p   = transitionPoint(fee);
    expect(p * LTN_PRICE_USD * 0.12).toBeCloseTo(fee, 1);
  });
});

describe('lifecycleProjection()', () => {
  it('returns 5 phases', () => {
    expect(lifecycleProjection(99).length).toBe(5);
  });
  it('Phase 5 net cost is positive (partner earns)', () => {
    const phases = lifecycleProjection(99, 10_000, 20_000);
    const last   = phases[phases.length - 1];
    expect(last.stakingYield).toBeGreaterThan(0);
  });
  it('each phase has required fields', () => {
    lifecycleProjection(120).forEach(p => {
      expect(p).toHaveProperty('phase');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('ltnStaked');
      expect(p).toHaveProperty('stakingYield');
    });
  });
});
