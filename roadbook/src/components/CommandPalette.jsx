import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, LayoutDashboard, PackageOpen, Receipt, Route, FileText, Wallet, BarChart3, Map, Wrench, Users, Bell, Settings, Plus } from 'lucide-react';
import { Kbd } from './ui.jsx';
import { searchAll } from '../lib/search.js';

const GO = [
  ['Dashboard', '/', LayoutDashboard], ['Loads', '/loads', PackageOpen], ['Expenses', '/expenses', Receipt], ['Trips', '/trips', Route], ['Invoices', '/invoices', FileText],
  ['Income & pay', '/money', Wallet], ['Reports', '/reports', BarChart3], ['Map & fuel', '/map', Map], ['Maintenance', '/maintenance', Wrench], ['Fleet', '/fleet', Users],
  ['Reminders', '/reminders', Bell], ['Settings', '/settings', Settings],
].map(([t, to, icon]) => ({ kind: 'Go to', title: t, to, icon }));
const NEW = [
  ['Add expense', '/expenses?new=1'], ['New load', '/loads?new=1'], ['New invoice', '/invoices?new=1'], ['Add income', '/money?new=1'], ['Start a trip', '/trips'],
].map(([t, to]) => ({ kind: 'Create', title: t, to, icon: Plus }));

/** Ctrl/Cmd+K (or "/") opens: jump anywhere, create something, or search loads, invoices, expenses, vehicles. */
export default function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const input = useRef(null);
  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const base = [...NEW, ...GO].filter((i) => !t || i.title.toLowerCase().includes(t));
    return [...(t ? searchAll(t) : []), ...base].slice(0, 14);
  }, [q, open]);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => setSel(0), [q]);
  if (!open) return null;
  const go = (it) => { onClose(); nav(it.to); };
  const key = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && items[sel]) go(items[sel]);
  };
  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center bg-ink-950/55 p-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-xl overflow-hidden rounded-[10px] bg-[var(--surface)] shadow-2xl ring-1 ring-ink-200 dark:ring-ink-600" onKeyDown={key}>
        <div className="flex items-center gap-3 border-b border-ink-200 px-4 dark:border-ink-700">
          <Search size={18} className="text-ink-400" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search loads, invoices, expenses, or jump to a page" aria-label="Search" className="h-12 flex-1 bg-transparent text-base outline-none placeholder:text-ink-400" />
          <Kbd>Esc</Kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-500">Nothing found</li>}
          {items.map((it, i) => (
            <li key={`${it.kind}-${it.title}-${i}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(it)}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${i === sel ? 'bg-brand-100 text-ink-950 dark:bg-brand-500/20 dark:text-white' : ''}`}>
              {it.icon ? <it.icon size={16} className="text-ink-500" /> : <span className="w-4" />}
              <span className="flex-1 truncate font-bold">{it.title}{it.sub && <span className="ml-2 font-normal text-ink-500">{it.sub}</span>}</span>
              <span className="text-xs uppercase tracking-wide text-ink-500">{it.kind}</span>
              {i === sel && <CornerDownLeft size={14} className="text-ink-500" />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
