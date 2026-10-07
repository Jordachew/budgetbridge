import { useState } from 'react';
import { Modal, Button, Field, Input, Select, Textarea } from '../../components/ui.jsx';
import { create, save } from '../../state/data.js';
import { parseMoney, fmtMoney } from '../../core/format.js';
import { useToast } from '../../components/toast.jsx';
import { useCurrency } from '../../lib/hooks.js';
import { PLACE_KINDS } from './kinds.js';

const priceText = (c) => (c == null ? '' : String(c / 100));

/** place: existing row to edit, or { lat, lng, name?, kind? } for a new one. */
export default function PlaceForm({ open, onClose, place, onMyLocation }) {
  const toast = useToast();
  const cur = useCurrency();
  const editing = !!place?.id;
  const [f, setF] = useState({
    name: place?.name || '', kind: place?.kind || 'other', lat: place?.lat != null ? String(Math.round(place.lat * 1e6) / 1e6) : '', lng: place?.lng != null ? String(Math.round(place.lng * 1e6) / 1e6) : '',
    note: place?.note || '', price: priceText(place?.fuel_price_cents),
  });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function useHere() {
    const p = await onMyLocation?.();
    if (p) setF((x) => ({ ...x, lat: String(Math.round(p.lat * 1e6) / 1e6), lng: String(Math.round(p.lng * 1e6) / 1e6) }));
    else toast('Could not find your location. Type the coordinates or tap the map instead.', { bad: true });
  }

  async function submit() {
    const e = {};
    const name = f.name.trim();
    if (!name) e.name = 'Give this place a name, for example "Texaco Mandeville".';
    const lat = Number(f.lat); const lng = Number(f.lng);
    if (f.lat === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) e.lat = 'Latitude is a number from -90 to 90.';
    if (f.lng === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) e.lng = 'Longitude is a number from -180 to 180.';
    let price = null;
    if (f.price.trim() !== '') {
      price = parseMoney(f.price);
      if (price == null || price > 1000000) e.price = 'Type the price for one litre as a number, for example 215.50.';
    }
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const row = { ...(place || {}), name: name.slice(0, 100), kind: f.kind, lat, lng, note: f.note.trim().slice(0, 300), fuel_price_cents: f.kind === 'fuel' ? price : null };
      if (editing) await save('places', row); else await create('places', row);
      toast(editing ? 'Place updated.' : 'Place saved.');
      onClose();
    } catch (x) { console.error(x); toast('Could not save the place.', { bad: true }); }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit place' : 'Add a place'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{editing ? 'Save changes' : 'Save place'}</Button></>}>
      <div className="space-y-4">
        <Field label="Name" error={err.name}>{(id) => <Input id={id} value={f.name} maxLength={100} onChange={set('name')} />}</Field>
        <Field label="Type">{(id) => <Select id={id} value={f.kind} onChange={set('kind')}>{PLACE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>}</Field>
        {f.kind === 'fuel' && <Field label={`Price per litre (${cur})`} hint={f.price && parseMoney(f.price) != null ? `Shown as ${fmtMoney(parseMoney(f.price), cur)} per litre` : 'Optional'} error={err.price}>{(id) => <Input id={id} inputMode="decimal" value={f.price} onChange={set('price')} placeholder="215.50" />}</Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude" error={err.lat}>{(id) => <Input id={id} inputMode="decimal" value={f.lat} onChange={set('lat')} placeholder="18.0179" />}</Field>
          <Field label="Longitude" error={err.lng}>{(id) => <Input id={id} inputMode="decimal" value={f.lng} onChange={set('lng')} placeholder="-76.8099" />}</Field>
        </div>
        {onMyLocation && <Button variant="soft" size="sm" onClick={useHere}>Use my location</Button>}
        <Field label="Note (optional)">{(id) => <Textarea id={id} value={f.note} maxLength={300} onChange={set('note')} placeholder="Gate code, opening hours, tips" />}</Field>
      </div>
    </Modal>
  );
}
