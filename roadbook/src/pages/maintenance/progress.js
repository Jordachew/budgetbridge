// How far a service is through its interval, in words and as a 0..1 ratio for the Meter. Pure.
const DAY = 86400000;
const DEFAULT_KM_INTERVAL_M = 10000000;

/** dist(m) -> text. Returns { ratio, text, over, kind } or null when the record has no next-due target. */
export function serviceProgress(m, odo, dist, now = new Date()) {
  const out = [];
  if (m.next_due_at) {
    const next = new Date(m.next_due_at).getTime();
    const start = new Date(m.done_at).getTime();
    const total = Math.max(DAY, next - start);
    const left = Math.ceil((next - now.getTime()) / DAY);
    out.push({ kind: 'days', ratio: (now.getTime() - start) / total, over: left < 0,
      text: left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : left === 0 ? 'Due today' : `${left} day${left === 1 ? '' : 's'} left` });
  }
  if (m.next_due_odometer_m != null && odo != null) {
    const base = m.odometer_m ?? m.next_due_odometer_m - DEFAULT_KM_INTERVAL_M;
    const total = Math.max(1000, m.next_due_odometer_m - base);
    const left = m.next_due_odometer_m - odo;
    out.push({ kind: 'km', ratio: (odo - base) / total, over: left < 0, text: left < 0 ? `${dist(-left)} overdue` : `${dist(left)} to go` });
  }
  if (!out.length) return null;
  return out.reduce((a, b) => (b.ratio > a.ratio ? b : a));
}
