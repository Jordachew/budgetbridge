import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { LayoutDashboard, PackageOpen, Receipt, Route, FileText, Map, Wrench, Users, Bell, Settings, CloudOff, RefreshCw, CheckCircle2, MoreHorizontal, Wallet, BarChart3, X } from 'lucide-react';
import { useApp } from '../state/app.jsx';
import { cx } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, tab: true },
  { to: '/loads', label: 'Loads', icon: PackageOpen, tab: true },
  { to: '/expenses', label: 'Expenses', icon: Receipt, tab: true },
  { to: '/trips', label: 'Trips', icon: Route, tab: true },
  { to: '/invoices', label: 'Invoices', icon: FileText },
  { to: '/money', label: 'Income & pay', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/map', label: 'Map & fuel', icon: Map },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/fleet', label: 'Fleet', icon: Users },
  { to: '/reminders', label: 'Reminders', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function SyncPill() {
  const { status, online, isAccount } = useApp();
  if (!isAccount) return <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">Saved on this device</span>;
  if (!online || status.state === 'offline') return <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"><CloudOff size={13} /> Offline{status.pending ? ` · ${status.pending} waiting` : ''}</span>;
  if (status.state === 'syncing') return <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800"><RefreshCw size={13} className="animate-spin" /> Syncing</span>;
  if (status.state === 'error' || status.failed) return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">Sync problem</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800"><CheckCircle2 size={13} /> Backed up</span>;
}

const linkCls = ({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800');

export default function Layout() {
  const [more, setMore] = useState(false);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen flex-col border-r border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2.5 px-2">
          <img src="./icons/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-bold tracking-tight">Roadbook</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Main">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}><n.icon size={18} />{n.label}</NavLink>)}
        </nav>
        <div className="pt-3"><SyncPill /></div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-ink-200 bg-white/90 px-4 py-2.5 backdrop-blur dark:border-ink-800 dark:bg-ink-900/90 md:hidden">
          <Link to="/" className="flex items-center gap-2"><img src="./icons/icon.svg" alt="" className="h-7 w-7 rounded-md" /><span className="font-bold">Roadbook</span></Link>
          <SyncPill />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10"><Outlet /></main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-ink-200 bg-white pb-safe dark:border-ink-800 dark:bg-ink-900 md:hidden" aria-label="Tabs">
        {NAV.filter((n) => n.tab).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-600' : 'text-ink-500')}>
            <n.icon size={20} />{n.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-ink-500"><MoreHorizontal size={20} />More</button>
      </nav>

      {more && (
        <div className="no-print fixed inset-0 z-50 bg-ink-950/50 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-safe dark:bg-ink-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between"><span className="font-semibold">More</span><button aria-label="Close" onClick={() => setMore(false)}><X size={20} /></button></div>
            <div className="grid grid-cols-3 gap-2">
              {NAV.filter((n) => !n.tab).map((n) => (
                <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className="flex flex-col items-center gap-1.5 rounded-xl bg-ink-50 py-4 text-xs font-medium dark:bg-ink-800"><n.icon size={22} />{n.label}</NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
