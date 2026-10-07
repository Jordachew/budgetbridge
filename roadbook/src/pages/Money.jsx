import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useRows } from '../state/data.js';
import { useMoney, useCurrency } from '../lib/hooks.js';
import { useToast } from '../components/toast.jsx';
import { softDelete } from '../lib/undo.js';
import { Button, PageHeader, Segmented } from '../components/ui.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { periodTitle } from '../core/dates.js';
import IncomeForm from './money/IncomeForm.jsx';
import IncomeTab from './money/IncomeTab.jsx';
import SettleTab from './money/SettleTab.jsx';

export default function Money() {
  const cur = useCurrency();
  const money = useMoney();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settle' ? 'settle' : 'income';
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const [edit, setEdit] = useState(params.get('new') === '1' ? 'new' : null); // null | 'new' | row
  const range = rangeOf(period);
  const income = useRows('income');
  const expenses = useRows('expenses');
  const loads = useRows('loads');

  // ?new=1 (from the New menu and shortcuts) opens Add income on the Income tab, then tidies the address.
  useEffect(() => {
    if (params.get('new') === '1') { setEdit('new'); setParams({}, { replace: true }); }
  }, [params, setParams]);

  async function del(row) {
    setEdit(null);
    await softDelete(toast, 'income', row, `Income of ${money(row.amount_cents, row.currency)} deleted`);
  }

  return (
    <>
      <div className="print:hidden"><PageHeader title="Income & pay" sub="Money in, advances, and who owes whom." actions={<Button icon={Plus} onClick={() => setEdit('new')}>Add income</Button>} /></div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Segmented value={tab} onChange={(v) => setParams(v === 'income' ? {} : { tab: v }, { replace: true })} options={[{ value: 'income', label: 'Income' }, { value: 'settle', label: 'Settle-up' }]} />
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      {tab === 'income'
        ? <IncomeTab rows={income} loads={loads} cur={cur} range={range} period={period} onEdit={setEdit} onDelete={del} />
        : <SettleTab income={income} expenses={expenses} loads={loads} cur={cur} range={range} period={period} title={periodTitle(period.kind, range)} />}
      <IncomeForm open={!!edit} row={edit === 'new' ? null : edit} loads={loads} defaultCur={cur} onClose={() => setEdit(null)} onDelete={del} />
    </>
  );
}
