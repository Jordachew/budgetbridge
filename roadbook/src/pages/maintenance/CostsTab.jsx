import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Coins } from 'lucide-react';
import { Card, CardTitle, Empty, Stat, Select } from '../../components/ui.jsx';
import { useRows } from '../../state/data.js';
import { useCurrency, useMoney } from '../../lib/hooks.js';

const COLORS = { service: '#f97316', repair: '#0ea5e9' };
const monthKey = (iso) => String(iso).slice(0, 7);
const monthLabel = (k) => new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' }).format(new Date(`${k}-15T12:00:00`));

export default function CostsTab() {
  const maintenance = useRows('maintenance');
  const vehicles = useRows('vehicles');
  const cur = useCurrency();
  const money = useMoney();
  const [vehicle, setVehicle] = useState('');
  const rows = useMemo(() => maintenance.filter((m) => m.currency === cur && m.cost_cents > 0 && (!vehicle || m.vehicle_id === vehicle)), [maintenance, cur, vehicle]);
  const other = maintenance.filter((m) => m.currency !== cur && m.cost_cents > 0).length;

  const byMonth = useMemo(() => {
    const now = new Date(); const out = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, service: 0, repair: 0 }); }
    for (const m of rows) { const b = out.find((x) => x.key === monthKey(new Date(m.done_at).toISOString())); if (b) b[m.kind === 'repair' ? 'repair' : 'service'] += m.cost_cents / 100; }
    return out.map((b) => ({ ...b, label: monthLabel(b.key) }));
  }, [rows]);
  const byVehicle = useMemo(() => {
    const m = new Map();
    for (const r of maintenance.filter((x) => x.currency === cur && x.cost_cents > 0)) { const k = r.vehicle_id || 'none'; const e = m.get(k) || { name: vehicles.find((v) => v.id === k)?.name || 'No vehicle', service: 0, repair: 0 }; e[r.kind === 'repair' ? 'repair' : 'service'] += r.cost_cents / 100; m.set(k, e); }
    return [...m.values()].sort((a, b) => b.service + b.repair - (a.service + a.repair));
  }, [maintenance, vehicles, cur]);

  const total = rows.reduce((a, m) => a + m.cost_cents, 0);
  const repair = rows.filter((m) => m.kind === 'repair').reduce((a, m) => a + m.cost_cents, 0);
  const last12 = byMonth.reduce((a, b) => a + b.service + b.repair, 0);
  const axis = { fontSize: 12, fill: '#94a3b8' };
  const tip = (v) => money(Math.round(v * 100));

  if (!maintenance.some((m) => m.cost_cents > 0)) return <Empty icon={Coins} title="No costs recorded" text="Add a cost to your service records and your spending charts will appear here." />;

  return (
    <div className="space-y-4">
      {vehicles.length > 0 && <Select aria-label="Filter by vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="!w-auto"><option value="">All vehicles</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total spent" value={money(total)} />
        <Stat label="Repairs" value={money(repair)} />
        <Stat label="Last 12 months" value={money(Math.round(last12 * 100))} />
      </div>
      {other > 0 && <p className="text-xs text-ink-500">{other} record{other === 1 ? ' is' : 's are'} in another currency and not counted here.</p>}
      <Card>
        <CardTitle title="Spending by month" sub="Maintenance and repairs, last 12 months" />
        <div role="img" aria-label={`Bar chart of maintenance and repair spending by month. Total for the last 12 months: ${money(Math.round(last12 * 100))}.`} className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byMonth} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
              <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip formatter={tip} contentStyle={{ borderRadius: 12 }} />
              <Legend />
              <Bar dataKey="service" name="Maintenance" stackId="a" fill={COLORS.service} />
              <Bar dataKey="repair" name="Repairs" stackId="a" fill={COLORS.repair} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <CardTitle title="Spending by vehicle" sub="All time" />
        <div role="img" aria-label={`Spending by vehicle: ${byVehicle.map((v) => `${v.name} ${money(Math.round((v.service + v.repair) * 100))}`).join(', ')}.`} style={{ height: Math.max(140, byVehicle.length * 56 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byVehicle} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" horizontal={false} />
              <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={90} />
              <Tooltip formatter={tip} contentStyle={{ borderRadius: 12 }} />
              <Legend />
              <Bar dataKey="service" name="Maintenance" stackId="a" fill={COLORS.service} />
              <Bar dataKey="repair" name="Repairs" stackId="a" fill={COLORS.repair} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only"><caption>Spending by vehicle</caption><tbody>{byVehicle.map((v) => <tr key={v.name}><th>{v.name}</th><td>{money(Math.round((v.service + v.repair) * 100))}</td></tr>)}</tbody></table>
      </Card>
    </div>
  );
}
