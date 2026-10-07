import { useEffect, useMemo, useState } from 'react';
import { Construction, Flag, Fuel, MapPin, Mountain, ShieldCheck, Siren, TrafficCone, TriangleAlert, Waves, Wrench, X } from 'lucide-react';
import { Banner, Button, Empty, Field, Modal, Textarea, cx } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { create, save, useRows, useProfile } from '../../state/data.js';
import { session } from '../../state/app.jsx';
import { useDistance } from '../../lib/hooks.js';
import { ALERT_KINDS, alertKind } from '../../core/phrases.js';
import { getPositionOnce } from '../../core/gps.js';
import { haversine, mapsLink } from '../../core/geo.js';
import { fmtRelative } from '../../core/format.js';

const ICON = { accident: TriangleAlert, flood: Waves, roadworks: Construction, police: Siren, breakdown: Wrench, traffic: TrafficCone, landslide: Mountain, fuel: Fuel, other: Flag };
export const KindIcon = ({ kind, ...p }) => { const I = ICON[kind] || Flag; return <I {...p} />; };
export const activeAlertCount = (alerts, crewId) => alerts.filter((a) => a.crew_id === crewId && !a.cleared_at && !a.deleted_at && new Date(a.expires_at).getTime() > Date.now()).length;

export default function Alerts({ ctx }) {
  const { crew, me, isManager, online } = ctx;
  const toast = useToast();
  const profile = useProfile();
  const dist = useDistance();
  const all = useRows('road_alerts');
  const [here, setHere] = useState(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('accident');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { let live = true; getPositionOnce().then((p) => { if (live) setHere(p); }); return () => { live = false; }; }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);

  const active = useMemo(() => all
    .filter((a) => a.crew_id === crew.id && !a.cleared_at && !a.deleted_at && new Date(a.expires_at).getTime() > now)
    .map((a) => ({ ...a, d: here ? haversine(here, a) : null }))
    .sort((a, b) => (a.d != null && b.d != null ? a.d - b.d : (b.created_at || '').localeCompare(a.created_at || ''))), [all, crew.id, here, now]);

  async function report() {
    setErr(''); setBusy(true);
    const pos = await getPositionOnce({ timeout: 15000, maxAge: 10000 });
    if (!pos) { setErr('Could not find your location. Turn on location for Roadbook in your phone settings, then try again.'); setBusy(false); return; }
    try {
      await create('road_alerts', { crew_id: crew.id, author_name: (profile.display_name || 'Driver').slice(0, 60), kind, note: note.trim().slice(0, 300), lat: pos.lat, lng: pos.lng, expires_at: new Date(Date.now() + 6 * 3600000).toISOString() });
      setHere(pos); setOpen(false); setNote(''); toast('Alert sent to your team.');
    } catch (e) { console.error(e); setErr('Could not save the alert. Try again.'); } finally { setBusy(false); }
  }
  async function clear(a) {
    if (!online) return toast('You are offline. Try again when you have signal.', { bad: true });
    const { d: _d, ...row } = a;
    try { await session.api.clearAlert(a.id); await save('road_alerts', { ...row, cleared_at: new Date().toISOString(), cleared_by: me }, { fromServer: true }); toast('Alert cleared.'); } catch { toast('Could not clear the alert.', { bad: true }); }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => { setErr(''); setOpen(true); }} className="flex w-full items-center gap-4 rounded-[10px] bg-brand-500 px-5 py-4 text-left text-ink-950 shadow-[0_1px_0_rgba(0,0,0,0.15)] hover:bg-brand-400">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-ink-950 text-brand-400"><Siren size={24} /></span>
        <span className="min-w-0"><span className="block font-display text-2xl font-bold leading-none">Report a road problem</span><span className="mt-1 block text-sm">Warn your team in two taps. Your position is added for you.</span></span>
      </button>
      {!here && <Banner tone="amber">Distances are hidden because your location is not available.</Banner>}
      <div className="flex items-end justify-between"><h2 className="font-display text-2xl font-semibold leading-none">{active.length ? `${active.length} active ${active.length === 1 ? 'alert' : 'alerts'}` : 'Active alerts'}</h2><span className="text-xs text-ink-500">Alerts clear themselves after 6 hours{here ? ', nearest first' : ''}</span></div>
      {!active.length ? <Empty icon={ShieldCheck} title="All clear" text="No active road alerts from your team right now. If you see a problem ahead, report it above so others can avoid it." />
        : (
          <ul className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]">
            {active.map((a) => {
              const k = alertKind(a.kind);
              return (
                <li key={a.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4 sm:flex-nowrap sm:items-center">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"><KindIcon kind={a.kind} size={24} /></span>
                  <div className="min-w-[10rem] flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-3"><span className="font-display text-xl font-semibold leading-tight">{k.label}</span>{a.d != null && <span className="text-sm font-bold">{dist(a.d)} away</span>}</p>
                    {a.note && <p className="mt-0.5 text-sm">{a.note}</p>}
                    <p className="mt-0.5 text-xs text-ink-500">{a.author_name || 'Driver'} · {fmtRelative(a.created_at)} · {a._dirty ? 'sending' : `clears ${fmtRelative(a.expires_at)}`}</p>
                  </div>
                  <div className="flex w-full shrink-0 gap-2 pl-[64px] sm:w-auto sm:pl-0">
                    <Button variant="soft" size="sm" as="a" href={mapsLink({ destination: `${a.lat},${a.lng}` })} target="_blank" rel="noopener noreferrer" icon={MapPin}>Map</Button>
                    {(isManager || a.user_id === me) && <Button variant="outline" size="sm" icon={X} onClick={() => clear(a)}>Clear</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      <Modal open={open} onClose={() => setOpen(false)} title="What is the problem?" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button size="lg" icon={Siren} loading={busy} onClick={report}>Send alert</Button></>}>
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Kind of problem" className="grid grid-cols-3 gap-2">
            {ALERT_KINDS.map((k) => (
              <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
                className={cx('flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-[8px] px-1 py-2 text-center text-xs font-bold ring-1', kind === k.id ? 'bg-brand-500 text-ink-950 ring-brand-500' : 'bg-[var(--surface)] text-ink-700 ring-ink-300 hover:bg-ink-100 dark:text-ink-200 dark:ring-ink-600 dark:hover:bg-ink-800')}>
                <KindIcon kind={k.id} size={22} />{k.label}
              </button>
            ))}
          </div>
          <Field label="Note (optional)" hint="Your current position is added automatically.">{(id) => <Textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Left lane blocked near the roundabout" />}</Field>
          {err && <Banner tone="red">{err}</Banner>}
        </div>
      </Modal>
    </div>
  );
}
