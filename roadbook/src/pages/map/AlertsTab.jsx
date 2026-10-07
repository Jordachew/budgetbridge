import { useEffect, useMemo } from 'react';
import { ShieldCheck, Siren, Check } from 'lucide-react';
import { Empty, Badge, Button } from '../../components/ui.jsx';
import { useRows, save } from '../../state/data.js';
import { alertKind } from '../../core/phrases.js';
import { haversine } from '../../core/geo.js';
import { fmtRelative } from '../../core/format.js';
import { useDistance } from '../../lib/hooks.js';
import { useToast } from '../../components/toast.jsx';
import { ALERT_ICONS, ALERT_GLYPH } from './kinds.js';
import { NavButtons } from './bits.jsx';

export default function AlertsTab({ meApi, onMarkers, focusOn, report }) {
  const alerts = useRows('road_alerts');
  const { me } = meApi;
  const dist = useDistance();
  const toast = useToast();
  const active = useMemo(() => {
    const now = Date.now();
    return alerts.filter((a) => !a.cleared_at && new Date(a.expires_at).getTime() > now)
      .map((a) => ({ ...a, away: me ? haversine(me, a) : null }))
      .sort((a, b) => (a.away ?? 0) - (b.away ?? 0) || String(b.created_at).localeCompare(String(a.created_at)));
  }, [alerts, me]);
  const markers = useMemo(() => active.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng, color: 'var(--bad)', glyph: ALERT_GLYPH[a.kind] || '!', title: `${alertKind(a.kind).label}${a.note ? `: ${a.note}` : ''}`, ring: true })), [active]);
  useEffect(() => { onMarkers(markers, `alerts-${active.length}`); }, [markers]);

  return (
    <div>
      {active.length === 0 ? (
        <Empty icon={ShieldCheck} title="Road looks clear" text="Problems reported by you and your crew show here until they expire, about 6 hours." action={<Button icon={Siren} variant="outline" onClick={report}>Report a problem</Button>} />
      ) : (
        <ul className="border-t border-[var(--hairline)]">
          {active.map((a) => {
            const k = alertKind(a.kind); const Icon = ALERT_ICONS[k.icon];
            return (
              <li key={a.id} className="border-b border-[var(--hairline)] py-3">
                <div className="flex items-start gap-3">
                  <button type="button" aria-label={`Show ${k.label} on the map`} onClick={() => focusOn(a)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px] text-white" style={{ background: 'var(--bad)' }}><Icon size={18} /></button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{k.label}</span>{a.away != null && <span className="text-sm font-bold">{dist(a.away)} away</span>}{!a.crew_id && <Badge>This phone</Badge>}</div>
                    <div className="text-xs text-ink-500">{a.author_name || 'A driver'} · {fmtRelative(a.created_at)} · clears {fmtRelative(a.expires_at)}</div>
                    {a.note && <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">{a.note}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2"><NavButtons p={a} />
                      {!a.crew_id && <Button size="sm" variant="ghost" icon={Check} onClick={async () => { const { away: _a, ...row } = a; await save('road_alerts', { ...row, cleared_at: new Date().toISOString() }); toast('Alert cleared.'); }}>Clear</Button>}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
