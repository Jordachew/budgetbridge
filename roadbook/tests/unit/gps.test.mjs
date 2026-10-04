import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracker } from '../../app/js/gps.js';
import { alertSpeech, spokenDistance, reminderSpeech } from '../../app/js/phrases.js';
import { fitSize } from '../../app/js/images.js';

function fakeGeo() {
  const g = { cb: null, err: null, cleared: false, watchPosition(ok, er) { g.cb = ok; g.err = er; return 7; }, clearWatch() { g.cleared = true; } };
  return g;
}
const fix = (lat, lng, t, accuracy = 8) => ({ coords: { latitude: lat, longitude: lng, accuracy, speed: null }, timestamp: t });

test('tracker counts real movement, ignores noise and bad fixes', () => {
  const geo = fakeGeo(); let t = 1_000_000; const saves = [];
  const tr = createTracker({ geo, now: () => t, wakeLock: false, checkpoint: (s) => saves.push(s) });
  assert.equal(tr.start({ id: 'trip1' }), true); assert.equal(tr.start({ id: 'again' }), false);
  geo.cb(fix(18.0, -77.0, t));                                  // first fix
  t += 10000; geo.cb(fix(18.0001, -77.0, t));                   // ~11 m, but within noise window -> still
  t += 10000; geo.cb(fix(18.001, -77.0, t));                    // ~111 m from start
  t += 10000; geo.cb(fix(18.002, -77.0, t, 300));               // weak accuracy -> ignored
  t += 10000; geo.cb(fix(19.5, -77.0, t));                      // teleport -> ignored
  t += 10000; geo.cb(fix(18.002, -77.0, t));
  const s = tr.state();
  assert.ok(s.distance_m > 215 && s.distance_m < 230, String(s.distance_m));
  assert.ok(saves.length >= 1);
  const out = tr.stop();
  assert.ok(geo.cleared); assert.equal(tr.active(), false);
  assert.equal(out.distance_m, Math.round(s.distance_m)); assert.ok(out.path.length >= 2); assert.equal(out.id, 'trip1');
});
test('tracker reports denied permission', () => {
  const geo = fakeGeo(); const seen = [];
  const tr = createTracker({ geo, wakeLock: false, onUpdate: (s) => seen.push(s?.quality) });
  tr.start({ id: 'x' }); geo.err({ code: 1 });
  assert.equal(seen.at(-1), 'denied');
});
test('tracker without GPS support says so', () => {
  const seen = [];
  const tr = createTracker({ geo: null, wakeLock: false, onUpdate: (s) => seen.push(s.quality) });
  assert.equal(tr.start({ id: 'x' }), false); assert.equal(seen[0], 'unsupported');
});
test('resume continues the distance', () => {
  const geo = fakeGeo();
  const tr = createTracker({ geo, wakeLock: false });
  tr.resume({ id: 'r', load_id: null, origin_label: '', dest_label: '', started_at: '2026-10-03T10:00:00Z', distance_m: 5000, path: [[18, -77, 1]], fixes: 3 });
  assert.equal(tr.state().distance_m, 5000);
});
test('spoken text', () => {
  assert.equal(spokenDistance(3200), '3.2 kilometres'); assert.equal(spokenDistance(1000), '1 kilometre');
  assert.equal(spokenDistance(840), '800 metres'); assert.equal(spokenDistance(40), 'very close');
  assert.equal(spokenDistance(25000), '25 kilometres'); assert.match(spokenDistance(8047, 'mi'), /5 miles/);
  const s = alertSpeech({ kind: 'flood', lat: 18.05, lng: -77, note: 'Water over the road' }, { lat: 18.0, lng: -77 });
  assert.match(s, /^Warning\. Flooding reported .*north.*Water over the road\. Take care\.$/);
  assert.equal(alertSpeech({ kind: 'weird' }, null), 'Warning. A road problem reported. Take care.');
  assert.equal(reminderSpeech({ title: 'Oil change' }, 'due in 2 hours'), 'Reminder. Oil change. due in 2 hours.');
});
test('fitSize', () => {
  assert.deepEqual(fitSize(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(fitSize(800, 600, 1600), { w: 800, h: 600 });
});

test('a parked truck with weak, jittery fixes adds no distance', async () => {
  const { judgeFix } = await import('../../app/js/geo.js');
  let prev = { lat: 18.0, lng: -77.0, accuracy: 40, t: 0 };
  let total = 0;
  const jitter = [[0.0002, 0], [0, 0.0002], [-0.00015, 0.0001], [0.0001, -0.0002]];   // roughly 20 m wobbles
  jitter.forEach(([dy, dx], i) => {
    const r = judgeFix(prev, { lat: 18.0 + dy, lng: -77.0 + dx, accuracy: 40, t: (i + 1) * 5000 });
    if (r.ok) { total += r.d; prev = { lat: 18.0 + dy, lng: -77.0 + dx, accuracy: 40, t: (i + 1) * 5000 }; }
  });
  assert.equal(total, 0);
});
