import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, Textarea, Banner } from '../../components/ui.jsx';
import { FormModal } from '../maintenance/formKit.jsx';
import { create, useProfile } from '../../state/data.js';
import { useApp } from '../../state/app.jsx';
import { useToast } from '../../components/toast.jsx';
import { ALERT_KINDS } from '../../core/phrases.js';
import { getPositionOnce } from '../../core/gps.js';
import { ALERT_ICONS } from './kinds.js';

/** Report a road problem at the driver's position. Shared with the crew when there is one; on this phone only in guest mode. */
export default function ReportForm({ onClose }) {
  const { isAccount, crews } = useApp();
  const profile = useProfile();
  const toast = useToast();
  const [kind, setKind] = useState('accident');
  const [note, setNote] = useState('');
  const [crew, setCrew] = useState(crews[0]?.id || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const blocked = isAccount && crews.length === 0;

  async function submit() {
    if (blocked) return;
    setErr(''); setBusy(true);
    const pos = await getPositionOnce({ timeout: 15000, maxAge: 10000 });
    if (!pos) { setErr('Could not find your location. Turn on location for Roadbook in your phone settings, then try again.'); setBusy(false); return; }
    try {
      await create('road_alerts', { crew_id: isAccount ? crew : null, author_name: (profile.display_name || 'Driver').slice(0, 60), kind, note: note.trim().slice(0, 300), lat: pos.lat, lng: pos.lng, expires_at: new Date(Date.now() + 6 * 3600000).toISOString() });
      toast(isAccount ? 'Alert sent to your team.' : 'Alert saved on this phone.');
      onClose();
    } catch (e) { console.error(e); setErr('Could not save the alert. Try again.'); }
    setBusy(false);
  }
  return (
    <FormModal onClose={onClose} title="Report a problem" submitLabel={blocked ? 'Close' : 'Send alert'} busy={busy} onSubmit={blocked ? onClose : submit}>
      <div className="space-y-4">
        {blocked && <Banner tone="amber">Alerts go to your crew. <Link to="/fleet" className="font-bold underline">Join or start a crew in Fleet</Link> first.</Banner>}
        {!isAccount && <Banner tone="blue">You are not signed in, so this alert stays on this phone. Alerts clear themselves after 6 hours.</Banner>}
        <fieldset>
          <legend className="mb-1.5 text-sm font-bold">What is happening?</legend>
          <div className="grid grid-cols-3 gap-2">
            {ALERT_KINDS.map((k) => {
              const Icon = ALERT_ICONS[k.icon]; const on = kind === k.id;
              return (
                <button key={k.id} type="button" data-autofocus={k.id === 'accident' ? true : undefined} aria-pressed={on} onClick={() => setKind(k.id)}
                  className={`flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-md border px-1 text-center text-xs font-bold ${on ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-ink-300 bg-[var(--surface)] text-ink-700 hover:bg-ink-100 dark:border-ink-600 dark:text-ink-200 dark:hover:bg-ink-800'}`}>
                  <Icon size={20} />{k.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        {isAccount && crews.length > 1 && (
          <Field label="Send to">{(id) => <select id={id} value={crew} onChange={(e) => setCrew(e.target.value)} className="h-11 w-full rounded-md border border-ink-300 bg-[var(--surface)] px-3 text-sm dark:border-ink-600">{crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
        )}
        <Field label="Details (optional)">{(id) => <Textarea id={id} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Where exactly, which lane, how bad" />}</Field>
        {err && <p className="text-sm font-medium text-red-600">{err}</p>}
        <p className="text-xs text-ink-500">The alert is placed where you are right now.</p>
      </div>
    </FormModal>
  );
}
