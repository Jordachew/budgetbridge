// Per-load profitability: sortable ledger with a margin meter.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, TrendingDown } from 'lucide-react';
import { Badge, Meter, cx } from '../../components/ui.jsx';
import { STATUS } from '../loads/shared.js';

function Head({ col, sort, setSort, children, right, hide }) {
  const on = sort.key === col;
  return (
    <th scope="col" className={cx('pb-2 font-bold', right && 'text-right', hide)} aria-sort={on ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort({ key: col, dir: on ? -sort.dir : -1 })} className={cx('inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink-900 dark:hover:text-white', right && 'flex-row-reverse')}>
        {children}{on ? (sort.dir > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />) : <span className="w-3" />}
      </button>
    </th>
  );
}

export default function LoadTable({ rows, totals, money }) {
  const [sort, setSort] = useState({ key: 'net', dir: -1 });
  const val = (r) => (sort.key === 'margin' ? (r.margin ?? -Infinity) : r[sort.key]);
  const sorted = [...rows].sort((a, b) => (typeof val(a) === 'string' ? val(a).localeCompare(val(b)) * -sort.dir : (val(a) - val(b)) * sort.dir));
  const totalMargin = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : null;
  return (
    <div className="print-area overflow-x-auto">
      <table className="w-full min-w-[20rem] text-sm">
        <caption className="sr-only">Profit per load. Column headings sort the table.</caption>
        <thead>
          <tr className="border-b-2 border-ink-900 text-xs text-ink-500 dark:border-ink-200 print:border-black print:text-black">
            <Head col="name" sort={sort} setSort={setSort}>Load</Head>
            <Head col="rate" sort={sort} setSort={setSort} right hide="hidden lg:table-cell">Rate</Head>
            <Head col="income" sort={sort} setSort={setSort} right hide="hidden sm:table-cell">Income</Head>
            <Head col="expenses" sort={sort} setSort={setSort} right hide="hidden sm:table-cell">Expenses</Head>
            <Head col="net" sort={sort} setSort={setSort} right>Net</Head>
            <Head col="margin" sort={sort} setSort={setSort} right>Margin</Head>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const st = STATUS[r.status];
            const m = r.margin;
            return (
              <tr key={r.id} className="border-b border-[var(--hairline)]">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <Link to={`/loads/${r.id}`} className="font-bold hover:underline print:no-underline">{r.name}</Link>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-500 print:text-black">{r.ref && r.ref !== r.name && <span>{r.ref}</span>}{st && <Badge tone={st.tone} className="no-print !py-0 !text-[10px]">{st.label}</Badge>}</div>
                </th>
                <td className="hidden py-2.5 text-right tabular-nums text-ink-500 print:text-black lg:table-cell">{r.rate ? money(r.rate) : '-'}</td>
                <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{money(r.income)}</td>
                <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{money(r.expenses)}</td>
                <td className="py-2.5 text-right font-bold tabular-nums">{money(r.net)}</td>
                <td className="py-2.5 pl-3 text-right">
                  {m == null ? <span className="text-ink-500 print:text-black">No income</span> : (
                    <div className="ml-auto flex w-24 flex-col items-end gap-1 sm:w-28">
                      <span className="inline-flex items-center gap-1 font-bold tabular-nums">{m < 0 && <TrendingDown size={13} aria-hidden="true" />}{m}%{m < 0 && <span className="sr-only"> (a loss)</span>}</span>
                      <div className="w-full print:hidden"><Meter value={Math.max(0, m) / 100} max={1} warnAt={2} badAt={2} label={`Margin ${m} percent`} /></div>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink-900 font-bold dark:border-ink-200 print:border-black">
            <th scope="row" className="py-2.5 text-left">Total, {rows.length} {rows.length === 1 ? 'load' : 'loads'}</th>
            <td className="hidden lg:table-cell" />
            <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{money(totals.income)}</td>
            <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{money(totals.expenses)}</td>
            <td className="py-2.5 text-right tabular-nums">{money(totals.net)}</td>
            <td className="py-2.5 text-right tabular-nums">{totalMargin == null ? '' : `${totalMargin}%`}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
