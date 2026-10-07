// Shared chart chrome: title, legend (always for 2+ series), chart/table toggle, textures, tooltip layer.
// Follows the dataviz rules: one filter row lives ABOVE charts (not here), text never wears the series colour,
// every chart has a table twin, tooltips enhance and never gate.
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { usePrefs } from '../../state/prefs.js';
import { cx } from '../ui.jsx';

export const SERIES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--series-${n})`);
const Ctx = createContext({ texture: false, uid: 'c' });
export const useChart = () => useContext(Ctx);

/** Fill for series index i: flat colour, or an opt-in 45/135 degree hatch (accessibility, print, forced-colors). */
export function seriesFill(i, texture, uid) { return texture ? `url(#${uid}-tx${i})` : SERIES[i % 8]; }

function Defs({ uid, count }) {
  return (
    <defs>
      {Array.from({ length: count }, (_, i) => (
        <pattern key={i} id={`${uid}-tx${i}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`rotate(${i % 2 ? 135 : 45})`}>
          <rect width="6" height="6" style={{ fill: SERIES[i % 8] }} />
          <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2.2" style={{ stroke: 'color-mix(in srgb, black 38%, transparent)' }} />
        </pattern>
      ))}
    </defs>
  );
}
export { Defs as TextureDefs };

/** Measures its box so SVG charts can draw at real pixel size. */
export function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function Legend({ series, hidden, onToggle }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
      {series.map((s, i) => (
        <li key={s.id}>
          <button type="button" onClick={onToggle ? () => onToggle(s.id) : undefined} aria-pressed={onToggle ? !hidden?.has(s.id) : undefined}
            className={cx('flex items-center gap-1.5 text-xs text-ink-600 dark:text-ink-300', hidden?.has(s.id) && 'opacity-40', !onToggle && 'cursor-default')}>
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: SERIES[(s.slot ?? i) % 8] }} aria-hidden="true" />{s.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Tooltip card: value leads (strong), series name follows, line keys not boxes. rows: [{label,value,color}] */
export function Tooltip({ x, y, title, rows, width, boxW = 180 }) {
  const left = x + 14 + boxW > width ? Math.max(0, x - 14 - boxW) : x + 14;
  return (
    <div className="pointer-events-none absolute z-10 rounded-md border border-ink-200 bg-[var(--surface)] px-3 py-2 text-xs shadow-lg dark:border-ink-600" style={{ left, top: Math.max(0, y - 10), width: boxW }} role="status">
      {title && <div className="mb-1 font-bold text-ink-900 dark:text-white">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 py-px">
          <span className="flex items-center gap-1.5 text-ink-500"><span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} aria-hidden="true" />{r.label}</span>
          <span className="font-bold text-ink-900 dark:text-white">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * <ChartFrame title subtitle series summary table={{columns:[..], rows:[[..]]}} legendHidden onLegendToggle>
 *   {({ texture, uid }) => <svg/>}
 * </ChartFrame>
 */
export default function ChartFrame({ title, subtitle, series = [], summary, table, hidden, onToggle, actions, children, className }) {
  const { chartTexture } = usePrefs();
  const [view, setView] = useState('chart');
  const uid = useId().replace(/[^a-z0-9]/gi, '');
  const forced = typeof window !== 'undefined' && window.matchMedia?.('(forced-colors: active)').matches;
  const texture = chartTexture || forced;
  return (
    <Ctx.Provider value={{ texture, uid }}>
      <figure className={cx('paper-card p-5', className)} aria-label={summary ? `${title}. ${summary}` : title}>
        <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-semibold leading-tight">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {actions}
            {table && (
              <button type="button" onClick={() => setView(view === 'chart' ? 'table' : 'chart')} className="inline-flex items-center gap-1.5 rounded-md border border-ink-300 px-2 py-1 text-xs font-bold text-ink-600 hover:bg-ink-100 dark:border-ink-600 dark:text-ink-300 dark:hover:bg-ink-800">
                {view === 'chart' ? <><Table2 size={13} /> Table</> : <><BarChart3 size={13} /> Chart</>}
              </button>
            )}
          </div>
        </figcaption>
        {view === 'chart' ? (
          <>
            {series.length > 1 && <div className="mb-2"><Legend series={series} hidden={hidden} onToggle={onToggle} /></div>}
            {children({ texture, uid })}
            {summary && <p className="sr-only">{summary}</p>}
          </>
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[var(--surface)] font-bold text-ink-500"><tr>{table.columns.map((c, i) => <th key={c} className={cx('py-1.5 pr-3', i > 0 && 'text-right')}>{c}</th>)}</tr></thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">{table.rows.map((r, ri) => <tr key={ri}>{r.map((c, i) => <td key={i} className={cx('py-1.5 pr-3 tabular-nums', i > 0 && 'text-right')}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </figure>
    </Ctx.Provider>
  );
}
