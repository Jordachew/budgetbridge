import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { cx } from '../../components/ui.jsx';

const Close = createContext(() => {});

/** Small popover menu. `trigger({ open, toggle })` renders the opener. Closes on outside click and Esc. */
export function Menu({ trigger, children, align = 'right', width = 'min-w-[13rem]', className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div ref={ref} className={cx('relative inline-block text-left', className)} onClick={(e) => e.stopPropagation()}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div role="menu" className={cx('absolute z-30 mt-1.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface)] p-1 shadow-xl ring-1 ring-black/5', width, align === 'right' ? 'right-0' : align === 'auto' ? 'left-0 lg:left-auto lg:right-0' : 'left-0')}>
          <Close.Provider value={() => setOpen(false)}>{children}</Close.Provider>
        </div>
      )}
    </div>
  );
}

const ITEM = 'flex min-h-10 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-bold text-ink-800 hover:bg-brand-50 dark:text-ink-100 dark:hover:bg-ink-800';
export function MenuItem({ icon: Icon, children, onClick, href, danger, external }) {
  const close = useContext(Close);
  const cls = cx(ITEM, danger && '!text-[var(--bad)]');
  const inner = <>{Icon && <Icon size={16} className="shrink-0 text-ink-500" />}<span className="min-w-0 flex-1">{children}</span></>;
  if (href) return <a role="menuitem" className={cls} href={href} onClick={close} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{inner}</a>;
  return <button role="menuitem" type="button" className={cls} onClick={() => { close(); onClick?.(); }}>{inner}</button>;
}
export const MenuRule = () => <div className="my-1 h-px bg-[var(--hairline)]" role="separator" />;
