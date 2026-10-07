import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Download, Search, Receipt, Paperclip } from 'lucide-react';
import { PageHeader, Button, Card, Badge, Empty, Input, Segmented, Chips, Stat } from '../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { useRows } from '../state/data.js';
import { useMoney, useCurrency } from '../lib/hooks.js';
import { useFileUrl } from '../lib/files.js';
import { sumCents, otherCurrencyCount, within } from '../core/calc.js';
import { fmtDate, fmtTime, toDateInput } from '../core/format.js';
import { toCSV } from '../core/csv.js';
import { categoryIcon, CATEGORIES, CATEGORY_COLORS } from '../lib/categories.js';
import ExpenseForm from './expenses/ExpenseForm.jsx';
import FuelTab from './expenses/FuelTab.jsx';

function Thumb({ path }) {
  const url = useFileUrl(path);
  if (!path) return null;
  return url
    ? <img src={url} alt="Receipt" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-ink-200 dark:ring-ink-700" />
    : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-400 dark:bg-ink-800" aria-label="Receipt (loading)"><Paperclip size={16} /></span>;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Expenses() {
  const all = useRows('expenses');
  const loads = useRows('loads');
  const vehicles = useRows('vehicles');
  const money = useMoney();
  const cur = useCurrency();
  const [params, setParams] = useSearchParams();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [editing, setEditing] = useState(null);       // expense row being edited
  const formOpen = params.get('new') === '1' || !!editing;
  const closeForm = () => {
    setEditing(null);
    if (params.has('new') || params.has('load')) { const p = new URLSearchParams(params); p.delete('new'); p.delete('load'); setParams(p, { replace: true }); }
  };
  const openNew = () => { const p = new URLSearchParams(params); p.set('new', '1'); setParams(p, { replace: true }); };

  const loadRef = useMemo(() => Object.fromEntries(loads.map((l) => [l.id, l.reference || l.customer || 'Load'])), [loads]);
  const vehicleName = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v.name])), [vehicles]);

  const inPeriod = useMemo(() => within(all, 'spent_at', rangeOf(period)), [all, period]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return inPeriod.filter((e) => (cat === 'all' || e.category === cat)
      && (!t || [e.vendor, e.note, CATEGORIES.find((c) => c.id === e.category)?.label, loadRef[e.load_id]].some((x) => (x || '').toLowerCase().includes(t))))
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
  const catOptions = [{ value: 'all', label: 'All' }, ...CATEGORIES.filter((c) => catCounts[c.id] || c.id === cat).map((c) => {
    const Icon = categoryIcon(c.id);
    return { value: c.id, label: <span className="inline-flex items-center gap-1.5"><Icon size={14} />{c.label}</span> };
  })];

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

  const addBtn = <Button icon={Plus} onClick={openNew}>Add expense</Button>;
  const fuelRows = inPeriod.filter((e) => e.currency === cur);

  return (
    <>
      <PageHeader title="Expenses" sub="Everything you spend on the road."
        actions={<><Button variant="outline" icon={Download} disabled={!filtered.length} onClick={exportCsv}>Export CSV</Button>{addBtn}</>} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} />
        <Segmented value={tab} onChange={setTab} options={[{ value: 'all', label: 'All' }, { value: 'fuel', label: 'Fuel' }]} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total spent" value={money(total, cur)} sub={other ? `${other} in another currency not counted` : `${filtered.length} expense${filtered.length === 1 ? '' : 's'}`} />
        <Stat label="Fuel" value={money(fuelTotal, cur)} />
        <Stat label="Paid by you" value={money(mine, cur)} sub="To claim back if company owes" />
        <Stat label="Paid by company" value={money(total - mine, cur)} />
      </div>

      {tab === 'fuel' ? (
        <FuelTab rows={fuelRows} cur={cur} onOpen={setEditing} onAdd={addBtn} />
      ) : (
        <>
          <div className="mb-4 space-y-3">
            <div className="relative max-w-md">
              <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-400" />
              <Input aria-label="Search expenses" className="pl-9" placeholder="Search vendor, note or load" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="overflow-x-auto pb-1"><Chips value={cat} onChange={setCat} options={catOptions} /></div>
          </div>
          {groups.length === 0 ? (
            <Empty icon={Receipt} title={all.length ? 'No expenses here' : 'No expenses yet'}
              text={all.length ? 'Nothing matches this period or filter. Try another month or clear the filters.' : 'Add your first expense, or scan a receipt and let Roadbook fill it in.'}
              action={all.length ? <Button variant="soft" onClick={() => { setCat('all'); setQ(''); setPeriod({ kind: 'all', offset: 0 }); }}>Show everything</Button> : addBtn} />
          ) : (
            <div className="space-y-5">
              {groups.map(([day, list]) => (
                <section key={day} aria-label={fmtDate(day)}>
                  <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    <span>{fmtDate(`${day}T12:00`, { year: true })}</span><span className="tabular-nums normal-case">{money(sumCents(list, cur), cur)}</span>
                  </h2>
                  <Card className="!p-0 divide-y divide-ink-100 dark:divide-ink-800">
                    {list.map((e) => {
                      const Icon = categoryIcon(e.category);
                      const label = CATEGORIES.find((c) => c.id === e.category)?.label;
                      return (
                        <button key={e.id} type="button" onClick={() => setEditing(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink-50 dark:hover:bg-ink-800/50">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${CATEGORY_COLORS[e.category]}22`, color: CATEGORY_COLORS[e.category] }}><Icon size={18} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{e.vendor || label}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                              <span>{e.vendor ? `${label} · ` : ''}{fmtTime(e.spent_at)}</span>
                              {e.load_id && loadRef[e.load_id] && <Badge tone="brand">{loadRef[e.load_id]}</Badge>}
                              {e.paid_by === 'company' && <Badge>Company</Badge>}
                              {e.note && <span className="truncate">{e.note}</span>}
                            </span>
                          </span>
                          <Thumb path={e.receipt_path} />
                          <span className="shrink-0 text-right text-sm font-bold tabular-nums">{money(e.amount_cents, e.currency)}</span>
                        </button>
                      );
                    })}
                  </Card>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      {formOpen && <ExpenseForm key={editing?.id || 'new'} expense={editing || undefined} preset={{ load_id: params.get('load') || '' }} onClose={closeForm} />}
    </>
  );
}
