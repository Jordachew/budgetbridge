import { useState } from 'react';
import { create, save } from '../../state/data.js';
import { useToast } from '../../components/toast.jsx';
import { Button, Chips, Field, Input, Modal, Select } from '../../components/ui.jsx';
import { fromLocalInput, parseMoney, toLocalInput } from '../../core/format.js';
import { KINDS, kindOf, loadLabel } from './kinds.js';

export default function IncomeForm({ open, row, loads, defaultCur, onClose, onDelete }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  // Reset the form each time it is opened for a different row.
  const key = open ? (row?.id || 'new') : null;
  const [seen, setSeen] = useState(null);
  if (key !== seen) {
    setSeen(key);
    if (open) {
      setErr({});
      setF(row ? { amount: (row.amount_cents / 100).toFixed(2), currency: row.currency, kind: row.kind, load_id: row.load_id || '', note: row.note || '', at: toLocalInput(row.received_at) }
        : { amount: '', currency: defaultCur, kind: 'pay', load_id: '', note: '', at: toLocalInput(new Date()) });
    }
  }
  if (!open || !f) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    const e = {};
    const cents = parseMoney(f.amount);
    if (cents == null || cents <= 0) e.amount = 'Enter an amount greater than zero, like 12500 or 12,500.50.';
    const when = fromLocalInput(f.at);
    if (!when) e.at = 'Pick the date and time you received it.';
    if (f.note.length > 500) e.note = 'Keep the note under 500 characters.';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const data = { amount_cents: cents, currency: f.currency, kind: f.kind, load_id: f.load_id || null, note: f.note.trim(), received_at: when.toISOString() };
      if (row) await save('income', { ...row, ...data }); else await create('income', data);
      toast(row ? 'Income updated' : 'Income added');
      onClose();
    } catch (x) { toast(x.message || 'Could not save. Try again.', { bad: true }); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={row ? 'Edit income' : 'Add income'}
      footer={<>{row && <Button variant="ghost" className="mr-auto text-red-700 dark:text-red-400" onClick={() => onDelete(row)}>Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>{row ? 'Save changes' : 'Add income'}</Button></>}>
      <div className="space-y-4" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); } }}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Amount" error={err.amount} className="col-span-2">{(id) => <Input id={id} className="h-11 text-base sm:h-10 sm:text-sm" inputMode="decimal" placeholder="0.00" value={f.amount} onChange={set('amount')} autoFocus />}</Field>
          <Field label="Currency">{(id) => <Select id={id} className="h-11 sm:h-10" value={f.currency} onChange={set('currency')}><option value="JMD">JMD</option><option value="USD">USD</option></Select>}</Field>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-bold text-ink-700 dark:text-ink-200" id="kind-l">Type</div>
          <div aria-labelledby="kind-l"><Chips value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={KINDS.map((k) => ({ value: k.id, label: k.label }))} /></div>
          <p className="mt-1.5 text-xs text-ink-500">{kindOf(f.kind).hint}</p>
        </div>
        <Field label="Load (optional)">{(id) => (
          <Select id={id} className="h-11 sm:h-10" value={f.load_id} onChange={set('load_id')}>
            <option value="">Not linked to a load</option>
            {loads.map((l) => <option key={l.id} value={l.id}>{loadLabel(l)}</option>)}
          </Select>)}</Field>
        <Field label="Received" error={err.at}>{(id) => <Input id={id} className="h-11 sm:h-10" type="datetime-local" value={f.at} onChange={set('at')} />}</Field>
        <Field label="Note (optional)" error={err.note}>{(id) => <Input id={id} className="h-11 sm:h-10" maxLength={500} value={f.note} onChange={set('note')} placeholder="e.g. Cash from dispatcher" />}</Field>
      </div>
    </Modal>
  );
}
