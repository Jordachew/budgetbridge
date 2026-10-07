// Status vocabulary and small helpers shared by the Loads screens.
export const FLOW = ['booked', 'picked_up', 'in_transit', 'delivered', 'reconciled'];
export const STATUS = {
  booked: { label: 'Booked', tone: 'neutral' },
  picked_up: { label: 'Picked up', tone: 'blue' },
  in_transit: { label: 'In transit', tone: 'brand' },
  delivered: { label: 'Delivered', tone: 'green' },
  reconciled: { label: 'Reconciled', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};
export const statusLabel = (s) => (STATUS[s] || STATUS.booked).label;
export const nextStatus = (s) => FLOW[FLOW.indexOf(s) + 1] || null;
/** A load handed over by a fleet owner was created by someone else: the driver may update it but not delete it. */
export const isDispatched = (load) => !!load.created_by && !!load.user_id && load.created_by !== load.user_id;
export const routeText = (l) => [l.pickup_label, l.drop_label].filter(Boolean).join(' → ');
