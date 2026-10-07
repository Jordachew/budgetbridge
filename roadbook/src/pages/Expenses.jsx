import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Download, Search, Receipt, Trash2, X, Camera } from 'lucide-react';
import { PageHeader, Button, Empty, Input, Segmented, Badge, Plate, cx } from '../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { HBars } from '../components/charts/index.js';
import { useRows } from '../state/data.js';
import { useMoney, useCurrency } from '../lib/hooks.js';
import { useFileUrl } from '../lib/files.js';
import { useToast } from '../components/toast.jsx';
import { softDelete } from '../lib/undo.js';
import { sumCents, otherCurrencyCount, within, byCategory } from '../core/calc.js';
import { periodTitle } from '../core/dates.js';
import { fmtDate, fmtTime, toDateInput, plural } from '../core/format.js';
import { toCSV } from '../core/csv.js';
import { categoryIcon, CATEGORIES, CATEGORY_COLORS } from '../lib/categories.js';
import ExpenseForm from './expenses/ExpenseForm.jsx';
import FuelTab from './expenses/FuelTab.jsx';
import Hero from './expenses/Hero.jsx';

const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || 'Other';
const validCat = (c) => (CATEGORIES.some((x) => x.id === c) ? c : null);

/** Receipt photo if there is one, otherwise the category icon. A tiny category badge sits on the photo. */
function Lead({ e }) {
  const url = useFileUrl(e.receipt_path);
  const Icon = categoryIcon(e.category);
  const col = CATEGORY_COLORS[e.category];
  if (e.receipt_path) {
    return (
      <span className="relative block h-11 w-11 shrink-0">
        {url ? <img src={url} alt="Receipt" className="h-11 w-11 rounded-md object-cover ring-1 ring-ink-300 dark:ring-ink-600" /> : <span className="flex h-11 w-11 items-center justify-center rounded-md bg-ink-100 text-ink-400 dark:bg-ink-800" role="img" aria-label="Receipt (loading)"><Receipt size={18} /></span>}
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface)] ring-1 ring-ink-300 dark:ring-ink-600" style={{ color: col }} aria-hidden="true"><Icon size={11} strokeWidth={2.6} /></span>
      </span>
    );
  }
  return <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md" style={{ background: `${col}22`, color: col }} aria-hidden="true"><Icon size={20} /></span>;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function dayLabel(key) {
  const today = toDateInput(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === today) return 'Today';
  if (key === toDateInput(y)) return 'Yesterday';
  return fmtDate(`${key}T12:00`, { year: new Date(`${key}T12:00`).getFullYear() !== new Date().getFullYear() });
}

export default function Expenses() {
  const all = useRows('expenses');
  const loads = useRows('loads');
  const vehicles = useRows('vehicles');
  const money = useMoney();
  const cur = useCurrency();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const [cat, setCat] = useState(() => (params.get('new') === '1' ? 'all' : validCat(params.get('cat')) || 'all'));
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('spending');
  const [editing, setEditing] = useState(null);
  const formOpen = params.get('new') === '1' || !!editing;
  const closeForm = () => {
    setEditing(null);
    if (params.has('new') || params.has('load') || params.has('cat')) { const p = new URLSearchParams(params); p.delete('new'); p.delete('load'); p.delete('cat'); setParams(p, { replace: true }); }
  };
  const openNew = () => { const p = new URLSearchParams(params); p.set('new', '1'); setParams(p, { replace: true }); };

  const loadRef = useMemo(() => Object.fromEntries(loads.map((l) => [l.id, l.reference || l.customer || 'Load'])), [loads]);
  const vehicleName = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v.name])), [vehicles]);

  const range = rangeOf(period);
  const inPeriod = useMemo(() => within(all, 'spent_at', range), [all, period]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return inPeriod.filter((e) => (cat === 'all' || e.category === cat)
      && (!t || [e.vendor, e.note, catLabel(e.category), loadRef[e.load_id]].some((x) => (x || '').toLowerCase().includes(t))))
      .sort((a, b) => new Date(b.spent_at) - new Date(a.spent_at));
  }, [inPeriod, cat, q, loadRef]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const e of filtered) { const k = toDateInput(e.spent_at); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    return [...m.entries()];
  }, [filtered]);

  const total = sumCents(filtered, cur);
  const fuelTotal = sumCents(filtered.filter((e) => e.category === 'fuel'), cur);
  const mine = sumCents(filtered.filter((e) => e.paid_by === 'driver'), cur);
  const other = otherCurrencyCount(filtered, cur);
  const catCounts = useMemo(() => { const c = {}; for (const e of inPeriod) c[e.category] = (c[e.category] || 0) + 1; return c; }, [inPeriod]);
  const catItems = useMemo(() => byCategory(inPeriod, cur).map((r) => ({ id: r.id, label: catLabel(r.id), value: r.cents })), [inPeriod, cur]);
  const biggest = catItems.slice().sort((a, b) => b.value - a.value)[0];
  const periodTotal = sumCents(inPeriod, cur);
  const title = periodTitle(period.kind, range);
  const days = new Set(filtered.map((e) => toDateInput(e.spent_at))).size;

  function exportCsv() {
    const csv = toCSV(filtered, [
      { label: 'Date', get: (e) => toDateInput(e.spent_at) }, { label: 'Time', get: (e) => fmtTime(e.spent_at) },
      { label: 'Category', get: (e) => e.category }, { label: 'Vendor', get: (e) => e.vendor }, { label: 'Note', get: (e) => e.note },
      { label: 'Amount', get: (e) => e.amount_cents / 100 }, { label: 'Currency', get: (e) => e.currency }, { label: 'Paid by', get: (e) => e.paid_by },
      { label: 'Litres', get: (e) => e.litres }, { label: 'Odometer (km)', get: (e) => (e.odometer_m != null ? e.odometer_m / 1000 : null) },
      { label: 'Load', get: (e) => loadRef[e.load_id] || '' }, { label: 'Vehicle', get: (e) => vehicleName[e.vehicle_id] || '' },
    ]);
    download(`roadbook-expenses-${toDateInput(new Date())}.csv`, csv);
  }

  const fuelRows = useMemo(() => all.filter((e) => e.category === 'fuel' && e.currency === cur), [all, cur]);
  const addBtn = <Button icon={Plus} onClick={openNew}>Add expense</Button>;

  return (
    <>
      <PageHeader title="Expenses" sub="Everything you spend on the road."
        actions={<>
          <Button variant="outline" icon={Download} disabled={!filtered.length} onClick={exportCsv} className="hidden sm:inline-flex">Export CSV</Button>
          <Button icon={Camera} onClick={openNew}>Snap receipt</Button>
        </>} />

      {/* one filter row above everything it scopes */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <PeriodPicker value={period} onChange={setPeriod} />
        <Segmented value={tab} onChange={setTab} options={[{ value: 'spending', label: 'Spending' }, { value: 'fuel', label: 'Fuel' }]} />
      </div>

      {tab === 'fuel' ? (
        <FuelTab all={fuelRows} range={range} kind={period.kind} cur={cur} onOpen={setEditing} onNew={openNew} />
      ) : all.length === 0 ? (
        <Empty icon={Receipt} title="Keep every receipt in your pocket" text="Snap a receipt at the pump or the toll and Roadbook fills in the amount, vendor and date. Your totals and fuel economy build up from there."
          action={<div className="flex flex-wrap gap-2"><Button icon={Camera} onClick={openNew}>Snap your first receipt</Button><Button variant="soft" icon={Plus} onClick={openNew}>Type one in</Button></div>} />
      ) : (
        <div className="space-y-4">
          <Hero label={`${cat === 'all' ? 'Spent' : catLabel(cat)} · ${title}`} value={money(total, cur)}
            sub={`${plural(filtered.length, 'expense')}${days > 1 ? ` over ${days} days` : ''}${other ? ` · ${other} in another currency not counted` : ''}`}
            items={[{ label: 'Fuel', value: money(fuelTotal, cur) }, { label: 'You paid', value: money(mine, cur) }, { label: 'Company', value: money(total - mine, cur) }]} />
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:items-start">
          <div className="order-3 lg:sticky lg:top-4 lg:order-2 lg:col-span-2">
            {catItems.length > 0 ? (
              <HBars title="Totals by category" subtitle={`${title}, top 6 and the rest as Other`} items={catItems} format={(c) => money(c, cur)} valueTitle="Spent" slot={1}
                summary={biggest ? `${biggest.label} is your biggest cost at ${money(biggest.value, cur)}, ${periodTotal ? Math.round((biggest.value / periodTotal) * 100) : 0} percent of ${money(periodTotal, cur)} spent in ${title}.` : ''} />
            ) : <div className="paper-card p-5 text-sm text-ink-500">Nothing spent in {title} yet, so there are no category totals.</div>}
          </div>

          <div className="order-2 min-w-0 lg:order-1 lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:max-w-xs">
                <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-400" />
                <Input aria-label="Search expenses" className="!h-11 pl-9 pr-9" placeholder="Search vendor, note or load" value={q} onChange={(e) => setQ(e.target.value)} />
                {q && <button type="button" aria-label="Clear search" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" onClick={() => setQ('')}><X size={15} /></button>}
              </div>
              <div className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Category filter">
                <button type="button" aria-pressed={cat === 'all'} onClick={() => setCat('all')} className={cx('inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold ring-1', cat === 'all' ? 'bg-ink-900 text-white ring-ink-900 dark:bg-brand-500 dark:text-ink-950 dark:ring-brand-500' : 'bg-[var(--surface)] text-ink-700 ring-ink-300 dark:text-ink-200 dark:ring-ink-600')}>All<span className="text-xs tabular-nums opacity-80">{inPeriod.length}</span></button>
                {CATEGORIES.filter((c) => catCounts[c.id] || c.id === cat).map((c) => { const Icon = categoryIcon(c.id); const on = cat === c.id; return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => setCat(c.id)} className={cx('inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ring-1', on ? 'bg-ink-900 text-white ring-ink-900 dark:bg-brand-500 dark:text-ink-950 dark:ring-brand-500' : 'bg-[var(--surface)] text-ink-700 ring-ink-300 hover:bg-ink-100 dark:text-ink-200 dark:ring-ink-600 dark:hover:bg-ink-800')}>
                    <Icon size={14} style={on ? undefined : { color: CATEGORY_COLORS[c.id] }} />{c.label}<span className="text-xs tabular-nums opacity-80">{catCounts[c.id] || 0}</span>
                  </button>); })}
              </div>
            </div>

            {groups.length === 0 ? (
              <Empty icon={Receipt} title="No expenses here" text="Nothing matches this period or filter. Try another period or clear the filters."
                action={<div className="flex flex-wrap gap-2"><Button variant="soft" onClick={() => { setCat('all'); setQ(''); setPeriod({ kind: 'all', offset: 0 }); }}>Show everything</Button>{addBtn}</div>} />
            ) : (
              <section aria-label="Expense ledger" className="paper-card overflow-hidden">
                <div className="hidden grid-cols-[2.75rem_minmax(0,1fr)_6.5rem_6.5rem_2.25rem] gap-4 border-b-2 border-ink-800 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-500 dark:border-ink-300 md:grid">
                  <span /><span>Description</span><span>Load</span><span className="text-right">Amount</span><span />
                </div>
                {groups.map(([day, list]) => (
                  <div key={day}>
                    <h2 className="flex items-baseline justify-between border-y border-[var(--hairline)] bg-ink-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink-600 first:border-t-0 dark:bg-ink-800/60 dark:text-ink-300">
                      <span>{dayLabel(day)} <span className="ml-1 font-normal normal-case text-ink-500">{plural(list.length, 'expense')}</span></span>
                      <span className="text-sm tabular-nums normal-case text-ink-900 dark:text-white">{money(sumCents(list, cur), cur)}</span>
                    </h2>
                    {list.map((e) => (
                      <div key={e.id} className="group relative grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0 border-b border-[var(--hairline)] px-4 py-2.5 last:border-b-0 hover:bg-brand-50/60 dark:hover:bg-ink-800/50 md:grid-cols-[2.75rem_minmax(0,1fr)_6.5rem_6.5rem_2.25rem] md:gap-x-4">
                        <button type="button" aria-label={`Edit ${e.vendor || catLabel(e.category)}, ${money(e.amount_cents, e.currency)}`} onClick={() => setEditing(e)} className="absolute inset-0 focus-visible:outline-offset-[-2px]" />
                        <span className="pointer-events-none"><Lead e={e} /></span>
                        <span className="pointer-events-none min-w-0">
                          <span className="block truncate font-bold">{e.vendor || catLabel(e.category)}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                            <span>{e.vendor ? `${catLabel(e.category)} · ` : ''}{fmtTime(e.spent_at).toLowerCase()}{e.litres ? ` · ${e.litres} L` : ''}</span>
                            {e.paid_by === 'company' && <Badge>Company</Badge>}
                            {e.load_id && loadRef[e.load_id] && <span className="md:hidden"><Plate className="!text-xs">{loadRef[e.load_id]}</Plate></span>}
                            {e.note && <span className="max-w-full truncate">{e.note}</span>}
                          </span>
                        </span>
                        <span className="pointer-events-none hidden md:block">{e.load_id && loadRef[e.load_id] ? <Plate className="!text-xs">{loadRef[e.load_id]}</Plate> : <span className="text-ink-300">-</span>}</span>
                        <span className="pointer-events-none flex flex-col items-end">
                          <span className="font-bold tabular-nums">{money(e.amount_cents, e.currency)}</span>
                        </span>
                        <button type="button" aria-label={`Delete ${e.vendor || catLabel(e.category)}`} onClick={() => softDelete(toast, 'expenses', e, 'Expense deleted')}
                          className="relative z-[1] col-start-3 row-start-2 ml-auto mt-1 flex h-8 w-8 items-center justify-center rounded text-ink-400 hover:bg-ink-100 hover:text-[var(--bad)] dark:hover:bg-ink-700 md:col-start-auto md:row-start-auto md:mt-0 md:h-9 md:w-9 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex items-baseline justify-between border-t-[3px] border-double border-ink-800 px-4 py-3 dark:border-ink-300">
                  <span className="font-bold">Total · {plural(filtered.length, 'expense')}</span>
                  <span className="text-xl font-bold tabular-nums">{money(total, cur)}</span>
                </div>
              </section>
            )}
            <Button variant="outline" icon={Download} disabled={!filtered.length} onClick={exportCsv} className="mt-3 sm:hidden">Export CSV</Button>
          </div>
          </div>
        </div>
      )}
      {formOpen && <ExpenseForm key={editing?.id || 'new'} expense={editing || undefined} preset={{ load_id: params.get('load') || '', category: validCat(params.get('cat')) || undefined }} onClose={closeForm} />}
    </>
  );
}
