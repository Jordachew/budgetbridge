import { h, icon, clear } from '../util.js';
import * as store from '../store.js';
import { fmtMoney, fmtDistance, titleCase } from '../format.js';
import { periodRange, periodTitle } from '../dates.js';
import { currentOdometer } from '../calc.js';
import { prefs } from '../prefs.js';
import { listen, canListen } from '../voice.js';
import { toast, haptic } from '../ui.js';
import { shrinkPhoto } from '../images.js';

export const cur = () => store.getProfile().currency || 'JMD';
export const money = (c, currency = cur()) => fmtMoney(c, currency);
export const dist = (m) => fmtDistance(m, prefs().unit);
export const unitName = () => (prefs().unit === 'mi' ? 'miles' : 'km');
export const live = (t) => store.rows(t);

export function odometerNow() {
  return currentOdometer(live('trips'), live('expenses'), store.getProfile().odometer_manual || null);
}

export function loadName(l) {
  if (!l) return '';
  return [l.reference, l.customer].filter(Boolean).join(' · ') || l.description || 'Load';
}
export function activeLoads() { return live('loads').filter((l) => !['delivered', 'reconciled', 'cancelled'].includes(l.status)); }

/** Today / This week / This month / This year, with back and forward arrows. */
export function periodBar(kind0 = 'week', onChange) {
  let kind = kind0, offset = 0;
  const title = h('div', { class: 'grow center', style: { fontWeight: '700' }, 'aria-live': 'polite' });
  const prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Earlier', onclick: () => { offset -= 1; fire(); } }, icon('back', 26));
  const next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Later', onclick: () => { offset += 1; fire(); } }, icon('next', 26));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Time period' });
  const kinds = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
  const el = h('div', { class: 'stack' }, seg, h('div', { class: 'row' }, prev, title, next));
  function fire() {
    const range = periodRange(kind, new Date(), offset);
    title.textContent = offset === 0 ? ({ day: 'Today', week: 'This week', month: 'This month', year: 'This year' }[kind]) + ' · ' + periodTitle(kind, range) : periodTitle(kind, range);
    next.disabled = offset >= 0;
    clear(seg);
    for (const [k, l] of kinds) seg.append(h('button', { type: 'button', 'aria-pressed': String(k === kind), onclick: () => { kind = k; offset = 0; fire(); } }, l));
    onChange(range, kind);
  }
  fire();
  return el;
}

/** Microphone button: says "listening", then hands the words to `onText`. */
export function micButton(onText, label = 'Speak instead of typing') {
  let handle = null;
  const b = h('button', { class: 'mic-btn', type: 'button', 'aria-label': label, 'aria-pressed': 'false', title: label }, icon('mic', 26));
  if (!canListen()) { b.hidden = true; return b; }
  b.addEventListener('click', () => {
    if (handle) { handle.stop(); return; }
    b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); haptic(15);
    toast('Listening… speak now');
    handle = listen({
      onResult: (t) => onText(t),
      onEnd: (reason) => {
        handle = null; b.classList.remove('on'); b.setAttribute('aria-pressed', 'false');
        if (reason === 'denied') toast('Microphone is blocked. Turn it on in your phone settings.', { bad: true });
        else if (reason === 'nospeech') toast('Did not hear anything. Try again.');
        else if (reason === 'error') toast('Voice typing is not working right now. You can type instead.', { bad: true });
      },
    });
  });
  return b;
}

/** Picture picker with preview. Returns { el, get(): Blob|null, set(blob) }. */
export function photoPicker({ label = 'Take a photo', onPick } = {}) {
  let blob = null;
  let url = null;
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', 'aria-label': label, tabindex: '-1' });
  const preview = h('img', { class: 'thumb', alt: 'Picture you took', hidden: true });
  const open = h('button', { class: 'btn', type: 'button', onclick: () => input.click() }, icon('camera', 24), label);
  const clearBtn = h('button', { class: 'btn ghost small', type: 'button', hidden: true, onclick: () => set(null) }, 'Remove picture');
  function set(b) {
    if (url) URL.revokeObjectURL(url);
    blob = b; url = b ? URL.createObjectURL(b) : null;
    preview.hidden = !b; clearBtn.hidden = !b;
    if (b) preview.src = url; else preview.removeAttribute('src');
    open.lastChild.textContent = b ? 'Take another photo' : label;
  }
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try { const b = await shrinkPhoto(f); set(b); onPick?.(b); } catch (e) { toast(e.message || 'Could not use that picture.', { bad: true }); }
  });
  return { el: h('div', { class: 'stack' }, input, open, preview, clearBtn), get: () => blob, set };
}

export function download(name, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function shareText(text, title = 'Roadbook') {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}
export const when = (iso) => new Date(iso);
export const cap = titleCase;
