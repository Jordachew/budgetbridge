import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, Route as RouteIcon, Clock, Gauge, Truck } from 'lucide-react';
import { PageHeader, Card, Stat, Button, Badge, Empty, useConfirm } from '../../components/ui.jsx';
import { useRow, remove } from '../../state/data.js';
import { useDistance } from '../../lib/hooks.js';
import { usePrefs } from '../../state/prefs.js';
import { fmtDateTime, fmtDuration, speedText } from '../../core/format.js';
import { useToast } from '../../components/toast.jsx';
import LeafMap from '../map/LeafMap.jsx';
import TripForm from './TripForm.jsx';
import { loadLabel, tripMinutes, tripTitle } from './shared.js';

export default function TripDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const trip = useRow('trips', id);
  const load = useRow('loads', trip?.load_id);
  const vehicle = useRow('vehicles', trip?.vehicle_id);
  const dist = useDistance();
  const { unit } = usePrefs();
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [edit, setEdit] = useState(false);

  const back = <Link to="/trips" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"><ArrowLeft size={14} /> All trips</Link>;
  if (!trip || trip.deleted_at) return <><PageHeader title="Trip" back={back} /><Empty icon={RouteIcon} title="Trip not found" text="It may have been deleted." action={<Button as={Link} to="/trips">Back to trips</Button>} /></>;

  const path = Array.isArray(trip.path) ? trip.path : [];
  const ms = tripMinutes(trip);
  const avg = ms > 0 ? (trip.distance_m / (ms / 1000)) : 0;
  const markers = path.length > 1 ? [
    { id: 's', lat: path[0][0], lng: path[0][1], color: '#10b981', glyph: 'A', title: trip.origin_label || 'Start' },
    { id: 'e', lat: path.at(-1)[0], lng: path.at(-1)[1], color: '#ef4444', glyph: 'B', title: trip.dest_label || 'End' },
  ] : [];

  async function del() {
    if (!(await confirm({ title: 'Delete this trip?', text: 'The trip and its recorded route will be removed from your history.', danger: true, confirmLabel: 'Delete trip' }))) return;
    await remove('trips', trip.id); toast('Trip deleted.'); nav('/trips');
  }

  return (
    <>
      <PageHeader back={back} title={tripTitle(trip)} sub={fmtDateTime(trip.started_at)}
        actions={<><Button variant="outline" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button><Button variant="outline" icon={Trash2} onClick={del}>Delete</Button></>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Distance" value={dist(trip.distance_m)} icon={RouteIcon} />
        <Stat label="Duration" value={ms ? fmtDuration(ms) : '-'} icon={Clock} />
        <Stat label="Average speed" value={avg > 0 ? speedText(avg, unit) : '-'} icon={Gauge} />
        <Stat label="Recorded by" value={trip.method === 'gps' ? 'GPS' : 'Odometer'} sub={trip.method === 'odometer' && trip.start_odometer_m != null ? `${dist(trip.start_odometer_m)} to ${dist(trip.end_odometer_m)}` : undefined} icon={Truck} />
      </div>
      {(load || vehicle || trip.note) && (
        <Card className="mb-4 text-sm">
          <div className="flex flex-wrap gap-2">
            {load && <Badge tone="brand">Load: {loadLabel(load)}</Badge>}
            {vehicle && <Badge tone="blue">{vehicle.name}</Badge>}
          </div>
          {trip.note && <p className="mt-2 text-ink-600 dark:text-ink-300">{trip.note}</p>}
        </Card>
      )}
      {path.length > 1 ? <LeafMap path={path} markers={markers} fitKey={trip.id} height={380} label="Recorded route" />
        : <Empty icon={RouteIcon} title="No route recorded" text={trip.method === 'odometer' ? 'Trips added by odometer have no map line.' : 'The GPS did not collect enough points for a map.'} />}
      <p className="mt-2 text-xs text-ink-500">Map data from OpenStreetMap. If the map is blank you are offline, but your route is still saved.</p>
      {edit && <TripForm open onClose={() => setEdit(false)} trip={trip} />}
      {node}
    </>
  );
}
