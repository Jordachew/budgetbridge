// Ranked horizontal bars for one measure across named categories. One series, one colour (slot 1): never a ramp.
// Value sits at the bar tip (outside when it will not fit). Items beyond `limit` fold into "Other".
import { useState } from 'react';
import ChartFrame, { useChart } from './ChartFrame.jsx';

export default function HBars({ items, format = String, title, subtitle, summary, limit = 6, valueTitle = 'Amount', slot = 0, total: showTotal = true }) {
  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const rows = rest.length ? [...head, { id: '_other', label: `Other (${rest.length})`, value: rest.reduce((a, b) => a + b.value, 0) }] : head;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = sorted.reduce((a, b) => a + b.value, 0);
  const [on, setOn] = useState(null);
  const table = { columns: ['Category', valueTitle, 'Share'], rows: sorted.map((r) => [r.label, format(r.value), `${Math.round((r.value / total) * 100)}%`]) };
  return (
    <ChartFrame title={title} subtitle={subtitle} summary={summary} table={table}>
      {() => (
        <div>
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const pct = (r.value / max) * 100;
              const Icon = r.icon;
              return (
                <li key={r.id} onPointerEnter={() => setOn(r.id)} onPointerLeave={() => setOn(null)} onFocus={() => setOn(r.id)} onBlur={() => setOn(null)} tabIndex={0}
                  aria-label={`${r.label}: ${format(r.value)}, ${Math.round((r.value / total) * 100)} percent`} className="group outline-offset-4">
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-ink-700 dark:text-ink-200">{Icon && <Icon size={14} className="shrink-0 text-ink-400" />}{r.label}</span>
                    <span className="shrink-0 font-bold tabular-nums">{format(r.value)} <span className="font-normal text-ink-500">{Math.round((r.value / total) * 100)}%</span></span>
                  </div>
                  <div className="h-3 w-full rounded-[3px] bg-ink-100 dark:bg-ink-800" aria-hidden="true">
                    <div className="h-3 rounded-r-[4px] rounded-l-none transition-all" style={{ width: `max(4px, ${pct}%)`, background: `var(--series-${slot + 1})`, opacity: on && on !== r.id ? 0.45 : 1 }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {showTotal && <div className="mt-3 flex justify-between border-t border-ink-100 pt-2 text-xs text-ink-500 dark:border-ink-800"><span>Total</span><span className="font-bold text-ink-900 dark:text-white">{format(total)}</span></div>}
        </div>
      )}
    </ChartFrame>
  );
}
export { useChart };
