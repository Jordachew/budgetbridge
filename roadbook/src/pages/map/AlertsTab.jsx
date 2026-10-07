import { useMemo, useState } from 'react';
import { TriangleAlert, ShieldCheck } from 'lucide-react';
import { Card, Empty, Badge } from '../../components/ui.jsx';
import { useRows } from '../../state/data.js';
import { alertKind } from '../../core/phrases.js';
import { haversine } from '../../core/geo.js';
import { fmtRelative } from '../../core/format.js';
import { useDistance } from '../../lib/hooks.js';
import LeafMap from './LeafMap.jsx';
import { ALERT_ICONS, ALERT_GLYPH } from './kinds.js';
import { NavButtons } from './PlacesTab.jsx';

export default function AlertsTab({ meApi }) {
  const alerts = useRows('road_alerts');
  const { me } = meApi;
  const dist = useDistance();
  const [focus, setFocus] = useState(null);
  const active = useMemo(() => {
    const now = Date.now();
    return alerts.filter((a) => !a.cleared_at && new Date(a.expires_at).getTime() > now)
      .map((a) => ({ ...a, away: me ? haversine(me, a) : null }))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [alerts, me]);
  const markers = active.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng, color: '#dc2626', glyph: ALERT_GLYPH[a.kind] || '!', title: `${alertKind(a.kind).label}${a.note ? `: ${a.note}` : ''}`, ring: true }));

  return (
    <div className="space-y-4">
      <LeafMap markers={markers} me={me} focus={focus} fitKey={`${active.length}-${me ? 1 : 0}`} height={320} label="Map of road alerts" />
      {active.length === 0 ? (
        <Empty icon={ShieldCheck} title="No active road alerts" text="Alerts shared by your crew show up here until they expire or someone clears them." />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {active.map((a) => {
            const k = alertKind(a.kind); const Icon = ALERT_ICONS[k.icon] || TriangleAlert;
            return (
              <li key={a.id}>
                <Card className="!p-4">
                  <div className="flex items-start gap-3">
                    <button type="button" aria-label={`Show ${k.label} on the map`} onClick={() => setFocus({ lat: a.lat, lng: a.lng, n: Date.now() })} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950"><Icon size={18} /></button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{k.label}</span><Badge tone="red">Active</Badge></div>
                      <div className="text-xs text-ink-500">{a.author_name || 'A driver'} - {fmtRelative(a.created_at)}{a.away != null ? ` - ${dist(a.away)} away` : ''}</div>
                      {a.note && <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{a.note}</p>}
                      <p className="mt-1 text-xs text-ink-500">Expires {fmtRelative(a.expires_at)}</p>
                      <div className="mt-2"><NavButtons p={a} /></div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
