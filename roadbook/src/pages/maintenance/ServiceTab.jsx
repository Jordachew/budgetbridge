import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Wrench, BellPlus, BellRing, Paperclip, AlertTriangle, Clock, CheckCircle2, Check, Minus, Search } from 'lucide-react';
import { Button, Empty, IconButton, Badge, Select, Chips, Plate } from '../../components/ui.jsx';
import { useRows, create } from '../../state/data.js';
import { fmtDate } from '../../core/format.js';
import { useDistance, useMoney } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import { softDelete } from '../../lib/undo.js';
import ServiceForm from './ServiceForm.jsx';
import FileThumb from './FileThumb.jsx';
import { useOdometerData, vehicleOdometer } from './odo.js';
import { maintStatus, STATUS_UI, kindLabel } from './status.js';

const ICON = { overdue: AlertTriangle, soon: Clock, ok: CheckCircle2, done: Check, none: Minus };
const DOT = { overdue: 'var(--bad)', soon: 'var(--warn)', ok: 'var(--good)', done: 'var(--muted)', none: 'var(--axis)' };

export default function ServiceTab({ openSignal }) {
  const data = useOdometerData();
  const reminders = useRows('reminders');
  const dist = useDistance();
  const money = useMoney();
  const toast = useToast();
  const [vehicle, setVehicle] = useState('');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const { vehicles, maintenance } = data;
  useEffect(() => { if (openSignal) setForm({}); }, [openSignal]);

  const rows = useMemo(() => maintenance.filter((m) => !vehicle || m.vehicle_id === vehicle).map((m) => {
    const v = vehicles.find((x) => x.id === m.vehicle_id);
    return { m, v, st: maintStatus(m, v ? vehicleOdometer(v, data) : null, maintenance) };
  }), [maintenance, vehicles, vehicle, data]);
  const counts = useMemo(() => { const c = { overdue: 0, soon: 0, ok: 0 }; for (const r of rows) if (c[r.st] != null) c[r.st] += 1; return c; }, [rows]);
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = rows.filter((x) => (status === 'all' || x.st === status) && (!s || `${x.m.title} ${x.m.vendor} ${x.m.notes} ${kindLabel(x.m.kind)}`.toLowerCase().includes(s)))
      .sort((a, b) => b.m.done_at.localeCompare(a.m.done_at));
    const out = [];
    for (const v of [...vehicles].sort((a, b) => a.name.localeCompare(b.name)).concat([null])) {
      const items = list.filter((x) => (v ? x.m.vehicle_id === v.id : !vehicles.some((y) => y.id === x.m.vehicle_id)));
      if (items.length) out.push({ v, items });
    }
    return out;
  }, [rows, status, q, vehicles]);

  async function makeReminder(m) {
    const made = [];
    const title = `${m.title} due`.slice(0, 100);
    const exists = (fn) => reminders.some((r) => r.title === title && !r.done_at && fn(r));
    if (m.next_due_at && !exists((r) => r.kind === 'date')) { await create('reminders', { title, kind: 'date', due_at: m.next_due_at, repeat: 'none', lead_minutes: 10080 }); made.push('date'); }
    if (m.next_due_odometer_m != null && !exists((r) => r.kind === 'km')) { await create('reminders', { title, kind: 'km', due_odometer_m: m.next_due_odometer_m, repeat: 'none', lead_minutes: 60 }); made.push('km'); }
    toast(made.length ? 'Reminder created. Find it under Reminders.' : 'A reminder for this is already set.');
  }
  const hasReminder = (m) => reminders.some((r) => r.title === `${m.title} due`.slice(0, 100) && !r.done_at);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {vehicles.length > 1 && <Select aria-label="Filter by vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="!w-auto"><option value="">All vehicles</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}
          {maintenance.length > 6 && (
            <label className="relative block"><span className="sr-only">Search service records</span><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search records" className="h-10 w-48 rounded-md border border-ink-300 bg-[var(--surface)] pl-9 pr-3 text-sm dark:border-ink-600" /></label>
          )}
        </div>
        <Button icon={Plus} onClick={() => setForm({ vehicle })}>Add service record</Button>
      </div>
      {maintenance.length > 0 && <div className="mb-5"><Chips value={status} onChange={setStatus} options={[{ value: 'all', label: `All ${rows.length}` }, { value: 'overdue', label: `Overdue ${counts.overdue}` }, { value: 'soon', label: `Due soon ${counts.soon}` }, { value: 'ok', label: `OK ${counts.ok}` }]} /></div>}

      {groups.length === 0 ? (
        <Empty icon={Wrench} title={maintenance.length ? 'No records match' : 'Start your service log'} text="Record oil changes, tyres, brakes and repairs with the cost and a receipt photo. Set when the next one is due and Roadbook warns you before it costs more." action={<Button icon={Plus} onClick={() => setForm({ vehicle })}>Add a service record</Button>} />
      ) : groups.map(({ v, items }) => (
        <section key={v?.id || 'none'} className="mb-8" aria-label={v ? v.name : 'No vehicle'}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {v?.plate ? <Plate>{v.plate}</Plate> : null}
            <h3 className="font-display text-xl font-semibold">{v ? v.name : 'No vehicle'}</h3>
            <span className="text-xs text-ink-500">{items.length} record{items.length === 1 ? '' : 's'}</span>
          </div>
          <ol className="ml-2.5 border-l-2 border-[var(--hairline)]">
            {items.map(({ m, st }) => {
              const ui = STATUS_UI[st]; const SI = ICON[st];
              const upcoming = m.next_due_at || m.next_due_odometer_m != null;
              return (
                <li key={m.id} className="relative pb-6 pl-6 last:pb-0">
                  <span className="absolute -left-[9px] top-1.5 h-4 w-4 rounded-full ring-4 ring-[var(--paper)]" style={{ background: DOT[st] }} aria-hidden="true" />
                  <div className="paper-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wide text-ink-500">{fmtDate(m.done_at, { year: true })} · {kindLabel(m.kind)}</div>
                        <h4 className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-bold">{m.title}{m.receipt_path && <Paperclip size={14} className="text-ink-400" aria-label="Has receipt" />}</h4>
                        <p className="text-sm text-ink-500">{[m.vendor, m.odometer_m != null && dist(m.odometer_m)].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="text-right"><div className="text-xl font-bold leading-none">{m.cost_cents ? money(m.cost_cents, m.currency) : '-'}</div>{st !== 'none' && <div className="mt-2"><Badge tone={ui.tone} icon={SI}>{ui.label}</Badge></div>}</div>
                    </div>
                    {upcoming && <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">Next due {[m.next_due_at && fmtDate(m.next_due_at, { year: true }), m.next_due_odometer_m != null && `at ${dist(m.next_due_odometer_m)}`].filter(Boolean).join(' or ')}</p>}
                    {m.notes && <p className="mt-1 text-sm text-ink-500">{m.notes}</p>}
                    {m.receipt_path && <div className="mt-2 max-w-xs"><FileThumb path={m.receipt_path} name="Receipt" /></div>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      {upcoming && st !== 'done' ? (hasReminder(m) ? <Badge tone="green" icon={BellRing}>Reminder set</Badge> : <Button size="sm" variant="soft" icon={BellPlus} onClick={() => makeReminder(m)}>Create reminder</Button>) : <span />}
                      <div className="flex"><IconButton icon={Pencil} label={`Edit ${m.title}`} onClick={() => setForm(m)} /><IconButton icon={Trash2} label={`Delete ${m.title}`} onClick={() => softDelete(toast, 'maintenance', m, 'Service record deleted')} /></div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {form && <ServiceForm key={form.id || 'new'} open record={form.id ? form : null} vehicles={vehicles} defaultVehicle={form.vehicle ?? vehicle} onClose={() => setForm(null)} />}
    </div>
  );
}
