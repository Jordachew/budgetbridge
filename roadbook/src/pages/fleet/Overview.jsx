import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BellRing, MessageCircle, Moon, RefreshCw, Truck, Users } from 'lucide-react';
import { Banner, Button, Empty, Stat, Table, cx } from '../../components/ui.jsx';
import Bars from '../../components/charts/Bars.jsx';
import { PeriodPicker, rangeOf } from '../../components/PeriodPicker.jsx';
import { session } from '../../state/app.jsx';
import { useRows } from '../../state/data.js';
import { useCurrency, useDistance } from '../../lib/hooks.js';
import { fmtMoney, fmtRelative, plural } from '../../core/format.js';
import { addDays } from '../../core/dates.js';
import { todayStr } from '../invoices/totals.js';
import { plainError } from './CrewStart.jsx';
import { ACTIVE_STATUS, Avatar, JoinCode } from './shared.jsx';
import { unreadCount } from './Chat.jsx';
import { activeAlertCount } from './Alerts.jsx';

const first = (n) => String(n || 'Driver').split(' ')[0];
const compact = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k` : String(Math.round(v)));

/** Who is doing what today: one row per driver, on a load, booked, or idle. */
function TodayBoard({ ctx }) {
  const { roster, me, isManager, go } = ctx;
  const loads = useRows('loads');
  const people = roster.filter((r) => r.role === 'driver' || r.user_id === me);
  const rows = useMemo(() => people.map((p) => {
    const mine = loads.filter((l) => l.user_id === p.user_id);
    const live = mine.filter((l) => ACTIVE_STATUS.includes(l.status)).sort((a, b) => (a.drop_at || 'z').localeCompare(b.drop_at || 'z'))[0];
    const next = mine.filter((l) => l.status === 'booked').sort((a, b) => (a.pickup_at || 'z').localeCompare(b.pickup_at || 'z'))[0];
    const last = mine.filter((l) => ['delivered', 'reconciled'].includes(l.status)).sort((a, b) => (b.drop_at || '').localeCompare(a.drop_at || ''))[0];
    return { p, live, next, last, state: live ? 'road' : next ? 'booked' : 'idle' };
  }).sort((a, b) => ['road', 'booked', 'idle'].indexOf(a.state) - ['road', 'booked', 'idle'].indexOf(b.state)), [people, loads]);
  const onRoad = rows.filter((r) => r.state === 'road').length;
  const idle = rows.filter((r) => r.state === 'idle').length;
  const booked = rows.length - onRoad - idle;

  if (!rows.length) return <Empty icon={Truck} title="No drivers yet" text="When drivers join with your code they show up here, with what each one is doing today." />;
  return (
    <section aria-label="Today board" className="overflow-hidden rounded-[10px] bg-ink-950 text-white ring-1 ring-black/20 dark:bg-ink-900 dark:ring-white/10">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 p-6 md:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-400">Today</p>
          <p className="mt-3 flex items-baseline gap-3 leading-none"><span className="text-5xl font-bold tracking-tight sm:text-6xl">{onRoad}</span><span className="text-lg text-ink-200">of {plural(rows.length, 'driver')} on a load</span></p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-200" aria-label="Summary">
          <li><b className="text-white">{booked}</b> booked next</li>
          <li><b className="text-white">{idle}</b> idle</li>
        </ul>
      </div>
      <ul className="divide-y divide-white/10 border-t border-white/10">
        {rows.map(({ p, live, next, last, state }) => {
          const l = live || next;
          return (
            <li key={p.user_id} className={cx('grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-6 py-3.5 md:grid-cols-[auto_11rem_minmax(0,1fr)_auto] md:px-8', state === 'idle' && 'opacity-80')}>
              <Avatar name={p.display_name} size={38} mine={state === 'road'} />
              <div className="min-w-0">
                <p className="truncate font-bold">{p.display_name}{p.user_id === me ? ' (you)' : ''}</p>
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                  {state === 'road' && <><span className="h-2 w-2 rounded-full bg-brand-400" aria-hidden /> <span className="text-brand-300">On the road</span></>}
                  {state === 'booked' && <><span className="h-2 w-2 rounded-full border-2 border-sky-300" aria-hidden /> <span className="text-sky-200">Load booked</span></>}
                  {state === 'idle' && <><Moon size={12} className="text-ink-300" aria-hidden /> <span className="text-ink-300">Idle</span></>}
                </p>
              </div>
              <div className="col-span-2 min-w-0 pl-[54px] md:col-span-1 md:pl-0">
                {l ? (
                  <>
                    <p className="flex items-center gap-2 truncate font-bold"><span className="truncate">{l.pickup_label || '?'}</span><ArrowRight size={14} className="shrink-0 text-brand-400" aria-hidden /><span className="truncate">{l.drop_label || '?'}</span></p>
                    <p className="truncate text-xs text-ink-300">{l.customer || l.reference || 'Load'}{state === 'road' && l.drop_at ? ` · arrives ${fmtRelative(l.drop_at)}` : state === 'booked' && l.pickup_at ? ` · picks up ${fmtRelative(l.pickup_at)}` : ''}</p>
                  </>
                ) : <p className="text-sm text-ink-300">{last ? `Last delivered ${fmtRelative(last.drop_at)}` : 'Nothing dispatched yet'}</p>}
              </div>
              {isManager && state === 'idle' && p.user_id !== me && <Button variant="outline" size="sm" className="col-start-2 !border-white/30 !text-white hover:!bg-white/10 md:col-start-auto" onClick={() => go('dispatch')}>Dispatch</Button>}
            </li>
          );
        })}
      </ul>
      <div className="roadline" aria-hidden />
      <p className="px-6 py-2.5 text-xs text-ink-300 md:px-8">Built from loads on this phone: ones you dispatched and your own.</p>
    </section>
  );
}

function Attention({ ctx }) {
  const { crew, me, go } = ctx;
  const messages = useRows('messages');
  const alerts = useRows('road_alerts');
  const unread = unreadCount(messages, crew.id, me);
  const live = activeAlertCount(alerts, crew.id);
  const Item = ({ icon: Icon, n, one, many, none, to, hot }) => (
    <button type="button" onClick={() => go(to)} className="group flex flex-1 items-center gap-3 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-left hover:border-brand-500">
      <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', n > 0 && hot ? 'bg-brand-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}><Icon size={19} /></span>
      <span className="min-w-0 flex-1"><span className="block text-lg font-bold leading-tight">{n > 0 ? `${n} ${n === 1 ? one : many}` : none}</span></span>
      <ArrowRight size={16} className="text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Item icon={MessageCircle} n={unread} one="new message" many="new messages" none="No new messages" to="chat" hot />
      <Item icon={BellRing} n={live} one="road alert active" many="road alerts active" none="Roads are clear" to="alerts" hot />
    </div>
  );
}

function TeamReport({ crew, online }) {
  const money = useCurrency();
  const dist = useDistance();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const [state, setState] = useState({ loading: true, rows: null, err: '' });
  const [tick, setTick] = useState(0);
  const range = rangeOf(period);
  const from = todayStr(range.from);
  const to = todayStr(addDays(range.to, -1));

  useEffect(() => {
    if (!online) return undefined;
    let live = true;
    session.api.report(crew.id, from, to)
      .then((rows) => { if (live) setState({ loading: false, rows: rows || [], err: '' }); })
      .catch((e) => { if (live) setState({ loading: false, rows: null, err: plainError(e, 'Could not load the report.') }); });
    return () => { live = false; };
  }, [crew.id, from, to, online, tick]);

  const rows = useMemo(() => (state.rows || []).map((r) => ({ ...r, inc: r.income?.[money] || 0, exp: r.expenses?.[money] || 0 })), [state.rows, money]);
  const shared = rows.filter((r) => r.shared);
  const totals = shared.reduce((a, r) => ({ km: a.km + (r.distance_m || 0), trips: a.trips + (r.trips || 0), loads: a.loads + (r.loads_delivered || 0), inc: a.inc + r.inc, exp: a.exp + r.exp }), { km: 0, trips: 0, loads: 0, inc: 0, exp: 0 });
  const top = [...shared].sort((a, b) => b.inc - a.inc)[0];
  const words = !shared.length ? 'No numbers to show yet.'
    : `Together your drivers earned ${fmtMoney(totals.inc, money)} and spent ${fmtMoney(totals.exp, money)}, leaving ${fmtMoney(totals.inc - totals.exp, money)}. ${top && top.inc > 0 ? `${first(top.display_name)} brought in the most: ${fmtMoney(top.inc, money)}${shared.length > 1 && totals.inc ? `, ${Math.round((top.inc / totals.inc) * 100)}% of the team` : ''}. ` : ''}${totals.loads} ${totals.loads === 1 ? 'load was' : 'loads were'} delivered over ${dist(totals.km)}.${rows.length > shared.length ? ` ${plural(rows.length - shared.length, 'driver')} chose not to share, so they are not counted.` : ''}`;
  const data = shared.map((r) => ({ key: r.user_id, label: first(r.display_name), values: { income: r.inc, expenses: r.exp } }));

  return (
    <section aria-label="Team report" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-display text-2xl font-semibold leading-none">Team report</h2><p className="mt-1 text-sm text-ink-500">Totals for drivers who share their records.</p></div>
        <div className="flex items-center gap-2"><PeriodPicker value={period} onChange={setPeriod} kinds={['week', 'month', 'year']} /><Button variant="ghost" size="sm" icon={RefreshCw} aria-label="Refresh report" onClick={() => { setState((s) => ({ ...s, loading: true })); setTick((t) => t + 1); }} /></div>
      </div>
      {!online ? <Banner tone="amber">You are offline. The team report needs a connection.</Banner>
        : state.err ? <Banner tone="red">{state.err}</Banner>
        : state.loading && !state.rows ? <p className="text-sm text-ink-500" role="status">Loading the report…</p>
        : !rows.length ? <Empty icon={Users} title="No drivers yet" text="Share your join code. Drivers appear here once they join." />
        : (
          <>
            <p className="max-w-3xl text-[15px] leading-relaxed text-ink-700 dark:text-ink-200">{words}</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Distance" value={dist(totals.km)} sub={plural(totals.trips, 'trip')} />
              <Stat label="Loads delivered" value={totals.loads} />
              <Stat label="Income" value={fmtMoney(totals.inc, money)} tone="good" />
              <Stat label="Expenses" value={fmtMoney(totals.exp, money)} />
            </div>
            {data.length > 0 && <Bars title="Income and expenses by driver" subtitle={`In ${money === 'USD' ? 'US dollars' : 'Jamaican dollars'}, for the period above.`} data={data} format={(n) => fmtMoney(n, money)} axisFormat={(n) => compact(n / 100)}
              series={[{ id: 'income', label: 'Income', slot: 0 }, { id: 'expenses', label: 'Expenses', slot: 1 }]} summary={words} />}
            <Table rows={rows} rowKey={(r) => r.user_id}
              columns={[
                { key: 'n', label: 'Driver', render: (r) => <span className="flex items-center gap-2 font-bold"><Avatar name={r.display_name} size={26} />{r.display_name}</span> },
                { key: 'd', label: 'Distance', right: true, render: (r) => (r.shared ? dist(r.distance_m) : <span className="text-xs font-bold uppercase text-ink-500">Not shared</span>) },
                { key: 'l', label: 'Loads', right: true, hide: true, render: (r) => (r.shared ? r.loads_delivered : '-') },
                { key: 'i', label: 'Income', right: true, render: (r) => (r.shared ? fmtMoney(r.inc, money) : '-') },
                { key: 'e', label: 'Expenses', right: true, hide: true, render: (r) => (r.shared ? fmtMoney(r.exp, money) : '-') },
              ]} />
          </>
        )}
    </section>
  );
}

export default function Overview({ ctx }) {
  const { crew, isManager, online, roster } = ctx;
  return (
    <div className="space-y-8">
      {isManager || roster.some((r) => r.user_id === ctx.me && r.role === 'driver') ? <TodayBoard ctx={ctx} /> : null}
      <Attention ctx={ctx} />
      {isManager && roster.filter((r) => r.role === 'driver').length === 0 && <JoinCode crew={crew} online={online} />}
      {isManager ? <TeamReport crew={crew} online={online} />
        : <p className="max-w-xl text-sm text-ink-500">Your dispatcher can send you loads and chat with the team here. Use the Drivers tab to choose what you share.</p>}
    </div>
  );
}
