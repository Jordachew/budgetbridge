import { useRef, useState } from 'react';
import { Modal, Button, Field, Input, Select, Textarea } from '../../components/ui.jsx';
import { create, save } from '../../state/data.js';
import { parseDistance, parseMoney, toLocalInput, fromLocalInput, toDateInput, unitLabel } from '../../core/format.js';
import { usePrefs } from '../../state/prefs.js';
import { useCurrency } from '../../lib/hooks.js';
import { savePicked } from '../../lib/files.js';
import { useToast } from '../../components/toast.jsx';
import { KINDS } from './status.js';
import FileThumb from './FileThumb.jsx';

export const dateToIso = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); const x = new Date(y, m - 1, d, 9, 0, 0); return Number.isNaN(x.getTime()) ? null : x.toISOString(); };
const kmText = (m, unit) => (m == null ? '' : String(Math.round((m / 1000 / (unit === 'mi' ? 1.609344 : 1)) * 10) / 10));

export default function ServiceForm({ open, onClose, record, vehicles, defaultVehicle }) {
  const { unit } = usePrefs();
  const cur = useCurrency();
  const toast = useToast();
  const editing = !!record?.id;
  const file = useRef(null);
  const [f, setF] = useState({
    vehicle: record?.vehicle_id || defaultVehicle || vehicles[0]?.id || '', kind: record?.kind || 'oil', title: record?.title || '',
    done: toLocalInput(record?.done_at || new Date()), odo: kmText(record?.odometer_m, unit),
    cost: record ? String((record.cost_cents || 0) / 100 || '') : '', currency: record?.currency || cur, vendor: record?.vendor || '', notes: record?.notes || '',
    nextAt: record?.next_due_at ? toDateInput(record.next_due_at) : '', nextOdo: kmText(record?.next_due_odometer_m, unit),
  });
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    const e = {};
    if (!f.title.trim()) e.title = 'Describe the work, for example "Oil and filter change".';
    const done = fromLocalInput(f.done);
    if (!done) e.done = 'Choose the date the work was done.';
    const odo = f.odo.trim() ? parseDistance(f.odo, unit) : null;
    if (f.odo.trim() && odo == null) e.odo = 'Type the odometer as a number.';
    let cost = 0;
    if (f.cost.trim()) { cost = parseMoney(f.cost); if (cost == null) e.cost = 'Type the cost as a number, for example 12500.'; }
    const nextOdo = f.nextOdo.trim() ? parseDistance(f.nextOdo, unit) : null;
    if (f.nextOdo.trim() && nextOdo == null) e.nextOdo = 'Type the odometer reading as a number.';
    if (nextOdo != null && odo != null && nextOdo <= odo) e.nextOdo = 'The next service reading must be higher than this one.';
    const nextAt = f.nextAt ? dateToIso(f.nextAt) : null;
    if (nextAt && done && new Date(nextAt) < done) e.nextAt = 'The next service date must be after this one.';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      let receipt = record?.receipt_path || null;
      if (picked) receipt = await savePicked(picked, 'maintenance');
      const row = { ...(record || {}), vehicle_id: f.vehicle || null, kind: f.kind, title: f.title.trim().slice(0, 100), done_at: done.toISOString(), odometer_m: odo, cost_cents: cost, currency: f.currency, vendor: f.vendor.trim().slice(0, 100), notes: f.notes.trim().slice(0, 1000), next_due_at: nextAt, next_due_odometer_m: nextOdo, receipt_path: receipt };
      if (editing) await save('maintenance', row); else await create('maintenance', row);
      toast(editing ? 'Service record updated.' : 'Service record added.');
      onClose();
    } catch (x) { console.error(x); toast(x.message || 'Could not save the record.', { bad: true }); }
    setBusy(false);
  }

  return (
    <Modal wide open={open} onClose={onClose} title={editing ? 'Edit service record' : 'Add a service record'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{editing ? 'Save changes' : 'Add record'}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vehicle">{(id) => <Select id={id} value={f.vehicle} onChange={set('vehicle')}><option value="">No vehicle</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}</Field>
        <Field label="Type">{(id) => <Select id={id} value={f.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>}</Field>
        <Field label="What was done" error={err.title} className="sm:col-span-2">{(id) => <Input id={id} value={f.title} maxLength={100} onChange={set('title')} />}</Field>
        <Field label="Date done" error={err.done}>{(id) => <Input id={id} type="datetime-local" value={f.done} onChange={set('done')} />}</Field>
        <Field label={`Odometer (${unitLabel(unit)})`} error={err.odo}>{(id) => <Input id={id} inputMode="decimal" value={f.odo} onChange={set('odo')} />}</Field>
        <Field label="Cost" error={err.cost}>{(id) => (
          <div className="flex gap-2"><Input id={id} inputMode="decimal" value={f.cost} onChange={set('cost')} placeholder="0" /><Select aria-label="Currency" value={f.currency} onChange={set('currency')} className="!w-24"><option>JMD</option><option>USD</option></Select></div>)}</Field>
        <Field label="Shop or mechanic">{(id) => <Input id={id} value={f.vendor} maxLength={100} onChange={set('vendor')} />}</Field>
        <fieldset className="rounded-xl bg-ink-50 p-3 sm:col-span-2 dark:bg-ink-800/60">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Next service due (optional)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="On this date" error={err.nextAt}>{(id) => <Input id={id} type="date" value={f.nextAt} onChange={set('nextAt')} />}</Field>
            <Field label={`Or at this odometer (${unit})`} error={err.nextOdo}>{(id) => <Input id={id} inputMode="decimal" value={f.nextOdo} onChange={set('nextOdo')} />}</Field>
          </div>
        </fieldset>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} value={f.notes} maxLength={1000} onChange={set('notes')} />}</Field>
        <Field label="Receipt photo or PDF" className="sm:col-span-2" hint="Optional. Photos are shrunk to save space.">{(id) => (
          <div className="space-y-2"><input id={id} ref={file} type="file" accept="image/*,application/pdf" onChange={(e) => setPicked(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:file:bg-ink-800" />
            {!picked && record?.receipt_path && <FileThumb path={record.receipt_path} name="Receipt" />}</div>)}</Field>
      </div>
    </Modal>
  );
}
