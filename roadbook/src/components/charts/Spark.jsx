// Tiny trend line for stat tiles: 12-ish points, de-emphasis grey with the current point in the accent.
export default function Spark({ values, width = 120, height = 32, label = 'Trend' }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [2 + (i / (values.length - 1)) * (width - 8), height - 4 - ((v - min) / span) * (height - 8)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="block">
      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--muted)' }} />
      <circle cx={last[0]} cy={last[1]} r="4" strokeWidth="2" style={{ fill: 'var(--series-1)', stroke: 'var(--surface)' }} />
    </svg>
  );
}
