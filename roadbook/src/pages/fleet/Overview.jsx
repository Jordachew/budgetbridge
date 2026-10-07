import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, Share2, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Banner, Button, Card, CardTitle, Empty, Stat, Table, useConfirm } from '../../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../../components/PeriodPicker.jsx';
import { useToast } from '../../components/toast.jsx';
import { session } from '../../state/app.jsx';
import { useCurrency, useDistance } from '../../lib/hooks.js';
import { fmtMoney } from '../../core/format.js';
import { addDays } from '../../core/dates.js';
import { todayStr } from '../invoices/totals.js';
import { plainError } from './CrewStart.jsx';

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', driver: 'Driver' };
export const ROLE_TONE = { owner: 'brand', admin: 'blue', driver: 'neutral' };

function JoinCode({ crew, online }) {
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [code, setCode] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!online) return undefined;
    let live = true;
    session.api.joinCode(crew.id).then((c) => { if (live) { setCode(c); setErr(''); } }).catch((e) => { if (live) setErr(plainError(e, 'Could not load the join code.')); });
    return () => { live = false; };
  }, [crew.id, online]);
  const link = code ? `${location.origin}${location.pathname}#/fleet?join=${code}` : '';
  const copy = async (text, msg) => { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Could not copy. Select the text and copy it by hand.', { bad: true }); } };
  const regen = async () => {
    if (!(await confirm({ title: 'Make a new join code?', text: 'The old code stops working straight away. Drivers already in your company are not affected.', confirmLabel: 'New code', danger: true }))) return;
    setBusy(true);
    try { setCode(await session.api.newJoinCode(crew.id)); toast('New join code ready.'); } catch (e) { toast(plainError(e, 'Could not make a new code.'), { bad: true }); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardTitle title="Join code" sub="Give this to drivers so they can join your company." />
      {!online ? <p className="text-sm text-ink-500">Connect to the internet to see the join code.</p>
        : err ? <Banner tone="red">{err}</Banner>
        : code ? (
          <>
            <div className="rounded-xl bg-ink-50 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.25em] dark:bg-ink-800" aria-label={`Join code ${code}`}>{code}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="soft" size="sm" icon={Copy} onClick={() => copy(code, 'Code copied.')}>Copy code</Button>
              <Button variant="soft" size="sm" icon={Copy} onClick={() => copy(link, 'Invite link copied.')}>Copy link</Button>
              {typeof navigator.share === 'function' && <Button variant="soft" size="sm" icon={Share2} onClick={() => navigator.share({ title: `Join ${crew.name} on Roadbook`, text: `Join ${crew.name} on Roadbook. Code: ${code}`, url: link }).catch(() => {})}>Share</Button>}
              <Button variant="ghost" size="sm" icon={RefreshCw} loading={busy} onClick={regen}>New code</Button>
            </div>
          </>
        ) : <p className="text-sm text-ink-500">Loading…</p>}
      {node}
    </Card>
  );
}

function TeamReport({ crew, online }) {
  const money = useCurrency();
  const dist = useDistance();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const [state, setState] = useState({ loading: true, rows: null, err: '' });
  const range = rangeOf(period);
  const from = todayStr(range.from);
  const to = todayStr(addDays(range.to, -1));
  const [tick, setTick] = useState(0);

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
  const chart = shared.map((r) => ({ name: r.display_name, Income: r.inc / 100, Expenses: r.exp / 100 }));
  const summary = shared.length ? `Income and expenses per driver in ${money}: ${shared.map((r) => `${r.display_name} income ${fmtMoney(r.inc, money)}, expenses ${fmtMoney(r.exp, money)}`).join('; ')}.` : 'No data.';

  return (
    <Card>
      <CardTitle title="Team report" sub="Totals for drivers who share their records." action={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => { setState((s) => ({ ...s, loading: true })); setTick((t) => t + 1); }} aria-label="Refresh report" />} />
      <div className="mb-4"><PeriodPicker value={period} onChange={setPeriod} kinds={['week', 'month', 'year']} /></div>
      {!online ? <Banner tone="amber">You are offline. The team report needs a connection.</Banner>
        : state.err ? <Banner tone="red">{state.err}</Banner>
        : state.loading && !state.rows ? <p className="text-sm text-ink-500">Loading…</p>
        : !rows.length ? <Empty icon={Users} title="No drivers yet" text="Share your join code. Drivers appear here once they join." />
        : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Distance" value={dist(totals.km)} sub={`${totals.trips} trips`} />
              <Stat label="Loads delivered" value={totals.loads} />
              <Stat label="Income" value={fmtMoney(totals.inc, money)} tone="good" />
              <Stat label="Expenses" value={fmtMoney(totals.exp, money)} />
            </div>
            {shared.length > 0 && (
              <div role="img" aria-label={summary} className="mb-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.3} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                    <Tooltip formatter={(v) => fmtMoney(Math.round(v * 100), money)} />
                    <Legend />
                    <Bar dataKey="Income" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill="#64748b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <Table rows={rows} rowKey={(r) => r.user_id}
              columns={[
                { key: 'n', label: 'Driver', render: (r) => <span className="font-medium">{r.display_name}</span> },
                { key: 'd', label: 'Distance', right: true, render: (r) => (r.shared ? dist(r.distance_m) : <Badge>Not shared</Badge>) },
                { key: 'l', label: 'Loads', right: true, hide: true, render: (r) => (r.shared ? r.loads_delivered : '-') },
                { key: 'i', label: 'Income', right: true, render: (r) => (r.shared ? fmtMoney(r.inc, money) : '-') },
                { key: 'e', label: 'Expenses', right: true, hide: true, render: (r) => (r.shared ? fmtMoney(r.exp, money) : '-') },
              ]} />
            {rows.some((r) => !r.shared) && <p className="mt-3 text-xs text-ink-500">Drivers marked "Not shared" have chosen not to share their records, so no numbers are shown for them.</p>}
          </>
        )}
    </Card>
  );
}

export default function Overview({ ctx }) {
  const { crew, isManager, online, roster } = ctx;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle title={crew.name} sub={crew.phone ? `Phone ${crew.phone}` : 'Your company'} />
          <div className="flex flex-wrap items-center gap-2"><Badge tone={ROLE_TONE[crew.role]}>You are {crew.role === 'admin' ? 'an' : 'the'} {ROLE_LABEL[crew.role].toLowerCase()}</Badge><Badge>{roster.length} {roster.length === 1 ? 'member' : 'members'}</Badge></div>
          {crew.brand_color && <div className="mt-3 flex items-center gap-2 text-xs text-ink-500"><span className="h-4 w-4 rounded-full ring-1 ring-ink-300" style={{ background: crew.brand_color }} /> Company colour {crew.brand_color}</div>}
        </Card>
        {isManager ? <JoinCode crew={crew} online={online} /> : <Card><CardTitle title="About the company" /><p className="text-sm text-ink-500">Your dispatcher can send you loads and chat with the team here. Use the Drivers tab to choose what you share.</p></Card>}
      </div>
      {isManager ? <TeamReport crew={crew} online={online} /> : null}
    </div>
  );
}
