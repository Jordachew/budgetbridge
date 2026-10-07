import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Field, Input, Textarea, Select, Modal, IconButton, Banner } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { create, save } from '../../state/data.js';
import { fmtMoney, parseMoney } from '../../core/format.js';
import { invoiceTotals, addDaysStr, todayStr } from './totals.js';

const centsText = (c) => (c ? (c % 100 ? (c / 100).toFixed(2) : String(c / 100)) : '');
const blankItem = () => ({ description: '', qty: '1', price: '' });

function toForm(src) {
  return {
    number: src.number || '', customer: src.customer || '', customer_email: src.customer_email || '', customer_address: src.customer_address || '',
    issue_date: src.issue_date || todayStr(), due_date: src.due_date || '',
    items: (src.items?.length ? src.items : [{ description: '', qty: 1, unit_cents: 0 }]).map((i) => ({ description: i.description || '', qty: String(i.qty ?? 1), price: centsText(i.unit_cents) })),
    discount: centsText(src.discount_cents), tax_pct: src.tax_pct ? String(src.tax_pct) : '', notes: src.notes || '', currency: src.currency || 'JMD',
  };
}

/** Turns what was typed into numbers. Items without any text are ignored. */
function parseForm(f) {
  const items = f.items.filter((i) => i.description.trim() || i.price.trim()).map((i) => ({
    description: i.description.trim().slice(0, 200), qty: Number(i.qty), unit_cents: i.price.trim() === '' ? 0 : parseMoney(i.price), _raw: i,
  }));
  return { items, discount_cents: f.discount.trim() === '' ? 0 : parseMoney(f.discount), tax_pct: f.tax_pct.trim() === '' ? 0 : Number(f.tax_pct) };
}

export default function InvoiceEditor({ open, invoice, initial, existing, onClose, onSaved }) {
  const toast = useToast();
  const src = invoice || initial || {};
  const [f, setF] = useState(() => toForm(src));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setF((p) => ({ ...p, items: p.items.map((it, n) => (n === i ? { ...it, [k]: v } : it)) }));

  const parsed = useMemo(() => parseForm(f), [f]);
  const t = invoiceTotals({ items: parsed.items.map((i) => ({ ...i, unit_cents: i.unit_cents || 0, qty: Number.isFinite(i.qty) ? i.qty : 0 })), discount_cents: parsed.discount_cents || 0, tax_pct: parsed.tax_pct, paid_cents: invoice?.paid_cents });
  const money = (c) => fmtMoney(c, f.currency);

  async function submit() {
    const e = {};
    if (!f.number.trim()) e.number = 'Give the invoice a number.';
    else if (existing.some((x) => x.number === f.number.trim() && x.id !== invoice?.id)) e.number = 'Another invoice already uses this number.';
    if (!f.customer.trim()) e.customer = 'Who is this invoice for?';
    if (!f.issue_date) e.issue_date = 'Choose the issue date.';
    if (f.due_date && f.due_date < f.issue_date) e.due_date = 'The due date cannot be before the issue date.';
    if (!parsed.items.length) e.items = 'Add at least one line, for example "Freight Kingston to Montego Bay".';
    else if (parsed.items.some((i) => !i.description)) e.items = 'Every line needs a description.';
    else if (parsed.items.some((i) => i.unit_cents == null)) e.items = 'One of the prices is not a valid amount. Use numbers like 12500 or 12,500.50.';
    else if (parsed.items.some((i) => !(i.qty > 0) || i.qty > 100000)) e.items = 'Each quantity must be a number above zero.';
    else if (parsed.items.length > 100) e.items = 'An invoice can have up to 100 lines.';
    if (parsed.discount_cents == null) e.discount = 'Enter the discount as an amount, or leave it empty.';
    else if (parsed.discount_cents > t.subtotal) e.discount = 'The discount cannot be bigger than the subtotal.';
    if (!Number.isFinite(parsed.tax_pct) || parsed.tax_pct < 0 || parsed.tax_pct > 100) e.tax_pct = 'Tax must be between 0 and 100 percent.';
    if (f.customer_email && !/^\S+@\S+\.\S+$/.test(f.customer_email.trim())) e.customer_email = 'That email address does not look right.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const fields = {
        number: f.number.trim().slice(0, 30), customer: f.customer.trim().slice(0, 100), customer_email: f.customer_email.trim().slice(0, 120),
        customer_address: f.customer_address.trim().slice(0, 300), issue_date: f.issue_date, due_date: f.due_date || null,
        items: parsed.items.map(({ description, qty, unit_cents }) => ({ description, qty, unit_cents })),
        tax_pct: Math.round(parsed.tax_pct * 100) / 100, discount_cents: parsed.discount_cents, currency: f.currency, notes: f.notes.trim().slice(0, 1000),
      };
      const row = invoice ? await save('invoices', { ...invoice, ...fields }) : await create('invoices', { ...fields, load_id: src.load_id || null, status: 'draft', paid_cents: 0, paid_at: null });
      toast(invoice ? 'Invoice saved.' : `Invoice ${row.number} created.`);
      onSaved(row);
    } catch (err) { console.error(err); toast('Could not save the invoice. Try again.', { bad: true }); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={invoice ? `Edit ${invoice.number}` : 'New invoice'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>{invoice ? 'Save changes' : 'Create invoice'}</Button></>}>
      <div className="space-y-4">
        {Object.keys(errors).length > 0 && <Banner tone="red">Please fix the highlighted fields below.</Banner>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" error={errors.customer}>{(id) => <Input id={id} value={f.customer} maxLength={100} onChange={(e) => set('customer', e.target.value)} placeholder="Company or person" />}</Field>
          <Field label="Invoice number" error={errors.number}>{(id) => <Input id={id} value={f.number} maxLength={30} onChange={(e) => set('number', e.target.value)} />}</Field>
          <Field label="Customer email (optional)" error={errors.customer_email}>{(id) => <Input id={id} type="email" inputMode="email" value={f.customer_email} maxLength={120} onChange={(e) => set('customer_email', e.target.value)} />}</Field>
          <Field label="Currency">{(id) => <Select id={id} value={f.currency} onChange={(e) => set('currency', e.target.value)}><option value="JMD">Jamaican dollars (J$)</option><option value="USD">US dollars (US$)</option></Select>}</Field>
        </div>
        <Field label="Customer address (optional)">{(id) => <Textarea id={id} rows={2} value={f.customer_address} maxLength={300} onChange={(e) => set('customer_address', e.target.value)} />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Issue date" error={errors.issue_date}>{(id) => <Input id={id} type="date" value={f.issue_date} onChange={(e) => set('issue_date', e.target.value)} />}</Field>
          <Field label="Due date" error={errors.due_date}>
            {(id) => <>
              <Input id={id} type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} />
              <div className="mt-2 flex gap-2">{[7, 14, 30].map((n) => <button key={n} type="button" onClick={() => set('due_date', addDaysStr(f.issue_date || todayStr(), n))} className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200">Net {n}</button>)}</div>
            </>}
          </Field>
        </div>

        <div>
          <div className="mb-1.5 text-sm font-medium text-ink-700 dark:text-ink-200">Line items</div>
          <div className="space-y-3">
            {f.items.map((it, i) => (
              <div key={i} className="rounded-xl bg-ink-50 p-3 ring-1 ring-ink-200/70 dark:bg-ink-800/50 dark:ring-ink-800">
                <div className="grid grid-cols-[1fr_auto] items-start gap-2">
                  <Input aria-label={`Line ${i + 1} description`} value={it.description} maxLength={200} placeholder="Description" onChange={(e) => setItem(i, 'description', e.target.value)} />
                  <IconButton icon={Trash2} label={`Remove line ${i + 1}`} disabled={f.items.length === 1} onClick={() => setF((p) => ({ ...p, items: p.items.filter((_, n) => n !== i) }))} />
                </div>
                <div className="mt-2 grid grid-cols-[5rem_1fr_auto] items-center gap-2">
                  <Input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                  <Input aria-label={`Line ${i + 1} unit price`} inputMode="decimal" value={it.price} placeholder="Unit price" onChange={(e) => setItem(i, 'price', e.target.value)} />
                  <span className="min-w-[5.5rem] text-right text-sm font-semibold tabular-nums">{money(Math.round((Number(it.qty) || 0) * (parseMoney(it.price) || 0)))}</span>
                </div>
              </div>
            ))}
          </div>
          {errors.items && <p className="mt-1 text-xs font-medium text-red-600">{errors.items}</p>}
          <Button variant="soft" size="sm" icon={Plus} className="mt-3" onClick={() => setF((p) => ({ ...p, items: [...p.items, blankItem()] }))}>Add line</Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discount (amount, optional)" error={errors.discount}>{(id) => <Input id={id} inputMode="decimal" value={f.discount} onChange={(e) => set('discount', e.target.value)} />}</Field>
          <Field label="Tax (percent, optional)" error={errors.tax_pct} hint="Charged on the amount after the discount.">{(id) => <Input id={id} inputMode="decimal" value={f.tax_pct} onChange={(e) => set('tax_pct', e.target.value)} placeholder="e.g. 15" />}</Field>
        </div>

        <dl className="ml-auto max-w-xs space-y-1 text-sm tabular-nums">
          <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd>{money(t.subtotal)}</dd></div>
          {t.discount > 0 && <div className="flex justify-between"><dt className="text-ink-500">Discount</dt><dd>-{money(t.discount)}</dd></div>}
          {t.tax > 0 && <div className="flex justify-between"><dt className="text-ink-500">Tax ({parsed.tax_pct}%)</dt><dd>{money(t.tax)}</dd></div>}
          <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold dark:border-ink-700"><dt>Total</dt><dd>{money(t.total)}</dd></div>
        </dl>

        <Field label="Notes and payment details (optional)" hint="Shown on the invoice, for example bank account or how to pay.">{(id) => <Textarea id={id} rows={3} value={f.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}
