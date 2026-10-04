import { h, icon, clear, uuid } from '../util.js';
import * as store from '../store.js';
import { route, go } from '../router.js';
import { S } from '../session.js';
import { fmtDistance, fmtDuration, fmtDate, fmtTime, parseDistance, fmtClock, toLocalInput, fromLocalInput, speedText, plural } from '../format.js';
import { within, sumDistance } from '../calc.js';
import { field, textInput, selectInput, toast, confirmDialog, empty, banner, haptic } from '../ui.js';
import { periodBar, live, dist, unitName, activeLoads, loadName, odometerNow } from './common.js';
import { prefs } from '../prefs.js';
import { speak } from '../voice.js';
import { tripStartSpeech, tripEndSpeech } from '../phrases.js';
import { mapsLink } from '../geo.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export function routeSketch(path) {
  const pts = (path || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const w = Math.max(1e-6, (maxLng - minLng) * kx), hh = Math.max(1e-6, maxLat - minLat);
  const W = 300, H = 150, pad = 14, k = Math.min((W - 2 * pad) / w, (H - 2 * pad) / hh);
  const ox = (W - w * k) / 2, oy = (H - hh * k) / 2;
  const xy = (p) => [ox + (p[1] - minLng) * kx * k, H - (oy + (p[0] - minLat) * k)];
  const step = Math.ceil(pts.length / 300);
  const sample = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(xy);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'route-svg'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Sketch of the route driven');
  const path2 = document.createElementNS(SVG_NS, 'path');
  path2.setAttribute('d', 'M' + sample.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join('L'));
  svg.append(path2);
  for (const p of [sample[0], sample[sample.length - 1]]) { const c = document.createElementNS(SVG_NS, 'circle'); c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 6); svg.append(c); }
  return svg;
}

function saveTripFromTracker(sum, extra = {}) {
  return store.save('trips', {
    id: sum.id, load_id: sum.load_id || null, started_at: sum.started_at, ended_at: sum.ended_at, distance_m: sum.distance_m,
    method: 'gps', origin_label: sum.origin_label || '', dest_label: sum.dest_label || '', note: '', path: sum.path.length >= 2 ? sum.path : [], ...extra,
  });
}

export async function finishTrip() {
  if (!S.tracker?.active()) return;
  const sum = S.tracker.stop();
  await store.getDb().setMeta('activeTrip', null);
  const trip = await saveTripFromTracker(sum);
  speak(tripEndSpeech(fmtDistance(trip.distance_m, prefs().unit === 'mi' ? 'mi' : 'km')));
  store.emit(['trip-live']);
  haptic(40);
  go(`/trip/${trip.id}?done=1`);
}

route('/trips', (ctx) => {
  ctx.header({ title: 'Trips', actions: [] });
  const live1 = h('div', { class: 'stack' });
  const rest = h('div', { class: 'stack' });
  ctx.root.append(live1, rest);
  let range = null;
  let clockTimer = null;

  const originIn = textInput({ id: 'orig', maxlength: 80, placeholder: 'From (optional)' });
  const destIn = textInput({ id: 'dest', maxlength: 80, placeholder: 'To (optional)' });
  const loads = activeLoads();
  const loadSel = selectInput([{ value: '', label: 'No particular load' }, ...loads.map((l) => ({ value: l.id, label: loadName(l) }))], ctx.query.load || '', { id: 'tload' });

  function drawLive() {
    clear(live1);
    clearInterval(clockTimer);
    const t = S.tracker?.state();
    if (t) {
      const dur = h('div', { class: 'u', 'aria-hidden': 'true' });
      const tick = () => { dur.textContent = fmtClock(Date.now() - new Date(t.started_at).getTime()); };
      tick(); clockTimer = setInterval(tick, 1000);
      const q = { good: ['GPS is good', 'ok'], weak: ['GPS signal is weak. Try the windscreen side.', 'warn'], searching: ['Finding your position…', 'warn'], denied: ['Location is blocked. Turn it on in phone settings.', 'bad'], none: ['No GPS right now', 'warn'], unsupported: ['This phone cannot track GPS', 'bad'] }[t.quality] || ['', ''];
      const d = fmtDistance(t.distance_m, prefs().unit);
      live1.append(
        h('div', { class: 'trip-live', role: 'timer', 'aria-label': 'Trip in progress' },
          h('div', { class: 'gps-q' }, icon('gps', 22), 'Trip running'),
          h('div', { class: 'big-num mono', 'aria-live': 'off' }, d),
          dur,
          h('div', null, t.speed_mps > 0.5 ? speedText(t.speed_mps, prefs().unit) : 'Not moving'),
          t.load_id && store.find('loads', t.load_id) ? h('div', { class: 'small' }, loadName(store.find('loads', t.load_id))) : null),
        banner(q[1] === 'ok' ? 'ok' : q[1] === 'bad' ? 'bad' : '', 'gps', q[0]),
        h('p', { class: 'small muted' }, 'Keep this screen open and the phone charging. Phones can stop tracking when the screen is off.'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Finish this trip?', body: `You have driven ${d} so far.`, yes: 'Yes, finish', no: 'Keep driving' })) finishTrip(); } }, icon('stop', 26), 'Finish trip'));
      return;
    }
    live1.append(h('div', { class: 'card stack' },
      h('h2', null, 'Start a trip'),
      field('Which load?', loadSel), field('From', originIn), field('To', destIn),
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        if (!navigator.geolocation) { toast('This phone cannot use GPS. Use "Add by odometer" below.', { bad: true }); return; }
        const id = uuid();
        S.tracker.start({ id, load_id: loadSel.value || null, origin_label: originIn.value.trim(), dest_label: destIn.value.trim() });
        store.getDb().setMeta('activeTrip', S.tracker.state());
        speak(tripStartSpeech());
        haptic(40);
        drawLive();
      } }, icon('play', 26), 'Start trip'),
      h('a', { class: 'btn ghost', href: '#/trip/odometer' }, icon('edit', 24), 'Add a trip by odometer')));
  }

  function drawRest() {
    if (!range) return;
    clear(rest);
    const trips = within(live('trips'), 'started_at', range).sort((a, b) => b.started_at.localeCompare(a.started_at));
    rest.append(h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Driven'), h('div', { class: 'big-num' }, dist(sumDistance(trips))), h('div', { class: 'muted' }, plural(trips.length, 'trip'))));
    if (!trips.length) { rest.append(empty('road', 'No trips yet', 'Tap Start trip when you set off. Your miles add up by themselves.')); return; }
    const ul = h('ul', { class: 'list card tight' });
    for (const t of trips) {
      const load = t.load_id ? store.find('loads', t.load_id) : null;
      ul.append(h('li', null, h('a', { class: 'item', href: `#/trip/${t.id}` }, h('span', { class: 'ico' }, icon(t.method === 'gps' ? 'gps' : 'edit', 26)),
        h('span', { class: 'grow' }, h('div', { class: 't' }, [t.origin_label, t.dest_label].filter(Boolean).join(' to ') || 'Trip'), h('div', { class: 'muted small' }, `${fmtDate(t.started_at)} · ${fmtTime(t.started_at)}${load ? ' · ' + loadName(load) : ''}`)),
        h('span', { class: 'amt' }, dist(t.distance_m)))));
    }
    rest.append(ul);
  }
  const bar = periodBar('week', (r) => { range = r; drawRest(); });
  ctx.root.insertBefore(bar, rest);
  drawLive(); drawRest();
  ctx.watch(['trips', 'loads'], drawRest);
  ctx.watch(['trip-live'], drawLive);
  ctx.onLeave(() => clearInterval(clockTimer));
});

route('/trip/:id', (ctx) => {
  const manual = ctx.params.id === 'odometer';
  const t0 = manual ? null : store.find('trips', ctx.params.id);
  ctx.header({ title: manual ? 'Trip by odometer' : 'Trip', back: '/trips' });
  ctx.tab = 'trips';
  if (!manual && !t0) { ctx.root.append(empty('alert', 'Not found', 'That trip is not here any more.', h('a', { class: 'btn', href: '#/trips' }, 'Back to trips'))); return; }

  const t = t0 || {};
  const stU = (m) => (m == null ? '' : String(Math.round((m / (prefs().unit === 'mi' ? 1609.344 : 1000)) * 10) / 10));
  const origin = textInput({ id: 'o', maxlength: 80, value: t.origin_label || '' });
  const dest = textInput({ id: 'd', maxlength: 80, value: t.dest_label || '' });
  const note = textInput({ id: 'n', maxlength: 200, value: t.note || '' });
  const distIn = h('input', { id: 'dist', inputmode: 'decimal', autocomplete: 'off', value: stU(t.distance_m) });
  const startOdo = h('input', { id: 'so', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 125400', value: manual && odometerNow() != null ? stU(odometerNow()) : '' });
  const endOdo = h('input', { id: 'eo', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 125980' });
  const when = h('input', { type: 'datetime-local', id: 'w', value: toLocalInput(t.started_at || new Date()) });
  const loadSel = selectInput([{ value: '', label: 'No particular load' }, ...activeLoads().map((l) => ({ value: l.id, label: loadName(l) })), ...(t.load_id && store.find('loads', t.load_id) && !activeLoads().some((l) => l.id === t.load_id) ? [{ value: t.load_id, label: loadName(store.find('loads', t.load_id)) }] : [])], t.load_id || '', { id: 'l' });
  const fDist = field(`Distance (${unitName()})`, distIn, manual ? {} : { hint: t.method === 'gps' ? 'Counted by GPS. You can fix it if it looks wrong.' : '' });
  const fEnd = field(`Odometer at the end (${unitName()})`, endOdo);
  const sketch = !manual && routeSketch(t.path);
  const save = h('button', { class: 'btn primary', type: 'submit' }, icon('check', 26), 'Save');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    let distance_m, start_odo = t.start_odometer_m ?? null, end_odo = t.end_odometer_m ?? null;
    if (manual) {
      const s = parseDistance(startOdo.value, prefs().unit), en = parseDistance(endOdo.value, prefs().unit);
      if (s == null) { toast('Type the odometer from when you started.', { bad: true }); startOdo.focus(); return; }
      if (en == null) { fEnd.setError('Type the odometer now.'); endOdo.focus(); return; }
      if (en <= s) { fEnd.setError('The end number must be bigger than the start number.'); endOdo.focus(); return; }
      if (en - s > 5_000_000) { fEnd.setError('That is more than 5,000 km. Check the numbers.'); endOdo.focus(); return; }
      distance_m = en - s; start_odo = s; end_odo = en;
    } else {
      distance_m = parseDistance(distIn.value, prefs().unit);
      if (distance_m == null || distance_m > 5_000_000) { fDist.setError('Type the distance as a number, like 120.'); distIn.focus(); return; }
    }
    const started = fromLocalInput(when.value);
    if (!started) { toast('Check the date and time.', { bad: true }); return; }
    save.disabled = true;
    const ended = manual ? started : new Date(t.ended_at || started);
    const patch = { load_id: loadSel.value || null, origin_label: origin.value.trim(), dest_label: dest.value.trim(), note: note.value.trim(), distance_m: Math.round(distance_m), start_odometer_m: start_odo, end_odometer_m: end_odo };
    if (manual) await store.save('trips', { id: uuid(), method: 'odometer', started_at: started.toISOString(), ended_at: ended.toISOString(), path: [], ...patch });
    else await store.save('trips', { ...t, ...patch, });
    toast('Trip saved.');
    go('/trips');
  } },
  ctx.query.done ? banner('ok', 'check', h('b', null, 'Trip finished and saved.'), h('p', null, 'Check the distance and add where you went.')) : null,
  sketch, !manual ? h('div', { class: 'card' }, h('div', { class: 'kv' }, h('span', null, 'Started'), h('b', null, `${fmtDate(t.started_at)} ${fmtTime(t.started_at)}`)), t.ended_at ? h('div', { class: 'kv' }, h('span', null, 'Ended'), h('b', null, fmtTime(t.ended_at))) : null,
    t.ended_at ? h('div', { class: 'kv' }, h('span', null, 'Time on the road'), h('b', null, fmtDuration(new Date(t.ended_at) - new Date(t.started_at)))) : null) : null,
  manual ? h('div', { class: 'stack' }, field(`Odometer at the start (${unitName()})`, startOdo), fEnd) : fDist,
  field('From', origin), field('To', dest), field('Which load', loadSel), manual ? field('When', when) : null, field('Note', note), save,
  !manual && t.method === 'gps' && t.dest_label ? h('a', { class: 'btn ghost', target: '_blank', rel: 'noopener', href: mapsLink({ origin: t.origin_label, destination: t.dest_label }) }, icon('map', 24), 'Open in Google Maps') : null,
  !manual ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (await confirmDialog({ title: 'Delete this trip?', body: 'The distance will be taken off your totals.', yes: 'Yes, delete', no: 'No, keep it', danger: true })) { await store.remove('trips', t.id); toast('Trip deleted.', { action: { label: 'Undo', run: () => store.save('trips', { ...t, deleted_at: null }) } }); go('/trips'); }
  } }, icon('trash', 24), 'Delete trip') : null);
  ctx.root.append(form);
});
