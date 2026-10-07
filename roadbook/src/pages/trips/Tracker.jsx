import { useEffect, useState } from 'react';
import { Play, Square, Satellite, MapPinOff, Radio } from 'lucide-react';
import { Card, Button, Input, Select, Field, Banner, Badge } from '../../components/ui.jsx';
import { useStoreVersion, save } from '../../state/data.js';
import { session } from '../../state/app.jsx';
import * as store from '../../core/store.js';
import { uuid, ls } from '../../core/util.js';
import { speedText, fmtClock } from '../../core/format.js';
import { useDistance } from '../../lib/hooks.js';
import { usePrefs } from '../../state/prefs.js';
import { useToast } from '../../components/toast.jsx';
import { loadLabel, useLoadVehicleOptions } from './shared.js';

const QUALITY = {
  searching: { tone: 'amber', icon: Satellite, text: 'Looking for a GPS signal', help: 'Go outside or near a window. The first fix can take a minute.' },
  weak: { tone: 'amber', icon: Satellite, text: 'Weak GPS signal', help: 'Distance is paused until the signal is stronger. Trees, tunnels and buildings block it.' },
  none: { tone: 'amber', icon: Satellite, text: 'No GPS signal', help: 'The phone could not get a position. Distance is paused and will carry on when the signal returns.' },
  good: { tone: 'green', icon: Radio, text: 'GPS signal good', help: '' },
  denied: { tone: 'red', icon: MapPinOff, text: 'Location is blocked', help: 'Allow location for this site in your browser settings, then stop and start the trip again. You can still log a trip by odometer.' },
};

export default function Tracker() {
  useStoreVersion(['trip-live']);
  const tracker = session.tracker;
  const st = tracker?.state();
  const dist = useDistance();
  const { unit } = usePrefs();
  const toast = useToast();
  const { loads, vehicles } = useLoadVehicleOptions();
  const [form, setForm] = useState({ origin: '', dest: '', load: '', vehicle: ls('roadbook.tripVehicle') || '' });
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    if (!st) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [!!st]);

  function pickLoad(id) {
    const l = loads.find((x) => x.id === id);
    setForm((f) => ({ ...f, load: id, origin: f.origin || l?.pickup_label || '', dest: f.dest || l?.drop_label || '' }));
  }
  function start() {
    if (!tracker) return;
    if (!supported) { toast('This phone or browser cannot share its location, so use a manual trip instead.', { bad: true }); return; }
    ls('roadbook.tripVehicle', form.vehicle || null);
    tracker.start({ id: uuid(), load_id: form.load || null, origin_label: form.origin.trim().slice(0, 200), dest_label: form.dest.trim().slice(0, 200) });
    store.emit(['trip-live']);
  }
  async function stop() {
    setBusy(true);
    try {
      const out = tracker.stop();
      if (out) {
        const row = { ...out, method: 'gps', note: '' };
        const v = ls('roadbook.tripVehicle');
        if (v && store.find('vehicles', v)) row.vehicle_id = v;
        await save('trips', row);
        toast(`Trip saved: ${dist(out.distance_m)}.`);
      }
      await store.getDb()?.setMeta('activeTrip', null);
      store.emit(['trip-live']);
    } catch (e) { console.error(e); toast('Could not save the trip. Please try Stop again.', { bad: true }); }
    setBusy(false);
  }

  if (st) {
    const q = QUALITY[st.quality] || QUALITY.searching;
    const Q = q.icon;
    const elapsed = Date.now() - new Date(st.started_at).getTime();
    return (
      <Card className="mb-6 !bg-ink-900 text-white !ring-0 dark:!bg-ink-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span><span className="text-sm font-semibold">Trip in progress</span></div>
          <Badge tone={q.tone}><Q size={12} className="mr-1" />{q.text}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-300">{st.origin_label || 'Start'} to {st.dest_label || 'where you are going'}</p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center" aria-live="off">
          <Metric label="Distance" value={dist(st.distance_m)} />
          <Metric label="Time" value={fmtClock(elapsed)} />
          <Metric label="Speed" value={speedText(st.speed_mps, unit)} />
        </div>
        {q.help && <p className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm text-ink-100">{q.help}</p>}
        <Button variant="danger" size="lg" icon={Square} className="mt-4 w-full" loading={busy} onClick={stop}>Stop and save trip</Button>
        <p className="mt-2 text-center text-xs text-ink-400">Your screen stays on while the trip runs. Keep Roadbook open for best results.</p>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <div className="mb-4 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-700/20"><Satellite size={18} /></span>
        <div><h2 className="text-sm font-semibold">Record a trip with GPS</h2><p className="text-xs text-ink-500">Counts the distance as you drive. Works without internet.</p></div></div>
      {!supported && <div className="mb-3"><Banner tone="amber">This browser cannot read your location. You can still add a trip by odometer using the button above.</Banner></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From (optional)">{(id) => <Input id={id} value={form.origin} maxLength={200} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="e.g. Kingston yard" />}</Field>
        <Field label="To (optional)">{(id) => <Input id={id} value={form.dest} maxLength={200} onChange={(e) => setForm({ ...form, dest: e.target.value })} placeholder="e.g. Montego Bay" />}</Field>
        <Field label="Load (optional)">{(id) => (
          <Select id={id} value={form.load} onChange={(e) => pickLoad(e.target.value)}>
            <option value="">No load</option>
            {loads.map((l) => <option key={l.id} value={l.id}>{loadLabel(l)}</option>)}
          </Select>)}</Field>
        {vehicles.length > 0 && <Field label="Vehicle (optional)">{(id) => (
          <Select id={id} value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
            <option value="">Not set</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` (${v.plate})` : ''}</option>)}
          </Select>)}</Field>}
      </div>
      <Button size="lg" icon={Play} className="mt-4 w-full sm:w-auto" onClick={start} disabled={!supported}>Start trip</Button>
    </Card>
  );
}

const Metric = ({ label, value }) => (
  <div className="rounded-xl bg-white/10 px-2 py-3">
    <div className="text-xl font-bold tabular-nums sm:text-3xl">{value}</div>
    <div className="mt-0.5 text-xs text-ink-300">{label}</div>
  </div>
);
