import { useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, FileText, Pencil, Plus, Printer, Trash2, Wallet } from 'lucide-react';
import { Badge, Banner, Button, Empty, Field, IconButton, Input, Modal, Select, Textarea, cx } from '../../components/ui.jsx';
import { useToast } from '../../components/toast.jsx';
import { create, save, useRows } from '../../state/data.js';
import { softDelete } from '../../lib/undo.js';
import { Avatar } from './shared.jsx';
import { useCurrency } from '../../lib/hooks.js';
import { fmtDate, fmtMoney, parseMoney } from '../../core/format.js';
import { addDays } from '../../core/dates.js';
import { todayStr } from '../invoices/totals.js';

const TONE = { draft: 'neutral', final: 'blue', paid: 'green' };
const LABEL = { draft: 'Draft', final: 'Final', paid: 'Paid' };
const day = (s) => fmtDate(`${s}T12:00:00`, { weekday: false, year: true });

/** Delivered loads for a driver whose delivery time falls in [from, to] (inclusive days), in one currency. */
function loadsFor(loads, driver, from, to, currency) {
  if (!driver || !from || !to) return [];
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = addDays(new Date(`${to}T00:00:00`), 1).getTime();
  return loads.filter((l) => l.user_id === driver && ['delivered', 'reconciled'].includes(l.status) && l.currency === currency && l.drop_at
    && new Date(l.drop_at).getTime() >= a && new Date(l.drop_at).getTime() < b);
}

function Editor({ crew, me, drivers, existing, onClose, onSaved }) {
  const toast = useToast();
  const cur = useCurrency();
  const loads = useRows('loads');
  const today = new Date();
  const [f, setF] = useState(() => existing ? {
    driver: existing.driver_id, from: existing.period_from, to: existing.period_to, currency: existing.currency, notes: existing.notes || '',
  } : { driver: drivers[0]?.user_id || '', from: todayStr(addDays(today, -6)), to: todayStr(today), currency: cur, notes: '' });
  const [manual, setManual] = useState(existing ? String(existing.gross_cents / 100) : null);
  const [ded, setDed] = useState(() => (existing?.deductions?.length ? existing.deductions : [{ label: '', cents: 0 }]).map((d) => ({ label: d.label, amount: d.cents ? String(d.cents / 100) : '' })));
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const driver = drivers.find((d) => d.user_id === f.driver);

  const found = useMemo(() => loadsFor(loads, f.driver, f.from, f.to, f.currency), [loads, f.driver, f.from, f.to, f.currency]);
  const computed = found.reduce((a, l) => a + (l.rate_cents || 0), 0);
  const gross = manual != null ? parseMoney(manual) : computed;
  const dedCents = ded.map((d) => (d.amount.trim() === '' ? 0 : parseMoney(d.amount)));
  const dedTotal = dedCents.reduce((a, c) => a + (c || 0), 0);
  const net = (gross || 0) - dedTotal;
  const money = (c) => fmtMoney(c, f.currency);

  async function submit() {
    const e = {};
    if (!f.driver) e.driver = 'Choose a driver.';
    if (!f.from || !f.to) e.period = 'Choose the first and last day of the pay period.';
    else if (f.to < f.from) e.period = 'The last day cannot be before the first day.';
    if (gross == null) e.gross = 'Enter the gross pay as an amount, like 120000.';
    if (dedCents.some((c, i) => c == null && ded[i].amount.trim() !== '')) e.ded = 'One of the deductions is not a valid amount.';
    else if (ded.some((d) => d.amount.trim() !== '' && !d.label.trim())) e.ded = 'Give each deduction a name, like "Fuel card".';
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const deductions = ded.map((d, i) => ({ label: d.label.trim().slice(0, 60), cents: dedCents[i] || 0 })).filter((d) => d.cents > 0);
      const fields = { crew_id: crew.id, driver_id: f.driver, period_from: f.from, period_to: f.to, gross_cents: gross, deductions, net_cents: gross - deductions.reduce((a, d) => a + d.cents, 0), currency: f.currency, notes: f.notes.trim().slice(0, 1000) };
      const row = existing ? await save('settlements', { ...existing, ...fields }) : await create('settlements', { ...fields, user_id: me, status: 'draft', paid_at: null });
      toast(existing ? 'Settlement saved.' : 'Settlement saved as a draft.');
      onSaved(row);
    } catch (x) { console.error(x); toast('Could not save the settlement.', { bad: true }); setBusy(false); }
  }

  const notShared = driver && driver.share_data === false;
  return (
    <Modal open onClose={onClose} wide title={existing ? 'Edit settlement' : 'New settlement'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save settlement</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Driver" error={err.driver}>{(id) => <Select id={id} value={f.driver} onChange={(e) => set('driver', e.target.value)}>{drivers.map((d) => <option key={d.user_id} value={d.user_id}>{d.display_name}</option>)}</Select>}</Field>
          <Field label="Currency">{(id) => <Select id={id} value={f.currency} onChange={(e) => set('currency', e.target.value)}><option value="JMD">J$ Jamaican</option><option value="USD">US$ US dollars</option></Select>}</Field>
          <Field label="From (first day)" error={err.period}>{(id) => <Input id={id} type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />}</Field>
          <Field label="To (last day)">{(id) => <Input id={id} type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />}</Field>
        </div>

        <div className="rounded-xl bg-ink-50 p-3 text-sm dark:bg-ink-800/60">
          <p className="font-semibold">{found.length} delivered {found.length === 1 ? 'load' : 'loads'} found · {money(computed)}</p>
          {notShared && <p className="mt-1 text-amber-700 dark:text-amber-400">{driver.display_name} has not agreed to share their records, so only loads you dispatched to them can be counted. Check the gross below, or type it in yourself.</p>}
          {!notShared && !found.length && <p className="mt-1 text-ink-500">No delivered loads on this device for that driver and period. Loads you dispatched appear here once they are delivered. You can also type the gross yourself.</p>}
          {found.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-ink-500">{found.slice(0, 6).map((l) => <li key={l.id} className="flex justify-between gap-2"><span className="truncate">{l.reference || l.customer || 'Load'} · {fmtDate(l.drop_at, { weekday: false })}</span><span className="tabular-nums">{money(l.rate_cents)}</span></li>)}{found.length > 6 && <li>and {found.length - 6} more</li>}</ul>}
        </div>

        <Field label="Gross pay" error={err.gross} hint="Counted from the loads above. Change it if you pay a different amount.">
          {(id) => <div className="flex gap-2"><Input id={id} inputMode="decimal" value={manual != null ? manual : String(computed / 100)} onChange={(e) => setManual(e.target.value)} />{manual != null && <Button variant="soft" onClick={() => setManual(null)}>Use loads total</Button>}</div>}
        </Field>

        <div>
          <div className="mb-1.5 text-sm font-medium">Deductions (advances, fuel card, damages)</div>
          <div className="space-y-2">
            {ded.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                <Input aria-label={`Deduction ${i + 1} name`} placeholder="e.g. Cash advance" value={d.label} maxLength={60} onChange={(e) => setDed((l) => l.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)))} />
                <Input aria-label={`Deduction ${i + 1} amount`} inputMode="decimal" placeholder="Amount" value={d.amount} onChange={(e) => setDed((l) => l.map((x, n) => (n === i ? { ...x, amount: e.target.value } : x)))} />
                <IconButton icon={Trash2} label={`Remove deduction ${i + 1}`} disabled={ded.length === 1} onClick={() => setDed((l) => l.filter((_, n) => n !== i))} />
              </div>
            ))}
          </div>
          {err.ded && <p className="mt-1 text-xs font-medium text-red-600">{err.ded}</p>}
          {ded.length < 50 && <Button variant="soft" size="sm" icon={Plus} className="mt-2" onClick={() => setDed((l) => [...l, { label: '', amount: '' }])}>Add deduction</Button>}
        </div>

        <dl className="ml-auto max-w-xs space-y-1 text-sm tabular-nums">
          <div className="flex justify-between"><dt className="text-ink-500">Gross</dt><dd>{money(gross || 0)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-500">Deductions</dt><dd>-{money(dedTotal)}</dd></div>
          <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-bold dark:border-ink-700"><dt>Net pay</dt><dd className={net < 0 ? 'text-red-600' : ''}>{money(net)}</dd></div>
        </dl>
        <Field label="Notes (optional)">{(id) => <Textarea id={id} rows={2} maxLength={1000} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

const EXACT = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
const SLIP_LABEL = 'text-[10px] font-bold uppercase tracking-[0.16em] text-ink-500';

/** The pay slip: company band, who and when, earnings, deductions, net pay, signatures. Always light for print. */
function Statement({ s, ctx, onBack, onEdit, onDeleted }) {
  const { crew, nameOf, isManager } = ctx;
  const toast = useToast();
  const loads = useRows('loads');
  const m = (c) => fmtMoney(c, s.currency);
  const mine = s.user_id === ctx.me;
  const mark = async (status) => { await save('settlements', { ...s, status, paid_at: status === 'paid' ? new Date().toISOString() : s.paid_at }); toast(status === 'paid' ? 'Marked as paid.' : 'Statement finalised.'); };
  const del = async () => { await softDelete(toast, 'settlements', s, 'Settlement deleted'); onDeleted(); };
  const earned = loadsFor(loads, s.driver_id, s.period_from, s.period_to, s.currency);
  const itemised = earned.length > 0 && earned.reduce((a, l) => a + (l.rate_cents || 0), 0) === s.gross_cents;
  const deductions = s.deductions || [];
  const dedTotal = deductions.reduce((a, d) => a + d.cents, 0);
  const stamp = s.status === 'paid' ? 'Paid' : s.status === 'draft' ? 'Draft' : '';
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>All settlements</Button>
        <div className="flex flex-wrap gap-2">
          {mine && isManager && s.status === 'draft' && <><Button variant="outline" icon={Pencil} onClick={onEdit}>Edit</Button><Button icon={CheckCircle2} onClick={() => mark('final')}>Mark final</Button></>}
          {mine && isManager && s.status === 'final' && <Button icon={Wallet} onClick={() => mark('paid')}>Mark as paid</Button>}
          <Button variant="outline" icon={Printer} onClick={() => window.print()}>Print or save as PDF</Button>
          {mine && isManager && s.status === 'draft' && <Button variant="ghost" icon={Trash2} className="!text-[var(--bad)]" onClick={del}>Delete</Button>}
        </div>
      </div>
      <article className="print-area relative mx-auto w-full max-w-[210mm] overflow-hidden bg-white text-[13px] leading-snug text-ink-900 shadow-[0_1px_0_rgba(0,0,0,0.08),0_24px_48px_-24px_rgba(0,0,0,0.5)] print:max-w-none print:shadow-none" style={EXACT} aria-label="Pay slip">
        <header className="bg-ink-950 px-5 pb-6 pt-7 text-white sm:px-[14mm]" style={EXACT}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="font-display text-[26px] font-bold uppercase leading-none tracking-[0.06em]">{crew.name}</p>{crew.phone && <p className="mt-1.5 text-ink-300">{crew.phone}</p>}</div>
            <p className="font-display text-[40px] font-bold uppercase leading-none tracking-[0.12em] text-brand-400">Pay slip</p>
          </div>
        </header>
        <div className="h-[5px] bg-brand-500" style={EXACT} aria-hidden />
        <div className="px-5 py-7 sm:px-[14mm]">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
            <div><dt className={SLIP_LABEL}>Driver</dt><dd className="mt-1 text-base font-bold">{nameOf(s.driver_id)}</dd></div>
            <div><dt className={SLIP_LABEL}>Pay period</dt><dd className="mt-1 font-bold">{day(s.period_from)} to {day(s.period_to)}</dd></div>
            <div><dt className={SLIP_LABEL}>Status</dt><dd className="mt-1 font-bold">{LABEL[s.status]}{s.paid_at ? `, ${fmtDate(s.paid_at, { weekday: false, year: true })}` : ''}</dd></div>
          </dl>

          <table className="mt-8 w-full text-left">
            <thead><tr className="border-b-2 border-ink-900 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-600"><th className="py-2">Earnings</th><th className="py-2 text-right">Amount</th></tr></thead>
            <tbody>
              {itemised ? earned.map((l) => (
                <tr key={l.id} className="break-inside-avoid border-b border-ink-200"><td className="py-2.5">{l.reference || l.customer || 'Load'} <span className="text-ink-500">· {l.pickup_label || '?'} to {l.drop_label || '?'} · {fmtDate(l.drop_at, { weekday: false })}</span></td><td className="py-2.5 text-right tabular-nums">{m(l.rate_cents)}</td></tr>
              )) : <tr className="border-b border-ink-200"><td className="py-2.5">Pay for delivered loads</td><td className="py-2.5 text-right tabular-nums">{m(s.gross_cents)}</td></tr>}
              <tr><td className="py-2.5 font-bold">Gross pay</td><td className="py-2.5 text-right font-bold tabular-nums">{m(s.gross_cents)}</td></tr>
            </tbody>
          </table>

          <table className="mt-6 w-full text-left">
            <thead><tr className="border-b-2 border-ink-900 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-600"><th className="py-2">Deductions</th><th className="py-2 text-right">Amount</th></tr></thead>
            <tbody>
              {deductions.length ? deductions.map((d, i) => <tr key={i} className="border-b border-ink-200"><td className="py-2.5">{d.label}</td><td className="py-2.5 text-right tabular-nums">-{m(d.cents)}</td></tr>) : <tr className="border-b border-ink-200"><td className="py-2.5 text-ink-500">None</td><td className="py-2.5 text-right tabular-nums">{m(0)}</td></tr>}
              {deductions.length > 0 && <tr><td className="py-2.5 font-bold">Total deductions</td><td className="py-2.5 text-right font-bold tabular-nums">-{m(dedTotal)}</td></tr>}
            </tbody>
          </table>

          <div className="mt-7 flex break-inside-avoid items-baseline justify-between bg-brand-100 px-4 py-4" style={EXACT}>
            <span className="text-[11px] font-bold uppercase tracking-[0.16em]">Net pay</span>
            <span className="text-[34px] font-bold leading-none tabular-nums">{m(s.net_cents)}</span>
          </div>
          {s.notes && <p className="mt-6 whitespace-pre-line border-l-[3px] border-brand-500 pl-3 text-ink-700">{s.notes}</p>}
          <div className="mt-16 grid grid-cols-2 gap-10 text-xs text-ink-500"><div className="border-t border-ink-400 pt-1">Driver signature</div><div className="border-t border-ink-400 pt-1">Date</div></div>
        </div>
        {stamp && <span aria-hidden className={cx('pointer-events-none absolute right-[14mm] top-[64mm] -rotate-12 rounded-[6px] border-4 px-4 py-1 font-display text-4xl font-bold uppercase tracking-[0.2em] opacity-60', s.status === 'paid' ? 'border-emerald-700 text-emerald-700' : 'border-ink-500 text-ink-500')}>{stamp}</span>}
      </article>
    </div>
  );
}

export default function Settlements({ ctx }) {
  const { crew, me, isManager, roster, nameOf } = ctx;
  const all = useRows('settlements');
  const [editing, setEditing] = useState(null);   // null | 'new' | row
  const [viewId, setViewId] = useState(null);
  const drivers = roster.filter((r) => r.role === 'driver');
  const list = all.filter((s) => s.crew_id === crew.id && (isManager ? s.user_id === me : s.driver_id === me)).sort((a, b) => (b.period_to || '').localeCompare(a.period_to || ''));
  const view = list.find((s) => s.id === viewId);
  const owed = list.filter((s) => s.status === 'final').reduce((a, s) => ({ ...a, [s.currency]: (a[s.currency] || 0) + s.net_cents }), {});
  const owedText = Object.entries(owed).map(([c, v]) => fmtMoney(v, c)).join(' + ');

  if (view) {
    return (<>
      <Statement s={view} ctx={ctx} onBack={() => setViewId(null)} onEdit={() => setEditing(view)} onDeleted={() => setViewId(null)} />
      {editing && <Editor crew={crew} me={me} drivers={drivers} existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </>);
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-500">{isManager ? 'Prepare pay slips for your drivers from their delivered loads.' : 'Pay slips your company prepared for you.'}</p>
        {isManager && <Button icon={Plus} disabled={!drivers.length} onClick={() => setEditing('new')}>New settlement</Button>}
      </div>
      {isManager && !drivers.length && <Banner tone="amber">No drivers have joined yet.</Banner>}
      {owedText && <p className="rounded-[8px] border-l-4 border-brand-500 bg-brand-50 px-4 py-3 text-sm dark:bg-brand-500/10"><b>{owedText}</b> {isManager ? 'is final and waiting to be paid out.' : 'is waiting to be paid to you.'}</p>}
      {!list.length ? <Empty icon={FileText} title="No pay slips yet" text={isManager ? 'Create one to work out what a driver is owed for a pay period. It adds up their delivered loads and your deductions.' : 'When your company prepares a pay slip for you it will appear here.'} action={isManager && drivers.length ? <Button icon={Plus} onClick={() => setEditing('new')}>New settlement</Button> : null} />
        : (
          <ul className="divide-y divide-[var(--hairline)] overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]">
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setViewId(s.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-brand-50/70 dark:hover:bg-ink-800/50">
                  <Avatar name={isManager ? nameOf(s.driver_id) : crew.name} size={40} />
                  <span className="min-w-0 flex-1"><span className="block truncate font-bold">{isManager ? nameOf(s.driver_id) : crew.name}</span><span className="block text-sm text-ink-500">{day(s.period_from)} to {day(s.period_to)}</span></span>
                  <span className="text-right"><span className="block text-lg font-bold tabular-nums">{fmtMoney(s.net_cents, s.currency)}</span><Badge tone={TONE[s.status]} className="mt-0.5">{LABEL[s.status]}</Badge></span>
                  <ChevronRight size={18} className="shrink-0 text-ink-400" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      {editing && <Editor crew={crew} me={me} drivers={drivers} existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(r) => { setEditing(null); setViewId(r.id); }} />}
    </div>
  );
}
