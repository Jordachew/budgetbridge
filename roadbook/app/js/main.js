// App start-up: decide who is using the app (account or this-phone-only), open their data,
// start syncing, start the voice/alert engine, and show the first screen.

import './views/home.js';
import './views/expenses.js';
import './views/trips.js';
import './views/loads.js';
import './views/deliver.js';
import './views/money.js';
import './views/reminders.js';
import './views/routes.js';
import './views/crew.js';
import './views/settings.js';
import './views/help.js';

import { ls } from './util.js';
import { applyPrefs, prefs, setPref } from './prefs.js';
import { S, lastUser } from './session.js';
import * as store from './store.js';
import { configured, currentUser, getClient, onAuth } from './auth.js';
import { makeApi } from './api-supabase.js';
import { createSync } from './sync.js';
import { createTracker } from './gps.js';
import { migrateLocalToAccount } from './migrate.js';
import { thinPath } from './geo.js';
import { buildShell } from './shell.js';
import { route, start, render } from './router.js';
import { startEngine, stopEngine } from './engine.js';
import { toast } from './ui.js';
import { showWelcome, showSetPassword } from './views/welcome.js';
import { refreshCrews, unreadCount, activeAlerts, currentCrew } from './views/crew.js';
import { empty } from './ui.js';
import { h } from './util.js';

const app = document.getElementById('app');
const cfg = window.ROADBOOK_CONFIG || {};
let shell = null;
let unsubRealtime = null;
let pollTimer = null;

route('/404', (ctx) => { ctx.header({ title: 'Not found', back: '/' }); ctx.root.append(empty('alert', 'Page not found', null, h('a', { class: 'btn primary', href: '#/' }, 'Go Home'))); }, { notFound: true });

function fatal(e) {
  console.error(e);
  app.replaceChildren(h('div', { class: 'splash' }, h('div', { class: 'auth-card' }, h('h2', null, 'Roadbook could not start'),
    h('p', null, 'Your records are safe on this phone. Close the app and open it again. If it keeps happening, tell the person who gave you this app.'),
    h('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, 'Try again'))));
}

async function boot() {
  try {
    applyPrefs();
    if (configured()) {
      let user = await currentUser();
      if (!user && lastUser() && prefs().lastMode === 'account' && !navigator.onLine) user = { id: lastUser(), email: ls('roadbook.lastEmail') || '', offline: true };
      if (user) return await enterAccount(user);
      if (prefs().lastMode === 'local') return await enterLocal();
      return showWelcome(app, { onDone: boot });
    }
    return await enterLocal();
  } catch (e) { fatal(e); }
}

// A company join link (#/join/CODE) opened before signing in: keep the code until the person has an account.
{
  const m = /^#\/join\/([A-Za-z0-9 -]{4,16})/.exec(location.hash || '');
  if (m) ls('roadbook.joinCode', m[1].replace(/[^A-Za-z0-9]/g, '').toUpperCase());
}

async function enterAccount(user) {
  S.user = { id: user.id, email: user.email || '' };
  lastUser(user.id); ls('roadbook.lastEmail', S.user.email);
  await store.openStore(user.id);
  const wantMigrate = ls('roadbook.migrateLocal');
  if (wantMigrate) ls('roadbook.migrateLocal', null);   // asked once, for one email address only
  if (wantMigrate && wantMigrate === (user.email || '').trim().toLowerCase()) {
    try { const n = await migrateLocalToAccount(user.id); if (n) toast(`${n} records copied into your account.`); } catch (e) { console.error('migration failed', e); toast('Could not copy your old records. They are still on this phone.', { bad: true }); }
  }
  // First sign-in on this phone: use the name typed at sign-up until the driver sets one in Settings.
  if (!store.getProfile().display_name && user.user_metadata?.display_name) await store.setProfile({ ...store.getProfile(), display_name: String(user.user_metadata.display_name).slice(0, 60) });
  const client = getClient();
  S.api = makeApi(client, user.id);
  S.sync = createSync({ api: S.api, onStatus: (st) => { S.status = st; shell?.setSync(st); if (st.state === 'signedout') toast('Please sign in again to keep backing up.', { bad: true }); } });
  store.setKick(() => S.sync.schedule(1500));
  onAuth((event) => {
    if (event === 'SIGNED_OUT' && !S.signingOut) { lastUser(null); location.reload(); }
    if (event === 'PASSWORD_RECOVERY') showSetPassword(app, { onDone: () => location.reload() });
  });
  await startApp();
  S.sync.run().then(async () => {
    if (await refreshCrews()) { updateBadges(); if (S.crews.length) subscribeLive(); }
  });
}

async function enterLocal() {
  S.user = null; S.api = null; S.sync = null;
  await store.openStore(null);
  store.setKick(() => {});
  await startApp();
}

async function startApp() {
  shell = buildShell(app, { appName: cfg.appName || 'Roadbook' });
  shell.setSync(S.status);
  S.tracker = createTracker({
    onUpdate: () => store.emit(['trip-live']),
    checkpoint: (st) => { store.getDb()?.setMeta('activeTrip', st).catch(() => {}); },
  });
  await restoreTrip();
  start(shell);
  startEngine();
  store.onChange((t) => { if (t.some((x) => ['messages', 'road_alerts', 'crews'].includes(x))) updateBadges(); });
  updateBadges();
  window.addEventListener('online', () => { S.online = true; shell.setSync(S.status); S.sync?.run().then(() => refreshCrews()); });
  window.addEventListener('offline', () => { S.online = false; shell.setSync({ ...S.status, state: 'offline' }); });
  S.online = navigator.onLine;
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible' && S.sync) S.sync.run(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') S.sync?.run(); });
  maybeFirstRun();
}

async function restoreTrip() {
  const saved = await store.getDb().meta('activeTrip');
  if (!saved || !saved.id) return;
  const age = Date.now() - new Date(saved.started_at).getTime();
  if (age > 18 * 3600000) {
    // left open far too long: keep what was counted and close it
    await store.save('trips', { id: saved.id, load_id: saved.load_id || null, started_at: saved.started_at, ended_at: new Date().toISOString(), distance_m: Math.round(saved.distance_m || 0), method: 'gps', origin_label: saved.origin_label || '', dest_label: saved.dest_label || '', note: 'Closed automatically', path: thinPath(saved.path || []) });
    await store.getDb().setMeta('activeTrip', null);
    toast('A trip that was left open was saved.');
    return;
  }
  S.tracker.resume(saved);
  toast('Your trip is still running.');
}

function updateBadges() {
  if (!shell) return;
  const crew = currentCrew();
  shell.setBadge('crew', crew ? unreadCount() + activeAlerts(crew.id).length : 0);
}

function subscribeLive() {
  if (unsubRealtime || !S.api) return;
  try { unsubRealtime = S.api.subscribe(() => S.sync?.schedule(300)); } catch (e) { console.warn('realtime unavailable', e); }
}

function maybeFirstRun() {
  if (prefs().onboarded) return;
  setPref({ onboarded: true });
  if (!location.hash || location.hash === '#/') toast('Welcome! Tap Help any time to see how it works.', { action: { label: 'Help', run: () => { location.hash = '#/help'; } } });
}

/* ---------- offline support ---------- */
function registerWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (!reg) return;
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version is ready.', { ms: 15000, action: { label: 'Update', run: () => nw.postMessage('SKIP_WAITING') } });
        }
      });
    });
  }).catch((e) => console.warn('service worker failed', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
}

registerWorker();
boot();
window.addEventListener('unhandledrejection', (e) => console.error('unhandled', e.reason));
export { render, stopEngine };
