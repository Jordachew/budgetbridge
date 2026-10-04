import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney, parseMoney, fmtDistance, parseDistance, fmtDuration, plural, clip, initials } from '../../app/js/format.js';
import { periodRange, addInterval, addDays } from '../../app/js/dates.js';
import { haversine, bearing, compass, judgeFix, thinPath, pathLength, mapsLink, wazeLink } from '../../app/js/geo.js';
import { csvCell, toCSV } from '../../app/js/csv.js';
import { buildICS, icsEscape, fold } from '../../app/js/ics.js';
import { sha256Hex, canonical, proofHash, verifyProof } from '../../app/js/hash.js';
import { completeReminder, reminderState, nextDueDate, snoozePatch, fireTime } from '../../app/js/reminders-logic.js';

test('money format and parse', () => {
  assert.equal(fmtMoney(1245000), 'J$12,450');
  assert.equal(fmtMoney(1245050), 'J$12,450.50');
  assert.equal(fmtMoney(-5000, 'USD'), '-US$50');
  assert.equal(fmtMoney(0), 'J$0');
  assert.equal(parseMoney('12,450.50'), 1245050);
  assert.equal(parseMoney('J$ 700'), 70000);
  assert.equal(parseMoney('1.005'), 101);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('-5'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('99999999999'), null);
  assert.equal(parseMoney('1e5'), null);
});
test('distance', () => {
  assert.equal(parseDistance('100', 'km'), 100000);
  assert.ok(Math.abs(parseDistance('100', 'mi') - 160934.4) < 1);
  assert.equal(parseDistance('x'), null);
  assert.match(fmtDistance(12500), /12\.5|12,5|13/);
});
test('misc format', () => {
  assert.equal(plural(1, 'load'), '1 load'); assert.equal(plural(2, 'load'), '2 loads');
  assert.equal(clip('abcdef', 4), 'abc…'); assert.equal(initials('Jordache Wilson'), 'JW');
  assert.ok(fmtDuration(3600000 * 2.5).length > 0);
});
test('dates: month ends clamp, week starts Monday', () => {
  assert.equal(addInterval(new Date(2026, 0, 31), 'monthly').getDate(), 28);
  assert.equal(addInterval(new Date(2028, 0, 31), 'monthly').getDate(), 29);
  assert.equal(addInterval(new Date(2028, 1, 29), 'yearly').getDate(), 28);
  assert.equal(addInterval(new Date(2026, 0, 1), 'weekly').getDate(), 8);
  const r = periodRange('week', new Date(2026, 9, 3)); // Saturday 3 Oct 2026
  assert.equal(r.from.getDay(), 1); assert.equal(r.from.getDate(), 28);
  const m = periodRange('month', new Date(2026, 9, 3));
  assert.equal(m.from.getDate(), 1); assert.equal(m.to.getMonth(), 10);
  assert.equal(addDays(new Date(2026, 11, 31), 1).getFullYear(), 2027);
});
test('geo', () => {
  const a = { lat: 17.9712, lng: -76.7936 }, b = { lat: 18.0179, lng: -76.8099 };
  const d = haversine(a, b);
  assert.ok(d > 5000 && d < 5600, String(d));
  assert.equal(compass(bearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })), 'north');
  assert.equal(haversine(a, a), 0);
});
test('gps fix judging', () => {
  const p = { lat: 18, lng: -77, accuracy: 10, t: 0 };
  assert.equal(judgeFix(null, { lat: 18, lng: -77, accuracy: 10, t: 0 }).reason, 'first');
  assert.equal(judgeFix(p, { lat: 18, lng: -77, accuracy: 200, t: 5000 }).reason, 'weak');
  assert.equal(judgeFix(p, { lat: 18.5, lng: -77, accuracy: 10, t: 5000 }).reason, 'jump');
  assert.equal(judgeFix(p, { lat: 18.00001, lng: -77, accuracy: 10, t: 5000 }).reason, 'still');
  const ok = judgeFix(p, { lat: 18.001, lng: -77, accuracy: 10, t: 10000 });
  assert.equal(ok.ok, true); assert.ok(ok.d > 100 && ok.d < 120);
  assert.equal(judgeFix(p, { lat: NaN, lng: 0, accuracy: 1, t: 1 }).ok, false);
  assert.equal(judgeFix(p, { lat: 18, lng: -77, accuracy: 10, t: 0 }).reason, 'time');
});
test('path thinning keeps ends and respects cap', () => {
  const pts = Array.from({ length: 5000 }, (_, i) => [18 + i * 0.0005, -77]);
  const t = thinPath(pts, 30, 2500);
  assert.ok(t.length <= 2500); assert.deepEqual(t[0], pts[0]); assert.deepEqual(t.at(-1), pts.at(-1));
  assert.ok(pathLength(t) > 200000);
});
test('map links are url-encoded', () => {
  const l = mapsLink({ origin: 'A & B', destination: 'Montego Bay' });
  assert.ok(l.startsWith('https://')); assert.ok(!l.includes('A & B'));
  assert.ok(wazeLink('Kingston').startsWith('https://'));
});
test('csv: injection-safe and quoted', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1"); assert.equal(csvCell('@x'), "'@x");
  assert.equal(csvCell('a,b'), '"a,b"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(-5), '-5'); assert.equal(csvCell(null), '');
  assert.equal(toCSV([{ a: 1, b: 'x' }], [{ label: 'A', get: (r) => r.a }, { label: 'B', get: (r) => r.b }]), 'A,B\r\n1,x\r\n');
});
test('ics', () => {
  const s = buildICS([{ uid: 'u1', title: 'Oil, change; now', start: '2026-10-05T14:00:00Z', repeat: 'monthly', alarmMinutes: [60, 10] }], new Date('2026-10-03T00:00:00Z'));
  assert.match(s, /^BEGIN:VCALENDAR\r\n/); assert.match(s, /DTSTART:20261005T140000Z/);
  assert.match(s, /SUMMARY:Oil\\, change\\; now/); assert.match(s, /RRULE:FREQ=MONTHLY/);
  assert.equal((s.match(/BEGIN:VALARM/g) || []).length, 2); assert.match(s, /END:VCALENDAR\r\n$/);
  assert.equal(icsEscape('a\nb'), 'a\\nb');
  const long = fold('X'.repeat(200));
  assert.ok(long.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
  assert.equal(long.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), 'X'.repeat(200));
});
test('hash and proof', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
  const d = { load_id: 'L', delivered_at: '2026-10-03T10:00:00Z', lat: 18, lng: -77, accuracy_m: 5, receiver_name: 'Ann', items: [{ n: 'rice', q: 10 }], has_discrepancy: false, discrepancy_note: null };
  const sig = new Uint8Array([1, 2, 3]), photo = new Uint8Array([9, 9]);
  d.proof_hash = await proofHash(d, sig, photo);
  assert.match(d.proof_hash, /^[0-9a-f]{64}$/);
  assert.equal(await verifyProof(d, sig, photo), true);
  assert.equal(await verifyProof({ ...d, receiver_name: 'Bob' }, sig, photo), false);
  assert.equal(await verifyProof(d, new Uint8Array([1, 2, 4]), photo), false);
  assert.equal(await verifyProof({ ...d, proof_hash: null }, sig, photo), false);
  assert.equal(await verifyProof({ ...d, delivered_at: '2026-10-03T10:00:00+00:00' }, sig, photo), true, 'same instant, database format');
});
test('reminders', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  const r = { kind: 'date', due_at: '2026-10-03T13:00:00Z', lead_minutes: 120 };
  assert.equal(reminderState(r, { now }), 'soon');
  assert.equal(reminderState({ ...r, due_at: '2026-10-03T11:30:00Z' }, { now }), 'due');
  assert.equal(reminderState({ ...r, due_at: '2026-10-03T08:00:00Z' }, { now }), 'overdue');
  assert.equal(reminderState({ ...r, due_at: '2026-12-01T00:00:00Z', lead_minutes: 0 }, { now }), 'later');
  assert.equal(reminderState({ ...r, snoozed_until: '2026-10-03T12:30:00Z' }, { now }), 'snoozed');
  assert.equal(reminderState({ ...r, done_at: now.toISOString() }, { now }), 'done');
  const km = { kind: 'km', due_odometer_m: 100000000, repeat_every_m: 8000000 };
  assert.equal(reminderState(km, { now, odometer_m: 99700000 }), 'soon');
  assert.equal(reminderState(km, { now, odometer_m: 100500000 }), 'overdue');
  assert.equal(reminderState(km, { now, odometer_m: null }), 'unknown');
  assert.equal(completeReminder(km, { now, odometer_m: 100200000 }).due_odometer_m, 108000000);
  assert.equal(completeReminder(km, { now, odometer_m: 120000000 }).due_odometer_m, 128000000);
  const rep = { kind: 'date', due_at: '2026-08-31T09:00:00Z', repeat: 'monthly' };
  assert.ok(new Date(completeReminder(rep, { now }).due_at) > now);
  assert.ok(completeReminder({ kind: 'date', due_at: '2026-10-01T00:00:00Z', repeat: 'none' }, { now }).done_at);
  assert.equal(nextDueDate('2026-10-01T00:00:00Z', 'none', now), null);
  assert.ok(new Date(snoozePatch(10, now).snoozed_until) - now === 600000);
  assert.equal(fireTime({ kind: 'date', due_at: '2026-10-03T13:00:00Z', lead_minutes: 60 }), new Date('2026-10-03T12:00:00Z').getTime());
  assert.equal(fireTime({ kind: 'km' }), null);
});
import { fromLocalInput, toLocalInput } from '../../app/js/format.js';
test('local date input round-trips in Jamaica time', () => {
  const d = fromLocalInput('2026-10-03T14:30');
  assert.ok(d instanceof Date); assert.equal(d.toISOString(), '2026-10-03T19:30:00.000Z');   // UTC-5, no daylight saving
  assert.equal(toLocalInput(d), '2026-10-03T14:30'); assert.equal(fromLocalInput(''), null); assert.equal(fromLocalInput('nope'), null);
});
