import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Ban, Banknote, CheckCircle2, Copy, FileText, Mail, Pencil, Printer, RotateCcw, Share2, Trash2, MoreHorizontal } from 'lucide-react';
import { Banner, Button, Empty, IconButton, Meter, PageHeader, cx } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { useProfile, useRow, useRows } from '../../state/data.js';
import { softDelete } from '../../lib/undo.js';
import { fmtDate, fmtMoney } from '../../core/format.js';
import { displayStatus, invoiceTotals, lineCents } from './totals.js';
import { dueWords, fmtDay, TONE_CLASS } from './helpers.js';
import { invoiceText, mailtoLink } from './summary.js';
import { duplicateInvoice, paymentToast, recordPayment, restoreDraft, setVoid, markSent } from './actions.js';
import { ChaseMenu, SendMenu } from './ChaseMenu.jsx';
import { Menu, MenuItem, MenuRule } from './Menu.jsx';
import PaymentModal from './PaymentModal.jsx';
import Stepper from './Stepper.jsx';
import InvoiceEditor from './InvoiceEditor.jsx';
import { StatusBadge } from './Ledger.jsx';

export default function Detail() {
  const { id } = useParams();
  const inv = useRow('invoices', id);
  const all = useRows('invoices');
  const income = useRows('income');
  const profile = useProfile();
  const nav = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!inv || inv.deleted_at) return <><PageHeader title="Invoice" /><Empty icon={FileText} title="Invoice not found" text="It may have been deleted." action={<Button as={Link} to="/invoices">Back to invoices</Button>} /></>;
  if (editing) return <InvoiceEditor invoice={inv} existing={all} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />;

  const t = invoiceTotals(inv);
  const m = (c) => fmtMoney(c, inv.currency);
  const st = displayStatus(inv);
  const due = dueWords(inv);
  const payments = income.filter((r) => (r.note || '').startsWith(`Invoice ${inv.number} - `)).sort((a, b) => (a.received_at || '').localeCompare(b.received_at || ''));
  const openInv = (st === 'sent' || st === 'overdue') && t.balance > 0;

  const copy = async () => { try { await navigator.clipboard.writeText(invoiceText(inv, profile)); toast('Summary copied.'); } catch { toast('Could not copy. Your browser blocked it.', { bad: true }); } };
  const share = async () => { try { await navigator.share({ title: `Invoice ${inv.number}`, text: invoiceText(inv, profile) }); } catch (e) { if (e?.name !== 'AbortError') toast('Could not open the share sheet.', { bad: true }); } };
  const markPaid = async () => { setBusy(true); try { paymentToast(toast, await recordPayment(inv, t.balance), inv); } catch { toast('Could not record the payment.', { bad: true }); } setBusy(false); };

  return (
    <>
      <PageHeader back={<Link to="/invoices" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-ink-500 hover:text-ink-900 dark:hover:text-white"><ArrowLeft size={14} /> All invoices</Link>}
        title={inv.number} sub={<span className="flex flex-wrap items-center gap-2"><b className="text-ink-800 dark:text-ink-100">{inv.customer}</b> · issued {fmtDay(inv.issue_date)} <StatusBadge inv={inv} /></span>}
        actions={<>
          <Button variant="outline" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="outline" icon={Printer} as={Link} to="print">Print / PDF</Button>
          <Menu trigger={({ open, toggle }) => <IconButton icon={MoreHorizontal} label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className="border border-ink-300 dark:border-ink-600" />}>
            <MenuItem icon={Mail} href={mailtoLink(inv, profile)}>Email invoice</MenuItem>
            <MenuItem icon={Copy} onClick={copy}>Copy summary</MenuItem>
            {typeof navigator.share === 'function' && <MenuItem icon={Share2} onClick={share}>Share</MenuItem>}
            <MenuItem icon={Copy} onClick={async () => { const r = await duplicateInvoice(inv, all, toast); nav(`/invoices/${r.id}`); }}>Duplicate</MenuItem>
            <MenuRule />
            {st === 'void' ? <MenuItem icon={RotateCcw} onClick={() => restoreDraft(inv, toast)}>Restore as draft</MenuItem> : st !== 'paid' && <MenuItem icon={Ban} onClick={() => setVoid(inv, toast)}>Void invoice</MenuItem>}
            <MenuItem icon={Trash2} danger onClick={async () => { await softDelete(toast, 'invoices', inv, `${inv.number} deleted`); nav('/invoices'); }}>Delete</MenuItem>
          </Menu>
        </>} />

      <div className="no-print mb-6 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-5 py-4">
        {st === 'void' ? <Banner tone="neutral"><span className="flex flex-wrap items-center justify-between gap-3"><span>This invoice is void. It stays in your records but no longer counts as money owed.</span><Button size="sm" variant="outline" icon={RotateCcw} onClick={() => restoreDraft(inv, toast)}>Restore as draft</Button></span></Banner> : <Stepper inv={inv} />}
      </div>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {st !== 'void' && (
            <section className={cx('rounded-[10px] border p-5 md:p-6', st === 'overdue' ? 'border-[var(--bad)]/50 bg-red-50 dark:bg-red-950/30' : 'border-[var(--hairline)] bg-[var(--surface)]')} aria-label="Next step">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">{st === 'draft' ? 'Invoice total' : st === 'paid' ? 'Paid in full' : 'Balance due'}</p>
              <p className="mt-2 text-5xl font-bold leading-none tracking-tight">{m(st === 'draft' || st === 'paid' ? t.total : t.balance)}</p>
              {openInv && (
                <p className={cx('mt-3 flex items-center gap-2 text-sm font-bold', TONE_CLASS[due.tone])}>{st === 'overdue' && <AlertTriangle size={16} aria-hidden />}{due.text}{inv.due_date ? <span className="font-normal text-ink-500">· due {fmtDay(inv.due_date)}</span> : null}</p>
              )}
              {st === 'paid' && <p className="mt-3 flex items-center gap-2 text-sm font-bold text-[var(--good)]"><CheckCircle2 size={16} aria-hidden /> {inv.paid_at ? `Received ${fmtDate(inv.paid_at, { weekday: false, year: true })}` : 'Received'}</p>}
              {st === 'draft' && <p className="mt-3 text-sm text-ink-500">This is a draft. Nothing counts as owed until you send it.</p>}
              {t.paid > 0 && t.balance > 0 && (
                <div className="mt-4 max-w-sm"><Meter value={t.paid} max={t.total} label="Paid so far" warnAt={2} badAt={2} /><p className="mt-1 text-xs text-ink-500">{m(t.paid)} of {m(t.total)} received</p></div>
              )}
              <div className="no-print mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {st === 'draft' && <><SendMenu inv={inv} size="lg" align="left" label="Send invoice" block /><Button size="lg" className="w-full sm:w-auto" variant="outline" onClick={() => markSent(inv, toast)}>Mark as sent</Button></>}
                {openInv && <><Button size="lg" className="w-full sm:w-auto" icon={Banknote} onClick={() => setPaying(true)}>Record payment</Button><Button size="lg" className="w-full sm:w-auto" variant="soft" icon={CheckCircle2} loading={busy} onClick={markPaid}>Mark paid in full</Button><ChaseMenu invs={[inv]} size="lg" variant={st === 'overdue' ? 'primary' : 'outline'} align="left" block /></>}
                {st === 'paid' && <Button variant="outline" as={Link} to="/money">See it in your income</Button>}
              </div>
            </section>
          )}

          <section className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]" aria-label="Items">
            <h2 className="border-b border-[var(--hairline)] px-5 py-3 font-display text-xl font-semibold">What was billed</h2>
            <ul className="divide-y divide-[var(--hairline)] px-5 text-sm">
              {inv.items.map((it, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-3">
                  <span className="min-w-0"><span className="block font-bold">{it.description}</span><span className="text-xs text-ink-500">{it.qty} x {m(it.unit_cents)}</span></span>
                  <span className="shrink-0 font-bold tabular-nums">{m(lineCents(it))}</span>
                </li>
              ))}
            </ul>
            <dl className="ml-auto max-w-xs space-y-1.5 border-t border-[var(--hairline)] px-5 py-4 text-sm tabular-nums">
              <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd>{m(t.subtotal)}</dd></div>
              {t.discount > 0 && <div className="flex justify-between"><dt className="text-ink-500">Discount</dt><dd>-{m(t.discount)}</dd></div>}
              {t.tax > 0 && <div className="flex justify-between"><dt className="text-ink-500">Tax ({inv.tax_pct}%)</dt><dd>{m(t.tax)}</dd></div>}
              <div className="flex justify-between border-t border-ink-300 pt-2 text-base font-bold dark:border-ink-600"><dt>Total</dt><dd>{m(t.total)}</dd></div>
              {t.paid > 0 && <div className="flex justify-between text-[var(--good)]"><dt>Received</dt><dd>-{m(t.paid)}</dd></div>}
              {t.paid > 0 && <div className="flex justify-between font-bold"><dt>Balance</dt><dd>{m(t.balance)}</dd></div>}
            </dl>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-5" aria-label="Customer">
            <h2 className="font-display text-xl font-semibold">Bill to</h2>
            <p className="mt-2 font-bold">{inv.customer}</p>
            {inv.customer_address && <p className="whitespace-pre-line text-sm text-ink-500">{inv.customer_address}</p>}
            {inv.customer_email && <p className="mt-1 text-sm"><a className="font-bold text-brand-600 underline-offset-2 hover:underline dark:text-brand-400" href={`mailto:${inv.customer_email}`}>{inv.customer_email}</a></p>}
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-[var(--hairline)] pt-3 text-sm">
              <dt className="text-ink-500">Issued</dt><dd className="text-right font-bold">{fmtDay(inv.issue_date)}</dd>
              <dt className="text-ink-500">Due</dt><dd className="text-right font-bold">{inv.due_date ? fmtDay(inv.due_date) : 'Not set'}</dd>
              <dt className="text-ink-500">Currency</dt><dd className="text-right font-bold">{inv.currency}</dd>
            </dl>
          </section>
          <section className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-5" aria-label="Payments">
            <h2 className="font-display text-xl font-semibold">Payments received</h2>
            {payments.length ? (
              <ul className="mt-2 divide-y divide-[var(--hairline)] text-sm">
                {payments.map((p) => <li key={p.id} className="flex justify-between gap-3 py-2"><span>{fmtDate(p.received_at, { weekday: false, year: true })}</span><b className="tabular-nums text-[var(--good)]">{fmtMoney(p.amount_cents, p.currency)}</b></li>)}
              </ul>
            ) : <p className="mt-1 text-sm text-ink-500">Nothing received yet. When you record a payment it is also added to your income.</p>}
          </section>
          {inv.notes && (
            <section className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-5" aria-label="Notes">
              <h2 className="font-display text-xl font-semibold">Payment details</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-ink-600 dark:text-ink-300">{inv.notes}</p>
            </section>
          )}
        </aside>
      </div>
      {paying && <PaymentModal inv={inv} onClose={() => setPaying(false)} />}
    </>
  );
}
