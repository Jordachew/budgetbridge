import { useMemo, useState } from 'react';
import { Coins } from 'lucide-react';
import { Empty, Select } from '../../components/ui.jsx';
import { Bars, HBars } from '../../components/charts';
import { useRows } from '../../state/data.js';
import { useCurrency, useMoney } from '../../lib/hooks.js';
import { KINDS, kindLabel } from './status.js';

const MON = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const SLOT = Object.fromEntries(KINDS.map((k, i) => [k.id, i])); // a kind keeps its colour whatever the filter
const keyOf = (d) => `${d.getFullYear()}-${d.getMonth()}`;

export default function CostsTab() {
  const maintenance = useRows('maintenance');
  const vehicles = useRows('vehicles');
  const cur = useCurrency();
  const money = useMoney();
  const [vehicle, setVehicle] = useState('');
  const costed = useMemo(() => maintenance.filter((m) => m.currency === cur && m.cost_cents > 0), [maintenance, cur]);
  const rows = useMemo(() => costed.filter((m) => !vehicle || m.vehicle_id === vehicle), [costed, vehicle]);
  const other = maintenance.filter((m) => m.currency !== cur && m.cost_cents > 0).length;

  const months = useMemo(() => {
    const now = new Date(); const out = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: keyOf(d), label: MON.format(d), values: {} }); }
    for (const m of rows) { const b = out.find((x) => x.key === keyOf(new Date(m.done_at))); if (b) b.values[m.kind] = (b.values[m.kind] || 0) + m.cost_cents / 100; }
    return out;
  }, [rows]);
  const inWindow = months.reduce((a, b) => a + Object.values(b.values).reduce((x, y) => x + y, 0), 0);
  const kinds = KINDS.filter((k) => months.some((b) => b.values[k.id] > 0)).map((k) => ({ id: k.id, label: k.label, slot: SLOT[k.id] }));
  const kindTotals = KINDS.map((k) => ({ ...k, total: months.reduce((a, b) => a + (b.values[k.id] || 0), 0) })).sort((a, b) => b.total - a.total);
  const bestMonth = months.reduce((a, b) => { const t = Object.values(b.values).reduce((x, y) => x + y, 0); return t > a.t ? { label: b.label, t } : a; }, { label: '', t: 0 });
  const perVehicle = useMemo(() => {
    const m = new Map();
    for (const r of costed) { const k = r.vehicle_id || 'none'; m.set(k, (m.get(k) || 0) + r.cost_cents); }
    return [...m].map(([id, value]) => ({ id, value: value / 100, label: vehicles.find((v) => v.id === id)?.name || 'No vehicle' }));
  }, [costed, vehicles]);
  const total = rows.reduce((a, m) => a + m.cost_cents, 0);
  const repairs = rows.filter((m) => m.kind === 'repair').reduce((a, m) => a + m.cost_cents, 0);
  const fmt = (n) => money(Math.round(n * 100));
  const axis = (n) => (n >= 1000 ? `${Number((n / 1000).toFixed(1))}k` : String(Math.round(n)));

  if (!maintenance.some((m) => m.cost_cents > 0)) return <Empty icon={Coins} title="See what the truck costs you" text="Add a cost to your service records and this page shows spending by month, by type of work and by vehicle." />;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {vehicles.length > 1 ? <Select aria-label="Filter by vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="!w-auto"><option value="">All vehicles</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select> : <span />}
        <p className="text-xs text-ink-500">Service and repair costs in {cur}, last 12 months in the chart.</p>
      </div>
      <dl className="mb-5 grid grid-cols-3 divide-x divide-[var(--hairline)] overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]">
        <div className="p-4"><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">All time</dt><dd className="mt-1.5 text-xl font-bold leading-none sm:text-3xl">{money(total)}</dd></div>
        <div className="p-4"><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">Repairs</dt><dd className="mt-1.5 text-xl font-bold leading-none sm:text-3xl">{money(repairs)}</dd></div>
        <div className="p-4"><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">Last 12 months</dt><dd className="mt-1.5 text-xl font-bold leading-none sm:text-3xl">{fmt(inWindow)}</dd></div>
      </dl>
      {other > 0 && <p className="mb-4 text-xs text-ink-500">{other} record{other === 1 ? ' is' : 's are'} in another currency and not counted here.</p>}
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Bars data={months} series={kinds} stacked format={fmt} axisFormat={axis} title="Spending by month" subtitle="Stacked by type of work"
          summary={inWindow > 0 ? `You spent ${fmt(inWindow)} on service and repairs in the last 12 months.${bestMonth.t ? ` ${bestMonth.label} cost the most at ${fmt(bestMonth.t)}.` : ''} ${kindLabel(kindTotals[0].id)} was the biggest type at ${Math.round((kindTotals[0].total / inWindow) * 100)} percent.` : 'No service or repair costs in the last 12 months.'} />
        {perVehicle.length > 1 ? (
          <HBars items={perVehicle} format={fmt} title="Cost per vehicle" subtitle="All time" valueTitle="Spent"
            summary={`${[...perVehicle].sort((a, b) => b.value - a.value)[0].label} has cost the most at ${fmt([...perVehicle].sort((a, b) => b.value - a.value)[0].value)}, ${Math.round(([...perVehicle].sort((a, b) => b.value - a.value)[0].value / perVehicle.reduce((a, b) => a + b.value, 0)) * 100)} percent of the total.`} />
        ) : (
          <div className="paper-card p-5"><h3 className="font-display text-lg font-semibold">Cost per vehicle</h3><p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{perVehicle[0] ? `${perVehicle[0].label} is the only vehicle with costs so far: ${fmt(perVehicle[0].value)} in total.` : 'No costs yet.'} Add a second vehicle to compare.</p></div>
        )}
      </div>
    </div>
  );
}
