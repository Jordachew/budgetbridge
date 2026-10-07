import { useState } from 'react';
import { Modal, Button, Field, Input, Select, Textarea, Segmented, Banner } from '../../components/ui.jsx';
import { create, save } from '../../state/data.js';
import { usePrefs } from '../../state/prefs.js';
import { fmtDistance, parseDistance, toLocalInput, fromLocalInput, unitLabel } from '../../core/format.js';
import { useToast } from '../../components/toast.jsx';
import { loadLabel, useLoadVehicleOptions } from './shared.js';

const fromM = (m, unit) => (m == null ? '' : String(Math.round((m / 1000 / (unit === 'mi' ? 1.609344 : 1)) * 10) / 10));

/** Add a trip by odometer, or edit any trip. */
export default function TripForm({ open, onClose, trip }) {
  const { unit } = usePrefs();
  const toast = useToast();
  const { loads, vehicles } = useLoadVehicleOptions();
  const editing = !!trip;
  const isGps = trip?.method === 'gps';
  const [f, setF] = useState(() => ({
    mode: trip?.method === 'gps' ? 'distance' : 'odometer',
    started: toLocalInput(trip?.started_at || new Date(Date.now() - 3600000)),
    ended: toLocalInput(trip?.ended_at || new Date()),
    startOdo: fromM(trip?.start_odometer_m, unit), endOdo: fromM(trip?.end_odometer_m, unit),
    distance: fromM(trip?.distance_m, unit),
    origin: trip?.origin_label || '', dest: trip?.dest_label || '', load: trip?.load_id || '', vehicle: trip?.vehicle_id || '', note: trip?.note || '',
  }));
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const so = parseDistance(f.startOdo, unit); const eo = parseDistance(f.endOdo, unit);
  const calc = so != null && eo != null && eo >= so ? eo - so : null;

  async function submit() {
    const e = {};
    const started = fromLocalInput(f.started); const ended = fromLocalInput(f.ended);
    if (!started) e.started = 'Choose when the trip started.';
    if (!ended) e.ended = 'Choose when the trip ended.';
    else if (started && ended < started) e.ended = 'The end time cannot be before the start time.';
    let distance;
    const odo = f.mode === 'odometer';
    if (odo) {
      if (so == null) e.startOdo = 'Type the odometer reading at the start, for example 125430.';
      if (eo == null) e.endOdo = 'Type the odometer reading at the end.';
      if (so != null && eo != null && eo < so) e.endOdo = 'The end reading must be higher than the start reading.';
      distance = calc;
    } else {
      distance = parseDistance(f.distance, unit);
      if (distance == null) e.distance = 'Type the distance as a number, for example 85.5.';
    }
    if (distance != null && distance > 50000000) e.distance = 'That is more than 50,000 km, which is too long for one trip.';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const row = {
        ...(trip || {}),
        started_at: started.toISOString(), ended_at: ended.toISOString(), distance_m: Math.round(distance),
        method: odo ? 'odometer' : (trip?.method || 'gps'),
        start_odometer_m: odo ? so : (trip?.start_odometer_m ?? null), end_odometer_m: odo ? eo : (trip?.end_odometer_m ?? null),
        origin_label: f.origin.trim().slice(0, 200), dest_label: f.dest.trim().slice(0, 200), note: f.note.trim().slice(0, 500),
        load_id: f.load || null, vehicle_id: f.vehicle || null,
      };
      if (!editing) row.path = [];
      if (editing) await save('trips', row); else await create('trips', row);
      toast(editing ? 'Trip updated.' : 'Trip added.');
      onClose();
    } catch (x) { console.error(x); toast('Could not save the trip.', { bad: true }); }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit trip' : 'Add a trip by odometer'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{editing ? 'Save changes' : 'Add trip'}</Button></>}>
      <div className="space-y-4">
        {editing && isGps && <Banner tone="blue">This trip was recorded by GPS. You can fix the distance if the signal was poor.</Banner>}
        {!(editing && isGps) && <Segmented value={f.mode} onChange={(mode) => setF({ ...f, mode })} options={[{ value: 'odometer', label: 'From odometer' }, { value: 'distance', label: 'Type distance' }]} />}
        {f.mode === 'odometer' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Start reading (${unit})`} error={err.startOdo}>{(id) => <Input id={id} inputMode="decimal" value={f.startOdo} onChange={set('startOdo')} placeholder="125430" />}</Field>
            <Field label={`End reading (${unit})`} error={err.endOdo}>{(id) => <Input id={id} inputMode="decimal" value={f.endOdo} onChange={set('endOdo')} placeholder="125610" />}</Field>
            <p className="col-span-2 text-sm text-ink-500">Distance: <b className="text-ink-900 dark:text-white">{calc != null ? fmtDistance(calc, unit) : 'fill in both readings'}</b></p>
          </div>
        ) : (
          <Field label={`Distance (${unitLabel(unit)})`} error={err.distance}>{(id) => <Input id={id} inputMode="decimal" value={f.distance} onChange={set('distance')} placeholder="85.5" />}</Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Started" error={err.started}>{(id) => <Input id={id} type="datetime-local" value={f.started} onChange={set('started')} />}</Field>
          <Field label="Finished" error={err.ended}>{(id) => <Input id={id} type="datetime-local" value={f.ended} onChange={set('ended')} />}</Field>
          <Field label="From">{(id) => <Input id={id} value={f.origin} maxLength={200} onChange={set('origin')} />}</Field>
          <Field label="To">{(id) => <Input id={id} value={f.dest} maxLength={200} onChange={set('dest')} />}</Field>
          <Field label="Load">{(id) => (
            <Select id={id} value={f.load} onChange={set('load')}><option value="">No load</option>{loads.map((l) => <option key={l.id} value={l.id}>{loadLabel(l)}</option>)}</Select>)}</Field>
          <Field label="Vehicle">{(id) => (
            <Select id={id} value={f.vehicle} onChange={set('vehicle')}><option value="">Not set</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>)}</Field>
        </div>
        <Field label="Note">{(id) => <Textarea id={id} value={f.note} maxLength={500} onChange={set('note')} />}</Field>
      </div>
    </Modal>
  );
}
