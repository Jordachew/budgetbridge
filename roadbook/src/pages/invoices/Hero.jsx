import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import ChartFrame from '../../components/charts/ChartFrame.jsx';
import { cx } from '../../components/ui.jsx';
import { fmtMoney, plural } from '../../core/format.js';
import { ChaseMenu } from './ChaseMenu.jsx';
import { ageing, debtors } from './helpers.js';
import { todayStr } from './totals.js';

const word = (n, one) => plural(n, one);

/** The one number this page leads with: what customers owe you right now, who, and how late. */
export function WhoOwes({ invoices, cur, today = todayStr() }) {
  const a = ageing(invoices, cur, today);
  const who = debtors(invoices, cur, today);
  const otherText = Object.entries(a.others).filter(([, c]) => c > 0).map(([k, c]) => fmtMoney(c, k)).join(' + ');
  const clear = a.total === 0 && !otherText;
  return (
    <section aria-label="Who owes you" className="no-print overflow-hidden rounded-[10px] bg-ink-950 text-white ring-1 ring-black/20 dark:bg-ink-900 dark:ring-white/10">
      <div className="grid lg:grid-cols-[1.15fr_1fr]">
        <div className="p-6 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-400">Who owes you</p>
          <p className="mt-3 text-5xl font-bold leading-none tracking-tight sm:text-6xl" aria-label={`Outstanding ${fmtMoney(a.total, cur)}`}>{fmtMoney(a.total, cur)}</p>
          {clear ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-ink-200"><CheckCircle2 size={17} className="text-emerald-400" /> Nobody owes you anything right now. Nice.</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-200">
                outstanding on {word(a.count, 'sent invoice')} from {word(who.length, 'customer')}
                {otherText && <span className="text-ink-300">, plus {otherText} in another currency</span>}
              </p>
              {a.overdueCents > 0 ? (
                <p className="mt-5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[6px] bg-red-500/15 px-3 py-2 text-sm font-bold text-red-200 ring-1 ring-red-400/30">
                  <AlertTriangle size={17} aria-hidden /> Overdue: {fmtMoney(a.overdueCents, cur)}
                  <span className="font-normal text-red-200/80">on {word(a.overdueCount, 'invoice')}</span>
                </p>
              ) : (
                <p className="mt-5 inline-flex items-center gap-2 rounded-[6px] bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-200 ring-1 ring-emerald-300/25"><CheckCircle2 size={17} aria-hidden /> Nothing is overdue</p>
              )}
            </>
          )}
        </div>
        {who.length > 0 && (
          <div className="border-t border-white/10 p-6 md:p-8 lg:border-l lg:border-t-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Chase first</p>
            <ul className="mt-3 divide-y divide-white/10">
              {who.slice(0, 3).map((d) => (
                <li key={d.name} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{d.name}</p>
                    <p className={cx('text-xs', d.worst > 0 ? 'text-red-200' : 'text-ink-300')}>{d.worst > 0 ? `${plural(d.worst, 'day')} overdue` : 'Not due yet'} · {word(d.invs.length, 'invoice')}</p>
                  </div>
                  <span className="shrink-0 text-lg font-bold">{fmtMoney(d.cents, cur)}</span>
                  <span className="shrink-0 [&_button]:border-white/30 [&_button]:text-white [&_button:hover]:bg-white/10"><ChaseMenu invs={d.invs} /></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="roadline" aria-hidden="true" />
    </section>
  );
}

/** Ageing strip: one stacked bar, one-hue steps (the darker, the later), a legend with amounts and a table twin. */
export function AgeingStrip({ invoices, cur, today = todayStr(), active, onPick }) {
  const a = ageing(invoices, cur, today);
  if (!a.count) return null;
  const shade = (mix) => `color-mix(in srgb, var(--series-1) ${mix}%, var(--surface))`;
  const live = a.buckets.filter((b) => b.cents > 0);
  const summary = `${fmtMoney(a.total, cur)} is owed. ${a.overdueCents > 0 ? `${fmtMoney(a.overdueCents, cur)} is overdue: ${a.buckets.filter((b) => b.id !== 'current' && b.cents).map((b) => `${fmtMoney(b.cents, cur)} ${b.label} overdue`).join(', ')}.` : 'None of it is overdue.'}`;
  return (
    <ChartFrame className="mt-4 !p-5" title="How late is the money?" subtitle={`Owed to you in ${cur === 'USD' ? 'US dollars' : 'Jamaican dollars'}, by days past the due date. Tap a step to see those invoices.`}
      summary={summary} table={{ columns: ['Age', 'Invoices', 'Amount'], rows: a.buckets.map((b) => [`${b.label} ${b.id === 'current' ? '' : 'overdue'}`.trim(), b.count, fmtMoney(b.cents, cur)]) }}>
      {() => (
        <div>
          <div className="flex h-6 w-full gap-[2px]" role="img" aria-label={summary}>
            {live.map((b, i) => (
              <button key={b.id} type="button" onClick={() => onPick(active === b.id ? null : b.id)} aria-pressed={active === b.id} title={`${b.label}: ${fmtMoney(b.cents, cur)}`}
                className={cx('h-full min-w-[6px] outline-offset-2 transition-opacity', i === live.length - 1 && 'rounded-r-[4px]', active && active !== b.id && 'opacity-35')}
                style={{ flex: `${b.cents} 1 0`, background: shade(b.mix) }}><span className="sr-only">{b.label}</span></button>
            ))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            {a.buckets.map((b) => (
              <li key={b.id}>
                <button type="button" disabled={!b.count} onClick={() => onPick(active === b.id ? null : b.id)} aria-pressed={active === b.id}
                  className={cx('block w-full rounded-md border-l-[3px] py-0.5 pl-3 text-left', b.count ? 'hover:bg-ink-100 dark:hover:bg-ink-800' : 'cursor-default opacity-60', active === b.id && 'bg-ink-100 dark:bg-ink-800')} style={{ borderColor: shade(b.mix) }}>
                  <span className="block text-xs text-ink-500">{b.label}{b.id !== 'current' ? ' overdue' : ''}</span>
                  <span className="block text-lg font-bold leading-tight">{fmtMoney(b.cents, cur)}</span>
                  <span className="block text-xs text-ink-500">{b.count ? word(b.count, 'invoice') : 'none'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartFrame>
  );
}
