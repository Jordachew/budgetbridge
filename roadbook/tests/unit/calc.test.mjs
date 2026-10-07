import test from 'node:test';
import assert from 'node:assert/strict';
import { sumCents, byCategory, loadFinance, settleUp, discrepancies, currentOdometer, fuelEconomy, within } from '../../src/core/calc.js';
import { periodRange } from '../../src/core/dates.js';

const E = (o) => ({ currency: 'JMD', amount_cents: 100, category: 'fuel', paid_by: 'driver', ...o });
test('sums one currency only; integer exact', () => {
  assert.equal(sumCents([E({ amount_cents: 10 }), E({ amount_cents: 20 }), E({ currency: 'USD', amount_cents: 999 })], 'JMD'), 30);
  assert.equal(sumCents([E({ amount_cents: 1 }), E({ amount_cents: 2 })].concat(Array(1000).fill(E({ amount_cents: 1 }))), 'JMD'), 1003);
});
test('categories sorted with shares', () => {
  const r = byCategory([E({ amount_cents: 300 }), E({ category: 'toll', amount_cents: 100 }), E({ category: 'toll', amount_cents: 100 })], 'JMD');
  assert.deepEqual(r.map((x) => x.id), ['fuel', 'toll']); assert.equal(r[0].share, 0.6);
});
test('load profit', () => {
  const f = loadFinance('L1', [E({ load_id: 'L1', amount_cents: 400 }), E({ load_id: 'L2', amount_cents: 999 })], [{ load_id: 'L1', currency: 'JMD', amount_cents: 1000 }], 'JMD');
  assert.deepEqual(f, { income: 1000, expenses: 400, net: 600 });
});
test('settle up', () => {
  const s = settleUp([E({ amount_cents: 500 }), E({ paid_by: 'company', amount_cents: 700 })], [{ kind: 'advance', currency: 'JMD', amount_cents: 200 }, { kind: 'pay', currency: 'JMD', amount_cents: 900 }], 'JMD');
  assert.deepEqual(s, { driverPaid: 500, companyPaid: 700, advances: 200, pay: 900, other: 0, due: 300 });
});
test('discrepancies', () => {
  const d = discrepancies([{ name: 'rice', expected: 10, received: 10 }, { name: 'oil', expected: 5, received: 3 }, { name: 'x', expected: 1, received: '2' }]);
  assert.deepEqual(d.map((x) => [x.name, x.diff]), [['oil', -2], ['x', 1]]);
});
test('odometer picks the latest reading', () => {
  const v = currentOdometer([{ end_odometer_m: 5000, ended_at: '2026-10-01T00:00:00Z' }], [{ odometer_m: 7000, spent_at: '2026-10-02T00:00:00Z' }], { v: 6000, at: '2026-09-01T00:00:00Z' });
  assert.equal(v, 7000);
  assert.equal(currentOdometer([], [], null), null);
});
test('fuel economy', () => {
  const r = fuelEconomy([E({ litres: 50, odometer_m: 100000000 }), E({ litres: 40, odometer_m: 100200000 }), E({ litres: 40, odometer_m: 100400000 })]);
  assert.equal(r, 20);
});
test('period filter includes today', () => {
  const r = periodRange('day', new Date(2026, 9, 3, 15));
  assert.equal(within([{ t: new Date(2026, 9, 3, 1).toISOString() }, { t: new Date(2026, 9, 4, 0, 0, 1).toISOString() }], 't', r).length, 1);
});
