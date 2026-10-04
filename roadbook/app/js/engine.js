// The alert engine. While the app is open it watches reminders, new road alerts and new chat
// messages, and tells the driver by voice, a full-screen card, and (if allowed) a notification.
// Honest limit: a web app cannot wake itself when it is fully closed. For that, reminders can also
// be exported to the phone's own calendar (Reminders > "Add to my phone calendar").

import { h, icon, ls, safeJSON } from './util.js';
import * as store from './store.js';
import { S } from './session.js';
import { prefs, setPref } from './prefs.js';
import { speak, stopSpeaking } from './voice.js';
import { reminderState, fireTime, completeReminder, snoozePatch, whenText } from './reminders-logic.js';
import { alertSpeech, alertKind, reminderSpeech, messageSpeech } from './phrases.js';
import { fmtDistance, fmtRelative } from './format.js';
import { haversine } from './geo.js';
import { getPositionOnce } from './gps.js';
import { currentOdometer } from './calc.js';
import { haptic } from './ui.js';

const FIRED_KEY = 'roadbook.fired.v1';
const fired = new Set(safeJSON(ls(FIRED_KEY), []));
const remember = (k) => { fired.add(k); ls(FIRED_KEY, JSON.stringify([...fired].slice(-300))); };

let timer = null, offChange = null, lastPos = null, lastPosAt = 0;
const queue = [];
let showing = false;

export const notificationsAllowed = () => 'Notification' in window && Notification.permission === 'granted';
export async function enableNotifications() {
  if (!('Notification' in window)) return false;
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  const ok = p === 'granted';
  setPref({ notify: ok });
  return ok;
}
async function notify(title, body, tag) {
  if (!prefs().notify || !notificationsAllowed()) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [200, 100, 200], requireInteraction: true });
    else new Notification(title, { body, tag, icon: 'icons/icon-192.png' });
  } catch { /* some browsers refuse: the in-app card still shows */ }
}

/* ---------- on-screen alert card ---------- */
function showNext() {
  if (showing || !queue.length) return;
  showing = true;
  const item = queue.shift();
  const overlay = h('div', { class: 'alert-overlay', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': item.title });
  const close = () => { overlay.remove(); stopSpeaking(); showing = false; document.body.style.overflow = ''; showNext(); };
  const card = h('div', { class: 'alert-card' + (item.kind === 'reminder' ? ' reminder' : '') },
    h('div', { class: 'row' }, icon(item.icon || 'alert', 44), h('h2', null, item.title)),
    item.text ? h('p', { style: { fontSize: '1.15em', margin: '0' } }, item.text) : null,
    h('div', { class: 'btn-row' }, ...item.actions.map((a) => h('button', { class: 'btn', type: 'button', onclick: async () => { try { await a.run?.(); } finally { close(); } } }, a.label))));
  overlay.append(card);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  card.querySelector('button')?.focus();
  haptic([200, 100, 200]);
}
function raise(item) { queue.push(item); showNext(); }

/* ---------- reminders ---------- */
export function odometer() {
  return currentOdometer(store.rows('trips'), store.rows('expenses'), store.getProfile().odometer_manual || null);
}
function checkReminders() {
  if (!store.getDb()) return;
  const now = new Date();
  const odo = odometer();
  for (const r of store.rows('reminders')) {
    if (r.done_at) continue;
    const st = reminderState(r, { now, odometer_m: odo });
    let key = null;
    if (r.kind === 'date') {
      const ft = fireTime(r);
      if (ft != null && now.getTime() >= ft && st !== 'snoozed') key = `d|${r.id}|${r.due_at}|${r.snoozed_until || ''}`;
    } else if (st === 'soon' || st === 'due' || st === 'overdue') key = `k|${r.id}|${r.due_odometer_m}|${st === 'soon' ? 'soon' : 'due'}|${r.snoozed_until || ''}`;
    if (!key || fired.has(key)) continue;
    remember(key);
    const when = whenText(r, { now, odometer_m: odo }, { distance: (m) => fmtDistance(m, prefs().unit), relative: (iso) => fmtRelative(iso) });
    const speech = reminderSpeech(r, when);
    speak(speech);
    notify(r.title, when, `rem-${r.id}`);
    raise({ kind: 'reminder', icon: 'bell', title: r.title, text: when, actions: [
      { label: 'Done', run: () => store.save('reminders', { ...store.find('reminders', r.id), ...completeReminder(store.find('reminders', r.id), { odometer_m: odo }) }) },
      { label: 'Remind me in 1 hour', run: () => store.save('reminders', { ...store.find('reminders', r.id), ...snoozePatch(60) }) },
      { label: 'Close' },
    ] });
  }
}

/* ---------- road alerts and chat ---------- */
async function knownPosition() {
  const t = S.tracker?.lastPosition();
  if (t) { lastPos = t; lastPosAt = Date.now(); return t; }
  if (lastPos && Date.now() - lastPosAt < 120000) return lastPos;
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' });
    if (perm?.state !== 'granted') return lastPos;
  } catch { return lastPos; }
  const p = await getPositionOnce({ timeout: 6000, maxAge: 120000 });
  if (p) { lastPos = p; lastPosAt = Date.now(); }
  return lastPos;
}
let busyAlerts = false;
async function checkAlerts() {
  if (busyAlerts || !store.getDb()) return;
  busyAlerts = true;
  try {
    const me = store.userId();
    const fresh = store.rows('road_alerts').filter((a) => a.user_id !== me && !a.cleared_at && new Date(a.expires_at) > new Date() && Date.now() - new Date(a.created_at).getTime() < 60 * 60000 && !fired.has('a|' + a.id));
    if (!fresh.length) return;
    const here = await knownPosition();
    for (const a of fresh) {
      remember('a|' + a.id);
      const d = here ? haversine(here, a) : null;
      if (d != null && d > prefs().alertRadiusKm * 1000) continue;   // too far away to matter
      const text = alertSpeech(a, here, prefs().unit);
      speak(text);
      notify(`${alertKind(a.kind).label} reported`, a.note || (d != null ? `About ${fmtDistance(d, prefs().unit)} away` : 'Reported by a driver in your crew'), `alert-${a.id}`);
      raise({ kind: 'alert', icon: alertKind(a.kind).icon, title: alertKind(a.kind).label, text: [a.note ? a.note.replace(/[.!?\s]*$/, '.') : '', d != null ? (d < 100 ? 'Very close to you.' : `About ${fmtDistance(d, prefs().unit)} away.`) : '', `Reported by ${a.author_name || 'a driver'}.`].filter(Boolean).join(' '),
        actions: [{ label: 'OK, thanks', run: () => {} }, { label: 'See all alerts', run: () => { location.hash = '#/alerts'; } }] });
    }
  } finally { busyAlerts = false; }
}
function checkMessages() {
  if (!prefs().readMessages || !store.getDb()) return;
  const me = store.userId();
  for (const m of store.rows('messages')) {
    if (m.user_id === me || fired.has('m|' + m.id) || Date.now() - new Date(m.created_at).getTime() > 5 * 60000) continue;
    remember('m|' + m.id);
    if (location.hash.startsWith('#/chat')) continue;
    speak(messageSpeech(m.author_name || 'Driver', m.body));
    notify(m.author_name || 'Crew message', m.body, `msg-${m.id}`);
  }
}

export function startEngine() {
  stopEngine();
  checkReminders();
  timer = setInterval(checkReminders, 30000);
  document.addEventListener('visibilitychange', onVisible);
  offChange = store.onChange((tables) => {
    if (tables.includes('road_alerts')) checkAlerts();
    if (tables.includes('messages')) checkMessages();
    if (tables.includes('reminders') || tables.includes('trips')) checkReminders();
  });
  checkAlerts();
}
function onVisible() { if (document.visibilityState === 'visible') { checkReminders(); checkAlerts(); } }
export function stopEngine() {
  clearInterval(timer); timer = null;
  document.removeEventListener('visibilitychange', onVisible);
  if (offChange) offChange(); offChange = null;
}
export const _test = { fired, checkReminders };
