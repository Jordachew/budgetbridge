import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, FileBadge, ShieldAlert, Clock, ShieldCheck } from 'lucide-react';
import { Button, Empty, IconButton, Badge, Select, Field, Input, Textarea, Plate } from '../../components/ui.jsx';
import { FormModal } from './formKit.jsx';
import { useRows, create, save } from '../../state/data.js';
import { fmtDate } from '../../core/format.js';
import { softDelete } from '../../lib/undo.js';
import { savePicked } from '../../lib/files.js';
import { useToast } from '../../components/toast.jsx';
import FileThumb from './FileThumb.jsx';
import { DOC_KINDS, docKindLabel, docStatus } from './status.js';

function DocForm({ doc, vehicles, onClose }) {
  const toast = useToast();
  const editing = !!doc?.id;
  const file = useRef(null);
  const [f, setF] = useState({ vehicle: doc?.vehicle_id || '', kind: doc?.kind || 'licence', title: doc?.title || '', number: doc?.number || '', issued: doc?.issued_at || '', expires: doc?.expires_at || '', notes: doc?.notes || '' });
  const [picked, setPicked] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    const e = {};
    if (!f.title.trim()) e.title = 'Give the document a title, for example "Truck insurance".';
    if (f.issued && f.expires && f.expires < f.issued) e.expires = 'The expiry date must be after the issue date.';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      let path = doc?.file_path || null;
      if (picked) path = await savePicked(picked, 'documents');
      const row = { ...(doc || {}), vehicle_id: f.vehicle || null, kind: f.kind, title: f.title.trim().slice(0, 100), number: f.number.trim().slice(0, 60), issued_at: f.issued || null, expires_at: f.expires || null, file_path: path, notes: f.notes.trim().slice(0, 1000) };
      if (editing) await save('documents', row); else await create('documents', row);
      toast(editing ? 'Document updated.' : 'Document saved.');
      onClose();
    } catch (x) { console.error(x); toast(x.message || 'Could not save the document.', { bad: true }); }
    setBusy(false);
  }
  return (
    <FormModal onClose={onClose} title={editing ? 'Edit document' : 'Add a document'} submitLabel={editing ? 'Save changes' : 'Save document'} busy={busy} onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">{(id) => <Select id={id} value={f.kind} onChange={set('kind')}>{DOC_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>}</Field>
        <Field label="Vehicle (optional)">{(id) => <Select id={id} value={f.vehicle} onChange={set('vehicle')}><option value="">Not linked</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}</Field>
        <Field label="Title" error={err.title} className="sm:col-span-2">{(id) => <Input id={id} data-autofocus value={f.title} maxLength={100} onChange={set('title')} placeholder="Truck insurance" />}</Field>
        <Field label="Number">{(id) => <Input id={id} value={f.number} maxLength={60} onChange={set('number')} />}</Field>
        <span className="hidden sm:block" />
        <Field label="Issued">{(id) => <Input id={id} type="date" value={f.issued} onChange={set('issued')} />}</Field>
        <Field label="Expires" error={err.expires}>{(id) => <Input id={id} data-autofocus={doc?.id ? true : undefined} type="date" value={f.expires} onChange={set('expires')} />}</Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} value={f.notes} maxLength={1000} onChange={set('notes')} />}</Field>
        <Field label="Photo or PDF of the document" className="sm:col-span-2" hint="Optional. PDFs up to 5 MB.">{(id) => (
          <div className="space-y-2"><input id={id} ref={file} type="file" accept="image/*,application/pdf" onChange={(e) => setPicked(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:file:bg-ink-800" />
            {!picked && doc?.file_path && <FileThumb path={doc.file_path} name={doc.title} />}</div>)}</Field>
      </div>
    </FormModal>
  );
}

const COLS = [
  { key: 'expired', title: 'Expired', icon: ShieldAlert, color: 'var(--bad)', empty: 'Nothing has expired.' },
  { key: 'soon', title: 'Expiring in 30 days', icon: Clock, color: 'var(--warn)', empty: 'Nothing is about to expire.' },
  { key: 'valid', title: 'Valid', icon: ShieldCheck, color: 'var(--good)', empty: 'No valid documents yet.' },
];

function Countdown({ st }) {
  if (st.days == null) return <div className="text-lg font-bold text-ink-500">No expiry date</div>;
  const n = Math.abs(st.days);
  const word = st.key === 'expired' ? `day${n === 1 ? '' : 's'} ago` : st.days === 0 ? 'days left, expires today' : `day${n === 1 ? '' : 's'} left`;
  const col = st.key === 'expired' ? 'var(--bad)' : st.key === 'soon' ? 'var(--warn)' : 'var(--good)';
  return <div className="flex items-baseline gap-2"><span className="text-5xl font-bold leading-none" style={{ color: col }}>{n}</span><span className="text-sm font-bold text-ink-600 dark:text-ink-300">{word}</span></div>;
}

export default function DocumentsTab({ openSignal }) {
  const docs = useRows('documents');
  const vehicles = useRows('vehicles');
  const toast = useToast();
  const [vehicle, setVehicle] = useState('');
  const [form, setForm] = useState(null);
  useEffect(() => { if (openSignal) setForm({}); }, [openSignal]);
  const veh = (id) => vehicles.find((v) => v.id === id);
  const items = docs.filter((d) => !vehicle || d.vehicle_id === vehicle).map((d) => ({ d, st: docStatus(d) }))
    .sort((a, b) => (a.st.days ?? 1e9) - (b.st.days ?? 1e9));
  const col = (key) => items.filter((x) => (key === 'valid' ? x.st.key === 'valid' || x.st.key === 'none' : x.st.key === key));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {vehicles.length > 1 ? <Select aria-label="Filter by vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="!w-auto"><option value="">All vehicles</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select> : <span />}
        <Button icon={Plus} onClick={() => setForm({})}>Add document</Button>
      </div>
      {docs.length === 0 ? (
        <Empty icon={FileBadge} title="Never let a document lapse" text="Add your licence, insurance, registration, fitness and permits with their expiry dates. They line up here by urgency, and a photo is kept with each one." action={<Button icon={Plus} onClick={() => setForm({})}>Add a document</Button>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {COLS.map((c) => {
            const list = col(c.key); const Icon = c.icon;
            return (
              <section key={c.key} aria-label={c.title}>
                <h3 className="mb-3 flex items-center gap-2 border-b-[3px] pb-2 text-sm font-bold uppercase tracking-wide" style={{ borderColor: c.color }}>
                  <Icon size={17} style={{ color: c.color }} />{c.title}<span className="ml-auto rounded-full bg-ink-100 px-2 py-px text-xs dark:bg-ink-800">{list.length}</span>
                </h3>
                {list.length === 0 ? <p className="rounded-md border border-dashed border-ink-300 px-3 py-6 text-center text-sm text-ink-500 dark:border-ink-700">{c.empty}</p> : (
                  <ul className="space-y-3">
                    {list.map(({ d, st }) => (
                      <li key={d.id} className="paper-card p-4">
                        <Countdown st={st} />
                        <div className="mt-3 flex items-start justify-between gap-2">
                          <div className="min-w-0"><div className="text-xs font-bold uppercase tracking-wide text-ink-500">{docKindLabel(d.kind)}</div><h4 className="truncate text-base font-bold">{d.title}</h4></div>
                          <Badge tone={st.tone} icon={st.key === 'expired' ? ShieldAlert : st.key === 'soon' ? Clock : ShieldCheck}>{st.key === 'none' ? 'No expiry' : st.key === 'valid' ? 'Valid' : st.key === 'soon' ? 'Soon' : 'Expired'}</Badge>
                        </div>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                          {d.expires_at && <span>Expires {fmtDate(`${d.expires_at}T12:00:00`, { year: true })}</span>}
                          {d.number && <span>No. {d.number}</span>}
                          {veh(d.vehicle_id) && <span className="flex items-center gap-1.5">{veh(d.vehicle_id).plate ? <Plate className="!text-xs">{veh(d.vehicle_id).plate}</Plate> : veh(d.vehicle_id).name}</span>}
                        </p>
                        {d.notes && <p className="mt-1 text-sm text-ink-500">{d.notes}</p>}
                        {d.file_path && <div className="mt-3"><FileThumb path={d.file_path} name={d.title} /></div>}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Button size="sm" variant={c.key === 'valid' ? 'ghost' : 'soft'} onClick={() => setForm(d)}>{c.key === 'valid' ? 'Edit' : 'Renewed? Update date'}</Button>
                          <IconButton icon={Trash2} label={`Delete ${d.title}`} onClick={() => softDelete(toast, 'documents', d, 'Document deleted')} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      {form && <DocForm key={form.id || 'new'} doc={form.id ? form : null} vehicles={vehicles} onClose={() => setForm(null)} />}
    </div>
  );
}
