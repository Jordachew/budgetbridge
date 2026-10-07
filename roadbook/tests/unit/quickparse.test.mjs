import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickReminder as p } from '../../src/pages/reminders/quickParse.js';

const NOW = new Date(2026, 9, 7, 10, 30); // Wed 7 Oct 2026, 10:30
const ymd = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const hm = (d) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

test('day and month', () => {
  const r = p('Renew insurance on 1 Dec', NOW);
  assert.equal(r.title, 'Renew insurance'); assert.equal(ymd(r.due), '2026-12-1'); assert.equal(hm(r.due), '9:00');
  assert.equal(ymd(p('pay tax Dec 1st', NOW).due), '2026-12-1');
  assert.equal(ymd(p('licence 3 march', NOW).due), '2027-3-3'); // already past this year -> next year
  assert.equal(ymd(p('inspection 14 Jan 2028', NOW).due), '2028-1-14');
});
test('relative words', () => {
  assert.equal(ymd(p('Call Wisynco tomorrow', NOW).due), '2026-10-8');
  assert.equal(p('Call Wisynco tomorrow', NOW).title, 'Call Wisynco');
  assert.equal(ymd(p('wash truck next week', NOW).due), '2026-10-14');
  assert.equal(ymd(p('service in 3 days', NOW).due), '2026-10-10');
  assert.equal(ymd(p('renew in 2 months', NOW).due), '2026-12-7');
  assert.equal(ymd(p('bank run on friday', NOW).due), '2026-10-9');
  assert.equal(ymd(p('bank run next wednesday', NOW).due), '2026-10-14');
});
test('times', () => {
  const r = p('Pick up parts tomorrow at 3pm', NOW);
  assert.equal(r.title, 'Pick up parts'); assert.equal(hm(r.due), '15:00'); assert.equal(r.hasTime, true);
  assert.equal(hm(p('meeting 5 Nov 14:30', NOW).due), '14:30');
  assert.equal(hm(p('call dad tonight', NOW).due), '20:00');
});
test('today without a time lands later today', () => {
  assert.equal(hm(p('fuel up today', NOW).due), '17:00');
});
test('no date words', () => {
  const r = p('Buy wipers', NOW);
  assert.equal(r.title, 'Buy wipers'); assert.equal(r.due, null);
  assert.equal(p('', NOW).title, '');
});
test('numbers in titles are not dates', () => {
  const r = p('Check 2 tyres tomorrow', NOW);
  assert.equal(r.title, 'Check 2 tyres'); assert.equal(ymd(r.due), '2026-10-8');
  assert.equal(ymd(p('pay 15/11', NOW).due), '2026-11-15');
});
