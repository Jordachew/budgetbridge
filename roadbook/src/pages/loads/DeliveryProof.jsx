import { useEffect, useRef, useState } from 'react';
import { Camera, MapPin, ShieldCheck, ShieldAlert, Lock, Copy, ExternalLink, AlertTriangle, Minus, Plus, FileBadge, Check, Crosshair } from 'lucide-react';
import { Card, CardTitle, Button, Badge, Field, Input, Textarea, Banner, cx } from '../../components/ui.jsx';
import { create, save, userId } from '../../state/data.js';
import * as store from '../../core/store.js';
import { session } from '../../state/app.jsx';
import { savePicked, useFileUrl } from '../../lib/files.js';
import { getPositionOnce } from '../../core/gps.js';
import { proofHash, verifyProof } from '../../core/hash.js';
import { discrepancies } from '../../core/calc.js';
import { fmtDateTime } from '../../core/format.js';
import { uuid } from '../../core/util.js';
import { useToast } from '../../components/toast.jsx';
import Sheet from './Sheet.jsx';
import SigPad from './SigPad.jsx';

async function fileBlob(path) {
  if (!path) return null;
  try { return session.sync ? await session.sync.fetchFile(path) : (await store.getDb().getFile(path))?.blob || null; } catch { return null; }
}
const bytesOf = async (blob) => (blob ? new Uint8Array(await blob.arrayBuffer()) : null);

/** 'checking' | 'none' | 'ok' | 'bad' | 'unknown': does the stored proof still match its fingerprint? */
export function useProofCheck(delivery) {
  const [check, setCheck] = useState('checking');
  useEffect(() => {
    let live = true;
    (async () => {
      if (!delivery.proof_hash) { setCheck('none'); return; }
      const [s, p] = await Promise.all([fileBlob(delivery.signature_path), fileBlob(delivery.photo_path)]);
      if ((delivery.signature_path && !s) || (delivery.photo_path && !p)) { if (live) setCheck('unknown'); return; }
      try { const ok = await verifyProof(delivery, await bytesOf(s), await bytesOf(p)); if (live) setCheck(ok ? 'ok' : 'bad'); } catch { if (live) setCheck('unknown'); }
    })();
    return () => { live = false; };
  }, [delivery]);
  return check;
}
export const CheckBadge = ({ check }) => {
  if (check === 'ok') return <Badge tone="green" icon={ShieldCheck}>Matches the record</Badge>;
  if (check === 'bad') return <Badge tone="red" icon={ShieldAlert}>Does not match</Badge>;
  if (check === 'unknown') return <Badge tone="amber">Files not on this device yet</Badge>;
  return null;
};

/* ---------- sealed (read only) ---------- */
function Sealed({ delivery, onCertificate }) {
  const sig = useFileUrl(delivery.signature_path);
  const photo = useFileUrl(delivery.photo_path);
  const check = useProofCheck(delivery);
  const toast = useToast();
  const items = delivery.items || [];
  const bad = discrepancies(items);
  return (
    <Card>
      <CardTitle title="Proof of delivery" sub={`Sealed ${fmtDateTime(delivery.delivered_at)}. This record cannot be changed.`}
        action={<Badge tone="green" icon={Lock}>Sealed</Badge>} />
      <Button icon={FileBadge} size="lg" className="mb-5 w-full sm:w-auto" onClick={onCertificate}>View and print certificate</Button>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">Received by</dt><dd className="mt-0.5 text-base font-bold">{delivery.receiver_name || 'Not recorded'}</dd></div>
        <div><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">Location stamp</dt><dd className="mt-0.5">{delivery.lat != null
          ? <a className="inline-flex items-center gap-1 font-bold text-brand-600 hover:underline dark:text-brand-400" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${delivery.lat},${delivery.lng}`}><MapPin size={14} />{Number(delivery.lat).toFixed(5)}, {Number(delivery.lng).toFixed(5)}{delivery.accuracy_m != null && <span className="font-normal text-ink-500"> (within {Math.round(delivery.accuracy_m)} m)</span>}<ExternalLink size={12} /></a>
          : <span className="text-ink-500">No GPS signal when sealed</span>}</dd></div>
      </dl>
      {items.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr className="border-b-2 border-ink-800 text-xs font-bold uppercase tracking-wide text-ink-500 dark:border-ink-300"><th className="py-2 pr-3">Item</th><th className="px-3 py-2 text-right">Expected</th><th className="py-2 pl-3 text-right">Received</th></tr></thead>
            <tbody>
              {items.map((i, n) => { const off = Number(i.received) !== Number(i.expected); return (
                <tr key={n} className="border-b border-[var(--hairline)]"><td className="py-2 pr-3">{i.name}</td><td className="px-3 py-2 text-right tabular-nums">{i.expected} {i.unit}</td>
                  <td className={cx('py-2 pl-3 text-right font-bold tabular-nums', off && 'text-[var(--bad)]')}>{off && <AlertTriangle size={13} className="mr-1 inline" aria-label="Short or over" />}{i.received} {i.unit}{off && ` (${i.received - i.expected > 0 ? '+' : ''}${i.received - i.expected})`}</td></tr>); })}
            </tbody>
          </table>
        </div>
      )}
      {delivery.has_discrepancy && (
        <div className="mt-3"><Banner tone="amber"><span className="inline-flex items-center gap-2 font-bold"><AlertTriangle size={16} />Counts did not match{bad.length ? ` on ${bad.length} item${bad.length === 1 ? '' : 's'}` : ''}.</span>{delivery.discrepancy_note && <p className="mt-1">{delivery.discrepancy_note}</p>}</Banner></div>
      )}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {delivery.signature_path && <figure><figcaption className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Signature</figcaption>{sig ? <img src={sig} alt="Receiver signature" className="aspect-video w-full rounded-md bg-white object-contain ring-1 ring-ink-300" /> : <div className="aspect-video animate-pulse rounded-md bg-ink-100 dark:bg-ink-800" />}</figure>}
        {delivery.photo_path && <figure><figcaption className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Photo at drop-off</figcaption>{photo ? <img src={photo} alt="Delivery photo" className="aspect-video w-full rounded-md object-cover ring-1 ring-ink-300" /> : <div className="aspect-video animate-pulse rounded-md bg-ink-100 dark:bg-ink-800" />}</figure>}
      </div>
      <div className="mt-5 rounded-md bg-ink-50 p-3 dark:bg-ink-800/50">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide text-ink-500"><span>Fingerprint (SHA-256)</span><CheckBadge check={check} /></div>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all text-xs">{delivery.proof_hash || 'No fingerprint'}</code>
          {delivery.proof_hash && <button type="button" aria-label="Copy fingerprint" className="flex h-9 w-9 items-center justify-center rounded text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700" onClick={() => { navigator.clipboard?.writeText(delivery.proof_hash).then(() => toast('Fingerprint copied'), () => {}); }}><Copy size={15} /></button>}
        </div>
      </div>
    </Card>
  );
}

/* ---------- capture ---------- */
function StepHead({ n, title, done, hint }) {
  return (
    <div className="mb-2 flex items-center gap-2.5">
      <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', done ? 'bg-[var(--good)] text-white' : 'bg-ink-900 text-white dark:bg-ink-200 dark:text-ink-900')}>{done ? <Check size={15} strokeWidth={3} /> : n}</span>
      <div><div className="font-display text-lg font-bold leading-none">{title}</div>{hint && <div className="mt-0.5 text-xs text-ink-500">{hint}</div>}</div>
    </div>
  );
}

function Capture({ load, onDone, onCancel }) {
  const toast = useToast();
  const padRef = useRef(null);
  const fileRef = useRef(null);
  const [receiver, setReceiver] = useState('');
  const [items, setItems] = useState(() => (load.items || []).map((i) => ({ ...i, received: i.expected })));
  const [note, setNote] = useState('');
  const [gps, setGps] = useState({ state: 'idle', pos: null });
  const [photo, setPhoto] = useState(null);
  const [inked, setInked] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  useEffect(() => {
    if (!photo) { setPhotoUrl(null); return undefined; }
    const u = URL.createObjectURL(photo); setPhotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  async function stamp() {
    setGps({ state: 'busy', pos: null });
    const pos = await getPositionOnce({ timeout: 10000, maxAge: 0 });
    setGps(pos ? { state: 'ok', pos } : { state: 'fail', pos: null });
  }
  useEffect(() => { stamp(); }, []);

  const bad = discrepancies(items.map((i) => ({ ...i, received: i.received === '' ? NaN : i.received })));
  const bump = (n, d) => setItems((l) => l.map((x, j) => (j === n ? { ...x, received: String(Math.max(0, (Number(x.received) || 0) + d)) } : x)));

  async function seal() {
    const e = {};
    if (!receiver.trim()) e.receiver = 'Type the name of the person who received the load.';
    if (padRef.current.isEmpty()) e.signature = 'Ask the receiver to sign in the box.';
    for (const i of items) if (i.received === '' || !Number.isFinite(Number(i.received)) || Number(i.received) < 0) e.items = 'Enter how many of each item were received (0 if none).';
    if (bad.length && !note.trim()) e.note = 'Counts do not match. Add a short note saying what was short or damaged.';
    setErrors(e);
    if (Object.keys(e).length) { setTimeout(() => document.querySelector('[data-proof-error]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); return; }
    setBusy(true);
    try {
      const sigBlob = await padRef.current.toBlob();
      const sigPath = `${userId()}/signatures/${uuid()}.png`;
      await store.getDb().putFile(sigPath, sigBlob, false);
      let photoPath = null; let photoBytes = null;
      if (photo) {
        photoPath = await savePicked(photo, 'deliveries');
        photoBytes = await bytesOf(await fileBlob(photoPath));
      }
      session.sync?.schedule(1500);
      const finalItems = items.map((i) => ({ name: i.name, unit: i.unit, expected: Number(i.expected), received: Number(i.received) }));
      const d = {
        load_id: load.id, delivered_at: new Date().toISOString(),
        lat: gps.pos?.lat ?? null, lng: gps.pos?.lng ?? null, accuracy_m: gps.pos?.accuracy ?? null,
        receiver_name: receiver.trim().slice(0, 100), items: finalItems,
        has_discrepancy: discrepancies(finalItems).length > 0, discrepancy_note: note.trim().slice(0, 500),
      };
      const hash = await proofHash(d, await bytesOf(sigBlob), photoBytes);
      await create('deliveries', { ...d, signature_path: sigPath, photo_path: photoPath, proof_hash: hash });
      await save('loads', { ...load, status: 'delivered' });
      toast('Delivery sealed. Load marked as delivered.');
      onDone();
    } catch (err) {
      setErrors({ form: err.message || 'Could not save the delivery proof. Try again.' });
    } finally { setBusy(false); }
  }
  const err = (m) => m && <p data-proof-error role="alert" className="mt-1.5 text-sm font-bold text-[var(--bad)]">{m}</p>;

  return (
    <Sheet title="Delivery proof" eyebrow={load.reference || load.customer || 'Load'} onClose={onCancel} onSubmit={seal}
      footer={<Button type="submit" size="lg" icon={Lock} loading={busy} className="!h-14 w-full !text-base">Seal and mark delivered</Button>}>
      <div className="space-y-7">
        {errors.form && <Banner tone="red">{errors.form}</Banner>}
        <p className="text-sm text-ink-600 dark:text-ink-300">Do this with the receiver, standing at the drop-off. Once sealed it cannot be edited.</p>

        <section>
          <StepHead n={1} title="Who received it?" done={!!receiver.trim()} />
          <Field label="Receiver's full name" className="[&>label]:sr-only">{(id) => <Input id={id} autoFocus={false} maxLength={100} className="!h-14 !text-lg" autoComplete="off" value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Receiver's full name" />}</Field>
          {err(errors.receiver)}
        </section>

        {items.length > 0 && (
          <section>
            <StepHead n={2} title="Count what was received" hint="Tap minus or plus. The expected amount is filled in." done={!bad.length} />
            <div className="divide-y divide-[var(--hairline)] rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]">
              {items.map((it, n) => { const off = it.received !== '' && Number(it.received) !== Number(it.expected); return (
                <div key={n} className={cx('flex items-center gap-3 p-3', off && 'bg-amber-50 dark:bg-amber-950/30')}>
                  <div className="min-w-0 flex-1"><div className="truncate font-bold">{it.name}</div><div className="text-xs text-ink-500">Expected {it.expected} {it.unit}</div></div>
                  <button type="button" aria-label={`One less ${it.name}`} onClick={() => bump(n, -1)} className="flex h-12 w-12 items-center justify-center rounded-md bg-ink-100 active:bg-ink-200 dark:bg-ink-800"><Minus size={20} /></button>
                  <Input aria-label={`${it.name} received`} inputMode="decimal" className={cx('!h-12 !w-20 text-center !text-xl font-bold tabular-nums', off && '!border-[var(--warn)]')} value={it.received}
                    onChange={(e) => setItems((l) => l.map((x, j) => (j === n ? { ...x, received: e.target.value } : x)))} />
                  <button type="button" aria-label={`One more ${it.name}`} onClick={() => bump(n, 1)} className="flex h-12 w-12 items-center justify-center rounded-md bg-ink-100 active:bg-ink-200 dark:bg-ink-800"><Plus size={20} /></button>
                </div>); })}
            </div>
            {err(errors.items)}
            {bad.length > 0 && <div className="mt-3"><Banner tone="amber"><span className="inline-flex items-center gap-2 font-bold"><AlertTriangle size={16} />Counts do not match on {bad.length} item{bad.length === 1 ? '' : 's'}. Say what happened below.</span></Banner></div>}
            {(bad.length > 0 || note) && <div className="mt-3"><Field label="Note on the difference">{(id) => <Textarea id={id} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 boxes damaged, receiver refused them" />}</Field>{err(errors.note)}</div>}
          </section>
        )}

        <section>
          <StepHead n={items.length ? 3 : 2} title="Receiver signs" done={inked} />
          <SigPad padRef={padRef} onInk={setInked} />
          {err(errors.signature)}
        </section>

        <section>
          <StepHead n={items.length ? 4 : 3} title="Photo and location" hint="A picture of the load at drop-off helps if there is ever a dispute." done={!!photo} />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take delivery photo" onChange={(e) => { setPhoto(e.target.files?.[0] || null); e.target.value = ''; }} />
          {photoUrl ? (
            <div className="relative overflow-hidden rounded-[10px] ring-1 ring-ink-300">
              <img src={photoUrl} alt="Delivery photo preview" className="aspect-video w-full object-cover" />
              <Button variant="dark" size="sm" icon={Camera} className="absolute bottom-2 right-2" onClick={() => fileRef.current.click()}>Retake</Button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current.click()} className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-ink-400 bg-[var(--surface)] text-ink-700 active:bg-ink-100 dark:text-ink-200">
              <Camera size={26} /><span className="text-sm font-bold">Take a photo (optional)</span>
            </button>
          )}
          <div className="mt-3 flex items-center gap-3 rounded-[10px] bg-ink-50 p-3 dark:bg-ink-800/50" aria-live="polite">
            <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', gps.state === 'ok' ? 'bg-[var(--good)] text-white' : 'bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-100')}><Crosshair size={18} className={gps.state === 'busy' ? 'animate-pulse' : ''} /></span>
            <div className="min-w-0 flex-1 text-sm">
              {gps.state === 'busy' && <span className="text-ink-500">Finding your position...</span>}
              {gps.state === 'ok' && <><b>Location stamped</b><span className="block truncate text-xs text-ink-500">{gps.pos.lat.toFixed(5)}, {gps.pos.lng.toFixed(5)} (within {gps.pos.accuracy} m)</span></>}
              {gps.state === 'fail' && <><b>No GPS fix</b><span className="block text-xs text-ink-500">You can still seal, or try again outside.</span></>}
            </div>
            <Button size="sm" variant="soft" onClick={stamp} loading={gps.state === 'busy'}>{gps.state === 'ok' ? 'Refresh' : 'Try again'}</Button>
          </div>
        </section>
      </div>
    </Sheet>
  );
}

export default function DeliveryProof({ load, delivery, open, onOpen, onClose, onCertificate }) {
  if (delivery) return <Sealed delivery={delivery} onCertificate={onCertificate} />;
  if (load.status === 'cancelled') return null;
  return (
    <>
      <Card>
        <CardTitle title="Delivery proof" sub="Get a signature, count the items and stamp the location when you drop off." />
        <Button size="lg" icon={ShieldCheck} className="w-full sm:w-auto" onClick={onOpen}>Start delivery proof</Button>
      </Card>
      {open && <Capture load={load} onDone={onClose} onCancel={onClose} />}
    </>
  );
}
