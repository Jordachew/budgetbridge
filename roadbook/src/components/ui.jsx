// Shared building blocks. Every screen uses these so the app looks like one product.
import { useEffect, useId, useRef, useState } from 'react';
import { X, Loader2, Inbox } from 'lucide-react';

const cx = (...a) => a.filter(Boolean).join(' ');
export { cx };

/* ---------- buttons ---------- */
const BTN = {
  primary: 'bg-brand-500 text-ink-950 hover:bg-brand-400 active:bg-brand-300 shadow-[0_1px_0_rgba(0,0,0,0.12)]',
  dark: 'bg-ink-900 text-white hover:bg-ink-700 dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-white',
  soft: 'bg-ink-100 text-ink-800 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-100 dark:hover:bg-ink-700',
  ghost: 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
  danger: 'bg-red-700 text-white hover:bg-red-800',
  outline: 'border border-ink-300 bg-transparent text-ink-800 hover:bg-ink-100 dark:border-ink-600 dark:text-ink-100 dark:hover:bg-ink-800',
};
const SIZE = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' };
export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, as: As = 'button', ...p }) {
  return (
    <As type={As === 'button' ? 'button' : undefined} disabled={loading || p.disabled}
      className={cx('inline-flex items-center justify-center rounded-md font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap', BTN[variant], SIZE[size], className)} {...p}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.2} /> : null}
      {children}
    </As>
  );
}
export const IconButton = ({ icon: Icon, label, className, ...p }) => (
  <button type="button" aria-label={label} title={label} className={cx('inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800', className)} {...p}><Icon size={18} /></button>
);

/* ---------- surfaces ---------- */
export const Card = ({ className, children, ...p }) => (
  <div className={cx('paper-card p-5', className)} {...p}>{children}</div>
);
export const CardTitle = ({ title, sub, action }) => (
  <div className="mb-4 flex items-start justify-between gap-3">
    <div><h3 className="font-display text-lg font-semibold leading-tight text-ink-900 dark:text-ink-50">{title}</h3>{sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}</div>
    {action}
  </div>
);
export function PageHeader({ title, sub, actions, back }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {back}
          <h1 className="font-display text-4xl font-bold leading-none tracking-tight text-ink-900 dark:text-white">{title}</h1>
          {sub && <p className="mt-2 text-sm text-ink-500">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="roadline mt-4" aria-hidden="true" />
    </div>
  );
}
const TONES = {
  neutral: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200',
  green: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  blue: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300',
  brand: 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300',
};
export const Badge = ({ tone = 'neutral', icon: Icon, className, children }) => (
  <span className={cx('inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide', TONES[tone], className)}>{Icon && <Icon size={12} strokeWidth={2.5} />}{children}</span>
);
/** Small stat tile. The figure is the chart: label, value, optional delta text and a sparkline slot. */
export function Stat({ label, value, sub, tone, icon: Icon, children }) {
  const col = tone === 'good' ? 'text-[var(--good)]' : tone === 'bad' ? 'text-[var(--bad)]' : 'text-ink-900 dark:text-white';
  return (
    <div className="paper-card p-4">
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-ink-500"><span>{label}</span>{Icon && <Icon size={15} />}</div>
      <div className={cx('mt-2 text-[1.7rem] font-bold leading-none', col)}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-ink-500">{sub}</div>}
      {children}
    </div>
  );
}
/** Plate-style tag for registrations and references. */
export const Plate = ({ children, className }) => (
  <span className={cx('inline-block rounded-[3px] border-2 border-ink-900 bg-brand-100 px-1.5 py-px font-display text-sm font-bold tracking-[0.14em] text-ink-900 dark:border-ink-200 dark:bg-brand-500 dark:text-ink-950', className)}>{children}</span>
);
export const Kbd = ({ children }) => <kbd className="rounded border border-ink-300 bg-ink-50 px-1.5 py-px font-sans text-[11px] font-bold text-ink-600 dark:border-ink-600 dark:bg-ink-800 dark:text-ink-300">{children}</kbd>;
export const Skeleton = ({ className }) => <div className={cx('skeleton', className)} aria-hidden="true" />;
/** Horizontal meter: fill carries severity, the track is a lighter step. value/max in any unit. */
export function Meter({ value, max, label, warnAt = 0.75, badAt = 0.95 }) {
  const r = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const color = r >= badAt ? 'var(--bad)' : r >= warnAt ? 'var(--series-4)' : 'var(--series-1)';
  return (
    <div role="meter" aria-valuenow={Math.round(r * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
      <div className="h-full rounded-full" style={{ width: `${r * 100}%`, background: color }} />
    </div>
  );
}
export function Empty({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="flex flex-col items-start gap-1 rounded-[10px] border border-dashed border-ink-300 bg-[var(--surface)] px-6 py-10 dark:border-ink-700 sm:flex-row sm:items-center sm:gap-5">
      <span className="mb-2 flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300 sm:mb-0"><Icon size={26} /></span>
      <div className="flex-1">
        <h3 className="font-display text-xl font-semibold">{title}</h3>
        {text && <p className="mt-1 max-w-md text-sm text-ink-500">{text}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
export const Banner = ({ tone = 'amber', children }) => (
  <div className={cx('rounded-md border-l-4 px-4 py-3 text-sm', TONES[tone], tone === 'amber' ? 'border-brand-500' : tone === 'red' ? 'border-red-600' : tone === 'green' ? 'border-emerald-600' : 'border-ink-400')}>{children}</div>
);

/* ---------- forms ---------- */
const INPUT = 'w-full rounded-md border border-ink-300 bg-[var(--surface)] px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-ink-600 dark:text-ink-50';
export function Field({ label, hint, error, children, className }) {
  const id = useId();
  return (
    <div className={cx('block', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-ink-700 dark:text-ink-200">{label}</label>
      {typeof children === 'function' ? children(id) : children}
      {hint && !error && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
export const Input = ({ className, ...p }) => <input className={cx(INPUT, 'h-10', className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea className={cx(INPUT, 'min-h-[84px] py-2', className)} {...p} />;
export const Select = ({ className, children, ...p }) => <select className={cx(INPUT, 'h-10 pr-8', className)} {...p}>{children}</select>;
export function Segmented({ value, onChange, options, className }) {
  return (
    <div role="tablist" className={cx('inline-flex rounded-md bg-ink-100 p-1 dark:bg-ink-800', className)}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('rounded px-3 py-1.5 text-sm font-bold transition-colors', value === o.value ? 'bg-[var(--surface)] text-ink-900 shadow-sm ring-1 ring-ink-200 dark:bg-ink-700 dark:text-white dark:ring-ink-600' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-200')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
export function Chips({ value, onChange, options }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={cx('rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-colors', value === o.value ? 'bg-brand-500 text-ink-950 ring-brand-500' : 'bg-[var(--surface)] text-ink-700 ring-ink-300 hover:bg-ink-100 dark:text-ink-200 dark:ring-ink-600')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
export function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-ink-500">{hint}</span>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full bg-ink-300 transition-colors peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 dark:bg-ink-700" />
    </label>
  );
}

/* ---------- overlays ---------- */
export function Modal({ open, onClose, title, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input,select,textarea,button')?.focus();
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-[14px] bg-[var(--surface)] shadow-2xl ring-1 ring-ink-200 dark:ring-ink-700 sm:rounded-[10px]', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4 dark:border-ink-800">
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-200 px-5 py-3 pb-safe dark:border-ink-800">{footer}</div>}
      </div>
    </div>
  );
}
export function useConfirm() {
  const [state, setState] = useState(null);
  const confirm = (opts) => new Promise((resolve) => setState({ ...opts, resolve }));
  const close = (v) => { state?.resolve(v); setState(null); };
  const node = (
    <Modal open={!!state} onClose={() => close(false)} title={state?.title || 'Are you sure?'}
      footer={<><Button variant="ghost" onClick={() => close(false)}>Cancel</Button><Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirmLabel || 'Confirm'}</Button></>}>
      <p className="text-sm text-ink-600 dark:text-ink-300">{state?.text}</p>
    </Modal>
  );
  return [confirm, node];
}

/* ---------- table ---------- */
export function Table({ columns, rows, onRow, empty, rowKey = (r) => r.id }) {
  if (!rows.length) return empty || null;
  return (
    <div className="overflow-x-auto paper-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-ink-100/70 text-xs font-bold uppercase tracking-wide text-ink-500 dark:bg-ink-800/60">
          <tr>{columns.map((c) => <th key={c.key} className={cx('px-4 py-2.5 font-medium', c.right && 'text-right', c.hide && 'hidden md:table-cell')}>{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={cx(onRow && 'cursor-pointer hover:bg-brand-50 dark:hover:bg-ink-800/60')}>
              {columns.map((c) => <td key={c.key} className={cx('px-4 py-3', c.right && 'text-right tabular-nums', c.hide && 'hidden md:table-cell')}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
