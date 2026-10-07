// Line / area chart over time. 2px lines, >=8px end dots with a 2px surface ring, 10% area wash,
// a crosshair that snaps to the nearest X and one tooltip listing every series.
import { useMemo, useState } from 'react';
import ChartFrame, { useWidth, Tooltip, SERIES, seriesFill, TextureDefs } from './ChartFrame.jsx';

const niceMax = (v) => { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const H = 200, PAD = { t: 10, r: 14, b: 26, l: 46 };

/** data=[{key,label,values:{id:number|null}}] series=[{id,label,slot?}] area: wash under a single series */
export default function Trend({ data, series, format = String, axisFormat = format, title, subtitle, summary, area = series.length === 1, min0 = true }) {
  const [boxRef, width] = useWidth();
  const [idx, setIdx] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const w = Math.max(width, 240), plotW = w - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const all = data.flatMap((d) => series.map((s) => d.values[s.id]).filter((v) => v != null));
  const hi = niceMax(Math.max(0, ...all)), lo = min0 ? 0 : Math.min(...all, 0);
  const x = (i) => PAD.l + (data.length < 2 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v) => PAD.t + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f);
  const step = Math.ceil(data.length / Math.max(2, Math.floor(plotW / 64)));
  const paths = useMemo(() => series.map((s) => {
    const pts = data.map((d, i) => (d.values[s.id] == null ? null : [x(i), y(d.values[s.id])]));
    return { s, d: pts.filter(Boolean).map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' '), last: [...pts].reverse().find(Boolean), first: pts.find(Boolean) };
  }), [data, series, w, hi, lo]);
  const table = { columns: ['Period', ...series.map((s) => s.label)], rows: data.map((r) => [r.label, ...series.map((s) => (r.values[s.id] == null ? 'n/a' : format(r.values[s.id])))]) };
  const d = idx != null ? data[idx] : null;
  function move(e) {
    const b = boxRef.current.getBoundingClientRect();
    const px = e.clientX - b.left;
    const i = Math.round(((px - PAD.l) / (plotW || 1)) * (data.length - 1));
    setIdx(Math.max(0, Math.min(data.length - 1, i)));
    setPos({ x: px, y: e.clientY - b.top });
  }
  return (
    <ChartFrame title={title} subtitle={subtitle} series={series} summary={summary} table={table}>
      {({ texture, uid }) => (
        <div ref={boxRef} className="relative" onPointerMove={move} onPointerLeave={() => setIdx(null)}>
          <svg width={w} height={H} role="img" aria-label={summary || title} className="block overflow-visible">
            {texture && <TextureDefs uid={uid} count={series.length} />}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} strokeWidth="1" style={{ stroke: t === lo ? 'var(--axis)' : 'var(--grid)' }} />
                <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--muted)' }}>{axisFormat(t)}</text>
              </g>
            ))}
            {data.map((r, i) => i % step === 0 && <text key={r.key} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" style={{ fill: 'var(--muted)' }}>{r.label}</text>)}
            {paths.map(({ s, d: dd, last, first }, si) => {
              const col = SERIES[(s.slot ?? si) % 8];
              return (
                <g key={s.id}>
                  {area && dd && last && first && <path d={`${dd} L${last[0]},${y(lo)} L${first[0]},${y(lo)} Z`} style={{ fill: texture ? seriesFill(si, true, uid) : col }} opacity={texture ? 0.35 : 0.1} />}
                  <path d={dd} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: col }} />
                  {last && <circle cx={last[0]} cy={last[1]} r="5" strokeWidth="2" style={{ fill: col, stroke: 'var(--surface)' }} />}
                </g>
              );
            })}
            {d && (
              <g>
                <line x1={x(idx)} x2={x(idx)} y1={PAD.t} y2={PAD.t + plotH} strokeWidth="1" style={{ stroke: 'var(--axis)' }} />
                {series.map((s, si) => d.values[s.id] != null && <circle key={s.id} cx={x(idx)} cy={y(d.values[s.id])} r="4.5" strokeWidth="2" style={{ fill: SERIES[(s.slot ?? si) % 8], stroke: 'var(--surface)' }} />)}
              </g>
            )}
            <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill="transparent" tabIndex={0} aria-label={`${title}. Use left and right arrow keys to read each point.`}
              onKeyDown={(e) => { if (e.key === 'ArrowRight') { setIdx((i) => Math.min(data.length - 1, (i ?? -1) + 1)); setPos({ x: PAD.l + plotW / 2, y: 30 }); } if (e.key === 'ArrowLeft') { setIdx((i) => Math.max(0, (i ?? 1) - 1)); setPos({ x: PAD.l + plotW / 2, y: 30 }); } }} onBlur={() => setIdx(null)} />
          </svg>
          {d && <Tooltip x={pos.x} y={pos.y} width={w} title={d.label} rows={series.map((s, si) => ({ label: s.label, value: d.values[s.id] == null ? 'n/a' : format(d.values[s.id]), color: SERIES[(s.slot ?? si) % 8] }))} />}
        </div>
      )}
    </ChartFrame>
  );
}
