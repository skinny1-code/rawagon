import StatCard from '../components/StatCard';
import ProductCard from '../components/ProductCard';

// Fetch live stats server-side on each request
async function getStats() {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const [goldRes, savingsRes, gasRes] = await Promise.allSettled([
      fetch(`${base}/api/gold`, { next: { revalidate: 300 } }),
      fetch(`${base}/api/savings?vol=50000&txMo=1000`, { next: { revalidate: 3600 } }),
      fetch(`${base}/api/gas`, { next: { revalidate: 30 } }),
    ]);

    const gold =
      goldRes.status === 'fulfilled' && goldRes.value.ok ? await goldRes.value.json() : null;
    const savings =
      savingsRes.status === 'fulfilled' && savingsRes.value.ok
        ? await savingsRes.value.json()
        : null;
    const gas = gasRes.status === 'fulfilled' && gasRes.value.ok ? await gasRes.value.json() : null;

    return { gold, savings, gas };
  } catch {
    return { gold: null, savings: null, gas: null };
  }
}

const PRODUCTS = [
  {
    href: '/allcard',
    title: '1NCE AllCard',
    description: 'Virtual prepaid card with shifting PAN and ZK identity. No PII on-chain.',
    icon: '💳',
    color: 'from-purple-600 to-indigo-700',
    tags: ['ZK', 'Identity', 'Payments'],
  },
  {
    href: '/goldsnap',
    title: 'GoldSnap',
    description: 'Mint and redeem GTX — the gold-backed ERC20 pegged via Chainlink XAU/USD.',
    icon: '🥇',
    color: 'from-yellow-500 to-amber-600',
    tags: ['GTX', 'Chainlink', 'DeFi'],
  },
  {
    href: '/qwks',
    title: 'QWKS Protocol',
    description: 'Business payment rails with fee distribution to LTN stakers.',
    icon: '⚡',
    color: 'from-blue-500 to-cyan-600',
    tags: ['LTN', 'Staking', 'Fees'],
  },
  {
    href: '/autoiq',
    title: 'AutoIQ',
    description: 'Vehicle title NFTs on Base L2. Immutable ownership records per VIN.',
    icon: '🚗',
    color: 'from-green-500 to-emerald-600',
    tags: ['ERC721', 'NFT', 'Titles'],
    comingSoon: true,
  },
  {
    href: '/bitpawn',
    title: 'BitPawn',
    description: 'Pawn shop OS with live gold pricing and instant offers.',
    icon: '💎',
    color: 'from-pink-500 to-rose-600',
    tags: ['Gold', 'Pawn', 'Pricing'],
    comingSoon: true,
  },
  {
    href: '/profitpilot',
    title: 'ProfitPilot',
    description: 'Analytics dashboard across all RAWagon products and on-chain activity.',
    icon: '📊',
    color: 'from-orange-500 to-red-600',
    tags: ['Analytics', 'Dashboard'],
    comingSoon: true,
  },
];

export default async function Home() {
  const { gold, savings, gas } = await getStats();

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="text-center pt-8 pb-4">
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          RAWagon <span style={{ color: 'var(--accent)' }}>OS</span>
        </h1>
        <p style={{ color: 'var(--text-muted)' }} className="text-lg max-w-xl mx-auto">
          Base L2 fintech infrastructure — identity, payments, gold, and title NFTs in one
          dashboard.
        </p>
      </section>

      {/* Live Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Gold Spot"
          value={gold ? `$${gold.spot.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '—'}
          sub="per troy oz"
          icon="🥇"
        />
        <StatCard label="Gas" value={gas ? `${gas.gwei} Gwei` : '—'} sub="Base mainnet" icon="⛽" />
        <StatCard label="TX Cost" value="$0.000825" sub="QWKS per tx" icon="⚡" />
        <StatCard
          label="Annual Saving"
          value={savings ? `$${Math.round(savings.netSaving).toLocaleString()}` : '—'}
          sub="vs Visa @ $50K/mo"
          icon="💰"
        />
      </section>

      {/* Products */}
      <section>
        <h2 className="text-xl font-semibold mb-5" style={{ color: 'var(--text-muted)' }}>
          Products
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PRODUCTS.map((p) => (
            <ProductCard key={p.href} {...p} />
          ))}
        </div>
      </section>
    </div>
  );
}
