// App start-up and shared run-time state: who is signed in, the sync engine, the trip tracker, crews.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as store from '../core/store.js';
import { configured, currentUser, getClient, onAuth } from '../core/auth.js';
import { makeApi } from '../core/api-supabase.js';
import { createSync } from '../core/sync.js';
import { createTracker } from '../core/gps.js';
import { migrateLocalToAccount } from '../core/migrate.js';
import { thinPath } from '../core/geo.js';
import { ls } from '../core/util.js';
import { applyPrefs, prefs, setPref } from './prefs.js';
import { useToast } from '../components/toast.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Module-level handle for code that runs outside React (the tracker callbacks).
export const session = { user: null, api: null, sync: null, tracker: null, crews: [], rosters: {} };

export function AppProvider({ children }) {
  const toast = useToast();
  const [phase, setPhase] = useState('booting');     // booting | welcome | recovery | app | error
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState({ state: 'idle', pending: 0, failed: 0 });
  const [online, setOnline] = useState(navigator.onLine);
  const [crews, setCrews] = useState([]);
  const [rosters, setRosters] = useState({});
  const [bootKey, setBootKey] = useState(0);
  const poll = useRef(null);

  const refreshCrews = useCallback(async () => {
    if (!session.api || !navigator.onLine) return false;
    try {
      const list = await session.api.myCrews();
      const ro = {};
      for (const c of list) ro[c.id] = await session.api.roster(c.id);
      session.crews = list; session.rosters = ro;
      setCrews(list); setRosters(ro);
      store.emit(['crews']);
      return true;
    } catch (e) { console.warn('crew refresh failed', e); return false; }
  }, []);

  const restoreTrip = useCallback(async () => {
    const saved = await store.getDb().meta('activeTrip');
    if (!saved || !saved.id) return;
    const age = Date.now() - new Date(saved.started_at).getTime();
    if (age > 18 * 3600000) {
      await store.save('trips', { id: saved.id, load_id: saved.load_id || null, started_at: saved.started_at, ended_at: new Date().toISOString(), distance_m: Math.round(saved.distance_m || 0), method: 'gps', origin_label: saved.origin_label || '', dest_label: saved.dest_label || '', note: 'Closed automatically', path: thinPath(saved.path || []) });
      await store.getDb().setMeta('activeTrip', null);
      toast('A trip that was left open was saved.');
      return;
    }
    session.tracker.resume(saved);
    toast('Your trip is still running.');
  }, [toast]);

  const startApp = useCallback(async () => {
    session.tracker = createTracker({
      onUpdate: () => store.emit(['trip-live']),
      checkpoint: (st) => { store.getDb()?.setMeta('activeTrip', st).catch(() => {}); },
    });
    await restoreTrip();
    setPhase('app');
  }, [restoreTrip]);

  const enterLocal = useCallback(async () => {
    session.user = null; session.api = null; session.sync = null;
    setUser(null);
    await store.openStore(null);
    store.setKick(() => {});
    await startApp();
  }, [startApp]);

  const enterAccount = useCallback(async (u) => {
    const me = { id: u.id, email: u.email || '' };
    session.user = me; setUser(me);
    ls('roadbook.lastUser', u.id); ls('roadbook.lastEmail', me.email);
    await store.openStore(u.id);
    const wantMigrate = ls('roadbook.migrateLocal');
    if (wantMigrate) ls('roadbook.migrateLocal', null);
    if (wantMigrate && wantMigrate === me.email.trim().toLowerCase()) {
      try { const n = await migrateLocalToAccount(u.id); if (n) toast(`${n} records copied into your account.`); } catch (e) { console.error(e); toast('Could not copy your old records. They are still on this device.', { bad: true }); }
    }
    if (!store.getProfile().display_name && u.user_metadata?.display_name) await store.setProfile({ ...store.getProfile(), display_name: String(u.user_metadata.display_name).slice(0, 60) });
    session.api = makeApi(getClient(), u.id);
    session.sync = createSync({ api: session.api, onStatus: (st) => { setStatus(st); if (st.state === 'signedout') toast('Please sign in again to keep backing up.', { bad: true }); } });
    store.setKick(() => session.sync.schedule(1500));
    await startApp();
    session.sync.run().then(() => refreshCrews());
  }, [startApp, toast, refreshCrews]);

  useEffect(() => {
    let off = () => {};
    (async () => {
      try {
        applyPrefs();
        if (configured()) {
          let u = await currentUser();
          if (!u && ls('roadbook.lastUser') && prefs().lastMode === 'account' && !navigator.onLine) u = { id: ls('roadbook.lastUser'), email: ls('roadbook.lastEmail') || '' };
          off = onAuth((event) => {
            if (event === 'SIGNED_OUT' && !session.signingOut) { ls('roadbook.lastUser', null); location.reload(); }
            if (event === 'PASSWORD_RECOVERY') setPhase('recovery');
          });
          if (u) return await enterAccount(u);
          if (prefs().lastMode === 'local') return await enterLocal();
          return setPhase('welcome');
        }
        return await enterLocal();
      } catch (e) { console.error(e); setPhase('error'); }
    })();
    return () => off();
  }, [bootKey, enterAccount, enterLocal]);

  useEffect(() => {
    if (phase !== 'app') return undefined;
    const on = () => { setOnline(true); session.sync?.run().then(() => refreshCrews()); };
    const offl = () => setOnline(false);
    const vis = () => { if (document.visibilityState === 'visible') session.sync?.run(); };
    window.addEventListener('online', on); window.addEventListener('offline', offl);
    document.addEventListener('visibilitychange', vis);
    poll.current = setInterval(() => { if (document.visibilityState === 'visible') session.sync?.run(); }, 60000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', offl); document.removeEventListener('visibilitychange', vis); clearInterval(poll.current); };
  }, [phase, refreshCrews]);

  // Live chat and road alerts
  useEffect(() => {
    if (phase !== 'app' || !session.api || !crews.length) return undefined;
    let un = () => {};
    try { un = session.api.subscribe(() => session.sync?.schedule(300)); } catch (e) { console.warn('realtime unavailable', e); }
    return () => un();
  }, [phase, crews.length]);

  const value = useMemo(() => ({
    phase, user, status, online, crews, rosters, refreshCrews,
    isAccount: !!user,
    reboot: () => setBootKey((k) => k + 1),
    useLocal: async () => { setPref({ lastMode: 'local' }); setPhase('booting'); await enterLocal(); },
    signedIn: async (u) => { setPref({ lastMode: 'account' }); setPhase('booting'); await enterAccount(u); },
    syncNow: () => session.sync?.run(),
  }), [phase, user, status, online, crews, rosters, refreshCrews, enterLocal, enterAccount]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
