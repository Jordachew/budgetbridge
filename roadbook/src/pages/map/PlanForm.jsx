import { useMemo, useState } from 'react';
import { Plus, X, Search, LocateFixed, Navigation, ExternalLink, ArrowUp, ArrowDown } from 'lucide-react';
import { Button, Field, Input, Select, Textarea, Banner, IconButton } from '../../components/ui.jsx';
import { FormModal } from '../maintenance/formKit.jsx';
import { create, save } from '../../state/data.js';
import { haversine, mapsLink, wazeLink } from '../../core/geo.js';
import { toLocalInput, fromLocalInput } from '../../core/format.js';
import { useDistance } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import { loadLabel, useLoadVehicleOptions } from '../trips/shared.js';
import LeafMap from './LeafMap.jsx';
import { geocodeAll } from './geocode.js';

const letter = (i, n) => (i === 0 ? 'A' : i === n - 1 ? 'B' : String(i));

export default function PlanForm({ onClose, plan, meApi }) {
  const toast = useToast();
  const dist = useDistance();
  const { loads } = useLoadVehicleOptions();
  const editing = !!plan?.id;
  const [f, setF] = useState({ title: plan?.title || '', planned: plan?.planned_at ? toLocalInput(plan.planned_at) : '', notes: plan?.notes || '', load: plan?.load_id || '' });
  const [pts, setPts] = useState(() => [plan?.origin || '', ...(plan?.stops || []).map((s) => s.label || ''), plan?.destination || '']);
  const [found, setFound] = useState({});
  const [looking, setLooking] = useState(false);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setPt = (i, v) => setPts((l) => l.map((x, j) => (j === i ? v : x)));
  const move = (i, d) => setPts((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const labels = pts.map((s) => s.trim()).filter(Boolean);
  const coords = labels.map((l) => found[l]);
  const resolved = labels.length > 1 && coords.every((p) => p && typeof p === 'object');
  const estimate = useMemo(() => {
    if (!resolved) return null;
    let m = 0;
    for (let i = 1; i < coords.length; i++) m += haversine(coords[i - 1], coords[i]);
    return Math.round(m);
  }, [labels.join('|'), found]);
  const mapPts = coords.map((p, i) => (p && typeof p === 'object' ? { ...p, label: labels[i], i } : null)).filter(Boolean);
  const failed = labels.filter((l) => found[l] === 'notfound');
  const offline = labels.some((l) => found[l] === 'offline');

  async function lookUp() {
    if (labels.length < 2) { setErr({ pts: 'Type at least a start and an end.' }); return; }
    setLooking(true); setErr({});
    const todo = [...new Set(labels)].filter((l) => !(found[l] && typeof found[l] === 'object'));
    const res = await geocodeAll(todo, (part) => setFound((x) => ({ ...x, ...part })));
    setFound((x) => ({ ...x, ...res }));
    setLooking(false);
  }
  async function myLocation() {
    const p = await meApi.locate();
    if (p) setPt(0, `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`); else toast('Could not read your location.', { bad: true });
  }
  async function submit() {
    const e = {};
    if (!pts[0].trim()) e.pts = 'Type where the trip starts.';
    else if (!pts[pts.length - 1].trim()) e.pts = 'Type where the trip ends.';
    const planned = f.planned ? fromLocalInput(f.planned) : null;
    if (f.planned && !planned) e.planned = 'That date is not valid.';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const origin = pts[0].trim(); const destination = pts[pts.length - 1].trim();
      const row = {
        ...(plan || {}),
        title: (f.title.trim() || `${origin} to ${destination}`).slice(0, 100),
        origin: origin.slice(0, 200), destination: destination.slice(0, 200),
        stops: pts.slice(1, -1).map((s) => s.trim()).filter(Boolean).slice(0, 20).map((label) => ({ label: label.slice(0, 200) })),
        planned_at: planned ? planned.toISOString() : null,
        est_distance_m: estimate != null ? Math.min(estimate, 50000000) : (plan?.est_distance_m ?? null),
        notes: f.notes.trim().slice(0, 1000), load_id: f.load || null,
      };
      if (editing) await save('route_plans', row); else await create('route_plans', row);
      toast(editing ? 'Route updated.' : 'Route saved.');
      onClose();
    } catch (x) { console.error(x); toast('Could not save the route.', { bad: true }); }
    setBusy(false);
  }

  const gm = mapsLink({ origin: pts[0].trim(), destination: pts[pts.length - 1].trim(), stops: pts.slice(1, -1).map((s) => s.trim()) });

  return (
    <FormModal wide onClose={onClose} title={editing ? 'Edit route' : 'Plan a route'} submitLabel={editing ? 'Save changes' : 'Save route'} busy={busy} onSubmit={submit}>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Route name (optional)">{(id) => <Input id={id} value={f.title} maxLength={100} onChange={set('title')} placeholder="Friday run to Montego Bay" />}</Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-bold">Stops, in driving order</legend>
            <ol className="space-y-2">
              {pts.map((p, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-sm font-bold ${i === 0 || i === pts.length - 1 ? 'bg-ink-900 text-white dark:bg-ink-100 dark:text-ink-900' : 'bg-brand-500 text-ink-950'}`} aria-hidden="true">{letter(i, pts.length)}</span>
                  <Input data-autofocus={i === 0 ? true : undefined} aria-label={i === 0 ? 'Start' : i === pts.length - 1 ? 'End' : `Stop ${i}`} value={p} maxLength={200} onChange={(e) => setPt(i, e.target.value)} placeholder={i === 0 ? 'Start: town, address or lat, lng' : i === pts.length - 1 ? 'End' : 'Stop'} className="!h-11" />
                  {i === 0 && <IconButton icon={LocateFixed} label="Use my location as the start" onClick={myLocation} />}
                  <IconButton icon={ArrowUp} label={`Move ${labels[i] || 'point'} up`} disabled={i === 0} onClick={() => move(i, -1)} className="disabled:opacity-30" />
                  <IconButton icon={ArrowDown} label={`Move ${labels[i] || 'point'} down`} disabled={i === pts.length - 1} onClick={() => move(i, 1)} className="disabled:opacity-30" />
                  {pts.length > 2 && <IconButton icon={X} label={`Remove ${letter(i, pts.length)}`} onClick={() => setPts((l) => l.filter((_, j) => j !== i))} />}
                </li>
              ))}
            </ol>
            {err.pts && <p className="mt-1 text-xs font-medium text-red-600">{err.pts}</p>}
            {pts.length < 10 && <Button size="sm" variant="soft" icon={Plus} className="mt-2" onClick={() => setPts((l) => [...l.slice(0, -1), '', l[l.length - 1]])}>Add a stop</Button>}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Planned for" error={err.planned}>{(id) => <Input id={id} type="datetime-local" value={f.planned} onChange={set('planned')} />}</Field>
            <Field label="Load">{(id) => <Select id={id} value={f.load} onChange={set('load')}><option value="">No load</option>{loads.map((l) => <option key={l.id} value={l.id}>{loadLabel(l)}</option>)}</Select>}</Field>
          </div>
          <Field label="Notes">{(id) => <Textarea id={id} value={f.notes} maxLength={1000} onChange={set('notes')} />}</Field>
        </div>
        <div className="space-y-3">
          <Button icon={Search} variant="outline" loading={looking} onClick={lookUp}>Find on map and estimate distance</Button>
          <LeafMap height={230} markers={mapPts.map((p) => ({ id: `${p.i}`, lat: p.lat, lng: p.lng, color: p.i === 0 || p.i === labels.length - 1 ? '#1b1d22' : '#f5b000', fg: p.i === 0 || p.i === labels.length - 1 ? '#fff' : '#121317', glyph: letter(p.i, labels.length), title: p.label }))} line={mapPts.length > 1 ? mapPts : undefined} fitKey={mapPts.length} label="Route preview" />
          {estimate != null && (
            <div className="rounded-md border-l-4 border-brand-500 bg-ink-100/70 p-3 dark:bg-ink-800/60">
              <div className="text-2xl font-bold">{dist(estimate)}</div>
              <div className="text-xs font-bold uppercase tracking-wide text-ink-500">Straight-line estimate</div>
              <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">Direct distance between stops. Real roads are usually 20 to 40 percent longer.</p>
            </div>
          )}
          {failed.length > 0 && <Banner tone="amber">We could not find: {failed.join(', ')}. Try a town name or type coordinates like 18.01, -76.80.</Banner>}
          {offline && <Banner tone="amber">Address lookup needs internet. You can still save the route and open it in your maps app.</Banner>}
          {pts[0].trim() && pts[pts.length - 1].trim() && (
            <div className="flex flex-wrap gap-2">
              <Button as="a" size="sm" variant="soft" icon={Navigation} href={gm} target="_blank" rel="noreferrer">Google Maps</Button>
              <Button as="a" size="sm" variant="soft" icon={ExternalLink} href={wazeLink(pts[pts.length - 1].trim())} target="_blank" rel="noreferrer">Waze</Button>
            </div>
          )}
        </div>
      </div>
    </FormModal>
  );
}
