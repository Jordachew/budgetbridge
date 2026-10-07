import { useMemo, useState } from 'react';
import { Plus, Bell, BellRing, BellOff, Check, Pencil, Trash2, CalendarPlus, Undo2, Repeat, AlarmClock, CalendarClock, CornerDownLeft, AlertTriangle, Sun, CalendarDays, CheckCheck } from 'lucide-react';
import { PageHeader, Button, Badge, Empty, IconButton } from '../components/ui.jsx';
import { useRows, save, create, remove } from '../state/data.js';
import { completeReminder, reminderState, snoozePatch, whenText } from '../core/reminders-logic.js';
import { buildICS } from '../core/ics.js';
import { fmtRelative, fmtDateTime } from '../core/format.js';
import { useDistance } from '../lib/hooks.js';
import { useToast } from '../components/toast.jsx';
import { softDelete } from '../lib/undo.js';
import ReminderForm from './reminders/ReminderForm.jsx';
import { useMinuteTick } from './reminders/useDue.js';
import { useDueNotifier, useNotifyOptIn, notifySupported } from './reminders/useNotifier.js';
import { groupReminders } from './reminders/groups.js';
import { parseQuickReminder } from './reminders/quickParse.js';
import { useOverallOdometer } from './maintenance/odo.js';
import { useNewParam } from './maintenance/formKit.jsx';

const SNOOZE = [{ v: 60, l: '1 hour' }, { v: 240, l: '4 hours' }, { v: 1440, l: 'Tomorrow' }, { v: 10080, l: 'Next week' }];

function download(r) {
  const text = buildICS([{ uid: r.id, title: r.title, start: r.due_at, durationMinutes: 30, alarmMinutes: [r.lead_minutes || 0], repeat: r.repeat !== 'none' ? r.repeat : undefined, description: 'Reminder from Roadbook' }]);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  a.download = `${r.title.replace(/[^\w]+/g, '-').slice(0, 40) || 'reminder'}.ics`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Item({ r, ctx, dist, onDone, onSnooze, onEdit, onDelete, onReopen }) {
  const [snoozing, setSnoozing] = useState(false);
  const st = reminderState(r, ctx);
  const done = st === 'done';
  const when = done ? `Done ${fmtRelative(r.done_at)}` : whenText(r, ctx, { distance: dist, relative: fmtRelative });
  const exact = r.kind === 'date' && r.due_at ? fmtDateTime(r.due_at) : r.kind === 'km' && r.due_odometer_m != null ? `at ${dist(r.due_odometer_m)}` : '';
  const late = st === 'overdue' || (r.kind === 'km' && st === 'due');
  return (
    <li className="border-b border-[var(--hairline)] py-4 last:border-b-0">
      <div className="flex items-start gap-3 sm:gap-4">
        {done ? (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-ink-100 text-[var(--good)] dark:bg-ink-800" aria-hidden="true"><CheckCheck size={26} /></span>
        ) : (
          <button type="button" onClick={onDone} aria-label={`Mark done: ${r.title}`} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-brand-500 text-ink-950 shadow-[0_2px_0_rgba(0,0,0,0.25)] hover:bg-brand-400 active:translate-y-px active:shadow-none"><Check size={28} strokeWidth={3} /></button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={`text-lg font-bold leading-snug ${done ? 'text-ink-500 line-through' : ''}`}>{r.title}</span>
            {(r.repeat !== 'none' || r.repeat_every_m) && <Badge icon={Repeat}>{r.kind === 'km' ? `every ${dist(r.repeat_every_m)}` : r.repeat}</Badge>}
            {st === 'snoozed' && <Badge tone="blue" icon={AlarmClock}>Snoozed</Badge>}
            {st === 'unknown' && <Badge tone="amber" icon={AlertTriangle}>Needs odometer</Badge>}
          </div>
          <p className="mt-0.5 text-sm" title={exact}>
            <span className={`font-bold ${late ? 'text-[var(--bad)]' : 'text-ink-700 dark:text-ink-200'}`}>{when}{st === 'snoozed' ? `, back ${fmtRelative(r.snoozed_until)}` : ''}</span>
            {exact && !done && <span className="text-ink-500"> · {exact}</span>}
          </p>
          {!done && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="outline" icon={AlarmClock} aria-expanded={snoozing} onClick={() => setSnoozing(!snoozing)} className="!h-11">Snooze</Button>
              {snoozing && SNOOZE.map((s) => <Button key={s.v} variant="soft" className="!h-11" onClick={() => { setSnoozing(false); onSnooze(s.v); }}>{s.l}</Button>)}
            </div>
          )}
          {done && <Button size="sm" variant="soft" icon={Undo2} className="mt-2" onClick={onReopen}>Reopen</Button>}
        </div>
        <div className="flex shrink-0 flex-col sm:flex-row">
          {r.kind === 'date' && r.due_at && !done && <IconButton icon={CalendarPlus} label={`Add ${r.title} to my calendar`} onClick={() => download(r)} />}
          <IconButton icon={Pencil} label={`Edit ${r.title}`} onClick={onEdit} />
          <IconButton icon={Trash2} label={`Delete ${r.title}`} onClick={onDelete} />
        </div>
      </div>
    </li>
  );
}

const GROUPS = [
  { key: 'overdue', title: 'Overdue', icon: AlertTriangle, color: 'var(--bad)' },
  { key: 'today', title: 'Today', icon: Sun, color: 'var(--warn)' },
  { key: 'upcoming', title: 'Upcoming', icon: CalendarDays, color: 'var(--series-1)' },
];

export default function Reminders() {
  const reminders = useRows('reminders');
  const odometer_m = useOverallOdometer();
  const tick = useMinuteTick();
  const dist = useDistance();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [text, setText] = useState('');
  const notify = useNotifyOptIn();
  useDueNotifier(notify.enabled, reminders, odometer_m);
  useNewParam(() => setForm({}));

  const ctx = useMemo(() => ({ now: new Date(), odometer_m }), [odometer_m, tick, reminders]);
  const groups = useMemo(() => groupReminders(reminders, ctx), [reminders, ctx]);
  const parsed = useMemo(() => parseQuickReminder(text), [text]);
  const need = groups.overdue.length + groups.today.length;
  const open = need + groups.upcoming.length;

  async function quickAdd() {
    if (!parsed.title) return;
    if (!parsed.due) { setForm({ initial: { title: parsed.title } }); return; }
    const row = await create('reminders', { title: parsed.title.slice(0, 100), kind: 'date', due_at: parsed.due.toISOString(), repeat: 'none', lead_minutes: 60 });
    setText('');
    toast(`Reminder set for ${fmtDateTime(parsed.due)}.`, { ms: 6000, action: { label: 'Undo', run: () => remove('reminders', row.id) } });
  }
  async function done(r) {
    const patch = completeReminder(r, ctx);
    await save('reminders', { ...r, ...patch });
    toast(patch.done_at ? 'Marked as done.' : 'Done. The next one is already set.', { ms: 6000, action: { label: 'Undo', run: () => save('reminders', r) } });
  }
  async function snooze(r, mins) { await save('reminders', { ...r, ...snoozePatch(mins) }); toast('Snoozed.', { action: { label: 'Undo', run: () => save('reminders', r) } }); }
  const item = (r) => <Item key={r.id} r={r} ctx={ctx} dist={dist} onDone={() => done(r)} onSnooze={(m) => snooze(r, m)} onEdit={() => setForm(r)} onDelete={() => softDelete(toast, 'reminders', r, 'Reminder deleted')} onReopen={() => save('reminders', { ...r, done_at: null })} />;

  return (
    <>
      <PageHeader title="Reminders" sub="Dates and distances you must not miss." actions={<Button icon={Plus} variant="outline" onClick={() => setForm({})}>New reminder</Button>} />

      <section aria-label="Quick add" className="mb-8 grid gap-6 md:grid-cols-[auto_1fr] md:items-end">
        <div className="border-l-4 border-brand-500 pl-4">
          <div className="text-6xl font-bold leading-none">{need}</div>
          <div className="mt-1 text-sm font-bold text-ink-600 dark:text-ink-300">{need === 0 ? (open ? 'Nothing needs you today' : 'All clear') : need === 1 ? 'thing needs you today' : 'things need you today'}</div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); quickAdd(); }}>
          <label htmlFor="quick" className="mb-1.5 block text-sm font-bold">Add a reminder</label>
          <div className="flex gap-2">
            <input id="quick" value={text} onChange={(e) => setText(e.target.value)} maxLength={140} autoComplete="off" placeholder="Renew insurance on 1 Dec"
              className="h-14 min-w-0 flex-1 rounded-md border-2 border-ink-300 bg-[var(--surface)] px-4 text-lg placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-ink-600" />
            <Button type="submit" icon={Plus} disabled={!parsed.title} className="!h-14 !px-5 !text-base">Add</Button>
          </div>
          <p className="mt-2 flex min-h-[1.75rem] flex-wrap items-center gap-2 text-sm" aria-live="polite">
            {!parsed.title ? <span className="text-ink-500">Try "Call Wisynco tomorrow at 3pm", "Truck wash next week" or "Pay tax 15 Nov".</span>
              : parsed.due ? <><Badge tone="brand" icon={CalendarClock}>{fmtDateTime(parsed.due)}</Badge><span className="font-bold">{parsed.title}</span><span className="inline-flex items-center gap-1 text-ink-500"><CornerDownLeft size={13} /> Enter to add</span></>
                : <><span className="font-bold">{parsed.title}</span><span className="text-ink-500">No date found. Press Enter to pick one.</span></>}
          </p>
        </form>
      </section>

      {odometer_m == null && reminders.some((r) => r.kind === 'km' && !r.done_at) && <p className="mb-5 rounded-md border-l-4 border-brand-500 bg-brand-50 px-3 py-2 text-sm text-ink-800 dark:bg-brand-500/15 dark:text-ink-100">Distance reminders need an odometer reading. Add one on your vehicle in Maintenance, or log a trip by odometer.</p>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          {reminders.length === 0 ? (
            <Empty icon={Bell} title="Nothing to remember yet" text="Type it above the way you would say it: 'Renew licence on 1 Dec'. Insurance, inspections and services are what most drivers add first." action={<Button icon={Plus} onClick={() => setForm({})}>Add with the full form</Button>} />
          ) : (
            <>
              {open === 0 && <p className="mb-6 rounded-md border-l-4 border-[var(--good)] bg-ink-100/70 px-3 py-3 text-sm font-bold dark:bg-ink-800/60">You are all caught up. Nothing is waiting.</p>}
              {GROUPS.map((g) => {
                const list = groups[g.key]; const Icon = g.icon;
                if (!list.length) return null;
                return (
                  <section key={g.key} className="mb-8" aria-label={g.title}>
                    <h2 className="flex items-center gap-2 border-b-[3px] pb-2 font-display text-2xl font-semibold" style={{ borderColor: g.color }}><Icon size={20} style={{ color: g.color }} />{g.title}<span className="ml-1 font-sans text-sm font-bold text-ink-500">{list.length}</span></h2>
                    <ul>{list.map(item)}</ul>
                  </section>
                );
              })}
              {groups.done.length > 0 && (
                <section aria-label="Done">
                  <button type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)} className="flex w-full items-center gap-2 border-b-[3px] border-ink-300 pb-2 text-left font-display text-2xl font-semibold dark:border-ink-600">
                    <CheckCheck size={20} className="text-[var(--good)]" />Done<span className="font-sans text-sm font-bold text-ink-500">{groups.done.length}</span><span className="ml-auto font-sans text-sm font-bold text-ink-500">{showDone ? 'Hide' : 'Show'}</span>
                  </button>
                  {showDone && <ul>{groups.done.map(item)}</ul>}
                </section>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start" aria-label="Alerts">
          {notifySupported() && (
            <div className="paper-card p-4">
              <div className="flex items-center gap-2 font-display text-lg font-semibold">{notify.enabled ? <BellRing size={18} className="text-brand-600 dark:text-brand-300" /> : <Bell size={18} className="text-brand-600 dark:text-brand-300" />}Alerts</div>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{notify.perm === 'denied' ? 'Notifications are blocked in your browser settings.' : notify.enabled ? 'You get a notification when a reminder comes due while Roadbook is open.' : 'Get a notification when a reminder comes due while Roadbook is open.'}</p>
              {notify.perm !== 'denied' && <div className="mt-3">{notify.enabled ? <Button variant="outline" icon={BellOff} onClick={notify.disable}>Turn off</Button> : <Button icon={Bell} onClick={async () => { if (!(await notify.enable())) toast('Notifications were not allowed.', { bad: true }); }}>Turn on notifications</Button>}</div>}
            </div>
          )}
          <p className="text-xs text-ink-500">Alerts only work while the app is open. To be told when it is closed, use the <CalendarPlus size={12} className="inline" /> button on a reminder to add it to your phone's calendar.</p>
        </aside>
      </div>
      {form && <ReminderForm key={form.id || 'new'} open reminder={form.id ? form : null} initial={form.initial} odometer={odometer_m} onClose={() => setForm(null)} />}
    </>
  );
}
