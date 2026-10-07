import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, LayoutGrid, List, Truck, X, ArrowRight, AlertTriangle } from 'lucide-react';
import { PageHeader, Button, Empty, Input, Plate, Badge, cx } from '../../components/ui.jsx';
import { useRows } from '../../state/data.js';
import { useMoney, useCurrency } from '../../lib/hooks.js';
import { ls } from '../../core/util.js';
import { plural } from '../../core/format.js';
import { ACTIVE, FLOW, STATUS, billing, nextAction, relDay, routeText } from './shared.js';
import LoadCard, { isLate, useRunAction } from './LoadCard.jsx';
import RoadStepper from './RoadStepper.jsx';
import LoadForm from './LoadForm.jsx';

const VIEW_KEY = 'roadbook.loads.view';
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'unbilled', label: 'Unbilled' },
  { id: 'unpaid', label: 'Unpaid' },
];
const STAGES_FOR = {
  all: FLOW, active: ACTIVE, delivered: ['delivered', 'reconciled'], unbilled: ['delivered', 'reconciled'], unpaid: ['delivered', 'reconciled'],
};

export default function LoadsHome() {
  const loads = useRows('loads');
  const invoices = useRows('invoices');
  const deliveries = useRows('deliveries');
  const money = useMoney();
  const cur = useCurrency();
  const nav = useNavigate();
  const run = useRunAction();
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState(() => (ls(VIEW_KEY) === 'list' ? 'list' : 'board'));
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [stage, setStage] = useState('in_transit');
  const formOpen = params.get('new') === '1';
  const saved = useRef(false);
  const setView = (v) => { setViewState(v); ls(VIEW_KEY, v); };
  const closeForm = () => { if (saved.current) return; const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }); };
  const openForm = () => { const p = new URLSearchParams(params); p.set('new', '1'); setParams(p, { replace: true }); };

  const invByLoad = useMemo(() => { const m = {}; for (const i of invoices) if (i.load_id) (m[i.load_id] ||= []).push(i); return m; }, [invoices]);
  const delByLoad = useMemo(() => Object.fromEntries(deliveries.map((d) => [d.load_id, d])), [deliveries]);
  const ctxOf = (l) => { const inv = invByLoad[l.id] || []; return { invoices: inv, delivery: delByLoad[l.id], billing: billing(inv) }; };

  const sorted = useMemo(() => [...loads].sort((a, b) => new Date(b.pickup_at || b.created_at) - new Date(a.pickup_at || a.created_at)), [loads]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const matches = (l) => {
      const b = billing(invByLoad[l.id]);
      const done = l.status === 'delivered' || l.status === 'reconciled';
      if (filter === 'active') return ACTIVE.includes(l.status);
      if (filter === 'delivered') return done;
      if (filter === 'unbilled') return done && (b === 'none' || b === 'draft');
      if (filter === 'unpaid') return b === 'unpaid';
      return true;
    };
    return sorted.filter((l) => matches(l) && (filter !== 'all' || l.status !== 'cancelled' || !!t)
      && (!t || [l.reference, l.customer, l.pickup_label, l.drop_label, l.description].some((x) => (x || '').toLowerCase().includes(t))));
  }, [sorted, q, filter, invByLoad]);

  const filterCount = useMemo(() => {
    const live = loads.filter((l) => l.status !== 'cancelled');
    const done = (l) => l.status === 'delivered' || l.status === 'reconciled';
    return {
      all: live.length,
      active: live.filter((l) => ACTIVE.includes(l.status)).length,
      delivered: live.filter(done).length,
      unbilled: live.filter((l) => done(l) && ['none', 'draft'].includes(billing(invByLoad[l.id]))).length,
      unpaid: live.filter((l) => billing(invByLoad[l.id]) === 'unpaid').length,
    };
  }, [loads, invByLoad]);

  const active = loads.filter((l) => ACTIVE.includes(l.status));
  const activeValue = active.filter((l) => l.currency === cur).reduce((a, l) => a + (l.rate_cents || 0), 0);
  const activeOther = active.filter((l) => l.currency !== cur).length;
  const onRoad = active.filter((l) => l.status === 'in_transit' || l.status === 'picked_up').length;
  const lateCount = active.filter(isLate).length;
  const cancelled = loads.filter((l) => l.status === 'cancelled').length;

  const stages = STAGES_FOR[filter];
  const shownStage = stages.includes(stage) ? stage : stages[0];

  const empty = (
    <Empty icon={Truck} title={loads.length ? 'No loads match' : 'Your dispatch board is empty'}
      text={loads.length ? 'Try a different search or filter.' : 'Add a load to follow it from booking to payment: where it is going, what it pays and what it costs you.'}
      action={loads.length ? <Button variant="soft" onClick={() => { setQ(''); setFilter('all'); }}>Clear filters</Button> : <Button icon={Plus} onClick={openForm}>Add your first load</Button>} />
  );

  return (
    <>
      <PageHeader title="Loads" sub="Every job, from booking to payment."
        actions={<>
          <div role="tablist" aria-label="View" className="hidden rounded-md bg-ink-100 p-1 dark:bg-ink-800 sm:inline-flex">
            {[['board', LayoutGrid, 'Board'], ['list', List, 'List']].map(([v, Icon, l]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx('inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-bold', view === v ? 'bg-[var(--surface)] text-ink-900 shadow-sm ring-1 ring-ink-200 dark:bg-ink-700 dark:text-white dark:ring-ink-600' : 'text-ink-500')}><Icon size={14} />{l}</button>
            ))}
          </div>
          <Button icon={Plus} onClick={openForm}>New load</Button>
        </>} />

      {loads.length > 0 && (
        <section aria-label="Load summary" className="mb-5 overflow-hidden rounded-[10px] bg-ink-950 text-white ring-1 ring-ink-800 dark:bg-ink-900">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4 px-5 py-5 sm:px-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Value of active loads</div>
              <div className="mt-1 text-5xl font-bold leading-none tabular-nums text-brand-400 sm:text-6xl">{money(activeValue, cur)}</div>
              <div className="mt-2 text-sm text-ink-300">{plural(active.length, 'load')} booked or on the road{activeOther ? ` · ${activeOther} in another currency not counted` : ''}</div>
            </div>
            <dl className="flex gap-6 sm:gap-8">
              {[['On the road', onRoad], ['To invoice', filterCount.unbilled], ['Unpaid', filterCount.unpaid]].map(([l, n]) => (
                <div key={l}><dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">{l}</dt><dd className="mt-1 text-3xl font-bold tabular-nums">{n}</dd></div>
              ))}
            </dl>
          </div>
          {lateCount > 0 && <div className="flex items-center gap-2 border-t border-white/10 bg-red-950/60 px-5 py-2 text-sm font-bold text-red-200 sm:px-6"><AlertTriangle size={15} />{plural(lateCount, 'load is', 'loads are')} past the drop-off time. Check {lateCount === 1 ? 'it' : 'them'} below.</div>}
          <div className="roadline" aria-hidden="true" />
        </section>
      )}

      {loads.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-400" />
              <Input aria-label="Search loads" className="!h-11 pl-9 pr-9" placeholder="Search reference, customer or place" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && <button type="button" aria-label="Clear search" className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" onClick={() => setQ('')}><X size={15} /></button>}
            </div>
            <div className="-mx-4 flex min-w-0 flex-1 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Quick filters">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                  className={cx('inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold ring-1 transition-colors', filter === f.id ? 'bg-ink-900 text-white ring-ink-900 dark:bg-brand-500 dark:text-ink-950 dark:ring-brand-500' : 'bg-[var(--surface)] text-ink-700 ring-ink-300 hover:bg-ink-100 dark:text-ink-200 dark:ring-ink-600 dark:hover:bg-ink-800')}>
                  {f.label}<span className={cx('rounded-full px-1.5 text-xs tabular-nums', filter === f.id ? 'bg-white/20' : 'bg-ink-100 dark:bg-ink-800')}>{filterCount[f.id]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loads.length === 0 ? empty : view === 'board' ? (
        <>
          {/* stage picker, phones only */}
          <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden" role="tablist" aria-label="Stage">
            {stages.map((s) => { const n = filtered.filter((l) => l.status === s).length; const Ic = STATUS[s].icon; return (
              <button key={s} role="tab" aria-selected={shownStage === s} type="button" onClick={() => setStage(s)}
                className={cx('flex h-12 shrink-0 items-center gap-2 rounded-md border-b-[3px] px-3 text-sm font-bold', shownStage === s ? 'border-brand-500 bg-[var(--surface)] text-ink-900 dark:text-white' : 'border-transparent text-ink-500')}>
                <Ic size={16} />{STATUS[s].label}<span className="rounded bg-ink-100 px-1.5 text-xs tabular-nums dark:bg-ink-800">{n}</span>
              </button>); })}
          </div>
          <div className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-10 bg-gradient-to-l from-[var(--paper)] to-transparent md:block" />
          <div className="flex gap-4 md:-mx-2 md:snap-x md:overflow-x-auto md:px-2 md:pb-4">
            {stages.map((s) => {
              const col = filtered.filter((l) => l.status === s);
              const value = col.filter((l) => l.currency === cur).reduce((a, l) => a + (l.rate_cents || 0), 0);
              const Ic = STATUS[s].icon;
              return (
                <section key={s} aria-label={STATUS[s].label} className={cx('min-w-0 flex-1 md:w-[17.5rem] md:min-w-[17.5rem] md:flex-none md:snap-start', shownStage === s ? 'block' : 'hidden md:block')}>
                  <h2 className="mb-3 hidden items-center justify-between gap-2 border-b-2 border-ink-800 pb-2 dark:border-ink-300 md:flex">
                    <span className="inline-flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide"><Ic size={17} />{STATUS[s].label}</span>
                    <span className="flex items-center gap-2 text-sm"><span className="font-bold tabular-nums text-ink-500">{col.length ? money(value, cur) : ''}</span><Badge>{col.length}</Badge></span>
                  </h2>
                  <div className="space-y-3">
                    {col.map((l) => <LoadCard key={l.id} load={l} ctx={ctxOf(l)} />)}
                    {!col.length && <div className="rounded-[10px] border-2 border-dashed border-ink-300 px-3 py-8 text-center text-sm text-ink-400 dark:border-ink-700">{filtered.length ? 'No loads at this stage' : 'Nothing matches'}</div>}
                  </div>
                </section>
              );
            })}
          </div>
          </div>
        </>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            {filtered.length ? (
              <table className="paper-card w-full border-collapse text-left text-sm">
                <thead><tr className="border-b-2 border-ink-800 text-xs font-bold uppercase tracking-wide text-ink-500 dark:border-ink-300">
                  <th className="px-4 py-3">Load</th><th className="px-3 py-3">Route</th><th className="px-3 py-3">Pickup</th><th className="w-44 px-3 py-3">Progress</th><th className="px-3 py-3 text-right">Rate</th><th className="px-4 py-3 text-right">Next</th>
                </tr></thead>
                <tbody>
                  {filtered.map((l) => { const c = ctxOf(l); const act = nextAction(l, c); return (
                    <tr key={l.id} className="border-b border-[var(--hairline)] hover:bg-brand-50/60 dark:hover:bg-ink-800/50">
                      <td className="px-4 py-3"><Link to={`/loads/${l.id}`} className="block"><Plate>{l.reference || 'NO REF'}</Plate><span className="mt-1 block text-xs text-ink-500">{l.customer || 'No customer'}</span></Link></td>
                      <td className="max-w-[16rem] px-3 py-3"><span className="line-clamp-2 font-bold">{routeText(l) || '-'}</span></td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink-600 dark:text-ink-300">{l.pickup_at ? relDay(l.pickup_at, { time: false }) : '-'}</td>
                      <td className="px-3 py-3"><RoadStepper status={l.status} size="compact" /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums">{money(l.rate_cents, l.currency)}</td>
                      <td className="px-4 py-3 text-right">{act && l.status !== 'cancelled' ? <Button size="sm" onClick={() => run(l, act)}>{act.short}<ArrowRight size={14} /></Button> : <span className="text-xs font-bold uppercase text-ink-400">{STATUS[l.status].label}</span>}</td>
                    </tr>); })}
                </tbody>
              </table>
            ) : empty}
          </div>
          <div className="space-y-3 md:hidden">
            {filtered.length ? filtered.map((l) => <LoadCard key={l.id} load={l} ctx={ctxOf(l)} />) : empty}
          </div>
        </>
      )}
      {cancelled > 0 && filter === 'all' && <p className="mt-4 text-xs text-ink-500">{plural(cancelled, 'cancelled load')} hidden. Search by name to find {cancelled === 1 ? 'it' : 'them'}.</p>}
      {formOpen && <LoadForm open onClose={closeForm} onSaved={(row) => { saved.current = true; nav(`/loads/${row.id}`); }} />}
    </>
  );
}
