// Money and mileage sums. Pure functions: the screens only display what these return.
// All money is whole cents (integers) so adding never drifts. Only one currency is totalled at a time.

import { inRange } from './dates.js';

export const live = (rows) => rows.filter((r) => !r.deleted_at);

export function sumCents(rows, cur) { let t = 0; for (const r of rows) if (!cur || r.currency === cur) t += r.amount_cents || 0; return t; }
export function otherCurrencyCount(rows, cur) { return rows.filter((r) => r.currency !== cur).length; }

export const within = (rows, field, range) => rows.filter((r) => inRange(r[field], range));

export function byCategory(expenses, cur) {
  const m = new Map();
  for (const e of expenses) if (e.currency === cur) m.set(e.category, (m.get(e.category) || 0) + e.amount_cents);
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()].map(([id, cents]) => ({ id, cents, share: total ? cents / total : 0 })).sort((a, b) => b.cents - a.cents);
}

export function loadFinance(loadId, expenses, income, cur) {
  const inc = sumCents(income.filter((i) => i.load_id === loadId), cur);
  const exp = sumCents(expenses.filter((e) => e.load_id === loadId), cur);
  return { income: inc, expenses: exp, net: inc - exp };
}

/**
 * Who owes whom. Expenses the driver paid out of pocket are owed back; money the company already
 * handed over (advances) is taken off. Positive = company owes the driver. Negative = driver holds extra cash.
 */
export function settleUp(expenses, income, cur) {
  const driverPaid = sumCents(expenses.filter((e) => e.paid_by === 'driver'), cur);
  const companyPaid = sumCents(expenses.filter((e) => e.paid_by === 'company'), cur);
  const advances = sumCents(income.filter((i) => i.kind === 'advance'), cur);
  const pay = sumCents(income.filter((i) => i.kind === 'pay'), cur);
  const other = sumCents(income.filter((i) => i.kind === 'other'), cur);
  return { driverPaid, companyPaid, advances, pay, other, due: driverPaid - advances };
}

/** Delivery items: [{ name, unit, expected, received }] -> the ones that do not match. */
export function discrepancies(items) {
  return (items || []).filter((i) => Number(i.received) !== Number(i.expected)).map((i) => ({ ...i, diff: Number(i.received) - Number(i.expected) }));
}

export function sumDistance(trips) { return trips.reduce((a, t) => a + (t.distance_m || 0), 0); }

/** Latest known odometer reading in metres, from trips, fuel receipts and a hand-typed value. */
export function currentOdometer(trips, expenses, manual) {
  const c = [];
  for (const t of trips) if (t.end_odometer_m != null && t.ended_at) c.push({ at: new Date(t.ended_at).getTime(), v: t.end_odometer_m });
  for (const e of expenses) if (e.odometer_m != null) c.push({ at: new Date(e.spent_at).getTime(), v: e.odometer_m });
  if (manual && manual.v != null) c.push({ at: new Date(manual.at).getTime(), v: manual.v });
  const good = c.filter((x) => Number.isFinite(x.at));
  if (!good.length) return null;
  good.sort((a, b) => b.at - a.at);
  return good[0].v;
}

/** Litres per 100 km from fuel fill-ups with odometer readings (full-tank method, approximate). */
export function fuelEconomy(expenses) {
  const fills = expenses.filter((e) => e.category === 'fuel' && e.litres > 0 && e.odometer_m != null).sort((a, b) => a.odometer_m - b.odometer_m);
  if (fills.length < 2) return null;
  const km = (fills.at(-1).odometer_m - fills[0].odometer_m) / 1000;
  const litres = fills.slice(1).reduce((a, f) => a + f.litres, 0);
  return km > 0 ? Math.round((litres / km) * 1000) / 10 : null;
}
