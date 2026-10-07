import { useEffect, useMemo, useState } from 'react';
import { MapPin, Siren, X } from 'lucide-react';
import { Badge, Banner, Button, Card, Chips, Empty, Field, Modal, Textarea } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { create, save, useRows, useProfile } from '../../state/data.js';
import { session } from '../../state/app.jsx';
import { useDistance } from '../../lib/hooks.js';
import { ALERT_KINDS, alertKind } from '../../core/phrases.js';
import { getPositionOnce } from '../../core/gps.js';
import { haversine, mapsLink } from '../../core/geo.js';
import { fmtRelative } from '../../core/format.js';

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
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')), [all, crew.id, here, now]);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">Warn your team about problems on the road. Alerts clear themselves after 6 hours.</p>
        <Button icon={Siren} onClick={() => { setErr(''); setOpen(true); }}>Report an alert</Button>
      </div>
      {!here && <Banner tone="amber">Distances are hidden because your location is not available.</Banner>}
      {!active.length ? <Empty icon={MapPin} title="All clear" text="No active road alerts from your team right now." />
        : (
          <ul className="space-y-3">
            {active.map((a) => {
              const k = alertKind(a.kind);
              return (
                <li key={a.id}><Card className="!p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone="amber">{k.label}</Badge>{a.d != null && <span className="text-sm font-semibold">{dist(a.d)} away</span>}</div>
                      {a.note && <p className="mt-1.5 text-sm">{a.note}</p>}
                      <p className="mt-1 text-xs text-ink-500">{a.author_name || 'Driver'} · {fmtRelative(a.created_at)} · {a._dirty ? 'sending' : `expires ${fmtRelative(a.expires_at)}`}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="soft" size="sm" as="a" href={mapsLink({ destination: `${a.lat},${a.lng}` })} target="_blank" rel="noopener noreferrer" icon={MapPin}>Map</Button>
                      {(isManager || a.user_id === me) && <Button variant="outline" size="sm" icon={X} onClick={() => clear(a)}>Clear</Button>}
                    </div>
                  </div>
                </Card></li>
              );
            })}
          </ul>
        )}
      <Modal open={open} onClose={() => setOpen(false)} title="Report a road alert" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={report}>Send alert</Button></>}>
        <div className="space-y-4">
          <Field label="What is happening?">{() => <Chips value={kind} onChange={setKind} options={ALERT_KINDS.map((k) => ({ value: k.id, label: k.label }))} />}</Field>
          <Field label="Note (optional)" hint="Your current position is added automatically.">{(id) => <Textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Left lane blocked near the roundabout" />}</Field>
          {err && <Banner tone="red">{err}</Banner>}
        </div>
      </Modal>
    </div>
  );
}
