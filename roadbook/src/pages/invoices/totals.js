// Invoice maths. Pure functions, shared with other pages (Reports, Dashboard...).
// Money is whole cents. Tax is charged on the discounted subtotal and rounded to whole cents.

/** One line: qty (may be fractional, e.g. 2.5 hours) x unit price, rounded to whole cents. */
export const lineCents = (it) => Math.round((Number(it?.qty) || 0) * (Number(it?.unit_cents) || 0));

/**
 * invoiceTotals({ items, discount_cents, tax_pct, paid_cents })
 *  -> { subtotal, discount, taxable, tax, total, paid, balance }
 * total = sum(qty * unit_cents) - discount_cents, plus tax_pct% of that, rounded to whole cents.
 */
export function invoiceTotals(inv) {
  const subtotal = (inv?.items || []).reduce((a, it) => a + lineCents(it), 0);
  const discount = Math.min(Math.max(0, Math.round(Number(inv?.discount_cents) || 0)), subtotal);
  const taxable = subtotal - discount;
  const pct = Math.min(100, Math.max(0, Number(inv?.tax_pct) || 0));
  const tax = Math.round((taxable * pct) / 100);
  const total = taxable + tax;
  const paid = Math.max(0, Math.round(Number(inv?.paid_cents) || 0));
  return { subtotal, discount, taxable, tax, total, paid, balance: Math.max(0, total - paid) };
}

export const invoiceTotal = (inv) => invoiceTotals(inv).total;

const pad = (n) => String(n).padStart(2, '0');
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDaysStr(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return todayStr(new Date(y, (m || 1) - 1, (d || 1) + n));
}

/** Shown status: 'overdue' is a 'sent' invoice that is past its due date and not fully paid. */
export function displayStatus(inv, today = todayStr()) {
  if (inv.status === 'sent' && inv.due_date && inv.due_date < today && invoiceTotals(inv).balance > 0) return 'overdue';
  return inv.status;
}

/** Next number like INV-2026-0001, one higher than the biggest existing number for that year. */
export function nextInvoiceNumber(invoices, year = new Date().getFullYear()) {
  const re = new RegExp(`^INV-${year}-(\\d+)$`);
  let max = 0;
  for (const i of invoices) { const m = re.exec(i.number || ''); if (m) max = Math.max(max, Number(m[1])); }
  return `INV-${year}-${String(max + 1).padStart(4, '0')}`;
}
