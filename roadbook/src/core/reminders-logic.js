// When is a reminder due, and what happens when the driver ticks it off?
// Date reminders use due_at; distance reminders use due_odometer_m against the truck's odometer.

import { addInterval } from './dates.js';

const MIN = 60000;
export const KM_LEAD_M = 500000; // distance reminders warn 500 km ahead

export function isSnoozed(r, now = new Date()) {
  return !!r.snoozed_until && new Date(r.snoozed_until).getTime() > now.getTime();
}

/** Metres left until a distance reminder is due (negative once passed), or null if not a distance reminder. */
export function metersLeft(r, odometer_m) {
  if (r.kind !== 'km' || r.due_odometer_m == null || odometer_m == null) return null;
  return r.due_odometer_m - odometer_m;
}

/**
 * 'done' | 'snoozed' | 'overdue' | 'due' | 'soon' | 'later' | 'unknown'
 * due = reached the time (or distance); soon = inside the lead window.
 */
export function reminderState(r, { now = new Date(), odometer_m = null } = {}) {
  if (r.done_at) return 'done';
  if (r.deleted_at) return 'done';
  if (isSnoozed(r, now)) return 'snoozed';
  if (r.kind === 'km') {
    const left = metersLeft(r, odometer_m);
    if (left == null) return 'unknown';
    if (left < -1000) return 'overdue';
    if (left <= 0) return 'due';
    return left <= KM_LEAD_M ? 'soon' : 'later';   // default: warn 500 km ahead
  }
  if (!r.due_at) return 'unknown';
  const due = new Date(r.due_at).getTime();
  const t = now.getTime();
  if (t - due > 60 * MIN) return 'overdue';
  if (t >= due) return 'due';
  return due - t <= (r.lead_minutes ?? 0) * MIN ? 'soon' : 'later';
}

/** The moment this reminder should speak or notify next (ms), or null. */
export function fireTime(r) {
  if (r.done_at || r.deleted_at || r.kind !== 'date' || !r.due_at) return null;
  const due = new Date(r.due_at).getTime();
  if (Number.isNaN(due)) return null;
  const lead = Math.max(0, r.lead_minutes ?? 0) * MIN;
  const t = due - lead;
  const snooze = r.snoozed_until ? new Date(r.snoozed_until).getTime() : 0;
  return Math.max(t, snooze);
}

/** Next due date after `now` for a repeating date reminder (never loops forever: capped). */
export function nextDueDate(due, repeat, now = new Date()) {
  if (!repeat || repeat === 'none') return null;
  for (let i = 1; i <= 5000; i++) {
    const next = addInterval(due, repeat, i);
    if (next.getTime() > now.getTime()) return next;
  }
  return null;
}

/**
 * What to save when the driver taps "Done".
 * Repeating reminders move on to their next date or distance; one-off reminders are closed.
 * Returns a patch for the reminder row.
 */
export function completeReminder(r, { now = new Date(), odometer_m = null } = {}) {
  const stamp = now.toISOString();
  if (r.kind === 'km' && r.repeat_every_m > 0) {
    const base = Math.max(r.due_odometer_m ?? 0, odometer_m ?? 0);
    let next = (r.due_odometer_m ?? base) + r.repeat_every_m;
    if (next <= base) next = base + r.repeat_every_m;
    return { due_odometer_m: next, snoozed_until: null, done_at: null };
  }
  if (r.kind === 'date' && r.repeat && r.repeat !== 'none' && r.due_at) {
    const next = nextDueDate(r.due_at, r.repeat, now);
    if (next) return { due_at: next.toISOString(), snoozed_until: null, done_at: null };
  }
  return { done_at: stamp, snoozed_until: null };
}

export function snoozePatch(minutes, now = new Date()) {
  const m = Math.min(Math.max(1, Math.round(minutes)), 60 * 24 * 14);
  return { snoozed_until: new Date(now.getTime() + m * MIN).toISOString() };
}

/** Sort: needs attention first, then soonest. */
const ORDER = { overdue: 0, due: 1, soon: 2, snoozed: 3, later: 4, unknown: 5, done: 6 };
export function sortReminders(list, ctx) {
  const key = (r) => (r.kind === 'km' ? (metersLeft(r, ctx.odometer_m) ?? Infinity) / 1000 : (new Date(r.due_at).getTime() || Infinity) / 1e6);
  return [...list].sort((a, b) => ORDER[reminderState(a, ctx)] - ORDER[reminderState(b, ctx)] || key(a) - key(b));
}

/** Plain words for a reminder's timing, for the list and for being read aloud. */
export function whenText(r, ctx, fmt) {
  const st = reminderState(r, ctx);
  if (r.kind === 'km') {
    const left = metersLeft(r, ctx.odometer_m);
    if (left == null) return 'Set your odometer to track this';
    return left <= 0 ? `${fmt.distance(-left)} past due` : `in ${fmt.distance(left)}`;
  }
  return st === 'done' ? 'Done' : fmt.relative(r.due_at);
}
