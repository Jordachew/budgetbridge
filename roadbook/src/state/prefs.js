// Per-device settings kept in localStorage. Losing them is harmless.
import { useSyncExternalStore } from 'react';
import { ls, safeJSON } from '../core/util.js';

const KEY = 'roadbook.prefs.v2';
export const DEFAULTS = { textSize: 100, theme: 'auto', unit: 'km', currency: 'JMD', chartTexture: false, lastMode: null, onboarded: false };
let cur = { ...DEFAULTS, ...safeJSON(ls(KEY), {}) };
const subs = new Set();

export const prefs = () => cur;
export function setPref(patch) {
  cur = { ...cur, ...patch };
  ls(KEY, JSON.stringify(cur));
  applyPrefs();
  subs.forEach((f) => f());
}
export function applyPrefs() {
  const r = document.documentElement;
  r.style.setProperty('--text-scale', String(cur.textSize / 100));
  const dark = cur.theme === 'dark' || (cur.theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  r.setAttribute('data-theme', dark ? 'dark' : 'light');
}
export function usePrefs() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, prefs);
}
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyPrefs);
