import { useMemo, useState } from 'react';
import { Plus, Bell, BellRing, BellOff, Check, Pencil, Trash2, CalendarPlus, Undo2, Repeat } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Banner, Empty, IconButton, Select, useConfirm } from '../components/ui.jsx';
import { useRows, save, remove } from '../state/data.js';
import { completeReminder, reminderState, snoozePatch, sortReminders, whenText } from '../core/reminders-logic.js';
import { buildICS } from '../core/ics.js';
import { fmtRelative, fmtDateTime } from '../core/format.js';
import { useDistance } from '../lib/hooks.js';
import { useToast } from '../components/toast.jsx';
import ReminderForm from './reminders/ReminderForm.jsx';
import { useMinuteTick } from './reminders/useDue.js';
import { useDueNotifier, useNotifyOptIn, notifySupported } from './reminders/useNotifier.js';
import { useOverallOdometer } from './maintenance/odo.js';

const SNOOZE = [{ v: 60, l: '1 hour' }, { v: 240, l: '4 hours' }, { v: 1440, l: 'Tomorrow' }, { v: 10080, l: 'Next week' }];
const TONE = { overdue: 'red', due: 'red', soon: 'amber', snoozed: 'blue', later: 'neutral', unknown: 'neutral', done: 'green' };
const WORD = { overdue: 'Overdue', due: 'Due now', soon: 'Due soon', snoozed: 'Snoozed', later: 'Upcoming', unknown: 'Needs odometer', done: 'Done' };

function download(r) {
  const text = buildICS([{ uid: r.id, title: r.title, start: r.due_at, durationMinutes: 30, alarmMinutes: [r.lead_minutes || 0], repeat: r.repeat !== 'none' ? r.repeat : undefined, description: 'Reminder from Roadbook' }]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  a.download = `${r.title.replace(/[^\w]+/g, '-').slice(0, 40) || 'reminder'}.ics`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export default function Reminders() {
  const reminders = useRows('reminders');
  const odometer_m = useOverallOdometer();
  const tick = useMinuteTick();
  const dist = useDistance();
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [form, setForm] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const notify = useNotifyOptIn();
  useDueNotifier(notify.enabled, reminders, odometer_m);

  const ctx = useMemo(() => ({ now: new Date(), odometer_m }), [odometer_m, tick]);
  const fmt = { distance: dist, relative: fmtRelative };
  const groups = useMemo(() => {
    const g = { overdue: [], soon: [], upcoming: [], done: [] };
    for (const r of sortReminders(reminders, ctx)) {
      const s = reminderState(r, ctx);
      if (s === 'overdue' || s === 'due') g.overdue.push(r); else if (s === 'soon') g.soon.push(r); else if (s === 'done') g.done.push(r); else g.upcoming.push(r);
    }
    g.done.sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));
    return g;
  }, [reminders, ctx]);

  async function done(r) {
    const patch = completeReminder(r, ctx);
    await save('reminders', { ...r, ...patch });
    toast(patch.done_at ? 'Marked as done.' : 'Done. The next one is already set.');
  }
  async function snooze(r, mins) { await save('reminders', { ...r, ...snoozePatch(mins) }); toast('Snoozed.'); }
  async function del(r) {
    if (!(await confirm({ title: 'Delete this reminder?', text: r.title, danger: true, confirmLabel: 'Delete reminder' }))) return;
    await remove('reminders', r.id); toast('Reminder deleted.');
  }

  const Item = ({ r }) => {
    const st = reminderState(r, ctx);
    return (
      <li key={r.id}>
        <Card className="!p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className={`font-semibold ${st === 'done' ? 'text-ink-500 line-through' : ''}`}>{r.title}</span><Badge tone={TONE[st]}>{WORD[st]}</Badge>{(r.repeat !== 'none' || r.repeat_every_m) && <Badge><Repeat size={11} className="mr-1" />{r.kind === 'km' ? `every ${dist(r.repeat_every_m)}` : r.repeat}</Badge>}</div>
              <p className="mt-0.5 text-sm text-ink-500">{st === 'done' ? `Done ${fmtRelative(r.done_at)}` : whenText(r, ctx, fmt)}{r.kind === 'date' && r.due_at && st !== 'done' ? ` - ${fmtDateTime(r.due_at)}` : ''}{r.kind === 'km' && r.due_odometer_m != null ? ` (at ${dist(r.due_odometer_m)})` : ''}{st === 'snoozed' ? ` - back ${fmtRelative(r.snoozed_until)}` : ''}</p>
            </div>
            <div className="flex shrink-0">
              {r.kind === 'date' && r.due_at && st !== 'done' && <IconButton icon={CalendarPlus} label={`Add ${r.title} to my calendar`} onClick={() => download(r)} />}
              <IconButton icon={Pencil} label={`Edit ${r.title}`} onClick={() => setForm(r)} />
              <IconButton icon={Trash2} label={`Delete ${r.title}`} onClick={() => del(r)} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {st === 'done' ? <Button size="sm" variant="soft" icon={Undo2} onClick={() => save('reminders', { ...r, done_at: null })}>Reopen</Button> : (
              <>
                <Button size="sm" icon={Check} onClick={() => done(r)}>Done</Button>
                <Select aria-label={`Snooze ${r.title}`} value="" onChange={(e) => e.target.value && snooze(r, Number(e.target.value))} className="!h-8 !w-auto !text-sm"><option value="">Snooze...</option>{SNOOZE.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</Select>
              </>
            )}
          </div>
        </Card>
      </li>
    );
  };
  const Group = ({ title, tone, list }) => list.length ? (
    <section className="mb-6" aria-label={title}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">{title}<Badge tone={tone}>{list.length}</Badge></h2>
      <ul className="space-y-2">{list.map((r) => Item({ r }))}</ul>
    </section>
  ) : null;

  const active = groups.overdue.length + groups.soon.length + groups.upcoming.length;
  return (
    <>
      <PageHeader title="Reminders" sub="Dates and distances you must not miss." actions={<Button icon={Plus} onClick={() => setForm({})}>New reminder</Button>} />
      {notifySupported() && (
        <Card className="mb-6 !p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-700/20">{notify.enabled ? <BellRing size={18} /> : <Bell size={18} />}</span>
              <div><div className="text-sm font-semibold">Alerts while Roadbook is open</div><div className="text-xs text-ink-500">{notify.perm === 'denied' ? 'Notifications are blocked in your browser settings.' : notify.enabled ? 'You will get a notification when a reminder comes due.' : 'Get a notification when a reminder comes due.'}</div></div>
            </div>
            {notify.perm !== 'denied' && (notify.enabled ? <Button variant="outline" icon={BellOff} onClick={notify.disable}>Turn off</Button> : <Button variant="soft" icon={Bell} onClick={async () => { if (!(await notify.enable())) toast('Notifications were not allowed.', { bad: true }); }}>Turn on notifications</Button>)}
          </div>
          <p className="mt-2 text-xs text-ink-500">Alerts only work while the app is open. For alerts when it is closed, use "Add to my calendar" on a reminder.</p>
        </Card>
      )}
      {odometer_m == null && reminders.some((r) => r.kind === 'km' && !r.done_at) && <div className="mb-4"><Banner tone="amber">Distance reminders need an odometer reading. Add one on your vehicle in Maintenance, or log a trip by odometer.</Banner></div>}
      {reminders.length === 0 ? (
        <Empty icon={Bell} title="No reminders yet" text="Add insurance renewals, inspections and service dates, and Roadbook will tell you when they are close." action={<Button icon={Plus} onClick={() => setForm({})}>Add a reminder</Button>} />
      ) : (
        <>
          {active === 0 && <div className="mb-4"><Banner tone="green">You are all caught up. Nothing is waiting.</Banner></div>}
          {Group({ title: "Overdue", tone: "red", list: groups.overdue })}
          {Group({ title: "Due soon", tone: "amber", list: groups.soon })}
          {Group({ title: "Upcoming", tone: "neutral", list: groups.upcoming })}
          {groups.done.length > 0 && (
            <section aria-label="Done">
              <button type="button" className="mb-2 flex items-center gap-2 text-sm font-semibold" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>Done <Badge tone="green">{groups.done.length}</Badge><span className="text-xs font-normal text-ink-500">{showDone ? 'Hide' : 'Show'}</span></button>
              {showDone && <ul className="space-y-2">{groups.done.map((r) => Item({ r }))}</ul>}
            </section>
          )}
        </>
      )}
      {form && <ReminderForm key={form.id || 'new'} open reminder={form.id ? form : null} odometer={odometer_m} onClose={() => setForm(null)} />}
      {node}
    </>
  );
}
