// Active loads as waybills: route, road-progress stepper, dates and a stub with the rate.
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Clock, MapPin, PackageOpen, Truck } from 'lucide-react';
import { Plate, cx } from '../../components/ui.jsx';
import { fmtDateTime, fmtRelative } from '../../core/format.js';
import { STATUS, nextStatus } from '../loads/shared.js';

const STEPS = [
  { id: 'booked', label: 'Booked' },
  { id: 'picked_up', label: 'Picked up' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'delivered', label: 'Delivered' },
];

export function RoadStepper({ status }) {
  const at = Math.max(0, STEPS.findIndex((s) => s.id === status));
  return (
    <ol className="flex" aria-label="Load progress">
      {STEPS.map((s, i) => {
        const done = i < at;
        const here = i === at;
        return (
          <li key={s.id} className="relative flex-1 text-center" aria-current={here ? 'step' : undefined}>
            {i > 0 && <span className={cx('absolute right-1/2 top-[11px] h-[3px] w-full -translate-y-1/2 rounded', i <= at ? 'bg-brand-500' : 'bg-ink-200 dark:bg-ink-700')} aria-hidden="true" />}
            <span className={cx('relative z-10 mx-auto flex h-[22px] w-[22px] items-center justify-center rounded-full', done && 'bg-brand-500 text-ink-950', here && 'bg-brand-500 text-ink-950 ring-4 ring-brand-500/30', !done && !here && 'border-2 border-ink-300 bg-[var(--surface)] dark:border-ink-600')}>
              {done ? <Check size={13} strokeWidth={3.2} /> : here ? <Truck size={13} strokeWidth={2.6} /> : null}
            </span>
            <span className={cx('mt-1.5 block text-[11px] leading-tight', here ? 'font-bold text-ink-900 dark:text-white' : 'text-ink-500')}>{s.label}<span className="sr-only">{done ? ' (done)' : here ? ' (current step)' : ' (to come)'}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

function Waybill({ l, money }) {
  const next = nextStatus(l.status);
  const dueMs = l.drop_at ? new Date(l.drop_at).getTime() : null;
  const late = dueMs != null && dueMs < Date.now() && l.status !== 'delivered';
  const hint = next ? (next === 'delivered' ? 'Record delivery' : `Mark ${STATUS[next].label.toLowerCase()}`) : 'Open load';
  return (
    <article className="paper-card grid overflow-hidden sm:grid-cols-[1fr_auto]">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {l.reference && <Plate>{l.reference}</Plate>}
          <span className="font-bold">{l.customer || 'Load'}</span>
          {l.description && <span className="truncate text-sm text-ink-500">{l.description}</span>}
        </div>
        <div className="mt-3 flex items-start gap-2 text-lg font-bold leading-snug">
          <MapPin size={18} className="mt-1 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <span>{l.pickup_label || 'Pick-up'} <span className="font-normal text-ink-400" aria-label="to">→</span> {l.drop_label || 'Drop-off'}</span>
        </div>
        <div className="mx-auto mt-5 max-w-md"><RoadStepper status={l.status} /></div>
        <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-ink-500">Pick-up </dt><dd className="inline font-medium">{l.pickup_at ? fmtDateTime(l.pickup_at) : 'not set'}</dd></div>
          <div className={late ? 'font-bold' : undefined} style={late ? { color: 'var(--bad)' } : undefined}>
            <dt className="inline text-ink-500">{late ? 'Was due ' : 'Due '}</dt>
            <dd className="inline font-medium">{l.drop_at ? <>{fmtDateTime(l.drop_at)} · {late && <Clock size={12} className="mb-0.5 inline" aria-hidden="true" />} {fmtRelative(l.drop_at)}</> : 'no drop-off time'}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-row items-center justify-between gap-3 border-t border-dashed border-ink-300 bg-ink-50 px-4 py-3 dark:border-ink-600 dark:bg-ink-800/50 sm:min-w-[11rem] sm:flex-col sm:items-stretch sm:justify-between sm:border-l sm:border-t-0 sm:px-5 sm:py-5">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">Rate</div>
          <div className="text-xl font-bold tabular-nums">{money(l.rate_cents, l.currency)}</div>
          {l.weight_kg ? <div className="text-xs text-ink-500">{Math.round(l.weight_kg / 100) / 10} t</div> : null}
        </div>
        <Link to={`/loads/${l.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline dark:text-brand-400">{hint} <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
    </article>
  );
}

export default function Waybills({ loads, money }) {
  const shown = loads.slice(0, 4);
  return (
    <section aria-labelledby="road-h">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="road-h" className="font-display text-2xl font-semibold leading-none">On the road</h2>
        <Link to="/loads" className="text-sm font-bold text-brand-600 hover:underline dark:text-brand-400">All loads</Link>
      </div>
      {loads.length === 0 ? (
        <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-dashed border-ink-300 px-5 py-4 dark:border-ink-600">
          <PackageOpen size={26} className="text-ink-400" aria-hidden="true" />
          <p className="flex-1 text-sm text-ink-600 dark:text-ink-300">No loads booked or moving. When you book one, its waybill and progress show here.</p>
          <Link to="/loads?new=1" className="text-sm font-bold text-brand-600 hover:underline dark:text-brand-400">Book a load</Link>
        </div>
      ) : (
        <div className={cx('grid gap-3', shown.length > 1 && 'xl:grid-cols-2')}>{shown.map((l) => <Waybill key={l.id} l={l} money={money} />)}</div>
      )}
      {loads.length > shown.length && <p className="mt-2 text-sm text-ink-500">{loads.length - shown.length} more on the go. <Link to="/loads" className="font-bold text-brand-600 dark:text-brand-400">See all</Link></p>}
    </section>
  );
}
