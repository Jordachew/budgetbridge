import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText, findDate, findTotal, wordsToNumber, parseSpokenExpense, guessCategory, findLitres } from '../../app/js/receipt.js';

const NOW = new Date('2026-10-03T12:00:00-05:00');

test('total: picks the TOTAL line, ignores subtotal, tax, cash and change', () => {
  const t = `PETCOM SPUR TREE\nDiesel 120.5 L\nSubtotal 24,100.00\nGCT 0.00\nTOTAL J$ 24,100.00\nCASH 25,000.00\nCHANGE 900.00`;
  assert.deepEqual(findTotal(t), { cents: 2410000, sure: true });
});
test('total: falls back to largest decimal amount but says it is not sure', () => {
  const r = findTotal('Patty 250.00\nCoco bread 100.00\nThanks');
  assert.equal(r.cents, 25000); assert.equal(r.sure, false);
});
test('total: ignores long digit runs (phone / invoice numbers)', () => {
  assert.equal(findTotal('Tel 8765551234\nInvoice 20260930123').cents, null);
});
test('date: day first for Jamaica; flags ambiguity', () => {
  assert.deepEqual(findDate('Date 03/10/2026', NOW), { date: '2026-10-03', ambiguous: true });
  assert.deepEqual(findDate('25/09/2026', NOW), { date: '2026-09-25', ambiguous: false });
  assert.deepEqual(findDate('2026-09-30', NOW), { date: '2026-09-30', ambiguous: false });
  assert.equal(findDate('3 Oct 2026', NOW).date, '2026-10-03');
  assert.equal(findDate('Oct 3, 2026', NOW).date, '2026-10-03');
});
test('date: rejects future, impossible and ancient dates', () => {
  assert.equal(findDate('31/02/2026', NOW).date, null);
  assert.equal(findDate('01/01/2030', NOW).date, null);
  assert.equal(findDate('01/01/2010', NOW).date, null);
  assert.equal(findDate('no date here', NOW).date, null);
});
test('full receipt parse: fuel with litres', () => {
  const t = `TEXACO NEWPORT\nDate: 02/10/2026\nUnleaded 45.20 L\nTOTAL 9,040.00`;
  const r = parseReceiptText(t, NOW);
  assert.equal(r.category, 'fuel'); assert.equal(r.amount_cents, 904000);
  assert.equal(r.date, '2026-10-02'); assert.equal(r.litres, 45.2); assert.match(r.vendor, /TEXACO/);
});
test('categories', () => {
  assert.equal(guessCategory('Highway 2000 toll plaza'), 'toll');
  assert.equal(guessCategory('tyre repair puncture'), 'tyres');
  assert.equal(guessCategory('Juici Patties'), 'food');
  assert.equal(guessCategory('xyzzy'), null);
});
test('litres', () => { assert.equal(findLitres('Qty 30.5 LTRS'), 30.5); assert.equal(findLitres('nothing'), null); });

test('spoken numbers', () => {
  assert.equal(wordsToNumber('twelve thousand five hundred'), 12500);
  assert.equal(wordsToNumber('two thousand'), 2000);
  assert.equal(wordsToNumber('one hundred and fifty'), 150);
  assert.equal(wordsToNumber('twenty five'), 25);
  assert.equal(wordsToNumber('forty-two'), 42);
  assert.equal(wordsToNumber('3500'), 3500);
  assert.equal(wordsToNumber('five point five'), 5.5);
  assert.equal(wordsToNumber('hello'), null);
});
test('spoken expense', () => {
  const r = parseSpokenExpense('fuel twelve thousand five hundred at petcom');
  assert.equal(r.amount_cents, 1250000); assert.equal(r.category, 'fuel');
  const q = parseSpokenExpense('toll 700');
  assert.equal(q.amount_cents, 70000); assert.equal(q.category, 'toll');
  assert.equal(parseSpokenExpense('just chatting').amount_cents, null);
});
