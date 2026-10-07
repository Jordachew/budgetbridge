import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Route as RouteIcon, Satellite, Gauge, ArrowRight } from 'lucide-react';
import { Button, Badge, Empty, Plate } from '../../components/ui.jsx';
import { useRow } from '../../state/data.js';
import { useDistance } from '../../lib/hooks.js';
import { usePrefs } from '../../state/prefs.js';
import { fmtDateTime, fmtDuration, speedText } from '../../core/format.js';
import { useToast } from '../../components/toast.jsx';
import { softDelete } from '../../lib/undo.js';
import LeafMap from '../map/LeafMap.jsx';
import TripForm from './TripForm.jsx';
import Odometer from './Odometer.jsx';
import { loadLabel, tripMinutes, tripTitle } from './shared.js';

const back = <Link to="/trips" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-ink-500 hover:text-ink-900 dark:hover:text-ink-100"><ArrowLeft size={14} /> All trips</Link>;

export default function TripDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const trip = useRow('trips', id);
  const load = useRow('loads', trip?.load_id);
  const vehicle = useRow('vehicles', trip?.vehicle_id);
  const dist = useDistance();
  const { unit } = usePrefs();
  const toast = useToast();
  const [edit, setEdit] = useState(false);

  if (!trip || trip.deleted_at) return <>{back}<Empty icon={RouteIcon} title="Trip not found" text="It may have been deleted." action={<Button as={Link} to="/trips">Back to trips</Button>} /></>;

  const path = Array.isArray(trip.path) ? trip.path : [];
  const ms = tripMinutes(trip);
  const avg = ms > 0 ? (trip.distance_m / (ms / 1000)) : 0;
  const gps = trip.method === 'gps';
  const markers = path.length > 1 ? [
    { id: 's', lat: path[0][0], lng: path[0][1], color: 'var(--series-3)', glyph: 'A', title: trip.origin_label || 'Start' },
    { id: 'e', lat: path.at(-1)[0], lng: path.at(-1)[1], color: 'var(--bad)', glyph: 'B', title: trip.dest_label || 'End' },
  ] : [];

  async function del() {
    await softDelete(toast, 'trips', trip, `Deleted ${tripTitle(trip)}`);
    nav('/trips');
  }

  return (
    <>
      {back}
      <header className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-3 font-display text-4xl font-bold leading-none"><span>{trip.origin_label || 'Start'}</span><ArrowRight size={26} className="text-brand-600 dark:text-brand-300" /><span>{trip.dest_label || 'End'}</span></h1>
            <p className="mt-2 text-sm text-ink-500">{fmtDateTime(trip.started_at)}</p>
          </div>
          <div className="flex gap-2"><Button variant="outline" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button><Button variant="outline" icon={Trash2} onClick={del}>Delete</Button></div>
        </div>
        <div className="roadline mt-4" aria-hidden="true" />
      </header>

      <section className="mb-5 overflow-hidden rounded-[10px] bg-ink-950 text-white dark:bg-black/40">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 p-5 sm:p-7">
          <div><div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-400">Distance</div><Odometer meters={trip.distance_m} unit={unit} digits={4} /></div>
          <dl className="grid grid-cols-3 gap-6 text-left">
            <div><dt className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">Time</dt><dd className="mt-1 text-2xl font-bold sm:text-3xl">{ms ? fmtDuration(ms) : '-'}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">Average</dt><dd className="mt-1 text-2xl font-bold sm:text-3xl">{avg > 0 ? speedText(avg, unit) : '-'}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">Recorded</dt><dd className="mt-2"><Badge icon={gps ? Satellite : Gauge}>{gps ? 'GPS' : 'Odometer'}</Badge></dd></div>
          </dl>
        </div>
        {(load || vehicle || trip.note || (!gps && trip.start_odometer_m != null)) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 px-5 py-3 text-sm text-ink-200 sm:px-7">
            {load && <Link to={`/loads/${load.id}`} className="font-bold underline-offset-2 hover:underline">{loadLabel(load)}</Link>}
            {vehicle && <span className="flex items-center gap-2">{vehicle.plate && <Plate>{vehicle.plate}</Plate>}{vehicle.name}</span>}
            {!gps && trip.start_odometer_m != null && <span>Odometer {dist(trip.start_odometer_m)} to {dist(trip.end_odometer_m)}</span>}
            {trip.note && <span className="text-ink-300">{trip.note}</span>}
          </div>
        )}
      </section>

      {path.length > 1 ? <LeafMap path={path} markers={markers} fitKey={trip.id} height={400} label="Recorded route" />
        : <Empty icon={RouteIcon} title="No route was recorded" text={gps ? 'The GPS did not collect enough points to draw a line.' : 'Trips logged by odometer have no map line.'} />}
      <p className="mt-2 text-xs text-ink-500">Map data from OpenStreetMap. If the map is blank you are offline, but your route is still saved.</p>
      {edit && <TripForm open onClose={() => setEdit(false)} trip={trip} />}
    </>
  );
}
