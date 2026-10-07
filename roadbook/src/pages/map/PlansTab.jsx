import { useEffect, useMemo } from 'react';
import { Plus, Route as RouteIcon, Pencil, Trash2, Navigation, ExternalLink, CalendarClock } from 'lucide-react';
import { Button, Empty, IconButton, Badge } from '../../components/ui.jsx';
import { useRows } from '../../state/data.js';
import { mapsLink, wazeLink } from '../../core/geo.js';
import { fmtDateTime } from '../../core/format.js';
import { useDistance } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import { softDelete } from '../../lib/undo.js';

export default function PlansTab({ onMarkers, setPlanForm }) {
  const plans = useRows('route_plans');
  const dist = useDistance();
  const toast = useToast();
  const list = useMemo(() => [...plans].sort((a, b) => String(b.planned_at || b.created_at).localeCompare(String(a.planned_at || a.created_at))), [plans]);
  useEffect(() => { onMarkers([], 'routes'); }, []);

  return (
    <div>
      <Button icon={Plus} className="mb-4 w-full" onClick={() => setPlanForm({})}>Plan a route</Button>
      {list.length === 0 ? (
        <Empty icon={RouteIcon} title="No routes yet" text="Write down where you are going, add stops in order, then hand it to Google Maps or Waze." />
      ) : (
        <ul className="border-t border-[var(--hairline)]">
          {list.map((p) => {
            const stops = (p.stops || []).map((s) => s.label).filter(Boolean);
            const all = [p.origin, ...stops, p.destination];
            return (
              <li key={p.id} className="border-b border-[var(--hairline)] py-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 font-bold">{p.title || `${p.origin} to ${p.destination}`}</h3>
                  <div className="flex shrink-0"><IconButton icon={Pencil} label="Edit route" onClick={() => setPlanForm(p)} /><IconButton icon={Trash2} label="Delete route" onClick={() => softDelete(toast, 'route_plans', p, 'Route deleted')} /></div>
                </div>
                <ol className="my-2 ml-1 border-l-2 border-dashed border-brand-500 pl-4 text-sm">
                  {all.map((s, i) => (
                    <li key={i} className="relative py-0.5"><span className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface)] ${i === 0 || i === all.length - 1 ? 'bg-ink-900 dark:bg-ink-100' : 'bg-brand-500'}`} aria-hidden="true" />{s}</li>
                  ))}
                </ol>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {p.planned_at && <Badge tone="blue" icon={CalendarClock}>{fmtDateTime(p.planned_at)}</Badge>}
                  {p.est_distance_m != null && <Badge>About {dist(p.est_distance_m)} straight line</Badge>}
                </div>
                {p.notes && <p className="mb-2 text-sm text-ink-500">{p.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button as="a" size="sm" variant="soft" icon={Navigation} href={mapsLink({ origin: p.origin, destination: p.destination, stops })} target="_blank" rel="noreferrer">Google Maps</Button>
                  <Button as="a" size="sm" variant="soft" icon={ExternalLink} href={wazeLink(p.destination)} target="_blank" rel="noreferrer">Waze</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
