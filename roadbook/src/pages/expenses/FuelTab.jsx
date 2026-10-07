import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Fuel } from 'lucide-react';
import { Card, CardTitle, Stat, Empty, Table } from '../../components/ui.jsx';
import { fuelEconomy, sumCents } from '../../core/calc.js';
import { fmtDate, fmtMoney } from '../../core/format.js';
import { CATEGORY_COLORS } from '../../lib/categories.js';
import { useMoney, useDistance } from '../../lib/hooks.js';

/** Fuel log for the fills in the chosen period. `rows` are fuel expenses in the working currency. */
export default function FuelTab({ rows, cur, onOpen, onAdd }) {
  const money = useMoney();
  const dist = useDistance();
  const fills = useMemo(() => {
    const asc = rows.filter((e) => e.category === 'fuel').sort((a, b) => new Date(a.spent_at) - new Date(b.spent_at));
    let prevOdo = null;
    return asc.map((e) => {
      const ppl = e.litres > 0 ? Math.round(e.amount_cents / e.litres) : null;
      const gap = e.odometer_m != null && prevOdo != null && e.odometer_m > prevOdo ? e.odometer_m - prevOdo : null;
      if (e.odometer_m != null) prevOdo = e.odometer_m;
      return { ...e, ppl, gap };
    });
  }, [rows]);
  const economy = useMemo(() => fuelEconomy(fills), [fills]);
  const litres = fills.reduce((a, f) => a + (f.litres || 0), 0);
  const withPpl = fills.filter((f) => f.ppl);
  const avgPpl = litres > 0 ? Math.round(sumCents(fills.filter((f) => f.litres > 0), cur) / fills.filter((f) => f.litres > 0).reduce((a, f) => a + f.litres, 0)) : null;
  const data = withPpl.map((f) => ({ t: fmtDate(f.spent_at, { weekday: false }), ppl: f.ppl / 100 }));

  if (!fills.length) {
    return <Empty icon={Fuel} title="No fuel fill-ups in this period" text="Add a fuel expense with litres and the odometer to see price per litre and your fuel economy." action={onAdd} />;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fuel economy" icon={Fuel} value={economy ? `${economy} L/100 km` : 'n/a'} sub={economy ? 'From fills with odometer readings' : 'Needs 2+ fills with odometer'} />
        <Stat label="Litres bought" value={`${Math.round(litres * 10) / 10} L`} sub={`${fills.length} fill-up${fills.length === 1 ? '' : 's'}`} />
        <Stat label="Average price" value={avgPpl ? `${money(avgPpl, cur)}/L` : 'n/a'} sub="Per litre, all fills" />
        <Stat label="Fuel spend" value={money(sumCents(fills, cur), cur)} />
      </div>
      {data.length >= 2 && (
        <Card>
          <CardTitle title="Price per litre" sub={`Cheapest ${fmtMoney(Math.min(...withPpl.map((f) => f.ppl)), cur)} · dearest ${fmtMoney(Math.max(...withPpl.map((f) => f.ppl)), cur)}`} />
          <div role="img" aria-label={`Line chart of fuel price per litre across ${data.length} fill-ups, from ${data[0].ppl} to ${data.at(-1).ppl}. The table below has the same numbers.`} className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={48} stroke="currentColor" opacity={0.6} />
                <Tooltip formatter={(v) => [fmtMoney(Math.round(v * 100), cur), 'Per litre']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Line type="monotone" dataKey="ppl" stroke={CATEGORY_COLORS.fuel} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      <Table rows={[...fills].reverse()} onRow={onOpen}
        columns={[
          { key: 'd', label: 'Date', render: (f) => <span className="whitespace-nowrap">{fmtDate(f.spent_at)}</span> },
          { key: 'v', label: 'Station', hide: true, render: (f) => f.vendor || '-' },
          { key: 'l', label: 'Litres', right: true, render: (f) => (f.litres ? `${f.litres} L` : '-') },
          { key: 'a', label: 'Cost', right: true, render: (f) => money(f.amount_cents, f.currency) },
          { key: 'p', label: 'Per litre', right: true, render: (f) => (f.ppl ? money(f.ppl, f.currency) : '-') },
          { key: 'o', label: 'Odometer', right: true, hide: true, render: (f) => (f.odometer_m != null ? dist(f.odometer_m) : '-') },
          { key: 'g', label: 'Since last fill', right: true, render: (f) => (f.gap ? dist(f.gap) : '-') },
        ]} />
    </div>
  );
}
