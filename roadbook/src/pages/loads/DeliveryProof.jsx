import { useEffect, useRef, useState } from 'react';
import { Camera, MapPin, ShieldCheck, ShieldAlert, Eraser, Lock, Copy, ExternalLink, AlertTriangle } from 'lucide-react';
import { Card, CardTitle, Button, Badge, Field, Input, Textarea, Banner } from '../../components/ui.jsx';
import { create, save, userId } from '../../state/data.js';
import * as store from '../../core/store.js';
import { session } from '../../state/app.jsx';
import { savePicked, useFileUrl } from '../../lib/files.js';
import { signaturePad } from '../../core/images.js';
import { getPositionOnce } from '../../core/gps.js';
import { proofHash, verifyProof } from '../../core/hash.js';
import { discrepancies } from '../../core/calc.js';
import { fmtDateTime } from '../../core/format.js';
import { uuid } from '../../core/util.js';
import { useToast } from '../../components/toast.jsx';

async function fileBlob(path) {
  if (!path) return null;
  try { return session.sync ? await session.sync.fetchFile(path) : (await store.getDb().getFile(path))?.blob || null; } catch { return null; }
}
const bytesOf = async (blob) => (blob ? new Uint8Array(await blob.arrayBuffer()) : null);

/* ---------- sealed (read only) ---------- */
function Sealed({ delivery }) {
  const sig = useFileUrl(delivery.signature_path);
  const photo = useFileUrl(delivery.photo_path);
  const [check, setCheck] = useState('checking');
  const toast = useToast();
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

  const items = delivery.items || [];
  const bad = discrepancies(items);
  return (
    <Card>
      <CardTitle title="Delivery proof" sub={`Sealed ${fmtDateTime(delivery.delivered_at)}. This record cannot be changed.`}
        action={<Badge tone="green"><Lock size={12} className="mr-1" />Sealed</Badge>} />
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-ink-500">Received by</dt><dd className="font-semibold">{delivery.receiver_name || 'Not recorded'}</dd></div>
        <div><dt className="text-xs text-ink-500">Location stamp</dt><dd>{delivery.lat != null
          ? <a className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${delivery.lat},${delivery.lng}`}><MapPin size={14} />{Number(delivery.lat).toFixed(5)}, {Number(delivery.lng).toFixed(5)}{delivery.accuracy_m != null && <span className="text-ink-500"> (within {Math.round(delivery.accuracy_m)} m)</span>}<ExternalLink size={12} /></a>
          : <span className="text-ink-500">No GPS signal when sealed</span>}</dd></div>
      </dl>
      {items.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-ink-200/70 dark:ring-ink-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-50 text-xs text-ink-500 dark:bg-ink-900/60"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Expected</th><th className="px-3 py-2 text-right">Received</th></tr></thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {items.map((i, n) => { const off = Number(i.received) !== Number(i.expected); return (
                <tr key={n}><td className="px-3 py-2">{i.name}</td><td className="px-3 py-2 text-right tabular-nums">{i.expected} {i.unit}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${off ? 'text-red-600' : ''}`}>{i.received} {i.unit}{off && ` (${i.received - i.expected > 0 ? '+' : ''}${i.received - i.expected})`}</td></tr>); })}
            </tbody>
          </table>
        </div>
      )}
      {delivery.has_discrepancy && (
        <div className="mt-3"><Banner tone="amber"><span className="inline-flex items-center gap-2 font-semibold"><AlertTriangle size={16} />Counts did not match{bad.length ? ` on ${bad.length} item${bad.length === 1 ? '' : 's'}` : ''}.</span>{delivery.discrepancy_note && <p className="mt-1">{delivery.discrepancy_note}</p>}</Banner></div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {delivery.signature_path && <figure><figcaption className="mb-1 text-xs text-ink-500">Signature</figcaption>{sig ? <img src={sig} alt="Receiver signature" className="h-32 w-full rounded-lg bg-white object-contain ring-1 ring-ink-200" /> : <div className="h-32 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />}</figure>}
        {delivery.photo_path && <figure><figcaption className="mb-1 text-xs text-ink-500">Photo</figcaption>{photo ? <img src={photo} alt="Delivery photo" className="h-32 w-full rounded-lg object-cover ring-1 ring-ink-200" /> : <div className="h-32 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />}</figure>}
      </div>
      <div className="mt-4 rounded-xl bg-ink-50 p-3 dark:bg-ink-800/50">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-ink-500">
          <span>Fingerprint (SHA-256)</span>
          {check === 'ok' && <Badge tone="green"><ShieldCheck size={12} className="mr-1" />Matches the record</Badge>}
          {check === 'bad' && <Badge tone="red"><ShieldAlert size={12} className="mr-1" />Does not match</Badge>}
          {check === 'unknown' && <Badge tone="amber">Files not on this device yet</Badge>}
        </div>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all text-xs">{delivery.proof_hash || 'No fingerprint'}</code>
          {delivery.proof_hash && <button type="button" aria-label="Copy fingerprint" className="rounded p-1 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700" onClick={() => { navigator.clipboard?.writeText(delivery.proof_hash).then(() => toast('Fingerprint copied'), () => {}); }}><Copy size={14} /></button>}
        </div>
      </div>
    </Card>
  );
}

/* ---------- capture ---------- */
function Capture({ load, onDone, onCancel }) {
  const toast = useToast();
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const fileRef = useRef(null);
  const [receiver, setReceiver] = useState('');
  const [items, setItems] = useState(() => (load.items || []).map((i) => ({ ...i, received: i.expected })));
  const [note, setNote] = useState('');
  const [gps, setGps] = useState({ state: 'idle', pos: null });
  const [photo, setPhoto] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const photoUrl = photo ? URL.createObjectURL(photo) : null;
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  useEffect(() => { padRef.current = signaturePad(canvasRef.current); }, []);
  async function stamp() {
    setGps({ state: 'busy', pos: null });
    const pos = await getPositionOnce({ timeout: 10000, maxAge: 0 });
    setGps(pos ? { state: 'ok', pos } : { state: 'fail', pos: null });
  }
  useEffect(() => { stamp(); }, []);

  const bad = discrepancies(items.map((i) => ({ ...i, received: i.received === '' ? NaN : i.received })));

  async function seal() {
    const e = {};
    if (!receiver.trim()) e.receiver = 'Type the name of the person who received the load.';
    if (padRef.current.isEmpty()) e.signature = 'Ask the receiver to sign in the box.';
    for (const i of items) if (i.received === '' || !Number.isFinite(Number(i.received)) || Number(i.received) < 0) e.items = 'Enter how many of each item were received (0 if none).';
    if (bad.length && !note.trim()) e.note = 'Counts do not match. Add a short note saying what was short or damaged.';
    setErrors(e);
    if (Object.keys(e).length) return;
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

  return (
    <Card>
      <CardTitle title="Record delivery proof" sub="Fill this in with the receiver. Once sealed it cannot be edited." />
      <div className="space-y-4">
        {errors.form && <Banner tone="red">{errors.form}</Banner>}
        <Field label="Received by" error={errors.receiver}>{(id) => <Input id={id} maxLength={100} value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Receiver's full name" />}</Field>
        {items.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium">Count what was received</p>
            <div className="space-y-2">
              {items.map((it, n) => { const off = it.received !== '' && Number(it.received) !== Number(it.expected); return (
                <div key={n} className="grid grid-cols-[1fr_6.5rem] items-center gap-3">
                  <div className="min-w-0"><div className="truncate text-sm font-medium">{it.name}</div><div className="text-xs text-ink-500">Expected {it.expected} {it.unit}</div></div>
                  <Input aria-label={`${it.name} received`} inputMode="decimal" value={it.received} className={off ? 'border-red-500 bg-red-50 dark:bg-red-950' : ''}
                    onChange={(e) => setItems((l) => l.map((x, j) => (j === n ? { ...x, received: e.target.value } : x)))} />
                </div>); })}
            </div>
            {errors.items && <p className="mt-1 text-xs font-medium text-red-600">{errors.items}</p>}
            {bad.length > 0 && <div className="mt-2"><Banner tone="amber"><span className="inline-flex items-center gap-2 font-semibold"><AlertTriangle size={16} />Counts do not match on {bad.length} item{bad.length === 1 ? '' : 's'}.</span></Banner></div>}
          </div>
        )}
        {(bad.length > 0 || note) && <Field label="Note on the difference" error={errors.note}>{(id) => <Textarea id={id} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2 boxes damaged, receiver refused them" />}</Field>}

        <div>
          <div className="mb-1.5 flex items-center justify-between"><span className="text-sm font-medium">Receiver signature</span>
            <Button size="sm" variant="ghost" icon={Eraser} onClick={() => padRef.current.clear()}>Clear</Button></div>
          <canvas ref={canvasRef} width={720} height={260} aria-label="Signature box" className="h-40 w-full touch-none rounded-xl border border-dashed border-ink-400 bg-white" />
          {errors.signature && <p className="mt-1 text-xs font-medium text-red-600">{errors.signature}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-ink-50 p-3 text-sm dark:bg-ink-800/50">
            <div className="mb-1 flex items-center gap-2 font-medium"><MapPin size={16} />Location stamp</div>
            {gps.state === 'busy' && <p className="text-xs text-ink-500">Finding your position...</p>}
            {gps.state === 'ok' && <p className="text-xs text-emerald-700 dark:text-emerald-400">Got it: {gps.pos.lat.toFixed(5)}, {gps.pos.lng.toFixed(5)} (within {gps.pos.accuracy} m)</p>}
            {gps.state === 'fail' && <p className="text-xs text-amber-700 dark:text-amber-400">No GPS fix. You can still seal without one, or try again outside.</p>}
            <Button size="sm" variant="soft" className="mt-2" onClick={stamp} loading={gps.state === 'busy'}>{gps.state === 'ok' ? 'Refresh' : 'Stamp my location'}</Button>
          </div>
          <div className="rounded-xl bg-ink-50 p-3 text-sm dark:bg-ink-800/50">
            <div className="mb-1 flex items-center gap-2 font-medium"><Camera size={16} />Photo (optional)</div>
            {photoUrl ? <img src={photoUrl} alt="Delivery photo preview" className="mb-2 h-20 w-full rounded-lg object-cover" /> : <p className="text-xs text-ink-500">A picture of the load at drop-off helps if there is a dispute.</p>}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take delivery photo" onChange={(e) => { setPhoto(e.target.files?.[0] || null); e.target.value = ''; }} />
            <Button size="sm" variant="soft" className="mt-2" onClick={() => fileRef.current.click()}>{photo ? 'Retake photo' : 'Take photo'}</Button>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button icon={Lock} loading={busy} onClick={seal}>Seal and mark delivered</Button>
        </div>
      </div>
    </Card>
  );
}

export default function DeliveryProof({ load, delivery, open, onOpen, onClose }) {
  if (delivery) return <Sealed delivery={delivery} />;
  if (open) return <Capture load={load} onDone={onClose} onCancel={onClose} />;
  if (load.status === 'cancelled') return null;
  return (
    <Card>
      <CardTitle title="Delivery proof" sub="Get a signature, count the items and stamp the location when you drop off." />
      <Button icon={ShieldCheck} onClick={onOpen}>Record delivery</Button>
    </Card>
  );
}
