// Road-progress stepper: booked > picked up > in transit > delivered > reconciled.
import { Check } from 'lucide-react';
import { cx } from '../../components/ui.jsx';
import { FLOW, STATUS } from './shared.js';

/** size 'compact' (cards) shows five dots and the current step; 'full' (detail) shows icons and labels. */
export default function RoadStepper({ status, size = 'full' }) {
  const cancelled = status === 'cancelled';
  const idx = cancelled ? -1 : FLOW.indexOf(status);
  const cur = STATUS[status] || STATUS.booked;
  if (size === 'compact') {
    return (
      <div aria-label={`Progress: ${cur.label}, step ${Math.max(idx + 1, 0)} of ${FLOW.length}`} role="group">
        <div className="flex items-center" aria-hidden="true">
          {FLOW.map((s, i) => (
            <div key={s} className={cx('flex items-center', i < FLOW.length - 1 && 'flex-1')}>
              <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full border-2',
                i < idx && 'border-ink-800 bg-ink-800 dark:border-ink-200 dark:bg-ink-200',
                i === idx && 'h-3.5 w-3.5 border-brand-500 bg-brand-500 ring-4 ring-brand-500/25',
                i > idx && 'border-ink-300 bg-transparent dark:border-ink-600')} />
              {i < FLOW.length - 1 && <span className={cx('mx-0.5 h-0 flex-1 border-t-2', i < idx ? 'border-solid border-ink-800 dark:border-ink-200' : 'border-dashed border-ink-300 dark:border-ink-600')} />}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-ink-500">
          <span className="inline-flex items-center gap-1 text-ink-800 dark:text-ink-100"><cur.icon size={12} strokeWidth={2.5} />{cur.label}</span>
          <span>{cancelled ? '' : `${idx + 1}/${FLOW.length}`}</span>
        </div>
      </div>
    );
  }
  return (
    <ol className="flex items-start" aria-label="Load progress">
      {FLOW.map((s, i) => {
        const done = i < idx; const now = i === idx; const st = STATUS[s];
        return (
          <li key={s} className={cx('flex min-w-0 items-start', i < FLOW.length - 1 && 'flex-1')} aria-current={now ? 'step' : undefined}>
            <div className="flex w-[3.6rem] shrink-0 flex-col items-center gap-1.5 sm:w-20">
              <span className={cx('flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors sm:h-11 sm:w-11',
                done && 'border-ink-800 bg-ink-800 text-white dark:border-ink-200 dark:bg-ink-200 dark:text-ink-900',
                now && 'border-brand-500 bg-brand-500 text-ink-950 ring-4 ring-brand-500/25',
                !done && !now && 'border-ink-300 bg-[var(--surface)] text-ink-400 dark:border-ink-600')}>
                {done ? <Check size={18} strokeWidth={3} /> : <st.icon size={18} strokeWidth={2.2} />}
              </span>
              <span className={cx('text-center text-[11px] font-bold leading-tight sm:text-xs', now ? 'text-ink-900 dark:text-white' : done ? 'text-ink-700 dark:text-ink-200' : 'text-ink-400')}>{st.label}</span>
            </div>
            {i < FLOW.length - 1 && <span aria-hidden="true" className={cx('mt-5 h-0 flex-1 border-t-[3px] sm:mt-[1.35rem]', i < idx ? 'border-solid border-ink-800 dark:border-ink-200' : 'border-dashed border-brand-500/70')} />}
          </li>
        );
      })}
    </ol>
  );
}
