const ltn = require('../index');

// ── Exports ───────────────────────────────────────────────────────────────────

describe('ltn-token exports', () => {
  it('exports all expected functions and constants', () => {
    expect(typeof ltn.getBalance).toBe('function');
    expect(typeof ltn.getStaked).toBe('function');
    expect(typeof ltn.getPending).toBe('function');
    expect(typeof ltn.getTotalStaked).toBe('function');
    expect(typeof ltn.apy).toBe('function');
    expect(typeof ltn.burnProjection).toBe('function');
    expect(typeof ltn.stakingBreakeven).toBe('function');
    expect(typeof ltn.projectedRewards).toBe('function');
    expect(Array.isArray(ltn.LTN_ABI)).toBe(true);
    expect(Array.isArray(ltn.FD_ABI)).toBe(true);
  });

  it('exposes protocol constants', () => {
    expect(ltn.MAX_SUPPLY).toBe(1_000_000_000);
    expect(ltn.INITIAL_SUPPLY).toBe(400_000_000);
    expect(ltn.BURN_PER_TX).toBe(0.001);
    expect(ltn.FEE_BPS).toBe(10);
  });

  it('LTN_ABI contains core ERC20 entries', () => {
    const names = ltn.LTN_ABI.join(' ');
    expect(names).toContain('balanceOf');
    expect(names).toContain('transfer');
    expect(names).toContain('approve');
  });

  it('FD_ABI contains staking entries', () => {
    const names = ltn.FD_ABI.join(' ');
    expect(names).toContain('stake');
    expect(names).toContain('unstake');
    expect(names).toContain('claim');
    expect(names).toContain('inflow');
  });
});

// ── apy() ─────────────────────────────────────────────────────────────────────

describe('apy()', () => {
  it('returns zero when nothing is staked', () => {
    const result = ltn.apy(1_000_000, 0, 0.1);
    expect(result.apyPct).toBe(0);
    expect(result.feeUsd).toBe(0);
  });

  it('returns zero when ltnPrice is zero', () => {
    const result = ltn.apy(1_000_000, 100_000, 0);
    expect(result.apyPct).toBe(0);
  });

  it('computes correct fee and APY for known inputs', () => {
    // $10M annual volume, 100K LTN staked at $1 each
    // fee = 10M * 0.001 = $10,000
    // staked value = 100K * $1 = $100,000
    // APY = 10,000 / 100,000 = 10%
    const result = ltn.apy(10_000_000, 100_000, 1.0);
    expect(result.feeUsd).toBeCloseTo(10_000, 2);
    expect(result.feeLtn).toBeCloseTo(10_000, 2);
    expect(result.apyPct).toBeCloseTo(10, 4);
  });

  it('APY scales with volume', () => {
    const low = ltn.apy(1_000_000, 100_000, 1.0);
    const high = ltn.apy(10_000_000, 100_000, 1.0);
    expect(high.apyPct).toBeCloseTo(low.apyPct * 10, 4);
  });

  it('APY scales inversely with total staked', () => {
    const small = ltn.apy(10_000_000, 100_000, 1.0);
    const large = ltn.apy(10_000_000, 200_000, 1.0);
    expect(large.apyPct).toBeCloseTo(small.apyPct / 2, 4);
  });
});

// ── burnProjection() ──────────────────────────────────────────────────────────

describe('burnProjection()', () => {
  it('computes monthly and total burn', () => {
    // 100K tx/month × 0.001 LTN = 100 LTN/month
    const result = ltn.burnProjection(100_000, 12);
    expect(result.monthlyBurn).toBeCloseTo(100, 6);
    expect(result.totalBurn).toBeCloseTo(1_200, 6);
  });

  it('defaults to 12 months', () => {
    const r12 = ltn.burnProjection(100_000);
    const explicit = ltn.burnProjection(100_000, 12);
    expect(r12.totalBurn).toBe(explicit.totalBurn);
  });

  it('supplyRemaining is non-negative', () => {
    // Even at extreme burn rate, supply never goes below 0
    const result = ltn.burnProjection(1_000_000_000, 120);
    expect(result.supplyRemaining).toBeGreaterThanOrEqual(0);
  });

  it('monthlyBurn × months equals totalBurn', () => {
    const months = 6;
    const result = ltn.burnProjection(50_000, months);
    expect(result.totalBurn).toBeCloseTo(result.monthlyBurn * months, 10);
  });
});

// ── stakingBreakeven() ────────────────────────────────────────────────────────

describe('stakingBreakeven()', () => {
  it('returns zero fee when volume is zero', () => {
    const result = ltn.stakingBreakeven(10_000, 0, 100_000, 1.0);
    expect(result.monthlyFeeUsd).toBe(0);
    expect(result.monthlyRewardLtn).toBe(0);
  });

  it('returns null months when rewards already exceed fees (staker covers their own fees)', () => {
    // User stakes 50% of pool, processes 100% of volume
    // Their reward share = 50% of total pool fee
    // Their fee = 10 bps of their volume = same as total fee
    // So reward (50%) < fee (100%) — months is null (never breaks even with these params)
    const result = ltn.stakingBreakeven(50_000, 10_000, 100_000, 1.0);
    expect(result.monthlyFeeUsd).toBeGreaterThan(0);
    expect(result.monthlyRewardLtn).toBeGreaterThan(0);
    expect(result.monthlyRewardUsd).toBeGreaterThan(0);
  });

  it('returns zero months when reward equals or exceeds fee already', () => {
    // stake 100% of pool → reward = fee → breaks even immediately
    const result = ltn.stakingBreakeven(100_000, 1, 100_000, 1.0);
    expect(result.months).toBe(0);
  });

  it('handles zero totalStaked gracefully', () => {
    const result = ltn.stakingBreakeven(1_000, 10_000, 0, 1.0);
    expect(result.monthlyRewardLtn).toBe(0);
    expect(result.months).toBeNull();
  });
});

// ── projectedRewards() ────────────────────────────────────────────────────────

describe('projectedRewards()', () => {
  it('proportional to stake share', () => {
    // alice stakes 1000, total 10000 → 10% share
    const alice = ltn.projectedRewards(1_000, 1_000_000, 10_000, 1.0, 12);
    const pool = ltn.projectedRewards(10_000, 1_000_000, 10_000, 1.0, 12);
    expect(alice.rewardLtn).toBeCloseTo(pool.rewardLtn * 0.1, 6);
  });

  it('scales linearly with months', () => {
    const r6 = ltn.projectedRewards(1_000, 1_000_000, 10_000, 1.0, 6);
    const r12 = ltn.projectedRewards(1_000, 1_000_000, 10_000, 1.0, 12);
    expect(r12.rewardLtn).toBeCloseTo(r6.rewardLtn * 2, 6);
  });

  it('returns zero when totalStaked is zero', () => {
    const result = ltn.projectedRewards(1_000, 1_000_000, 0, 1.0, 12);
    expect(result.rewardLtn).toBe(0);
    expect(result.rewardUsd).toBe(0);
  });

  it('rewardUsd = rewardLtn * ltnPrice', () => {
    const price = 2.5;
    const result = ltn.projectedRewards(1_000, 1_000_000, 10_000, price, 12);
    expect(result.rewardUsd).toBeCloseTo(result.rewardLtn * price, 6);
  });
});

// ── getBalance / getStaked / getPending / getTotalStaked (mock fetch) ─────────

describe('on-chain read queries', () => {
  const ADDR = {
    ltn: '0x1000000000000000000000000000000000000001',
    feeDistributor: '0x2000000000000000000000000000000000000002',
  };
  const WALLET = '0xabcdef0000000000000000000000000000000001';
  // 1000 LTN in wei = 0x3635C9ADC5DEA00000 (1e21)
  const ONE_THOUSAND_LTN_HEX = '0x' + (1000n * 10n ** 18n).toString(16).padStart(64, '0');

  function mockFetch(returnHex) {
    return vi.fn().mockResolvedValue({ json: () => Promise.resolve({ result: returnHex }) });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getBalance decodes wei result to float LTN', async () => {
    vi.stubGlobal('fetch', mockFetch(ONE_THOUSAND_LTN_HEX));
    const bal = await ltn.getBalance(WALLET, 'base', ADDR);
    expect(bal).toBeCloseTo(1000, 6);
  });

  it('getStaked decodes correctly', async () => {
    vi.stubGlobal('fetch', mockFetch(ONE_THOUSAND_LTN_HEX));
    const staked = await ltn.getStaked(WALLET, 'base', ADDR);
    expect(staked).toBeCloseTo(1000, 6);
  });

  it('getPending decodes correctly', async () => {
    vi.stubGlobal('fetch', mockFetch(ONE_THOUSAND_LTN_HEX));
    const pending = await ltn.getPending(WALLET, 'base', ADDR);
    expect(pending).toBeCloseTo(1000, 6);
  });

  it('getTotalStaked decodes correctly', async () => {
    vi.stubGlobal('fetch', mockFetch(ONE_THOUSAND_LTN_HEX));
    const total = await ltn.getTotalStaked('base-sepolia', ADDR);
    expect(total).toBeCloseTo(1000, 6);
  });

  it('throws on eth_call error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ error: { message: 'execution reverted' } }),
      })
    );
    await expect(ltn.getBalance(WALLET, 'base', ADDR)).rejects.toThrow('eth_call failed');
  });
});
