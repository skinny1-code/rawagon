import Link from 'next/link';

const NAV_LINKS = [
  { href: '/allcard', label: 'AllCard' },
  { href: '/goldsnap', label: 'GoldSnap' },
  { href: '/qwks', label: 'QWKS' },
  { href: '/autoiq', label: 'AutoIQ' },
];

export default function Navbar() {
  return (
    <nav
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      className="sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg tracking-tight flex items-center gap-2">
          <span style={{ color: 'var(--accent)' }}>RAW</span>
          <span style={{ color: 'var(--text)' }}>agon</span>
          <span
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
            className="text-xs px-2 py-0.5 rounded-full font-mono"
          >
            OS
          </span>
        </Link>

        <div className="flex items-center gap-6">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{ color: 'var(--text-muted)' }}
              className="text-sm hover:text-white transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span
            style={{
              background: 'var(--surface-2)',
              color: 'var(--green)',
              border: '1px solid var(--border)',
            }}
            className="text-xs px-3 py-1 rounded-full font-mono"
          >
            ● Base L2
          </span>
        </div>
      </div>
    </nav>
  );
}
