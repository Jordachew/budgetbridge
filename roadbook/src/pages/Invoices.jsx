import { useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Banknote, Copy, FileText, Mail, Pencil, Plus, Printer, Search, Send, Share2, Trash2, Ban, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Badge, Banner, Button, Card, CardTitle, Empty, Field, Input, Modal, PageHeader, Segmented, Stat, Table, useConfirm } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';
import { create, save, remove, useRows, useRow, useProfile } from '../state/data.js';
import { useCurrency } from '../lib/hooks.js';
import { fmtDate, fmtMoney, parseMoney } from '../core/format.js';
import { periodRange, inRange } from '../core/dates.js';
import InvoiceEditor from './invoices/InvoiceEditor.jsx';
import InvoicePrint from './invoices/InvoicePrint.jsx';
import { displayStatus, invoiceTotals, nextInvoiceNumber, todayStr } from './invoices/totals.js';
import { invoiceText, mailtoLink } from './invoices/summary.js';

const TONE = { draft: 'neutral', sent: 'blue', paid: 'green', overdue: 'red', void: 'neutral' };
const LABEL = { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', void: 'Void' };
const TABS = ['all', 'draft', 'sent', 'paid', 'overdue', 'void'];
const day = (s) => (s ? fmtDate(`${s}T12:00:00`, { weekday: false, year: true }) : '');

export const StatusBadge = ({ inv }) => { const s = displayStatus(inv); return <Badge tone={TONE[s]} className={s === 'void' ? 'line-through' : ''}>{LABEL[s]}</Badge>; };

/** Sums balances per currency: { JMD: cents, USD: cents }. */
function byCur(list, pick) {
  const m = {};
  for (const i of list) m[i.currency] = (m[i.currency] || 0) + pick(i);
  return m;
}
function curText(m, main) {
  const keys = Object.keys(m).filter((k) => m[k] > 0);
  if (!keys.length) return fmtMoney(0, main);
  keys.sort((a) => (a === main ? -1 : 1));
  return keys.map((k) => fmtMoney(m[k], k)).join(' + ');
}

/* ------------------------------ list ------------------------------ */
function List() {
  const invoices = useRows('invoices');
  const loads = useRows('loads');
  const main = useCurrency();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);   // null | 'new' | prefill object

  const wantNew = sp.get('new') === '1' || sp.get('load');
  const [handled, setHandled] = useState(false);
  if (wantNew && !handled) {
    setHandled(true);
    const load = loads.find((l) => l.id === sp.get('load'));
    setEditing(load ? fromLoad(load, invoices) : { number: nextInvoiceNumber(invoices), currency: main });
  }
  const closeEditor = () => { setEditing(null); if (sp.get('new') || sp.get('load')) setSp({}, { replace: true }); };

  const sorted = useMemo(() => [...invoices].sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || '') || (b.number || '').localeCompare(a.number || '')), [invoices]);
  const rows = sorted.filter((i) => (tab === 'all' || displayStatus(i) === tab)
    && (!q.trim() || `${i.number} ${i.customer}`.toLowerCase().includes(q.trim().toLowerCase())));
  const counts = Object.fromEntries(TABS.map((t) => [t, t === 'all' ? invoices.length : invoices.filter((i) => displayStatus(i) === t).length]));

  const month = periodRange('month');
  const open = invoices.filter((i) => ['sent'].includes(i.status));
  const outstanding = curText(byCur(open, (i) => invoiceTotals(i).balance), main);
  const overdue = curText(byCur(invoices.filter((i) => displayStatus(i) === 'overdue'), (i) => invoiceTotals(i).balance), main);
  const paidMonth = curText(byCur(invoices.filter((i) => i.paid_at && inRange(i.paid_at, month)), (i) => i.paid_cents || 0), main);

  const startNew = () => setEditing({ number: nextInvoiceNumber(invoices), currency: main });

  return (
    <>
      <PageHeader title="Invoices" sub="Bill your customers and keep track of who has paid." actions={<Button icon={Plus} onClick={startNew}>New invoice</Button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Outstanding" value={outstanding} sub="Sent, not yet paid" icon={Send} />
        <Stat label="Overdue" value={overdue} tone={overdue === fmtMoney(0, main) ? undefined : 'bad'} sub="Past the due date" icon={Ban} />
        <Stat label="Paid this month" value={paidMonth} tone="good" icon={CheckCircle2} />
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <Segmented value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t, label: `${t === 'all' ? 'All' : LABEL[t]}${counts[t] ? ` ${counts[t]}` : ''}` }))} />
        </div>
        <div className="relative md:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-400" />
          <Input aria-label="Search invoices" className="pl-9" placeholder="Search number or customer" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Table rows={rows} onRow={(i) => nav(i.id)}
        empty={invoices.length ? <Empty icon={FileText} title="No invoices match" text="Try another tab or a different search." />
          : <Empty icon={FileText} title="No invoices yet" text="Create your first invoice, or start one from a delivered load." action={<Button icon={Plus} onClick={startNew}>New invoice</Button>} />}
        columns={[
          { key: 'number', label: 'Number', render: (i) => <span className="font-semibold">{i.number}</span> },
          { key: 'customer', label: 'Customer', render: (i) => <span className="block max-w-[10rem] truncate sm:max-w-none">{i.customer || '-'}</span> },
          { key: 'issue', label: 'Issued', hide: true, render: (i) => day(i.issue_date) },
          { key: 'due', label: 'Due', hide: true, render: (i) => day(i.due_date) || '-' },
          { key: 'status', label: 'Status', render: (i) => <StatusBadge inv={i} /> },
          { key: 'total', label: 'Total', right: true, render: (i) => <span className="font-semibold">{fmtMoney(invoiceTotals(i).total, i.currency)}</span> },
        ]} />

      {editing && <InvoiceEditor open key="new" initial={editing === 'new' ? {} : editing} existing={invoices} onClose={closeEditor} onSaved={(r) => { closeEditor(); nav(r.id); }} />}
    </>
  );
}

function fromLoad(load, invoices) {
  const route = [load.pickup_label, load.drop_label].filter(Boolean).join(' to ');
  return {
    number: nextInvoiceNumber(invoices), load_id: load.id, customer: load.customer || '', currency: load.currency || 'JMD',
    items: [{ description: [load.reference && `Load ${load.reference}`, route || load.description || 'Freight'].filter(Boolean).join(' - '), qty: 1, unit_cents: load.rate_cents || 0 }],
    notes: '',
  };
}

/* ----------------------------- detail ----------------------------- */
function Detail() {
  const { id } = useParams();
  const inv = useRow('invoices', id);
  const all = useRows('invoices');
  const profile = useProfile();
  const nav = useNavigate();
  const toast = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);

  if (!inv || inv.deleted_at) return <><PageHeader title="Invoice" /><Empty icon={FileText} title="Invoice not found" text="It may have been deleted." action={<Button as={Link} to="/invoices">Back to invoices</Button>} /></>;
  const t = invoiceTotals(inv);
  const m = (c) => fmtMoney(c, inv.currency);
  const status = displayStatus(inv);

  const setStatus = async (s, msg) => { await save('invoices', { ...inv, status: s }); toast(msg); };
  const duplicate = async () => {
    const row = await create('invoices', { load_id: inv.load_id || null, number: nextInvoiceNumber(all), customer: inv.customer, customer_email: inv.customer_email, customer_address: inv.customer_address, items: inv.items, tax_pct: inv.tax_pct, discount_cents: inv.discount_cents, currency: inv.currency, notes: inv.notes, status: 'draft', issue_date: todayStr(), due_date: null, paid_cents: 0, paid_at: null });
    toast('Copied. Review the new draft.'); nav(`/invoices/${row.id}`);
  };
  const doVoid = async () => {
    if (await confirm({ title: 'Void this invoice?', text: `${inv.number} will be kept for your records but no longer counts as money owed.${t.paid ? ' Payments already recorded stay in your income.' : ''}`, confirmLabel: 'Void invoice', danger: true })) await setStatus('void', 'Invoice voided.');
  };
  const doDelete = async () => {
    if (await confirm({ title: 'Delete this invoice?', text: `${inv.number} for ${inv.customer} will be removed. This cannot be undone.${t.paid ? ' Income already recorded from it stays in your records.' : ''}`, confirmLabel: 'Delete', danger: true })) { await remove('invoices', inv.id); toast('Invoice deleted.'); nav('/invoices'); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(invoiceText(inv, profile)); toast('Summary copied.'); } catch { toast('Could not copy. Your browser blocked it.', { bad: true }); }
  };
  const share = async () => {
    try { await navigator.share({ title: `Invoice ${inv.number}`, text: invoiceText(inv, profile) }); } catch (e) { if (e?.name !== 'AbortError') toast('Could not open the share sheet.', { bad: true }); }
  };

  return (
    <>
      <PageHeader back={<Link to="/invoices" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft size={14} /> All invoices</Link>}
        title={inv.number} sub={`${inv.customer} · issued ${day(inv.issue_date)}`}
        actions={<><StatusBadge inv={inv} /><Button variant="outline" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button></>} />

      {status === 'overdue' && <div className="mb-4"><Banner tone="red">This invoice was due on {day(inv.due_date)} and {m(t.balance)} is still unpaid.</Banner></div>}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardTitle title="Items" />
          <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
            {inv.items.map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                <span><span className="block font-medium">{it.description}</span><span className="text-xs text-ink-500">{it.qty} x {m(it.unit_cents)}</span></span>
                <span className="font-semibold tabular-nums">{m(Math.round(it.qty * it.unit_cents))}</span>
              </li>
            ))}
          </ul>
          <dl className="ml-auto mt-4 max-w-xs space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd>{m(t.subtotal)}</dd></div>
            {t.discount > 0 && <div className="flex justify-between"><dt className="text-ink-500">Discount</dt><dd>-{m(t.discount)}</dd></div>}
            {t.tax > 0 && <div className="flex justify-between"><dt className="text-ink-500">Tax ({inv.tax_pct}%)</dt><dd>{m(t.tax)}</dd></div>}
            <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold dark:border-ink-700"><dt>Total</dt><dd>{m(t.total)}</dd></div>
            {t.paid > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><dt>Paid{inv.paid_at ? ` (${fmtDate(inv.paid_at, { weekday: false })})` : ''}</dt><dd>-{m(t.paid)}</dd></div>}
            {t.paid > 0 && <div className="flex justify-between font-bold"><dt>Balance</dt><dd>{m(t.balance)}</dd></div>}
          </dl>
          {inv.notes && <p className="mt-4 whitespace-pre-line rounded-lg bg-ink-50 p-3 text-sm text-ink-600 dark:bg-ink-800/60 dark:text-ink-300">{inv.notes}</p>}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle title="Bill to" />
            <p className="font-semibold">{inv.customer}</p>
            {inv.customer_address && <p className="whitespace-pre-line text-sm text-ink-500">{inv.customer_address}</p>}
            {inv.customer_email && <p className="text-sm text-ink-500">{inv.customer_email}</p>}
            <p className="mt-3 text-sm text-ink-500">Due: <b className="text-ink-800 dark:text-ink-100">{day(inv.due_date) || 'no due date'}</b></p>
          </Card>
          <Card>
            <CardTitle title="Actions" />
            <div className="flex flex-col gap-2">
              {inv.status === 'draft' && <Button icon={Send} onClick={() => setStatus('sent', 'Marked as sent.')}>Mark as sent</Button>}
              {inv.status !== 'void' && inv.status !== 'paid' && t.balance > 0 && <Button variant={inv.status === 'draft' ? 'outline' : 'primary'} icon={Banknote} onClick={() => setPaying(true)}>Record payment</Button>}
              <Button variant="outline" icon={Printer} as={Link} to="print">Print or save as PDF</Button>
              <Button variant="outline" icon={Mail} as="a" href={mailtoLink(inv, profile)}>Email invoice</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="soft" icon={Copy} onClick={copy}>Copy summary</Button>
                {typeof navigator.share === 'function' && <Button variant="soft" icon={Share2} onClick={share}>Share</Button>}
                <Button variant="soft" icon={Copy} onClick={duplicate}>Duplicate</Button>
                {inv.status === 'void' ? <Button variant="soft" icon={RotateCcw} onClick={() => setStatus('draft', 'Restored as a draft.')}>Restore</Button> : <Button variant="soft" icon={Ban} onClick={doVoid}>Void</Button>}
              </div>
              <Button variant="ghost" icon={Trash2} className="text-red-600 hover:!bg-red-50 dark:hover:!bg-red-950" onClick={doDelete}>Delete invoice</Button>
            </div>
          </Card>
        </div>
      </div>

      {editing && <InvoiceEditor open invoice={inv} existing={all} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      {paying && <PaymentModal inv={inv} balance={t.balance} total={t.total} onClose={() => setPaying(false)} />}
      {confirmNode}
    </>
  );
}

function PaymentModal({ inv, balance, total, onClose }) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(balance / 100));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const money = (c) => fmtMoney(c, inv.currency);

  async function submit() {
    const cents = parseMoney(amount);
    if (!cents) return setErr('Enter the amount you received, for example 5000.');
    if (cents > balance) return setErr(`That is more than the balance of ${money(balance)}.`);
    setBusy(true);
    try {
      const paid = (inv.paid_cents || 0) + cents;
      const now = new Date().toISOString();
      // Only the newly received amount becomes income, so editing or re-saving never duplicates it.
      await create('income', { kind: 'pay', amount_cents: cents, currency: inv.currency, load_id: inv.load_id || null, note: `Invoice ${inv.number} - ${inv.customer}`.slice(0, 500), received_at: now });
      await save('invoices', { ...inv, paid_cents: paid, paid_at: now, status: paid >= total ? 'paid' : inv.status === 'draft' ? 'sent' : inv.status });
      toast(paid >= total ? 'Paid in full. Added to your income.' : `${money(cents)} recorded. Added to your income.`);
      onClose();
    } catch (e) { console.error(e); toast('Could not record the payment.', { bad: true }); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Record payment" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Record payment</Button></>}>
      <p className="mb-3 text-sm text-ink-500">Balance on {inv.number}: <b className="text-ink-900 dark:text-white">{money(balance)}</b></p>
      <Field label="Amount received" error={err} hint="Enter the full balance or just part of it.">{(id) => <Input id={id} inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setErr(''); }} />}</Field>
      <div className="mt-2"><button type="button" className="text-sm font-semibold text-brand-600" onClick={() => setAmount(String(balance / 100))}>Use full balance</button></div>
    </Modal>
  );
}

/* ------------------------------ print ----------------------------- */
function Print() {
  const { id } = useParams();
  const inv = useRow('invoices', id);
  const profile = useProfile();
  if (!inv || inv.deleted_at) return <Empty icon={FileText} title="Invoice not found" action={<Button as={Link} to="/invoices">Back to invoices</Button>} />;
  return (
    <>
      <Link to={`/invoices/${inv.id}`} className="no-print mb-3 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800"><ArrowLeft size={14} /> Back to {inv.number}</Link>
      <InvoicePrint inv={inv} profile={profile} />
    </>
  );
}

export default function Invoices() {
  return (
    <Routes>
      <Route index element={<List />} />
      <Route path=":id" element={<Detail />} />
      <Route path=":id/print" element={<Print />} />
    </Routes>
  );
}
