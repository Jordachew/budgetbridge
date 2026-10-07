// Groups trips into day / week / month buckets for the distance chart. Pure.
import { addDays, startOfWeek, startOfDay } from '../../core/dates.js';
import { toUnit } from './shared.js';

const MON = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const WD = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });
const DM = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const keyOf = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Returns { grain: 'day'|'week'|'month', data: [{ key, label, values: { km } }] } with values in the driver's unit. */
export function bucketTrips(trips, kind, range, unit = 'km', now = new Date()) {
  let grain = kind === 'week' ? 'day' : kind === 'month' ? 'week' : 'month';
  let from = range.from; let to = range.to;
  if (kind === 'all') {
    const firstT = trips.reduce((a, t) => Math.min(a, new Date(t.started_at).getTime()), Infinity);
    to = addDays(startOfDay(now), 1);
    from = Number.isFinite(firstT) ? new Date(firstT) : addDays(to, -28);
    const weeks = (to - from) / (7 * 86400000);
    grain = weeks <= 26 ? 'week' : 'month';
    if (grain === 'month') { const f = new Date(to.getFullYear(), to.getMonth() - 23, 1); if (from < f) from = f; }
  }
  const slots = [];
  if (grain === 'day') for (let d = startOfDay(from); d < to; d = addDays(d, 1)) slots.push({ start: d, label: WD.format(d) });
  else if (grain === 'week') for (let d = startOfWeek(from); d < to; d = addDays(d, 7)) slots.push({ start: d, label: DM.format(d) });
  else for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) slots.push({ start: d, label: MON.format(d) });
  const bucketStart = (t) => {
    const d = new Date(t);
    if (grain === 'day') return keyOf(startOfDay(d));
    if (grain === 'week') return keyOf(startOfWeek(d));
    return keyOf(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const sums = new Map();
  for (const t of trips) { const k = bucketStart(t.started_at); sums.set(k, (sums.get(k) || 0) + (t.distance_m || 0)); }
  const data = slots.map((s) => ({ key: keyOf(s.start), label: s.label, values: { km: toUnit(sums.get(keyOf(s.start)) || 0, unit) } }));
  return { grain, data };
}
