// Recharts building blocks used by the Dashboard and Reports.
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMoney } from '../../lib/hooks.js';
import { CATEGORY_COLORS } from '../../lib/categories.js';
import { CATEGORIES } from '../../core/receipt.js';
import { fmtMoney } from '../../core/format.js';

export const REVENUE_COLOR = '#10b981';
export const EXPENSE_COLOR = '#f97316';
export const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || (id ? id[0].toUpperCase() + id.slice(1) : 'Other');

const compact = (cents, cur) => {
  const n = Math.abs(cents) / 100;
  const sym = cur === 'USD' ? 'US$' : 'J$';
  const sign = cents < 0 ? '-' : '';
  if (n >= 1e6) return `${sign}${sym}${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${sign}${sym}${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return `${sign}${sym}${Math.round(n)}`;
};

function Tip({ active, payload, label, cur }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-ink-200 dark:bg-ink-800 dark:ring-ink-700">
      {label && <div className="mb-1 font-semibold text-ink-900 dark:text-white">{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} className="flex items-center gap-2 text-ink-600 dark:text-ink-200">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}</span><span className="ml-auto pl-3 font-semibold tabular-nums">{fmtMoney(p.value, cur)}</span>
        </div>
      ))}
    </div>
  );
}

/** Revenue vs expenses grouped bars. */
export function TrendChart({ data, cur, summary, height = 240 }) {
  return (
    <div role="img" aria-label={summary} style={{ height }} className="w-full text-ink-500">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.15} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: 'currentColor', fontSize: 11 }} tickFormatter={(v) => compact(v, cur)} />
          <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.08 }} content={<Tip cur={cur} />} />
          <Bar dataKey="revenue" name="Revenue" fill={REVENUE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="expenses" name="Expenses" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLegend() {
  return (
    <div className="flex gap-4 text-xs text-ink-500">
      <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: REVENUE_COLOR }} />Revenue</span>
      <span className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: EXPENSE_COLOR }} />Expenses</span>
    </div>
  );
}

/** Donut by category, with a legend table beside it. cats = calc.byCategory() output. */
export function CategoryDonut({ cats, cur, total }) {
  const money = useMoney();
  const summary = `Expenses by category, total ${money(total, cur)}. ${cats.map((c) => `${catLabel(c.id)} ${money(c.cents, cur)} (${Math.round(c.share * 100)}%)`).join(', ')}.`;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div role="img" aria-label={summary} className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={cats} dataKey="cents" nameKey="id" innerRadius="62%" outerRadius="100%" paddingAngle={cats.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {cats.map((c) => <Cell key={c.id} fill={CATEGORY_COLORS[c.id] || '#94a3b8'} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-ink-500">Total</span>
          <span className="text-sm font-bold tabular-nums">{money(total, cur)}</span>
        </div>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Expenses by category</caption>
        <tbody>
          {cats.map((c) => (
            <tr key={c.id}>
              <td className="py-1.5 pr-2"><span className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[c.id] || '#94a3b8' }} />{catLabel(c.id)}</span></td>
              <td className="py-1.5 text-right tabular-nums text-ink-500">{Math.round(c.share * 100)}%</td>
              <td className="py-1.5 pl-3 text-right font-medium tabular-nums">{money(c.cents, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
