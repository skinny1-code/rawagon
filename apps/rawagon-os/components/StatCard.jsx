export default function StatCard({ label, value, sub, icon }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
      className="rounded-xl p-4 flex flex-col gap-1"
    >
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--text-muted)' }} className="text-xs uppercase tracking-wider">
          {label}
        </span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-2xl font-bold font-mono">{value}</div>
      <div style={{ color: 'var(--text-muted)' }} className="text-xs">
        {sub}
      </div>
    </div>
  );
}
