import { useRef, useState } from 'react';
import { ScanLine, Trash2, X, Sparkles } from 'lucide-react';
import { Modal, Button, Field, Input, Select, Segmented, Banner, cx, useConfirm } from '../../components/ui.jsx';
import { create, save, remove, useRows } from '../../state/data.js';
import { useCurrency, useMoney } from '../../lib/hooks.js';
import { usePrefs } from '../../state/prefs.js';
import { savePicked, useFileUrl } from '../../lib/files.js';
import { readReceipt } from '../../core/ocr.js';
import { parseReceiptText } from '../../core/receipt.js';
import { parseMoney, parseDistance, fromLocalInput, toLocalInput } from '../../core/format.js';
import { CATEGORIES, categoryIcon, CATEGORY_COLORS } from '../../lib/categories.js';
import { useToast } from '../../components/toast.jsx';
import { statusLabel } from '../loads/shared.js';

const KM_PER_MI = 1.609344;
const odoText = (m, unit) => (m == null ? '' : String(Math.round((m / 1000 / (unit === 'mi' ? KM_PER_MI : 1)) * 10) / 10));
const centsText = (c) => (c == null ? '' : (c / 100).toFixed(2).replace(/\.00$/, ''));

function initial(exp, cur, preset, unit) {
  return {
    amount: centsText(exp?.amount_cents), category: exp?.category || 'fuel', vendor: exp?.vendor || '', note: exp?.note || '',
    spent_at: toLocalInput(exp?.spent_at || new Date()), load_id: exp?.load_id || preset.load_id || '', vehicle_id: exp?.vehicle_id || '',
    paid_by: exp?.paid_by || 'driver', currency: exp?.currency || cur,
    litres: exp?.litres != null ? String(exp.litres) : '', odometer: odoText(exp?.odometer_m, unit), receipt_path: exp?.receipt_path || null,
  };
}

export default function ExpenseForm({ expense, preset = {}, onClose }) {
  const cur = useCurrency();
  const money = useMoney();
  const toast = useToast();
  const { unit } = usePrefs();
  const loads = useRows('loads');
  const vehicles = useRows('vehicles');
  const [confirm, confirmNode] = useConfirm();
  const [f, setF] = useState(() => initial(expense, cur, preset, unit));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState({ state: 'idle', progress: 0, msg: '', filled: [] });
  const edited = useRef(new Set(expense ? Object.keys(f) : []));
  const fileRef = useRef(null);
  const receiptUrl = useFileUrl(f.receipt_path);

  const set = (k, v) => { edited.current.add(k); setF((s) => ({ ...s, [k]: v })); };

  const cents = parseMoney(f.amount);
  const litres = Number(f.litres);
  const ppl = f.category === 'fuel' && cents && litres > 0 ? Math.round(cents / litres) : null;
  const activeLoads = loads.filter((l) => l.status !== 'cancelled' || l.id === f.load_id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  async function onScan(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScan({ state: 'busy', progress: 0.02, msg: 'Saving the picture...', filled: [] });
    try {
      const path = await savePicked(file, 'receipts');
      setF((s) => ({ ...s, receipt_path: path }));
      setScan({ state: 'busy', progress: 0.05, msg: 'Reading the receipt...', filled: [] });
      let text;
      try {
        text = await readReceipt(file, (p) => setScan((s) => ({ ...s, progress: p })));
      } catch {
        setScan({ state: 'fail', progress: 0, msg: navigator.onLine ? 'The picture is saved, but we could not read it. Please type the details in.' : 'You are offline, so the receipt reader could not load. The picture is saved. Type the details in, or scan again later.', filled: [] });
        return;
      }
      const r = parseReceiptText(text);
      const filled = [];
      setF((s) => {
        const n = { ...s };
        const can = (k) => !edited.current.has(k);
        if (r.amount_cents && can('amount')) { n.amount = centsText(r.amount_cents); filled.push(r.amount_sure ? 'amount' : 'amount (check it)'); }
        if (r.vendor && can('vendor')) { n.vendor = r.vendor; filled.push('vendor'); }
        if (r.date && can('spent_at')) { n.spent_at = `${r.date}T${toLocalInput(new Date()).slice(11)}`; filled.push(r.date_ambiguous ? 'date (check it)' : 'date'); }
        if (r.category && can('category')) { n.category = r.category; filled.push('category'); }
        if (r.litres && can('litres')) { n.litres = String(r.litres); filled.push('litres'); }
        return n;
      });
      setScan(filled.length
        ? { state: 'done', progress: 1, msg: '', filled }
        : { state: 'fail', progress: 0, msg: 'We could not find any details on that receipt. The picture is saved. Please type them in.', filled: [] });
    } catch (err) {
      setScan({ state: 'fail', progress: 0, msg: err.message || 'Could not use that picture.', filled: [] });
    }
  }

  async function submit() {
    const e = {};
    if (cents == null || cents <= 0) e.amount = cents === 0 ? 'The amount must be more than zero.' : 'Enter the amount as a number, like 12500 or 1,250.50.';
    const at = fromLocalInput(f.spent_at);
    if (!at) e.spent_at = 'Pick the date and time of the purchase.';
    let lit = null; let odo = null;
    if (f.category === 'fuel') {
      if (f.litres.trim()) { lit = Number(f.litres.replace(/,/g, '')); if (!Number.isFinite(lit) || lit <= 0 || lit > 5000) e.litres = 'Litres must be a number between 0 and 5,000.'; else lit = Math.round(lit * 100) / 100; }
      if (f.odometer.trim()) { odo = parseDistance(f.odometer, unit); if (odo == null) e.odometer = `Type the odometer reading in ${unit === 'mi' ? 'miles' : 'kilometres'}, like 184,250.`; }
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    const fields = {
      category: f.category, amount_cents: cents, currency: f.currency, vendor: f.vendor.trim().slice(0, 100), note: f.note.trim().slice(0, 500),
      litres: f.category === 'fuel' ? lit : null, odometer_m: f.category === 'fuel' ? odo : null,
      paid_by: f.paid_by, spent_at: at.toISOString(), load_id: f.load_id || null, vehicle_id: f.vehicle_id || null, receipt_path: f.receipt_path || null,
    };
    setBusy(true);
    try {
      if (expense) await save('expenses', { ...expense, ...fields }); else await create('expenses', fields);
      toast(expense ? 'Expense updated' : `Saved ${money(cents, f.currency)}`);
      onClose();
    } catch (err) {
      setErrors({ form: err.message || 'Could not save this expense. Try again.' });
    } finally { setBusy(false); }
  }

  async function del() {
    if (await confirm({ title: 'Delete this expense?', text: 'It will be removed from your totals and reports.', confirmLabel: 'Delete', danger: true })) {
      await remove('expenses', expense.id); toast('Expense deleted'); onClose();
    }
  }

  return (
    <>
      <Modal open onClose={onClose} wide title={expense ? 'Edit expense' : 'Add expense'}
        footer={<>
          {expense && <Button variant="ghost" icon={Trash2} className="mr-auto !text-red-600" onClick={del}>Delete</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={submit}>{expense ? 'Save changes' : 'Save expense'}</Button>
        </>}>
        <div className="space-y-4">
          {errors.form && <Banner tone="red">{errors.form}</Banner>}

          {/* receipt scan */}
          <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-800/50">
            <div className="flex items-center gap-3">
              {receiptUrl && <img src={receiptUrl} alt="Receipt" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-ink-200" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{f.receipt_path ? 'Receipt attached' : 'Have a receipt?'}</p>
                <p className="text-xs text-ink-500">Take a photo and we will fill in what we can read. You confirm everything.</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Scan receipt" onChange={onScan} />
              <Button variant="soft" size="sm" icon={ScanLine} disabled={scan.state === 'busy'} onClick={() => fileRef.current.click()}>{f.receipt_path ? 'Rescan' : 'Scan receipt'}</Button>
              {f.receipt_path && scan.state !== 'busy' && <button type="button" aria-label="Remove receipt" className="rounded p-1 text-ink-500 hover:bg-ink-200 dark:hover:bg-ink-700" onClick={() => { setF((s) => ({ ...s, receipt_path: null })); setScan({ state: 'idle', progress: 0, msg: '', filled: [] }); }}><X size={16} /></button>}
            </div>
            {scan.state === 'busy' && (
              <div className="mt-3" role="status"><div className="mb-1 text-xs text-ink-500">{scan.msg || 'Reading the receipt...'} {Math.round(scan.progress * 100)}%</div>
                <div className="h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.max(4, scan.progress * 100)}%` }} /></div></div>
            )}
            {scan.state === 'done' && <p className="mt-3 flex items-start gap-2 text-xs text-emerald-700 dark:text-emerald-400" role="status"><Sparkles size={14} className="mt-0.5 shrink-0" />Filled in: {scan.filled.join(', ')}. Please check these before saving.</p>}
            {scan.state === 'fail' && <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400" role="status">{scan.msg}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Amount" error={errors.amount}>{(id) => <Input id={id} inputMode="decimal" autoComplete="off" className="!h-14 !text-2xl font-bold tabular-nums" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" />}</Field>
            <Field label="Currency">{(id) => <Select id={id} className="sm:!mt-0 sm:!h-14" value={f.currency} onChange={(e) => set('currency', e.target.value)}><option value="JMD">JMD</option><option value="USD">USD</option></Select>}</Field>
          </div>

          <div>
            <div className="mb-1.5 text-sm font-medium">Category</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
              {CATEGORIES.map((c) => { const Icon = categoryIcon(c.id); const on = f.category === c.id; return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => set('category', c.id)}
                  className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors', on ? 'bg-brand-500 text-white ring-brand-500' : 'bg-white text-ink-700 ring-ink-300 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700')}>
                  <Icon size={14} style={on ? undefined : { color: CATEGORY_COLORS[c.id] }} />{c.label}
                </button>); })}
            </div>
          </div>

          {f.category === 'fuel' && (
            <div className="rounded-xl border border-ink-200 p-3 dark:border-ink-800">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Litres" error={errors.litres}>{(id) => <Input id={id} inputMode="decimal" value={f.litres} onChange={(e) => set('litres', e.target.value)} placeholder="e.g. 120" />}</Field>
                <Field label={`Odometer (${unit === 'mi' ? 'miles' : 'km'})`} error={errors.odometer}>{(id) => <Input id={id} inputMode="decimal" value={f.odometer} onChange={(e) => set('odometer', e.target.value)} placeholder="optional" />}</Field>
              </div>
              <p className="mt-2 text-sm text-ink-600 dark:text-ink-300" aria-live="polite">
                {ppl ? <>Price per litre: <span className="font-bold tabular-nums">{money(ppl, f.currency)}</span></> : 'Enter the amount and litres to see the price per litre.'}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendor">{(id) => <Input id={id} maxLength={100} value={f.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="e.g. Petcom Spanish Town" />}</Field>
            <Field label="Date and time" error={errors.spent_at}>{(id) => <Input id={id} type="datetime-local" value={f.spent_at} onChange={(e) => set('spent_at', e.target.value)} />}</Field>
          </div>
          <Field label="Note">{(id) => <Input id={id} maxLength={500} value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="optional" />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="For which load?">{(id) => (
              <Select id={id} value={f.load_id} onChange={(e) => set('load_id', e.target.value)}>
                <option value="">Not linked to a load</option>
                {activeLoads.map((l) => <option key={l.id} value={l.id}>{l.reference || l.customer || 'Load'} ({statusLabel(l.status)})</option>)}
              </Select>)}</Field>
            <Field label="Which truck?">{(id) => (
              <Select id={id} value={f.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)}>
                <option value="">Not specified</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` (${v.plate})` : ''}</option>)}
              </Select>)}</Field>
          </div>
          <div>
            <div className="mb-1.5 text-sm font-medium">Who paid?</div>
            <Segmented value={f.paid_by} onChange={(v) => set('paid_by', v)} options={[{ value: 'driver', label: 'I paid' }, { value: 'company', label: 'Company paid' }]} />
          </div>
        </div>
      </Modal>
      {confirmNode}
    </>
  );
}
