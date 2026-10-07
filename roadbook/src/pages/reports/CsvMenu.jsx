import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { Button } from '../../components/ui.jsx';

/** Small "Download CSV" menu. items: [{ label, onClick, disabled }] */
export default function CsvMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" icon={Download} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>Download CSV <ChevronDown size={14} aria-hidden="true" /></Button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-30 w-52 rounded-[10px] bg-[var(--surface)] p-1.5 shadow-xl ring-1 ring-ink-200 dark:ring-ink-600">
          {items.map((it) => (
            <button key={it.label} role="menuitem" type="button" disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}
              className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-bold hover:bg-brand-100 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-brand-500/20">{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
