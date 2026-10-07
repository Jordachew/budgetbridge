// Pure helpers shared by the Dashboard, Reports and Money pages.
import { addDays, startOfDay, startOfWeek } from '../../core/dates.js';

/** Invoice total in cents: sum(qty * unit_cents) - discount, then tax on the discounted subtotal. */
export function invoiceTotal(inv) {
  const items = Array.isArray(inv.items) ? inv.items : [];
  const sub = items.reduce((a, it) => a + Math.round((Number(it.qty) || 0) * (Number(it.unit_cents) || 0)), 0);
  const net = Math.max(0, sub - (Number(inv.discount_cents) || 0));
  return net + Math.round(net * ((Number(inv.tax_pct) || 0) / 100));
}
export const invoiceOutstanding = (inv) => Math.max(0, invoiceTotal(inv) - (Number(inv.paid_cents) || 0));

/** A draft/sent invoice past its due date. */
export function invoiceOverdue(inv, now = new Date()) {
  if (!inv.due_date) return false;
  return new Date(`${inv.due_date}T23:59:59`).getTime() < now.getTime();
}

const MONTHS = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

/** Buckets for a trend chart: days for a week, weeks for a month, months for a year or all time. */
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
      out.push({ from: d, to: new Date(d.getFullYear(), d.getMonth() + 1, 1), label: multiYear ? `${MONTHS.format(d)} ${String(d.getFullYear()).slice(2)}` : MONTHS.format(d) });
    }
  }
  return out;
}

/** Fill buckets with revenue/expense totals (one currency). */
export function trendSeries(buckets, income, expenses, cur) {
  return buckets.map((b) => {
    const t0 = b.from.getTime();
    const t1 = b.to.getTime();
    const sum = (rows, f) => rows.reduce((a, r) => {
      if (r.currency !== cur) return a;
      const t = new Date(r[f]).getTime();
      return t >= t0 && t < t1 ? a + (r.amount_cents || 0) : a;
    }, 0);
    return { name: b.label, revenue: sum(income, 'received_at'), expenses: sum(expenses, 'spent_at') };
  });
}

export const startOfToday = () => startOfDay(new Date());
