import { useEffect, useMemo, useState } from 'react';
import { useRows } from '../../state/data.js';
import { reminderState } from '../../core/reminders-logic.js';
import { useOverallOdometer } from '../maintenance/odo.js';

/** Re-renders once a minute so "due" states stay fresh while the app is open. */
export function useMinuteTick() {
  const [n, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  return n;
}

/** Number of reminders that are due now or overdue (for a badge in the navigation). */
export function useDueReminderCount() {
  const reminders = useRows('reminders');
  const odometer_m = useOverallOdometer();
  const tick = useMinuteTick();
  return useMemo(() => {
    const ctx = { now: new Date(), odometer_m };
    return reminders.filter((r) => { const s = reminderState(r, ctx); return s === 'due' || s === 'overdue'; }).length;
  }, [reminders, odometer_m, tick]);
}
