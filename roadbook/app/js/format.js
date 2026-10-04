// Money, distance and date formatting. Pure functions: no DOM, safe to unit-test.

export const CURRENCIES = {
  JMD: { symbol: 'J$', name: 'Jamaican dollars' },
  USD: { symbol: 'US$', name: 'US dollars' },
};
export const MAX_CENTS = 100000000000; // matches the database limit (1 billion dollars)

/** 1245000 -> "J$12,450". Cents are only shown when there are some. */
export function fmtMoney(cents, cur = 'JMD') {
  const symbol = (CURRENCIES[cur] || CURRENCIES.JMD).symbol;
  const n = Math.round(Number(cents) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeStr = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${symbol}${wholeStr}${frac ? '.' + String(frac).padStart(2, '0') : ''}`;
}

/** "12,450.50" / "J$ 12450" -> 1245050. Returns null for anything that is not a sensible amount. */
export function parseMoney(input) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();
  s = s.replace(/j\$|us\$|jmd|usd|\$/g, '').replace(/[\s,_]/g, '');
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return null;
  let [whole, frac = ''] = s.split('.');
  if (whole === '') whole = '0';
  if (whole.length > 10) return null;
  let cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1; // round half up, no float maths
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null;
  return cents;
}

const KM_PER_MI = 1.609344;

/** Meters -> text in the driver's unit. */
export function fmtDistance(meters, unit = 'km') {
  const m = Math.max(0, Number(meters) || 0);
  const v = unit === 'mi' ? m / 1000 / KM_PER_MI : m / 1000;
  const digits = v < 100 ? 1 : 0;
  const text = v.toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${text} ${unit}`;
}

/** Text typed by the driver ("1,234.5") -> meters, or null. */
export function parseDistance(input, unit = 'km') {
  if (input == null) return null;
  const s = String(input).trim().replace(/[,\s]/g, '').replace(/(km|mi|miles?|kms?)$/i, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const meters = Math.round(n * 1000 * (unit === 'mi' ? KM_PER_MI : 1));
  return meters > 100000000000 ? null : meters;
}

export function unitLabel(unit) { return unit === 'mi' ? 'miles' : 'kilometres'; }
export function speedText(mps, unit = 'km') {
  const v = (Number(mps) || 0) * 3.6 / (unit === 'mi' ? KM_PER_MI : 1);
  return `${Math.round(v)} ${unit === 'mi' ? 'mph' : 'km/h'}`;
}

export function fmtDuration(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

const D = (v) => (v instanceof Date ? v : new Date(v));
const valid = (d) => !Number.isNaN(d.getTime());

export function fmtDate(v, { weekday = true, year = false } = {}) {
  const d = D(v);
  if (!valid(d)) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: weekday ? 'short' : undefined, day: 'numeric', month: 'short', year: year ? 'numeric' : undefined,
  }).format(d);
}
export function fmtTime(v) {
  const d = D(v);
  if (!valid(d)) return '';
  return new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
}
export function fmtDateTime(v) {
  const d = D(v);
  return valid(d) ? `${fmtDate(d)}, ${fmtTime(d)}` : '';
}

/** "in 3 days", "2 hours ago": plain words for reminders and chat. */
export function fmtRelative(v, now = new Date()) {
  const d = D(v);
  if (!valid(d)) return '';
  const diff = d.getTime() - D(now).getTime();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  let text;
  if (min < 1) return 'now';
  if (min < 60) text = `${min} min`;
  else if (min < 60 * 36) { const h = Math.round(min / 60); text = `${h} hour${h === 1 ? '' : 's'}`; }
  else { const dys = Math.round(min / 1440); text = `${dys} day${dys === 1 ? '' : 's'}`; }
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

const pad = (n) => String(n).padStart(2, '0');
/** ISO instant -> value for <input type="datetime-local"> in the phone's own time zone. */
export function toLocalInput(v) {
  const d = D(v);
  if (!valid(d)) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Value from <input type="datetime-local"> -> Date (an instant), or null. */
export function fromLocalInput(s) {
  if (!s) return null;
  const d = new Date(s);
  return valid(d) ? d : null;
}
export function toDateInput(v) { return toLocalInput(v).slice(0, 10); }

export function plural(n, one, many = one + 's') { return `${n} ${n === 1 ? one : many}`; }
export function titleCase(s) { return String(s).replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()); }
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}
export function clip(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
