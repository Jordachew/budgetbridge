// Column chart over categories (usually time buckets), grouped or stacked, built to the mark spec:
// <=24px thick, 4px rounded data-end with a square baseline, 2px surface gap between touching marks, hairline grid.
import { useMemo, useState } from 'react';
import ChartFrame, { TextureDefs, seriesFill, useWidth, Tooltip, SERIES } from './ChartFrame.jsx';

const niceMax = (v) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const H = 220, PAD = { t: 8, r: 8, b: 26, l: 46 };

/** Top-rounded bar path: radius r at the data end only, square at the baseline. */
function barPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/**
 * props: data=[{key,label,values:{seriesId:number}}], series=[{id,label,slot?}], format(n)->text, axisFormat(n)->short text,
 * stacked, title, subtitle, summary, valueTitle (table header)
 */
export default function Bars({ data, series, format = String, axisFormat = format, stacked = false, title, subtitle, summary, labelEvery }) {
  const [boxRef, width] = useWidth();
  const [hover, setHover] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [focus, setFocus] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const live = series.filter((s) => !hidden.has(s.id));
  const w = Math.max(width, 240);
  const plotW = w - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;

  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => stacked ? live.reduce((a, s) => a + (d.values[s.id] || 0), 0) : Math.max(0, ...live.map((s) => d.values[s.id] || 0))))), [data, live, stacked]);
  const band = plotW / Math.max(1, data.length);
  const per = stacked ? 1 : Math.max(1, live.length);
  const barW = Math.max(3, Math.min(24, (band * 0.7 - (per - 1) * 2) / per));
  const groupW = per * barW + (per - 1) * 2;
  const y = (v) => PAD.t + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const step = labelEvery || Math.ceil(data.length / Math.max(2, Math.floor(plotW / 56)));
  const active = hover ?? focus;
  const d = active != null ? data[active] : null;

  const table = { columns: [title ? 'Period' : 'Period', ...series.map((s) => s.label)], rows: data.map((r) => [r.label, ...series.map((s) => format(r.values[s.id] || 0))]) };

  return (
    <ChartFrame title={title} subtitle={subtitle} series={series} summary={summary} table={table} hidden={hidden}
      onToggle={series.length > 1 ? (id) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else if (n.size < series.length - 1) n.add(id); return n; }) : undefined}>
      {({ texture, uid }) => (
        <div ref={boxRef} className="relative" onPointerLeave={() => setHover(null)}>
          <svg width={w} height={H} role="img" aria-label={summary || title} className="block overflow-visible">
            {texture && <TextureDefs uid={uid} count={series.length} />}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} strokeWidth="1" style={{ stroke: t === 0 ? 'var(--axis)' : 'var(--grid)' }} />
                <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--muted)' }}>{axisFormat(t)}</text>
              </g>
            ))}
            {data.map((r, i) => {
              const x0 = PAD.l + i * band + (band - groupW) / 2;
              let acc = 0;
              return (
                <g key={r.key} opacity={active != null && active !== i ? 0.55 : 1}>
                  {live.map((s, si) => {
                    const v = r.values[s.id] || 0;
                    const idx = series.indexOf(s);
                    const fill = seriesFill(s.slot ?? idx, texture, uid);
                    if (stacked) {
                      const h = (v / max) * plotH - (v > 0 && acc > 0 ? 2 : 0);
                      const yy = y(acc + v);
                      acc += v;
                      return v > 0 ? <path key={s.id} d={barPath(x0, yy, barW, Math.max(0, h), si === live.length - 1 ? 4 : 0)} style={{ fill }} /> : null;
                    }
                    return v > 0 ? <path key={s.id} d={barPath(x0 + si * (barW + 2), y(v), barW, (v / max) * plotH, 4)} style={{ fill }} /> : null;
                  })}
                  <rect x={PAD.l + i * band} y={PAD.t} width={band} height={plotH + 18} fill="transparent" tabIndex={0}
                    aria-label={`${r.label}: ${series.map((s) => `${s.label} ${format(r.values[s.id] || 0)}`).join(', ')}`}
                    onPointerMove={(e) => { setHover(i); const b = boxRef.current.getBoundingClientRect(); setPos({ x: e.clientX - b.left, y: e.clientY - b.top }); }}
                    onFocus={() => { setFocus(i); setPos({ x: PAD.l + i * band + band / 2, y: PAD.t + 20 }); }} onBlur={() => setFocus(null)} />
                  {i % step === 0 && <text x={PAD.l + i * band + band / 2} y={H - 8} textAnchor="middle" fontSize="11" style={{ fill: 'var(--muted)' }}>{r.label}</text>}
                </g>
              );
            })}
          </svg>
          {d && <Tooltip x={pos.x} y={pos.y} width={w} title={d.label} rows={live.map((s) => ({ label: s.label, value: format(d.values[s.id] || 0), color: SERIES[(s.slot ?? series.indexOf(s)) % 8] }))} />}
        </div>
      )}
    </ChartFrame>
  );
}
