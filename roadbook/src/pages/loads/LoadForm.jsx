import { useMemo, useState } from 'react';
import { Plus, Trash2, ChevronDown, Sparkles } from 'lucide-react';
import { Button, Field, Input, Textarea, IconButton, cx } from '../../components/ui.jsx';
import { create, save, useRows } from '../../state/data.js';
import { useCurrency } from '../../lib/hooks.js';
import { parseMoney, fromLocalInput, toLocalInput } from '../../core/format.js';
import { useToast } from '../../components/toast.jsx';
import Sheet from './Sheet.jsx';
import { relDay } from './shared.js';

const blankItem = () => ({ name: '', unit: 'pcs', expected: '' });
const nextHour = () => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return toLocalInput(d); };

function initial(load, cur) {
  return {
    reference: load?.reference || '', customer: load?.customer || '', description: load?.description || '',
    weight_kg: load?.weight_kg != null ? String(load.weight_kg) : '',
    pickup_label: load?.pickup_label || '', pickup_at: load ? (load.pickup_at ? toLocalInput(load.pickup_at) : '') : nextHour(),
    drop_label: load?.drop_label || '', drop_at: load?.drop_at ? toLocalInput(load.drop_at) : '',
    rate: load ? (load.rate_cents / 100).toFixed(2).replace(/\.00$/, '') : '', currency: load?.currency || cur,
    notes: load?.notes || '',
    items: (load?.items || []).map((i) => ({ name: i.name || '', unit: i.unit || 'pcs', expected: String(i.expected ?? '') })),
  };
}
const uniq = (list) => { const seen = new Set(); return list.filter((x) => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };

/** Create or edit a load. `load` undefined = new. */
export default function LoadForm({ load, onClose, onSaved }) {
  const cur = useCurrency();
  const toast = useToast();
  const loads = useRows('loads');
  const invoices = useRows('invoices');
  const places = useRows('places');
  const [f, setF] = useState(() => initial(load, cur));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(() => !!load && !!(load.description || load.notes || load.weight_kg != null || load.drop_at || (load.items || []).length));
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setItem = (i, k, v) => setF((s) => ({ ...s, items: s.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));

  const recent = useMemo(() => [...loads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [loads]);
  const customers = useMemo(() => uniq([...recent.map((l) => l.customer), ...invoices.map((i) => i.customer)]).slice(0, 30), [recent, invoices]);
  const placeNames = useMemo(() => uniq([...recent.flatMap((l) => [l.pickup_label, l.drop_label]), ...places.map((p) => p.name)]).slice(0, 40), [recent, places]);
  const suggestedRef = useMemo(() => {
    const m = /^(.*?)(\d+)$/.exec(recent.find((l) => l.reference)?.reference || '');
    return m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}` : '';
  }, [recent]);
  // a customer you have hauled for before: offer their last rate and route
  const known = useMemo(() => (load || !f.customer.trim() ? null : recent.find((l) => l.customer.toLowerCase() === f.customer.trim().toLowerCase())), [recent, f.customer, load]);

  async function submit() {
    const e = {};
    const ref = f.reference.trim();
    if (!ref && !f.customer.trim()) e.reference = 'Add a reference number or a customer name so you can find this load later.';
    let rate = 0;
    if (f.rate.trim()) { rate = parseMoney(f.rate); if (rate == null) e.rate = 'Type the rate as a number, like 85000 or 85,000.50.'; }
    let weight = null;
    if (f.weight_kg.trim()) {
      weight = Number(f.weight_kg.replace(/,/g, ''));
      if (!Number.isFinite(weight) || weight < 0 || weight > 1000000) { e.weight_kg = 'Weight must be a number of kilograms, like 2400.'; }
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
    if (Object.keys(e).length) { if (e.weight_kg || e.drop_at || e.items || Object.keys(e).some((k) => k.startsWith('item'))) setMore(true); return; }
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

  const pickupWords = f.pickup_at ? relDay(fromLocalInput(f.pickup_at)?.toISOString()) : 'no pickup time';
  return (
    <Sheet title={load ? 'Edit load' : 'New load'} eyebrow={load ? load.reference || 'Load' : 'Waybill'} onClose={onClose} onSubmit={submit} wide
      footer={<>
        <Button variant="ghost" size="lg" onClick={onClose}>Cancel</Button>
        <Button type="submit" size="lg" loading={busy} className="!h-14 flex-1 !text-base">{load ? 'Save changes' : 'Add load'}</Button>
      </>}>
      <datalist id="lf-customers">{customers.map((c) => <option key={c} value={c} />)}</datalist>
      <datalist id="lf-places">{placeNames.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="space-y-5">
        {errors.form && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-bold text-red-700 dark:bg-red-950 dark:text-red-300">{errors.form}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference" error={errors.reference}>{(id) => (
            <>
              <Input id={id} autoFocus={!load} maxLength={60} className="!h-12 !text-base font-bold uppercase tracking-wider" value={f.reference} onChange={(e) => set('reference', e.target.value)} placeholder={suggestedRef || 'e.g. PO-4471'} autoCapitalize="characters" />
              {suggestedRef && !f.reference && <button type="button" className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300" onClick={() => set('reference', suggestedRef)}><Sparkles size={12} />Use {suggestedRef}</button>}
            </>)}</Field>
          <Field label="Customer">{(id) => (
            <>
              <Input id={id} list="lf-customers" maxLength={100} className="!h-12 !text-base" value={f.customer} onChange={(e) => set('customer', e.target.value)} placeholder="Who is it for?" autoComplete="off" />
              {known && (known.pickup_label || known.drop_label || known.rate_cents > 0) && !f.pickup_label && !f.drop_label && !f.rate && (
                <button type="button" className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-left text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                  onClick={() => setF((s) => ({ ...s, pickup_label: known.pickup_label, drop_label: known.drop_label, rate: known.rate_cents ? (known.rate_cents / 100).toFixed(2).replace(/\.00$/, '') : '', currency: known.currency }))}>
                  <Sparkles size={12} className="shrink-0" /><span className="truncate">Repeat last job for them</span>
                </button>
              )}
            </>)}</Field>
        </div>

        <fieldset className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-4">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-500">Route</legend>
          <div className="relative space-y-3 pl-7">
            <span aria-hidden="true" className="absolute bottom-6 left-[7px] top-8 border-l-[3px] border-dotted border-ink-300 dark:border-ink-600" />
            <span aria-hidden="true" className="absolute left-0 top-9 h-4 w-4 rounded-full border-[3px] border-ink-800 bg-[var(--surface)] dark:border-ink-200" />
            <span aria-hidden="true" className="absolute bottom-3 left-0 h-4 w-4 rounded-full bg-brand-500 ring-4 ring-brand-500/25" />
            <Field label="Pick up from">{(id) => <Input id={id} list="lf-places" maxLength={200} className="!h-12 !text-base" value={f.pickup_label} onChange={(e) => set('pickup_label', e.target.value)} placeholder="e.g. Kingston Wharf" autoComplete="off" />}</Field>
            <Field label="Deliver to">{(id) => <Input id={id} list="lf-places" maxLength={200} className="!h-12 !text-base" value={f.drop_label} onChange={(e) => set('drop_label', e.target.value)} placeholder="e.g. Montego Bay depot" autoComplete="off" />}</Field>
          </div>
        </fieldset>

        <div>
          <label htmlFor="lf-rate" className="mb-1.5 block text-sm font-bold text-ink-700 dark:text-ink-200">Rate</label>
          <div className="flex gap-2">
            <Input id="lf-rate" inputMode="decimal" autoComplete="off" className="!h-14 min-w-0 flex-1 !text-2xl font-bold tabular-nums" value={f.rate} onChange={(e) => set('rate', e.target.value)} placeholder="0" />
            <div role="group" aria-label="Currency" className="flex shrink-0 rounded-md bg-ink-100 p-1 dark:bg-ink-800">
              {['JMD', 'USD'].map((c) => <button key={c} type="button" aria-pressed={f.currency === c} onClick={() => set('currency', c)} className={cx('w-14 rounded text-sm font-bold', f.currency === c ? 'bg-[var(--surface)] shadow-sm ring-1 ring-ink-200 dark:bg-ink-700 dark:ring-ink-600' : 'text-ink-500')}>{c}</button>)}
            </div>
          </div>
          {errors.rate ? <p className="mt-1 text-xs font-medium text-red-600">{errors.rate}</p> : <p className="mt-1 text-xs text-ink-500">What the customer agreed to pay. You can change it later.</p>}
        </div>

        <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]">
          <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left">
            <span><span className="block text-sm font-bold">More details</span><span className="block text-xs text-ink-500">Pickup {pickupWords}. Items, weight, notes.</span></span>
            <ChevronDown size={20} className={cx('shrink-0 text-ink-500 transition-transform', more && 'rotate-180')} />
          </button>
          {more && (
            <div className="space-y-4 border-t border-[var(--hairline)] p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pickup time">{(id) => <Input id={id} type="datetime-local" className="!h-12" value={f.pickup_at} onChange={(e) => set('pickup_at', e.target.value)} />}</Field>
                <Field label="Drop-off time" error={errors.drop_at}>{(id) => <Input id={id} type="datetime-local" className="!h-12" value={f.drop_at} onChange={(e) => set('drop_at', e.target.value)} />}</Field>
              </div>
              <Field label="What are you carrying?">{(id) => <Input id={id} maxLength={500} className="!h-12" value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. 20 pallets of bottled water" />}</Field>
              <Field label="Weight (kg)" error={errors.weight_kg}>{(id) => <Input id={id} inputMode="decimal" className="!h-12" value={f.weight_kg} onChange={(e) => set('weight_kg', e.target.value)} placeholder="optional" />}</Field>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-bold text-ink-700 dark:text-ink-200">Items to count at drop-off</span>
                  <Button size="sm" variant="soft" icon={Plus} onClick={() => set('items', [...f.items, blankItem()])}>Add item</Button>
                </div>
                {f.items.length === 0 && <p className="text-xs text-ink-500">Optional. List what you carry and how many, then count it off with the receiver.</p>}
                {errors.items && <p className="text-xs font-medium text-red-600">{errors.items}</p>}
                <div className="space-y-2">
                  {f.items.map((it, i) => (
                    <div key={i}>
                      <div className="grid grid-cols-[1fr_4.25rem_5rem_2.5rem] items-center gap-2">
                        <Input aria-label={`Item ${i + 1} name`} className="!h-11" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} placeholder="Item" />
                        <Input aria-label={`Item ${i + 1} unit`} className="!h-11" value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} placeholder="unit" />
                        <Input aria-label={`Item ${i + 1} expected quantity`} className="!h-11" inputMode="decimal" value={it.expected} onChange={(e) => setItem(i, 'expected', e.target.value)} placeholder="Qty" />
                        <IconButton icon={Trash2} label={`Remove item ${i + 1}`} className="!h-10 !w-10" onClick={() => set('items', f.items.filter((_, j) => j !== i))} />
                      </div>
                      {errors[`item${i}`] && <p className="mt-1 text-xs font-medium text-red-600">{errors[`item${i}`]}</p>}
                    </div>
                  ))}
                </div>
              </div>
              <Field label="Notes">{(id) => <Textarea id={id} maxLength={1000} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Gate codes, contact person, anything to remember" />}</Field>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
