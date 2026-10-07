import { useRef, useState } from 'react';
import { Plus, Pencil, Trash2, FileBadge } from 'lucide-react';
import { Card, Button, Empty, IconButton, Badge, Select, Modal, Field, Input, Textarea, useConfirm } from '../../components/ui.jsx';
import { useRows, remove, create, save } from '../../state/data.js';
import { fmtDate } from '../../core/format.js';
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
    <Modal open onClose={onClose} title={editing ? 'Edit document' : 'Add a document'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{editing ? 'Save changes' : 'Save document'}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">{(id) => <Select id={id} value={f.kind} onChange={set('kind')}>{DOC_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>}</Field>
        <Field label="Vehicle (optional)">{(id) => <Select id={id} value={f.vehicle} onChange={set('vehicle')}><option value="">Not linked</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}</Field>
        <Field label="Title" error={err.title} className="sm:col-span-2">{(id) => <Input id={id} value={f.title} maxLength={100} onChange={set('title')} />}</Field>
        <Field label="Number">{(id) => <Input id={id} value={f.number} maxLength={60} onChange={set('number')} />}</Field>
        <span className="hidden sm:block" />
        <Field label="Issued">{(id) => <Input id={id} type="date" value={f.issued} onChange={set('issued')} />}</Field>
        <Field label="Expires" error={err.expires}>{(id) => <Input id={id} type="date" value={f.expires} onChange={set('expires')} />}</Field>
        <Field label="Notes" className="sm:col-span-2">{(id) => <Textarea id={id} value={f.notes} maxLength={1000} onChange={set('notes')} />}</Field>
        <Field label="Photo or PDF of the document" className="sm:col-span-2" hint="Optional. PDFs up to 5 MB.">{(id) => (
          <div className="space-y-2"><input id={id} ref={file} type="file" accept="image/*,application/pdf" onChange={(e) => setPicked(e.target.files?.[0] || null)} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:file:bg-ink-800" />
            {!picked && doc?.file_path && <FileThumb path={doc.file_path} name={doc.title} />}</div>)}</Field>
      </div>
    </Modal>
  );
}

export default function DocumentsTab() {
  const docs = useRows('documents');
  const vehicles = useRows('vehicles');
  const toast = useToast();
  const [confirm, node] = useConfirm();
  const [vehicle, setVehicle] = useState('');
  const [form, setForm] = useState(null);
  const vName = (id) => vehicles.find((v) => v.id === id)?.name;
  const rank = { expired: 0, soon: 1, valid: 2, none: 3 };
  const list = docs.filter((d) => !vehicle || d.vehicle_id === vehicle).map((d) => ({ d, st: docStatus(d) })).sort((a, b) => rank[a.st.key] - rank[b.st.key] || (a.st.days ?? 1e9) - (b.st.days ?? 1e9));

  async function del(d) {
    if (!(await confirm({ title: 'Delete this document?', text: d.title, danger: true, confirmLabel: 'Delete document' }))) return;
    await remove('documents', d.id); toast('Document deleted.');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {vehicles.length > 0 ? <Select aria-label="Filter by vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="!w-auto"><option value="">All vehicles</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select> : <span />}
        <Button icon={Plus} onClick={() => setForm({})}>Add document</Button>
      </div>
      {list.length === 0 ? (
        <Empty icon={FileBadge} title="No documents yet" text="Keep your licence, insurance, registration and permits here with their expiry dates, so nothing lapses." action={<Button icon={Plus} onClick={() => setForm({})}>Add a document</Button>} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map(({ d, st }) => (
            <li key={d.id}>
              <Card className="flex h-full flex-col !p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="text-xs font-medium uppercase tracking-wide text-ink-500">{docKindLabel(d.kind)}</div><h3 className="truncate font-semibold">{d.title}</h3></div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-500">{[d.number && `No. ${d.number}`, vName(d.vehicle_id), d.expires_at && `Expires ${fmtDate(`${d.expires_at}T12:00:00`, { year: true })}`].filter(Boolean).join(' - ')}</p>
                {d.notes && <p className="mt-1 text-sm text-ink-500">{d.notes}</p>}
                {d.file_path && <div className="mt-3"><FileThumb path={d.file_path} name={d.title} /></div>}
                <div className="mt-auto flex justify-end pt-3"><IconButton icon={Pencil} label={`Edit ${d.title}`} onClick={() => setForm(d)} /><IconButton icon={Trash2} label={`Delete ${d.title}`} onClick={() => del(d)} /></div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {form && <DocForm key={form.id || 'new'} doc={form.id ? form : null} vehicles={vehicles} onClose={() => setForm(null)} />}
      {node}
    </div>
  );
}
