import { useState } from 'react';
import { Modal, Button, Field, Input, Select, Segmented } from '../../components/ui.jsx';
import { create, save } from '../../state/data.js';
import { usePrefs } from '../../state/prefs.js';
import { fmtDistance, parseDistance, toLocalInput, fromLocalInput } from '../../core/format.js';
import { useToast } from '../../components/toast.jsx';

const LEADS = [{ v: 0, l: 'At the time' }, { v: 15, l: '15 minutes before' }, { v: 60, l: '1 hour before' }, { v: 1440, l: '1 day before' }, { v: 4320, l: '3 days before' }, { v: 10080, l: '1 week before' }];
const num = (m, unit) => (m == null ? '' : String(Math.round((m / 1000 / (unit === 'mi' ? 1.609344 : 1)) * 10) / 10));

export default function ReminderForm({ open, onClose, reminder, odometer }) {
  const { unit } = usePrefs();
  const toast = useToast();
  const editing = !!reminder?.id;
  const [f, setF] = useState(() => ({
    title: reminder?.title || '', kind: reminder?.kind || 'date',
    due: reminder?.due_at ? toLocalInput(reminder.due_at) : toLocalInput(new Date(Date.now() + 86400000)),
    odo: num(reminder?.due_odometer_m, unit), repeat: reminder?.repeat || 'none', every: num(reminder?.repeat_every_m, unit), lead: reminder?.lead_minutes ?? 60,
  }));
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    const e = {};
    if (!f.title.trim()) e.title = 'Type what you want to be reminded about.';
    let due = null; let odo = null; let every = null;
    if (f.kind === 'date') {
      due = fromLocalInput(f.due);
      if (!due) e.due = 'Choose a date and time.';
    } else {
      odo = parseDistance(f.odo, unit);
      if (odo == null) e.odo = 'Type the odometer reading when this is due, for example 130000.';
      if (f.every.trim()) { every = parseDistance(f.every, unit); if (every == null || every < 1 || every > 100000000) e.every = 'Type a distance, for example 10000.'; }
    }
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const row = {
        ...(reminder || {}), title: f.title.trim().slice(0, 100), kind: f.kind,
        due_at: f.kind === 'date' ? due.toISOString() : null, due_odometer_m: f.kind === 'km' ? odo : null,
        repeat: f.kind === 'date' ? f.repeat : 'none', repeat_every_m: f.kind === 'km' ? every : null,
        lead_minutes: Number(f.lead) || 0, snoozed_until: null, done_at: editing ? reminder.done_at : null,
      };
      if (editing) await save('reminders', row); else await create('reminders', row);
      toast(editing ? 'Reminder updated.' : 'Reminder added.');
      onClose();
    } catch (x) { console.error(x); toast('Could not save the reminder.', { bad: true }); }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit reminder' : 'New reminder'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{editing ? 'Save changes' : 'Add reminder'}</Button></>}>
      <div className="space-y-4">
        <Field label="Remind me to" error={err.title}>{(id) => <Input id={id} value={f.title} maxLength={100} onChange={set('title')} placeholder="Renew insurance" />}</Field>
        <Segmented value={f.kind} onChange={(kind) => setF({ ...f, kind })} options={[{ value: 'date', label: 'On a date' }, { value: 'km', label: 'At a distance' }]} />
        {f.kind === 'date' ? (
          <>
            <Field label="When" error={err.due}>{(id) => <Input id={id} type="datetime-local" value={f.due} onChange={set('due')} />}</Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Repeat">{(id) => <Select id={id} value={f.repeat} onChange={set('repeat')}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></Select>}</Field>
              <Field label="Warn me">{(id) => <Select id={id} value={f.lead} onChange={set('lead')}>{LEADS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}</Select>}</Field>
            </div>
          </>
        ) : (
          <>
            <Field label={`Due at odometer (${unit})`} error={err.odo} hint={odometer != null ? `Your odometer is about ${fmtDistance(odometer, unit)} now.` : 'Add a vehicle odometer or a trip so Roadbook can follow your distance.'}>{(id) => <Input id={id} inputMode="decimal" value={f.odo} onChange={set('odo')} />}</Field>
            <Field label={`Repeat every (${unit}, optional)`} error={err.every} hint="For example 10000 for an oil change every 10,000.">{(id) => <Input id={id} inputMode="decimal" value={f.every} onChange={set('every')} />}</Field>
          </>
        )}
      </div>
    </Modal>
  );
}
