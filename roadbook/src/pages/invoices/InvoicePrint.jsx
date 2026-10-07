import { Printer } from 'lucide-react';
import { Button } from '../../components/ui.jsx';
import { fmtMoney, fmtDate } from '../../core/format.js';
import { invoiceTotals, lineCents } from './totals.js';
import { businessName } from './summary.js';

const d = (s) => (s ? fmtDate(`${s}T12:00:00`, { weekday: false, year: true }) : '');

/** A clean A4 invoice. Always light, so it prints and saves to PDF the same in dark mode. */
export default function InvoicePrint({ inv, profile }) {
  const t = invoiceTotals(inv);
  const m = (c) => fmtMoney(c, inv.currency);
  const email = (window.ROADBOOK_CONFIG || {}).supportEmail;
  return (
    <>
      <div className="no-print mb-4 flex justify-end"><Button icon={Printer} onClick={() => window.print()}>Print or save as PDF</Button></div>
      <article className="print-area mx-auto w-full max-w-[210mm] rounded-2xl bg-white p-4 text-ink-900 shadow-sm ring-1 ring-ink-200 sm:p-12 print:max-w-none print:p-0 print:shadow-none print:ring-0" aria-label={`Invoice ${inv.number}`}>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand-500 pb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{businessName(profile)}</h2>
            {profile.display_name && profile.truck_label && <p className="text-sm text-ink-600">{profile.display_name}</p>}
            {email && <p className="text-sm text-ink-600">{email}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold uppercase tracking-wide text-brand-600">Invoice</p>
            <p className="mt-1 text-sm font-semibold">{inv.number}</p>
            {inv.status === 'void' && <p className="mt-1 text-sm font-bold uppercase text-red-600">Void</p>}
            {inv.status === 'paid' && <p className="mt-1 text-sm font-bold uppercase text-emerald-600">Paid</p>}
          </div>
        </header>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Bill to</h3>
            <p className="mt-1 font-semibold">{inv.customer}</p>
            {inv.customer_address && <p className="whitespace-pre-line text-sm text-ink-700">{inv.customer_address}</p>}
            {inv.customer_email && <p className="text-sm text-ink-700">{inv.customer_email}</p>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm sm:justify-self-end">
            <dt className="text-ink-500">Issued</dt><dd className="text-right font-medium">{d(inv.issue_date)}</dd>
            {inv.due_date && <><dt className="text-ink-500">Due</dt><dd className="text-right font-medium">{d(inv.due_date)}</dd></>}
            <dt className="text-ink-500">Amount due</dt><dd className="text-right text-base font-bold">{m(t.balance)}</dd>
          </dl>
        </section>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-ink-300 text-xs uppercase tracking-wide text-ink-500">
              <th className="py-2 pr-3 font-semibold">Description</th><th className="px-3 py-2 text-right font-semibold">Qty</th><th className="hidden px-3 py-2 text-right font-semibold sm:table-cell print:table-cell">Unit price</th><th className="py-2 pl-3 text-right font-semibold">Amount</th>
            </tr></thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={i} className="border-b border-ink-100 align-top">
                  <td className="py-2.5 pr-3">{it.description}<span className="block text-xs text-ink-500 sm:hidden print:hidden">{m(it.unit_cents)} each</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{it.qty}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell print:table-cell">{m(it.unit_cents)}</td>
                  <td className="py-2.5 pl-3 text-right font-medium tabular-nums">{m(lineCents(it))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-6 max-w-xs space-y-1.5 text-sm tabular-nums">
          <div className="flex justify-between"><dt className="text-ink-600">Subtotal</dt><dd>{m(t.subtotal)}</dd></div>
          {t.discount > 0 && <div className="flex justify-between"><dt className="text-ink-600">Discount</dt><dd>-{m(t.discount)}</dd></div>}
          {t.tax > 0 && <div className="flex justify-between"><dt className="text-ink-600">Tax ({inv.tax_pct}%)</dt><dd>{m(t.tax)}</dd></div>}
          <div className="flex justify-between border-t border-ink-300 pt-2 text-lg font-bold"><dt>Total</dt><dd>{m(t.total)}</dd></div>
          {t.paid > 0 && <div className="flex justify-between"><dt className="text-ink-600">Paid</dt><dd>-{m(t.paid)}</dd></div>}
          {t.paid > 0 && <div className="flex justify-between font-bold"><dt>Balance due</dt><dd>{m(t.balance)}</dd></div>}
        </dl>

        {inv.notes && (
          <section className="mt-10 border-t border-ink-200 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Payment details and notes</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-ink-700">{inv.notes}</p>
          </section>
        )}
        <footer className="mt-10 text-center text-xs text-ink-500">Thank you for your business.</footer>
      </article>
    </>
  );
}
