import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { useRows, useProfile } from '../state/data.js';
import { useMoney, useCurrency, useDistance } from '../lib/hooks.js';
import { categoryIcon } from '../lib/categories.js';
import { Banner, Button, Empty, PageHeader, Plate } from '../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { HBars, Trend } from '../components/charts/index.js';
import { byCategory, loadFinance, otherCurrencyCount, sumCents, sumDistance, within } from '../core/calc.js';
import { periodRange, periodTitle } from '../core/dates.js';
import { toCSV } from '../core/csv.js';
import { fmtDate, plural } from '../core/format.js';
import { catLabel, compactMoney, fillBuckets, monthWindow, prevName, whenText } from './dashboard/helpers.js';
import CsvMenu from './reports/CsvMenu.jsx';
import Ledger from './reports/Ledger.jsx';
import LoadTable from './reports/LoadTable.jsx';

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const dollars = (c) => (c / 100).toFixed(2);
const KIND_LABEL = { pay: 'Pay for loads', advance: 'Advances', other: 'Other income' };

function Section({ title, sub, children, className = '', print = true }) {
  return (
    <section className={`${className} ${print ? '' : 'print:hidden'}`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-display text-2xl font-semibold leading-none">{title}</h2>
        {sub && <p className="text-sm text-ink-500 print:text-black">{sub}</p>}
      </div>
      {children}
    </section>
  );
}
const Sheet = ({ children, className = '' }) => <div className={`paper-card p-4 sm:p-6 print:border-0 print:bg-white print:p-0 ${className}`}>{children}</div>;

export default function Reports() {
  const cur = useCurrency();
  const money = useMoney();
  const dist = useDistance();
  const profile = useProfile();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const range = rangeOf(period);

  const allIncome = useRows('income');
  const allExpenses = useRows('expenses');
  const loads = useRows('loads');
  const vehicles = useRows('vehicles');
  const trips = useRows('trips');

  const title = periodTitle(period.kind, range);
  const hasPrev = period.kind !== 'all';
  const prevRange = useMemo(() => (hasPrev ? periodRange(period.kind, new Date(), period.offset - 1) : null), [period.kind, period.offset]);

  const income = useMemo(() => within(allIncome, 'received_at', range), [allIncome, period.kind, period.offset]);
  const expenses = useMemo(() => within(allExpenses, 'spent_at', range), [allExpenses, period.kind, period.offset]);
  const pIncome = useMemo(() => (prevRange ? within(allIncome, 'received_at', prevRange) : []), [allIncome, prevRange]);
  const pExpenses = useMemo(() => (prevRange ? within(allExpenses, 'spent_at', prevRange) : []), [allExpenses, prevRange]);

  const revenue = sumCents(income, cur);
  const spent = sumCents(expenses, cur);
  const net = revenue - spent;
  const margin = revenue > 0 ? Math.round((net / revenue) * 100) : null;
  const cats = byCategory(expenses, cur);
  const pCats = byCategory(pExpenses, cur);
  const mixed = otherCurrencyCount(income, cur) + otherCurrencyCount(expenses, cur);
  const nothing = !income.length && !expenses.length;

  const ledger = useMemo(() => {
    const kinds = ['pay', 'advance', 'other'].map((k) => ({ id: k, label: KIND_LABEL[k], cents: sumCents(income.filter((i) => i.kind === k), cur), prev: sumCents(pIncome.filter((i) => i.kind === k), cur) })).filter((x) => x.cents || x.prev);
    const catRows = [...new Set([...cats.map((c) => c.id), ...pCats.map((c) => c.id)])].map((id) => ({ id, label: catLabel(id), cents: cats.find((c) => c.id === id)?.cents || 0, prev: pCats.find((c) => c.id === id)?.cents || 0 })).sort((a, b) => b.cents - a.cents || b.prev - a.prev);
    const pRev = sumCents(pIncome, cur);
    const pSpent = sumCents(pExpenses, cur);
    return {
      income: { rows: kinds.filter((x) => x.cents), total: { label: 'Total revenue', cents: revenue, prev: pRev } },
      expenses: { rows: catRows.filter((x) => x.cents), total: { label: 'Total expenses', cents: spent, prev: pSpent } },
      net: { cents: net, prev: pRev - pSpent },
      pHas: pIncome.length + pExpenses.length > 0,
    };
  }, [income, expenses, pIncome, pExpenses, cur]);

  // Profit by month over a 12-month window (the year, or the year to the chosen month).
  const trend = useMemo(() => {
    const b = fillBuckets(monthWindow(period.kind, range, [...allIncome.map((r) => r.received_at), ...allExpenses.map((r) => r.spent_at)]), allIncome, allExpenses, cur);
    return b.map((x) => ({ key: x.key, label: x.label, values: { profit: x.profit }, profit: x.profit }));
  }, [allIncome, allExpenses, cur, period.kind, period.offset]);
  const known = trend.filter((t) => t.profit != null);
  const best = known.reduce((a, b) => (b.profit > (a?.profit ?? -Infinity) ? b : a), null);
  const inProfit = known.filter((t) => t.profit > 0).length;
  const trendSummary = known.some((t) => t.profit !== 0)
    ? `You made a profit in ${inProfit} of ${known.length} months. ${best ? `${best.label} was the best at ${money(best.profit)}.` : ''}`
    : 'No profit or loss recorded in this window.';

  // Loads with income or expenses in the period, or picked up in it.
  const loadRows = useMemo(() => {
    const ids = new Set([...income, ...expenses].map((r) => r.load_id).filter(Boolean));
    return loads.filter((l) => ids.has(l.id) || (l.pickup_at && within([{ t: l.pickup_at }], 't', range).length))
      .map((l) => {
        const f = loadFinance(l.id, expenses, income, cur);
        return { id: l.id, name: l.customer || l.reference || 'Load', ref: l.reference, status: l.status, rate: l.currency === cur ? l.rate_cents : 0, ...f, margin: f.income > 0 ? Math.round((f.net / f.income) * 100) : null };
      });
  }, [loads, income, expenses, cur, period.kind, period.offset]);
  const loadTotals = loadRows.reduce((a, r) => ({ income: a.income + r.income, expenses: a.expenses + r.expenses, net: a.net + r.net }), { income: 0, expenses: 0, net: 0 });
  const bestLoad = [...loadRows].filter((r) => r.margin != null).sort((a, b) => b.margin - a.margin)[0];

  const vehicleRows = useMemo(() => {
    const m = new Map();
    for (const e of expenses) if (e.vehicle_id && e.currency === cur) m.set(e.vehicle_id, (m.get(e.vehicle_id) || 0) + e.amount_cents);
    const tr = within(trips, 'started_at', range);
    return [...m.entries()].map(([id, cents]) => {
      const v = vehicles.find((x) => x.id === id);
      const metres = sumDistance(tr.filter((t) => t.vehicle_id === id));
      return { id, name: v?.name || 'Removed vehicle', plate: v?.plate, cents, metres, perKm: metres > 0 ? Math.round(cents / (metres / 1000)) : null, count: expenses.filter((e) => e.vehicle_id === id && e.currency === cur).length };
    }).sort((a, b) => b.cents - a.cents);
  }, [expenses, vehicles, trips, cur, period.kind, period.offset]);

  // Tax summary is for the calendar year of the chosen period (this year for "all").
  const taxYear = (period.kind === 'all' ? new Date() : range.from).getFullYear();
  const tax = useMemo(() => {
    const yr = periodRange('year', new Date(taxYear, 6, 1));
    const inc = within(allIncome, 'received_at', yr);
    const exp = within(allExpenses, 'spent_at', yr);
    return { income: sumCents(inc, cur), cats: byCategory(exp, cur), total: sumCents(exp, cur), mixed: otherCurrencyCount(inc, cur) + otherCurrencyCount(exp, cur) };
  }, [allIncome, allExpenses, cur, taxYear]);

  const slug = period.kind === 'all' ? 'all-time' : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const loadName = (id) => { const l = loads.find((x) => x.id === id); return l ? (l.reference || l.customer) : ''; };
  const vehName = (id) => vehicles.find((x) => x.id === id)?.name || '';
  const csv = [
    { label: 'Profit and loss', disabled: nothing, onClick: () => {
      const rows = [
        ...ledger.income.rows.map((x) => ({ section: 'Revenue', item: x.label, cents: x.cents })), { section: 'Revenue', item: 'Total revenue', cents: revenue },
        ...cats.map((c) => ({ section: 'Expenses', item: catLabel(c.id), cents: c.cents })), { section: 'Expenses', item: 'Total expenses', cents: spent },
        { section: 'Result', item: 'Net profit', cents: net },
      ];
      download(`roadbook-profit-and-loss-${slug}.csv`, toCSV(rows, [{ label: 'Section', get: (r) => r.section }, { label: 'Item', get: (r) => r.item }, { label: `Amount (${cur})`, get: (r) => dollars(r.cents) }]));
    } },
    { label: 'Expenses list', disabled: !expenses.length, onClick: () => download(`roadbook-expenses-${slug}.csv`, toCSV(expenses, [
      { label: 'Date', get: (r) => r.spent_at }, { label: 'Category', get: (r) => r.category }, { label: 'Amount', get: (r) => dollars(r.amount_cents) },
      { label: 'Currency', get: (r) => r.currency }, { label: 'Vendor', get: (r) => r.vendor }, { label: 'Note', get: (r) => r.note }, { label: 'Paid by', get: (r) => r.paid_by },
      { label: 'Litres', get: (r) => r.litres }, { label: 'Load', get: (r) => loadName(r.load_id) }, { label: 'Vehicle', get: (r) => vehName(r.vehicle_id) },
    ])) },
    { label: 'Income list', disabled: !income.length, onClick: () => download(`roadbook-income-${slug}.csv`, toCSV(income, [
      { label: 'Date', get: (r) => r.received_at }, { label: 'Kind', get: (r) => r.kind }, { label: 'Amount', get: (r) => dollars(r.amount_cents) },
      { label: 'Currency', get: (r) => r.currency }, { label: 'Load', get: (r) => loadName(r.load_id) }, { label: 'Note', get: (r) => r.note },
    ])) },
  ];

  const when = whenText(period, range);
  const headline = nothing ? '' : `${when[0].toUpperCase()}${when.slice(1)} you brought in ${money(revenue)} and spent ${money(spent)}, ${net >= 0 ? `leaving a profit of ${money(net)}` : `a loss of ${money(-net)}`}${margin != null ? ` (${margin}% of revenue)` : ''}.`;
  const catSummary = cats[0] ? `${catLabel(cats[0].id)} is the biggest cost at ${Math.round(cats[0].share * 100)}% of expenses (${money(cats[0].cents)}).` : '';

  return (
    <>
      <div className="mb-6 hidden border-b-2 border-black pb-3 print:block">
        <p className="text-xs font-bold uppercase tracking-[0.2em]">Roadbook</p>
        <h1 className="mt-1 text-3xl font-bold">Profit and loss statement</h1>
        <p className="mt-1 text-sm">{[profile.display_name, profile.truck_label].filter(Boolean).join(' · ')}{profile.display_name || profile.truck_label ? ' · ' : ''}{title} · amounts in {cur} · printed {fmtDate(new Date(), { year: true })}</p>
      </div>
      <div className="print:hidden">
        <PageHeader title="Reports" sub="Profit and loss, how each load paid and your tax summary." actions={
          <><CsvMenu items={csv} /><Button variant="dark" size="sm" icon={Printer} onClick={() => window.print()}>Print statement</Button></>} />
        <div className="mb-6"><PeriodPicker value={period} onChange={setPeriod} /></div>
        {mixed > 0 && <div className="mb-4"><Banner tone="blue">Totals show {cur} only. {plural(mixed, 'record')} in the other currency {mixed === 1 ? 'is' : 'are'} left out.</Banner></div>}
      </div>

      {nothing ? (
        <div className="print:hidden"><Empty title="No records in this period" text="Pick another period above, or add income and expenses to see your profit and loss." /></div>
      ) : (
        <div className="space-y-10">
          <p className="max-w-3xl text-xl font-bold leading-snug sm:text-2xl print:text-base">{headline}</p>

          <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Section title="Profit and loss" sub={title}>
              <Sheet><Ledger title={period.kind === 'all' ? 'All time' : period.kind === 'month' ? title.split(' ')[0] : title} income={ledger.income} expenses={ledger.expenses} net={ledger.net} margin={margin} hasPrev={hasPrev && ledger.pHas} prevLabel={prevRange ? prevName(period.kind, prevRange) : ''} money={money} /></Sheet>
            </Section>
            <div className="space-y-4 print:hidden">
              <Trend title="Profit by month" subtitle={period.kind === 'year' ? String(range.from.getFullYear()) : 'Twelve months to the chosen period'} data={trend} series={[{ id: 'profit', label: 'Profit', slot: 0 }]} min0={!known.some((t) => t.profit < 0)} format={(c) => money(c)} axisFormat={(c) => compactMoney(c, cur)} summary={trendSummary} />
              <HBars title="Where the money went" subtitle={title} summary={catSummary} format={(c) => money(c)} slot={1} items={cats.map((c) => ({ id: c.id, label: catLabel(c.id), value: c.cents, icon: categoryIcon(c.id) }))} />
            </div>
          </div>

          <Section title="Profit per load" sub={bestLoad ? `${bestLoad.name} kept the most: ${bestLoad.margin}% of what it earned.` : 'Income and costs tagged to each load.'}>
            {loadRows.length === 0
              ? <p className="rounded-[10px] border border-dashed border-ink-300 px-5 py-6 text-sm text-ink-600 dark:border-ink-600 dark:text-ink-300">No loads have income or expenses in this period. Tag pay and expenses to a load to see what each one really earned.</p>
              : <Sheet><LoadTable rows={loadRows} totals={loadTotals} money={money} /></Sheet>}
          </Section>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Section title="Cost per vehicle" sub="Expenses assigned to a vehicle" print={vehicleRows.length > 0}>
              {vehicleRows.length === 0 ? <p className="text-sm text-ink-600 dark:text-ink-300">No expenses are assigned to a vehicle in this period.</p> : (
                <Sheet className="overflow-x-auto">
                  <table className="w-full min-w-[18rem] text-sm">
                    <caption className="sr-only">Cost per vehicle</caption>
                    <thead><tr className="border-b-2 border-ink-900 text-xs uppercase tracking-wide text-ink-500 dark:border-ink-200 print:border-black print:text-black"><th scope="col" className="pb-2 text-left">Vehicle</th><th scope="col" className="hidden pb-2 text-right sm:table-cell">Distance</th><th scope="col" className="pb-2 text-right">Cost</th><th scope="col" className="pb-2 text-right">Per {dist(1000).split(' ')[1]}</th></tr></thead>
                    <tbody>{vehicleRows.map((v) => (
                      <tr key={v.id} className="border-b border-[var(--hairline)]">
                        <th scope="row" className="py-2.5 text-left font-normal"><span className="font-bold">{v.name}</span> {v.plate && <Plate className="ml-1 align-middle">{v.plate}</Plate>}<div className="text-xs text-ink-500 print:text-black">{plural(v.count, 'expense')}</div></th>
                        <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{v.metres ? dist(v.metres) : '-'}</td>
                        <td className="py-2.5 text-right font-bold tabular-nums">{money(v.cents)}</td>
                        <td className="py-2.5 text-right tabular-nums">{v.perKm ? money(Math.round(v.perKm * (dist(1000).endsWith('mi') ? 1.609344 : 1))) : '-'}</td>
                      </tr>))}</tbody>
                  </table>
                </Sheet>
              )}
            </Section>

            <Section title={`Tax summary ${taxYear}`} sub={`Calendar year, ${cur} only`}>
              <Sheet>
                <table className="w-full text-sm">
                  <caption className="sr-only">Tax summary for {taxYear}</caption>
                  <tbody>
                    <tr className="border-b border-ink-900 font-bold dark:border-ink-200 print:border-black"><th scope="row" className="py-2 text-left">Total income</th><td className="py-2 text-right tabular-nums">{money(tax.income)}</td></tr>
                    <tr><th scope="colgroup" colSpan={2} className="pb-1 pt-4 text-left text-xs font-bold uppercase tracking-[0.14em] text-ink-500 print:text-black">Expenses you may deduct</th></tr>
                    {tax.cats.length ? tax.cats.map((c) => <tr key={c.id} className="border-b border-[var(--hairline)]"><th scope="row" className="py-1.5 pl-4 text-left font-normal">{catLabel(c.id)}</th><td className="py-1.5 text-right tabular-nums">{money(c.cents)}</td></tr>)
                      : <tr><td colSpan={2} className="py-2 pl-4 text-ink-500">No expenses recorded this year.</td></tr>}
                    <tr className="border-t border-ink-900 font-bold dark:border-ink-200 print:border-black"><th scope="row" className="py-2 text-left">Total expenses</th><td className="py-2 text-right tabular-nums">{money(tax.total)}</td></tr>
                    <tr className="border-y-4 border-double border-ink-900 text-base font-bold dark:border-ink-200 print:border-black"><th scope="row" className="py-3 text-left">Taxable profit</th><td className="py-3 text-right tabular-nums">{money(tax.income - tax.total)}</td></tr>
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-ink-500 print:text-black">{tax.mixed > 0 ? `${plural(tax.mixed, 'record')} in the other currency left out. ` : ''}Check with your accountant what is deductible.</p>
              </Sheet>
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
