// A tiny drawn route (no map tiles needed): the path as a line, hollow dot at the start, amber dot at the end.
import { useMemo } from 'react';

export default function RouteThumb({ path, width = 88, height = 52, className = '', label = 'Route shape' }) {
  const d = useMemo(() => {
    if (!Array.isArray(path) || path.length < 2) return null;
    const step = Math.max(1, Math.ceil(path.length / 140));
    const pts = path.filter((_, i) => i % step === 0 || i === path.length - 1);
    const lat0 = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xy = pts.map((p) => [p[1] * k, -p[0]]);
    const xs = xy.map((p) => p[0]); const ys = xy.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 7;
    const sc = Math.min((width - pad * 2) / (maxX - minX || 1e-9), (height - pad * 2) / (maxY - minY || 1e-9));
    const ox = (width - (maxX - minX) * sc) / 2; const oy = (height - (maxY - minY) * sc) / 2;
    const out = xy.map(([x, y]) => [ox + (x - minX) * sc, oy + (y - minY) * sc]);
    return { line: out.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '), a: out[0], b: out[out.length - 1] };
  }, [path, width, height]);
  if (!d) return null;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={`shrink-0 rounded-[6px] bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200 ${className}`}>
      <path d={d.line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx={d.a[0]} cy={d.a[1]} r="3.5" strokeWidth="2" style={{ fill: 'var(--surface)', stroke: 'currentColor' }} />
      <circle cx={d.b[0]} cy={d.b[1]} r="4" strokeWidth="2" style={{ fill: 'var(--color-brand-500)', stroke: 'var(--surface)' }} />
    </svg>
  );
}
