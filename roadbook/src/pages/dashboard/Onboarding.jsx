// First-run checklist, with a sample-data shortcut in guest mode.
import { Link } from 'react-router-dom';
import { ArrowRight, Check, FlaskConical } from 'lucide-react';
import { Button, cx } from '../../components/ui.jsx';

export default function Onboarding({ steps, isAccount, onDemo, demoBusy }) {
  const done = steps.filter((s) => s.done).length;
  const nextIdx = steps.findIndex((s) => !s.done);
  return (
    <section aria-labelledby="ob-h" className="grid overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] lg:grid-cols-[1.5fr_1fr]">
      <div className="border-l-4 border-brand-500 p-5 sm:p-7">
        <h2 id="ob-h" className="font-display text-3xl font-bold leading-none">Let's get you on the road</h2>
        <p className="mt-2 max-w-lg text-sm text-ink-600 dark:text-ink-300">Four quick steps and this page fills up with your profit, costs and cost per kilometre.</p>
        <div className="mt-4 flex items-center gap-3" role="img" aria-label={`${done} of ${steps.length} steps done`}>
          <div className="flex flex-1 gap-1.5">{steps.map((s) => <span key={s.id} className={cx('h-1.5 flex-1 rounded-full', s.done ? 'bg-brand-500' : 'bg-ink-200 dark:bg-ink-700')} />)}</div>
          <span className="text-sm font-bold tabular-nums">{done} of {steps.length}</span>
        </div>
        <ol className="mt-3 divide-y divide-[var(--hairline)]">
          {steps.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', s.done ? 'bg-brand-500 text-ink-950' : 'border-2 border-ink-300 text-ink-500 dark:border-ink-600')}>{s.done ? <Check size={15} strokeWidth={3} /> : i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className={cx('font-bold', s.done && 'text-ink-500 line-through decoration-ink-300')}>{s.title}<span className="sr-only">{s.done ? ' (done)' : ''}</span></div>
                {!s.done && <p className="text-sm text-ink-500">{s.hint}</p>}
              </div>
              {!s.done && <Button as={Link} to={s.to} size="sm" variant={i === nextIdx ? 'primary' : 'soft'} className="shrink-0">{s.cta}</Button>}
            </li>
          ))}
        </ol>
      </div>
      {!isAccount && (
        <div className="relative flex flex-col justify-center bg-ink-950 p-6 text-white dark:bg-ink-800 sm:p-8">
          <FlaskConical size={26} className="text-brand-400" aria-hidden="true" />
          <h3 className="mt-3 font-display text-2xl font-semibold">Just looking around?</h3>
          <p className="mt-1.5 text-sm text-ink-300">Fill the app with a truck, a few loads, fuel stops and invoices so you can see how it all works. You can clear it with one click.</p>
          <div className="mt-5"><Button icon={FlaskConical} loading={demoBusy} onClick={onDemo}>Try with sample data</Button></div>
          <div className="roadline absolute inset-x-0 bottom-0 opacity-60" aria-hidden="true" />
        </div>
      )}
      {isAccount && (
        <div className="hidden items-center bg-ink-50 p-8 dark:bg-ink-800/50 lg:flex"><p className="text-sm text-ink-600 dark:text-ink-300">Everything you add is saved on this device first and backed up to your account when you are online.<Link to="/loads?new=1" className="mt-3 flex items-center gap-1 font-bold text-brand-600 dark:text-brand-400">Start with a load <ArrowRight size={14} /></Link></p></div>
      )}
    </section>
  );
}
