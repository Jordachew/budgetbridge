import { useMemo } from 'react';
import { useRows } from '../../state/data.js';

export const loadLabel = (l) => [l.reference, l.customer].filter(Boolean).join(' - ') || 'Load';

/** Loads and vehicles as <option> data. */
export function useLoadVehicleOptions() {
  const loads = useRows('loads');
  const vehicles = useRows('vehicles');
  return useMemo(() => ({
    loads: [...loads].filter((l) => l.status !== 'cancelled').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    vehicles: [...vehicles].sort((a, b) => a.name.localeCompare(b.name)),
  }), [loads, vehicles]);
}

export const tripMinutes = (t) => (t.started_at && t.ended_at ? Math.max(0, new Date(t.ended_at) - new Date(t.started_at)) : 0);
export const tripTitle = (t) => (t.origin_label || t.dest_label ? `${t.origin_label || 'Start'} to ${t.dest_label || 'End'}` : 'Trip');

export const KM_PER_MI = 1.609344;
/** Metres -> number in the driver's unit (km or mi). */
export const toUnit = (m, unit = 'km') => (Number(m) || 0) / 1000 / (unit === 'mi' ? KM_PER_MI : 1);
/** Metres per second -> whole km/h or mph. */
export const speedValue = (mps, unit = 'km') => Math.round((Number(mps) || 0) * 3.6 / (unit === 'mi' ? KM_PER_MI : 1));
