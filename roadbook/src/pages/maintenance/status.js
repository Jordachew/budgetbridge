const DAY = 86400000;
export const SOON_DAYS = 30;
export const SOON_KM_M = 1000000; // 1,000 km

export const KINDS = [
  { id: 'oil', label: 'Oil change' }, { id: 'tyres', label: 'Tyres' }, { id: 'brakes', label: 'Brakes' },
  { id: 'inspection', label: 'Inspection' }, { id: 'repair', label: 'Repair' }, { id: 'other', label: 'Other' },
];
export const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label || 'Other';
export const DOC_KINDS = [
  { id: 'licence', label: 'Licence' }, { id: 'insurance', label: 'Insurance' }, { id: 'registration', label: 'Registration' },
  { id: 'fitness', label: 'Fitness' }, { id: 'permit', label: 'Permit' }, { id: 'other', label: 'Other' },
];
export const docKindLabel = (id) => DOC_KINDS.find((k) => k.id === id)?.label || 'Other';

/** 'overdue' | 'soon' | 'ok' | 'done' (a newer record of the same kind replaced it) | 'none' (no next due set). */
export function maintStatus(m, odometer_m, all = [], now = new Date()) {
  if (m.next_due_at == null && m.next_due_odometer_m == null) return 'none';
  const newer = all.some((x) => x.id !== m.id && x.vehicle_id === m.vehicle_id && x.kind === m.kind && new Date(x.done_at) > new Date(m.done_at));
  if (newer) return 'done';
  let st = 'ok';
  if (m.next_due_at) {
    const left = new Date(m.next_due_at).getTime() - now.getTime();
    if (left < 0) return 'overdue';
    if (left <= SOON_DAYS * DAY) st = 'soon';
  }
  if (m.next_due_odometer_m != null && odometer_m != null) {
    const left = m.next_due_odometer_m - odometer_m;
    if (left <= 0) return 'overdue';
    if (left <= SOON_KM_M) st = 'soon';
  }
  return st;
}
export const STATUS_UI = {
  overdue: { tone: 'red', label: 'Overdue' }, soon: { tone: 'amber', label: 'Due soon' }, ok: { tone: 'green', label: 'OK' },
  done: { tone: 'neutral', label: 'Done since' }, none: { tone: 'neutral', label: 'No next date' },
};

/** Whole days until a 'YYYY-MM-DD' date (negative when past). */
export function daysUntil(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const a = new Date(y, m - 1, d).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / DAY);
}
export function docStatus(doc, now = new Date()) {
  const d = daysUntil(doc.expires_at, now);
  if (d == null) return { key: 'none', tone: 'neutral', label: 'No expiry', days: null };
  if (d < 0) return { key: 'expired', tone: 'red', label: `Expired ${-d} day${d === -1 ? '' : 's'} ago`, days: d };
  if (d <= SOON_DAYS) return { key: 'soon', tone: 'amber', label: d === 0 ? 'Expires today' : `Expires in ${d} day${d === 1 ? '' : 's'}`, days: d };
  return { key: 'valid', tone: 'green', label: 'Valid', days: d };
}
