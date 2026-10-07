import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Wrench, BellPlus, Paperclip } from 'lucide-react';
import { Card, Button, Empty, IconButton, Badge, Select, Chips, useConfirm } from '../../components/ui.jsx';
import { useRows, remove, create } from '../../state/data.js';
import { fmtDate } from '../../core/format.js';
import { useDistance, useMoney } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import ServiceForm from './ServiceForm.jsx';
import FileThumb from './FileThumb.jsx';
import { useOdometerData, vehicleOdometer } from './odo.js';
import { maintStatus, STATUS_UI, kindLabel } from './status.js';

export default function ServiceTab() {
  const data = useOdometerData();
  const reminders = useRows('reminders');
  const dist = useDistance();
  const money = useMoney();
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [vehicle, setVehicle] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState(null);
  const { vehicles, maintenance } = data;
  const vName = (id) => vehicles.find((v) => v.id === id)?.name;

  const list = useMemo(() => maintenance.filter((m) => !vehicle || m.vehicle_id === vehicle).map((m) => {
    const v = vehicles.find((x) => x.id === m.vehicle_id);
    return { m, st: maintStatus(m, v ? vehicleOdometer(v, data) : null, maintenance) };
  }).filter((x) => status === 'all' || x.st === status).sort((a, b) => b.m.done_at.localeCompare(a.m.done_at)), [maintenance, vehicles, vehicle, status, data]);
  const counts = useMemo(() => {
    const c = { overdue: 0, soon: 0, ok: 0 };
    for (const m of maintenance.filter((x) => !vehicle || x.vehicle_id === vehicle)) { const v = vehicles.find((x) => x.id === m.vehicle_id); const s = maintStatus(m, v ? vehicleOdometer(v, data) : null, maintenance); if (c[s] != null) c[s] += 1; }
    return c;
  }, [maintenance, vehicles, vehicle, data]);

  async function makeReminder(m) {
    const made = [];
    const title = `${m.title} due`.slice(0, 100);
    const exists = (fn) => reminders.some((r) => r.title === title && !r.done_at && fn(r));
    if (m.next_due_at && !exists((r) => r.kind === 'date')) { await create('reminders', { title, kind: 'date', due_at: m.next_due_at, repeat: 'none', lead_minutes: 10080 }); made.push('date'); }
    if (m.next_due_odometer_m != null && !exists((r) => r.kind === 'km')) { await create('reminders', { title, kind: 'km', due_odometer_m: m.next_due_odometer_m, repeat: 'none', lead_minutes: 60 }); made.push('km'); }
    toast(made.length ? 'Reminder created. Find it on the Reminders page.' : 'A reminder for this is already set.');
  }
  async function del(m) {
    if (!(await confirm({ title: 'Delete this service record?', text: m.title, danger: true, confirmLabel: 'Delete record' }))) return;
    await remove('maintenance', m.id); toast('Record deleted.');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {vehicles.length > 0 && <Select aria-label="Filter by vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="!w-auto"><option value="">All vehicles</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}
        </div>
        <Button icon={Plus} onClick={() => setForm({})}>Add service record</Button>
      </div>
      <Chips value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'overdue', label: `Overdue (${counts.overdue})` }, { value: 'soon', label: `Due soon (${counts.soon})` }, { value: 'ok', label: `OK (${counts.ok})` }]} />
      {list.length === 0 ? (
        <Empty icon={Wrench} title={maintenance.length ? 'No records match' : 'No service records yet'} text="Keep a log of oil changes, tyres, brakes and repairs, with costs and receipts, and get reminded when the next one is due." action={<Button icon={Plus} onClick={() => setForm({})}>Add a service record</Button>} />
      ) : (
        <ul className="space-y-2">
          {list.map(({ m, st }) => {
            const ui = STATUS_UI[st];
            return (
              <li key={m.id}>
                <Card className="!p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{m.title}</span><Badge>{kindLabel(m.kind)}</Badge>{st !== 'none' && <Badge tone={ui.tone}>{ui.label}</Badge>}{m.receipt_path && <Paperclip size={14} className="text-ink-400" aria-label="Has receipt" />}</div>
                      <p className="mt-0.5 text-xs text-ink-500">{[vName(m.vehicle_id), fmtDate(m.done_at, { year: true }), m.odometer_m != null && dist(m.odometer_m), m.vendor].filter(Boolean).join(' - ')}</p>
                    </div>
                    <div className="text-right"><div className="font-bold tabular-nums">{m.cost_cents ? money(m.cost_cents, m.currency) : '-'}</div></div>
                  </div>
                  {(m.next_due_at || m.next_due_odometer_m != null) && (
                    <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">Next due: {[m.next_due_at && fmtDate(m.next_due_at, { year: true }), m.next_due_odometer_m != null && `at ${dist(m.next_due_odometer_m)}`].filter(Boolean).join(' or ')}</p>
                  )}
                  {m.notes && <p className="mt-1 text-sm text-ink-500">{m.notes}</p>}
                  {m.receipt_path && <div className="mt-2 max-w-xs"><FileThumb path={m.receipt_path} name="Receipt" /></div>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {(m.next_due_at || m.next_due_odometer_m != null) && st !== 'done' ? <Button size="sm" variant="soft" icon={BellPlus} onClick={() => makeReminder(m)}>Create reminder</Button> : <span />}
                    <div className="flex"><IconButton icon={Pencil} label={`Edit ${m.title}`} onClick={() => setForm(m)} /><IconButton icon={Trash2} label={`Delete ${m.title}`} onClick={() => del(m)} /></div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {form && <ServiceForm key={form.id || 'new'} open record={form.id ? form : null} vehicles={vehicles} defaultVehicle={vehicle} onClose={() => setForm(null)} />}
      {node}
    </div>
  );
}
