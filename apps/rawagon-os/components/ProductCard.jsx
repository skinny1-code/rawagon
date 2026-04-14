import Link from 'next/link';

export default function ProductCard({ href, title, description, icon, tags, comingSoon }) {
  const card = (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        opacity: comingSoon ? 0.6 : 1,
      }}
      className="rounded-xl p-5 flex flex-col gap-3 h-full hover:border-indigo-500 transition-colors"
    >
      <div className="flex items-start justify-between">
        <span className="text-3xl">{icon}</span>
        {comingSoon && (
          <span
            style={{
              background: 'var(--surface-2)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            className="text-xs px-2 py-0.5 rounded-full"
          >
            Soon
          </span>
        )}
      </div>
      <div>
        <h3 className="font-semibold text-base mb-1">{title}</h3>
        <p style={{ color: 'var(--text-muted)' }} className="text-sm leading-relaxed">
          {description}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-auto">
        {tags.map((tag) => (
          <span
            key={tag}
            style={{
              background: 'var(--surface-2)',
              color: 'var(--accent)',
              border: '1px solid var(--accent-dim)',
            }}
            className="text-xs px-2 py-0.5 rounded-full font-mono"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );

  if (comingSoon) return card;
  return (
    <Link href={href} className="block h-full">
      {card}
    </Link>
  );
}
