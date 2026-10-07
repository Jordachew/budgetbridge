import { Fragment } from 'react';
import { AlertTriangle, Check, FileText, Send, Wallet } from 'lucide-react';
import { cx } from '../../components/ui.jsx';
import { displayStatus, invoiceTotals } from './totals.js';
import { fmtDay } from './helpers.js';
import { fmtDate, fmtMoney } from '../../core/format.js';

const STEPS = [{ id: 'draft', label: 'Draft', icon: FileText }, { id: 'sent', label: 'Sent', icon: Send }, { id: 'paid', label: 'Paid', icon: Wallet }];

/** Draft -> Sent -> Paid, with what has happened under each step. `inv` may be a partly filled new invoice. */
export default function Stepper({ inv, compact }) {
  const st = displayStatus(inv);
  const t = invoiceTotals(inv);
  const at = st === 'draft' ? 0 : st === 'paid' ? 2 : st === 'void' ? -1 : 1;
  if (at < 0) return null;
  const caption = (i) => {
    if (i === 0) return inv.id ? 'Created' : 'Not saved yet';
    if (i === 1) return at >= 1 ? `Issued ${fmtDay(inv.issue_date, false)}` : 'Not sent yet';
    if (st === 'paid') return inv.paid_at ? fmtDate(inv.paid_at, { weekday: false }) : 'In full';
    if (t.paid > 0) return `${fmtMoney(t.paid, inv.currency)} so far`;
    return 'Waiting for payment';
  };
  return (
    <ol className="flex w-full items-start" aria-label="Invoice progress">
      {STEPS.map((s, i) => {
        const done = i < at || (i === 2 && st === 'paid');
        const here = i === at && st !== 'paid';
        const late = here && st === 'overdue';
        const Icon = done ? Check : late ? AlertTriangle : s.icon;
        return (
          <Fragment key={s.id}>
            {i > 0 && <li aria-hidden className={cx('mx-2 mt-[14px] h-[3px] min-w-6 flex-1 rounded', i <= at || st === 'paid' ? 'bg-brand-500' : 'bg-ink-200 dark:bg-ink-700')} />}
            <li aria-current={here ? 'step' : undefined} className="flex flex-col items-start">
              <span className={cx('flex h-[31px] w-[31px] items-center justify-center rounded-full border-2', done ? 'border-brand-500 bg-brand-500 text-ink-950' : late ? 'border-[var(--bad)] bg-[var(--surface)] text-[var(--bad)]' : here ? 'border-brand-500 bg-[var(--surface)] text-brand-600 ring-4 ring-brand-500/20' : 'border-ink-300 bg-[var(--surface)] text-ink-400 dark:border-ink-600')}>
                <Icon size={15} strokeWidth={2.4} />
              </span>
              <span className={cx('mt-1.5 text-sm font-bold', here || done ? 'text-ink-900 dark:text-white' : 'text-ink-500')}>{late ? 'Sent, overdue' : s.label}</span>
              {!compact && <span className="text-xs text-ink-500">{caption(i)}</span>}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
