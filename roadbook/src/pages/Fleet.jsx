import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BellRing, FileText, LayoutGrid, MessageCircle, PackageOpen, Users, Wallet, Siren } from 'lucide-react';
import { Badge, Banner, Button, Empty, PageHeader, Select } from '../components/ui.jsx';
import { useApp } from '../state/app.jsx';
import { useRows } from '../state/data.js';
import CrewStart from './fleet/CrewStart.jsx';
import Overview from './fleet/Overview.jsx';
import Drivers from './fleet/Drivers.jsx';
import Dispatch from './fleet/Dispatch.jsx';
import Chat, { unreadCount } from './fleet/Chat.jsx';
import Alerts, { activeAlertCount } from './fleet/Alerts.jsx';
import Settlements from './fleet/Settlements.jsx';
import { ROLE_LABEL, ROLE_TONE, Tabs } from './fleet/shared.jsx';

const BENEFITS = [
  { icon: PackageOpen, title: 'Dispatch loads', text: 'Send a job to a driver\'s phone. See when it is picked up and delivered, with proof.' },
  { icon: MessageCircle, title: 'Team chat', text: 'One conversation for the whole company. It works offline and sends when there is signal.' },
  { icon: Siren, title: 'Road alerts', text: 'Warn everyone about floods, accidents and police stops, with how far away they are.' },
  { icon: Wallet, title: 'Pay slips', text: 'Add up a driver\'s delivered loads, take off advances and print a pay slip.' },
];

export default function Fleet() {
  const { isAccount, user, crews, rosters, online, refreshCrews } = useApp();
  const [sp, setSp] = useSearchParams();
  const [crewId, setCrewId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const messages = useRows('messages');
  const alerts = useRows('road_alerts');

  useEffect(() => { if (isAccount) refreshCrews().finally(() => setLoaded(true)); }, [isAccount, refreshCrews]);

  const crew = crews.find((c) => c.id === crewId) || crews[0];
  const me = user?.id;
  const roster = useMemo(() => (crew ? rosters[crew.id] || [] : []), [crew, rosters]);

  if (!isAccount) {
    return (
      <>
        <PageHeader title="Fleet" sub="Run trucks with drivers, together." />
        <Empty icon={Users} title="Fleet needs an account" text="Make a free account to dispatch loads, chat with your team and pay your drivers. Everything you have already saved on this phone stays exactly as it is."
          action={<Button as={Link} to="/settings">Go to Settings to make an account</Button>} />
        <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2" aria-label="What Fleet gives you">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex gap-4 border-t border-[var(--hairline)] pt-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink-900 text-brand-400 dark:bg-ink-800"><b.icon size={19} /></span>
              <div><h2 className="font-display text-xl font-semibold leading-tight">{b.title}</h2><p className="mt-1 text-sm text-ink-500">{b.text}</p></div>
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (!crew) {
    return (
      <>
        <PageHeader title="Fleet" sub="Work together with your drivers or your company." />
        {!loaded && online ? <p className="text-sm text-ink-500" role="status">Loading your company…</p> : <CrewStart refresh={refreshCrews} online={online} initialCode={(sp.get('join') || '').toUpperCase()} />}
      </>
    );
  }

  const isOwner = crew.role === 'owner';
  const isManager = isOwner || crew.role === 'admin';
  const nameOf = (id) => roster.find((r) => r.user_id === id)?.display_name || 'Driver';
  const unread = unreadCount(messages, crew.id, me);
  const live = activeAlertCount(alerts, crew.id);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'drivers', label: 'Drivers', icon: Users, n: roster.length },
    ...(isManager ? [{ id: 'dispatch', label: 'Dispatch', icon: PackageOpen }] : []),
    { id: 'chat', label: 'Chat', icon: MessageCircle, n: unread, hot: true },
    { id: 'alerts', label: 'Alerts', icon: BellRing, n: live, hot: true },
    { id: 'settlements', label: 'Settlements', icon: FileText },
  ];
  const want = sp.get('tab');
  const active = tabs.some((t) => t.id === want) ? want : 'overview';
  const setTab = (t) => { const next = new URLSearchParams(sp); next.delete('join'); if (t === 'overview') next.delete('tab'); else next.set('tab', t); setSp(next, { replace: true }); };
  const ctx = { crew, me, isOwner, isManager, roster, nameOf, online, refresh: refreshCrews, go: setTab };

  return (
    <>
      <div className="no-print">
        <PageHeader title={crew.name}
          sub={<span className="flex flex-wrap items-center gap-2"><Badge tone={ROLE_TONE[crew.role]}>You are {crew.role === 'admin' ? 'an' : 'the'} {ROLE_LABEL[crew.role].toLowerCase()}</Badge><span>{roster.length} {roster.length === 1 ? 'member' : 'members'}{crew.phone ? ` · ${crew.phone}` : ''}</span></span>}
          actions={crews.length > 1 ? <Select aria-label="Choose company" value={crew.id} onChange={(e) => { setCrewId(e.target.value); setTab('overview'); }}>{crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select> : null} />
        {sp.get('join') && <div className="mb-4"><Banner tone="blue">You are already in {crew.name}. <button className="font-bold underline" onClick={() => { const n = new URLSearchParams(sp); n.delete('join'); setSp(n, { replace: true }); }}>Dismiss</button></Banner></div>}
        {!online && <div className="mb-4"><Banner tone="amber">You are offline. Chat and alerts you write are saved and will send when you are back online.</Banner></div>}
        <Tabs tabs={tabs} value={active} onChange={setTab} label="Fleet sections" />
      </div>
      {active === 'overview' && <Overview ctx={ctx} />}
      {active === 'drivers' && <Drivers ctx={ctx} />}
      {active === 'dispatch' && <Dispatch ctx={ctx} />}
      {active === 'chat' && <Chat ctx={ctx} />}
      {active === 'alerts' && <Alerts ctx={ctx} />}
      {active === 'settlements' && <Settlements ctx={ctx} />}
    </>
  );
}
