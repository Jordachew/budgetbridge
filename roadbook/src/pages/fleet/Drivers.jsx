import { useState } from 'react';
import { LogOut, Pencil, Trash2, UserMinus, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge, Banner, Button, Card, CardTitle, Field, Input, Modal, Switch, useConfirm } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { session } from '../../state/app.jsx';
import { fmtDate, initials } from '../../core/format.js';
import { plainError } from './CrewStart.jsx';
import { ROLE_LABEL, ROLE_TONE } from './Overview.jsx';

function EditCompany({ crew, onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState(crew.name);
  const [color, setColor] = useState(crew.brand_color || '#f97316');
  const [useColor, setUseColor] = useState(!!crew.brand_color);
  const [phone, setPhone] = useState(crew.phone || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    const n = name.trim();
    if (n.length < 2 || n.length > 60) return setErr('Company name must be 2 to 60 letters.');
    setBusy(true);
    try { await session.api.updateCrew(crew.id, n, useColor ? color : '', phone.trim().slice(0, 30)); toast('Company updated.'); await onDone(); onClose(); }
    catch (e) { setErr(plainError(e, 'Could not save. Try again.')); setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Edit company" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Company name" error={err}>{(id) => <Input id={id} value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setErr(''); }} />}</Field>
        <Field label="Phone (optional)">{(id) => <Input id={id} type="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <div>
          <Switch checked={useColor} onChange={setUseColor} label="Use a company colour" />
          {useColor && <input type="color" aria-label="Company colour" value={color} onChange={(e) => setColor(e.target.value)} className="mt-1 h-10 w-20 cursor-pointer rounded-lg border border-ink-300 bg-transparent p-1" />}
        </div>
      </div>
    </Modal>
  );
}

export default function Drivers({ ctx }) {
  const { crew, me, isManager, isOwner, roster, online, refresh } = ctx;
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const mine = roster.find((r) => r.user_id === me);
  const needOnline = () => { if (!online) { toast('You are offline. Try again when you have signal.', { bad: true }); return true; } return false; };

  async function run(key, fn, msg) {
    if (needOnline()) return;
    setBusy(key);
    try { await fn(); await refresh(); if (msg) toast(msg); } catch (e) { toast(plainError(e, 'That did not work. Try again.'), { bad: true }); } finally { setBusy(''); }
  }
  const setRole = (r, role) => run(r.user_id, () => session.api.setMemberRole(crew.id, r.user_id, role), role === 'admin' ? `${r.display_name} is now an admin.` : `${r.display_name} is now a driver.`);
  const kick = async (r) => {
    if (await confirm({ title: `Remove ${r.display_name}?`, text: 'They will lose access to the company chat, alerts and dispatched loads. Their own records stay with them.', confirmLabel: 'Remove', danger: true }))
      run(r.user_id, () => session.api.removeMember(crew.id, r.user_id), `${r.display_name} was removed.`);
  };
  const leave = async () => {
    if (await confirm({ title: `Leave ${crew.name}?`, text: 'You will stop seeing the company chat and loads. You can join again later with a code.', confirmLabel: 'Leave company', danger: true }))
      run('leave', () => session.api.leaveCrew(crew.id), 'You left the company.');
  };
  const del = async () => {
    if (await confirm({ title: `Delete ${crew.name}?`, text: 'This removes the company, its chat and road alerts for everyone. Drivers keep their own records. This cannot be undone.', confirmLabel: 'Delete company', danger: true }))
      run('del', () => session.api.deleteCrew(crew.id), 'Company deleted.');
  };

  return (
    <div className="space-y-4">
      {!online && <Banner tone="amber">You are offline. You can look at the list, but changes need a connection.</Banner>}
      <Card className="!p-0">
        <div className="p-5 pb-2"><CardTitle title="Team" sub={`${roster.length} ${roster.length === 1 ? 'person' : 'people'} in ${crew.name}`} /></div>
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {roster.map((r) => {
            const self = r.user_id === me;
            const canKick = !self && r.role !== 'owner' && (isOwner || (isManager && r.role === 'driver'));
            return (
              <li key={r.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-200" aria-hidden>{initials(r.display_name)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{r.display_name}{self ? ' (you)' : ''}</span><Badge tone={ROLE_TONE[r.role]}>{ROLE_LABEL[r.role]}</Badge></div>
                  <p className="text-xs text-ink-500">Joined {fmtDate(r.joined_at, { weekday: false, year: true })}{r.role === 'driver' && r.share_data != null ? (r.share_data ? ' · shares records' : ' · does not share records') : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  {isOwner && !self && r.role === 'driver' && <Button variant="soft" size="sm" icon={ShieldCheck} loading={busy === r.user_id} onClick={() => setRole(r, 'admin')}>Make admin</Button>}
                  {isOwner && !self && r.role === 'admin' && <Button variant="soft" size="sm" icon={ShieldOff} loading={busy === r.user_id} onClick={() => setRole(r, 'driver')}>Make driver</Button>}
                  {canKick && <Button variant="ghost" size="sm" icon={UserMinus} aria-label={`Remove ${r.display_name}`} onClick={() => kick(r)}><span className="hidden sm:inline">Remove</span></Button>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {mine?.role === 'driver' && (
        <Card>
          <CardTitle title="Your privacy" />
          <Switch checked={!!mine.share_data} onChange={(v) => run('share', () => session.api.setShare(crew.id, v), v ? 'Sharing is on.' : 'Sharing is off.')} label="Share my records with the company" hint="Lets owners and admins see your trips, loads and totals in the team report. Turn it off any time." />
        </Card>
      )}

      <Card>
        <CardTitle title="Company settings" />
        <div className="flex flex-wrap gap-2">
          {isOwner && <Button variant="outline" icon={Pencil} onClick={() => setEditing(true)}>Edit company details</Button>}
          {!isOwner && <Button variant="outline" icon={LogOut} loading={busy === 'leave'} onClick={leave}>Leave company</Button>}
          {isOwner && <Button variant="danger" icon={Trash2} loading={busy === 'del'} onClick={del}>Delete company</Button>}
        </div>
        {isOwner && <p className="mt-3 text-xs text-ink-500">As the owner you cannot leave. Delete the company if you no longer need it.</p>}
      </Card>
      {editing && <EditCompany crew={crew} onClose={() => setEditing(false)} onDone={refresh} />}
      {node}
    </div>
  );
}
