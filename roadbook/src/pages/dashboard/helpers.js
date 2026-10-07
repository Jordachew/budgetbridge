// Pure helpers shared by the Dashboard, Reports and Money pages: time buckets, comparisons, wording.
import { addDays, periodRange, startOfDay, startOfWeek } from '../../core/dates.js';
import { CATEGORIES } from '../../core/receipt.js';

export const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || (id ? id[0].toUpperCase() + id.slice(1) : 'Other');

/** Short axis money: J$1.2M, J$45k, J$800. */
export function compactMoney(cents, cur) {
  const n = Math.abs(cents) / 100;
  const sym = cur === 'USD' ? 'US$' : 'J$';
  const sign = cents < 0 ? '-' : '';
  if (n >= 1e6) return `${sign}${sym}${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${sign}${sym}${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return `${sign}${sym}${Math.round(n)}`;
}

const MON = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const MON_LONG = new Intl.DateTimeFormat('en-GB', { month: 'long' });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
export const monthName = (d) => MON_LONG.format(d);

/** Buckets for a bar chart: days for a week, weeks for a month, months for a year or all time. */
export function makeBuckets(kind, range, dates = []) {
  const out = [];
  if (kind === 'week') {
    for (let d = new Date(range.from); d < range.to; d = addDays(d, 1)) out.push({ from: d, to: addDays(d, 1), label: WEEKDAY.format(d) });
  } else if (kind === 'month') {
    for (let d = startOfWeek(range.from); d < range.to; d = addDays(d, 7)) {
      const from = d < range.from ? range.from : d;
      const to = addDays(d, 7) > range.to ? range.to : addDays(d, 7);
      out.push({ from, to, label: DAY.format(from) });
    }
  } else {
    let from = range.from;
    let to = range.to;
    if (kind === 'all') {
      const ts = dates.map((x) => new Date(x).getTime()).filter(Number.isFinite);
      const now = new Date();
      const min = ts.length ? new Date(Math.min(...ts)) : now;
      from = new Date(min.getFullYear(), min.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    const multiYear = from.getFullYear() !== new Date(to.getTime() - 1).getFullYear();
    for (let d = new Date(from); d < to && out.length < 120; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      out.push({ from: d, to: new Date(d.getFullYear(), d.getMonth() + 1, 1), label: multiYear ? `${MON.format(d)} ${String(d.getFullYear()).slice(2)}` : MON.format(d) });
    }
  }
  return out;
}

/** Daily buckets (week, month) or monthly buckets (year, all) up to today: for the hero sparkline. */
export function sparkBuckets(kind, range, now = new Date()) {
  if (kind === 'week' || kind === 'month') {
    const end = addDays(startOfDay(now), 1) < range.to ? addDays(startOfDay(now), 1) : range.to;
    const out = [];
    for (let d = new Date(range.from); d < end; d = addDays(d, 1)) out.push({ from: d, to: addDays(d, 1), label: DAY.format(d) });
    return out;
  }
  return makeBuckets('year', kind === 'year' ? range : periodRange('year', now), []).filter((b) => b.from <= now);
}

/** Twelve (or up to 36 for "all") month buckets for a profit trend, ending sensibly for the chosen period. */
export function monthWindow(kind, range, dates = [], now = new Date()) {
  let start;
  let count = 12;
  if (kind === 'year') start = new Date(range.from.getFullYear(), 0, 1);
  else if (kind === 'all') {
    const ts = dates.map((x) => new Date(x).getTime()).filter(Number.isFinite);
    const min = ts.length ? new Date(Math.min(...ts)) : now;
    start = new Date(min.getFullYear(), min.getMonth(), 1);
    count = Math.min(36, Math.max(2, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1));
    start = new Date(now.getFullYear(), now.getMonth() - count + 1, 1);
  } else start = new Date(range.from.getFullYear(), range.from.getMonth() - 11, 1);
  const multiYear = kind === 'all' || kind !== 'year';
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    out.push({ from: d, to: new Date(d.getFullYear(), d.getMonth() + 1, 1), label: multiYear ? `${MON.format(d)} ${String(d.getFullYear()).slice(2)}` : MON.format(d) });
  }
  return out;
}

/** Fill buckets with revenue and expense totals in one currency. Buckets starting after `now` get profit null. */
export function fillBuckets(buckets, income, expenses, cur, now = new Date()) {
  const out = buckets.map((b, i) => ({ key: String(i), label: b.label, from: b.from, to: b.to, revenue: 0, expenses: 0 }));
  const add = (rows, field, prop) => {
    for (const r of rows) {
      if (r.currency !== cur) continue;
      const t = new Date(r[field]).getTime();
      const b = out.find((x) => t >= x.from.getTime() && t < x.to.getTime());
      if (b) b[prop] += r.amount_cents || 0;
    }
  };
  add(income, 'received_at', 'revenue');
  add(expenses, 'spent_at', 'expenses');
  return out.map((b) => ({ ...b, values: { revenue: b.revenue, expenses: b.expenses }, profit: b.from > now ? null : b.revenue - b.expenses }));
}

/** Signed comparison of two cents values. */
export function compare(now, before) {
  const diff = now - before;
  return { diff, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat', pct: before !== 0 && Math.abs(diff) / Math.abs(before) < 10 ? Math.round((Math.abs(diff) / Math.abs(before)) * 100) : null };
}

/** "last week", "September", "2025": what the previous equivalent period is called. */
export function prevName(kind, prevRange) {
  if (kind === 'week') return 'the week before';
  if (kind === 'month') return monthName(prevRange.from);
  if (kind === 'year') return String(prevRange.from.getFullYear());
  return 'before';
}

/** "this month" / "in September" for takeaway sentences. */
export function whenText(period, range) {
  const now = period.offset === 0;
  if (period.kind === 'week') return now ? 'this week' : `in the week of ${DAY.format(range.from)}`;
  if (period.kind === 'month') return now ? 'this month' : `in ${monthName(range.from)} ${range.from.getFullYear()}`;
  if (period.kind === 'year') return now ? 'this year' : `in ${range.from.getFullYear()}`;
  return 'over all time';
}

export const unitWord = (kind) => (kind === 'week' ? 'day' : kind === 'month' ? 'week' : 'month');
