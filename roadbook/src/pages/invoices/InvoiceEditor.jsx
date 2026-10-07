import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Repeat, Trash2, TriangleAlert } from 'lucide-react';
import { Banner, Button, Field, IconButton, Input, PageHeader, Plate, Segmented, Textarea, cx, useConfirm } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { create, save, useRows } from '../../state/data.js';
import { fmtMoney, parseMoney } from '../../core/format.js';
import { addDaysStr, invoiceTotals, todayStr } from './totals.js';
import { customerBook, daysBetween, dueWords, fmtDay, TONE_CLASS } from './helpers.js';
import Stepper from './Stepper.jsx';

const centsText = (c) => (c ? (c % 100 ? (c / 100).toFixed(2) : String(c / 100)) : '');
let keySeq = 0;
const blankItem = () => ({ _k: ++keySeq, description: '', qty: '1', price: '' });
const TERMS = [{ n: 0, label: 'On receipt' }, { n: 7, label: 'Net 7' }, { n: 14, label: 'Net 14' }, { n: 30, label: 'Net 30' }];

function toForm(src, isNew) {
  const issue = src.issue_date || todayStr();
  return {
    number: src.number || '', customer: src.customer || '', customer_email: src.customer_email || '', customer_address: src.customer_address || '',
    issue_date: issue, due_date: src.due_date || (isNew ? addDaysStr(issue, 14) : ''),
    items: (src.items?.length ? src.items : [{ description: '', qty: 1, unit_cents: 0 }]).map((i) => ({ _k: ++keySeq, description: i.description || '', qty: String(i.qty ?? 1), price: centsText(i.unit_cents) })),
    discount: centsText(src.discount_cents), tax_pct: src.tax_pct ? String(src.tax_pct) : '', notes: src.notes || '', currency: src.currency || 'JMD',
  };
}
const formItems = (items) => items.map((i) => ({ _k: ++keySeq, description: i.description || '', qty: String(i.qty ?? 1), price: centsText(i.unit_cents) }));

const strip = (x) => JSON.stringify({ ...x, items: x.items.map(({ _k, ...r }) => r) });

/** Turns what was typed into numbers. Items without any text are ignored. */
function parseForm(f) {
  const items = f.items.filter((i) => i.description.trim() || i.price.trim()).map((i) => ({
    description: i.description.trim().slice(0, 200), qty: Number(i.qty), unit_cents: i.price.trim() === '' ? 0 : parseMoney(i.price),
  }));
  return { items, discount_cents: f.discount.trim() === '' ? 0 : parseMoney(f.discount), tax_pct: f.tax_pct.trim() === '' ? 0 : Number(f.tax_pct) };
}

const SectionHead = ({ n, title, hint }) => (
  <div className="mb-4 flex items-baseline gap-3">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] bg-ink-900 text-xs font-bold text-white dark:bg-brand-500 dark:text-ink-950" aria-hidden>{n}</span>
    <h2 className="font-display text-2xl font-semibold leading-none">{title}</h2>
    {hint && <span className="hidden text-xs text-ink-500 sm:inline">{hint}</span>}
  </div>
);

export default function InvoiceEditor({ invoice, initial, existing, onClose, onSaved }) {
  const toast = useToast();
  const loads = useRows('loads');
  const [confirm, confirmNode] = useConfirm();
  const src = invoice || initial || {};
  const isNew = !invoice;
  const [f, setF] = useState(() => toForm(src, isNew));
  const base = useRef(null);
  if (base.current === null) base.current = strip(f);
  const [errors, setErrors] = useState({});
  const [errTick, setErrTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAdj, setShowAdj] = useState(() => !!(src.discount_cents || src.tax_pct));
  const [focusReq, setFocusReq] = useState(null);
  const formRef = useRef(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setF((p) => ({ ...p, items: p.items.map((it, n) => (n === i ? { ...it, [k]: v } : it)) }));

  const book = useMemo(() => customerBook(existing, loads), [existing, loads]);
  const match = book.find((c) => c.name.toLowerCase() === f.customer.trim().toLowerCase());
  const last = match?.invoices.find((i) => i.id !== invoice?.id);
  const priceBook = useMemo(() => {
    const m = new Map();
    for (const inv of [...existing].sort((a, b) => (a.issue_date || '').localeCompare(b.issue_date || ''))) for (const it of inv.items || []) if (it.description) m.set(it.description.toLowerCase(), it);
    return m;
  }, [existing]);
  const descOptions = useMemo(() => [...priceBook.values()].map((i) => i.description).slice(-40), [priceBook]);

  const parsed = useMemo(() => parseForm(f), [f]);
  const t = invoiceTotals({ items: parsed.items.map((i) => ({ ...i, unit_cents: i.unit_cents || 0, qty: Number.isFinite(i.qty) ? i.qty : 0 })), discount_cents: parsed.discount_cents || 0, tax_pct: parsed.tax_pct || 0, paid_cents: invoice?.paid_cents });
  const money = (c) => fmtMoney(c, f.currency);
  const dirty = strip(f) !== base.current;

  const requestClose = async () => {
    if (!dirty || await confirm({ title: 'Discard your changes?', text: 'What you typed on this invoice has not been saved.', confirmLabel: 'Discard', danger: true })) onClose();
  };
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) requestClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  useEffect(() => { document.querySelector('[data-first]')?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!focusReq) return;
    formRef.current?.querySelector(`[data-row="${focusReq.row}"][data-f="${focusReq.field}"]`)?.focus();
    setFocusReq(null);
  }, [focusReq]);
  useEffect(() => { if (errTick) { const el = formRef.current?.querySelector('[aria-invalid="true"]'); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); el?.focus({ preventScroll: true }); } }, [errTick]);

  const onCustomer = (v) => setF((p) => {
    const m = book.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
    const next = { ...p, customer: v };
    if (m) { if (!p.customer_email.trim() && m.email) next.customer_email = m.email; if (!p.customer_address.trim() && m.address) next.customer_address = m.address; }
    return next;
  });
  const repeatLast = () => {
    if (!last) return;
    const before = f;
    const days = last.due_date && last.issue_date ? daysBetween(last.issue_date, last.due_date) : 14;
    setF((p) => ({ ...p, items: formItems(last.items?.length ? last.items : [{ description: '', qty: 1, unit_cents: 0 }]), tax_pct: last.tax_pct ? String(last.tax_pct) : '', discount: centsText(last.discount_cents), notes: last.notes || p.notes, currency: last.currency || p.currency, due_date: addDaysStr(p.issue_date || todayStr(), days) }));
    if (last.tax_pct || last.discount_cents) setShowAdj(true);
    toast(`Copied the lines from ${last.number}.`, { ms: 7000, action: { label: 'Undo', run: () => setF(before) } });
  };
  const addRow = () => { setF((p) => ({ ...p, items: [...p.items, blankItem()] })); setFocusReq({ row: f.items.length, field: 'desc' }); };
  const pickDesc = (i, v) => {
    const hit = priceBook.get(v.trim().toLowerCase());
    setF((p) => ({ ...p, items: p.items.map((it, n) => (n === i ? { ...it, description: v, price: it.price.trim() === '' && hit ? centsText(hit.unit_cents) : it.price } : it)) }));
  };
  const lineKey = (e, i, field) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (field === 'desc') setFocusReq({ row: i, field: 'price' });
    else if (i === f.items.length - 1) { if (f.items[i].description.trim() || f.items[i].price.trim()) addRow(); }
    else setFocusReq({ row: i + 1, field: 'desc' });
  };

  const termDays = f.due_date && f.issue_date ? daysBetween(f.issue_date, f.due_date) : null;
  const dueInfo = f.due_date ? dueWords({ status: 'sent', due_date: f.due_date, items: [{ qty: 1, unit_cents: 1 }] }) : null;

  async function submit() {
    if (busy) return;
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
    if (Object.keys(e).length) { if (e.discount || e.tax_pct) setShowAdj(true); setErrTick((n) => n + 1); return; }
    setBusy(true);
    try {
      const fields = {
        number: f.number.trim().slice(0, 30), customer: f.customer.trim().slice(0, 100), customer_email: f.customer_email.trim().slice(0, 120),
        customer_address: f.customer_address.trim().slice(0, 300), issue_date: f.issue_date, due_date: f.due_date || null,
        items: parsed.items.map(({ description, qty, unit_cents }) => ({ description, qty, unit_cents })),
        tax_pct: Math.round(parsed.tax_pct * 100) / 100, discount_cents: parsed.discount_cents, currency: f.currency, notes: f.notes.trim().slice(0, 1000),
      };
      const row = invoice ? await save('invoices', { ...invoice, ...fields }) : await create('invoices', { ...fields, load_id: src.load_id || null, status: 'draft', paid_cents: 0, paid_at: null });
      toast(invoice ? 'Invoice saved.' : `Invoice ${row.number} saved as a draft. Send it when you are ready.`);
      onSaved(row);
    } catch (err) { console.error(err); toast('Could not save the invoice. Try again.', { bad: true }); } finally { setBusy(false); }
  }
  const saveLabel = invoice ? 'Save changes' : 'Save draft';
  const invalid = (k) => (errors[k] ? true : undefined);
  const nErr = Object.keys(errors).length;
  const previewInv = { ...(invoice || {}), status: invoice?.status || 'draft', issue_date: f.issue_date, items: parsed.items, paid_cents: invoice?.paid_cents, currency: f.currency };
  const shownLines = parsed.items.filter((i) => i.description);

  return (
    <div onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}>
      <PageHeader title={invoice ? `Edit ${invoice.number}` : 'New invoice'}
        back={<button type="button" onClick={requestClose} className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-ink-500 hover:text-ink-900 dark:hover:text-white"><ArrowLeft size={14} /> {invoice ? invoice.number : 'All invoices'}</button>}
        sub={invoice ? undefined : 'Fill in the customer and the lines. Totals update as you type.'}
        actions={<div className="hidden w-72 md:block"><Stepper inv={previewInv} compact /></div>} />

      <form ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-9">
          {nErr > 0 && <Banner tone="red"><span className="flex items-center gap-2"><TriangleAlert size={16} /> {nErr === 1 ? 'One thing needs fixing' : `${nErr} things need fixing`}. They are marked in red below.</span></Banner>}

          <section aria-labelledby="s-bill">
            <SectionHead n="1" title={<span id="s-bill">Bill to</span>} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer" error={errors.customer} className="sm:col-span-2">
                {(id) => <Input id={id} data-first={isNew ? '' : undefined} list="rb-customers" autoComplete="off" aria-invalid={invalid('customer')} className="h-12 text-base font-bold" value={f.customer} maxLength={100} onChange={(e) => onCustomer(e.target.value)} placeholder="Start typing a company or person" />}
              </Field>
              {!f.customer.trim() && isNew && book.some((c) => c.invoices.length) && (
                <div className="-mt-2 flex flex-wrap items-center gap-2 sm:col-span-2">
                  <span className="text-xs text-ink-500">Recent:</span>
                  {book.filter((c) => c.invoices.length).slice(0, 4).map((c) => <button key={c.name} type="button" onClick={() => onCustomer(c.name)} className="rounded-full bg-ink-100 px-3 py-1 text-xs font-bold text-ink-700 hover:bg-brand-100 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700">{c.name}</button>)}
                </div>
              )}
              {last && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-dashed border-brand-500/60 bg-brand-50 px-4 py-3 dark:bg-brand-500/10 sm:col-span-2">
                  <p className="min-w-0 text-sm"><b>{match.invoices.length === 1 ? 'You billed them once before' : `You have billed them ${match.invoices.length} times`}.</b> <span className="text-ink-600 dark:text-ink-300">Last was {last.number}, {fmtMoney(invoiceTotals(last).total, last.currency)}.</span></p>
                  <Button variant="dark" size="sm" icon={Repeat} onClick={repeatLast}>Repeat last invoice</Button>
                </div>
              )}
              <Field label="Email (optional)" error={errors.customer_email}>{(id) => <Input id={id} type="email" inputMode="email" aria-invalid={invalid('customer_email')} value={f.customer_email} maxLength={120} onChange={(e) => set('customer_email', e.target.value)} placeholder="accounts@company.com" />}</Field>
              <Field label="Currency">{() => <Segmented value={f.currency} onChange={(v) => set('currency', v)} options={[{ value: 'JMD', label: 'J$ Jamaican' }, { value: 'USD', label: 'US$ US dollars' }]} className="h-10" />}</Field>
              <Field label="Address (optional)" className="sm:col-span-2">{(id) => <Textarea id={id} rows={2} value={f.customer_address} maxLength={300} onChange={(e) => set('customer_address', e.target.value)} />}</Field>
            </div>
            <datalist id="rb-customers">{book.map((c) => <option key={c.name} value={c.name} />)}</datalist>
          </section>

          <section aria-labelledby="s-items" className="border-t border-[var(--hairline)] pt-7">
            <SectionHead n="2" title={<span id="s-items">What you are billing for</span>} hint="Enter moves to the next box" />
            <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7.5rem_7rem_2.25rem] gap-2 px-1 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500 sm:grid" aria-hidden>
              <span>Description</span><span>Qty</span><span>Price each</span><span className="text-right">Amount</span><span />
            </div>
            <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
              {f.items.map((it, i) => {
                const line = Math.round((Number(it.qty) || 0) * (parseMoney(it.price) || 0));
                return (
                  <li key={it._k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_5rem_7.5rem_7rem_2.25rem]">
                    <Input aria-label={`Line ${i + 1} description`} data-row={i} data-f="desc" list="rb-items" className="h-11 sm:h-10" value={it.description} maxLength={200} placeholder={i === 0 ? 'e.g. Freight Kingston to Montego Bay' : 'Description'}
                      onChange={(e) => pickDesc(i, e.target.value)} onKeyDown={(e) => lineKey(e, i, 'desc')} aria-invalid={errors.items ? true : undefined} />
                    <IconButton icon={Trash2} label={`Remove line ${i + 1}`} disabled={f.items.length === 1} className="sm:order-last" onClick={() => setF((p) => ({ ...p, items: p.items.filter((_, n) => n !== i) }))} />
                    <div className="col-span-2 grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 sm:contents">
                      <Input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" className="h-11 sm:h-10" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                      <Input aria-label={`Line ${i + 1} price each`} data-row={i} data-f="price" inputMode="decimal" className="h-11 sm:h-10" value={it.price} placeholder="Price each" onChange={(e) => setItem(i, 'price', e.target.value)} onKeyDown={(e) => lineKey(e, i, 'price')} />
                      <span className="min-w-[6rem] text-right text-sm font-bold tabular-nums">{line ? money(line) : <span className="font-normal text-ink-400">-</span>}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <datalist id="rb-items">{descOptions.map((d) => <option key={d} value={d} />)}</datalist>
            {errors.items && <p className="mt-2 text-sm font-medium text-red-600">{errors.items}</p>}
            <button type="button" onClick={addRow} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-ink-300 text-sm font-bold text-ink-600 hover:border-brand-500 hover:bg-brand-50 hover:text-ink-900 dark:border-ink-600 dark:text-ink-300 dark:hover:bg-ink-800"><Plus size={16} /> Add another line</button>

            {showAdj ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Discount (amount)" error={errors.discount}>{(id) => <Input id={id} inputMode="decimal" aria-invalid={invalid('discount')} value={f.discount} onChange={(e) => set('discount', e.target.value)} placeholder="0" />}</Field>
                <Field label="Tax (percent)" error={errors.tax_pct} hint="Charged on the amount after the discount.">{(id) => <Input id={id} inputMode="decimal" aria-invalid={invalid('tax_pct')} value={f.tax_pct} onChange={(e) => set('tax_pct', e.target.value)} placeholder="e.g. 15" />}</Field>
              </div>
            ) : <button type="button" onClick={() => setShowAdj(true)} className="mt-4 text-sm font-bold text-brand-600 hover:underline dark:text-brand-400">+ Add a discount or tax</button>}
          </section>

          <section aria-labelledby="s-terms" className="border-t border-[var(--hairline)] pt-7">
            <SectionHead n="3" title={<span id="s-terms">Dates and payment terms</span>} />
            <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
              <Field label="Invoice date" error={errors.issue_date}>{(id) => <Input id={id} type="date" aria-invalid={invalid('issue_date')} value={f.issue_date} onChange={(e) => set('issue_date', e.target.value)} />}</Field>
              <Field label="Customer should pay" error={errors.due_date}>
                {(id) => <>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Payment terms">
                    {TERMS.map((o) => {
                      const on = termDays === o.n;
                      return <button key={o.n} type="button" aria-pressed={on} onClick={() => set('due_date', addDaysStr(f.issue_date || todayStr(), o.n))} className={cx('h-10 rounded-[6px] px-4 text-sm font-bold ring-1', on ? 'bg-ink-900 text-white ring-ink-900 dark:bg-brand-500 dark:text-ink-950 dark:ring-brand-500' : 'bg-[var(--surface)] text-ink-700 ring-ink-300 hover:bg-ink-100 dark:text-ink-200 dark:ring-ink-600 dark:hover:bg-ink-800')}>{o.label}</button>;
                    })}
                    <Input id={id} type="date" aria-label="Due date" aria-invalid={invalid('due_date')} className="w-40" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} />
                  </div>
                  <p className="mt-2 text-sm text-ink-500">{f.due_date ? <>Due <b className="text-ink-800 dark:text-ink-100">{fmtDay(f.due_date)}</b>{dueInfo && <span className={TONE_CLASS[dueInfo.tone]}> · {dueInfo.text.replace('Due ', '')}</span>}</> : 'No due date. The invoice will never show as overdue.'}</p>
                </>}
              </Field>
            </div>
            <Field label="Invoice number" className="mt-4 max-w-[14rem]" error={errors.number}>{(id) => <Input id={id} aria-invalid={invalid('number')} value={f.number} maxLength={30} onChange={(e) => set('number', e.target.value)} />}</Field>
          </section>

          <section aria-labelledby="s-notes" className="border-t border-[var(--hairline)] pt-7">
            <SectionHead n="4" title={<span id="s-notes">Payment details and notes</span>} />
            <Field label="Shown at the bottom of the invoice" hint="Say how to pay: bank, account number, or cash on delivery.">{(id) => <Textarea id={id} rows={3} value={f.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} />}</Field>
            <div className="mt-2 flex flex-wrap gap-2">
              {[['Bank transfer', 'Pay by bank transfer.\nBank: \nAccount name: \nAccount no.: '], ['Cash or cheque', 'Pay by cash or cheque on delivery.'], ['Thank you', 'Thank you for your business.']].map(([l, txt]) => (
                <button key={l} type="button" onClick={() => set('notes', f.notes.trim() ? `${f.notes.trim()}\n${txt}` : txt)} className="rounded-full bg-ink-100 px-3 py-1 text-xs font-bold text-ink-700 hover:bg-brand-100 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700">+ {l}</button>
              ))}
            </div>
          </section>

          <div className="sticky bottom-[4.4rem] z-20 -mx-4 flex items-center justify-between gap-3 border-t border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 md:bottom-0 md:mx-0 md:rounded-[8px] md:border md:px-4 lg:hidden">
            <div><p className="text-xs text-ink-500">Total</p><p className="text-xl font-bold leading-none">{money(t.total)}</p></div>
            <div className="flex gap-2"><Button variant="ghost" onClick={requestClose}>Cancel</Button><Button type="submit" size="lg" loading={busy}>{saveLabel}</Button></div>
          </div>
        </div>

        <aside className="hidden lg:block" aria-label="Invoice preview">
          <div className="sticky top-6 space-y-3">
            <div className="overflow-hidden rounded-[6px] bg-white text-ink-900 shadow-[0_1px_0_rgba(0,0,0,0.06),0_14px_30px_-18px_rgba(0,0,0,0.45)] ring-1 ring-black/10">
              <div className="flex items-center justify-between bg-ink-950 px-4 py-2.5 text-white"><span className="font-display text-lg font-bold tracking-[0.12em]">INVOICE</span><Plate>{f.number || 'NUMBER'}</Plate></div>
              <div className="h-1 bg-brand-500" />
              <div className="px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">Bill to</p>
                <p className="truncate font-bold">{f.customer || <span className="font-normal text-ink-400">Customer name</span>}</p>
                <p className="text-xs text-ink-500">{f.due_date ? `Due ${fmtDay(f.due_date)}` : 'No due date'}</p>
                <ul className="mt-3 divide-y divide-ink-200 border-y border-ink-200 text-sm" aria-label="Lines">
                  {shownLines.length === 0 && <li className="py-3 text-xs text-ink-400">Lines you add appear here.</li>}
                  {shownLines.slice(0, 6).map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 py-1.5"><span className="min-w-0"><span className="block truncate">{l.description}</span>{l.qty !== 1 && <span className="text-xs text-ink-500">{l.qty} x {money(l.unit_cents || 0)}</span>}</span><span className="shrink-0 font-bold tabular-nums">{money(Math.round((l.qty || 0) * (l.unit_cents || 0)))}</span></li>
                  ))}
                  {shownLines.length > 6 && <li className="py-1.5 text-xs text-ink-500">and {shownLines.length - 6} more</li>}
                </ul>
                <dl className="mt-2 space-y-1 text-sm tabular-nums">
                  <div className="flex justify-between"><dt className="text-ink-500">Subtotal</dt><dd>{money(t.subtotal)}</dd></div>
                  {t.discount > 0 && <div className="flex justify-between"><dt className="text-ink-500">Discount</dt><dd>-{money(t.discount)}</dd></div>}
                  {t.tax > 0 && <div className="flex justify-between"><dt className="text-ink-500">Tax ({parsed.tax_pct}%)</dt><dd>{money(t.tax)}</dd></div>}
                </dl>
              </div>
              <div className="flex items-end justify-between bg-brand-100 px-4 py-3"><span className="text-xs font-bold uppercase tracking-[0.14em] text-ink-700">Total</span><span className="text-3xl font-bold leading-none tabular-nums" aria-live="polite">{money(t.total)}</span></div>
            </div>
            <Button type="submit" size="lg" loading={busy} className="w-full">{saveLabel}</Button>
            <Button variant="ghost" className="w-full" onClick={requestClose}>Cancel</Button>
            <p className="text-center text-xs text-ink-500">Ctrl + Enter saves</p>
          </div>
        </aside>
      </form>
      {confirmNode}
    </div>
  );
}
