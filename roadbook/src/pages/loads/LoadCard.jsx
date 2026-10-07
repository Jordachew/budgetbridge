// A load as a dispatch waybill: plate reference, route, dates, progress, and a tear-off stub with the next action.
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, Check } from 'lucide-react';
import { Plate, Badge, cx } from '../../components/ui.jsx';
import { useMoney } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import RoadStepper from './RoadStepper.jsx';
import RouteLine from './RouteLine.jsx';
import { ACTIVE, STATUS, nextAction, relDay, setLoadStatus } from './shared.js';

export const isLate = (load) => ACTIVE.includes(load.status) && load.drop_at && new Date(load.drop_at) < new Date();

/** Runs the next action for a load: flips the status (Undo toast) or goes to the right screen. */
export function useRunAction() {
  const nav = useNavigate();
  const toast = useToast();
  return (load, act) => {
    if (!act) return;
    if (act.type === 'status') setLoadStatus(load, act.to, toast);
    else if (act.type === 'proof') nav(`/loads/${load.id}?tab=proof&proof=1`);
    else if (act.type === 'invoice') nav(`/invoices?new=1&load=${load.id}`);
    else if (act.type === 'pay') nav(`/invoices?load=${load.id}`);
  };
}

export default function LoadCard({ load, ctx }) {
  const money = useMoney();
  const run = useRunAction();
  const act = nextAction(load, ctx);
  const late = isLate(load);
  const closed = load.status === 'reconciled';
  const st = STATUS[load.status];
  return (
    <article className={cx('paper-card relative overflow-hidden transition-shadow hover:shadow-md', load.status === 'cancelled' && 'opacity-70')}>
      <Link to={`/loads/${load.id}`} className="block p-3.5 pb-3 focus-visible:outline-offset-[-2px]" aria-label={`Open ${load.reference || load.customer || 'load'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Plate>{load.reference || 'NO REF'}</Plate>
            <div className="mt-1.5 truncate text-xs text-ink-500">{load.customer || 'No customer'}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[1.05rem] font-bold leading-none tabular-nums">{money(load.rate_cents, load.currency)}</div>
            {ctx.billing === 'paid' && <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase text-[var(--good)]"><Check size={11} strokeWidth={3} />Paid</div>}
            {ctx.billing === 'unpaid' && <div className="mt-1 text-[11px] font-bold uppercase text-[var(--warn)]">Invoice open</div>}
          </div>
        </div>
        <div className="mt-3"><RouteLine from={load.pickup_label} to={load.drop_label} status={load.status} /></div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1"><CalendarClock size={12} />{load.pickup_at ? <>Pickup <b className="font-bold text-ink-700 dark:text-ink-200">{relDay(load.pickup_at)}</b></> : 'No pickup time'}</span>
          {load.drop_at && <span>Drop <b className="font-bold text-ink-700 dark:text-ink-200">{relDay(load.drop_at, { time: false })}</b></span>}
          {late && <Badge tone="red" icon={AlertTriangle}>Late</Badge>}
        </div>
        <div className="mt-3"><RoadStepper status={load.status} size="compact" /></div>
      </Link>
      {/* tear-off stub */}
      <div className="relative border-t-2 border-dashed border-ink-300 bg-ink-50/60 p-2 dark:border-ink-600 dark:bg-ink-800/40">
        <span aria-hidden="true" className="absolute -left-2 -top-[9px] h-4 w-4 rounded-full border border-[var(--hairline)] bg-[var(--paper)]" />
        <span aria-hidden="true" className="absolute -right-2 -top-[9px] h-4 w-4 rounded-full border border-[var(--hairline)] bg-[var(--paper)]" />
        {act && load.status !== 'cancelled' ? (
          <button type="button" onClick={() => run(load, act)} className="flex h-11 w-full items-center justify-between gap-2 rounded-md bg-brand-500 px-3.5 text-sm font-bold text-ink-950 shadow-[0_1px_0_rgba(0,0,0,0.15)] hover:bg-brand-400 active:bg-brand-300">
            <span>{act.label}</span><ArrowRight size={17} strokeWidth={2.6} />
          </button>
        ) : (
          <div className="flex h-11 items-center justify-between px-2 text-sm font-bold text-ink-500">
            <span className="inline-flex items-center gap-1.5"><st.icon size={15} />{closed ? 'Closed out' : st.label}</span>
            {load.status === 'cancelled' && <button type="button" className="rounded px-2 py-1 text-brand-600 hover:underline dark:text-brand-400" onClick={() => run(load, act)}>Reopen</button>}
          </div>
        )}
      </div>
    </article>
  );
}
