// Profit and loss as an accounting ledger: ruled lines, right-aligned tabular figures, subtotals and a double-ruled result.
import { cx } from '../../components/ui.jsx';

const RULE = 'border-ink-900 dark:border-ink-200 print:border-black';

function Section({ title, rows, total, share, hasPrev, money }) {
  return (
    <>
      <tr><th scope="colgroup" colSpan={4} className="pb-1 pt-5 text-left text-xs font-bold uppercase tracking-[0.14em] text-ink-500 print:text-black">{title}</th></tr>
      {rows.length === 0 && <tr><td colSpan={4} className="border-b border-[var(--hairline)] py-2 pl-4 text-ink-500">None recorded</td></tr>}
      {rows.map((r) => (
        <tr key={r.id} className="border-b border-[var(--hairline)]">
          <th scope="row" className="py-2 pl-4 text-left font-normal">{r.label}</th>
          <td className="hidden py-2 text-right text-ink-500 tabular-nums print:text-black sm:table-cell">{share(r.cents)}</td>
          <td className="py-2 text-right tabular-nums">{money(r.cents)}</td>
          {hasPrev && <td className="hidden py-2 text-right tabular-nums text-ink-500 print:text-black md:table-cell">{money(r.prev)}</td>}
        </tr>
      ))}
      <tr className={cx('border-t font-bold', RULE)}>
        <th scope="row" className="py-2 text-left">{total.label}</th>
        <td className="hidden py-2 text-right tabular-nums sm:table-cell">{share(total.cents)}</td>
        <td className="py-2 text-right tabular-nums">{money(total.cents)}</td>
        {hasPrev && <td className="hidden py-2 text-right tabular-nums md:table-cell">{money(total.prev)}</td>}
      </tr>
    </>
  );
}

export default function Ledger({ title, income, expenses, net, margin, hasPrev, prevLabel, money }) {
  const share = (c) => (income.total.cents > 0 ? `${Math.round((c / income.total.cents) * 100)}%` : '');
  const loss = net.cents < 0;
  return (
    <div className="print-area overflow-x-auto">
      <table className="w-full min-w-[19rem] text-sm">
        <caption className="sr-only">Profit and loss, {title}</caption>
        <thead>
          <tr className="border-b-2 border-ink-900 text-xs font-bold uppercase tracking-wide text-ink-500 dark:border-ink-200 print:border-black print:text-black">
            <th scope="col" className="pb-2 text-left">Item</th>
            <th scope="col" className="hidden pb-2 text-right sm:table-cell">% of revenue</th>
            <th scope="col" className="pb-2 text-right">{title}</th>
            {hasPrev && <th scope="col" className="hidden pb-2 text-right md:table-cell">{prevLabel}</th>}
          </tr>
        </thead>
        <tbody>
          <Section title="Revenue" rows={income.rows} total={income.total} share={share} hasPrev={hasPrev} money={money} />
          <Section title="Expenses" rows={expenses.rows} total={expenses.total} share={share} hasPrev={hasPrev} money={money} />
          <tr className={cx('border-y-4 border-double text-base font-bold', RULE)}>
            <th scope="row" className="py-3 text-left">{loss ? 'Net loss' : 'Net profit'}</th>
            <td className="hidden py-3 text-right tabular-nums sm:table-cell">{margin == null ? '' : `${margin}%`}</td>
            <td className="py-3 text-right tabular-nums">{money(net.cents)}</td>
            {hasPrev && <td className="hidden py-3 text-right tabular-nums md:table-cell">{money(net.prev)}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
