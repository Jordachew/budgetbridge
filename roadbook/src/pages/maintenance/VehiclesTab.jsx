import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Truck, Wrench, FileWarning, ShieldCheck, Coins, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { Button, Empty, IconButton, Plate, Meter, Badge } from '../../components/ui.jsx';
import { useRows } from '../../state/data.js';
import { sumDistance } from '../../core/calc.js';
import { fmtMoney } from '../../core/format.js';
import { useDistance, useCurrency } from '../../lib/hooks.js';
import { usePrefs } from '../../state/prefs.js';
import { useToast } from '../../components/toast.jsx';
import { softDelete } from '../../lib/undo.js';
import Odometer from '../trips/Odometer.jsx';
import VehicleForm from './VehicleForm.jsx';
import { useOdometerData, vehicleOdometer } from './odo.js';
import { maintStatus, docStatus } from './status.js';
import { serviceProgress } from './progress.js';

const Label = ({ children }) => <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">{children}</div>;

export default function VehiclesTab({ openSignal }) {
  const data = useOdometerData();
  const docs = useRows('documents');
  const dist = useDistance();
  const cur = useCurrency();
  const { unit } = usePrefs();
  const toast = useToast();
  const [form, setForm] = useState(null);
  useEffect(() => { if (openSignal) setForm({}); }, [openSignal]);

  const cards = useMemo(() => data.vehicles.map((v) => {
    const odo = vehicleOdometer(v, data);
    const recs = data.maintenance.filter((m) => m.vehicle_id === v.id);
    const next = recs.map((m) => ({ m, st: maintStatus(m, odo, data.maintenance), p: serviceProgress(m, odo, dist) }))
      .filter((x) => ['overdue', 'soon', 'ok'].includes(x.st) && x.p).sort((a, b) => b.p.ratio - a.p.ratio)[0];
    const flagged = docs.filter((d) => d.vehicle_id === v.id && ['expired', 'soon'].includes(docStatus(d).key));
    const cost = recs.filter((m) => m.currency === cur).reduce((a, m) => a + m.cost_cents, 0)
      + data.expenses.filter((e) => e.vehicle_id === v.id && e.currency === cur).reduce((a, e) => a + e.amount_cents, 0);
    const km = sumDistance(data.trips.filter((t) => t.vehicle_id === v.id)) / 1000 / (unit === 'mi' ? 1.609344 : 1);
    return { v, odo, next, flagged, cost, km };
  }).sort((a, b) => a.v.name.localeCompare(b.v.name)), [data, docs, cur, unit, dist]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600 dark:text-ink-300">{cards.length ? `${cards.length} vehicle${cards.length === 1 ? '' : 's'} in your garage.` : 'Your garage is empty.'}</p>
        <Button icon={Plus} onClick={() => setForm({})}>Add vehicle</Button>
      </div>
      {cards.length === 0 ? (
        <Empty icon={Truck} title="Put your truck in the garage" text="Add a vehicle and Roadbook keeps its odometer, service dates, documents and cost per kilometre in one place." action={<Button icon={Plus} onClick={() => setForm({})}>Add your first vehicle</Button>} />
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {cards.map(({ v, odo, next, flagged, cost, km }) => {
            const expired = flagged.some((d) => docStatus(d).key === 'expired');
            const st = next?.st;
            return (
              <li key={v.id} className="paper-card overflow-hidden">
                <div className="flex items-start justify-between gap-3 bg-ink-950 px-4 py-4 text-white dark:bg-black/40">
                  <div className="min-w-0">
                    {v.plate ? <Plate className="!px-3 !py-0.5 !text-2xl">{v.plate}</Plate> : <Badge>No plate</Badge>}
                    <h3 className="mt-2 truncate text-lg font-bold leading-tight">{v.name}</h3>
                    <p className="truncate text-sm text-ink-300">{[[v.year, v.make, v.model].filter(Boolean).join(' '), v.fuel_type].filter(Boolean).join(' · ') || 'Add make and model by editing'}</p>
                  </div>
                  <div className="flex shrink-0 text-ink-300"><IconButton icon={Pencil} label={`Edit ${v.name}`} className="!text-ink-300 hover:!bg-white/10" onClick={() => setForm(v)} /><IconButton icon={Trash2} label={`Delete ${v.name}`} className="!text-ink-300 hover:!bg-white/10" onClick={() => softDelete(toast, 'vehicles', v, `${v.name} deleted`)} /></div>
                </div>
                <div className="roadline" aria-hidden="true" />
                <div className="space-y-5 p-4">
                  <div>
                    <Label>Odometer</Label>
                    {odo != null ? <Odometer meters={odo} unit={unit} digits={6} decimals={0} size="md" /> : <p className="text-sm text-ink-500">Not set yet. Edit the vehicle and type today's reading.</p>}
                  </div>
                  <div>
                    <Label>Next service</Label>
                    {next ? (
                      <>
                        <div className="mb-1.5 flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate font-bold">{next.m.title}</span>
                          <span className="flex shrink-0 items-center gap-1 text-sm font-bold">
                            {st === 'overdue' ? <AlertTriangle size={15} className="text-[var(--bad)]" /> : st === 'soon' ? <Clock size={15} className="text-[var(--warn)]" /> : <CheckCircle2 size={15} className="text-[var(--good)]" />}{next.p.text}
                          </span>
                        </div>
                        <Meter value={Math.max(0, next.p.ratio)} max={1} label={`${next.m.title}: ${next.p.text}`} />
                      </>
                    ) : <p className="flex items-center gap-2 text-sm text-ink-500"><Wrench size={15} /> Nothing scheduled. Add a service record with a next-due date.</p>}
                  </div>
                  <dl className="grid grid-cols-2 gap-4 border-t border-[var(--hairline)] pt-4">
                    <div>
                      <dt className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">Documents</dt>
                      <dd className="flex items-center gap-1.5 text-sm font-bold">
                        {flagged.length ? <><FileWarning size={16} className={expired ? 'text-[var(--bad)]' : 'text-[var(--warn)]'} />{flagged.length} need{flagged.length === 1 ? 's' : ''} attention</> : <><ShieldCheck size={16} className="text-[var(--good)]" />All valid</>}
                      </dd>
                    </div>
                    <div>
                      <dt className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">Cost per {unit}</dt>
                      <dd className="flex items-center gap-1.5 text-sm font-bold"><Coins size={16} className="text-ink-400" />{km > 0 && cost > 0 ? fmtMoney(Math.round(cost / km), cur) : 'Not enough data'}</dd>
                    </div>
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {form && <VehicleForm key={form.id || 'new'} open vehicle={form.id ? form : null} onClose={() => setForm(null)} />}
    </div>
  );
}
