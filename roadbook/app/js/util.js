// Small helpers. h() builds DOM nodes with textContent only: no innerHTML anywhere in the app,
// so text typed by a driver (or sent by another driver) can never run as code.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else Object.assign(el.style, v); }   // CSSOM only: the page forbids inline style attributes
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'required' || k === 'multiple' || k === 'selected') el[k] = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}
export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  fuel: 'M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h12M14 9h2.5a1.5 1.5 0 011.5 1.5V16a1.5 1.5 0 003 0V8l-3-3M6 8h6',
  road: 'M8 3L4 21M16 3l4 18M12 4v3M12 10v4M12 17v3',
  food: 'M7 3v8a2 2 0 002 2v8M11 3v8a2 2 0 01-2 2M9 3v6M17 21V3c-2 1-3.5 4-3.5 8h3.5',
  wrench: 'M14.7 6.3a4 4 0 005 5l-9.4 9.4a2.1 2.1 0 01-3-3l9.4-9.4a4 4 0 00-2-1z',
  tyre: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 6a3 3 0 100 6 3 3 0 000-6zM12 3v3M12 18v3M3 12h3M18 12h3',
  parking: 'M5 3h14v18H5zM9 17V8h4a2.5 2.5 0 010 5H9',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  bed: 'M3 18V6M3 14h18v4M21 14v-2a3 3 0 00-3-3h-7v5M7 11.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3',
  phone: 'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.5-6 8-6s8 2 8 6',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.5a3.5 3.5 0 010 6.5M18 14.8c2.2.6 3.5 2.3 3.5 5.2',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  camera: 'M4 8h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4M9 21h6',
  truck: 'M2 6h12v10H2zM14 9h4l4 4v3h-8M6.5 19a2 2 0 100-4 2 2 0 000 4zM17.5 19a2 2 0 100-4 2 2 0 000 4z',
  box: 'M3 7.5L12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
  wallet: 'M3 7a2 2 0 012-2h13v4M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2zM16 14.5h.01',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0',
  chat: 'M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  check: 'M4 12.5l5 5L20 6.5',
  x: 'M5 5l14 14M19 5L5 19',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  gps: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  speaker: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 13a7.5 7.5 0 000-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 00-1.7-1L15 3.5h-4L10.7 6a7.5 7.5 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 000 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 001.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 001.7-1l2.4 1 2-3.4z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v7h14v-7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  pin: 'M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  scan: 'M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  offline: 'M3 3l18 18M8.5 8.800A9 9 0 003 11M5.6 12.500A5.5 5.5 0 0110 10.200M12 18h.01M16 10.500A8.5 8.5 0 0121 11M14.5 14a3.5 3.5 0 012.5 1.5',
  sync: 'M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5',
  sign: 'M4 20c3 0 4-8 7-8s1 6 4 6 2-3 5-3M3 20h18',
  star: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.6 6.6 19.600l1.1-6L3.2 9.400l6.1-.8z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  link: 'M10 14a4 4 0 005.6 0l3-3a4 4 0 00-5.6-5.600L12 7M14 10a4 4 0 00-5.6 0l-3 3a4 4 0 005.6 5.600L12 17',
  send: 'M3 11l18-8-8 18-2-8z',
  landslide: 'M3 20l6-10 4 6 3-4 5 8zM6 7h.01M10 5h.01',
  flood: 'M3 10c2 0 2-1.5 4-1.500S9 10 11 10s2-1.5 4-1.500S17 10 19 10M3 15c2 0 2-1.5 4-1.500S9 15 11 15s2-1.5 4-1.500S17 15 19 15M3 20c2 0 2-1.5 4-1.500S9 20 11 20s2-1.5 4-1.500S17 20 19 20',
  siren: 'M7 18v-6a5 5 0 0110 0v6M5 18h14v3H5zM12 3v2M4.5 6l1.5 1.500M19.5 6L18 7.5',
};
export function icon(name, size = 24, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (cls) svg.setAttribute('class', cls);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICONS[name] || ICONS.dots);
  svg.append(p);
  return svg;
}
export const hasIcon = (n) => n in ICONS;

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nowIso = () => new Date().toISOString();
export function safeJSON(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
export function ls(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
  } catch { /* private mode: fine, just forget */ }
  return null;
}
