import { fmtMoney, fmtDate } from '../../core/format.js';
import { invoiceTotals, lineCents } from './totals.js';

const d = (s) => (s ? fmtDate(`${s}T12:00:00`, { weekday: false, year: true }) : '');
export const businessName = (profile) => profile.truck_label || profile.display_name || 'Roadbook';

/** Plain-text version of an invoice, for email bodies, the clipboard and the share sheet. */
export function invoiceText(inv, profile) {
  const t = invoiceTotals(inv);
  const m = (c) => fmtMoney(c, inv.currency);
  const lines = [
    `Invoice ${inv.number} from ${businessName(profile)}`,
    `To: ${inv.customer}`,
    `Issued: ${d(inv.issue_date)}${inv.due_date ? `   Due: ${d(inv.due_date)}` : ''}`,
    '',
    ...(inv.items || []).map((i) => `- ${i.description} (${i.qty} x ${m(i.unit_cents)}) = ${m(lineCents(i))}`),
    '',
    ...(t.discount ? [`Discount: -${m(t.discount)}`] : []),
    ...(t.tax ? [`Tax (${inv.tax_pct}%): ${m(t.tax)}`] : []),
    `Total: ${m(t.total)}`,
    ...(t.paid ? [`Paid: ${m(t.paid)}`, `Balance due: ${m(t.balance)}`] : []),
    ...(inv.notes ? ['', inv.notes] : []),
  ];
  return lines.join('\n');
}

export const mailtoLink = (inv, profile) =>
  `mailto:${encodeURIComponent(inv.customer_email || '').replace(/%40/g, '@')}?subject=${encodeURIComponent(`Invoice ${inv.number} from ${businessName(profile)}`)}&body=${encodeURIComponent(invoiceText(inv, profile))}`;
