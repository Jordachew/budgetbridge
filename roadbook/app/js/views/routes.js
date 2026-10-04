import { h, icon, clear, uuid } from '../util.js';
import * as store from '../store.js';
import { route, go } from '../router.js';
import { fmtDateTime, toLocalInput, fromLocalInput, parseDistance } from '../format.js';
import { field, textInput, selectInput, toast, confirmDialog, empty } from '../ui.js';
import { live, loadName, activeLoads, micButton } from './common.js';
import { mapsLink, wazeLink } from '../geo.js';
import { prefs } from '../prefs.js';

route('/routes', (ctx) => {
  ctx.header({ title: 'Routes', back: '/', actions: [{ icon: 'plus', label: 'Plan a route', href: '#/route/new' }] });
  ctx.tab = 'home';
  const to = textInput({ id: 'qd', maxlength: 200, placeholder: 'Where to? (town, address or place)' });
  const out = h('div', { class: 'stack' });
  ctx.root.append(
    h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); if (!to.value.trim()) { toast('Type where you are going.', { bad: true }); to.focus(); return; } window.open(mapsLink({ destination: to.value.trim() }), '_blank', 'noopener'); } },
      h('h2', null, 'Quick directions'), h('div', { class: 'input-row' }, field('Where to?', to), h('div', { style: { alignSelf: 'end' } }, micButton((t) => { to.value = t; }, 'Say where you are going'))),
      h('div', { class: 'btn-row two' }, h('button', { class: 'btn primary', type: 'submit' }, icon('map', 24), 'Google Maps'),
        h('button', { class: 'btn', type: 'button', onclick: () => { if (!to.value.trim()) { toast('Type where you are going.', { bad: true }); return; } window.open(wazeLink(to.value.trim()), '_blank', 'noopener'); } }, icon('road', 24), 'Waze'))),
    h('a', { class: 'btn', href: '#/route/new' }, icon('plus', 24), 'Plan and save a route'), out);
  function draw() {
    clear(out);
    const all = live('route_plans').sort((a, b) => (a.planned_at || 'z').localeCompare(b.planned_at || 'z'));
    if (!all.length) { out.append(empty('map', 'No saved routes', 'Plan a route with stops, a date and notes. Open it in Maps when you set off.')); return; }
    const ul = h('ul', { class: 'list card tight' });
    for (const r of all) {
      const sub = [r.origin && r.destination ? `${r.origin} → ${r.destination}` : r.destination, r.planned_at ? fmtDateTime(r.planned_at) : ''].filter(Boolean).join(' · ');
      ul.append(h('li', null, h('a', { class: 'item', href: `#/route/${r.id}` }, h('span', { class: 'ico' }, icon('map', 26)),
        h('span', { class: 'grow' }, h('div', { class: 't' }, r.title || `${r.origin} to ${r.destination}`), h('div', { class: 'muted small' }, sub)))));
    }
    out.append(ul);
  }
  draw(); ctx.watch(['route_plans'], draw);
});

route('/route/:id', (ctx) => {
  const isNew = ctx.params.id === 'new';
  const r0 = isNew ? {} : store.find('route_plans', ctx.params.id);
  ctx.header({ title: isNew ? 'Plan a route' : 'Route', back: '/routes' });
  ctx.tab = 'home';
  if (!r0) { ctx.root.append(empty('alert', 'Not found', null, h('a', { class: 'btn', href: '#/routes' }, 'Back'))); return; }
  const title = textInput({ id: 'tt', maxlength: 100, value: r0.title || '', placeholder: 'Name (optional)' });
  const origin = textInput({ id: 'to', maxlength: 200, value: r0.origin || '', placeholder: 'Start (leave empty to use where you are)' });
  const dest = textInput({ id: 'td', maxlength: 200, value: r0.destination || '', placeholder: 'Destination' });
  const stops = Array.isArray(r0.stops) ? r0.stops.map(String) : [];
  const stopsBox = h('div', { class: 'stack' });
  const when = h('input', { type: 'datetime-local', id: 'tw', value: r0.planned_at ? toLocalInput(r0.planned_at) : '' });
  const km = h('input', { id: 'tk', inputmode: 'decimal', autocomplete: 'off', value: r0.est_distance_m ? String(Math.round(r0.est_distance_m / (prefs().unit === 'mi' ? 1609.344 : 1000))) : '', placeholder: 'optional' });
  const notes = h('textarea', { id: 'tn', maxlength: 1000, rows: 3 }, r0.notes || '');
  const loadSel = selectInput([{ value: '', label: 'No load' }, ...activeLoads().map((l) => ({ value: l.id, label: loadName(l) }))], r0.load_id || '', { id: 'tl' });
  function drawStops() {
    clear(stopsBox);
    stops.forEach((s, i) => { const inp = textInput({ maxlength: 200, value: s, 'aria-label': `Stop ${i + 1}`, placeholder: `Stop ${i + 1}` }); inp.addEventListener('input', () => { stops[i] = inp.value; });
      stopsBox.append(h('div', { class: 'input-row' }, inp, h('button', { class: 'mic-btn', type: 'button', 'aria-label': `Remove stop ${i + 1}`, onclick: () => { stops.splice(i, 1); drawStops(); } }, icon('x', 24)))); });
    if (stops.length < 8) stopsBox.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => { stops.push(''); drawStops(); } }, icon('plus', 22), 'Add a stop'));
  }
  drawStops();
  const clean = () => stops.map((s) => s.trim()).filter(Boolean);
  const links = h('div', { class: 'btn-row two' },
    h('button', { class: 'btn', type: 'button', onclick: () => { if (!dest.value.trim()) { toast('Add a destination first.', { bad: true }); return; } window.open(mapsLink({ origin: origin.value.trim(), destination: dest.value.trim(), stops: clean() }), '_blank', 'noopener'); } }, icon('map', 24), 'Open in Maps'),
    h('button', { class: 'btn', type: 'button', onclick: () => { if (!dest.value.trim()) { toast('Add a destination first.', { bad: true }); return; } window.open(wazeLink(dest.value.trim()), '_blank', 'noopener'); } }, icon('road', 24), 'Open in Waze'));
  const save = h('button', { class: 'btn primary', type: 'submit' }, icon('check', 26), 'Save route');
  ctx.root.append(h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (!dest.value.trim()) { toast('Add a destination.', { bad: true }); dest.focus(); return; }
    let est = null; if (km.value.trim()) { est = parseDistance(km.value, prefs().unit); if (est == null) { toast('Check the distance.', { bad: true }); return; } }
    const pa = when.value ? fromLocalInput(when.value) : null;
    save.disabled = true;
    await store.save('route_plans', { ...r0, id: r0.id || uuid(), load_id: loadSel.value || null, title: title.value.trim(), origin: origin.value.trim(), destination: dest.value.trim(), stops: clean(), planned_at: pa ? pa.toISOString() : null, est_distance_m: est, notes: notes.value.trim() });
    toast('Route saved.'); go('/routes');
  } }, field('Name', title), field('From', origin), field('To', dest), h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Stops on the way'), stopsBox), field('When are you going?', when),
  field(`Distance, if you know it (${prefs().unit === 'mi' ? 'miles' : 'km'})`, km), field('For which load?', loadSel), field('Notes', notes), links, save,
  !isNew ? h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
    const l = await store.save('loads', { id: uuid(), reference: '', customer: '', description: r0.title || '', pickup_label: r0.origin || '', drop_label: r0.destination, status: 'booked', items: [], rate_cents: 0, currency: store.getProfile().currency || 'JMD', created_by: store.userId(), pickup_at: r0.planned_at || null });
    toast('Load created from this route.'); go(`/load/${l.id}`);
  } }, icon('box', 24), 'Make a load from this route'),
  h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete this route?', yes: 'Yes, delete', no: 'No', danger: true })) { await store.remove('route_plans', r0.id); toast('Deleted.'); go('/routes'); } } }, icon('trash', 24), 'Delete route')) : null));
});
