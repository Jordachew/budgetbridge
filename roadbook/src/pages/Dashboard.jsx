import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bell, CalendarClock, FileText, Fuel, PackageOpen, Plus, Receipt, Route as RouteIcon, Sparkles, TrendingDown, TrendingUp, Wallet, Gauge, Navigation } from 'lucide-react';
import { useRows, useProfile } from '../state/data.js';
import { useMoney, useCurrency, useDistance } from '../lib/hooks.js';
import { Badge, Banner, Button, Card, CardTitle, Empty, PageHeader, Stat } from '../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { byCategory, currentOdometer, fuelEconomy, otherCurrencyCount, sumCents, sumDistance, within } from '../core/calc.js';
import { reminderState } from '../core/reminders-logic.js';
import { fmtDate, fmtRelative, plural } from '../core/format.js';
import { invoiceOutstanding, invoiceOverdue, makeBuckets, trendSeries } from './dashboard/helpers.js';
import { CategoryDonut, TrendChart, TrendLegend } from './dashboard/charts.jsx';
import { useUnit } from './dashboard/useUnit.js';

const QUICK = [
  { to: '/expenses?new=1', label: 'Add expense', icon: Receipt },
  { to: '/loads?new=1', label: 'New load', icon: PackageOpen },
  { to: '/invoices?new=1', label: 'New invoice', icon: FileText },
  { to: '/trips', label: 'Start trip', icon: RouteIcon },
];

function QuickActions({ big }) {
  return (
    <div className={big ? 'grid grid-cols-2 gap-3 sm:grid-cols-4' : 'grid grid-cols-2 gap-2 sm:grid-cols-4'}>
      {QUICK.map((q) => (
        <Link key={q.to} to={q.to} className="flex min-h-[44px] items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold shadow-sm ring-1 ring-ink-200/70 transition hover:ring-brand-500 dark:bg-ink-900 dark:ring-ink-800 dark:hover:ring-brand-500">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-700/20 dark:text-brand-400"><q.icon size={18} /></span>
          {q.label}
        </Link>
      ))}
    </div>
  );
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const NOW = () => new Date();

export default function Dashboard() {
  const profile = useProfile();
  const cur = useCurrency();
  const money = useMoney();
  const dist = useDistance();
  const unit = useUnit();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const range = rangeOf(period);

  const income = useRows('income');
  const expenses = useRows('expenses');
  const trips = useRows('trips');
  const loads = useRows('loads');
  const invoices = useRows('invoices');
  const reminders = useRows('reminders');
  const documents = useRows('documents');
  const maintenance = useRows('maintenance');

  const d = useMemo(() => {
    const inc = within(income, 'received_at', range);
    const exp = within(expenses, 'spent_at', range);
    const tr = within(trips, 'started_at', range);
    const revenue = sumCents(inc, cur);
    const spent = sumCents(exp, cur);
    const metres = sumDistance(tr);
    const units = unit === 'mi' ? metres / 1609.344 : metres / 1000;
    const cats = byCategory(exp, cur);
    const series = trendSeries(makeBuckets(period.kind, range, [...inc.map((r) => r.received_at), ...exp.map((r) => r.spent_at)]), inc, exp, cur);
    return {
      revenue, spent, profit: revenue - spent, metres, cats, series,
      perUnitCost: units > 0 ? Math.round(spent / units) : null,
      perUnitProfit: units > 0 ? Math.round((revenue - spent) / units) : null,
      mixed: otherCurrencyCount(inc, cur) + otherCurrencyCount(exp, cur),
      economy: fuelEconomy(exp),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, expenses, trips, cur, unit, period.kind, period.offset]);

  const now = NOW();
  const active = loads.filter((l) => !['delivered', 'reconciled', 'cancelled'].includes(l.status))
    .sort((a, b) => (new Date(a.pickup_at || a.created_at)) - (new Date(b.pickup_at || b.created_at)));
  const unpaid = invoices.filter((i) => i.status !== 'paid' && i.status !== 'void' && (i.status === 'sent' || invoiceOverdue(i, now)));
  const unpaidByCur = unpaid.reduce((m, i) => m.set(i.currency, (m.get(i.currency) || 0) + invoiceOutstanding(i)), new Map());

  const upcoming = useMemo(() => {
    const t = Date.now();
    const horizon = t + 30 * 86400000;
    const odometer_m = currentOdometer(trips, expenses, null);
    const out = [];
    for (const r of reminders) {
      const st = reminderState(r, { now: new Date(), odometer_m });
      if (st === 'done' || st === 'unknown') continue;
      if (r.kind === 'km') { if (st !== 'later') out.push({ id: r.id, title: r.title, at: null, state: st, type: 'Reminder', to: '/reminders', note: 'Distance reminder' }); continue; }
      const at = new Date(r.due_at).getTime();
      if (at <= horizon) out.push({ id: r.id, title: r.title, at, state: at < t ? 'overdue' : 'soon', type: 'Reminder', to: '/reminders' });
    }
    for (const doc of documents) {
      if (!doc.expires_at) continue;
      const at = new Date(`${doc.expires_at}T00:00:00`).getTime();
      if (at <= horizon) out.push({ id: doc.id, title: doc.title, at, state: at < t ? 'overdue' : 'soon', type: 'Document expires', to: '/fleet' });
    }
    for (const m of maintenance) {
      if (!m.next_due_at) continue;
      const at = new Date(m.next_due_at).getTime();
      if (at <= horizon) out.push({ id: m.id, title: m.title, at, state: at < t ? 'overdue' : 'soon', type: 'Service due', to: '/maintenance' });
    }
    return out.sort((a, b) => (a.at ?? -1) - (b.at ?? -1)).slice(0, 8);
  }, [reminders, documents, maintenance, trips, expenses]);

  const empty = ![income, expenses, trips, loads, invoices, reminders].some((r) => r.length);
  const name = (profile.display_name || '').trim().split(/\s+/)[0];

  if (empty) {
    return (
      <>
        <PageHeader title={`${greeting()}${name ? `, ${name}` : ''}`} sub="Let us get your first records in." />
        <Card className="mb-6 text-center !py-10">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-700/20 dark:text-brand-400"><Sparkles size={26} /></span>
          <h2 className="text-lg font-bold">Welcome to Roadbook</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">Log a fuel stop, book a load or start a trip and this page fills up with your revenue, costs and profit per kilometre.</p>
        </Card>
        <QuickActions big />
      </>
    );
  }

  const uLabel = unit === 'mi' ? 'mile' : 'km';
  const summary = `${period.kind === 'week' ? 'Daily' : period.kind === 'month' ? 'Weekly' : 'Monthly'} revenue against expenses. Total revenue ${money(d.revenue)}, total expenses ${money(d.spent)}.`;

  return (
    <>
      <PageHeader title={`${greeting()}${name ? `, ${name}` : ''}`} sub={profile.truck_label ? `Here is how ${profile.truck_label} is doing.` : 'Here is how business is going.'} actions={<PeriodPicker value={period} onChange={setPeriod} kinds={['week', 'month', 'year']} />} />

      {d.mixed > 0 && <div className="mb-4"><Banner tone="blue">Totals show {cur} only. {plural(d.mixed, 'record')} in the other currency {d.mixed === 1 ? 'is' : 'are'} not included.</Banner></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Revenue" value={money(d.revenue)} icon={TrendingUp} />
        <Stat label="Expenses" value={money(d.spent)} icon={TrendingDown} />
        <Stat label="Profit" value={money(d.profit)} tone={d.profit > 0 ? 'good' : d.profit < 0 ? 'bad' : undefined} icon={Wallet} />
        <Stat label="Distance driven" value={dist(d.metres)} icon={Navigation} />
        <Stat label={`Cost per ${uLabel}`} value={d.perUnitCost == null ? 'No trips yet' : money(d.perUnitCost)} icon={Gauge} />
        <Stat label={`Profit per ${uLabel}`} value={d.perUnitProfit == null ? 'No trips yet' : money(d.perUnitProfit)} tone={d.perUnitProfit > 0 ? 'good' : d.perUnitProfit < 0 ? 'bad' : undefined} icon={Gauge} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle title="Revenue vs expenses" sub="Income received and money spent" action={<TrendLegend />} />
          {d.revenue + d.spent === 0
            ? <p className="py-16 text-center text-sm text-ink-500">Nothing recorded in this period yet.</p>
            : <TrendChart data={d.series} cur={cur} summary={summary} />}
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle title="Where the money goes" sub="Expenses by category" />
          {d.cats.length ? <CategoryDonut cats={d.cats} cur={cur} total={d.spent} /> : <p className="py-10 text-center text-sm text-ink-500">No expenses in this period.</p>}
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-800/60" role="img" aria-label={d.economy ? `Fuel economy ${d.economy} litres per 100 kilometres` : 'Fuel economy not available yet'}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-700/20 dark:text-brand-400"><Fuel size={18} /></span>
            <div className="text-sm">
              <div className="font-semibold">{d.economy ? `${d.economy} L / 100 km` : 'Fuel economy'}</div>
              <div className="text-xs text-ink-500">{d.economy ? 'From your fuel stops with odometer readings' : 'Log two fuel stops with litres and odometer to see it'}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle title="Active loads" action={<Link to="/loads" className="flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">All loads <ArrowRight size={12} /></Link>} />
          {active.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">No loads on the go. <Link to="/loads?new=1" className="font-semibold text-brand-600">Book one</Link></p> : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {active.slice(0, 5).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0"><div className="truncate font-medium">{l.customer || l.reference || 'Load'}</div><div className="truncate text-xs text-ink-500">{[l.pickup_label, l.drop_label].filter(Boolean).join(' to ') || (l.pickup_at ? fmtDate(l.pickup_at) : 'No route set')}</div></div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><Badge tone={l.status === 'booked' ? 'neutral' : 'blue'}>{l.status.replace('_', ' ')}</Badge><span className="text-xs tabular-nums text-ink-500">{money(l.rate_cents, l.currency)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle title="Unpaid invoices" action={<Link to="/invoices" className="flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">Invoices <ArrowRight size={12} /></Link>} />
          {unpaid.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">Nothing outstanding. Nice.</p> : (
            <>
              <div className="mb-2 text-2xl font-bold tabular-nums">{[...unpaidByCur].map(([c, v]) => money(v, c)).join(' + ')}</div>
              <div className="mb-2 text-xs text-ink-500">outstanding across {plural(unpaid.length, 'invoice')}</div>
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {unpaid.slice(0, 4).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0"><div className="truncate font-medium">{i.customer || i.number}</div><div className="text-xs text-ink-500">#{i.number}{i.due_date ? ` · due ${fmtDate(i.due_date)}` : ''}</div></div>
                    <div className="flex shrink-0 flex-col items-end gap-1"><span className="font-medium tabular-nums">{money(invoiceOutstanding(i), i.currency)}</span>{invoiceOverdue(i, now) && <Badge tone="red">Overdue</Badge>}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card>
          <CardTitle title="Coming up" sub="Next 30 days" action={<Link to="/reminders" className="flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">Reminders <ArrowRight size={12} /></Link>} />
          {upcoming.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">No reminders, expiries or services due. You are clear.</p> : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {upcoming.map((u) => (
                <li key={u.type + u.id}>
                  <Link to={u.to} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${u.state === 'overdue' || u.state === 'due' ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300'}`}>{u.state === 'overdue' ? <AlertTriangle size={16} /> : u.type === 'Reminder' ? <Bell size={16} /> : <CalendarClock size={16} />}</span>
                    <div className="min-w-0 flex-1"><div className="truncate font-medium">{u.title}</div><div className="text-xs text-ink-500">{u.type}</div></div>
                    <span className={`shrink-0 text-xs ${u.state === 'overdue' ? 'font-semibold text-red-600 dark:text-red-400' : 'text-ink-500'}`}>{u.at ? (u.state === 'overdue' ? 'Overdue · ' : '') + (u.type === 'Reminder' ? fmtRelative(u.at) : fmtDate(u.at)) : u.note}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-ink-500">Quick actions</h2>
      <QuickActions />
      {!loads.length && !expenses.length && <div className="mt-6"><Empty title="Add your first expense or load" text="Your numbers appear above as soon as you log something." action={<Button as={Link} to="/expenses?new=1" icon={Plus}>Add expense</Button>} /></div>}
    </>
  );
}
