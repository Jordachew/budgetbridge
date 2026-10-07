import { useMemo, useState } from 'react';
import { Plus, X, Search, LocateFixed, Navigation, ExternalLink } from 'lucide-react';
import { Modal, Button, Field, Input, Select, Textarea, Banner, IconButton } from '../../components/ui.jsx';
import { create, save } from '../../state/data.js';
import { haversine, mapsLink, wazeLink } from '../../core/geo.js';
import { toLocalInput, fromLocalInput } from '../../core/format.js';
import { useDistance } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import { loadLabel, useLoadVehicleOptions } from '../trips/shared.js';
import LeafMap from './LeafMap.jsx';
import { geocodeAll } from './geocode.js';

export default function PlanForm({ open, onClose, plan, meApi }) {
  const toast = useToast();
  const dist = useDistance();
  const { loads } = useLoadVehicleOptions();
  const editing = !!plan?.id;
  const [f, setF] = useState({
    title: plan?.title || '', origin: plan?.origin || '', destination: plan?.destination || '',
    stops: (plan?.stops || []).map((s) => s.label || ''), planned: plan?.planned_at ? toLocalInput(plan.planned_at) : '', notes: plan?.notes || '', load: plan?.load_id || '',
  });
  const [found, setFound] = useState({});   // label -> {lat,lng} | 'notfound' | 'offline'
  const [looking, setLooking] = useState(false);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const labels = [f.origin, ...f.stops, f.destination].map((s) => s.trim()).filter(Boolean);
  const pts = labels.map((l) => found[l]);
  const resolved = pts.every((p) => p && typeof p === 'object');
  const estimate = useMemo(() => {
    if (labels.length < 2 || !resolved) return null;
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += haversine(pts[i - 1], pts[i]);
    return Math.round(m);
  }, [labels.join('|'), found]); // eslint-disable-line
  const mapPts = pts.map((p, i) => (p && typeof p === 'object' ? { ...p, label: labels[i], i } : null)).filter(Boolean);
  const failed = labels.filter((l) => found[l] === 'notfound');
  const offline = labels.some((l) => found[l] === 'offline');

  async function lookUp() {
    if (labels.length < 2) { setErr({ origin: f.origin.trim() ? '' : 'Type where the trip starts.', destination: f.destination.trim() ? '' : 'Type where it ends.' }); return; }
    setLooking(true); setErr({});
    const todo = [...new Set(labels)].filter((l) => !(found[l] && typeof found[l] === 'object'));
    const res = await geocodeAll(todo, (part) => setFound((x) => ({ ...x, ...part })));
    setFound((x) => ({ ...x, ...res }));
    setLooking(false);
  }
  async function myLocation() {
    const p = await meApi.locate();
    if (p) setF((x) => ({ ...x, origin: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` }));
    else toast('Could not read your location.', { bad: true });
  }
  const setStop = (i, v) => setF({ ...f, stops: f.stops.map((s, j) => (j === i ? v : s)) });

  async function submit() {
    const e = {};
    if (!f.origin.trim()) e.origin = 'Type where the trip starts.';
    if (!f.destination.trim()) e.destination = 'Type where the trip ends.';
    const planned = f.planned ? fromLocalInput(f.planned) : null;
    if (f.planned && !planned) e.planned = 'That date is not valid.';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const row = {
        ...(plan || {}),
        title: (f.title.trim() || `${f.origin.trim()} to ${f.destination.trim()}`).slice(0, 100),
        origin: f.origin.trim().slice(0, 200), destination: f.destination.trim().slice(0, 200),
        stops: f.stops.map((s) => s.trim()).filter(Boolean).slice(0, 20).map((label) => ({ label: label.slice(0, 200) })),
        planned_at: planned ? planned.toISOString() : null,
        est_distance_m: estimate != null ? Math.min(estimate, 50000000) : (plan?.est_distance_m ?? null),
        notes: f.notes.trim().slice(0, 1000), load_id: f.load || null,
      };
      if (editing) await save('route_plans', row); else await create('route_plans', row);
      toast(editing ? 'Route plan updated.' : 'Route plan saved.');
      onClose();
    } catch (x) { console.error(x); toast('Could not save the plan.', { bad: true }); }
    setBusy(false);
  }

  const gm = mapsLink({ origin: f.origin.trim(), destination: f.destination.trim(), stops: f.stops.map((s) => s.trim()) });

  return (
    <Modal wide open={open} onClose={onClose} title={editing ? 'Edit route plan' : 'Plan a route'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{editing ? 'Save changes' : 'Save plan'}</Button></>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Plan name (optional)">{(id) => <Input id={id} value={f.title} maxLength={100} onChange={set('title')} placeholder="Friday run to Montego Bay" />}</Field>
          <Field label="Start" error={err.origin}>{(id) => (
            <div className="flex gap-2"><Input id={id} value={f.origin} maxLength={200} onChange={set('origin')} placeholder="Address, town or lat, lng" /><IconButton icon={LocateFixed} label="Use my location as the start" onClick={myLocation} className="!h-10 !w-10 shrink-0 ring-1 ring-ink-300 dark:ring-ink-700" /></div>)}</Field>
          {f.stops.map((s, i) => (
            <Field key={i} label={`Stop ${i + 1}`}>{(id) => (
              <div className="flex gap-2"><Input id={id} value={s} maxLength={200} onChange={(e) => setStop(i, e.target.value)} /><IconButton icon={X} label={`Remove stop ${i + 1}`} onClick={() => setF({ ...f, stops: f.stops.filter((_, j) => j !== i) })} className="!h-10 !w-10 shrink-0" /></div>)}</Field>
          ))}
          {f.stops.length < 8 && <Button size="sm" variant="soft" icon={Plus} onClick={() => setF({ ...f, stops: [...f.stops, ''] })}>Add a stop</Button>}
          <Field label="End" error={err.destination}>{(id) => <Input id={id} value={f.destination} maxLength={200} onChange={set('destination')} placeholder="Address, town or lat, lng" />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Planned for" error={err.planned}>{(id) => <Input id={id} type="datetime-local" value={f.planned} onChange={set('planned')} />}</Field>
            <Field label="Load">{(id) => <Select id={id} value={f.load} onChange={set('load')}><option value="">No load</option>{loads.map((l) => <option key={l.id} value={l.id}>{loadLabel(l)}</option>)}</Select>}</Field>
          </div>
          <Field label="Notes">{(id) => <Textarea id={id} value={f.notes} maxLength={1000} onChange={set('notes')} />}</Field>
        </div>
        <div className="space-y-3">
          <Button icon={Search} variant="outline" loading={looking} onClick={lookUp}>Find on map and estimate distance</Button>
          <LeafMap height={240} markers={mapPts.map((p) => ({ id: `${p.i}`, lat: p.lat, lng: p.lng, color: p.i === 0 ? '#10b981' : p.i === labels.length - 1 ? '#ef4444' : '#0ea5e9', glyph: p.i === 0 ? 'A' : p.i === labels.length - 1 ? 'B' : String(p.i), title: p.label }))} line={mapPts.length > 1 ? mapPts : undefined} fitKey={mapPts.length} label="Route preview" />
          {estimate != null && (
            <div className="rounded-xl bg-sky-50 p-3 text-sm dark:bg-sky-950/40">
              <div className="text-xl font-bold tabular-nums">{dist(estimate)}</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">Straight-line estimate</div>
              <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">This is the direct distance between points, as a bird flies. Real roads are usually 20 to 40 percent longer.</p>
            </div>
          )}
          {failed.length > 0 && <Banner tone="amber">We could not find: {failed.join(', ')}. Try a town name or type coordinates like 18.01, -76.80.</Banner>}
          {offline && <Banner tone="amber">Address lookup needs internet and could not be reached. You can still save the plan and open it in your maps app.</Banner>}
          {f.origin.trim() && f.destination.trim() && (
            <div className="flex flex-wrap gap-2">
              <Button as="a" size="sm" variant="soft" icon={Navigation} href={gm} target="_blank" rel="noreferrer">Open in Google Maps</Button>
              <Button as="a" size="sm" variant="ghost" icon={ExternalLink} href={wazeLink(f.destination.trim())} target="_blank" rel="noreferrer">Open in Waze</Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
