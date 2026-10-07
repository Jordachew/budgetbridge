import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageOpen, Receipt } from 'lucide-react';
import { useRows, useProfile } from '../state/data.js';
import { useApp } from '../state/app.jsx';
import { useMoney, useCurrency, useDistance } from '../lib/hooks.js';
import { useAttention } from '../lib/attention.js';
import { hasDemo, loadDemo, clearDemo } from '../lib/demo.js';
import { categoryIcon } from '../lib/categories.js';
import { Banner, Button } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';
import { PeriodPicker, rangeOf } from '../components/PeriodPicker.jsx';
import { Bars, HBars } from '../components/charts/index.js';
import { byCategory, fuelEconomy, otherCurrencyCount, sumCents, sumDistance, within } from '../core/calc.js';
import { periodRange, periodTitle } from '../core/dates.js';
import { plural } from '../core/format.js';
import { compactMoney, catLabel, compare, fillBuckets, makeBuckets, prevName, sparkBuckets, unitWord, whenText } from './dashboard/helpers.js';
import { useUnit } from './dashboard/useUnit.js';
import Hero from './dashboard/Hero.jsx';
import Attention from './dashboard/Attention.jsx';
import Waybills from './dashboard/Waybills.jsx';
import Onboarding from './dashboard/Onboarding.jsx';
import FuelCard from './dashboard/FuelCard.jsx';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const TODAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

/** Everything the page shows for one period, in one pass. */
function usePeriodData({ period, cur, unit, income, expenses, trips }) {
  return useMemo(() => {
    const now = new Date();
    const range = rangeOf(period);
    const prevRange = periodRange(period.kind, now, period.offset - 1);
    const inc = within(income, 'received_at', range);
    const exp = within(expenses, 'spent_at', range);
    const tr = within(trips, 'started_at', range);
    const pInc = within(income, 'received_at', prevRange);
    const pExp = within(expenses, 'spent_at', prevRange);
    const revenue = sumCents(inc, cur);
    const spent = sumCents(exp, cur);
    const pRev = sumCents(pInc, cur);
    const pSpent = sumCents(pExp, cur);
    const metres = sumDistance(tr);
    const units = unit === 'mi' ? metres / 1609.344 : metres / 1000;
    const prevHas = pInc.length + pExp.length > 0;

    const buckets = fillBuckets(makeBuckets(period.kind, range, []), inc, exp, cur, now);
    const sparkB = fillBuckets(sparkBuckets(period.kind, range, now), inc, exp, cur, now);
    const spark = sparkB.map((b) => (b.profit ?? 0) / 100);
    const bestSpark = sparkB.reduce((a, b) => ((b.profit ?? -Infinity) > (a?.profit ?? -Infinity) ? b : a), null);
    const bestRev = buckets.reduce((a, b) => (b.revenue > (a?.revenue ?? 0) ? b : a), null);
    return {
      range, prevRange, inc, exp, revenue, spent, profit: revenue - spent, metres, buckets, prevHas,
      cats: byCategory(exp, cur),
      profitCmp: prevHas ? compare(revenue - spent, pRev - pSpent) : null,
      revCmp: prevHas ? compare(revenue, pRev) : null,
      expCmp: prevHas ? compare(spent, pSpent) : null,
      perUnitCost: units > 0 ? Math.round(spent / units) : null,
      perUnitProfit: units > 0 ? Math.round((revenue - spent) / units) : null,
      mixed: otherCurrencyCount(inc, cur) + otherCurrencyCount(exp, cur),
      spark,
      sparkLabel: period.kind === 'year' ? 'Monthly' : 'Daily',
      sparkWords: bestSpark ? `best ${period.kind === 'year' ? 'month' : 'day'} was ${bestSpark.label}` : 'no data',
      bestRev,
    };
  }, [income, expenses, trips, cur, unit, period.kind, period.offset]);
}

export default function Dashboard() {
  const profile = useProfile();
  const { isAccount } = useApp();
  const toast = useToast();
  const cur = useCurrency();
  const money = useMoney();
  const dist = useDistance();
  const unit = useUnit();
  const attention = useAttention();
  const [period, setPeriod] = useState({ kind: 'month', offset: 0 });
  const [demoBusy, setDemoBusy] = useState(false);

  const income = useRows('income');
  const expenses = useRows('expenses');
  const trips = useRows('trips');
  const loads = useRows('loads');
  const vehicles = useRows('vehicles');

  const d = usePeriodData({ period, cur, unit, income, expenses, trips });
  const active = useMemo(() => loads.filter((l) => !['delivered', 'reconciled', 'cancelled'].includes(l.status))
    .sort((a, b) => (new Date(a.pickup_at || a.created_at)) - (new Date(b.pickup_at || b.created_at))), [loads]);

  const name = (profile.display_name || '').trim().split(/\s+/)[0];
  const uLabel = unit === 'mi' ? 'mile' : 'km';
  const records = income.length + expenses.length + loads.length + trips.length;
  const steps = [
    { id: 'name', title: 'Set your name and currency', hint: 'So the page greets you and shows money the way you count it.', to: '/settings', cta: 'Open settings', done: !!(profile.display_name || '').trim() },
    { id: 'truck', title: 'Add your truck', hint: 'Plate, make and odometer. Costs and service reminders hang off it.', to: '/maintenance?tab=vehicles', cta: 'Add truck', done: vehicles.length > 0 || !!(profile.truck_label || '').trim() },
    { id: 'load', title: 'Log your first load', hint: 'Customer, route and rate. It becomes a waybill on this page.', to: '/loads?new=1', cta: 'New load', done: loads.length > 0 },
    { id: 'receipt', title: 'Snap your first receipt', hint: 'Take a photo of a fuel slip and Roadbook reads the amount for you.', to: '/expenses?new=1', cta: 'Add expense', done: expenses.length > 0 },
  ];
  const showOnboarding = records < 3 && steps.some((s) => !s.done);
  const blank = records === 0;
  const sample = hasDemo();

  async function tryDemo() {
    setDemoBusy(true);
    try { await loadDemo(); toast('Sample data added. Have a look around.'); } catch (e) { toast(e.message || 'Could not add sample data.', { bad: true }); } finally { setDemoBusy(false); }
  }
  async function wipeDemo() { await clearDemo(); toast('Sample data cleared.'); }

  const when = whenText(period, d.range);
  const titleText = periodTitle(period.kind, d.range);
  const expRatio = pct(d.spent, d.revenue);
  const barsSummary = d.revenue + d.spent === 0 ? `Nothing recorded ${when}.`
    : d.revenue === 0 ? `You spent ${money(d.spent)} ${when} and recorded no income yet.`
      : `Expenses are ${expRatio}% of revenue ${when} (${money(d.spent)} of ${money(d.revenue)}).${d.bestRev && d.bestRev.revenue > 0 ? ` ${d.bestRev.label} was the strongest ${unitWord(period.kind)} for income at ${money(d.bestRev.revenue)}.` : ''}`;
  const top = d.cats[0];
  const catSummary = top ? `${catLabel(top.id)} is your biggest cost at ${Math.round(top.share * 100)}% of expenses (${money(top.cents)}).${d.cats.length > 1 ? ` The next is ${catLabel(d.cats[1].id)} at ${Math.round(d.cats[1].share * 100)}%.` : ''}` : 'No expenses recorded.';

  const primary = active.length
    ? <Button as={Link} to="/expenses?new=1" icon={Receipt}>Add expense</Button>
    : <Button as={Link} to="/loads?new=1" icon={PackageOpen}>Book a load</Button>;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-ink-500">{TODAY.format(new Date())}</p>
            <h1 className="mt-1 font-display text-4xl font-bold leading-none tracking-tight sm:text-5xl">{greeting()}{name ? `, ${name}` : ''}</h1>
            {profile.truck_label && <p className="mt-2 text-sm text-ink-500">Here is how {profile.truck_label} is doing.</p>}
          </div>
          <div className="hidden sm:block">{!blank && primary}</div>
        </div>
        <div className="roadline mt-4" aria-hidden="true" />
        {!blank && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <PeriodPicker value={period} onChange={setPeriod} kinds={['week', 'month', 'year']} />
            <div className="sm:hidden">{primary}</div>
          </div>
        )}
        {sample && (
          <p className="mt-3 text-sm text-ink-500">You are looking at sample data. <button type="button" onClick={wipeDemo} className="font-bold text-brand-600 underline-offset-2 hover:underline dark:text-brand-400">Clear sample data</button></p>
        )}
      </header>

      {d.mixed > 0 && !blank && <Banner tone="blue">Totals show {cur} only. {plural(d.mixed, 'record')} in the other currency {d.mixed === 1 ? 'is' : 'are'} not included.</Banner>}

      {showOnboarding && <Onboarding steps={steps} isAccount={isAccount} onDemo={tryDemo} demoBusy={demoBusy} />}

      {!blank && (
        <>
          <Hero d={d} money={money} dist={dist} uLabel={uLabel} titleText={titleText} againstName={prevName(period.kind, d.prevRange)} />
          <Attention items={attention} />
          <Waybills loads={active} money={money} />

          <section aria-labelledby="ch-h">
            <h2 id="ch-h" className="mb-3 font-display text-2xl font-semibold leading-none">Where the money went</h2>
            {d.revenue + d.spent === 0 ? (
              <div className="rounded-[10px] border border-dashed border-ink-300 px-5 py-8 text-sm text-ink-600 dark:border-ink-600 dark:text-ink-300">
                Nothing recorded {when}. Pick another period above, or <Link to="/expenses?new=1" className="font-bold text-brand-600 dark:text-brand-400">add an expense</Link> or <Link to="/money?new=1" className="font-bold text-brand-600 dark:text-brand-400">add income</Link>.
              </div>
            ) : (
              <div className="grid items-start gap-4 lg:grid-cols-[1.55fr_1fr]">
                <Bars title="Revenue and expenses" subtitle={`By ${unitWord(period.kind)}, ${titleText}`} data={d.buckets} format={(c) => money(c)} axisFormat={(c) => compactMoney(c, cur)} summary={barsSummary}
                  series={[{ id: 'revenue', label: 'Revenue', slot: 0 }, { id: 'expenses', label: 'Expenses', slot: 1 }]} />
                <div className="space-y-4">
                  <HBars title="Expenses by category" subtitle={`Top six, ${titleText}`} summary={catSummary} format={(c) => money(c)} slot={1}
                    items={d.cats.map((c) => ({ id: c.id, label: catLabel(c.id), value: c.cents, icon: categoryIcon(c.id) }))} />
                  <FuelCard expenses={expenses} economy={fuelEconomy(expenses)} unit={unit} />
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
