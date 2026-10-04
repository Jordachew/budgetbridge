// Per-phone settings (text size, theme, voice, units). Kept in localStorage; losing them is harmless.
import { ls, safeJSON } from './util.js';

const KEY = 'roadbook.prefs.v1';
export const DEFAULTS = {
  textSize: 100,        // percent: 100 | 115 | 130
  theme: 'auto',        // auto | light | dark
  unit: 'km',           // km | mi
  voice: true,          // speak alerts and reminders
  voiceRate: 0.95,
  notify: false,        // browser notifications (needs permission)
  alertRadiusKm: 15,    // spoken road alerts inside this distance
  haptics: true,
  readMessages: false,   // speak new chat messages
  onboarded: false,
  lastMode: null,       // 'account' | 'local'
};
let cur = { ...DEFAULTS, ...safeJSON(ls(KEY), {}) };
const subs = new Set();

export const prefs = () => cur;
export function setPref(patch) {
  cur = { ...cur, ...patch };
  ls(KEY, JSON.stringify(cur));
  applyPrefs();
  subs.forEach((f) => f(cur));
}
export const onPrefs = (f) => { subs.add(f); return () => subs.delete(f); };

export function applyPrefs() {
  const r = document.documentElement;
  r.style.setProperty('--text-scale', String(cur.textSize / 100));
  if (cur.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', cur.theme);
}
