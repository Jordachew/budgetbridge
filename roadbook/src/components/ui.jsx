// Shared building blocks. Every screen uses these so the app looks like one product.
import { useEffect, useId, useRef, useState } from 'react';
import { X, Loader2, Inbox } from 'lucide-react';

const cx = (...a) => a.filter(Boolean).join(' ');
export { cx };

/* ---------- buttons ---------- */
const BTN = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-sm',
  dark: 'bg-ink-900 text-white hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-200',
  soft: 'bg-ink-100 text-ink-800 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-100 dark:hover:bg-ink-700',
  ghost: 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  outline: 'border border-ink-300 text-ink-800 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-100 dark:hover:bg-ink-800',
};
const SIZE = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' };
export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, as: As = 'button', ...p }) {
  return (
    <As type={As === 'button' ? 'button' : undefined} disabled={loading || p.disabled}
      className={cx('inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap', BTN[variant], SIZE[size], className)} {...p}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </As>
  );
}
export const IconButton = ({ icon: Icon, label, className, ...p }) => (
  <button type="button" aria-label={label} title={label} className={cx('inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800', className)} {...p}><Icon size={18} /></button>
);

/* ---------- surfaces ---------- */
export const Card = ({ className, children, ...p }) => (
  <div className={cx('rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink-200/70 dark:bg-ink-900 dark:ring-ink-800', className)} {...p}>{children}</div>
);
export const CardTitle = ({ title, sub, action }) => (
  <div className="mb-4 flex items-start justify-between gap-3">
    <div><h3 className="text-sm font-semibold text-ink-900 dark:text-ink-50">{title}</h3>{sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}</div>
    {action}
  </div>
);
export function PageHeader({ title, sub, actions, back }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {back}
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 dark:text-white">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
const TONES = {
  neutral: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  brand: 'bg-brand-100 text-brand-700 dark:bg-brand-700/20 dark:text-brand-400',
};
export const Badge = ({ tone = 'neutral', className, children }) => (
  <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', TONES[tone], className)}>{children}</span>
);
export function Stat({ label, value, sub, tone, icon: Icon }) {
  const col = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-ink-900 dark:text-white';
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between text-xs font-medium text-ink-500"><span>{label}</span>{Icon && <Icon size={16} />}</div>
      <div className={cx('mt-2 text-2xl font-bold tracking-tight tabular-nums', col)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-500">{sub}</div>}
    </Card>
  );
}
export function Empty({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-300 px-6 py-12 text-center dark:border-ink-700">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-500 dark:bg-ink-800"><Icon size={22} /></span>
      <h3 className="font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const Banner = ({ tone = 'amber', children }) => (
  <div className={cx('rounded-xl px-4 py-3 text-sm', TONES[tone])}>{children}</div>
);

/* ---------- forms ---------- */
const INPUT = 'w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50';
export function Field({ label, hint, error, children, className }) {
  const id = useId();
  return (
    <div className={cx('block', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-ink-200">{label}</label>
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
    <div role="tablist" className={cx('inline-flex rounded-lg bg-ink-100 p-1 dark:bg-ink-800', className)}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', value === o.value ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-200')}>
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
          className={cx('rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors', value === o.value ? 'bg-brand-500 text-white ring-brand-500' : 'bg-white text-ink-700 ring-ink-300 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700')}>
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
        className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-ink-900 sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4 dark:border-ink-800">
          <h2 className="text-base font-semibold">{title}</h2>
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
    <div className="overflow-x-auto rounded-xl ring-1 ring-ink-200/70 dark:ring-ink-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500 dark:bg-ink-900/60">
          <tr>{columns.map((c) => <th key={c.key} className={cx('px-4 py-2.5 font-medium', c.right && 'text-right', c.hide && 'hidden md:table-cell')}>{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-ink-100 bg-white dark:divide-ink-800 dark:bg-ink-900">
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={cx(onRow && 'cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-800/60')}>
              {columns.map((c) => <td key={c.key} className={cx('px-4 py-3', c.right && 'text-right tabular-nums', c.hide && 'hidden md:table-cell')}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
