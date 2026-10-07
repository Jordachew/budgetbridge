// Calendar helpers for period filters (week, month, year). Weeks start on Monday.

export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export function startOfWeek(d) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  return addDays(x, -dow);
}

/** Range is [from, to): `to` is the first instant after the period. */
export function periodRange(kind, ref = new Date(), offset = 0) {
  const r = new Date(ref);
  if (kind === 'day') {
    const from = addDays(startOfDay(r), offset);
    return { from, to: addDays(from, 1), label: 'day' };
  }
  if (kind === 'week') {
    const from = addDays(startOfWeek(r), offset * 7);
    return { from, to: addDays(from, 7), label: 'week' };
  }
  if (kind === 'month') {
    const from = new Date(r.getFullYear(), r.getMonth() + offset, 1);
    return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1), label: 'month' };
  }
  if (kind === 'year') {
    const from = new Date(r.getFullYear() + offset, 0, 1);
    return { from, to: new Date(from.getFullYear() + 1, 0, 1), label: 'year' };
  }
  if (kind === 'all') return { from: new Date(0), to: new Date(8640000000000000), label: 'all time' };
  throw new Error(`Unknown period: ${kind}`);
}

export function inRange(iso, { from, to }) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= from.getTime() && t < to.getTime();
}

export function periodTitle(kind, range) {
  if (kind === 'all') return 'All time';
  const f = range.from;
  if (kind === 'year') return String(f.getFullYear());
  if (kind === 'day') return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).format(f);
  if (kind === 'month') return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(f);
  const end = addDays(range.to, -1);
  const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt.format(f)} to ${fmt.format(end)}`;
}

/** Adds one repeat step. Month ends are clamped (31 Jan + 1 month = 28/29 Feb). */
export function addInterval(date, repeat, times = 1) {
  const d = new Date(date);
  if (repeat === 'daily') { d.setDate(d.getDate() + times); return d; }
  if (repeat === 'weekly') { d.setDate(d.getDate() + 7 * times); return d; }
  const months = repeat === 'yearly' ? 12 * times : repeat === 'monthly' ? times : 0;
  if (!months) return d;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}
