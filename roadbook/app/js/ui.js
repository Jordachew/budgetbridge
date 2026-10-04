// Reusable pieces: fields, buttons, dialogs, toasts. All text goes in through textContent.
import { h, icon, append, clear, uuid } from './util.js';
import { prefs } from './prefs.js';

export function announce(msg) {
  const a = document.getElementById('announcer');
  if (!a) return;
  a.textContent = '';
  setTimeout(() => { a.textContent = msg; }, 30);
}
export function haptic(ms = 20) { if (prefs().haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* ignore */ } } }

export function toast(msg, { bad = false, action = null, ms = 4500 } = {}) {
  const wrap = document.getElementById('toasts');
  if (!wrap) return;
  const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: bad ? 'alert' : 'status' }, h('span', null, msg));
  if (action) t.append(h('button', { type: 'button', onclick: () => { action.run(); t.remove(); } }, action.label));
  wrap.append(t);
  while (wrap.children.length > 3) wrap.firstChild.remove();
  setTimeout(() => t.remove(), action ? ms + 3000 : ms);
}

/* ---------- dialogs ---------- */
export function openSheet(build, { center = false, label = 'Dialog' } = {}) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: center ? 'center-dialog' : '', 'aria-label': label });
    const close = (v) => { if (dlg.open) dlg.close(); dlg.dataset.result = JSON.stringify(v ?? null); };
    const box = h('div', { class: 'sheet' });
    dlg.append(box);
    append(box, build(close));
    dlg.addEventListener('close', () => { const r = dlg.dataset.result ? JSON.parse(dlg.dataset.result) : null; dlg.remove(); resolve(r); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
export async function confirmDialog({ title, body, yes = 'Yes', no = 'No', danger = false }) {
  const r = await openSheet((close) => [
    h('h2', null, title),
    body ? h('p', null, body) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => close(true) }, yes),
      h('button', { class: 'btn', type: 'button', onclick: () => close(false), autofocus: true }, no)),
  ], { center: true, label: title });
  return r === true;
}
export function infoDialog(title, ...body) {
  return openSheet((close) => [h('h2', null, title), ...body, h('button', { class: 'btn primary', type: 'button', onclick: () => close(true) }, 'OK')], { center: true, label: title });
}
export function choiceSheet(title, options) {
  return openSheet((close) => [
    h('h2', null, title),
    ...options.map((o) => h('button', { class: 'btn' + (o.primary ? ' primary' : ''), type: 'button', onclick: () => close(o.value) }, o.icon ? icon(o.icon, 22) : null, o.label)),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Cancel'),
  ], { label: title });
}

/* ---------- layout bits ---------- */
export function banner(kind, iconName, ...kids) {
  return h('div', { class: `banner ${kind || ''}`, role: kind === 'bad' ? 'alert' : null }, icon(iconName, 24), h('div', { class: 'grow' }, ...kids));
}
export function empty(iconName, title, text, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'ring' }, icon(iconName, 44)), h('h3', null, title), text ? h('p', null, text) : null, action || null);
}
export const pill = (text, kind = '') => h('span', { class: `pill ${kind}` }, text);
export function kv(k, v, cls = '') { return h('div', { class: 'kv' }, h('span', null, k), h('b', { class: cls }, v)); }

export function btn(label, onClick, { kind = '', iconName = null, type = 'button', small = false, disabled = false, id } = {}) {
  return h('button', { class: `btn ${kind}${small ? ' small' : ''}`, type, onclick: onClick, disabled, id }, iconName ? icon(iconName, 24) : null, label);
}
export function linkBtn(label, href, { kind = '', iconName = null } = {}) {
  return h('a', { class: `btn ${kind}`, href }, iconName ? icon(iconName, 24) : null, label);
}

/** Label + control + hint + error, wired together for screen readers. */
export function field(label, control, { hint = '', error = '' } = {}) {
  const id = control.id || (control.id = 'f' + uuid().slice(0, 8));
  const hid = id + '-hint';
  const eid = id + '-err';
  const errEl = h('div', { class: 'err', id: eid, role: 'alert' }, error);
  errEl.hidden = !error;
  if (hint) control.setAttribute('aria-describedby', hid + (error ? ' ' + eid : ''));
  const wrap = h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('div', { class: 'hint', id: hid }, hint) : null, errEl);
  wrap.setError = (msg) => {
    errEl.textContent = msg || ''; errEl.hidden = !msg;
    if (msg) { control.setAttribute('aria-invalid', 'true'); control.setAttribute('aria-describedby', [hint ? hid : '', eid].filter(Boolean).join(' ')); }
    else { control.removeAttribute('aria-invalid'); if (hint) control.setAttribute('aria-describedby', hid); else control.removeAttribute('aria-describedby'); }
  };
  return wrap;
}
export const textInput = (o = {}) => h('input', { type: 'text', autocomplete: 'off', ...o });
export function selectInput(options, value, attrs = {}) {
  const s = h('select', attrs, options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  return s;
}

/** Group of single-choice buttons (categories, status...). */
export function choiceChips(items, value, onPick, { wide = false, label = '' } = {}) {
  const box = h('div', { class: 'chips' + (wide ? ' wide' : ''), role: 'group', 'aria-label': label });
  const draw = (v) => {
    clear(box);
    for (const it of items) {
      box.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(it.id === v), onclick: () => { onPick(it.id); draw(it.id); haptic(10); } },
        it.icon ? icon(it.icon, 26) : null, h('span', null, it.label)));
    }
  };
  draw(value);
  box.set = draw;
  return box;
}
export function segmented(items, value, onPick, label) {
  const box = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const draw = (v) => {
    clear(box);
    for (const it of items) box.append(h('button', { type: 'button', 'aria-pressed': String(it.id === v), onclick: () => { onPick(it.id); draw(it.id); } }, it.label));
  };
  draw(value);
  return box;
}
export function switchRow(label, value, onChange, hint) {
  let on = !!value;
  const b = h('button', { type: 'button', role: 'switch', 'aria-checked': String(on), class: 'btn small', onclick: () => { on = !on; b.setAttribute('aria-checked', String(on)); paint(); onChange(on); } });
  const paint = () => { b.textContent = on ? 'ON' : 'OFF'; b.classList.toggle('green', on); };
  paint();
  return h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'item-title', style: { fontWeight: '700' } }, label), hint ? h('div', { class: 'muted small' }, hint) : null), b);
}

export function busy(button, fn) {
  return async (...a) => {
    if (button.disabled) return;
    button.disabled = true;
    try { return await fn(...a); } finally { button.disabled = false; }
  };
}
export function spinner(text = 'Working…') { return h('div', { class: 'row', role: 'status' }, h('div', { class: 'spinner' }), h('span', null, text)); }
