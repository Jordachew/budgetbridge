import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal, Button, Field, Input, Textarea, Select, IconButton } from '../../components/ui.jsx';
import { create, save } from '../../state/data.js';
import { useCurrency } from '../../lib/hooks.js';
import { parseMoney, fromLocalInput, toLocalInput } from '../../core/format.js';
import { useToast } from '../../components/toast.jsx';

const blankItem = () => ({ name: '', unit: 'pcs', expected: '' });

function initial(load, cur) {
  return {
    reference: load?.reference || '', customer: load?.customer || '', description: load?.description || '',
    weight_kg: load?.weight_kg != null ? String(load.weight_kg) : '',
    pickup_label: load?.pickup_label || '', pickup_at: load?.pickup_at ? toLocalInput(load.pickup_at) : '',
    drop_label: load?.drop_label || '', drop_at: load?.drop_at ? toLocalInput(load.drop_at) : '',
    rate: load ? (load.rate_cents / 100).toFixed(2).replace(/\.00$/, '') : '', currency: load?.currency || cur,
    notes: load?.notes || '',
    items: (load?.items || []).map((i) => ({ name: i.name || '', unit: i.unit || 'pcs', expected: String(i.expected ?? '') })),
  };
}

/** Create or edit a load. `load` undefined = new. */
export default function LoadForm({ open, load, onClose, onSaved }) {
  const cur = useCurrency();
  const toast = useToast();
  const [f, setF] = useState(() => initial(load, cur));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setItem = (i, k, v) => setF((s) => ({ ...s, items: s.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));

  async function submit() {
    const e = {};
    const ref = f.reference.trim();
    if (!ref && !f.customer.trim()) e.reference = 'Add a reference number or a customer name so you can find this load later.';
    let rate = 0;
    if (f.rate.trim()) { rate = parseMoney(f.rate); if (rate == null) e.rate = 'Type the rate as a number, like 85000 or 85,000.50.'; }
    let weight = null;
    if (f.weight_kg.trim()) {
      weight = Number(f.weight_kg.replace(/,/g, ''));
      if (!Number.isFinite(weight) || weight < 0 || weight > 1000000) e.weight_kg = 'Weight must be a number of kilograms, like 2400.';
    }
    const pAt = fromLocalInput(f.pickup_at); const dAt = fromLocalInput(f.drop_at);
    if (pAt && dAt && dAt < pAt) e.drop_at = 'The drop-off time is before the pickup time. Check the dates.';
    const items = [];
    f.items.forEach((it, i) => {
      if (!it.name.trim() && !String(it.expected).trim()) return;
      const n = Number(String(it.expected).replace(/,/g, ''));
      if (!it.name.trim()) e[`item${i}`] = 'Give this item a name.';
      else if (!Number.isFinite(n) || n < 0) e[`item${i}`] = 'Expected quantity must be a number.';
      else items.push({ name: it.name.trim().slice(0, 80), unit: it.unit.trim().slice(0, 12) || 'pcs', expected: n });
    });
    if (f.items.length > 100) e.items = 'That is too many items (100 maximum).';
    setErrors(e);
    if (Object.keys(e).length) return;
    const fields = {
      reference: ref, customer: f.customer.trim(), description: f.description.trim(), weight_kg: weight,
      pickup_label: f.pickup_label.trim(), pickup_at: pAt ? pAt.toISOString() : null,
      drop_label: f.drop_label.trim(), drop_at: dAt ? dAt.toISOString() : null,
      rate_cents: rate, currency: f.currency, items, notes: f.notes.trim(),
    };
    setBusy(true);
    try {
      const row = load ? await save('loads', { ...load, ...fields }) : await create('loads', { ...fields, status: 'booked' });
      toast?.(load ? 'Load updated' : 'Load added');
      onSaved?.(row);
      onClose();
    } catch (err) {
      setErrors({ form: err.message || 'Could not save this load. Try again.' });
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={load ? 'Edit load' : 'New load'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{load ? 'Save changes' : 'Add load'}</Button></>}>
      <div className="space-y-4">
        {errors.form && <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">{errors.form}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference" error={errors.reference}>{(id) => <Input id={id} maxLength={60} value={f.reference} onChange={(e) => set('reference', e.target.value)} placeholder="e.g. PO-4471" />}</Field>
          <Field label="Customer">{(id) => <Input id={id} maxLength={100} value={f.customer} onChange={(e) => set('customer', e.target.value)} placeholder="Who is it for?" />}</Field>
        </div>
        <Field label="What are you carrying?">{(id) => <Input id={id} maxLength={500} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. 20 pallets of bottled water" />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Field label="Pickup place">{(id) => <Input id={id} maxLength={200} value={f.pickup_label} onChange={(e) => set('pickup_label', e.target.value)} placeholder="e.g. Kingston Wharf" />}</Field>
            <Field label="Pickup time">{(id) => <Input id={id} type="datetime-local" value={f.pickup_at} onChange={(e) => set('pickup_at', e.target.value)} />}</Field>
          </div>
          <div className="space-y-3">
            <Field label="Drop-off place">{(id) => <Input id={id} maxLength={200} value={f.drop_label} onChange={(e) => set('drop_label', e.target.value)} placeholder="e.g. Montego Bay depot" />}</Field>
            <Field label="Drop-off time" error={errors.drop_at}>{(id) => <Input id={id} type="datetime-local" value={f.drop_at} onChange={(e) => set('drop_at', e.target.value)} />}</Field>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rate" error={errors.rate} className="sm:col-span-1">{(id) => <Input id={id} inputMode="decimal" value={f.rate} onChange={(e) => set('rate', e.target.value)} placeholder="0" />}</Field>
          <Field label="Currency">{(id) => <Select id={id} value={f.currency} onChange={(e) => set('currency', e.target.value)}><option value="JMD">JMD (J$)</option><option value="USD">USD (US$)</option></Select>}</Field>
          <Field label="Weight (kg)" error={errors.weight_kg}>{(id) => <Input id={id} inputMode="decimal" value={f.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} placeholder="optional" />}</Field>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-700 dark:text-ink-200">Items to deliver</span>
            <Button size="sm" variant="soft" icon={Plus} onClick={() => set('items', [...f.items, blankItem()])}>Add item</Button>
          </div>
          {f.items.length === 0 && <p className="text-xs text-ink-500">Optional. List what you are carrying and how many, so you can count it off at drop-off.</p>}
          <div className="space-y-2">
            {f.items.map((it, i) => (
              <div key={i}>
                <div className="grid grid-cols-[1fr_4.5rem_5.5rem_2.25rem] items-center gap-2">
                  <Input aria-label={`Item ${i + 1} name`} value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} placeholder="Item" />
                  <Input aria-label={`Item ${i + 1} unit`} value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} placeholder="unit" />
                  <Input aria-label={`Item ${i + 1} expected quantity`} inputMode="decimal" value={it.expected} onChange={(e) => setItem(i, 'expected', e.target.value)} placeholder="Qty" />
                  <IconButton icon={Trash2} label={`Remove item ${i + 1}`} onClick={() => set('items', f.items.filter((_, j) => j !== i))} />
                </div>
                {errors[`item${i}`] && <p className="mt-1 text-xs font-medium text-red-600">{errors[`item${i}`]}</p>}
              </div>
            ))}
          </div>
        </div>
        <Field label="Notes">{(id) => <Textarea id={id} maxLength={1000} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Gate codes, contact person, anything to remember" />}</Field>
      </div>
    </Modal>
  );
}
