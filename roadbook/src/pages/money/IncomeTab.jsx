// Income as a ledger: date, what and which load, type, amount. Click a row to edit.
import { useMemo, useState } from 'react';
import { HandCoins, Plus, Search, Trash2 } from 'lucide-react';
import { useMoney } from '../../lib/hooks.js';
import { Badge, Banner, Button, Empty, IconButton, Input, Chips } from '../../components/ui.jsx';
import { otherCurrencyCount, sumCents, within } from '../../core/calc.js';
import { fmtDate, plural } from '../../core/format.js';
import { KINDS, kindOf, loadLabel } from './kinds.js';

const MON = new Intl.DateTimeFormat('en-GB', { month: 'short' });

export default function IncomeTab({ rows, loads, cur, range, period, onEdit, onDelete }) {
  const money = useMoney();
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const inPeriod = useMemo(() => within(rows, 'received_at', range).sort((a, b) => new Date(b.received_at) - new Date(a.received_at)), [rows, period.kind, period.offset]);
  const loadName = (id) => { const l = loads.find((x) => x.id === id); return l ? loadLabel(l) : ''; };
  const list = inPeriod.filter((r) => (kind === 'all' || r.kind === kind) && (!q.trim() || `${r.note || ''} ${loadName(r.load_id)}`.toLowerCase().includes(q.trim().toLowerCase())));
  const total = sumCents(inPeriod, cur);
  const shownTotal = sumCents(list, cur);
  const mixed = otherCurrencyCount(inPeriod, cur);
  const by = (k) => sumCents(inPeriod.filter((r) => r.kind === k), cur);
  const counts = Object.fromEntries(KINDS.map((k) => [k.id, inPeriod.filter((r) => r.kind === k.id).length]));

  return (
    <>
      <p className="mb-5 max-w-3xl text-xl font-bold leading-snug sm:text-2xl">
        {inPeriod.length === 0 ? 'No money in recorded for this period.' : <>You received {money(total)}. <span className="font-normal text-ink-500">{money(by('pay'))} pay, {money(by('advance'))} in advances, {money(by('other'))} other.</span></>}
      </p>
      {mixed > 0 && <div className="mb-4"><Banner tone="blue">Totals show {cur} only. {plural(mixed, 'entry', 'entries')} in the other currency {mixed === 1 ? 'is' : 'are'} listed but not added up.</Banner></div>}

      {inPeriod.length === 0 ? (
        <Empty icon={HandCoins} title="Money in goes here" text="Record pay for a load, an advance from dispatch, or any other money you receive. It feeds your profit and your settle-up." action={<Button icon={Plus} onClick={() => onEdit('new')}>Add income</Button>} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Chips value={kind} onChange={setKind} options={[{ value: 'all', label: `All ${inPeriod.length}` }, ...KINDS.filter((k) => counts[k.id]).map((k) => ({ value: k.id, label: `${k.label} ${counts[k.id]}` }))]} />
            {inPeriod.length > 6 && (
              <div className="relative ml-auto w-full sm:w-60">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                <Input aria-label="Search income" placeholder="Search notes and loads" className="!pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            )}
          </div>
          <div className="paper-card overflow-hidden">
            {list.length === 0 ? <p className="px-5 py-8 text-sm text-ink-500">Nothing matches. Clear the filter or search.</p> : (
              <ul className="divide-y divide-[var(--hairline)]">
                {list.map((r) => {
                  const k = kindOf(r.kind);
                  const d = new Date(r.received_at);
                  return (
                    <li key={r.id} className="flex items-center">
                      <button type="button" onClick={() => onEdit(r)} aria-label={`Edit ${k.label} of ${money(r.amount_cents, r.currency)} received ${fmtDate(r.received_at, { year: true })}`}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-brand-50 dark:hover:bg-ink-800/60 sm:gap-4">
                        <span className="w-10 shrink-0 text-center leading-none" title={fmtDate(r.received_at, { year: true })}>
                          <span className="block text-xl font-bold">{d.getDate()}</span>
                          <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wide text-ink-500">{MON.format(d)}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{r.note || k.label}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                            <Badge tone={k.tone} icon={k.icon} className="!py-0 !text-[10px]">{k.label}</Badge>
                            {r.load_id && loadName(r.load_id) && <span className="truncate">{loadName(r.load_id)}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 text-right font-bold tabular-nums sm:text-lg">{money(r.amount_cents, r.currency)}</span>
                      </button>
                      <IconButton icon={Trash2} label={`Delete income of ${money(r.amount_cents, r.currency)}`} onClick={() => onDelete(r)} className="mr-2 hidden hover:text-red-700 sm:inline-flex" />
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex items-baseline justify-between border-t-2 border-ink-900 bg-ink-50 px-4 py-3 font-bold dark:border-ink-200 dark:bg-ink-800/50">
              <span>{kind === 'all' && !q ? 'Total received' : `Total of ${plural(list.length, 'entry', 'entries')} shown`}</span>
              <span className="text-lg tabular-nums">{money(shownTotal)}</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
