import { useMemo, useRef, useState } from 'react';
import { Camera, Trash2, X, Sparkles, ChevronDown, ArrowUpRight, ArrowDownRight, Minus, Image as ImageIcon } from 'lucide-react';
import { Button, Field, Input, Select, Banner, cx } from '../../components/ui.jsx';
import { create, save, remove, useRows } from '../../state/data.js';
import { useCurrency, useMoney } from '../../lib/hooks.js';
import { usePrefs } from '../../state/prefs.js';
import { savePicked, useFileUrl } from '../../lib/files.js';
import { readReceipt } from '../../core/ocr.js';
import { parseReceiptText } from '../../core/receipt.js';
import { parseMoney, parseDistance, fromLocalInput, toLocalInput, fmtDistance, CURRENCIES } from '../../core/format.js';
import { CATEGORIES, categoryIcon, CATEGORY_COLORS } from '../../lib/categories.js';
import { useToast } from '../../components/toast.jsx';
import { softDelete } from '../../lib/undo.js';
import Sheet from '../loads/Sheet.jsx';
import { statusLabel, relDay } from '../loads/shared.js';

const KM_PER_MI = 1.609344;
const odoText = (m, unit) => (m == null ? '' : String(Math.round((m / 1000 / (unit === 'mi' ? KM_PER_MI : 1)) * 10) / 10));
const centsText = (c) => (c == null ? '' : (c / 100).toFixed(2).replace(/\.00$/, ''));
const IDLE = { state: 'idle', progress: 0, msg: '', filled: [] };

function initial(exp, cur, preset, unit, loads, vehicles, topCat) {
  const active = loads.filter((l) => l.status === 'in_transit');
  const picked = loads.filter((l) => l.status === 'picked_up');
  const autoLoad = !exp && !preset.load_id ? (active.length === 1 ? active[0].id : !active.length && picked.length === 1 ? picked[0].id : '') : '';
  return {
    amount: centsText(exp?.amount_cents), category: exp?.category || preset.category || topCat, vendor: exp?.vendor || '', note: exp?.note || '',
    spent_at: toLocalInput(exp?.spent_at || new Date()), load_id: exp?.load_id || preset.load_id || autoLoad, vehicle_id: exp?.vehicle_id || (!exp && vehicles.length === 1 ? vehicles[0].id : ''),
    paid_by: exp?.paid_by || 'driver', currency: exp?.currency || cur,
    litres: exp?.litres != null ? String(exp.litres) : '', odometer: odoText(exp?.odometer_m, unit), receipt_path: exp?.receipt_path || null,
  };
}
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

/** Up = dearer (worse). Icon + sign + words, never colour alone. */
function Delta({ now, before, fmt, onDark }) {
  if (before == null || now == null) return null;
  const d = now - before;
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  const p = pct(now, before);
  return <span className={cx('inline-flex items-center gap-0.5 font-bold', onDark ? (d > 0 ? 'text-red-300' : d < 0 ? 'text-emerald-300' : 'text-ink-300') : d > 0 ? 'text-[var(--bad)]' : d < 0 ? 'text-[var(--good)]' : 'text-ink-500')}><Icon size={14} strokeWidth={3} />{d === 0 ? 'same' : `${d > 0 ? '+' : '-'}${fmt(Math.abs(d))}`}{p != null && d !== 0 ? ` (${d > 0 ? '+' : ''}${p}%)` : ''}</span>;
}

export default function ExpenseForm({ expense, preset = {}, onClose }) {
  const cur = useCurrency();
  const money = useMoney();
  const toast = useToast();
  const { unit } = usePrefs();
  const loads = useRows('loads');
  const vehicles = useRows('vehicles');
  const expenses = useRows('expenses');
  const topCat = useMemo(() => { const c = {}; for (const e of expenses.slice(-40)) c[e.category] = (c[e.category] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || 'fuel'; }, [expenses]);
  const [f, setF] = useState(() => initial(expense, cur, preset, unit, loads, vehicles, topCat));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(() => !!expense && !!(expense.note || expense.load_id || expense.vehicle_id || expense.paid_by === 'company'));
  const [scan, setScan] = useState(IDLE);
  const edited = useRef(new Set(expense ? Object.keys(f) : []));
  const camRef = useRef(null);
  const galRef = useRef(null);
  const receiptUrl = useFileUrl(f.receipt_path);
  const fine = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

  const set = (k, v) => { edited.current.add(k); setF((s) => ({ ...s, [k]: v })); };

  const cents = parseMoney(f.amount);
  const litres = Number(f.litres.replace(/,/g, ''));
  const fuel = f.category === 'fuel';
  const ppl = fuel && cents && litres > 0 ? Math.round(cents / litres) : null;
  const activeLoads = loads.filter((l) => l.status !== 'cancelled' || l.id === f.load_id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const symbol = (CURRENCIES[f.currency] || CURRENCIES.JMD).symbol;

  const catOrder = useMemo(() => {
    const n = {}; for (const e of expenses) n[e.category] = (n[e.category] || 0) + 1;
    return [...CATEGORIES].sort((a, b) => (n[b.id] || 0) - (n[a.id] || 0) || CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));
  }, [expenses]);
  const vendors = useMemo(() => { const seen = new Set(); return [...expenses].filter((e) => e.vendor && (e.category === f.category)).sort((a, b) => new Date(b.spent_at) - new Date(a.spent_at)).map((e) => e.vendor).filter((v) => { const k = v.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 20); }, [expenses, f.category]);

  // the fill before this one: same currency, earlier, same truck when we know it
  const at = fromLocalInput(f.spent_at) || new Date();
  const last = useMemo(() => (fuel ? expenses.filter((e) => e.category === 'fuel' && e.id !== expense?.id && e.currency === f.currency && new Date(e.spent_at) < at && (!f.vehicle_id || !e.vehicle_id || e.vehicle_id === f.vehicle_id))
    .sort((a, b) => new Date(b.spent_at) - new Date(a.spent_at))[0] : null), [expenses, fuel, expense, f.currency, f.vehicle_id, f.spent_at]);
  const lastPpl = last?.litres > 0 ? Math.round(last.amount_cents / last.litres) : null;
  const odoNow = f.odometer.trim() ? parseDistance(f.odometer, unit) : null;
  const sinceM = odoNow != null && last?.odometer_m != null && odoNow > last.odometer_m ? odoNow - last.odometer_m : null;
  const l100 = sinceM && litres > 0 ? Math.round((litres / (sinceM / 1000)) * 1000) / 10 : null;

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
        setScan({ state: 'fail', progress: 0, msg: navigator.onLine ? 'The picture is saved, but we could not read it. Please type the details in.' : 'You are offline, so the receipt reader could not load. The picture is saved. Type the details in.', filled: [] });
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
    const when = fromLocalInput(f.spent_at);
    if (!when) { e.spent_at = 'Pick the date and time of the purchase.'; setMore(true); }
    let lit = null; let odo = null;
    if (fuel) {
      if (f.litres.trim()) { lit = Number(f.litres.replace(/,/g, '')); if (!Number.isFinite(lit) || lit <= 0 || lit > 5000) e.litres = 'Litres must be a number between 0 and 5,000.'; else lit = Math.round(lit * 100) / 100; }
      if (f.odometer.trim()) { odo = parseDistance(f.odometer, unit); if (odo == null) e.odometer = `Type the odometer reading in ${unit === 'mi' ? 'miles' : 'kilometres'}, like 184,250.`; }
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    const fields = {
      category: f.category, amount_cents: cents, currency: f.currency, vendor: f.vendor.trim().slice(0, 100), note: f.note.trim().slice(0, 500),
      litres: fuel ? lit : null, odometer_m: fuel ? odo : null,
      paid_by: f.paid_by, spent_at: when.toISOString(), load_id: f.load_id || null, vehicle_id: f.vehicle_id || null, receipt_path: f.receipt_path || null,
    };
    setBusy(true);
    try {
      if (expense) { await save('expenses', { ...expense, ...fields }); toast('Expense updated'); } else {
        const row = await create('expenses', fields);
        toast(`Saved ${money(cents, f.currency)}`, { ms: 7000, action: { label: 'Undo', run: () => remove('expenses', row.id) } });
      }
      onClose();
    } catch (err) {
      setErrors({ form: err.message || 'Could not save this expense. Try again.' });
    } finally { setBusy(false); }
  }
  async function del() { await softDelete(toast, 'expenses', expense, 'Expense deleted'); onClose(); }

  const loadName = loads.find((l) => l.id === f.load_id);
  const summary = [relDay(at.toISOString()), f.paid_by === 'driver' ? 'You paid' : 'Company paid', loadName ? `Load ${loadName.reference || loadName.customer}` : null].filter(Boolean).join(' · ');

  return (
    <Sheet title={expense ? 'Edit expense' : 'Add expense'} eyebrow={expense ? undefined : 'Quick add'} onClose={onClose} onSubmit={submit}
      footer={<>
        {expense && <Button variant="outline" size="lg" icon={Trash2} aria-label="Delete expense" className="!px-4 !text-[var(--bad)]" onClick={del} />}
        <Button type="submit" size="lg" loading={busy} className="!h-14 flex-1 !text-base">{cents > 0 ? `Save ${money(cents, f.currency)}` : 'Save expense'}</Button>
      </>}>
      <div className="space-y-6">
        {errors.form && <Banner tone="red">{errors.form}</Banner>}

        {/* 1. snap */}
        <section aria-label="Receipt">
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Snap receipt with camera" onChange={onScan} />
          <input ref={galRef} type="file" accept="image/*" className="sr-only" aria-label="Choose receipt photo" onChange={onScan} />
          {!f.receipt_path && scan.state !== 'busy' ? (
            <>
              <button type="button" onClick={() => camRef.current.click()} className="flex h-20 w-full items-center gap-4 rounded-[10px] bg-brand-500 px-5 text-left text-ink-950 shadow-[0_2px_0_rgba(0,0,0,0.18)] hover:bg-brand-400 active:translate-y-px active:bg-brand-300">
                <Camera size={30} strokeWidth={2.2} className="shrink-0" />
                <span><span className="block font-display text-2xl font-bold leading-none">Snap receipt</span><span className="mt-1 block text-sm font-bold opacity-75">Reads the amount, vendor and date for you</span></span>
              </button>
              <button type="button" onClick={() => galRef.current.click()} className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-ink-600 underline-offset-2 hover:underline dark:text-ink-300"><ImageIcon size={15} />or choose a photo from your phone</button>
            </>
          ) : (
            <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-3">
              <div className="flex items-center gap-3">
                {receiptUrl ? <img src={receiptUrl} alt="Receipt" className="h-16 w-16 shrink-0 rounded-md object-cover ring-1 ring-ink-300" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-400 dark:bg-ink-800"><Camera size={22} /></span>}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{scan.state === 'busy' ? scan.msg || 'Reading the receipt...' : 'Receipt attached'}</p>
                  {scan.state === 'busy' && <><div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700" role="progressbar" aria-valuenow={Math.round(scan.progress * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.max(4, scan.progress * 100)}%` }} /></div></>}
                  {scan.state === 'done' && <p className="mt-0.5 flex items-start gap-1.5 text-xs text-[var(--good)]" role="status"><Sparkles size={13} className="mt-0.5 shrink-0" />Filled in: {scan.filled.join(', ')}. Check before saving.</p>}
                  {scan.state === 'fail' && <p className="mt-0.5 text-xs font-bold text-[var(--warn)]" role="status">{scan.msg}</p>}
                  {scan.state === 'idle' && <p className="mt-0.5 text-xs text-ink-500">Saved with this expense.</p>}
                </div>
                {scan.state !== 'busy' && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button size="sm" variant="soft" icon={Camera} onClick={() => camRef.current.click()}>Retake</Button>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => { setF((s) => ({ ...s, receipt_path: null })); setScan(IDLE); }}>Remove</Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 2. amount */}
        <section aria-label="Amount">
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="ex-amount" className="text-sm font-bold text-ink-700 dark:text-ink-200">How much?</label>
            <div role="group" aria-label="Currency" className="flex rounded-md bg-ink-100 p-0.5 dark:bg-ink-800">
              {['JMD', 'USD'].map((c) => <button key={c} type="button" aria-pressed={f.currency === c} onClick={() => set('currency', c)} className={cx('h-8 w-12 rounded text-xs font-bold', f.currency === c ? 'bg-[var(--surface)] shadow-sm ring-1 ring-ink-200 dark:bg-ink-700 dark:ring-ink-600' : 'text-ink-500')}>{c}</button>)}
            </div>
          </div>
          <div className={cx('flex items-center gap-2 rounded-[10px] border-2 bg-[var(--surface)] px-4 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/25', errors.amount ? 'border-[var(--bad)]' : 'border-ink-300 dark:border-ink-600')}>
            <span className="text-3xl font-bold text-ink-400" aria-hidden="true">{symbol}</span>
            <input id="ex-amount" inputMode="decimal" autoComplete="off" enterKeyHint="done" autoFocus={fine && !expense} placeholder="0" aria-invalid={!!errors.amount}
              className="h-20 min-w-0 flex-1 bg-transparent text-5xl font-bold tabular-nums text-ink-900 outline-none placeholder:text-ink-300 dark:text-white" value={f.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          {errors.amount && <p role="alert" className="mt-1.5 text-sm font-bold text-[var(--bad)]">{errors.amount}</p>}
        </section>

        {/* 3. category */}
        <section aria-label="Category">
          <div className="mb-1.5 text-sm font-bold text-ink-700 dark:text-ink-200">What for?</div>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Category">
            {catOrder.map((c) => { const Icon = categoryIcon(c.id); const on = f.category === c.id; return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => set('category', c.id)}
                className={cx('flex h-[4.5rem] flex-col items-center justify-center gap-1 rounded-[10px] border-2 px-1 text-xs font-bold transition-colors', on ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-[var(--hairline)] bg-[var(--surface)] text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800')}>
                <Icon size={22} strokeWidth={2.1} style={on ? undefined : { color: CATEGORY_COLORS[c.id] }} /><span className="w-full truncate text-center">{c.label}</span>
              </button>); })}
          </div>
        </section>

        {/* fuel */}
        {fuel && (
          <section aria-label="Fuel details" className="overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]">
            <div className="grid grid-cols-2 gap-3 p-4">
              <Field label="Litres" error={errors.litres}>{(id) => <Input id={id} inputMode="decimal" className="!h-14 !text-xl font-bold tabular-nums" value={f.litres} onChange={(e) => set('litres', e.target.value)} placeholder="e.g. 120" />}</Field>
              <Field label={`Odometer (${unit === 'mi' ? 'mi' : 'km'})`} error={errors.odometer}>{(id) => <Input id={id} inputMode="decimal" className="!h-14 !text-xl font-bold tabular-nums" value={f.odometer} onChange={(e) => set('odometer', e.target.value)} placeholder={last?.odometer_m != null ? odoText(last.odometer_m, unit) : 'optional'} />}</Field>
            </div>
            <div className="border-t border-[var(--hairline)] bg-ink-950 p-4 text-white dark:bg-ink-900" aria-live="polite">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">Price per litre</div>
                  <div className={cx('mt-1 text-4xl font-bold leading-none tabular-nums', ppl ? 'text-brand-400' : 'text-ink-500')}>{ppl ? money(ppl, f.currency) : '--'}</div>
                </div>
                {ppl && lastPpl && <div className="text-right text-sm"><div className="text-xs text-ink-400">vs last fill</div><Delta onDark now={ppl} before={lastPpl} fmt={(c) => money(c, f.currency)} /></div>}
              </div>
              {!ppl && <p className="mt-2 text-xs text-ink-400">Type the amount and litres to see the price per litre.</p>}
              {last ? (
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-sm">
                  <div><dt className="text-xs text-ink-400">This fill</dt><dd className="font-bold tabular-nums">{cents ? money(cents, f.currency) : '--'}{cents > 0 && <span className="ml-2 text-xs"><Delta onDark now={cents} before={last.amount_cents} fmt={(c) => money(c, f.currency)} /></span>}</dd></div>
                  <div><dt className="text-xs text-ink-400">Last fill ({relDay(last.spent_at, { time: false })})</dt><dd className="font-bold tabular-nums">{money(last.amount_cents, last.currency)}{last.litres ? <span className="font-normal text-ink-400"> · {last.litres} L</span> : null}</dd></div>
                  {sinceM != null && <div className="col-span-2"><dt className="text-xs text-ink-400">Since the last fill</dt><dd className="font-bold tabular-nums">{fmtDistance(sinceM, unit)}{l100 ? <span className="font-normal text-ink-300"> · about {l100} L per 100 km</span> : null}</dd></div>}
                </dl>
              ) : <p className="mt-3 border-t border-white/10 pt-3 text-xs text-ink-400">This is your first fuel entry, so there is nothing to compare with yet.</p>}
            </div>
          </section>
        )}

        {/* vendor */}
        <Field label={fuel ? 'Station' : 'Where?'}>{(id) => (
          <>
            <datalist id="ex-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
            <Input id={id} list="ex-vendors" maxLength={100} className="!h-12 !text-base" value={f.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder={fuel ? 'e.g. Petcom Spanish Town' : 'Shop, toll plaza, mechanic'} autoComplete="off" />
          </>)}</Field>

        {/* more */}
        <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]">
          <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left">
            <span className="min-w-0"><span className="block text-sm font-bold">More details</span><span className="block truncate text-xs text-ink-500">{summary}</span></span>
            <ChevronDown size={20} className={cx('shrink-0 text-ink-500 transition-transform', more && 'rotate-180')} />
          </button>
          {more && (
            <div className="space-y-4 border-t border-[var(--hairline)] p-4">
              <Field label="Date and time" error={errors.spent_at}>{(id) => <Input id={id} type="datetime-local" className="!h-12" value={f.spent_at} onChange={(e) => set('spent_at', e.target.value)} />}</Field>
              <div>
                <div className="mb-1.5 text-sm font-bold text-ink-700 dark:text-ink-200">Who paid?</div>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Who paid">
                  {[['driver', 'I paid'], ['company', 'Company paid']].map(([v, l]) => <button key={v} type="button" aria-pressed={f.paid_by === v} onClick={() => set('paid_by', v)} className={cx('h-12 rounded-md border-2 text-sm font-bold', f.paid_by === v ? 'border-brand-500 bg-brand-500 text-ink-950' : 'border-[var(--hairline)] bg-[var(--surface)]')}>{l}</button>)}
                </div>
              </div>
              <Field label="For which load?">{(id) => (
                <Select id={id} className="!h-12" value={f.load_id} onChange={(e) => set('load_id', e.target.value)}>
                  <option value="">Not linked to a load</option>
                  {activeLoads.map((l) => <option key={l.id} value={l.id}>{l.reference || l.customer || 'Load'} ({statusLabel(l.status)})</option>)}
                </Select>)}</Field>
              <Field label="Which truck?">{(id) => (
                <Select id={id} className="!h-12" value={f.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)}>
                  <option value="">Not specified</option>
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` (${v.plate})` : ''}</option>)}
                </Select>)}</Field>
              <Field label="Note">{(id) => <Input id={id} maxLength={500} className="!h-12" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="optional" />}</Field>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
