import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, LayoutGrid, List, Truck, MapPin, Calendar } from 'lucide-react';
import { PageHeader, Button, Badge, Card, Empty, Input, Segmented, Chips, Table } from '../../components/ui.jsx';
import { useRows } from '../../state/data.js';
import { useMoney } from '../../lib/hooks.js';
import { fmtDate } from '../../core/format.js';
import { ls } from '../../core/util.js';
import { FLOW, STATUS, routeText } from './shared.js';
import LoadForm from './LoadForm.jsx';

const VIEW_KEY = 'roadbook.loads.view';

function LoadCard({ load }) {
  const money = useMoney();
  const when = load.pickup_at || load.drop_at;
  return (
    <Link to={`/loads/${load.id}`} className="block rounded-xl bg-white p-3.5 text-left shadow-sm ring-1 ring-ink-200/70 transition hover:ring-brand-500 dark:bg-ink-900 dark:ring-ink-800">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{load.reference || 'No reference'}</div>
          <div className="truncate text-xs text-ink-500">{load.customer || 'No customer'}</div>
        </div>
        <div className="shrink-0 text-sm font-bold tabular-nums">{money(load.rate_cents, load.currency)}</div>
      </div>
      {routeText(load) && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-ink-600 dark:text-ink-300"><MapPin size={13} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{routeText(load)}</span></div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1">{when ? <><Calendar size={12} />{fmtDate(when)}</> : 'No date'}</span>
        <Badge tone={STATUS[load.status]?.tone}>{STATUS[load.status]?.label || load.status}</Badge>
      </div>
    </Link>
  );
}

export default function LoadsHome() {
  const loads = useRows('loads');
  const money = useMoney();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState(() => (ls(VIEW_KEY) === 'list' ? 'list' : 'board'));
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const formOpen = params.get('new') === '1';
  const saved = useRef(false);
  const setView = (v) => { setViewState(v); ls(VIEW_KEY, v); };
  const closeForm = () => { if (saved.current) return; const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }); };
  const openForm = () => { const p = new URLSearchParams(params); p.set('new', '1'); setParams(p, { replace: true }); };

  const sorted = useMemo(() => [...loads].sort((a, b) => new Date(b.pickup_at || b.created_at) - new Date(a.pickup_at || a.created_at)), [loads]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sorted.filter((l) => (status === 'all' || l.status === status)
      && (!t || [l.reference, l.customer, l.pickup_label, l.drop_label, l.description].some((x) => (x || '').toLowerCase().includes(t))));
  }, [sorted, q, status]);

  const counts = useMemo(() => { const c = { all: loads.length }; for (const l of loads) c[l.status] = (c[l.status] || 0) + 1; return c; }, [loads]);
  const chipOptions = [{ value: 'all', label: `All (${counts.all})` }, ...[...FLOW, 'cancelled'].map((s) => ({ value: s, label: `${STATUS[s].label}${counts[s] ? ` (${counts[s]})` : ''}` }))];

  const empty = (
    <Empty icon={Truck} title={loads.length ? 'No loads match' : 'No loads yet'}
      text={loads.length ? 'Try a different search or status filter.' : 'Add your first load to track where it is going, what it pays and what it costs you.'}
      action={loads.length ? <Button variant="soft" onClick={() => { setQ(''); setStatus('all'); }}>Clear filters</Button> : <Button icon={Plus} onClick={openForm}>Add a load</Button>} />
  );

  return (
    <>
      <PageHeader title="Loads" sub="Every job from booking to payment."
        actions={<><Segmented value={view} onChange={setView} options={[{ value: 'board', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid size={14} />Board</span> }, { value: 'list', label: <span className="inline-flex items-center gap-1.5"><List size={14} />List</span> }]} />
          <Button icon={Plus} onClick={openForm}>New load</Button></>} />

      <div className="mb-4 space-y-3">
        <div className="relative max-w-md">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-400" />
          <Input aria-label="Search loads" className="pl-9" placeholder="Search reference, customer or place" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {view === 'list' && <div className="overflow-x-auto pb-1"><Chips value={status} onChange={setStatus} options={chipOptions} /></div>}
      </div>

      {view === 'board' ? (
        loads.length === 0 ? empty : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {FLOW.map((s) => {
              const col = filtered.filter((l) => l.status === s);
              return (
                <section key={s} aria-label={STATUS[s].label} className="rounded-2xl bg-ink-100/70 p-3 dark:bg-ink-800/40">
                  <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">{STATUS[s].label}<Badge>{col.length}</Badge></h2>
                  <div className="space-y-2.5">
                    {col.map((l) => <LoadCard key={l.id} load={l} />)}
                    {!col.length && <p className="px-1 py-3 text-xs text-ink-400">Nothing here</p>}
                  </div>
                </section>
              );
            })}
            {counts.cancelled > 0 && <p className="text-xs text-ink-500 md:col-span-2 xl:col-span-5">{counts.cancelled} cancelled load{counts.cancelled === 1 ? ' is' : 's are'} hidden from the board. Use the List view to see {counts.cancelled === 1 ? 'it' : 'them'}.</p>}
          </div>
        )
      ) : (
        <>
          <div className="hidden md:block">
            <Table rows={filtered} onRow={(l) => nav(`/loads/${l.id}`)} empty={empty}
              columns={[
                { key: 'reference', label: 'Reference', render: (l) => <span className="font-semibold">{l.reference || '-'}</span> },
                { key: 'customer', label: 'Customer', render: (l) => l.customer || '-' },
                { key: 'route', label: 'Route', render: (l) => <span className="line-clamp-2">{routeText(l) || '-'}</span> },
                { key: 'date', label: 'Date', render: (l) => (l.pickup_at ? fmtDate(l.pickup_at) : '-') },
                { key: 'rate', label: 'Rate', right: true, render: (l) => money(l.rate_cents, l.currency) },
                { key: 'status', label: 'Status', render: (l) => <Badge tone={STATUS[l.status]?.tone}>{STATUS[l.status]?.label}</Badge> },
              ]} />
          </div>
          <div className="space-y-2.5 md:hidden">
            {filtered.length ? filtered.map((l) => <LoadCard key={l.id} load={l} />) : empty}
          </div>
        </>
      )}
      {formOpen && <LoadForm open onClose={closeForm} onSaved={(row) => { saved.current = true; nav(`/loads/${row.id}`); }} />}
    </>
  );
}
