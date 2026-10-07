import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Truck, Gauge, Wrench, FileWarning, Coins } from 'lucide-react';
import { Card, Button, Empty, IconButton, Badge, useConfirm } from '../../components/ui.jsx';
import { useRows, remove } from '../../state/data.js';
import { sumDistance } from '../../core/calc.js';
import { fmtDate, fmtMoney } from '../../core/format.js';
import { useDistance, useCurrency } from '../../lib/hooks.js';
import { usePrefs } from '../../state/prefs.js';
import { useToast } from '../../components/toast.jsx';
import VehicleForm from './VehicleForm.jsx';
import { useOdometerData, vehicleOdometer } from './odo.js';
import { maintStatus, docStatus } from './status.js';

export default function VehiclesTab() {
  const data = useOdometerData();
  const docs = useRows('documents');
  const dist = useDistance();
  const cur = useCurrency();
  const { unit } = usePrefs();
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [form, setForm] = useState(null);

  const cards = useMemo(() => data.vehicles.map((v) => {
    const odo = vehicleOdometer(v, data);
    const recs = data.maintenance.filter((m) => m.vehicle_id === v.id);
    const upcoming = recs.map((m) => ({ m, st: maintStatus(m, odo, data.maintenance) })).filter((x) => x.st === 'overdue' || x.st === 'soon' || x.st === 'ok')
      .sort((a, b) => (a.m.next_due_at || '9').localeCompare(b.m.next_due_at || '9'))[0];
    const expiring = docs.filter((d) => d.vehicle_id === v.id && ['expired', 'soon'].includes(docStatus(d).key));
    const cost = recs.filter((m) => m.currency === cur).reduce((a, m) => a + m.cost_cents, 0)
      + data.expenses.filter((e) => e.vehicle_id === v.id && e.currency === cur).reduce((a, e) => a + e.amount_cents, 0);
    const km = sumDistance(data.trips.filter((t) => t.vehicle_id === v.id));
    return { v, odo, upcoming, expiring, cost, km };
  }).sort((a, b) => a.v.name.localeCompare(b.v.name)), [data, docs, cur]);

  async function del(v) {
    if (!(await confirm({ title: `Delete ${v.name}?`, text: 'The vehicle is removed. Its service records and documents stay, but will no longer be linked to a vehicle name.', danger: true, confirmLabel: 'Delete vehicle' }))) return;
    await remove('vehicles', v.id); toast('Vehicle deleted.');
  }
  const perDist = (c) => (c.km > 0 && c.cost > 0 ? `${fmtMoney(Math.round(c.cost / (c.km / 1000 / (unit === 'mi' ? 1.609344 : 1))), cur)} per ${unit}` : 'Not enough data');

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button icon={Plus} onClick={() => setForm({})}>Add vehicle</Button></div>
      {cards.length === 0 ? (
        <Empty icon={Truck} title="No vehicles yet" text="Add your truck to track its odometer, services, documents and running costs." action={<Button icon={Plus} onClick={() => setForm({})}>Add your first vehicle</Button>} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {cards.map(({ v, odo, upcoming, expiring, cost, km }) => (
            <li key={v.id}>
              <Card className="h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-700/20"><Truck size={22} /></span>
                    <div className="min-w-0"><h3 className="truncate text-base font-semibold">{v.name}</h3>
                      <p className="truncate text-xs text-ink-500">{[v.plate, [v.year, v.make, v.model].filter(Boolean).join(' '), v.fuel_type].filter(Boolean).join(' - ')}</p></div>
                  </div>
                  <div className="flex shrink-0"><IconButton icon={Pencil} label={`Edit ${v.name}`} onClick={() => setForm(v)} /><IconButton icon={Trash2} label={`Delete ${v.name}`} onClick={() => del(v)} /></div>
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <Row icon={Gauge} label="Odometer" value={odo != null ? dist(odo) : 'Not set'} />
                  <Row icon={Wrench} label="Next service" value={upcoming ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">{upcoming.m.title}{upcoming.m.next_due_at ? ` - ${fmtDate(upcoming.m.next_due_at, { year: true })}` : upcoming.m.next_due_odometer_m != null ? ` - at ${dist(upcoming.m.next_due_odometer_m)}` : ''}
                      <Badge tone={upcoming.st === 'overdue' ? 'red' : upcoming.st === 'soon' ? 'amber' : 'green'}>{upcoming.st === 'overdue' ? 'Overdue' : upcoming.st === 'soon' ? 'Due soon' : 'OK'}</Badge></span>) : 'Nothing scheduled'} />
                  <Row icon={FileWarning} label="Documents" value={expiring.length ? <Badge tone={expiring.some((d) => docStatus(d).key === 'expired') ? 'red' : 'amber'}>{expiring.length} need attention</Badge> : 'All up to date'} />
                  <Row icon={Coins} label="Cost per distance" value={perDist({ cost, km })} />
                </dl>
                {cost > 0 && <p className="mt-3 text-xs text-ink-500">Total spent on this vehicle: {fmtMoney(cost, cur)}{km ? ` over ${dist(km)} of trips` : ''}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {form && <VehicleForm key={form.id || 'new'} open vehicle={form.id ? form : null} onClose={() => setForm(null)} />}
      {node}
    </div>
  );
}

const Row = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2 rounded-lg bg-ink-50 p-2.5 dark:bg-ink-800/60">
    <Icon size={16} className="mt-0.5 shrink-0 text-ink-400" />
    <div className="min-w-0"><dt className="text-xs text-ink-500">{label}</dt><dd className="font-medium">{value}</dd></div>
  </div>
);
