// Full-screen sheet on phones, centred panel on desktop. Header, scrolling body, pinned footer.
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cx } from '../../components/ui.jsx';

export default function Sheet({ title, eyebrow, onClose, children, footer, wide, onSubmit, headerExtra }) {
  const ref = useRef(null);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  const Wrap = onSubmit ? 'form' : 'div';
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-ink-950/55 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Wrap ref={ref} role="dialog" aria-modal="true" aria-label={title} noValidate={onSubmit ? true : undefined}
        onSubmit={onSubmit ? (e) => { e.preventDefault(); onSubmit(e); } : undefined}
        className={cx('flex h-[100dvh] w-full flex-col bg-[var(--paper)] sm:h-auto sm:max-h-[94vh] sm:rounded-[12px] sm:shadow-2xl sm:ring-1 sm:ring-ink-300 dark:sm:ring-ink-700', wide ? 'sm:max-w-2xl' : 'sm:max-w-xl')}>
        <div className="flex items-center gap-3 border-b border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 sm:rounded-t-[12px]">
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">{eyebrow}</div>}
            <h2 className="truncate font-display text-2xl font-bold leading-tight">{title}</h2>
          </div>
          {headerExtra}
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"><X size={22} /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-[var(--hairline)] bg-[var(--surface)] px-4 pb-safe pt-3 sm:rounded-b-[12px]">{footer}</div>}
      </Wrap>
    </div>
  );
}
