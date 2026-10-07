// Settle-up as a statement: who owes whom in a plain sentence, a ruled ledger, and what to do about it.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Printer, Scale } from 'lucide-react';
import { useMoney } from '../../lib/hooks.js';
import { Banner, Button, Empty, Plate } from '../../components/ui.jsx';
import { loadFinance, otherCurrencyCount, settleUp, within } from '../../core/calc.js';
import { fmtDate, plural } from '../../core/format.js';
import { catLabel } from '../dashboard/helpers.js';
import { loadLabel } from './kinds.js';

const RULE = 'border-ink-900 dark:border-ink-200 print:border-black';

export default function SettleTab({ income, expenses, loads, cur, range, period, title }) {
  const money = useMoney();
  const inc = useMemo(() => within(income, 'received_at', range), [income, period.kind, period.offset]);
  const exp = useMemo(() => within(expenses, 'spent_at', range), [expenses, period.kind, period.offset]);
  const s = settleUp(exp, inc, cur);
  const mixed = otherCurrencyCount(inc, cur) + otherCurrencyCount(exp, cur);
  const mine = exp.filter((e) => e.paid_by === 'driver' && e.currency === cur).sort((a, b) => new Date(a.spent_at) - new Date(b.spent_at));
  const adv = inc.filter((i) => i.kind === 'advance' && i.currency === cur).sort((a, b) => new Date(a.received_at) - new Date(b.received_at));
  const perLoad = loads.map((l) => ({ l, ...settleUp(exp.filter((e) => e.load_id === l.id), inc.filter((i) => i.load_id === l.id), cur), fin: loadFinance(l.id, exp, inc, cur) }))
    .filter((r) => r.driverPaid || r.advances || r.pay || r.companyPaid);
  const loose = settleUp(exp.filter((e) => !e.load_id), inc.filter((i) => !i.load_id), cur);
  const hasLoose = loose.driverPaid || loose.advances;

  if (!inc.length && !exp.length) return <Empty icon={Scale} title="Nothing to settle in this period" text="Add expenses you paid yourself and any advances. Roadbook works out who owes whom and writes you a statement." action={<Button as={Link} to="/expenses?new=1">Add an expense</Button>} />;

  const owed = s.due;
  const sentence = owed > 0 ? `The company owes you ${money(owed)}.` : owed < 0 ? `You are holding ${money(-owed)} of the company's cash.` : 'You are all square. Nobody owes anybody.';
  const explain = owed > 0
    ? `You paid ${money(s.driverPaid)} out of your own pocket across ${plural(mine.length, 'expense')}, and the company advanced you ${money(s.advances)}. The difference is yours to collect.`
    : owed < 0
      ? `The company advanced you ${money(s.advances)} but you only spent ${money(s.driverPaid)} of your own money, so ${money(-owed)} of their cash is still with you.`
      : `The ${money(s.advances)} advanced to you matches the ${money(s.driverPaid)} you spent.`;
  const todo = owed > 0
    ? <>Ask the company to pay you <strong>{money(owed)}</strong>. Print this statement and keep your {plural(mine.length, 'receipt')} ready to show them.</>
    : owed < 0
      ? <>Hand <strong>{money(-owed)}</strong> back to the company, or ask to carry it forward against your next trip.</>
      : <>Nothing to do. Add new expenses and advances as they happen and this statement stays up to date.</>;
  const lines = [
    ...mine.map((e) => ({ id: e.id, at: e.spent_at, what: `${e.vendor || catLabel(e.category)}${e.vendor ? ` · ${catLabel(e.category)}` : ''}`, cents: e.amount_cents, sign: 1 })),
    ...adv.map((i) => ({ id: i.id, at: i.received_at, what: `Advance${i.note ? ` · ${i.note}` : ''}`, cents: i.amount_cents, sign: -1 })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return (
    <div className="space-y-8">
      {mixed > 0 && <Banner tone="blue">Settle-up uses {cur} only. {plural(mixed, 'entry', 'entries')} in the other currency {mixed === 1 ? 'is' : 'are'} left out.</Banner>}

      <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
        <section className="paper-card p-5 sm:p-7 print:border-0 print:p-0" aria-labelledby="st-h">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-500 print:text-black">Settle-up statement · {title} · {cur}</p>
          <h2 id="st-h" className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{sentence}</h2>
          <p className="mt-2 max-w-xl text-sm text-ink-600 dark:text-ink-300 print:text-black">{explain}</p>

          <table className="mt-6 w-full text-sm">
            <caption className="sr-only">Settle-up statement</caption>
            <tbody>
              <tr className="border-b border-[var(--hairline)]"><th scope="row" className="py-2.5 text-left font-normal">Paid by you out of pocket <span className="text-ink-500 print:text-black">({plural(mine.length, 'expense')})</span></th><td className="py-2.5 text-right tabular-nums">{money(s.driverPaid)}</td></tr>
              <tr className="border-b border-[var(--hairline)]"><th scope="row" className="py-2.5 text-left font-normal">Less: advances you received <span className="text-ink-500 print:text-black">({plural(adv.length, 'advance')})</span></th><td className="py-2.5 text-right tabular-nums">-{money(s.advances)}</td></tr>
              <tr className={`border-y-4 border-double text-base font-bold ${RULE}`}><th scope="row" className="py-3 text-left">{owed >= 0 ? 'Company owes you' : 'You owe the company'}</th><td className="py-3 text-right tabular-nums">{money(Math.abs(owed))}</td></tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-ink-500 print:text-black">For information, not counted above: {money(s.companyPaid)} paid directly by the company, {money(s.pay)} pay and {money(s.other)} other income.</p>

          <div className="mt-6 border-l-4 border-brand-500 bg-brand-50 px-4 py-3 text-sm dark:bg-brand-500/10 print:border-black print:bg-white">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300 print:text-black">What to do</div>
            <p className="mt-1 text-base">{todo}</p>
            <div className="no-print mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="dark" icon={Printer} onClick={() => window.print()}>Print statement</Button>
              {owed !== 0 && <Button as={Link} to="/expenses?new=1" size="sm" variant="outline">Missing an expense?</Button>}
            </div>
          </div>
        </section>

        <section className="print:break-before-page" aria-labelledby="lines-h">
          <h2 id="lines-h" className="mb-3 font-display text-2xl font-semibold leading-none">What this is made of</h2>
          {lines.length === 0 ? <p className="text-sm text-ink-500">No expenses you paid and no advances in this period.</p> : (
            <div className="paper-card overflow-hidden print:border-0">
              <table className="w-full text-sm">
                <caption className="sr-only">Every line in the statement</caption>
                <thead><tr className="border-b-2 border-ink-900 bg-ink-50 text-xs uppercase tracking-wide text-ink-500 dark:border-ink-200 dark:bg-ink-800/50 print:border-black print:bg-white print:text-black"><th scope="col" className="px-4 py-2 text-left">Date</th><th scope="col" className="py-2 text-left">What</th><th scope="col" className="px-4 py-2 text-right">Amount</th></tr></thead>
                <tbody>{lines.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--hairline)]">
                    <td className="whitespace-nowrap px-4 py-2 text-ink-500 print:text-black">{fmtDate(l.at, { weekday: false })}</td>
                    <td className="py-2">{l.what}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{l.sign < 0 ? '-' : ''}{money(l.cents)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="byload-h">
        <h2 id="byload-h" className="mb-1 font-display text-2xl font-semibold leading-none">By load</h2>
        <p className="mb-3 text-sm text-ink-500 print:text-black">Balance is paid by you minus advances. Plus means the company owes you; minus means you hold extra cash.</p>
        {perLoad.length === 0 && !hasLoose ? (
          <p className="text-sm text-ink-600 dark:text-ink-300">Expenses and advances are not linked to a load yet. Link them to see the balance load by load. <Link to="/expenses" className="inline-flex items-center gap-1 font-bold text-brand-600 dark:text-brand-400">Open expenses <ArrowRight size={13} aria-hidden="true" /></Link></p>
        ) : (
          <div className="paper-card overflow-x-auto p-4 sm:p-6 print:border-0 print:p-0">
            <table className="w-full min-w-[20rem] text-sm">
              <caption className="sr-only">Balance by load</caption>
              <thead><tr className="border-b-2 border-ink-900 text-xs uppercase tracking-wide text-ink-500 dark:border-ink-200 print:border-black print:text-black"><th scope="col" className="pb-2 text-left">Load</th><th scope="col" className="pb-2 text-right">Paid by you</th><th scope="col" className="pb-2 text-right">Advances</th><th scope="col" className="pb-2 text-right">Balance</th></tr></thead>
              <tbody>
                {perLoad.map((r) => <tr key={r.l.id} className="border-b border-[var(--hairline)]"><th scope="row" className="py-2.5 pr-3 text-left font-normal">{r.l.reference ? <Plate className="mr-1.5">{r.l.reference}</Plate> : null}<span className="font-bold">{r.l.customer || (r.l.reference ? '' : loadLabel(r.l))}</span></th><td className="py-2.5 text-right tabular-nums">{money(r.driverPaid)}</td><td className="py-2.5 text-right tabular-nums">{money(r.advances)}</td><td className="whitespace-nowrap py-2.5 text-right font-bold tabular-nums">{money(r.due)}</td></tr>)}
                {hasLoose ? <tr className="border-b border-[var(--hairline)]"><th scope="row" className="py-2.5 text-left font-normal text-ink-500 print:text-black">Not linked to a load</th><td className="py-2.5 text-right tabular-nums">{money(loose.driverPaid)}</td><td className="py-2.5 text-right tabular-nums">{money(loose.advances)}</td><td className="py-2.5 text-right font-bold tabular-nums">{money(loose.due)}</td></tr> : null}
              </tbody>
              <tfoot><tr className={`border-t-2 font-bold ${RULE}`}><th scope="row" className="py-2.5 text-left">Total</th><td className="py-2.5 text-right tabular-nums">{money(s.driverPaid)}</td><td className="py-2.5 text-right tabular-nums">{money(s.advances)}</td><td className="py-2.5 text-right tabular-nums">{money(owed)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
