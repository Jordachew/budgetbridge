import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, FileCheck2, Send as SendIcon, Banknote, CheckCircle2, Copy, FileText, Plus, Printer, RotateCcw, Search, Trash2, Ban, X, MoreHorizontal, ArrowUpRight } from 'lucide-react';
import { Badge, Button, Empty, IconButton, Input, cx } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { softDelete } from '../../lib/undo.js';
import { fmtMoney, plural } from '../../core/format.js';
import { displayStatus, invoiceTotals, todayStr } from './totals.js';
import { AGE_BUCKETS, ageBucket, dueWords, fmtDay, isOpen, TONE_CLASS } from './helpers.js';
import { ChaseMenu, SendMenu } from './ChaseMenu.jsx';
import { Menu, MenuItem, MenuRule } from './Menu.jsx';
import PaymentModal from './PaymentModal.jsx';
import { duplicateInvoice, paymentToast, recordPayment, restoreDraft, setVoid } from './actions.js';

export const TONE = { draft: 'neutral', sent: 'blue', paid: 'green', overdue: 'red', void: 'neutral' };
export const LABEL = { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', void: 'Void' };
const TAB_IDS = ['all', 'draft', 'sent', 'overdue', 'paid', 'void'];
const ORDER = { overdue: 0, sent: 1, draft: 2, paid: 3, void: 4 };

const STATUS_ICON = { draft: FileText, sent: SendIcon, paid: FileCheck2, overdue: AlertTriangle, void: Ban };
export function StatusBadge({ inv, today }) {
  const s = displayStatus(inv, today);
  return <Badge tone={TONE[s]} icon={STATUS_ICON[s]} className={s === 'void' ? 'line-through' : ''}>{LABEL[s]}</Badge>;
}

/** Everything you can do to one invoice from a list: shared by the ledger rows. */
export function RowMenu({ inv, all }) {
  const nav = useNavigate();
  const toast = useToast();
  const [paying, setPaying] = useState(false);
  const st = displayStatus(inv);
  const open = isOpen(inv);
  return (
    <>
      <Menu trigger={({ open: o, toggle }) => <IconButton icon={MoreHorizontal} label={`More actions for ${inv.number}`} aria-haspopup="menu" aria-expanded={o} onClick={toggle} />}>
        <MenuItem icon={ArrowUpRight} onClick={() => nav(`/invoices/${inv.id}`)}>Open</MenuItem>
        {open && <MenuItem icon={Banknote} onClick={() => setPaying(true)}>Record part payment</MenuItem>}
        <MenuItem icon={Printer} onClick={() => nav(`/invoices/${inv.id}/print`)}>Print or save as PDF</MenuItem>
        <MenuItem icon={Copy} onClick={async () => { const r = await duplicateInvoice(inv, all, toast); nav(`/invoices/${r.id}`); }}>Duplicate</MenuItem>
        <MenuRule />
        {st === 'void' ? <MenuItem icon={RotateCcw} onClick={() => restoreDraft(inv, toast)}>Restore as draft</MenuItem>
          : st !== 'paid' && <MenuItem icon={Ban} onClick={() => setVoid(inv, toast)}>Void</MenuItem>}
        <MenuItem icon={Trash2} danger onClick={() => softDelete(toast, 'invoices', inv, `${inv.number} deleted`)}>Delete</MenuItem>
      </Menu>
      {paying && <PaymentModal inv={inv} onClose={() => setPaying(false)} />}
    </>
  );
}

function MarkPaid({ inv }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="soft" size="sm" icon={CheckCircle2} loading={busy} aria-label={`Mark ${inv.number} as paid in full`}
      onClick={async () => { setBusy(true); try { paymentToast(toast, await recordPayment(inv, invoiceTotals(inv).balance), inv); } catch { toast('Could not record the payment.', { bad: true }); } setBusy(false); }}>Mark paid</Button>
  );
}

const GRID = 'md:grid-cols-[9rem_minmax(0,1fr)_9.5rem_6.5rem_8.5rem_14rem]';

function Row({ inv, all, today }) {
  const nav = useNavigate();
  const st = displayStatus(inv, today);
  const t = invoiceTotals(inv);
  const due = dueWords(inv, today);
  const partial = t.paid > 0 && t.balance > 0;
  const stop = (e) => e.stopPropagation();
  return (
    <li onClick={() => nav(`/invoices/${inv.id}`)} className={cx('grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-brand-50/70 dark:hover:bg-ink-800/50 md:py-3', GRID, st === 'void' && 'opacity-60')}>
      <div className="order-3 col-span-2 text-xs text-ink-500 md:order-none md:col-span-1">
        <Link to={`/invoices/${inv.id}`} onClick={stop} className="font-display text-base font-bold tracking-wide text-ink-900 hover:underline dark:text-white md:block">{inv.number}</Link>
        <span className="md:hidden"> · </span>issued {fmtDay(inv.issue_date, false)}
      </div>
      <div className="order-1 min-w-0 md:order-none">
        <p className="truncate font-bold text-ink-900 dark:text-white">{inv.customer || 'No customer'}</p>
        {inv.items?.[0]?.description && <p className="hidden truncate text-xs text-ink-500 md:block">{inv.items[0].description}{inv.items.length > 1 ? ` + ${inv.items.length - 1} more` : ''}</p>}
      </div>
      <div className="order-4 md:order-none">
        <p className={cx('text-sm font-bold', TONE_CLASS[due.tone])} title={inv.due_date ? `Due ${fmtDay(inv.due_date)}` : undefined}>{due.text}</p>
        {inv.due_date && st !== 'paid' && st !== 'void' && <p className="hidden text-xs text-ink-500 md:block">{fmtDay(inv.due_date, false)}</p>}
      </div>
      <div className="order-5 justify-self-end md:order-none md:justify-self-start"><StatusBadge inv={inv} today={today} /></div>
      <div className="order-2 text-right md:order-none">
        <p className="text-lg font-bold leading-tight tabular-nums text-ink-900 dark:text-white md:text-base">{fmtMoney(partial ? t.balance : t.total, inv.currency)}</p>
        {partial && <p className="text-xs text-ink-500">of {fmtMoney(t.total, inv.currency)}</p>}
      </div>
      <div className="order-6 col-span-2 mt-1 flex items-center gap-2 md:order-none md:col-span-1 md:mt-0 md:justify-end" onClick={stop}>
        {st === 'draft' && <SendMenu inv={inv} align="left" />}
        {(st === 'sent' || st === 'overdue') && <><ChaseMenu invs={[inv]} variant={st === 'overdue' ? 'primary' : 'outline'} align="left" /><MarkPaid inv={inv} /></>}
        <span className="ml-auto md:ml-0"><RowMenu inv={inv} all={all} /></span>
      </div>
    </li>
  );
}

/** The ruled ledger: tabs with counts, search, ageing filter, rows with quick actions. */
export default function Ledger({ invoices, cur, tab, setTab, q, setQ, age, setAge, onNew }) {
  const today = todayStr();
  const counts = useMemo(() => Object.fromEntries(TAB_IDS.map((t) => [t, t === 'all' ? invoices.length : invoices.filter((i) => displayStatus(i, today) === t).length])), [invoices, today]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices
      .filter((i) => (tab === 'all' || displayStatus(i, today) === tab)
        && (!age || (isOpen(i) && i.currency === cur && ageBucket(i, today) === age))
        && (!needle || `${i.number} ${i.customer} ${(i.items || []).map((x) => x.description).join(' ')}`.toLowerCase().includes(needle)))
      .sort((a, b) => {
        if (tab === 'all') {
          const d = ORDER[displayStatus(a, today)] - ORDER[displayStatus(b, today)];
          if (d) return d;
        }
        const sa = displayStatus(a, today);
        if (sa === 'overdue' || sa === 'sent') return (a.due_date || '9999').localeCompare(b.due_date || '9999');
        return (b.issue_date || '').localeCompare(a.issue_date || '') || (b.number || '').localeCompare(a.number || '');
      });
  }, [invoices, tab, q, age, cur, today]);
  const openInView = rows.filter(isOpen).reduce((a, i) => (i.currency === cur ? a + invoiceTotals(i).balance : a), 0);
  const ageLabel = AGE_BUCKETS.find((b) => b.id === age);

  return (
    <section aria-label="Invoice ledger">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div role="tablist" aria-label="Invoice status" className="-mx-4 flex gap-0.5 overflow-x-auto border-b border-[var(--hairline)] px-4 md:mx-0 md:flex-1 md:px-0">
          {TAB_IDS.map((t) => {
            const on = tab === t;
            return (
              <button key={t} role="tab" type="button" aria-selected={on} onClick={() => { setTab(t); setAge(null); }}
                className={cx('relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-bold', on ? 'text-ink-900 after:absolute after:inset-x-1 after:-bottom-px after:h-[3px] after:rounded-t after:bg-brand-500 dark:text-white' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-200')}>
                {t === 'all' ? 'All' : LABEL[t]}
                <span className={cx('rounded-[3px] px-1.5 text-xs tabular-nums leading-5', on ? 'bg-brand-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300', t === 'overdue' && counts[t] > 0 && !on && '!bg-red-100 !text-red-800 dark:!bg-red-950 dark:!text-red-300')}>{counts[t]}</span>
              </button>
            );
          })}
        </div>
        <div className="relative md:w-72">
          <Search size={16} className="pointer-events-none absolute left-3 top-3 text-ink-400" aria-hidden />
          <Input aria-label="Search invoices" className="pl-9" placeholder="Search customer, number or item" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {age && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink-100 py-1 pl-3 pr-1 text-sm font-bold dark:bg-ink-800">
          Showing {ageLabel.label}{age === 'current' ? ' (not due yet)' : ' overdue'}
          <button type="button" aria-label="Clear age filter" onClick={() => setAge(null)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-ink-200 dark:hover:bg-ink-700"><X size={14} /></button>
        </p>
      )}

      {!rows.length ? (
        <div className="mt-4">
          {invoices.length ? <Empty icon={FileText} title="No invoices match" text="Try another tab or a different search." action={<Button variant="outline" onClick={() => { setTab('all'); setQ(''); setAge(null); }}>Show everything</Button>} />
            : <Empty icon={FileText} title="Bill your first customer" text="Make an invoice in under a minute, send it by email or WhatsApp, and see here who still owes you. You can also start one from a delivered load." action={<div className="flex flex-wrap gap-2"><Button icon={Plus} onClick={onNew}>New invoice</Button><Button variant="outline" as={Link} to="/loads">Pick a delivered load</Button></div>} />}
        </div>
      ) : (
        <>
          <div className={cx('mt-3 hidden gap-x-4 px-4 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500 md:grid', GRID)} aria-hidden>
            <span>Invoice</span><span>Customer</span><span>Due</span><span>Status</span><span className="text-right">Amount</span><span />
          </div>
          <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)] bg-[var(--surface)] md:rounded-[10px] md:border">
            {rows.map((i) => <Row key={i.id} inv={i} all={invoices} today={today} />)}
          </ul>
          <p className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-ink-500">
            <span>{plural(rows.length, 'invoice')} shown</span>
            {openInView > 0 && <span>{fmtMoney(openInView, cur)} still to collect in this view</span>}
          </p>
        </>
      )}
    </section>
  );
}
