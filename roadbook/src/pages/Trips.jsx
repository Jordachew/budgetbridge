import { useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Plus, Route as RouteIcon, Pencil, Trash2, Satellite, Gauge, Search, ArrowRight, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { PageHeader, Button, Badge, Empty, IconButton, Plate, Chips } from '../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { Bars } from '../components/charts';
import { useRows } from '../state/data.js';
import { within, sumDistance } from '../core/calc.js';
import { fmtDuration, fmtTime, fmtDate } from '../core/format.js';
import { periodRange } from '../core/dates.js';
import { useDistance } from '../lib/hooks.js';
import { usePrefs } from '../state/prefs.js';
import { softDelete } from '../lib/undo.js';
import { useToast } from '../components/toast.jsx';
import Tracker from './trips/Tracker.jsx';
import TripForm from './trips/TripForm.jsx';
import TripDetail from './trips/TripDetail.jsx';
import RouteThumb from './trips/RouteThumb.jsx';
import { bucketTrips } from './trips/buckets.js';
import { loadLabel, tripMinutes, tripTitle } from './trips/shared.js';
import { useNewParam } from './maintenance/formKit.jsx';

const DAYM = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const WDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

function TripRow({ t, load, vehicle, dist, onEdit, onDelete }) {
  const d = new Date(t.started_at);
  const ms = tripMinutes(t);
  const gps = t.method === 'gps';
  return (
    <li className="border-b border-[var(--hairline)] last:border-b-0">
      <div className="flex items-center gap-2 py-3.5 sm:gap-3">
        <Link to={`/trips/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 outline-offset-2 hover:bg-ink-100/60 dark:hover:bg-ink-800/50 sm:gap-4">
          <div className="w-11 shrink-0 text-center leading-none" title={fmtDate(d, { year: true })}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{WDAY.format(d)}</div>
            <div className="mt-0.5 text-2xl font-bold">{d.getDate()}</div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{DAYM.format(d)}</div>
          </div>
          {gps && t.path?.length > 1
            ? <RouteThumb path={t.path} width={84} height={52} className="hidden min-[420px]:block" />
            : <span className="hidden h-[52px] w-[84px] shrink-0 items-center justify-center rounded-[6px] bg-ink-100 text-ink-400 dark:bg-ink-800 min-[420px]:flex" aria-hidden="true">{gps ? <Satellite size={18} /> : <Gauge size={18} />}</span>}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 truncate font-bold">{t.origin_label || t.dest_label ? <><span className="truncate">{t.origin_label || 'Start'}</span><ArrowRight size={14} className="shrink-0 text-brand-600 dark:text-brand-300" /><span className="truncate">{t.dest_label || 'End'}</span></> : tripTitle(t)}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
              <span>{fmtTime(t.started_at)}{ms ? ` · ${fmtDuration(ms)}` : ''}</span>
              {load && <span className="truncate">{loadLabel(load)}</span>}
              {vehicle?.plate && <Plate className="!text-xs">{vehicle.plate}</Plate>}
              <Badge icon={gps ? Satellite : Gauge}>{gps ? 'GPS' : 'Odometer'}</Badge>
            </span>
          </span>
          <span className="shrink-0 text-right"><span className="block text-xl font-bold leading-none">{dist(t.distance_m)}</span></span>
        </Link>
        <div className="hidden shrink-0 md:flex">
          <IconButton icon={Pencil} label={`Edit ${tripTitle(t)}`} onClick={onEdit} />
          <IconButton icon={Trash2} label={`Delete ${tripTitle(t)}`} onClick={onDelete} />
        </div>
      </div>
    </li>
  );
}

function Delta({ now, before, label }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return <span className="mt-1 inline-flex items-center gap-1 text-xs text-ink-500"><Icon size={13} />{pct === 0 ? 'Same as' : `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than`} {label}</span>;
}

function TripList() {
  const trips = useRows('trips');
  const loads = useRows('loads');
  const vehicles = useRows('vehicles');
  const dist = useDistance();
  const { unit } = usePrefs();
  const toast = useToast();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const [form, setForm] = useState(null); // null | 'new' | trip
  const [q, setQ] = useState('');
  const [method, setMethod] = useState('all');
  useNewParam(() => setForm('new'));

  const range = rangeOf(period);
  const list = useMemo(() => within(trips, 'started_at', range).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))), [trips, range.from.getTime(), range.to.getTime()]);
  const prev = useMemo(() => (period.kind === 'all' ? null : within(trips, 'started_at', periodRange(period.kind, new Date(), period.offset - 1))), [trips, period.kind, period.offset]);
  const total = sumDistance(list);
  const prevTotal = prev ? sumDistance(prev) : 0;
  const totalMs = list.reduce((a, t) => a + tripMinutes(t), 0);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((t) => (method === 'all' || t.method === method) && (!s || [t.origin_label, t.dest_label, t.note].join(' ').toLowerCase().includes(s)));
  }, [list, q, method]);
  const { grain, data } = useMemo(() => bucketTrips(list, period.kind, range, unit), [list, period.kind, range.from.getTime(), range.to.getTime(), unit]);
  const best = data.reduce((a, b) => (b.values.km > (a?.values.km || 0) ? b : a), null);
  const fmtU = (n) => `${n >= 100 ? Math.round(n) : n.toFixed(1)} ${unit}`;
  const periodWord = { week: 'this week', month: 'this month', year: 'this year', all: 'in total' }[period.kind];
  const prevWord = { week: 'the week before', month: 'the month before', year: 'the year before' }[period.kind];
  const loadOf = (t) => loads.find((l) => l.id === t.load_id);
  const vehOf = (t) => vehicles.find((v) => v.id === t.vehicle_id);

  return (
    <>
      <PageHeader title="Trips" sub="Drive first. Roadbook counts the kilometres."
        actions={<Button icon={Plus} variant="outline" onClick={() => setForm('new')}>Log by odometer</Button>} />
      <Tracker trips={trips} />

      {trips.length === 0 ? (
        <Empty icon={RouteIcon} title="Your trip history starts with the first drive" text="Press Start trip before you pull out. Roadbook adds up the distance and the time, keeps the route, and you can see weekly totals here. Forgot to record? Log it from your odometer." action={<Button icon={Plus} variant="outline" onClick={() => setForm('new')}>Log a trip by odometer</Button>} />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] pb-4">
            <h2 className="font-display text-2xl font-semibold">History</h2>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>

          <dl className="mb-5 grid grid-cols-2 divide-x divide-y divide-[var(--hairline)] overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] sm:grid-cols-4 sm:divide-y-0">
            <div className="p-4"><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">Distance</dt><dd className="mt-1.5 text-3xl font-bold leading-none">{dist(total)}</dd>{prev && <Delta now={total} before={prevTotal} label={prevWord} />}</div>
            <div className="p-4"><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">Trips</dt><dd className="mt-1.5 text-3xl font-bold leading-none">{list.length}</dd></div>
            <div className="p-4"><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">Driving time</dt><dd className="mt-1.5 text-3xl font-bold leading-none">{totalMs ? fmtDuration(totalMs) : '-'}</dd></div>
            <div className="p-4"><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">Average trip</dt><dd className="mt-1.5 text-3xl font-bold leading-none">{list.length ? dist(total / list.length) : '-'}</dd></div>
          </dl>

          {list.length > 0 && (
            <div className="mb-6">
              <Bars data={data} series={[{ id: 'km', label: 'Distance', slot: 0 }]} format={fmtU} axisFormat={(n) => String(Math.round(n))}
                title={`Distance per ${grain}`} subtitle={`Driven ${periodWord}, in ${unit}`}
                summary={`You drove ${dist(total)} in ${list.length} trip${list.length === 1 ? '' : 's'} ${periodWord}.${best && best.values.km > 0 ? ` The busiest ${grain} was ${best.label} at ${fmtU(best.values.km)}.` : ''}`} />
            </div>
          )}

          {list.length === 0 ? (
            <Empty icon={RouteIcon} title="No trips in this period" text="Pick another period above, or log a trip you forgot to record." action={<Button icon={Plus} variant="outline" onClick={() => setForm('new')}>Log a trip</Button>} />
          ) : (
            <section aria-label="Trips">
              {list.length > 5 && (
                <div className="mb-2 flex flex-wrap items-center gap-3">
                  <label className="relative block min-w-[12rem] flex-1 sm:max-w-xs">
                    <span className="sr-only">Search trips</span>
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search from, to or note" className="h-10 w-full rounded-md border border-ink-300 bg-[var(--surface)] pl-9 pr-3 text-sm placeholder:text-ink-400 dark:border-ink-600" />
                  </label>
                  <Chips value={method} onChange={setMethod} options={[{ value: 'all', label: 'All' }, { value: 'gps', label: 'GPS' }, { value: 'odometer', label: 'Odometer' }]} />
                </div>
              )}
              <p className="mb-1 text-xs text-ink-500" aria-live="polite">{shown.length === list.length ? `${list.length} trip${list.length === 1 ? '' : 's'}` : `${shown.length} of ${list.length} trips`}</p>
              <ul className="border-t border-[var(--hairline)]">
                {shown.map((t) => <TripRow key={t.id} t={t} load={loadOf(t)} vehicle={vehOf(t)} dist={dist} onEdit={() => setForm(t)} onDelete={() => softDelete(toast, 'trips', t, `Deleted ${tripTitle(t)}`)} />)}
              </ul>
              {shown.length === 0 && <p className="py-6 text-sm text-ink-500">No trips match that search.</p>}
            </section>
          )}
        </>
      )}
      {form && <TripForm open onClose={() => setForm(null)} trip={form === 'new' ? null : form} />}
    </>
  );
}

export default function Trips() {
  return (
    <Routes>
      <Route index element={<TripList />} />
      <Route path=":id" element={<TripDetail />} />
    </Routes>
  );
}
