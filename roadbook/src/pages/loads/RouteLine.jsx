// Origin -> destination drawn as a road: ring, dotted line (truck at its progress), pin.
import { Truck, MapPin } from 'lucide-react';
import { cx } from '../../components/ui.jsx';
import { PROGRESS } from './shared.js';

export default function RouteLine({ from, to, status, truck = false, big = false }) {
  const p = PROGRESS[status] ?? 0;
  return (
    <div>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className={cx('shrink-0 rounded-full border-[3px] border-ink-800 bg-[var(--surface)] dark:border-ink-200', big ? 'h-4 w-4' : 'h-3 w-3')} />
        <span className="relative h-5 flex-1">
          <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-[3px] border-dotted border-ink-300 dark:border-ink-600" />
          {truck && (
            <>
              <span className="absolute left-0 top-1/2 -translate-y-1/2 border-t-[3px] border-solid border-brand-500" style={{ width: `${p * 100}%` }} />
              <span className="absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500 text-ink-950 shadow" style={{ left: `calc(${p * 100}% - ${p * 28}px)` }}><Truck size={15} strokeWidth={2.4} /></span>
            </>
          )}
        </span>
        <MapPin size={big ? 22 : 17} strokeWidth={2.4} className="shrink-0 text-brand-600 dark:text-brand-400" />
      </div>
      <div className={cx('mt-1 flex items-start justify-between gap-3', big ? 'text-base' : 'text-[13px]')}>
        <span className="min-w-0 flex-1 break-words font-bold leading-snug">{from || <span className="font-normal text-ink-400">Pickup not set</span>}</span>
        <span className="min-w-0 flex-1 break-words text-right font-bold leading-snug">{to || <span className="font-normal text-ink-400">Drop-off not set</span>}</span>
      </div>
    </div>
  );
}
