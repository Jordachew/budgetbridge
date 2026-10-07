import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Printer } from 'lucide-react';
import { useRows } from '../state/data.js';
import { useMoney, useCurrency } from '../lib/hooks.js';
import { Banner, Button, Card, CardTitle, Empty, PageHeader, Stat } from '../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { byCategory, loadFinance, otherCurrencyCount, sumCents, within } from '../core/calc.js';
import { periodRange, periodTitle } from '../core/dates.js';
import { toCSV } from '../core/csv.js';
import { fmtDate, plural } from '../core/format.js';
import { makeBuckets, trendSeries } from './dashboard/helpers.js';
import { TrendChart, TrendLegend, catLabel } from './dashboard/charts.jsx';

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const dollars = (c) => (c / 100).toFixed(2);

function SortHead({ col, sort, setSort, children, right, hide }) {
  const on = sort.key === col;
  return (
    <th className={`px-4 py-2.5 font-medium ${right ? 'text-right' : ''} ${hide ? 'hidden sm:table-cell' : ''}`} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort({ key: col, dir: on ? -sort.dir : -1 })} className={`inline-flex items-center gap-1 uppercase tracking-wide ${right ? 'flex-row-reverse' : ''}`}>
        {children}{on && (sort.dir > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
}

const Row = ({ label, value, bold, tone }) => (
  <div className={`flex items-center justify-between py-2 text-sm ${bold ? 'font-bold' : ''}`}>
    <span>{label}</span><span className={`tabular-nums ${tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{value}</span>
  </div>
);

const KIND_LABEL = { pay: 'Pay for loads', advance: 'Advances', other: 'Other income' };

export default function Reports() {
  const cur = useCurrency();
  const money = useMoney();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const [sort, setSort] = useState({ key: 'net', dir: -1 });
  const range = rangeOf(period);

  const allIncome = useRows('income');
  const allExpenses = useRows('expenses');
  const loads = useRows('loads');
  const vehicles = useRows('vehicles');

  const income = useMemo(() => within(allIncome, 'received_at', range), [allIncome, period.kind, period.offset]);
  const expenses = useMemo(() => within(allExpenses, 'spent_at', range), [allExpenses, period.kind, period.offset]);

  const revenue = sumCents(income, cur);
  const spent = sumCents(expenses, cur);
  const net = revenue - spent;
  const cats = byCategory(expenses, cur);
  const incomeKinds = ['pay', 'advance', 'other'].map((k) => ({ k, cents: sumCents(income.filter((i) => i.kind === k), cur) })).filter((x) => x.cents);
  const mixed = otherCurrencyCount(income, cur) + otherCurrencyCount(expenses, cur);
  const title = periodTitle(period.kind, range);

  const series = useMemo(() => {
    // Trend: for a week or month show that period; otherwise months.
    return trendSeries(makeBuckets(period.kind, range, [...income.map((r) => r.received_at), ...expenses.map((r) => r.spent_at)]), income, expenses, cur);
  }, [income, expenses, cur, period.kind, period.offset]);

  // Loads that have any activity (income or expenses) in the period, or were picked up in it.
  const loadRows = useMemo(() => {
    const ids = new Set([...income, ...expenses].map((r) => r.load_id).filter(Boolean));
    const rows = loads.filter((l) => ids.has(l.id) || (l.pickup_at && within([{ t: l.pickup_at }], 't', range).length))
      .map((l) => {
        const f = loadFinance(l.id, expenses, income, cur);
        return { id: l.id, name: l.customer || l.reference || 'Load', ref: l.reference, status: l.status, rate: l.currency === cur ? l.rate_cents : 0, ...f };
      });
    return rows.sort((a, b) => (typeof a[sort.key] === 'string' ? a[sort.key].localeCompare(b[sort.key]) * -sort.dir : (a[sort.key] - b[sort.key]) * sort.dir));
  }, [loads, income, expenses, cur, sort, period.kind, period.offset]);

  const vehicleRows = useMemo(() => {
    const m = new Map();
    for (const e of expenses) if (e.vehicle_id && e.currency === cur) m.set(e.vehicle_id, (m.get(e.vehicle_id) || 0) + e.amount_cents);
    return [...m.entries()].map(([id, cents]) => {
      const v = vehicles.find((x) => x.id === id);
      return { id, name: v ? `${v.name}${v.plate ? ` (${v.plate})` : ''}` : 'Removed vehicle', cents, count: expenses.filter((e) => e.vehicle_id === id && e.currency === cur).length };
    }).sort((a, b) => b.cents - a.cents);
  }, [expenses, vehicles, cur]);

  // Tax summary is always for the calendar year of the chosen period (or this year for "all").
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

  const csvExpenses = () => download(`roadbook-expenses-${slug}.csv`, toCSV(expenses, [
    { label: 'Date', get: (r) => r.spent_at }, { label: 'Category', get: (r) => r.category }, { label: 'Amount', get: (r) => dollars(r.amount_cents) },
    { label: 'Currency', get: (r) => r.currency }, { label: 'Vendor', get: (r) => r.vendor }, { label: 'Note', get: (r) => r.note }, { label: 'Paid by', get: (r) => r.paid_by },
    { label: 'Litres', get: (r) => r.litres }, { label: 'Load', get: (r) => loadName(r.load_id) }, { label: 'Vehicle', get: (r) => vehName(r.vehicle_id) },
  ]));
  const csvIncome = () => download(`roadbook-income-${slug}.csv`, toCSV(income, [
    { label: 'Date', get: (r) => r.received_at }, { label: 'Kind', get: (r) => r.kind }, { label: 'Amount', get: (r) => dollars(r.amount_cents) },
    { label: 'Currency', get: (r) => r.currency }, { label: 'Load', get: (r) => loadName(r.load_id) }, { label: 'Note', get: (r) => r.note },
  ]));
  const csvPL = () => {
    const rows = [
      ...incomeKinds.map((x) => ({ section: 'Revenue', item: KIND_LABEL[x.k], cents: x.cents })),
      { section: 'Revenue', item: 'Total revenue', cents: revenue },
      ...cats.map((c) => ({ section: 'Expenses', item: catLabel(c.id), cents: c.cents })),
      { section: 'Expenses', item: 'Total expenses', cents: spent },
      { section: 'Result', item: 'Net profit', cents: net },
    ];
    download(`roadbook-profit-and-loss-${slug}.csv`, toCSV(rows, [{ label: 'Section', get: (r) => r.section }, { label: 'Item', get: (r) => r.item }, { label: `Amount (${cur})`, get: (r) => dollars(r.cents) }]));
  };

  const nothing = !income.length && !expenses.length;

  return (
    <>
      <div className="print-header mb-4 hidden print:block">
        <h1 className="text-2xl font-bold">Roadbook report</h1>
        <p className="text-sm">{title} · {cur} · printed {fmtDate(new Date(), { year: true })}</p>
      </div>
      <PageHeader title="Reports" sub="Profit and loss, per-load results and your tax summary." actions={
        <div className="no-print flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" icon={Download} onClick={csvPL} disabled={nothing}>P&amp;L CSV</Button>
          <Button variant="outline" size="sm" icon={Download} onClick={csvExpenses} disabled={!expenses.length}>Expenses CSV</Button>
          <Button variant="outline" size="sm" icon={Download} onClick={csvIncome} disabled={!income.length}>Income CSV</Button>
          <Button variant="dark" size="sm" icon={Printer} onClick={() => window.print()}>Print</Button>
        </div>} />
      <div className="no-print mb-5"><PeriodPicker value={period} onChange={setPeriod} /></div>
      {mixed > 0 && <div className="mb-4"><Banner tone="blue">Totals show {cur} only. {plural(mixed, 'record')} in the other currency {mixed === 1 ? 'is' : 'are'} left out.</Banner></div>}

      {nothing ? (
        <Empty title="No records in this period" text="Pick another period, or add income and expenses to see your profit and loss." />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Revenue" value={money(revenue)} />
            <Stat label="Expenses" value={money(spent)} />
            <Stat label="Net profit" value={money(net)} tone={net > 0 ? 'good' : net < 0 ? 'bad' : undefined} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="print-area">
              <CardTitle title="Profit & loss" sub={title} />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Revenue</h4>
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {incomeKinds.length ? incomeKinds.map((x) => <Row key={x.k} label={KIND_LABEL[x.k]} value={money(x.cents)} />) : <Row label="No income" value={money(0)} />}
                <Row bold label="Total revenue" value={money(revenue)} />
              </div>
              <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">Expenses</h4>
              <div className="divide-y divide-ink-100 dark:divide-ink-800">
                {cats.length ? cats.map((c) => <Row key={c.id} label={catLabel(c.id)} value={money(c.cents)} />) : <Row label="No expenses" value={money(0)} />}
                <Row bold label="Total expenses" value={money(spent)} />
              </div>
              <div className="mt-3 border-t-2 border-ink-900 pt-1 dark:border-ink-200"><Row bold label="Net profit" value={money(net)} tone={net > 0 ? 'good' : net < 0 ? 'bad' : undefined} /></div>
            </Card>

            <Card>
              <CardTitle title={period.kind === 'week' ? 'Daily trend' : period.kind === 'month' ? 'Weekly trend' : 'Monthly trend'} sub={title} action={<TrendLegend />} />
              <TrendChart data={series} cur={cur} summary={`Revenue against expenses for ${title}. Revenue ${money(revenue)}, expenses ${money(spent)}, net ${money(net)}.`} />
            </Card>
          </div>

          <Card>
            <CardTitle title="Profit per load" sub="Income and expenses tagged to each load in this period" />
            {loadRows.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">No loads have income or expenses in this period. Tag expenses and pay to a load to see its profit.</p> : (
              <div className="overflow-x-auto rounded-xl ring-1 ring-ink-200/70 dark:ring-ink-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ink-50 text-xs text-ink-500 dark:bg-ink-900/60"><tr>
                    <SortHead col="name" sort={sort} setSort={setSort}>Load</SortHead>
                    <SortHead col="rate" sort={sort} setSort={setSort} right hide>Rate</SortHead>
                    <SortHead col="income" sort={sort} setSort={setSort} right>Income</SortHead>
                    <SortHead col="expenses" sort={sort} setSort={setSort} right>Expenses</SortHead>
                    <SortHead col="net" sort={sort} setSort={setSort} right>Net</SortHead>
                  </tr></thead>
                  <tbody className="divide-y divide-ink-100 bg-white dark:divide-ink-800 dark:bg-ink-900">
                    {loadRows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3"><div className="font-medium">{r.name}</div>{r.ref && r.ref !== r.name && <div className="text-xs text-ink-500">{r.ref}</div>}</td>
                        <td className="hidden px-4 py-3 text-right tabular-nums text-ink-500 sm:table-cell">{money(r.rate)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(r.income)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{money(r.expenses)}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${r.net < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(r.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {vehicleRows.length > 0 && (
            <Card>
              <CardTitle title="Cost per vehicle" sub="Expenses assigned to a vehicle" />
              <div className="overflow-x-auto rounded-xl ring-1 ring-ink-200/70 dark:ring-ink-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500 dark:bg-ink-900/60"><tr><th className="px-4 py-2.5 font-medium">Vehicle</th><th className="px-4 py-2.5 text-right font-medium">Expenses</th><th className="px-4 py-2.5 text-right font-medium">Total</th></tr></thead>
                  <tbody className="divide-y divide-ink-100 bg-white dark:divide-ink-800 dark:bg-ink-900">
                    {vehicleRows.map((v) => <tr key={v.id}><td className="px-4 py-3 font-medium">{v.name}</td><td className="px-4 py-3 text-right tabular-nums text-ink-500">{v.count}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(v.cents)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      <Card className="mt-6 print-area">
        <CardTitle title={`Tax summary ${taxYear}`} sub={`Calendar year, ${cur} only. Check with your accountant what is deductible.`} />
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <div className="text-xs text-ink-500">Total income</div>
            <div className="text-2xl font-bold tabular-nums">{money(tax.income)}</div>
            <div className="mt-3 text-xs text-ink-500">Total deductible expenses</div>
            <div className="text-2xl font-bold tabular-nums">{money(tax.total)}</div>
            <div className="mt-3 text-xs text-ink-500">Taxable profit (income minus expenses)</div>
            <div className="text-2xl font-bold tabular-nums">{money(tax.income - tax.total)}</div>
            {tax.mixed > 0 && <p className="mt-2 text-xs text-ink-500">{plural(tax.mixed, 'record')} in the other currency left out.</p>}
          </div>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            {tax.cats.length ? tax.cats.map((c) => <Row key={c.id} label={catLabel(c.id)} value={money(c.cents)} />) : <p className="text-sm text-ink-500">No expenses recorded this year.</p>}
          </div>
        </div>
      </Card>
    </>
  );
}
