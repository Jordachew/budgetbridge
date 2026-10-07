import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HandCoins, Pencil, Plus, Trash2, Scale } from 'lucide-react';
import { useRows, create, save, remove } from '../state/data.js';
import { useMoney, useCurrency } from '../lib/hooks.js';
import { useToast } from '../components/toast.jsx';
import { Badge, Banner, Button, Card, CardTitle, Empty, Field, Input, Modal, PageHeader, Segmented, Select, Stat, useConfirm } from '../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { otherCurrencyCount, settleUp, sumCents, within, loadFinance } from '../core/calc.js';
import { fmtDate, fromLocalInput, parseMoney, plural, toLocalInput } from '../core/format.js';

const KINDS = [{ id: 'pay', label: 'Pay', tone: 'green' }, { id: 'advance', label: 'Advance', tone: 'amber' }, { id: 'other', label: 'Other', tone: 'neutral' }];
const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[2];

function IncomeForm({ open, row, loads, defaultCur, onClose }) {
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
    } catch (x) { toast(x.message || 'Could not save. Try again.'); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={row ? 'Edit income' : 'Add income'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>{row ? 'Save changes' : 'Add income'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Amount" error={err.amount} className="col-span-2">{(id) => <Input id={id} inputMode="decimal" placeholder="0.00" value={f.amount} onChange={set('amount')} autoFocus />}</Field>
          <Field label="Currency">{(id) => <Select id={id} value={f.currency} onChange={set('currency')}><option value="JMD">JMD</option><option value="USD">USD</option></Select>}</Field>
        </div>
        <Field label="Type" hint="Pay is earned for a load. An advance is cash handed over before you settle up.">{(id) => <Select id={id} value={f.kind} onChange={set('kind')}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</Select>}</Field>
        <Field label="Load (optional)">{(id) => (
          <Select id={id} value={f.load_id} onChange={set('load_id')}>
            <option value="">Not linked to a load</option>
            {loads.map((l) => <option key={l.id} value={l.id}>{[l.reference, l.customer].filter(Boolean).join(' · ') || 'Load'}</option>)}
          </Select>)}</Field>
        <Field label="Received" error={err.at}>{(id) => <Input id={id} type="datetime-local" value={f.at} onChange={set('at')} />}</Field>
        <Field label="Note (optional)" error={err.note}>{(id) => <Input id={id} maxLength={500} value={f.note} onChange={set('note')} placeholder="e.g. Cash from dispatcher" />}</Field>
      </div>
    </Modal>
  );
}

function IncomeTab({ rows, loads, cur, range, period }) {
  const toast = useToast();
  const money = useMoney();
  const [confirm, confirmNode] = useConfirm();
  const [edit, setEdit] = useState(null); // null | 'new' | row
  const list = useMemo(() => within(rows, 'received_at', range).sort((a, b) => new Date(b.received_at) - new Date(a.received_at)), [rows, period.kind, period.offset]);
  const total = sumCents(list, cur);
  const mixed = otherCurrencyCount(list, cur);
  const loadName = (id) => { const l = loads.find((x) => x.id === id); return l ? ([l.reference, l.customer].filter(Boolean).join(' · ') || 'Load') : ''; };

  async function del(r) {
    if (!(await confirm({ title: 'Delete this income?', text: `${money(r.amount_cents, r.currency)} received ${fmtDate(r.received_at)} will be removed.`, danger: true, confirmLabel: 'Delete' }))) return;
    await remove('income', r.id);
    toast('Income deleted');
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total received" value={money(total)} />
        <Stat label="Pay" value={money(sumCents(list.filter((r) => r.kind === 'pay'), cur))} />
        <Stat label="Advances" value={money(sumCents(list.filter((r) => r.kind === 'advance'), cur))} />
      </div>
      {mixed > 0 && <div className="mb-4"><Banner tone="blue">Totals show {cur} only. {plural(mixed, 'entry', 'entries')} in the other currency {mixed === 1 ? 'is' : 'are'} listed but not added up.</Banner></div>}
      <div className="mb-3 flex justify-end"><Button icon={Plus} onClick={() => setEdit('new')}>Add income</Button></div>
      {list.length === 0 ? (
        <Empty icon={HandCoins} title="No income in this period" text="Record pay for a load, an advance from dispatch, or any other money in." action={<Button icon={Plus} onClick={() => setEdit('new')}>Add income</Button>} />
      ) : (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold tabular-nums">{money(r.amount_cents, r.currency)}</span><Badge tone={kindOf(r.kind).tone}>{kindOf(r.kind).label}</Badge></div>
                  <div className="truncate text-xs text-ink-500">{fmtDate(r.received_at, { year: true })}{r.load_id && loadName(r.load_id) ? ` · ${loadName(r.load_id)}` : ''}{r.note ? ` · ${r.note}` : ''}</div>
                </div>
                <button type="button" aria-label="Edit income" onClick={() => setEdit(r)} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"><Pencil size={16} /></button>
                <button type="button" aria-label="Delete income" onClick={() => del(r)} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <IncomeForm open={!!edit} row={edit === 'new' ? null : edit} loads={loads} defaultCur={cur} onClose={() => setEdit(null)} />
      {confirmNode}
    </>
  );
}

function SettleTab({ income, expenses, loads, cur, range, period }) {
  const money = useMoney();
  const inc = useMemo(() => within(income, 'received_at', range), [income, period.kind, period.offset]);
  const exp = useMemo(() => within(expenses, 'spent_at', range), [expenses, period.kind, period.offset]);
  const s = settleUp(exp, inc, cur);
  const mixed = otherCurrencyCount(inc, cur) + otherCurrencyCount(exp, cur);
  const perLoad = loads.map((l) => ({ l, ...settleUp(exp.filter((e) => e.load_id === l.id), inc.filter((i) => i.load_id === l.id), cur), fin: loadFinance(l.id, exp, inc, cur) }))
    .filter((r) => r.driverPaid || r.advances || r.pay || r.companyPaid);
  const loose = settleUp(exp.filter((e) => !e.load_id), inc.filter((i) => !i.load_id), cur);
  const hasLoose = loose.driverPaid || loose.advances || loose.pay || loose.companyPaid;

  if (!inc.length && !exp.length) return <Empty icon={Scale} title="Nothing to settle in this period" text="Add expenses and advances and Roadbook works out who owes whom." />;

  const owed = s.due;
  const headline = owed > 0 ? `The company owes you ${money(owed)}` : owed < 0 ? `You hold ${money(-owed)} more than you have spent` : 'You are all square';
  const tone = owed > 0 ? 'text-emerald-600 dark:text-emerald-400' : owed < 0 ? 'text-amber-600 dark:text-amber-400' : '';
  const explain = owed > 0
    ? `You paid ${money(s.driverPaid)} out of your own pocket, and the company advanced you ${money(s.advances)}. The difference, ${money(owed)}, should be paid back to you.`
    : owed < 0
      ? `The company advanced you ${money(s.advances)} but you only spent ${money(s.driverPaid)} of your own money. ${money(-owed)} of that cash is still with you and should be handed back or carried to the next trip.`
      : `The ${money(s.advances)} advanced to you matches the ${money(s.driverPaid)} you spent. Nobody owes anybody.`;

  const Line = ({ label, value, strong }) => <div className={`flex justify-between py-2 text-sm ${strong ? 'font-bold' : ''}`}><span>{label}</span><span className="whitespace-nowrap tabular-nums">{value}</span></div>;

  return (
    <div className="space-y-4">
      {mixed > 0 && <Banner tone="blue">Settle-up uses {cur} only. {plural(mixed, 'entry', 'entries')} in the other currency {mixed === 1 ? 'is' : 'are'} left out.</Banner>}
      <Card>
        <div className="flex items-center gap-2 text-xs font-medium text-ink-500"><Scale size={16} />Settle-up</div>
        <div className={`mt-2 text-2xl font-bold tracking-tight ${tone}`}>{headline}</div>
        <p className="mt-2 max-w-2xl text-sm text-ink-600 dark:text-ink-300">{explain}</p>
        <div className="mt-4 divide-y divide-ink-100 rounded-xl bg-ink-50 px-4 dark:divide-ink-700 dark:bg-ink-800/60">
          <Line label="Paid by you (out of pocket)" value={money(s.driverPaid)} />
          <Line label="Advances received from the company" value={`- ${money(s.advances)}`} />
          <Line strong label={owed >= 0 ? 'Company owes you' : 'You owe the company'} value={money(Math.abs(owed))} />
        </div>
        <p className="mt-3 text-xs text-ink-500">Also this period: {money(s.companyPaid)} paid directly by the company, {money(s.pay)} pay and {money(s.other)} other income. These do not change who owes whom.</p>
      </Card>

      <Card>
        <CardTitle title="By load" sub="Balance is paid by you minus advances. Positive means the company owes you; negative means you hold extra cash." />
        {perLoad.length === 0 && !hasLoose ? <p className="text-sm text-ink-500">Expenses and income are not linked to any load yet.</p> : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-ink-200/70 dark:ring-ink-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500 dark:bg-ink-900/60"><tr><th className="px-4 py-2.5 font-medium">Load</th><th className="px-4 py-2.5 text-right font-medium">Paid by you</th><th className="px-4 py-2.5 text-right font-medium">Advances</th><th className="px-4 py-2.5 text-right font-medium">Balance</th></tr></thead>
              <tbody className="divide-y divide-ink-100 bg-white dark:divide-ink-800 dark:bg-ink-900">
                {perLoad.map((r) => <tr key={r.l.id}><td className="px-4 py-3 font-medium">{[r.l.reference, r.l.customer].filter(Boolean).join(' · ') || 'Load'}</td><td className="px-4 py-3 text-right tabular-nums">{money(r.driverPaid)}</td><td className="px-4 py-3 text-right tabular-nums">{money(r.advances)}</td><td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${r.due < 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{money(r.due)}</td></tr>)}
                {hasLoose ? <tr><td className="px-4 py-3 text-ink-500">Not linked to a load</td><td className="px-4 py-3 text-right tabular-nums">{money(loose.driverPaid)}</td><td className="px-4 py-3 text-right tabular-nums">{money(loose.advances)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(loose.due)}</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default function Money() {
  const cur = useCurrency();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settle' ? 'settle' : 'income';
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const range = rangeOf(period);
  const income = useRows('income');
  const expenses = useRows('expenses');
  const loads = useRows('loads');

  return (
    <>
      <PageHeader title="Income & pay" sub="Money in, advances, and who owes whom." />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={(v) => setParams(v === 'income' ? {} : { tab: v }, { replace: true })} options={[{ value: 'income', label: 'Income' }, { value: 'settle', label: 'Settle-up' }]} />
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {tab === 'income'
        ? <IncomeTab rows={income} loads={loads} cur={cur} range={range} period={period} />
        : <SettleTab income={income} expenses={expenses} loads={loads} cur={cur} range={range} period={period} />}
    </>
  );
}
