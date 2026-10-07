import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Printer } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import { fmtMoney } from '../../core/format.js';
import { invoiceTotals, lineCents } from './totals.js';
import { businessName, mailtoLink } from './summary.js';
import { daysBetween, fmtDay } from './helpers.js';

// Backgrounds and the dark header band must survive "Save as PDF".
const EXACT = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
const LABEL = 'text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500';

/** A4 invoice. Always light, so it prints and saves to PDF the same in dark mode. */
export default function InvoicePrint({ inv, profile }) {
  const t = invoiceTotals(inv);
  const m = (c) => fmtMoney(c, inv.currency);
  const terms = inv.due_date && inv.issue_date ? daysBetween(inv.issue_date, inv.due_date) : null;
  const termsText = terms == null ? '' : terms <= 0 ? 'Due on receipt' : `Net ${terms} days`;
  const biz = businessName(profile);
  const stamp = inv.status === 'paid' ? ['Paid', 'border-emerald-700 text-emerald-700'] : inv.status === 'void' ? ['Void', 'border-red-700 text-red-700'] : null;
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/invoices/${inv.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-ink-500 hover:text-ink-900 dark:hover:text-white"><ArrowLeft size={14} /> Back to {inv.number}</Link>
        <div className="flex gap-2">
          <Button variant="outline" icon={Mail} as="a" href={mailtoLink(inv, profile)}>Email</Button>
          <Button icon={Printer} onClick={() => window.print()}>Print or save as PDF</Button>
        </div>
      </div>

      <article className="print-area relative mx-auto flex w-full max-w-[210mm] flex-col overflow-hidden bg-white text-[13px] leading-snug text-ink-900 shadow-[0_1px_0_rgba(0,0,0,0.08),0_24px_48px_-24px_rgba(0,0,0,0.5)] print:min-h-[297mm] print:max-w-none print:shadow-none sm:min-h-[297mm]" style={EXACT} aria-label={`Invoice ${inv.number}`}>
        <header className="bg-ink-950 px-5 pb-7 pt-8 text-white sm:px-[14mm]" style={EXACT}>
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="min-w-0">
              <p className="font-display text-[28px] font-bold uppercase leading-none tracking-[0.06em]">{biz}</p>
              {profile.display_name && profile.truck_label && <p className="mt-1.5 text-[13px] text-ink-300">{profile.display_name}</p>}
            </div>
            <div className="text-right">
              <p className="font-display text-[44px] font-bold uppercase leading-none tracking-[0.12em] text-brand-400">Invoice</p>
              <p className="mt-1.5 text-sm font-bold tracking-wide">{inv.number}</p>
            </div>
          </div>
        </header>
        <div className="h-[5px] bg-brand-500" style={EXACT} aria-hidden />

        <div className="flex-1 px-5 py-8 sm:px-[14mm]">
          <section className="grid gap-8 sm:grid-cols-[1.2fr_1fr]">
            <div>
              <p className={LABEL}>Bill to</p>
              <p className="mt-1.5 text-base font-bold">{inv.customer}</p>
              {inv.customer_address && <p className="mt-0.5 whitespace-pre-line text-ink-700">{inv.customer_address}</p>}
              {inv.customer_email && <p className="mt-0.5 text-ink-700">{inv.customer_email}</p>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 self-start sm:justify-self-end">
              <dt className="text-ink-500">Invoice no.</dt><dd className="text-right font-bold">{inv.number}</dd>
              <dt className="text-ink-500">Issued</dt><dd className="text-right font-bold">{fmtDay(inv.issue_date)}</dd>
              {inv.due_date && <><dt className="text-ink-500">Due</dt><dd className="text-right font-bold">{fmtDay(inv.due_date)}</dd></>}
              {termsText && <><dt className="text-ink-500">Terms</dt><dd className="text-right">{termsText}</dd></>}
            </dl>
          </section>

          <table className="mt-9 w-full text-left">
            <thead>
              <tr className="border-b-2 border-ink-900 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-600">
                <th className="py-2 pr-3">Description</th><th className="w-12 px-2 py-2 text-right">Qty</th>
                <th className="hidden w-28 px-2 py-2 text-right sm:table-cell print:table-cell">Price each</th><th className="w-28 py-2 pl-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(inv.items || []).map((it, i) => (
                <tr key={i} className="break-inside-avoid border-b border-ink-200 align-top">
                  <td className="py-3 pr-3">{it.description}<span className="block text-xs text-ink-500 sm:hidden print:hidden">{m(it.unit_cents)} each</span></td>
                  <td className="px-2 py-3 text-right tabular-nums">{it.qty}</td>
                  <td className="hidden px-2 py-3 text-right tabular-nums sm:table-cell print:table-cell">{m(it.unit_cents)}</td>
                  <td className="py-3 pl-2 text-right font-bold tabular-nums">{m(lineCents(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex break-inside-avoid justify-end">
            <dl className="w-full max-w-[18rem] tabular-nums">
              <div className="flex justify-between py-1"><dt className="text-ink-600">Subtotal</dt><dd>{m(t.subtotal)}</dd></div>
              {t.discount > 0 && <div className="flex justify-between py-1"><dt className="text-ink-600">Discount</dt><dd>-{m(t.discount)}</dd></div>}
              {t.tax > 0 && <div className="flex justify-between py-1"><dt className="text-ink-600">Tax ({inv.tax_pct}%)</dt><dd>{m(t.tax)}</dd></div>}
              <div className="mt-1 flex justify-between border-t border-ink-900 py-1.5 font-bold"><dt>Total</dt><dd>{m(t.total)}</dd></div>
              {t.paid > 0 && <div className="flex justify-between py-1"><dt className="text-ink-600">Paid</dt><dd>-{m(t.paid)}</dd></div>}
              <div className="mt-1 flex items-baseline justify-between bg-brand-100 px-3 py-2.5" style={EXACT}><dt className="text-[11px] font-bold uppercase tracking-[0.14em]">Amount due</dt><dd className="text-xl font-bold">{m(t.balance)}</dd></div>
            </dl>
          </div>

          {inv.notes && (
            <section className="mt-9 break-inside-avoid border-l-[3px] border-brand-500 bg-ink-50 py-3 pl-4 pr-4" style={EXACT}>
              <p className={LABEL}>Payment details and notes</p>
              <p className="mt-1.5 whitespace-pre-line text-ink-800">{inv.notes}</p>
            </section>
          )}
        </div>

        {stamp && <span aria-hidden className={`pointer-events-none absolute right-[14mm] top-[62mm] -rotate-12 rounded-[6px] border-4 px-4 py-1 font-display text-4xl font-bold uppercase tracking-[0.2em] opacity-70 ${stamp[1]}`}>{stamp[0]}</span>}

        <footer className="mx-5 flex items-center justify-between gap-4 border-t border-ink-300 py-4 text-[11px] text-ink-500 sm:mx-[14mm]">
          <span>Thank you for your business.</span>
          <span>{biz} · {inv.number}</span>
        </footer>
      </article>
    </>
  );
}
