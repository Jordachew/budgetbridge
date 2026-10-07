import { useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Plus, Route as RouteIcon, Pencil, Trash2, Satellite, Gauge, ChevronRight } from 'lucide-react';
import { PageHeader, Card, Stat, Button, Badge, Empty, IconButton, useConfirm } from '../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { useRows, remove } from '../state/data.js';
import { within, sumDistance } from '../core/calc.js';
import { fmtDateTime, fmtDuration } from '../core/format.js';
import { useDistance } from '../lib/hooks.js';
import { useToast } from '../components/toast.jsx';
import Tracker from './trips/Tracker.jsx';
import TripForm from './trips/TripForm.jsx';
import TripDetail from './trips/TripDetail.jsx';
import { tripMinutes, tripTitle } from './trips/shared.js';

function TripList() {
  const trips = useRows('trips');
  const dist = useDistance();
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const [form, setForm] = useState(null); // null | 'new' | trip
  const range = rangeOf(period);
  const list = useMemo(() => within(trips, 'started_at', range).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at))), [trips, range.from.getTime(), range.to.getTime()]);
  const total = sumDistance(list);
  const totalMs = list.reduce((a, t) => a + tripMinutes(t), 0);

  async function del(t) {
    if (!(await confirm({ title: 'Delete this trip?', text: `${tripTitle(t)} (${dist(t.distance_m)}) will be removed from your history.`, danger: true, confirmLabel: 'Delete trip' }))) return;
    await remove('trips', t.id); toast('Trip deleted.');
  }

  return (
    <>
      <PageHeader title="Trips" sub="Record drives with GPS or log them from your odometer." actions={<Button icon={Plus} variant="outline" onClick={() => setForm('new')}>Add by odometer</Button>} />
      <Tracker />
      <div className="mb-4"><PeriodPicker value={period} onChange={setPeriod} /></div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Distance" value={dist(total)} icon={RouteIcon} />
        <Stat label="Trips" value={list.length} icon={Satellite} />
        <div className="col-span-2 sm:col-span-1"><Stat label="Driving time" value={totalMs ? fmtDuration(totalMs) : '-'} icon={Gauge} /></div>
      </div>
      {list.length === 0 ? (
        <Empty icon={RouteIcon} title="No trips in this period" text="Start a trip above, or add one from your odometer if you forgot to record it." action={<Button icon={Plus} onClick={() => setForm('new')}>Add a trip</Button>} />
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id}>
              <Card className="!p-0">
                <div className="flex items-center gap-1 pr-2">
                  <Link to={`/trips/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-700/20">{t.method === 'gps' ? <Satellite size={18} /> : <Gauge size={18} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{tripTitle(t)}</span>
                      <span className="block truncate text-xs text-ink-500">{fmtDateTime(t.started_at)}{tripMinutes(t) ? ` - ${fmtDuration(tripMinutes(t))}` : ''}</span>
                    </span>
                    <span className="text-right"><span className="block font-bold tabular-nums">{dist(t.distance_m)}</span><Badge className="mt-0.5">{t.method === 'gps' ? 'GPS' : 'Odometer'}</Badge></span>
                    <ChevronRight size={16} className="text-ink-400" />
                  </Link>
                  <IconButton icon={Pencil} label={`Edit ${tripTitle(t)}`} onClick={() => setForm(t)} />
                  <IconButton icon={Trash2} label={`Delete ${tripTitle(t)}`} onClick={() => del(t)} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {form && <TripForm open onClose={() => setForm(null)} trip={form === 'new' ? null : form} />}
      {node}
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
