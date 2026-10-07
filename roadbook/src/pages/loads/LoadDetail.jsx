import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, Pencil, Trash2, Navigation, Map as MapIcon, FileText, Plus, Wallet, Route as RouteIcon, XCircle, Undo2, Package } from 'lucide-react';
import { PageHeader, Button, Card, CardTitle, Badge, Empty, Banner, cx, useConfirm } from '../../components/ui.jsx';
import { useRow, useRows, save, remove } from '../../state/data.js';
import { useMoney, useDistance } from '../../lib/hooks.js';
import { loadFinance } from '../../core/calc.js';
import { mapsLink, wazeLink } from '../../core/geo.js';
import { fmtDateTime, fmtDate } from '../../core/format.js';
import { categoryIcon, CATEGORIES } from '../../lib/categories.js';
import { useToast } from '../../components/toast.jsx';
import { FLOW, STATUS, nextStatus, isDispatched } from './shared.js';
import LoadForm from './LoadForm.jsx';
import DeliveryProof from './DeliveryProof.jsx';

function Stepper({ status }) {
  const cancelled = status === 'cancelled';
  const idx = FLOW.indexOf(status);
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Load progress">
      {FLOW.map((s, i) => {
        const done = !cancelled && i < idx; const now = !cancelled && i === idx;
        return (
          <li key={s} className="flex items-center gap-1" aria-current={now ? 'step' : undefined}>
            <span className={cx('flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold',
              done && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
              now && 'bg-brand-500 text-white',
              !done && !now && 'bg-ink-100 text-ink-500 dark:bg-ink-800')}>
              {done ? <Check size={13} /> : <span className="text-[10px] opacity-70">{i + 1}</span>}{STATUS[s].label}
            </span>
            {i < FLOW.length - 1 && <ChevronRight size={14} className="shrink-0 text-ink-300" />}
          </li>
        );
      })}
    </ol>
  );
}

function Row({ to, icon: Icon, title, sub, right }) {
  const inner = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"><Icon size={15} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{title}</span><span className="block truncate text-xs text-ink-500">{sub}</span></span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{right}</span>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-lg py-2';
  return to ? <Link to={to} className={cx(cls, 'hover:bg-ink-50 dark:hover:bg-ink-800/50')}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

export default function LoadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const money = useMoney();
  const dist = useDistance();
  const [confirm, confirmNode] = useConfirm();
  const load = useRow('loads', id);
  const expenses = useRows('expenses').filter((e) => e.load_id === id);
  const allExpenses = useRows('expenses');
  const income = useRows('income');
  const trips = useRows('trips').filter((t) => t.load_id === id);
  const invoices = useRows('invoices').filter((i) => i.load_id === id);
  const delivery = useRows('deliveries').find((d) => d.load_id === id);
  const [editing, setEditing] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);

  if (!load) {
    return <Empty title="Load not found" text="It may have been deleted." action={<Button as={Link} to="/loads" variant="soft">Back to loads</Button>} />;
  }
  const fin = loadFinance(id, allExpenses, income, load.currency);
  const linkedIncome = income.filter((i) => i.load_id === id);
  const next = nextStatus(load.status);
  const dispatched = isDispatched(load);
  const items = load.items || [];

  async function setStatus(status) { await save('loads', { ...load, status }); toast(`Marked as ${STATUS[status].label.toLowerCase()}`); }
  function advance() {
    if (next === 'delivered' && !delivery) { setProofOpen(true); setTimeout(() => document.getElementById('delivery-proof')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); return; }
    setStatus(next);
  }
  async function del() {
    if (await confirm({ title: 'Delete this load?', text: 'The load is removed from your lists. Expenses and income you linked to it stay in your records.', confirmLabel: 'Delete load', danger: true })) {
      await remove('loads', id); toast('Load deleted'); nav('/loads');
    }
  }
  async function cancelLoad() {
    if (await confirm({ title: 'Cancel this load?', text: 'It moves out of the board. You can reopen it later.', confirmLabel: 'Cancel load', danger: true })) setStatus('cancelled');
  }
  const origin = load.pickup_label; const destination = load.drop_label;
  const stops = [];

  return (
    <>
      <PageHeader
        back={<Link to="/loads" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft size={14} />All loads</Link>}
        title={load.reference || load.customer || 'Load'}
        sub={[load.customer && load.reference ? load.customer : null, load.description].filter(Boolean).join(' · ') || undefined}
        actions={<>
          <Badge tone={STATUS[load.status]?.tone} className="!px-3 !py-1 !text-sm">{STATUS[load.status]?.label}</Badge>
          <Button variant="outline" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
        </>} />

      {dispatched && <div className="mb-4"><Banner tone="blue">This load was dispatched to you by your fleet owner. You can update it, but only they can delete it.</Banner></div>}

      <Card className="mb-4">
        <Stepper status={load.status} />
        <div className="mt-4 flex flex-wrap gap-2">
          {load.status === 'cancelled'
            ? <Button icon={Undo2} onClick={() => setStatus('booked')}>Reopen load</Button>
            : next && <Button icon={Check} onClick={advance}>{next === 'delivered' && !delivery ? 'Record delivery' : `Mark ${STATUS[next].label.toLowerCase()}`}</Button>}
          {load.status !== 'cancelled' && load.status !== 'reconciled' && <Button variant="ghost" icon={XCircle} onClick={cancelLoad}>Cancel load</Button>}
          {!dispatched && <Button variant="ghost" icon={Trash2} className="!text-red-600" onClick={del}>Delete</Button>}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardTitle title="Route and schedule" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div><div className="text-xs font-medium text-ink-500">Pickup</div><div className="font-semibold">{load.pickup_label || 'Not set'}</div><div className="text-sm text-ink-500">{load.pickup_at ? fmtDateTime(load.pickup_at) : 'No time set'}</div></div>
              <div><div className="text-xs font-medium text-ink-500">Drop-off</div><div className="font-semibold">{load.drop_label || 'Not set'}</div><div className="text-sm text-ink-500">{load.drop_at ? fmtDateTime(load.drop_at) : 'No time set'}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(origin || destination) && <Button as="a" variant="soft" size="sm" icon={MapIcon} href={mapsLink({ origin, destination, stops })} target="_blank" rel="noreferrer">Open in Google Maps</Button>}
              {destination && <Button as="a" variant="soft" size="sm" icon={Navigation} href={wazeLink(destination)} target="_blank" rel="noreferrer">Navigate with Waze</Button>}
              {!origin && !destination && <p className="text-sm text-ink-500">Add pickup and drop-off places to get map links.</p>}
            </div>
            {load.weight_kg != null && <p className="mt-3 text-sm text-ink-500">Weight: <span className="font-medium text-ink-800 dark:text-ink-100">{Number(load.weight_kg).toLocaleString()} kg</span></p>}
          </Card>

          <Card>
            <CardTitle title="Items" sub={items.length ? `${items.length} line${items.length === 1 ? '' : 's'}` : undefined} />
            {items.length ? (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {items.map((i, n) => <li key={n} className="flex items-center justify-between py-2 text-sm"><span className="flex items-center gap-2"><Package size={14} className="text-ink-400" />{i.name}</span><span className="tabular-nums text-ink-600 dark:text-ink-300">{i.expected} {i.unit}</span></li>)}
              </ul>
            ) : <p className="text-sm text-ink-500">No items listed. Use Edit to add what you are carrying.</p>}
          </Card>

          <div id="delivery-proof" className="scroll-mt-4">
            <DeliveryProof load={load} delivery={delivery} open={proofOpen} onOpen={() => setProofOpen(true)} onClose={() => setProofOpen(false)} />
          </div>

          {load.notes && <Card><CardTitle title="Notes" /><p className="whitespace-pre-wrap text-sm">{load.notes}</p></Card>}
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle title="Financials" sub={load.currency} />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Agreed rate</dt><dd className="font-semibold tabular-nums">{money(load.rate_cents, load.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Income received</dt><dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(fin.income, load.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Expenses</dt><dd className="font-semibold tabular-nums">{money(fin.expenses, load.currency)}</dd></div>
              <div className="flex justify-between border-t border-ink-200 pt-2 dark:border-ink-800"><dt className="font-medium">Net so far</dt><dd className={cx('text-lg font-bold tabular-nums', fin.net < 0 ? 'text-red-600' : 'text-emerald-600 dark:text-emerald-400')}>{money(fin.net, load.currency)}</dd></div>
            </dl>
          </Card>

          <Card>
            <CardTitle title="Expenses" action={<Button as={Link} to={`/expenses?new=1&load=${id}`} size="sm" variant="soft" icon={Plus}>Add</Button>} />
            {expenses.length ? expenses.slice().sort((a, b) => new Date(b.spent_at) - new Date(a.spent_at)).map((e) => (
              <Row key={e.id} to="/expenses" icon={categoryIcon(e.category)} title={e.vendor || CATEGORIES.find((c) => c.id === e.category)?.label} sub={fmtDate(e.spent_at)} right={money(e.amount_cents, e.currency)} />
            )) : <p className="text-sm text-ink-500">No expenses linked to this load.</p>}
          </Card>

          <Card>
            <CardTitle title="Income" />
            {linkedIncome.length ? linkedIncome.map((i) => <Row key={i.id} icon={Wallet} title={i.kind === 'pay' ? 'Payment' : i.kind === 'advance' ? 'Advance' : 'Other income'} sub={fmtDate(i.received_at)} right={money(i.amount_cents, i.currency)} />)
              : <p className="text-sm text-ink-500">No income linked to this load.</p>}
          </Card>

          <Card>
            <CardTitle title="Trips" />
            {trips.length ? trips.map((t) => <Row key={t.id} to="/trips" icon={RouteIcon} title={[t.origin_label, t.dest_label].filter(Boolean).join(' → ') || 'Trip'} sub={fmtDate(t.started_at)} right={dist(t.distance_m)} />)
              : <p className="text-sm text-ink-500">No trips recorded for this load.</p>}
          </Card>

          <Card>
            <CardTitle title="Invoice" />
            {invoices.length ? invoices.map((i) => <Row key={i.id} to={`/invoices?load=${id}`} icon={FileText} title={`Invoice ${i.number}`} sub={i.status} right={fmtDate(i.issue_date, { weekday: false })} />)
              : <p className="mb-3 text-sm text-ink-500">No invoice for this load yet.</p>}
            <div className="flex flex-wrap gap-2">
              <Button as={Link} to={`/invoices?new=1&load=${id}`} size="sm" icon={Plus}>Create invoice</Button>
              {invoices.length > 0 && <Button as={Link} to={`/invoices?load=${id}`} size="sm" variant="soft">View invoices</Button>}
            </div>
          </Card>
        </div>
      </div>
      {editing && <LoadForm open load={load} onClose={() => setEditing(false)} />}
      {confirmNode}
    </>
  );
}
