import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PackageOpen, Receipt, Route, FileText, Map, Wrench, Users, Bell, Settings, CloudOff, RefreshCw, CheckCircle2, Wallet, BarChart3, Plus, Search, X, Fuel, Truck } from 'lucide-react';
import { useApp } from '../state/app.jsx';
import { cx, Kbd } from './ui.jsx';
import CommandPalette from './CommandPalette.jsx';

const NAV = [
  { group: 'Run', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, tab: true },
    { to: '/loads', label: 'Loads', icon: PackageOpen, tab: true },
    { to: '/trips', label: 'Trips', icon: Route, tab: true },
    { to: '/map', label: 'Map & fuel', icon: Map },
  ] },
  { group: 'Money', items: [
    { to: '/expenses', label: 'Expenses', icon: Receipt, tab: true },
    { to: '/invoices', label: 'Invoices', icon: FileText, tab: true },
    { to: '/money', label: 'Income & pay', icon: Wallet },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
  ] },
  { group: 'Fleet', items: [
    { to: '/maintenance', label: 'Maintenance', icon: Wrench },
    { to: '/fleet', label: 'Fleet & crew', icon: Users },
    { to: '/reminders', label: 'Reminders', icon: Bell },
    { to: '/settings', label: 'Settings', icon: Settings },
  ] },
];
const FLAT = NAV.flatMap((g) => g.items);
const QUICK = [
  { label: 'Add expense', to: '/expenses?new=1', icon: Receipt },
  { label: 'Log fuel', to: '/expenses?new=1&cat=fuel', icon: Fuel },
  { label: 'New load', to: '/loads?new=1', icon: PackageOpen },
  { label: 'New invoice', to: '/invoices?new=1', icon: FileText },
  { label: 'Start a trip', to: '/trips', icon: Route },
  { label: 'Add income', to: '/money?new=1', icon: Wallet },
];

function SyncPill({ dark }) {
  const { status, online, isAccount } = useApp();
  const base = 'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-bold';
  if (!isAccount) return <span className={cx(base, dark ? 'bg-white/10 text-ink-200' : 'bg-ink-100 text-ink-600')}>On this device only</span>;
  if (!online || status.state === 'offline') return <span className={cx(base, 'bg-amber-100 text-amber-900')}><CloudOff size={13} /> Offline{status.pending ? ` · ${status.pending} waiting` : ''}</span>;
  if (status.state === 'syncing') return <span className={cx(base, 'bg-sky-100 text-sky-900')}><RefreshCw size={13} className="animate-spin" /> Syncing</span>;
  if (status.state === 'error' || status.failed) return <span className={cx(base, 'bg-red-100 text-red-800')}>Sync problem</span>;
  return <span className={cx(base, 'bg-emerald-100 text-emerald-900')}><CheckCircle2 size={13} /> Backed up</span>;
}

function QuickMenu({ onClose, className }) {
  const nav = useNavigate();
  return (
    <div className={cx('rounded-[10px] bg-[var(--surface)] p-2 shadow-2xl ring-1 ring-ink-200 dark:ring-ink-600', className)} role="menu">
      {QUICK.map((q) => (
        <button key={q.label} role="menuitem" type="button" onClick={() => { onClose(); nav(q.to); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-bold hover:bg-brand-100 dark:hover:bg-brand-500/20">
          <q.icon size={17} className="text-brand-600 dark:text-brand-300" />{q.label}
        </button>
      ))}
    </div>
  );
}

export default function Layout() {
  const [palette, setPalette] = useState(false);
  const [quick, setQuick] = useState(false);
  const [sheet, setSheet] = useState(false);
  const loc = useLocation();
  const title = FLAT.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label || 'Roadbook';

  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((v) => !v); }
      else if (!typing && e.key === '/') { e.preventDefault(); setPalette(true); }
      else if (!typing && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) { setQuick((v) => !v); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { setQuick(false); setSheet(false); }, [loc.pathname]);

  const link = ({ isActive }) => cx('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-bold transition-colors', isActive ? 'bg-brand-500 text-ink-950' : 'text-ink-300 hover:bg-white/10 hover:text-white');

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15.5rem_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen flex-col bg-ink-950 p-4 text-white md:flex">
        <Link to="/" className="mb-5 flex items-center gap-3 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-500 text-ink-950"><Truck size={20} strokeWidth={2.4} /></span>
          <span className="font-display text-2xl font-bold tracking-wide">ROADBOOK</span>
        </Link>
        <div className="relative mb-3">
          <button type="button" onClick={() => setQuick((v) => !v)} aria-haspopup="menu" aria-expanded={quick} className="flex h-10 w-full items-center justify-between rounded-md bg-brand-500 px-3 text-sm font-bold text-ink-950 hover:bg-brand-400">
            <span className="flex items-center gap-2"><Plus size={17} strokeWidth={2.6} /> New</span><Kbd>N</Kbd>
          </button>
          {quick && <QuickMenu onClose={() => setQuick(false)} className="absolute left-0 right-0 top-12 z-40 text-ink-900 dark:text-ink-100" />}
        </div>
        <button type="button" onClick={() => setPalette(true)} className="mb-4 flex h-9 items-center justify-between rounded-md border border-white/15 px-3 text-sm text-ink-300 hover:bg-white/10">
          <span className="flex items-center gap-2"><Search size={15} /> Search</span><Kbd>Ctrl K</Kbd>
        </button>
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Main">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="mb-1 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">{g.group}</div>
              <div className="flex flex-col gap-0.5">{g.items.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}><n.icon size={17} />{n.label}</NavLink>)}</div>
            </div>
          ))}
        </nav>
        <div className="roadline mb-3 opacity-40" aria-hidden="true" />
        <SyncPill dark />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-ink-950 px-4 py-2.5 text-white md:hidden">
          <Link to="/" className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded bg-brand-500 text-ink-950"><Truck size={16} strokeWidth={2.4} /></span><span className="font-display text-xl font-bold tracking-wide">{title.toUpperCase()}</span></Link>
          <div className="flex items-center gap-2"><SyncPill dark /><button type="button" aria-label="Search" onClick={() => setPalette(true)} className="rounded p-1.5 hover:bg-white/10"><Search size={19} /></button></div>
        </header>
        <main key={loc.pathname} className="page-enter mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10"><Outlet /></main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-ink-200 bg-[var(--surface)] pb-safe dark:border-ink-700 md:hidden" aria-label="Tabs">
        {[FLAT[0], FLAT[1]].map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold', isActive ? 'text-brand-600 dark:text-brand-400' : 'text-ink-500')}><n.icon size={21} />{n.label}</NavLink>)}
        <button type="button" aria-label="Add something new" onClick={() => setSheet(true)} className="mx-auto -mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-ink-950 shadow-lg ring-4 ring-[var(--paper)]"><Plus size={28} strokeWidth={2.8} /></button>
        {[FLAT[4], FLAT[5]].map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold', isActive ? 'text-brand-600 dark:text-brand-400' : 'text-ink-500')}><n.icon size={21} />{n.label}</NavLink>)}
      </nav>

      {sheet && (
        <div className="no-print fixed inset-0 z-50 bg-ink-950/55 md:hidden" onClick={() => setSheet(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-[14px] bg-[var(--surface)] p-4 pb-safe" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><span className="font-display text-2xl font-semibold">Add</span><button aria-label="Close" onClick={() => setSheet(false)}><X size={20} /></button></div>
            <div className="grid grid-cols-3 gap-2">
              {QUICK.map((q) => <Link key={q.label} to={q.to} className="flex flex-col items-center gap-1.5 rounded-md bg-brand-50 py-4 text-center text-xs font-bold dark:bg-ink-800"><q.icon size={22} className="text-brand-600 dark:text-brand-300" />{q.label}</Link>)}
            </div>
            <div className="mt-4 text-xs font-bold uppercase tracking-wide text-ink-500">Go to</div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {FLAT.filter((n) => !['/', '/loads', '/expenses', '/invoices'].includes(n.to)).map((n) => <NavLink key={n.to} to={n.to} className="flex flex-col items-center gap-1 rounded-md bg-ink-100 py-3 text-center text-[11px] font-bold dark:bg-ink-800"><n.icon size={18} />{n.label}</NavLink>)}
            </div>
          </div>
        </div>
      )}
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
