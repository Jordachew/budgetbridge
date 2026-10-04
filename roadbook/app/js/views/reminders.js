import { h, icon, clear, uuid } from '../util.js';
import * as store from '../store.js';
import { route, go } from '../router.js';
import { toLocalInput, fromLocalInput, fmtRelative, fmtDateTime, parseDistance, fmtDistance } from '../format.js';
import { reminderState, completeReminder, snoozePatch, sortReminders, whenText } from '../reminders-logic.js';
import { buildICS } from '../ics.js';
import { field, textInput, selectInput, segmented, toast, confirmDialog, empty, banner, pill, openSheet, choiceChips } from '../ui.js';
import { live, odometerNow, micButton, download, dist, unitName } from './common.js';
import { prefs } from '../prefs.js';
import { enableNotifications } from '../engine.js';

const TEMPLATES = [
  { id: 'oil', label: 'Oil change', icon: 'wrench', title: 'Oil change', kind: 'km', every_km: 10000 },
  { id: 'service', label: 'Full service', icon: 'wrench', title: 'Full service', kind: 'km', every_km: 20000 },
  { id: 'tyres', label: 'Tyre check', icon: 'tyre', title: 'Check tyre pressure and wear', kind: 'date', repeat: 'weekly' },
  { id: 'fitness', label: 'Fitness', icon: 'doc', title: 'Vehicle fitness certificate', kind: 'date', repeat: 'yearly', lead: 10080 },
  { id: 'insurance', label: 'Insurance', icon: 'shield', title: 'Insurance renewal', kind: 'date', repeat: 'yearly', lead: 10080 },
  { id: 'licence', label: 'Licence', icon: 'user', title: 'Driver\'s licence renewal', kind: 'date', repeat: 'yearly', lead: 20160 },
  { id: 'rest', label: 'Rest stop', icon: 'bed', title: 'Take a rest break', kind: 'date', repeat: 'none', lead: 0 },
  { id: 'other', label: 'My own', icon: 'plus', title: '', kind: 'date', repeat: 'none' },
];
const LEADS = [[0, 'At the time'], [15, '15 minutes before'], [60, '1 hour before'], [1440, '1 day before'], [4320, '3 days before'], [10080, '1 week before']];
const REPEATS = [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']];
const fmtHelpers = { distance: (m) => fmtDistance(m, prefs().unit), relative: (iso) => fmtRelative(iso) };
const pillFor = (st) => ({ overdue: ['Late', 'bad'], due: ['Now', 'bad'], soon: ['Soon', 'warn'], snoozed: ['Snoozed', 'info'], later: ['Later', ''], done: ['Done', 'ok'], unknown: ['Needs odometer', 'warn'] }[st] || ['', '']);

route('/reminders', (ctx) => {
  ctx.header({ title: 'Reminders', back: '/', actions: [{ icon: 'plus', label: 'Add reminder', href: '#/reminder/new' }] });
  ctx.tab = 'home';
  const out = h('div', { class: 'stack' });
  ctx.root.append(h('a', { class: 'btn primary', href: '#/reminder/new' }, icon('plus', 26), 'Add a reminder'), out);
  function draw() {
    clear(out);
    const odo = odometerNow();
    const c = { now: new Date(), odometer_m: odo };
    out.append(h('div', { class: 'card row' }, h('div', { class: 'grow' }, h('div', { class: 'muted' }, 'Odometer'), h('div', { class: 'big-num mono' }, odo != null ? dist(odo) : 'Not set')),
      h('button', { class: 'btn small', type: 'button', onclick: async () => {
        const v = await openSheet((close) => {
          const inp = h('input', { inputmode: 'decimal', class: 'money-input', placeholder: '0', 'aria-label': 'Odometer', value: odo != null ? String(Math.round(odo / (prefs().unit === 'mi' ? 1609.344 : 1000))) : '' });
          return [h('h2', null, 'What does the odometer say?'), h('p', { class: 'muted' }, `Type the number on the dashboard, in ${unitName()}.`), inp,
            h('button', { class: 'btn primary', type: 'button', onclick: () => { const m = parseDistance(inp.value, prefs().unit); if (m == null) { toast('Type a number.', { bad: true }); return; } close(m); } }, 'Save'), h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Cancel')];
        }, { label: 'Odometer' });
        if (v != null) { await store.setProfile({ odometer_manual: { v, at: new Date().toISOString() } }, { dirty: false }); toast('Odometer saved.'); draw(); }
      } }, 'Update')));
    if (!prefs().notify && 'Notification' in window) out.append(banner('info', 'bell', h('div', null, h('b', null, 'Get a buzz when something is due'), h('p', null, 'Allow notifications so the phone can warn you even when you are in another app.'), h('button', { class: 'btn small', type: 'button', onclick: async () => { const r = await enableNotifications(); toast(r ? 'Notifications are on.' : 'Notifications are blocked. You can allow them in phone settings.', { bad: !r }); draw(); } }, 'Turn on'))));
    const all = live('reminders');
    const open = sortReminders(all.filter((r) => !r.done_at), c), done = all.filter((r) => r.done_at).sort((a, b) => b.done_at.localeCompare(a.done_at)).slice(0, 8);
    if (!open.length) out.append(empty('bell', 'No reminders', 'Add one for an oil change, insurance, your licence or a rest stop.'));
    else {
      const ul = h('ul', { class: 'list card tight' });
      for (const r of open) {
        const st = reminderState(r, c); const [pl, pk] = pillFor(st);
        ul.append(h('li', { class: 'stack', style: { padding: '12px 14px', borderBottom: '1px solid var(--line)' } },
          h('a', { class: 'row', href: `#/reminder/${r.id}`, style: { color: 'inherit', textDecoration: 'none' } }, h('span', { class: 'ico item', style: { border: 0, padding: 0, minHeight: 0, width: 'auto' } }, h('span', { class: 'ico' }, icon(r.kind === 'km' ? 'road' : 'clock', 26))),
            h('span', { class: 'grow' }, h('div', { class: 't', style: { fontWeight: '700' } }, r.title), h('div', { class: 'muted small' }, whenText(r, c, fmtHelpers))), pill(pl, pk)),
          ['due', 'overdue', 'soon', 'unknown'].includes(st) || r.kind === 'date' ? h('div', { class: 'btn-row two' },
            h('button', { class: 'btn small green', type: 'button', onclick: async () => { await store.save('reminders', { ...r, ...completeReminder(r, { odometer_m: odo }) }); toast(r.repeat !== 'none' || r.repeat_every_m ? 'Done. Next one is set.' : 'Done.'); } }, icon('check', 20), 'Done'),
            h('button', { class: 'btn small', type: 'button', onclick: () => snoozeSheet(r) }, icon('clock', 20), 'Later')) : null));
      }
      out.append(ul);
    }
    const withDates = open.filter((r) => r.kind === 'date' && r.due_at);
    if (withDates.length) out.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => {
      download('roadbook-reminders.ics', buildICS(withDates.map((r) => ({ uid: r.id, title: r.title, start: r.due_at, repeat: r.repeat, alarmMinutes: [r.lead_minutes || 0] }))), 'text/calendar');
      toast('Calendar file ready. Open it to add these to your phone calendar, which can ring even when this app is closed.');
    } }, icon('download', 24), 'Add to my phone calendar'), h('p', { class: 'small muted' }, 'Your phone calendar can ring when Roadbook is closed. Reminders inside Roadbook only speak while the app is open.'));
    if (done.length) out.append(h('details', { class: 'card' }, h('summary', { style: { fontWeight: '700', minHeight: '44px', display: 'flex', alignItems: 'center' } }, 'Finished reminders'), done.map((r) => h('div', { class: 'kv' }, h('span', null, r.title), h('span', { class: 'muted' }, fmtDateTime(r.done_at))))));
  }
  draw();
  ctx.watch(['reminders', 'trips', 'expenses', 'profile'], draw);
  const t = setInterval(draw, 60000); ctx.onLeave(() => clearInterval(t));
});

export async function snoozeSheet(r) {
  const opt = await openSheet((close) => [h('h2', null, 'Remind me later'), ...[[60, 'In 1 hour'], [240, 'In 4 hours'], [1440, 'Tomorrow'], [10080, 'In a week']].map(([m, l]) => h('button', { class: 'btn', type: 'button', onclick: () => close(m) }, l)), h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Cancel')], { label: 'Remind me later' });
  if (opt) { await store.save('reminders', { ...store.find('reminders', r.id), ...snoozePatch(opt) }); toast('I will remind you again.'); }
}

route('/reminder/:id', (ctx) => {
  const isNew = ctx.params.id === 'new';
  const r0 = isNew ? {} : store.find('reminders', ctx.params.id);
  ctx.header({ title: isNew ? 'New reminder' : 'Reminder', back: '/reminders' });
  ctx.tab = 'home';
  if (!r0) { ctx.root.append(empty('alert', 'Not found', null, h('a', { class: 'btn', href: '#/reminders' }, 'Back'))); return; }
  const st = { kind: r0.kind || 'date', repeat: r0.repeat || 'none' };
  const title = textInput({ id: 'rt', maxlength: 100, value: r0.title || '', placeholder: 'What should I remind you about?' });
  const defaultDue = new Date(Date.now() + 864e5); defaultDue.setHours(8, 0, 0, 0);
  const due = h('input', { type: 'datetime-local', id: 'rd', value: toLocalInput(r0.due_at || defaultDue) });
  const lead = selectInput(LEADS.map(([v, l]) => ({ value: String(v), label: l })), String(r0.lead_minutes ?? 60), { id: 'rl' });
  const repeat = selectInput(REPEATS.map(([v, l]) => ({ value: v, label: l })), st.repeat, { id: 'rr' });
  const unitDiv = prefs().unit === 'mi' ? 1609.344 : 1000;
  const dueOdo = h('input', { id: 'ro', inputmode: 'decimal', autocomplete: 'off', value: r0.due_odometer_m != null ? String(Math.round(r0.due_odometer_m / unitDiv)) : '', placeholder: 'e.g. 130000' });
  const every = h('input', { id: 're', inputmode: 'decimal', autocomplete: 'off', value: r0.repeat_every_m ? String(Math.round(r0.repeat_every_m / unitDiv)) : '', placeholder: 'e.g. 10000 (optional)' });
  const dateBox = h('div', { class: 'stack' }, field('When', due), field('Warn me', lead), field('Repeat', repeat));
  const kmBox = h('div', { class: 'stack' }, field(`Due at odometer (${unitName()})`, dueOdo, { hint: odometerNow() != null ? `Now: ${dist(odometerNow())}` : 'Set your odometer on the Reminders page first.' }), field(`Repeat every (${unitName()})`, every));
  const show = () => { dateBox.hidden = st.kind !== 'date'; kmBox.hidden = st.kind !== 'km'; };
  const chips = choiceChips(TEMPLATES, '', (id) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (t.title) title.value = t.title;
    st.kind = t.kind; kindSeg.replaceWith((kindSeg = makeSeg())); show();
    if (t.repeat) { repeat.value = t.repeat; }
    if (t.lead != null) lead.value = String(t.lead);
    if (t.every_km) { every.value = String(t.every_km); const o = odometerNow(); if (o != null && !dueOdo.value) dueOdo.value = String(Math.round(o / unitDiv) + t.every_km); }
  }, { label: 'Quick start' });
  const makeSeg = () => segmented([{ id: 'date', label: 'On a date' }, { id: 'km', label: 'At a distance' }], st.kind, (v) => { st.kind = v; show(); }, 'Kind of reminder');
  let kindSeg = makeSeg();
  show();
  const save = h('button', { class: 'btn primary', type: 'submit' }, icon('check', 26), 'Save reminder');
  ctx.root.append(h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (!title.value.trim()) { toast('Write what the reminder is for.', { bad: true }); title.focus(); return; }
    const row = { id: r0.id || uuid(), title: title.value.trim(), kind: st.kind, due_at: null, due_odometer_m: null, repeat: 'none', repeat_every_m: null, lead_minutes: 0, snoozed_until: null, done_at: null };
    if (st.kind === 'date') {
      const d = fromLocalInput(due.value); if (!d) { toast('Choose a date and time.', { bad: true }); return; }
      row.due_at = d.toISOString(); row.repeat = repeat.value; row.lead_minutes = Number(lead.value) || 0;
    } else {
      const m = parseDistance(dueOdo.value, prefs().unit); if (m == null) { toast('Type the odometer number it is due at.', { bad: true }); dueOdo.focus(); return; }
      row.due_odometer_m = m;
      if (every.value.trim()) { const ev = parseDistance(every.value, prefs().unit); if (ev == null || ev <= 0) { toast('Check the repeat distance.', { bad: true }); return; } row.repeat_every_m = ev; }
    }
    save.disabled = true;
    await store.save('reminders', { ...r0, ...row });
    toast('Reminder saved.'); go('/reminders');
  } },
  isNew ? h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Quick start'), chips) : null,
  h('div', { class: 'input-row' }, field('Reminder', title), h('div', { style: { alignSelf: 'end' } }, micButton((t) => { title.value = t.replace(/^remind me (to|about)\s*/i, ''); }, 'Say what to remind you about'))),
  h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Kind'), kindSeg), dateBox, kmBox, save,
  !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete this reminder?', yes: 'Yes, delete', no: 'No', danger: true })) { await store.remove('reminders', r0.id); toast('Deleted.'); go('/reminders'); } } }, icon('trash', 24), 'Delete') : null));
});
