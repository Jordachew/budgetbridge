// Pure helpers for the Invoices screens: day maths, ageing buckets, relative due words and reminder messages.
import { fmtDate, fmtMoney } from '../../core/format.js';
import { displayStatus, invoiceTotals, todayStr } from './totals.js';
import { businessName } from './summary.js';

const parseDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
/** Whole days from a to b ('YYYY-MM-DD'). Positive when b is later. */
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);
export const fmtDay = (s, year = true) => (s ? fmtDate(`${s}T12:00:00`, { weekday: false, year }) : '');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Open = sent and still owing money (this includes overdue). */
export const isOpen = (inv) => inv.status === 'sent' && invoiceTotals(inv).balance > 0;

/** { text, tone: 'bad'|'warn'|'ok'|'muted'|'plain' } plain-language due date. */
export function dueWords(inv, today = todayStr()) {
  const st = displayStatus(inv, today);
  if (st === 'paid') return { text: inv.paid_at ? `Paid ${fmtDate(inv.paid_at, { weekday: false })}` : 'Paid', tone: 'ok' };
  if (st === 'void') return { text: 'Void', tone: 'muted' };
  if (!inv.due_date) return { text: 'No due date', tone: 'muted' };
  const n = daysBetween(today, inv.due_date);
  if (n < 0) return { text: `${plural(-n, 'day')} overdue`, tone: 'bad' };
  if (n === 0) return { text: 'Due today', tone: 'warn' };
  if (n === 1) return { text: 'Due tomorrow', tone: 'warn' };
  return { text: `Due in ${plural(n, 'day')}`, tone: n <= 7 ? 'warn' : 'plain' };
}
export const TONE_CLASS = {
  bad: 'text-[var(--bad)]', warn: 'text-[var(--warn)]', ok: 'text-[var(--good)]', muted: 'text-ink-500', plain: 'text-ink-800 dark:text-ink-100',
};

/* ---------------------------- ageing ---------------------------- */
export const AGE_BUCKETS = [
  { id: 'current', label: 'Current', sub: 'not due yet', mix: 26 },
  { id: 'd7', label: '1-7 days', sub: 'overdue', mix: 50 },
  { id: 'd30', label: '8-30 days', sub: 'overdue', mix: 76 },
  { id: 'd30p', label: '30+ days', sub: 'overdue', mix: 100 },
];
export function ageBucket(inv, today = todayStr()) {
  if (!inv.due_date) return 'current';
  const late = daysBetween(inv.due_date, today);
  if (late <= 0) return 'current';
  if (late <= 7) return 'd7';
  if (late <= 30) return 'd30';
  return 'd30p';
}
/** Ageing of open invoices in one currency. Other currencies are reported separately. */
export function ageing(invoices, cur, today = todayStr()) {
  const open = invoices.filter(isOpen);
  const buckets = AGE_BUCKETS.map((b) => ({ ...b, cents: 0, count: 0 }));
  const others = {};
  for (const inv of open) {
    const bal = invoiceTotals(inv).balance;
    if (inv.currency !== cur) { others[inv.currency] = (others[inv.currency] || 0) + bal; continue; }
    const b = buckets.find((x) => x.id === ageBucket(inv, today));
    b.cents += bal; b.count += 1;
  }
  const total = buckets.reduce((a, b) => a + b.cents, 0);
  const overdue = buckets.filter((b) => b.id !== 'current');
  return {
    buckets, total, others, count: buckets.reduce((a, b) => a + b.count, 0),
    overdueCents: overdue.reduce((a, b) => a + b.cents, 0), overdueCount: overdue.reduce((a, b) => a + b.count, 0),
  };
}
/** Open balances grouped by customer, biggest first. */
export function debtors(invoices, cur, today = todayStr()) {
  const m = new Map();
  for (const inv of invoices.filter((i) => isOpen(i) && i.currency === cur)) {
    const key = (inv.customer || 'Unnamed customer').trim();
    const row = m.get(key) || { name: key, cents: 0, invs: [], worst: 0 };
    row.cents += invoiceTotals(inv).balance;
    row.invs.push(inv);
    row.worst = Math.max(row.worst, inv.due_date ? Math.max(0, daysBetween(inv.due_date, today)) : 0);
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.worst - a.worst || b.cents - a.cents);
}

/* ------------------------- reminder messages ------------------------- */
/** Friendly, specific reminder for one or several invoices of the same customer. */
export function chaseMessage(invs, profile, today = todayStr()) {
  const biz = businessName(profile);
  const first = invs[0];
  const who = (first.customer || '').trim();
  const hi = who ? `Hi ${who},` : 'Hello,';
  if (invs.length === 1) {
    const inv = first;
    const amt = fmtMoney(invoiceTotals(inv).balance, inv.currency);
    const n = inv.due_date ? daysBetween(today, inv.due_date) : null;
    let when;
    if (n == null) when = `was issued on ${fmtDay(inv.issue_date)}`;
    else if (n < 0) when = `was due on ${fmtDay(inv.due_date)} (${plural(-n, 'day')} ago)`;
    else if (n === 0) when = 'is due today';
    else when = `is due on ${fmtDay(inv.due_date)}`;
    const ask = n != null && n < 0 ? 'Could you let me know when I can expect payment?' : 'Please let me know if you need anything from me.';
    return `${hi} ${n != null && n < 0 ? 'a reminder' : 'a friendly reminder'} that invoice ${inv.number} for ${amt} ${when}. ${ask} Thank you, ${biz}`;
  }
  const cur = first.currency;
  const total = invs.reduce((a, i) => a + invoiceTotals(i).balance, 0);
  const lines = invs.map((i) => {
    const n = i.due_date ? daysBetween(today, i.due_date) : null;
    const tail = n == null ? '' : n < 0 ? `, ${plural(-n, 'day')} overdue` : n === 0 ? ', due today' : `, due ${fmtDay(i.due_date, false)}`;
    return `- ${i.number}: ${fmtMoney(invoiceTotals(i).balance, cur)}${tail}`;
  });
  return `${hi} a reminder that these invoices are still open:\n${lines.join('\n')}\nTotal: ${fmtMoney(total, cur)}. Could you let me know when I can expect payment? Thank you, ${biz}`;
}
export const whatsappLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
export function chaseMailto(invs, text, profile) {
  const email = (invs.find((i) => i.customer_email) || {}).customer_email || '';
  const subject = invs.length === 1 ? `Reminder: invoice ${invs[0].number}` : `Reminder: ${invs.length} open invoices`;
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?subject=${encodeURIComponent(`${subject} from ${businessName(profile)}`)}&body=${encodeURIComponent(text)}`;
}

/** Past customers (most recent first) with their latest details, for autocomplete and "repeat last invoice". */
export function customerBook(invoices, loads = []) {
  const m = new Map();
  const sorted = [...invoices].sort((a, b) => (b.issue_date || '').localeCompare(a.issue_date || '') || (b.created_at || '').localeCompare(a.created_at || ''));
  for (const inv of sorted) {
    const name = (inv.customer || '').trim();
    if (!name) continue;
    const k = name.toLowerCase();
    const e = m.get(k) || { name, email: '', address: '', invoices: [] };
    if (!e.email && inv.customer_email) e.email = inv.customer_email;
    if (!e.address && inv.customer_address) e.address = inv.customer_address;
    e.invoices.push(inv);
    m.set(k, e);
  }
  for (const l of loads) {
    const name = (l.customer || '').trim();
    if (name && !m.has(name.toLowerCase())) m.set(name.toLowerCase(), { name, email: '', address: '', invoices: [] });
  }
  return [...m.values()];
}
