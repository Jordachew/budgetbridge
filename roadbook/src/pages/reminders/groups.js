// Sorts reminders into the four lists drivers think in: Overdue, Today, Upcoming, Done. Pure.
import { reminderState, sortReminders } from '../../core/reminders-logic.js';

export function groupReminders(list, ctx) {
  const g = { overdue: [], today: [], upcoming: [], done: [] };
  const sod = new Date(ctx.now); sod.setHours(0, 0, 0, 0);
  const eod = new Date(sod); eod.setDate(eod.getDate() + 1);
  for (const r of sortReminders(list, ctx)) {
    const s = reminderState(r, ctx);
    if (s === 'done') g.done.push(r);
    else if (s === 'overdue') g.overdue.push(r);
    else if (r.kind === 'km') (s === 'due' ? g.overdue : g.upcoming).push(r);
    else {
      const when = new Date(s === 'snoozed' && r.snoozed_until ? r.snoozed_until : r.due_at);
      if (s === 'due' || (when >= sod && when < eod)) g.today.push(r); else g.upcoming.push(r);
    }
  }
  g.done.sort((a, b) => String(b.done_at).localeCompare(String(a.done_at)));
  return g;
}
