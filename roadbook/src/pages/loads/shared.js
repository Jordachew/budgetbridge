// Status vocabulary and small helpers shared by the Loads and Expenses screens.
import { ClipboardList, PackageCheck, Truck, MapPinCheck, BadgeCheck, XCircle } from 'lucide-react';
import { save } from '../../state/data.js';
import { fmtDate, fmtTime } from '../../core/format.js';

export const FLOW = ['booked', 'picked_up', 'in_transit', 'delivered', 'reconciled'];
export const STATUS = {
  booked: { label: 'Booked', tone: 'neutral', icon: ClipboardList },
  picked_up: { label: 'Picked up', tone: 'blue', icon: PackageCheck },
  in_transit: { label: 'In transit', tone: 'brand', icon: Truck },
  delivered: { label: 'Delivered', tone: 'green', icon: MapPinCheck },
  reconciled: { label: 'Reconciled', tone: 'green', icon: BadgeCheck },
  cancelled: { label: 'Cancelled', tone: 'red', icon: XCircle },
};
export const ACTIVE = ['booked', 'picked_up', 'in_transit'];
export const statusLabel = (s) => (STATUS[s] || STATUS.booked).label;
export const nextStatus = (s) => FLOW[FLOW.indexOf(s) + 1] || null;
/** A load handed over by a fleet owner was created by someone else: the driver may update it but not delete it. */
export const isDispatched = (load) => !!load.created_by && !!load.user_id && load.created_by !== load.user_id;
export const routeText = (l) => [l.pickup_label, l.drop_label].filter(Boolean).join(' → ');
export const loadName = (l) => l.reference || l.customer || 'Load';

/** "Today, 3:00 pm" / "Tomorrow" / "Mon 5 Oct". */
export function relDay(iso, { time = true } = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((b - a) / 86400000);
  const word = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : fmtDate(d, { year: Math.abs(diff) > 300 });
  return time ? `${word}, ${fmtTime(d).toLowerCase()}` : word;
}

/** Billing state of a load from its invoices: none | draft | unpaid | paid. */
export function billing(invoices) {
  const list = (invoices || []).filter((i) => i.status !== 'void');
  if (!list.length) return 'none';
  if (list.every((i) => i.status === 'paid')) return 'paid';
  if (list.some((i) => i.status === 'sent')) return 'unpaid';
  return 'draft';
}

/**
 * What the driver should do next with this load. type: 'status' (flip the status here),
 * 'proof' (open delivery proof), 'invoice' (create one), 'pay' (go record the payment).
 */
export function nextAction(load, { invoices = [], delivery } = {}) {
  const b = billing(invoices);
  switch (load.status) {
    case 'cancelled': return { type: 'status', to: 'booked', label: 'Reopen load', short: 'Reopen', hint: 'Put this load back on the board.' };
    case 'booked': return { type: 'status', to: 'picked_up', label: 'Mark picked up', short: 'Picked up', hint: 'Tap this once the load is on your truck.' };
    case 'picked_up': return { type: 'status', to: 'in_transit', label: 'Start the trip', short: 'In transit', hint: 'Tap this when you pull out. The load shows as on the road.' };
    case 'in_transit': if (delivery) return { type: 'status', to: 'delivered', label: 'Mark delivered', short: 'Delivered', hint: 'The proof is sealed. Move the load to delivered.' };
      return { type: 'proof', label: 'Start delivery proof', short: 'Delivered', hint: 'At drop-off: count the items, get a signature and a photo. It seals the load as delivered.' };
    case 'delivered':
      if (b === 'none' || b === 'draft') return { type: 'invoice', label: b === 'draft' ? 'Finish the invoice' : 'Create invoice', short: b === 'draft' ? 'Finish invoice' : 'Create invoice', hint: 'The load is dropped. Bill the customer so you get paid.' };
      if (b === 'unpaid') return { type: 'pay', label: 'Record payment', short: 'Record payment', hint: 'Waiting on the customer. Record the payment when it lands.' };
      return { type: 'status', to: 'reconciled', label: 'Mark reconciled', short: 'Reconciled', hint: 'Paid in full. Close the books on this load.' };
    default: return null;
  }
}

/** Change a load's status with an Undo toast. */
export async function setLoadStatus(load, status, toast) {
  await save('loads', { ...load, status });
  toast(`${loadName(load)} is now ${statusLabel(status).toLowerCase()}`, { ms: 7000, action: { label: 'Undo', run: () => save('loads', { ...load }) } });
}

/** Position of the truck along the road for each stage, 0..1. */
export const PROGRESS = { booked: 0, picked_up: 0.12, in_transit: 0.55, delivered: 1, reconciled: 1, cancelled: 0 };
