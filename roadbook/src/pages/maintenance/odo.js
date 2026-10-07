import { useMemo } from 'react';
import { currentOdometer } from '../../core/calc.js';
import { useRows } from '../../state/data.js';

/** Latest known odometer (metres) for a vehicle, from its own trips, fuel receipts, services and the typed value. */
export function vehicleOdometer(v, { trips, expenses, maintenance }) {
  const t = trips.filter((x) => x.vehicle_id === v.id);
  const e = expenses.filter((x) => x.vehicle_id === v.id);
  const m = maintenance.filter((x) => x.vehicle_id === v.id && x.odometer_m != null).map((x) => ({ odometer_m: x.odometer_m, spent_at: x.done_at }));
  return currentOdometer(t, [...e, ...m], v.odometer_m != null ? { v: v.odometer_m, at: v.updated_at || v.created_at } : null);
}

/** One odometer for the whole app (used by distance reminders): the highest vehicle reading, or from all trips and receipts. */
export function overallOdometer({ vehicles, trips, expenses, maintenance }) {
  const all = [];
  for (const v of vehicles) { const o = vehicleOdometer(v, { trips, expenses, maintenance }); if (o != null) all.push(o); }
  const loose = currentOdometer(trips, expenses, null);
  if (loose != null) all.push(loose);
  return all.length ? Math.max(...all) : null;
}

export function useOdometerData() {
  const vehicles = useRows('vehicles'); const trips = useRows('trips'); const expenses = useRows('expenses'); const maintenance = useRows('maintenance');
  return useMemo(() => ({ vehicles, trips, expenses, maintenance }), [vehicles, trips, expenses, maintenance]);
}
export function useOverallOdometer() {
  const d = useOdometerData();
  return useMemo(() => overallOdometer(d), [d]);
}
