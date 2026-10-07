import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Square, Satellite, MapPinOff, Radio, ChevronDown, Repeat, ArrowRight, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button, Input, Select, Field, Badge, Modal } from '../../components/ui.jsx';
import { useStoreVersion, save, useRows } from '../../state/data.js';
import { session } from '../../state/app.jsx';
import * as store from '../../core/store.js';
import { uuid, ls } from '../../core/util.js';
import { fmtClock, fmtDuration, fmtRelative } from '../../core/format.js';
import { useDistance } from '../../lib/hooks.js';
import { usePrefs } from '../../state/prefs.js';
import { useToast } from '../../components/toast.jsx';
import LeafMap from '../map/LeafMap.jsx';
import Odometer from './Odometer.jsx';
import RouteThumb from './RouteThumb.jsx';
import { loadLabel, speedValue, tripMinutes, useLoadVehicleOptions } from './shared.js';

const QUALITY = {
  searching: { tone: 'amber', icon: Satellite, text: 'Finding GPS', help: 'Go outside or near a window. The first fix can take a minute.' },
  weak: { tone: 'amber', icon: Satellite, text: 'Weak GPS', help: 'Distance is paused until the signal is stronger. Trees, tunnels and buildings block it.' },
  none: { tone: 'amber', icon: Satellite, text: 'No GPS', help: 'The phone could not get a position. Distance is paused and carries on when the signal returns.' },
  good: { tone: 'green', icon: Radio, text: 'GPS good', help: '' },
  denied: { tone: 'red', icon: MapPinOff, text: 'Location blocked', help: 'Allow location for this site in your browser settings, then stop and start the trip again. You can still log a trip by odometer.' },
  unsupported: { tone: 'red', icon: MapPinOff, text: 'No GPS here', help: 'This browser cannot share its location.' },
};

const eyebrow = 'text-xs font-bold uppercase tracking-[0.14em] text-ink-400';

/** The driving cockpit: start a trip, watch it, stop it. */
export default function Tracker({ trips }) {
  useStoreVersion(['trip-live']);
  const tracker = session.tracker;
  const st = tracker?.state();
  const dist = useDistance();
  const { unit } = usePrefs();
  const toast = useToast();
  const places = useRows('places');
  const { loads, vehicles } = useLoadVehicleOptions();
  const [form, setForm] = useState({ origin: '', dest: '', load: '', vehicle: ls('roadbook.tripVehicle') || '' });
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    if (!st) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [!!st]);

  const last = useMemo(() => [...trips].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0], [trips]);
  const todayM = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return trips.filter((t) => new Date(t.started_at) >= d).reduce((a, t) => a + (t.distance_m || 0), 0);
  }, [trips]);
  const recent = useMemo(() => [...new Set([...trips.flatMap((t) => [t.origin_label, t.dest_label]), ...places.map((p) => p.name)].filter(Boolean))].slice(0, 30), [trips, places]);
  const vehicleName = vehicles.find((v) => v.id === form.vehicle);
  const loadObj = loads.find((l) => l.id === form.load);

  function pickLoad(id) {
    const l = loads.find((x) => x.id === id);
    setForm((f) => ({ ...f, load: id, origin: f.origin || l?.pickup_label || '', dest: f.dest || l?.drop_label || '' }));
  }
  function start() {
    if (!tracker) return;
    if (!supported) { toast('This phone or browser cannot share its location, so use "Log by odometer" instead.', { bad: true }); return; }
    ls('roadbook.tripVehicle', form.vehicle || null);
    tracker.start({ id: uuid(), load_id: form.load || null, origin_label: form.origin.trim().slice(0, 200), dest_label: form.dest.trim().slice(0, 200) });
    store.emit(['trip-live']);
  }
  async function finish(saveIt) {
    setBusy(true);
    try {
      const out = tracker.stop();
      if (out && saveIt) {
        const row = { ...out, method: 'gps', note: '' };
        const v = ls('roadbook.tripVehicle');
        if (v && store.find('vehicles', v)) row.vehicle_id = v;
        await save('trips', row);
        toast(`Trip saved: ${dist(out.distance_m)}.`);
      } else if (out) toast('Trip discarded.');
      await store.getDb()?.setMeta('activeTrip', null);
      store.emit(['trip-live']);
      setAsking(false);
    } catch (e) { console.error(e); toast('Could not save the trip. Please try Stop again.', { bad: true }); }
    setBusy(false);
  }
  function repeat(t) {
    setForm((f) => ({ ...f, origin: t.origin_label || '', dest: t.dest_label || '', load: t.load_id && loads.some((l) => l.id === t.load_id) ? t.load_id : '', vehicle: t.vehicle_id && vehicles.some((v) => v.id === t.vehicle_id) ? t.vehicle_id : f.vehicle }));
    setOpen(true);
  }

  if (st) return <Driving st={st} unit={unit} dist={dist} asking={asking} setAsking={setAsking} busy={busy} finish={finish} />;

  const summary = [form.origin && form.dest ? `${form.origin} to ${form.dest}` : form.origin || form.dest, loadObj && loadLabel(loadObj), vehicleName?.name].filter(Boolean).join('  ·  ') || 'Where to? Optional';
  return (
    <section aria-label="Trip recorder" className="mb-9 grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="paper-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 bg-ink-950 px-5 py-5 text-white dark:bg-black/40 sm:px-7">
          <div>
            <div className={`${eyebrow} mb-2`}>Driven today</div>
            <Odometer meters={todayM} unit={unit} />
          </div>
          <div className="text-sm text-ink-300">{supported ? 'GPS ready' : 'No GPS on this device'}</div>
        </div>
        <div className="roadline" aria-hidden="true" />
        <div className="p-5 sm:p-7">
          <button type="button" onClick={start} disabled={!supported}
            className="flex h-24 w-full items-center justify-between gap-4 rounded-lg bg-brand-500 px-5 text-left text-ink-950 shadow-[0_3px_0_rgba(0,0,0,0.28)] transition hover:bg-brand-400 active:translate-y-[2px] active:shadow-none disabled:opacity-50 sm:h-28 sm:px-7">
            <span className="min-w-0">
              <span className="block text-3xl font-bold leading-none sm:text-4xl">Start trip</span>
              <span className="mt-1.5 block truncate text-sm font-bold opacity-80">{summary}</span>
            </span>
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink-950 text-brand-500 sm:h-16 sm:w-16"><Play size={28} fill="currentColor" /></span>
          </button>
          {!supported && <p className="mt-3 rounded-md border-l-4 border-brand-500 bg-brand-50 px-3 py-2 text-sm text-ink-800 dark:bg-brand-500/15 dark:text-ink-100">This browser cannot read your location. Use "Log by odometer" at the top of the page.</p>}

          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-4 flex w-full items-center justify-between gap-3 border-t border-[var(--hairline)] pt-4 text-left">
            <span className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal size={16} className="text-brand-600 dark:text-brand-300" /> Trip details <span className="font-normal text-ink-500">From, to, load, vehicle</span></span>
            <ChevronDown size={18} className={`shrink-0 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <datalist id="rb-recent-places">{recent.map((r) => <option key={r} value={r} />)}</datalist>
              <Field label="From">{(id) => <Input id={id} list="rb-recent-places" value={form.origin} maxLength={200} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Kingston yard" />}</Field>
              <Field label="To">{(id) => <Input id={id} list="rb-recent-places" value={form.dest} maxLength={200} onChange={(e) => setForm({ ...form, dest: e.target.value })} placeholder="Montego Bay" />}</Field>
              <Field label="Load">{(id) => (
                <Select id={id} value={form.load} onChange={(e) => pickLoad(e.target.value)}>
                  <option value="">No load</option>
                  {loads.map((l) => <option key={l.id} value={l.id}>{loadLabel(l)}</option>)}
                </Select>)}</Field>
              {vehicles.length > 0 && <Field label="Vehicle">{(id) => (
                <Select id={id} value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
                  <option value="">Not set</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` (${v.plate})` : ''}</option>)}
                </Select>)}</Field>}
            </div>
          )}
        </div>
      </div>

      <aside aria-label="Last trip" className="paper-card flex flex-col p-5">
        <div className={`${eyebrow} !text-ink-500`}>Last trip</div>
        {last ? (
          <>
            <Link to={`/trips/${last.id}`} className="group mt-3 block">
              <div className="flex items-center gap-2 text-lg font-bold leading-snug group-hover:underline"><span className="truncate">{last.origin_label || 'Start'}</span><ArrowRight size={16} className="shrink-0 text-brand-600 dark:text-brand-300" /><span className="truncate">{last.dest_label || 'End'}</span></div>
              <div className="mt-0.5 text-sm text-ink-500">{fmtRelative(last.started_at)}</div>
            </Link>
            <div className="mt-4 flex items-end gap-4">
              {last.path?.length > 1 && <RouteThumb path={last.path} width={110} height={64} />}
              <dl className="flex flex-1 flex-col gap-1.5 text-sm">
                <div><dt className="text-xs text-ink-500">Distance</dt><dd className="text-xl font-bold leading-tight">{dist(last.distance_m)}</dd></div>
                <div><dt className="text-xs text-ink-500">Time</dt><dd className="whitespace-nowrap text-lg font-bold leading-tight">{tripMinutes(last) ? fmtDuration(tripMinutes(last)) : '-'}</dd></div>
              </dl>
            </div>
            <Button variant="outline" icon={Repeat} className="mt-auto w-full !mt-5" onClick={() => repeat(last)}>Drive this route again</Button>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">Your finished trips show up here. Tap <b>Start trip</b> before you pull out and Roadbook counts the distance for you.</p>
        )}
      </aside>
    </section>
  );
}

function Driving({ st, unit, dist, asking, setAsking, busy, finish }) {
  const q = QUALITY[st.quality] || QUALITY.searching;
  const Q = q.icon;
  const elapsed = Date.now() - new Date(st.started_at).getTime();
  const n = st.path.length;
  const path = useMemo(() => [...st.path], [n]);
  const speed = speedValue(st.speed_mps, unit);
  return (
    <>
    <section aria-label="Trip in progress" className="mb-9 overflow-hidden rounded-[10px] bg-ink-950 text-white ring-1 ring-black/20 dark:bg-black/40 dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 sm:px-7">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" /><span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" /></span>
          <span className="text-sm font-bold uppercase tracking-[0.14em]">Recording</span>
        </div>
        <Badge tone={q.tone} icon={Q}>{q.text}</Badge>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 px-5 text-base font-bold sm:px-7"><span>{st.origin_label || 'Start'}</span><ArrowRight size={15} className="text-brand-500" /><span>{st.dest_label || 'Where you are going'}</span></p>

      <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[auto_1fr] lg:items-center">
        <div>
          <div className={`${eyebrow} mb-2`}>Distance</div>
          <Odometer meters={st.distance_m} unit={unit} digits={4} />
        </div>
        <dl className="grid grid-cols-2 divide-x divide-white/15 text-left" aria-live="off">
          <div className="pr-5"><dt className={eyebrow}>Time</dt><dd className="mt-1 text-4xl font-bold leading-none sm:text-5xl">{fmtClock(elapsed)}</dd></div>
          <div className="pl-5"><dt className={eyebrow}>Speed</dt><dd className="mt-1 text-4xl font-bold leading-none sm:text-5xl">{speed}<span className="ml-1.5 text-base font-bold text-ink-400">{unit === 'mi' ? 'mph' : 'km/h'}</span></dd></div>
        </dl>
      </div>

      {q.help && <p className="mx-5 mb-4 rounded-md border-l-4 border-brand-500 bg-white/10 px-3 py-2 text-sm text-ink-100 sm:mx-7">{q.help}</p>}
      <div className="hidden px-5 pb-5 sm:block sm:px-7">
        <LeafMap path={n > 1 ? path : undefined} me={st.pos} fitKey={Math.floor(n / 8)} height={190} label="Your route so far" className="!rounded-md" />
      </div>
      <div className="roadline" aria-hidden="true" />
      <div className="p-5 sm:p-7">
        <button type="button" onClick={() => setAsking(true)} className="flex h-20 w-full items-center justify-center gap-3 rounded-lg bg-red-600 text-2xl font-bold text-white shadow-[0_3px_0_rgba(0,0,0,0.35)] transition hover:bg-red-500 active:translate-y-[2px] active:shadow-none">
          <Square size={24} fill="currentColor" /> Stop trip
        </button>
        <p className="mt-3 text-center text-xs text-ink-400">Your screen stays on while the trip runs. Keep Roadbook open for best results.</p>
      </div>

    </section>
  <Modal open={asking} onClose={() => setAsking(false)} title="Stop this trip?"
    footer={<><Button variant="ghost" onClick={() => setAsking(false)}>Keep driving</Button><Button variant="danger" icon={Square} loading={busy} onClick={() => finish(true)}>Stop and save</Button></>}>
    <div className="space-y-4 text-ink-900 dark:text-ink-50">
      <div className="grid grid-cols-2 divide-x divide-[var(--hairline)] rounded-md border border-[var(--hairline)] text-center">
        <div className="p-3"><div className="text-2xl font-bold">{dist(st.distance_m)}</div><div className="text-xs text-ink-500">Distance</div></div>
        <div className="p-3"><div className="text-2xl font-bold">{fmtClock(elapsed)}</div><div className="text-xs text-ink-500">Time</div></div>
      </div>
      {st.distance_m < 200 && <p className="text-sm text-ink-600 dark:text-ink-300">Almost no distance has been recorded. If you started by mistake, you can throw this trip away.</p>}
      <Button variant="outline" size="sm" icon={Trash2} loading={busy} onClick={() => finish(false)}>Discard this trip</Button>
    </div>
  </Modal>
    </>
  );
}

