import { useMemo } from 'react';
import { Fuel, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Card, Empty, Button, cx } from '../../components/ui.jsx';
import { Trend, Bars } from '../../components/charts/index.js';
import { fuelEconomy, within } from '../../core/calc.js';
import { addDays } from '../../core/dates.js';
import { fmtDate, fmtTime, fmtMoney } from '../../core/format.js';
import { useMoney, useDistance } from '../../lib/hooks.js';
import Hero from './Hero.jsx';

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const r1 = (n) => Math.round(n * 10) / 10;

function Change({ now, before, fmt }) {
  if (now == null || before == null) return <span className="text-ink-400">-</span>;
  const d = now - before;
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  return <span className={cx('inline-flex items-center gap-0.5 text-xs font-bold', d > 0 ? 'text-[var(--bad)]' : d < 0 ? 'text-[var(--good)]' : 'text-ink-500')}><Icon size={13} strokeWidth={3} />{d === 0 ? 'same' : fmt(Math.abs(d))}<span className="sr-only">{d > 0 ? ' dearer than the fill before' : d < 0 ? ' cheaper than the fill before' : ''}</span></span>;
}

/**
 * Fuel log and charts. `all` = every fuel expense in the working currency; `range`/`kind` = the period chosen above.
 * Stats and the log follow the period. Charts look back far enough to show a trend (stated in their subtitles).
 */
export default function FuelTab({ all, range, kind, cur, onOpen, onAdd }) {
  const money = useMoney();
  const dist = useDistance();

  const fills = useMemo(() => {
    const asc = all.filter((e) => e.category === 'fuel').sort((a, b) => new Date(a.spent_at) - new Date(b.spent_at));
    let prevOdo = null; let prev = null;
    return asc.map((e) => {
      const ppl = e.litres > 0 ? Math.round(e.amount_cents / e.litres) : null;
      const gap = e.odometer_m != null && prevOdo != null && e.odometer_m > prevOdo ? e.odometer_m - prevOdo : null;
      const l100 = gap && e.litres > 0 ? r1((e.litres / (gap / 1000)) * 100) : null;
      const row = { raw: e, ppl, gap, l100, prevPpl: prev?.ppl ?? null, prevCost: prev?.raw.amount_cents ?? null, at: new Date(e.spent_at) };
      if (e.odometer_m != null) prevOdo = e.odometer_m;
      prev = row;
      return row;
    });
  }, [all]);

  const inPeriod = useMemo(() => within(fills.map((f) => ({ ...f, spent_at: f.raw.spent_at })), 'spent_at', range), [fills, range]);

  // chart window: the period itself for a year / all time, otherwise six months back from its end
  const win = useMemo(() => {
    const now = new Date();
    const end = new Date(Math.min(range.to.getTime(), new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()));
    let from;
    if (kind === 'year') from = range.from;
    else if (kind === 'all') { const first = fills[0]?.at || now; from = new Date(Math.max(first.getTime(), new Date(end.getFullYear(), end.getMonth() - 11, 1).getTime())); from = new Date(from.getFullYear(), from.getMonth(), 1); }
    else from = new Date(end.getFullYear(), end.getMonth() - 6, 1);
    return { from, to: end, label: kind === 'year' ? String(range.from.getFullYear()) : kind === 'all' ? 'the last 12 months' : 'the last 6 months' };
  }, [range, kind, fills]);

  const months = useMemo(() => {
    const out = []; const d = new Date(win.from.getFullYear(), win.from.getMonth(), 1);
    while (d < win.to && out.length < 24) { out.push({ key: monthKey(d), label: new Intl.DateTimeFormat('en-GB', { month: 'short', ...(kind === 'year' ? {} : { year: '2-digit' }) }).format(d), litres: 0 }); d.setMonth(d.getMonth() + 1); }
    for (const f of fills) { const m = out.find((x) => x.key === monthKey(f.at)); if (m) m.litres += f.raw.litres || 0; }
    return out;
  }, [fills, win, kind]);
  const trendFills = useMemo(() => fills.filter((f) => f.ppl && f.at >= win.from && f.at < addDays(win.to, 0)), [fills, win]);

  const litres = inPeriod.reduce((a, f) => a + (f.raw.litres || 0), 0);
  const spend = inPeriod.reduce((a, f) => a + f.raw.amount_cents, 0);
  const lit = inPeriod.filter((f) => f.raw.litres > 0);
  const avgPpl = lit.length ? Math.round(lit.reduce((a, f) => a + f.raw.amount_cents, 0) / lit.reduce((a, f) => a + f.raw.litres, 0)) : null;
  const economy = fuelEconomy(inPeriod.map((f) => f.raw));
  const cheapest = useMemo(() => {
    const m = {};
    for (const f of inPeriod) if (f.raw.vendor && f.raw.litres > 0) { const k = f.raw.vendor; (m[k] ||= { c: 0, l: 0 }); m[k].c += f.raw.amount_cents; m[k].l += f.raw.litres; }
    const list = Object.entries(m).map(([v, x]) => ({ v, ppl: Math.round(x.c / x.l) })).sort((a, b) => a.ppl - b.ppl);
    return list.length > 1 ? list[0] : null;
  }, [inPeriod]);

  if (!all.length) {
    return <Empty icon={Fuel} title="No fuel fill-ups yet" text="Log a fill with the litres and odometer to see your price per litre, how much fuel you buy each month and your fuel economy." action={onAdd} />;
  }

  const pplVals = trendFills.map((f) => f.ppl);
  const trendSummary = trendFills.length >= 2
    ? `Price per litre ${pplVals.at(-1) > pplVals[0] ? 'rose' : pplVals.at(-1) < pplVals[0] ? 'fell' : 'stayed level'} from ${money(pplVals[0])} to ${money(pplVals.at(-1))} over ${trendFills.length} fill-ups in ${win.label}. Cheapest ${money(Math.min(...pplVals))}, dearest ${money(Math.max(...pplVals))}.`
    : '';
  const peak = months.reduce((a, m) => (m.litres > a.litres ? m : a), months[0] || { litres: 0, label: '' });
  const barsSummary = months.length ? `You bought ${r1(months.reduce((a, m) => a + m.litres, 0))} litres in ${win.label}. The most was ${r1(peak.litres)} litres in ${peak.label}.` : '';

  return (
    <div className="space-y-4">
      <Hero label="Fuel spend" value={money(spend, cur)} sub={`${inPeriod.length} fill-up${inPeriod.length === 1 ? '' : 's'} in this period`}
        items={[{ label: 'Litres', value: `${r1(litres)} L` }, { label: 'Average price', value: avgPpl ? `${money(avgPpl, cur)}/L` : 'n/a' }, { label: 'Economy', value: economy ? `${economy} L/100km` : 'n/a' }]} />
      {cheapest && <p className="text-sm text-ink-600 dark:text-ink-300">Cheapest station this period: <b className="text-ink-900 dark:text-white">{cheapest.v}</b> at {money(cheapest.ppl, cur)} per litre.</p>}
      {!economy && inPeriod.length > 0 && <p className="text-xs text-ink-500">Economy needs two fills with the odometer filled in.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {trendFills.length >= 2 ? (
          <Trend title="Price per litre" subtitle={`Each fill-up, ${win.label}`} summary={trendSummary}
            data={trendFills.map((f, i) => ({ key: String(i), label: fmtDate(f.at, { weekday: false }), values: { ppl: f.ppl / 100 } }))}
            series={[{ id: 'ppl', label: 'Price per litre', slot: 1 }]} min0={false}
            format={(n) => fmtMoney(Math.round(n * 100), cur)} axisFormat={(n) => fmtMoney(Math.round(n * 100), cur)} />
        ) : (
          <Card><h3 className="font-display text-lg font-semibold">Price per litre</h3><p className="mt-2 text-sm text-ink-500">Log at least two fills with litres to see the price trend.</p></Card>
        )}
        <Bars title="Litres per month" subtitle={`Fuel bought, ${win.label}`} summary={barsSummary}
          data={months.map((m) => ({ key: m.key, label: m.label, values: { litres: m.litres } }))}
          series={[{ id: 'litres', label: 'Litres', slot: 1 }]} format={(n) => `${r1(n)} L`} axisFormat={(n) => `${r1(n)}`} />
      </div>

      <section aria-label="Fuel log" className="paper-card overflow-hidden">
        <div className="flex items-center justify-between border-b-2 border-ink-800 px-4 py-3 dark:border-ink-300">
          <h2 className="font-display text-xl font-bold uppercase tracking-wide">Fuel log</h2>
          <span className="text-xs font-bold text-ink-500">{inPeriod.length} fill-up{inPeriod.length === 1 ? '' : 's'}</span>
        </div>
        {inPeriod.length === 0 ? (
          <div className="p-5 text-sm text-ink-500">No fill-ups in this period. Pick another period above or <Button variant="ghost" size="sm" onClick={onAdd?.props?.onClick}>log one</Button>.</div>
        ) : (
          <>
            <table className="hidden w-full border-collapse text-left text-sm md:table">
              <thead><tr className="border-b border-[var(--hairline)] text-xs font-bold uppercase tracking-wide text-ink-500">
                <th className="px-4 py-2.5">Date</th><th className="px-3 py-2.5">Station</th><th className="px-3 py-2.5 text-right">Litres</th><th className="px-3 py-2.5 text-right">Cost</th><th className="px-3 py-2.5 text-right">Per litre</th><th className="px-3 py-2.5 text-right">Odometer</th><th className="px-4 py-2.5 text-right">Since last fill</th>
              </tr></thead>
              <tbody>
                {[...inPeriod].reverse().map((f) => (
                  <tr key={f.raw.id} tabIndex={0} onClick={() => onOpen(f.raw)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(f.raw); }} className="cursor-pointer border-b border-[var(--hairline)] last:border-b-0 hover:bg-brand-50/60 dark:hover:bg-ink-800/50">
                    <td className="whitespace-nowrap px-4 py-3">{fmtDate(f.raw.spent_at)}<span className="block text-xs text-ink-500">{fmtTime(f.raw.spent_at)}</span></td>
                    <td className="px-3 py-3 font-bold">{f.raw.vendor || '-'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{f.raw.litres ? `${f.raw.litres} L` : '-'}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums">{money(f.raw.amount_cents, f.raw.currency)}<span className="block"><Change now={f.raw.amount_cents} before={f.prevCost} fmt={(c) => money(c, cur)} /></span></td>
                    <td className="px-3 py-3 text-right tabular-nums">{f.ppl ? money(f.ppl, f.raw.currency) : '-'}<span className="block"><Change now={f.ppl} before={f.prevPpl} fmt={(c) => money(c, cur)} /></span></td>
                    <td className="px-3 py-3 text-right tabular-nums">{f.raw.odometer_m != null ? dist(f.raw.odometer_m) : '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.gap ? dist(f.gap) : '-'}{f.l100 ? <span className="block text-xs text-ink-500">{f.l100} L/100km</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="md:hidden">
              {[...inPeriod].reverse().map((f) => (
                <li key={f.raw.id} className="border-b border-[var(--hairline)] last:border-b-0">
                  <button type="button" onClick={() => onOpen(f.raw)} className="block w-full px-4 py-3 text-left">
                    <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate font-bold">{f.raw.vendor || 'Fuel'}</span><span className="shrink-0 font-bold tabular-nums">{money(f.raw.amount_cents, f.raw.currency)}</span></div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-ink-500"><span>{fmtDate(f.raw.spent_at)}, {fmtTime(f.raw.spent_at)}</span><span className="tabular-nums">{f.raw.litres ? `${f.raw.litres} L` : ''}{f.ppl ? ` · ${money(f.ppl, f.raw.currency)}/L` : ''}</span></div>
                    {(f.gap || f.prevPpl) && <div className="mt-1 flex items-center justify-between gap-3 text-xs"><span className="text-ink-500">{f.gap ? `${dist(f.gap)} since last fill${f.l100 ? ` · ${f.l100} L/100km` : ''}` : ''}</span><Change now={f.ppl} before={f.prevPpl} fmt={(c) => `${money(c, cur)}/L`} /></div>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
