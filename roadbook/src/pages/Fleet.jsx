import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Banner, Button, Empty, PageHeader, Select, cx } from '../components/ui.jsx';
import { useApp } from '../state/app.jsx';
import { useRows } from '../state/data.js';
import CrewStart from './fleet/CrewStart.jsx';
import Overview from './fleet/Overview.jsx';
import Drivers from './fleet/Drivers.jsx';
import Dispatch from './fleet/Dispatch.jsx';
import Chat, { unreadCount } from './fleet/Chat.jsx';
import Alerts from './fleet/Alerts.jsx';
import Settlements from './fleet/Settlements.jsx';

export default function Fleet() {
  const { isAccount, user, crews, rosters, online, refreshCrews } = useApp();
  const [sp, setSp] = useSearchParams();
  const [crewId, setCrewId] = useState(null);
  const [tab, setTab] = useState('overview');
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
        <PageHeader title="Fleet" />
        <Empty icon={Users} title="Fleet needs an account" text="Running trucks with drivers? Make a free account to dispatch loads, chat with your team and pay drivers. Your records on this phone stay as they are."
          action={<Button as={Link} to="/settings">Go to Settings</Button>} />
      </>
    );
  }
  if (!crew) {
    return (
      <>
        <PageHeader title="Fleet" sub="Work together with your drivers or your company." />
        {!loaded && online ? <p className="text-sm text-ink-500">Loading…</p> : <CrewStart refresh={refreshCrews} online={online} initialCode={(sp.get('join') || '').toUpperCase()} />}
      </>
    );
  }

  const isOwner = crew.role === 'owner';
  const isManager = isOwner || crew.role === 'admin';
  const nameOf = (id) => roster.find((r) => r.user_id === id)?.display_name || 'Driver';
  const ctx = { crew, me, isOwner, isManager, roster, nameOf, online, refresh: refreshCrews };
  const unread = unreadCount(messages, crew.id, me);
  const activeAlerts = alerts.filter((a) => a.crew_id === crew.id && !a.cleared_at && !a.deleted_at && new Date(a.expires_at).getTime() > Date.now()).length;

  const tabs = [
    { id: 'overview', label: 'Overview' }, { id: 'drivers', label: 'Drivers' },
    ...(isManager ? [{ id: 'dispatch', label: 'Dispatch' }] : []),
    { id: 'chat', label: 'Chat', n: tab === 'chat' ? 0 : unread }, { id: 'alerts', label: 'Road alerts', n: activeAlerts },
    { id: 'settlements', label: 'Settlements' },
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : 'overview';

  return (
    <>
      <div className="no-print">
        <PageHeader title="Fleet" sub={crew.name}
          actions={crews.length > 1 ? <Select aria-label="Choose company" value={crew.id} onChange={(e) => { setCrewId(e.target.value); setTab('overview'); }}>{crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select> : null} />
        {sp.get('join') && <div className="mb-4"><Banner tone="blue">You are already in {crew.name}. <button className="font-semibold underline" onClick={() => setSp({}, { replace: true })}>Dismiss</button></Banner></div>}
        {!online && <div className="mb-4"><Banner tone="amber">You are offline. Chat and alerts you write are saved and will send when you are back online.</Banner></div>}
        <div className="-mx-4 mb-5 overflow-x-auto px-4 md:mx-0 md:px-0">
          <div role="tablist" className="inline-flex min-w-full gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800 md:min-w-0">
            {tabs.map((t) => (
              <button key={t.id} role="tab" type="button" aria-selected={active === t.id} onClick={() => setTab(t.id)}
                className={cx('flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', active === t.id ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-200')}>
                {t.label}{t.n > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[11px] font-bold leading-5 text-white">{t.n}</span>}
              </button>
            ))}
          </div>
        </div>
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
