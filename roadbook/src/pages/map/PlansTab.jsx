import { useMemo, useState } from 'react';
import { Plus, Route as RouteIcon, Pencil, Trash2, Navigation, ExternalLink, ArrowRight, CalendarClock } from 'lucide-react';
import { Card, Button, Empty, IconButton, Badge, useConfirm } from '../../components/ui.jsx';
import { useRows, remove } from '../../state/data.js';
import { mapsLink, wazeLink } from '../../core/geo.js';
import { fmtDateTime } from '../../core/format.js';
import { useDistance } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import PlanForm from './PlanForm.jsx';

export default function PlansTab({ meApi }) {
  const plans = useRows('route_plans');
  const dist = useDistance();
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [form, setForm] = useState(null);
  const list = useMemo(() => [...plans].sort((a, b) => String(b.planned_at || b.created_at).localeCompare(String(a.planned_at || a.created_at))), [plans]);

  async function del(p) {
    if (!(await confirm({ title: 'Delete this route plan?', text: p.title || 'This plan will be removed.', danger: true, confirmLabel: 'Delete plan' }))) return;
    await remove('route_plans', p.id); toast('Plan deleted.');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">Plan a run with stops, see a rough distance, then hand it to your maps app to navigate.</p>
        <Button icon={Plus} onClick={() => setForm({})}>New route plan</Button>
      </div>
      {list.length === 0 ? (
        <Empty icon={RouteIcon} title="No route plans yet" text="Write down where you are going, add stops, and open it in Google Maps or Waze when you are ready." action={<Button icon={Plus} onClick={() => setForm({})}>Plan a route</Button>} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((p) => {
            const stops = (p.stops || []).map((s) => s.label).filter(Boolean);
            return (
              <li key={p.id}>
                <Card className="h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h3 className="truncate font-semibold">{p.title || `${p.origin} to ${p.destination}`}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-ink-600 dark:text-ink-300"><span>{p.origin}</span>{stops.map((s) => <span key={s} className="flex items-center gap-1"><ArrowRight size={12} />{s}</span>)}<ArrowRight size={12} /><span>{p.destination}</span></p></div>
                    <div className="flex shrink-0"><IconButton icon={Pencil} label="Edit plan" onClick={() => setForm(p)} /><IconButton icon={Trash2} label="Delete plan" onClick={() => del(p)} /></div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {p.planned_at && <Badge tone="blue"><CalendarClock size={12} className="mr-1" />{fmtDateTime(p.planned_at)}</Badge>}
                    {p.est_distance_m != null && <Badge>About {dist(p.est_distance_m)} (straight-line estimate)</Badge>}
                  </div>
                  {p.notes && <p className="mt-2 text-sm text-ink-500">{p.notes}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button as="a" size="sm" variant="soft" icon={Navigation} href={mapsLink({ origin: p.origin, destination: p.destination, stops })} target="_blank" rel="noreferrer">Open in Google Maps</Button>
                    <Button as="a" size="sm" variant="ghost" icon={ExternalLink} href={wazeLink(p.destination)} target="_blank" rel="noreferrer">Open in Waze</Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {form && <PlanForm key={form.id || 'new'} open plan={form} meApi={meApi} onClose={() => setForm(null)} />}
      {node}
    </div>
  );
}
