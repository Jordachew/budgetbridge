// The one hero figure: profit for the period, on an asphalt band, with a ruled list of the supporting numbers beside it.
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Spark } from '../../components/charts/index.js';
import { cx } from '../../components/ui.jsx';

// The band is dark in both themes, so status and chart tokens inside it use their dark-surface values.
const ON_ASPHALT = { '--good': '#4fd46a', '--bad': '#ff8f8f', '--muted': '#a2a198', '--surface': '#1b1d22', '--series-1': '#6aa6f0' };

/** Signed change with an arrow icon and words, so colour is never the only signal. good = whether "up" is good news. */
export function Delta({ cmp, money, against, upIsGood = true, className, compact }) {
  if (!cmp) return <span className={cx('text-sm', className)}>No earlier figures to compare with.</span>;
  const good = cmp.dir === 'flat' ? null : (cmp.dir === 'up') === upIsGood;
  const Icon = cmp.dir === 'up' ? ArrowUpRight : cmp.dir === 'down' ? ArrowDownRight : Minus;
  const color = good == null ? undefined : { color: good ? 'var(--good)' : 'var(--bad)' };
  const word = cmp.dir === 'up' ? 'Up' : cmp.dir === 'down' ? 'Down' : 'Same as';
  const pct = cmp.pct != null && cmp.dir !== 'flat' ? ` (${cmp.pct}%)` : '';
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-bold', className)} style={color}>
      <Icon size={compact ? 15 : 18} strokeWidth={2.6} aria-hidden="true" />
      <span>{cmp.dir === 'flat' ? (compact ? 'No change' : `Same as ${against}`) : compact ? `${word} ${cmp.pct != null ? `${cmp.pct}%` : money(Math.abs(cmp.diff))}` : `${word} ${money(Math.abs(cmp.diff))}${pct} on ${against}`}</span>
    </span>
  );
}

function Row({ label, value, note, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3.5">
      <dt className="text-sm text-ink-600 dark:text-ink-300">{label}{note && <span className="mt-0.5 block text-xs text-ink-500">{note}</span>}</dt>
      <dd className={cx('whitespace-nowrap text-right tabular-nums', strong ? 'text-lg font-bold' : 'text-base font-bold')}>{value}</dd>
    </div>
  );
}

export default function Hero({ d, money, dist, uLabel, titleText, againstName }) {
  const profitText = money(d.profit);
  const hasPrev = d.prevHas;
  return (
    <section aria-label="Profit for the period" className="grid overflow-hidden rounded-[10px] border border-[var(--hairline)] lg:grid-cols-[1.4fr_1fr]">
      <div className="relative bg-ink-950 p-6 text-white dark:bg-ink-800 sm:p-8" style={ON_ASPHALT}>
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Profit · {titleText}</div>
        <div className="mt-3 break-words text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl xl:text-7xl" data-testid="hero-figure">{profitText}</div>
        <div className="mt-4 text-base">
          {hasPrev ? <Delta cmp={d.profitCmp} money={money} against={againstName} /> : <span className="text-ink-300">Nothing recorded in {againstName} to compare with.</span>}
        </div>
        <p className="mt-2 max-w-md text-sm text-ink-300">{money(d.revenue)} coming in, {money(d.spent)} going out{d.revenue > 0 ? `: you kept ${Math.round((d.profit / d.revenue) * 100)}% of what you earned.` : '.'}</p>
        <div className="mt-6 flex items-end gap-4">
          <Spark values={d.spark} width={220} height={48} label={`${d.sparkLabel} profit: ${d.sparkWords}`} />
          <span className="pb-1 text-xs text-ink-300">{d.sparkLabel} profit</span>
        </div>
        <div className="roadline absolute inset-x-0 bottom-0 opacity-70" aria-hidden="true" />
      </div>
      <div className="bg-[var(--surface)] px-6 py-3 sm:px-8 lg:py-6">
        <dl className="divide-y divide-[var(--hairline)]">
          <Row label="Revenue" value={money(d.revenue)} note={d.revCmp && hasPrev ? <Delta cmp={d.revCmp} money={money} against="" compact className="text-xs" /> : null} />
          <Row label="Expenses" value={money(d.spent)} note={d.expCmp && hasPrev ? <Delta cmp={d.expCmp} money={money} against="" compact upIsGood={false} className="text-xs" /> : null} />
          <Row label="Distance" value={dist(d.metres)} note={d.metres ? null : 'No trips logged'} />
          <Row label={`Cost per ${uLabel}`} value={d.perUnitCost == null ? 'No trips yet' : money(d.perUnitCost)} />
          <Row label={`Profit per ${uLabel}`} value={d.perUnitProfit == null ? 'No trips yet' : money(d.perUnitProfit)} />
        </dl>
      </div>
    </section>
  );
}
