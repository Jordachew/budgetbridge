import { useState } from 'react';
import { Field, Input, Select, Textarea } from '../../components/ui.jsx';
import { FormModal } from './formKit.jsx';
import { create, save } from '../../state/data.js';
import { parseDistance, unitLabel } from '../../core/format.js';
import { usePrefs } from '../../state/prefs.js';
import { useToast } from '../../components/toast.jsx';

export default function VehicleForm({ open, onClose, vehicle }) {
  const { unit } = usePrefs();
  const toast = useToast();
  const editing = !!vehicle?.id;
  const [f, setF] = useState({
    name: vehicle?.name || '', plate: vehicle?.plate || '', make: vehicle?.make || '', model: vehicle?.model || '', year: vehicle?.year ?? '', vin: vehicle?.vin || '',
    fuel_type: vehicle?.fuel_type || 'diesel', tank: vehicle?.tank_litres ?? '', odo: vehicle?.odometer_m != null ? String(Math.round((vehicle.odometer_m / 1000 / (unit === 'mi' ? 1.609344 : 1)) * 10) / 10) : '', notes: vehicle?.notes || '',
  });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    const e = {};
    if (!f.name.trim()) e.name = 'Give the vehicle a name, for example "Blue Isuzu".';
    const year = f.year === '' ? null : Number(f.year);
    if (year != null && (!Number.isInteger(year) || year < 1950 || year > 2100)) e.year = 'Type a four-digit year between 1950 and 2100.';
    const tank = f.tank === '' ? null : Number(f.tank);
    if (tank != null && (!(tank > 0) || tank > 5000)) e.tank = 'Tank size is a number of litres, up to 5000.';
    const odo = f.odo.trim() === '' ? null : parseDistance(f.odo, unit);
    if (f.odo.trim() !== '' && odo == null) e.odo = 'Type the odometer as a number, for example 125430.';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const row = { ...(vehicle || {}), name: f.name.trim().slice(0, 60), plate: f.plate.trim().slice(0, 20), make: f.make.trim().slice(0, 40), model: f.model.trim().slice(0, 40), year, vin: f.vin.trim().slice(0, 30), fuel_type: f.fuel_type, tank_litres: tank, odometer_m: odo, notes: f.notes.trim().slice(0, 1000) };
      if (editing) await save('vehicles', row); else await create('vehicles', row);
      toast(editing ? 'Vehicle updated.' : 'Vehicle added.');
      onClose();
    } catch (x) { console.error(x); toast('Could not save the vehicle.', { bad: true }); }
    setBusy(false);
  }

  return (
    <FormModal open={open} onClose={onClose} title={editing ? 'Edit vehicle' : 'Add a vehicle'} submitLabel={editing ? 'Save changes' : 'Add vehicle'} busy={busy} onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={err.name} className="sm:col-span-2">{(id) => <Input id={id} data-autofocus value={f.name} maxLength={60} onChange={set('name')} placeholder="Blue Isuzu" />}</Field>
        <Field label="Licence plate">{(id) => <Input id={id} value={f.plate} maxLength={20} onChange={set('plate')} placeholder="8821 HJ" className="uppercase" />}</Field>
        <Field label="Fuel">{(id) => <Select id={id} value={f.fuel_type} onChange={set('fuel_type')}><option value="diesel">Diesel</option><option value="petrol">Petrol</option><option value="lpg">LPG</option><option value="other">Other</option></Select>}</Field>
        <Field label="Make">{(id) => <Input id={id} value={f.make} maxLength={40} onChange={set('make')} />}</Field>
        <Field label="Model">{(id) => <Input id={id} value={f.model} maxLength={40} onChange={set('model')} />}</Field>
        <Field label="Year" error={err.year}>{(id) => <Input id={id} inputMode="numeric" value={f.year} onChange={set('year')} />}</Field>
        <Field label="Tank size (litres)" error={err.tank}>{(id) => <Input id={id} inputMode="decimal" value={f.tank} onChange={set('tank')} />}</Field>
        <Field label={`Odometer (${unitLabel(unit)})`} error={err.odo} hint="Leave blank to use readings from trips and receipts." className="sm:col-span-2">{(id) => <Input id={id} inputMode="decimal" value={f.odo} onChange={set('odo')} />}</Field>
        <Field label="VIN / chassis number" className="sm:col-span-2">{(id) => <Input id={id} value={f.vin} maxLength={30} onChange={set('vin')} />}</Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} value={f.notes} maxLength={1000} onChange={set('notes')} />}</Field>
      </div>
    </FormModal>
  );
}
