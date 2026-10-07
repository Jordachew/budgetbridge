// Invoice state changes shared by the ledger rows, the detail page and the payment dialog.
// Money rules: only the newly received amount becomes income, and a lock stops double taps creating twice.
import { create, find, remove, save } from '../../state/data.js';
import { fmtMoney } from '../../core/format.js';
import { invoiceTotals, nextInvoiceNumber, todayStr } from './totals.js';
import { invoiceText, mailtoLink } from './summary.js';
import { whatsappLink } from './helpers.js';

const inflight = new Set();

/** Records a payment (cents) against an invoice. Re-reads the latest row so a stale screen can never overpay. */
export async function recordPayment(inv, cents) {
  if (inflight.has(inv.id)) return { ok: false, reason: 'busy' };
  inflight.add(inv.id);
  try {
    const cur = find('invoices', inv.id) || inv;
    if (cur.status === 'void') return { ok: false, reason: 'void' };
    const t = invoiceTotals(cur);
    const amount = Math.min(Math.round(cents), t.balance);
    if (!(amount > 0)) return { ok: false, reason: 'nothing' };
    const now = new Date().toISOString();
    const income = await create('income', { kind: 'pay', amount_cents: amount, currency: cur.currency, load_id: cur.load_id || null, note: `Invoice ${cur.number} - ${cur.customer}`.slice(0, 500), received_at: now });
    const paid = (cur.paid_cents || 0) + amount;
    const full = paid >= t.total;
    await save('invoices', { ...cur, paid_cents: paid, paid_at: now, status: full ? 'paid' : cur.status === 'draft' ? 'sent' : cur.status });
    return { ok: true, amount, full, income, before: cur };
  } finally { inflight.delete(inv.id); }
}
/** Puts an invoice back as it was and removes the income a payment created. */
export async function undoPayment({ before, income }) {
  await remove('income', income.id);
  const cur = find('invoices', before.id);
  await save('invoices', { ...(cur || before), paid_cents: before.paid_cents || 0, paid_at: before.paid_at || null, status: before.status });
}
export function paymentToast(toast, res, inv) {
  if (!res.ok) return toast(res.reason === 'busy' ? 'One moment, that payment is still saving.' : 'Nothing left to pay on this invoice.', { bad: res.reason !== 'busy' });
  toast(res.full ? 'Paid in full. Added to your income.' : `${fmtMoney(res.amount, inv.currency)} recorded. Added to your income.`, { ms: 7000, action: { label: 'Undo', run: () => undoPayment(res) } });
}

export async function markSent(inv, toast) {
  const before = find('invoices', inv.id) || inv;
  if (before.status !== 'draft') return;
  await save('invoices', { ...before, status: 'sent' });
  toast?.('Marked as sent.', { ms: 7000, action: { label: 'Undo', run: () => save('invoices', { ...before, status: 'draft' }) } });
}
export async function setVoid(inv, toast) {
  const before = find('invoices', inv.id) || inv;
  await save('invoices', { ...before, status: 'void' });
  toast('Invoice voided. It stays in your records.', { ms: 7000, action: { label: 'Undo', run: () => save('invoices', { ...before }) } });
}
export async function restoreDraft(inv, toast) {
  await save('invoices', { ...(find('invoices', inv.id) || inv), status: 'draft' });
  toast('Restored as a draft.');
}
export async function duplicateInvoice(inv, all, toast) {
  const row = await create('invoices', { load_id: inv.load_id || null, number: nextInvoiceNumber(all), customer: inv.customer, customer_email: inv.customer_email, customer_address: inv.customer_address, items: inv.items, tax_pct: inv.tax_pct, discount_cents: inv.discount_cents, currency: inv.currency, notes: inv.notes, status: 'draft', issue_date: todayStr(), due_date: null, paid_cents: 0, paid_at: null });
  toast('Copied. Review the new draft.');
  return row;
}

/** Sends a draft by email / WhatsApp / clipboard, then marks it as sent. */
export async function sendVia(channel, inv, profile, toast) {
  const text = invoiceText(inv, profile);
  if (channel === 'whatsapp') window.open(whatsappLink(text), '_blank', 'noopener');
  else if (channel === 'email') window.location.href = mailtoLink(inv, profile);
  else if (channel === 'copy') {
    try { await navigator.clipboard.writeText(text); toast('Invoice text copied.'); } catch { toast('Could not copy. Your browser blocked it.', { bad: true }); return; }
  }
  if (inv.status === 'draft') await markSent(inv, toast);
}
