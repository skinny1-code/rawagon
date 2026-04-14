import Link from 'next/link';

export default function AutoIQPage() {
  return (
    <div className="max-w-xl mx-auto text-center space-y-6 pt-16">
      <div className="text-6xl">🚗</div>
      <h1 className="text-3xl font-bold">
        Auto<span style={{ color: 'var(--green)' }}>IQ</span>
      </h1>
      <p style={{ color: 'var(--text-muted)' }}>
        Vehicle title NFTs on Base L2. Immutable ownership records keyed by VIN — mint, transfer,
        and verify titles on-chain.
      </p>
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        className="rounded-xl p-5 text-sm space-y-2 text-left"
      >
        <p className="font-semibold">Contract: IQTitle (IQCAR)</p>
        <div style={{ color: 'var(--text-muted)' }} className="space-y-1">
          <p>• ERC721 — tokenId = keccak256(VIN)</p>
          <p>• 17-char VIN validation, no duplicate VINs</p>
          <p>• Immutable metadata: make, model, year, recall flag, salvage flag</p>
          <p>• 0.001 ETH mint fee</p>
        </div>
      </div>
      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}
        className="rounded-full px-4 py-2 text-sm inline-block"
      >
        UI coming soon
      </div>
      <div>
        <Link href="/" style={{ color: 'var(--accent)' }} className="text-sm hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
