import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Pencil, Trash2, Navigation, Map as MapIcon, FileText, Plus, Wallet, Route as RouteIcon, XCircle, Undo2, Package, CalendarClock, Weight, Flag, Receipt, ClipboardList, ShieldCheck, Circle, AlertTriangle } from 'lucide-react';
import { Button, Card, CardTitle, Badge, Empty, Banner, Plate, Meter, cx } from '../../components/ui.jsx';
import { useRow, useRows } from '../../state/data.js';
import { useMoney, useDistance } from '../../lib/hooks.js';
import { loadFinance, sumCents } from '../../core/calc.js';
import { mapsLink, wazeLink } from '../../core/geo.js';
import { fmtDateTime, fmtDate, fmtTime } from '../../core/format.js';
import { categoryIcon, CATEGORIES } from '../../lib/categories.js';
import { useToast } from '../../components/toast.jsx';
import { softDelete } from '../../lib/undo.js';
import { STATUS, nextAction, relDay, billing, isDispatched, setLoadStatus, ACTIVE } from './shared.js';
import RoadStepper from './RoadStepper.jsx';
import RouteLine from './RouteLine.jsx';
import LoadForm from './LoadForm.jsx';
import DeliveryProof from './DeliveryProof.jsx';
import Certificate from './Certificate.jsx';

const TABS = [['overview', 'Overview'], ['money', 'Money'], ['proof', 'Proof'], ['activity', 'Activity']];

function Row({ to, icon: Icon, title, sub, right }) {
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"><Icon size={16} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{title}</span><span className="block truncate text-xs text-ink-500">{sub}</span></span>
      <span className="shrink-0 text-sm font-bold tabular-nums">{right}</span>
    </>
  );
  const cls = 'flex items-center gap-3 border-b border-[var(--hairline)] py-2.5 last:border-b-0';
  return to ? <Link to={to} className={cx(cls, 'hover:bg-ink-50 dark:hover:bg-ink-800/50')}>{inner}</Link> : <div className={cls}>{inner}</div>;
}
const Leader = ({ label, value, strong, tone, sign }) => (
  <div className={cx('flex items-baseline gap-2 py-1.5', strong && 'text-base')}>
    <dt className={cx('shrink-0', strong ? 'font-bold' : 'text-ink-600 dark:text-ink-300')}>{label}</dt>
    <span aria-hidden="true" className="min-w-4 flex-1 translate-y-[-3px] border-b-2 border-dotted border-ink-300 dark:border-ink-600" />
    <dd className={cx('shrink-0 font-bold tabular-nums', strong && 'text-lg', tone === 'bad' && 'text-[var(--bad)]', tone === 'good' && 'text-[var(--good)]')}>{sign}{value}</dd>
  </div>
);

function Ledger({ load, fin, money }) {
  const rate = load.rate_cents || 0;
  const profit = rate - fin.expenses;
  const margin = rate > 0 ? Math.round((profit / rate) * 100) : null;
  const toCollect = Math.max(0, rate - fin.income);
  return (
    <section aria-label="Load ledger" className="paper-card overflow-hidden">
      <div className="flex items-center justify-between border-b-2 border-ink-800 px-5 py-3 dark:border-ink-300">
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">Load ledger</h2>
        <span className="text-xs font-bold text-ink-500">{load.currency}</span>
      </div>
      <dl className="px-5 pb-1 pt-3 text-sm">
        <Leader label="Agreed rate" value={money(rate, load.currency)} />
        <Leader label="Expenses so far" value={money(fin.expenses, load.currency)} sign={fin.expenses ? '-' : ''} />
        <div className="mt-1 border-t-[3px] border-double border-ink-800 pt-1 dark:border-ink-300">
          <Leader strong label="Profit" value={money(profit, load.currency)} tone={profit < 0 ? 'bad' : 'good'} />
        </div>
      </dl>
      <div className="px-5 pb-4 pt-2">
        {margin != null ? (
          <>
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-ink-500"><span>Margin</span><span className={cx('text-sm tabular-nums normal-case', margin < 0 ? 'text-[var(--bad)]' : 'text-ink-900 dark:text-white')}>{margin}%</span></div>
            <Meter value={fin.expenses} max={rate} label={`Expenses are ${Math.round((fin.expenses / rate) * 100)} percent of the rate`} />
            <p className="mt-1.5 text-xs text-ink-500">{fin.expenses > rate ? 'Expenses are higher than the rate: this load loses money.' : `Expenses use ${Math.round((fin.expenses / rate) * 100)}% of the rate.`}</p>
          </>
        ) : <p className="text-xs text-ink-500">Add a rate to see your margin.</p>}
      </div>
      <dl className="border-t border-[var(--hairline)] bg-ink-50/60 px-5 py-3 text-sm dark:bg-ink-800/30">
        <Leader label="Payments received" value={money(fin.income, load.currency)} />
        <Leader label="Still to collect" value={money(toCollect, load.currency)} tone={toCollect > 0 && ['delivered', 'reconciled'].includes(load.status) ? 'bad' : undefined} />
      </dl>
    </section>
  );
}

function buildTimeline({ load, trips, expenses, income, invoices, delivery, money, dist }) {
  const ev = [];
  const add = (at, icon, title, sub, tone) => { const t = new Date(at); if (!Number.isNaN(t.getTime())) ev.push({ at: t, icon, title, sub, tone }); };
  add(load.created_at, ClipboardList, 'Load booked', [load.customer, money(load.rate_cents, load.currency)].filter(Boolean).join(' · '));
  if (load.pickup_at) add(load.pickup_at, CalendarClock, new Date(load.pickup_at) > new Date() ? 'Pickup scheduled' : 'Pickup time', load.pickup_label);
  if (load.drop_at) add(load.drop_at, Flag, new Date(load.drop_at) > new Date() ? 'Drop-off due' : 'Drop-off time', load.drop_label);
  for (const t of trips) {
    add(t.started_at, RouteIcon, 'Trip started', [t.origin_label, t.dest_label].filter(Boolean).join(' → '));
    if (t.ended_at) add(t.ended_at, RouteIcon, 'Trip ended', dist(t.distance_m));
  }
  for (const e of expenses) add(e.spent_at, Receipt, `Expense: ${e.vendor || CATEGORIES.find((c) => c.id === e.category)?.label || 'Other'}`, money(e.amount_cents, e.currency));
  for (const i of income) add(i.received_at, Wallet, 'Payment received', money(i.amount_cents, i.currency));
  for (const i of invoices) {
    add(`${i.issue_date}T12:00`, FileText, `Invoice ${i.number} issued`, i.status);
    if (i.paid_at) add(i.paid_at, FileText, `Invoice ${i.number} paid`, money(i.paid_cents, i.currency), 'good');
  }
  if (delivery) add(delivery.delivered_at, ShieldCheck, 'Delivery sealed', delivery.receiver_name ? `Received by ${delivery.receiver_name}` : undefined, 'good');
  if (load.status !== 'booked') add(load.updated_at, STATUS[load.status].icon, `Status: ${STATUS[load.status].label}`, 'Last change');
  return ev.sort((a, b) => b.at - a.at);
}

export default function LoadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const dist = useDistance();
  const [params, setParams] = useSearchParams();
  const load = useRow('loads', id);
  const allExpenses = useRows('expenses');
  const income = useRows('income');
  const allTrips = useRows('trips');
  const allInvoices = useRows('invoices');
  const deliveries = useRows('deliveries');
  const [editing, setEditing] = useState(false);

  const expenses = useMemo(() => allExpenses.filter((e) => e.load_id === id).sort((a, b) => new Date(b.spent_at) - new Date(a.spent_at)), [allExpenses, id]);
  const trips = useMemo(() => allTrips.filter((t) => t.load_id === id), [allTrips, id]);
  const invoices = useMemo(() => allInvoices.filter((i) => i.load_id === id), [allInvoices, id]);
  const linkedIncome = useMemo(() => income.filter((i) => i.load_id === id), [income, id]);
  const delivery = deliveries.find((d) => d.load_id === id);
  const events = useMemo(() => (load ? buildTimeline({ load, trips, expenses, income: linkedIncome, invoices, delivery, money, dist }) : []), [load, trips, expenses, linkedIncome, invoices, delivery, money, dist]);

  const tab = TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (t) => { const p = new URLSearchParams(params); p.set('tab', t); p.delete('proof'); setParams(p, { replace: true }); };
  const proofOpen = params.get('proof') === '1';
  const setProof = (open) => { const p = new URLSearchParams(params); if (open) { p.set('tab', 'proof'); p.set('proof', '1'); } else p.delete('proof'); setParams(p, { replace: true }); };
  const setView = (v) => { const p = new URLSearchParams(params); if (v) p.set('view', v); else p.delete('view'); setParams(p, { replace: true }); };

  if (!load) {
    return <Empty title="Load not found" text="It may have been deleted." action={<Button as={Link} to="/loads" variant="soft">Back to loads</Button>} />;
  }
  if (params.get('view') === 'pod' && delivery) return <Certificate load={load} delivery={delivery} onBack={() => setView(null)} />;

  const fin = loadFinance(id, allExpenses, income, load.currency);
  const act = nextAction(load, { invoices, delivery });
  const dispatched = isDispatched(load);
  const items = load.items || [];
  const origin = load.pickup_label; const destination = load.drop_label;
  const bill = billing(invoices);
  const late = ACTIVE.includes(load.status) && load.drop_at && new Date(load.drop_at) < new Date();

  function run() {
    if (!act) return;
    if (act.type === 'status') setLoadStatus(load, act.to, toast);
    else if (act.type === 'proof') setProof(true);
    else if (act.type === 'invoice') nav(`/invoices?new=1&load=${id}`);
    else if (act.type === 'pay') nav(`/invoices?load=${id}`);
  }
  async function del() { await softDelete(toast, 'loads', load, 'Load deleted'); nav('/loads'); }

  const tabCount = { money: expenses.length + linkedIncome.length + invoices.length, activity: events.length };
  const st = STATUS[load.status];

  return (
    <>
      <div className="mb-5">
        <Link to="/loads" className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm font-bold text-ink-500 hover:text-ink-800 dark:hover:text-ink-100"><ArrowLeft size={15} />All loads</Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Plate className="!px-2.5 !py-0.5 !text-3xl sm:!text-4xl">{load.reference || 'NO REF'}</Plate>
              <Badge tone={st.tone} icon={st.icon} className="!px-2.5 !py-1 !text-xs">{st.label}</Badge>
              {late && <Badge tone="red" icon={AlertTriangle}>Late</Badge>}
            </div>
            <p className="mt-2 text-sm text-ink-500">{[load.customer, load.description].filter(Boolean).join(' · ') || 'No customer yet. Use Edit to add one.'}</p>
          </div>
          <Button variant="outline" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
        </div>
        <div className="roadline mt-4" aria-hidden="true" />
      </div>

      {dispatched && <div className="mb-4"><Banner tone="blue">This load was dispatched to you by your fleet owner. You can update it, but only they can delete it.</Banner></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* waybill hero */}
        <section aria-label="Route and progress" className="paper-card overflow-hidden lg:col-span-2">
          <div className="p-5 pb-4">
            <RouteLine from={origin} to={destination} status={load.status} truck big />
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink-500"><CalendarClock size={12} />Pickup</dt><dd className="mt-0.5 font-bold" title={load.pickup_at ? fmtDateTime(load.pickup_at) : undefined}>{load.pickup_at ? relDay(load.pickup_at) : 'No time set'}</dd></div>
              <div><dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink-500"><Flag size={12} />Drop-off</dt><dd className="mt-0.5 font-bold" title={load.drop_at ? fmtDateTime(load.drop_at) : undefined}>{load.drop_at ? relDay(load.drop_at) : 'No time set'}</dd></div>
              <div><dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink-500"><Weight size={12} />Weight</dt><dd className="mt-0.5 font-bold">{load.weight_kg != null ? `${Number(load.weight_kg).toLocaleString()} kg` : 'Not set'}</dd></div>
            </dl>
            {(origin || destination) && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button as="a" variant="soft" size="sm" icon={MapIcon} href={mapsLink({ origin, destination, stops: [] })} target="_blank" rel="noreferrer">Google Maps</Button>
                {destination && <Button as="a" variant="soft" size="sm" icon={Navigation} href={wazeLink(destination)} target="_blank" rel="noreferrer">Waze to drop-off</Button>}
              </div>
            )}
          </div>
          <div className="border-t-2 border-dashed border-ink-300 bg-ink-50/60 px-3 py-4 dark:border-ink-600 dark:bg-ink-800/30 sm:px-5">
            {load.status === 'cancelled' ? <p className="flex items-center gap-2 text-sm font-bold text-[var(--bad)]"><XCircle size={16} />This load was cancelled.</p> : <RoadStepper status={load.status} />}
          </div>
        </section>

        {/* what's next */}
        <section aria-label="What's next" className="rounded-[10px] border-2 border-brand-500 bg-brand-50 p-5 dark:bg-brand-500/10 lg:col-span-2">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700 dark:text-brand-300">What&apos;s next</div>
          {act ? (
            <>
              <p className="mt-1 max-w-xl text-sm text-ink-700 dark:text-ink-200">{act.hint}</p>
              <Button size="lg" className="mt-4 !h-14 w-full !text-base sm:w-auto sm:min-w-72" icon={act.type === 'proof' ? ShieldCheck : act.type === 'status' && load.status === 'cancelled' ? Undo2 : undefined} onClick={run}>{act.label}<ArrowRight size={18} strokeWidth={2.6} /></Button>
            </>
          ) : <p className="mt-1 flex items-center gap-2 text-base font-bold"><ShieldCheck size={18} className="text-[var(--good)]" />All done. This load is closed out.</p>}
          <div className="mt-3 flex flex-wrap gap-x-2">
            {load.status === 'delivered' && act?.to !== 'reconciled' && <Button variant="ghost" size="sm" onClick={() => setLoadStatus(load, 'reconciled', toast)}>Mark reconciled anyway</Button>}
            {load.status !== 'cancelled' && load.status !== 'reconciled' && <Button variant="ghost" size="sm" icon={XCircle} onClick={() => setLoadStatus(load, 'cancelled', toast)}>Cancel load</Button>}
            {!dispatched && <Button variant="ghost" size="sm" icon={Trash2} className="!text-[var(--bad)]" onClick={del}>Delete</Button>}
          </div>
        </section>

        <div className="lg:col-start-3 lg:row-span-3 lg:row-start-1 lg:self-start"><Ledger load={load} fin={fin} money={money} /></div>

        {/* tabs */}
        <div className="min-w-0 lg:col-span-2">
          <div role="tablist" aria-label="Load sections" className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-[var(--hairline)] px-4 sm:mx-0 sm:px-0">
            {TABS.map(([t, label]) => (
              <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`} type="button" onClick={() => setTab(t)}
                className={cx('-mb-px inline-flex h-12 shrink-0 items-center gap-2 border-b-[3px] px-4 text-sm font-bold', tab === t ? 'border-brand-500 text-ink-900 dark:text-white' : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200')}>
                {label}
                {tabCount[t] > 0 && <span className="rounded bg-ink-100 px-1.5 text-xs tabular-nums dark:bg-ink-800">{tabCount[t]}</span>}
                {t === 'proof' && delivery && <ShieldCheck size={14} className="text-[var(--good)]" aria-label="Sealed" />}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-4">
            {tab === 'overview' && (
              <>
                <Card>
                  <CardTitle title="Items" sub={items.length ? `${items.length} line${items.length === 1 ? '' : 's'} to count at drop-off` : undefined} />
                  {items.length ? (
                    <ul>{items.map((i, n) => <li key={n} className="flex items-center justify-between border-b border-[var(--hairline)] py-2 text-sm last:border-b-0"><span className="flex items-center gap-2 font-bold"><Package size={14} className="text-ink-400" />{i.name}</span><span className="tabular-nums text-ink-600 dark:text-ink-300">{i.expected} {i.unit}</span></li>)}</ul>
                  ) : <p className="text-sm text-ink-500">No items listed. Use Edit to add what you are carrying, then count it off at drop-off.</p>}
                </Card>
                {load.notes && <Card><CardTitle title="Notes" /><p className="whitespace-pre-wrap text-sm">{load.notes}</p></Card>}
                <Card>
                  <CardTitle title="Trips" action={<Button as={Link} to="/trips" size="sm" variant="soft" icon={RouteIcon}>Trips</Button>} />
                  {trips.length ? trips.map((t) => <Row key={t.id} to="/trips" icon={RouteIcon} title={[t.origin_label, t.dest_label].filter(Boolean).join(' → ') || 'Trip'} sub={fmtDate(t.started_at)} right={dist(t.distance_m)} />)
                    : <p className="text-sm text-ink-500">No trips recorded for this load yet.</p>}
                </Card>
              </>
            )}
            {tab === 'money' && (
              <>
                <Card>
                  <CardTitle title="Expenses" sub={expenses.length ? `${money(sumCents(expenses, load.currency), load.currency)} total` : undefined} action={<Button as={Link} to={`/expenses?new=1&load=${id}`} size="sm" icon={Plus}>Add</Button>} />
                  {expenses.length ? expenses.map((e) => (
                    <Row key={e.id} to="/expenses" icon={categoryIcon(e.category)} title={e.vendor || CATEGORIES.find((c) => c.id === e.category)?.label} sub={`${fmtDate(e.spent_at)}, ${fmtTime(e.spent_at)}`} right={money(e.amount_cents, e.currency)} />
                  )) : <p className="text-sm text-ink-500">No expenses linked to this load. Fuel and tolls you add for it show up here.</p>}
                </Card>
                <Card>
                  <CardTitle title="Income" />
                  {linkedIncome.length ? linkedIncome.map((i) => <Row key={i.id} icon={Wallet} title={i.kind === 'pay' ? 'Payment' : i.kind === 'advance' ? 'Advance' : 'Other income'} sub={fmtDate(i.received_at)} right={money(i.amount_cents, i.currency)} />)
                    : <p className="text-sm text-ink-500">No income linked to this load.</p>}
                </Card>
                <Card>
                  <CardTitle title="Invoice" action={bill !== 'none' ? <Badge tone={bill === 'paid' ? 'green' : 'amber'}>{bill === 'paid' ? 'Paid' : bill === 'unpaid' ? 'Unpaid' : 'Draft'}</Badge> : undefined} />
                  {invoices.length ? invoices.map((i) => <Row key={i.id} to={`/invoices?load=${id}`} icon={FileText} title={`Invoice ${i.number}`} sub={i.status} right={fmtDate(i.issue_date, { weekday: false })} />)
                    : <p className="mb-3 text-sm text-ink-500">No invoice for this load yet.</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button as={Link} to={`/invoices?new=1&load=${id}`} size="sm" icon={Plus}>Create invoice</Button>
                    {invoices.length > 0 && <Button as={Link} to={`/invoices?load=${id}`} size="sm" variant="soft">View invoices</Button>}
                  </div>
                </Card>
              </>
            )}
            {tab === 'proof' && (
              <DeliveryProof load={load} delivery={delivery} open={proofOpen} onOpen={() => setProof(true)} onClose={() => setProof(false)} onCertificate={() => setView('pod')} />
            )}
            {tab === 'activity' && (
              <Card>
                <CardTitle title="Timeline" sub="Everything that happened on this load, newest first." />
                <ol className="relative">
                  <span aria-hidden="true" className="absolute bottom-3 left-[15px] top-3 border-l-[3px] border-dotted border-ink-300 dark:border-ink-600" />
                  {events.map((e, n) => {
                    const upcoming = e.at > new Date();
                    return (
                      <li key={n} className="relative flex gap-3 pb-4 last:pb-0">
                        <span className={cx('relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2', e.tone === 'good' ? 'border-[var(--good)] bg-[var(--surface)] text-[var(--good)]' : upcoming ? 'border-dashed border-ink-400 bg-[var(--surface)] text-ink-500' : 'border-ink-800 bg-ink-800 text-white dark:border-ink-200 dark:bg-ink-200 dark:text-ink-900')}>{e.icon ? <e.icon size={14} /> : <Circle size={10} />}</span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="text-sm font-bold">{e.title}</span><span className="text-xs text-ink-500" title={fmtDateTime(e.at)}>{upcoming ? 'Upcoming · ' : ''}{relDay(e.at.toISOString())}</span></div>
                          {e.sub && <div className="truncate text-xs text-ink-500">{e.sub}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            )}
          </div>
        </div>
      </div>
      {editing && <LoadForm load={load} onClose={() => setEditing(false)} />}
    </>
  );
}
