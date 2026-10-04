import { h, icon, clear, uuid } from '../util.js';
import * as store from '../store.js';
import { route, go } from '../router.js';
import { S } from '../session.js';
import { parseMoney, fmtDateTime, toLocalInput, fromLocalInput, plural } from '../format.js';
import { loadFinance, sumCents } from '../calc.js';
import { field, textInput, selectInput, segmented, toast, confirmDialog, empty, banner, pill, kv } from '../ui.js';
import { live, money, cur, loadName } from './common.js';
import { mapsLink, wazeLink } from '../geo.js';

export const STATUS = {
  booked: { label: 'Booked', kind: 'info', step: 1 }, picked_up: { label: 'Picked up', kind: 'warn', step: 2 },
  in_transit: { label: 'On the road', kind: 'warn', step: 3 }, delivered: { label: 'Delivered', kind: 'ok', step: 4 },
  reconciled: { label: 'Settled', kind: 'ok', step: 5 }, cancelled: { label: 'Cancelled', kind: 'bad', step: 0 },
};
export const UNITS = ['pieces', 'bags', 'boxes', 'crates', 'pallets', 'drums', 'bundles', 'kg', 'litres', 'tonnes'];
const DONE = new Set(['delivered', 'reconciled', 'cancelled']);

export const driverName = (uid) => {
  if (uid === store.userId()) return 'Me';
  for (const list of Object.values(S.rosters || {})) { const m = list.find((x) => x.user_id === uid); if (m) return m.display_name; }
  return 'Driver';
};
export const deliveryFor = (loadId) => live('deliveries').find((d) => d.load_id === loadId) || null;

route('/loads', (ctx) => {
  ctx.header({ title: 'Loads', actions: [{ icon: 'plus', label: 'New load', href: '#/load/new/edit' }] });
  let tab = ctx.query.tab === 'done' ? 'done' : 'active';
  const out = h('div', { class: 'stack' });
  const seg = h('div');
  ctx.root.append(h('a', { class: 'btn primary', href: '#/load/new/edit' }, icon('plus', 26), 'New load'), seg, out);
  function draw() {
    clear(seg); clear(out);
    seg.append(segmented([{ id: 'active', label: 'On the go' }, { id: 'done', label: 'Finished' }], tab, (v) => { tab = v; draw(); }, 'Show'));
    const all = live('loads').filter((l) => (tab === 'done') === DONE.has(l.status)).sort((a, b) => (tab === 'done' ? (b.updated_at || '').localeCompare(a.updated_at || '') : (a.pickup_at || a.created_at || '').localeCompare(b.pickup_at || b.created_at || '')));
    if (!all.length) { out.append(empty('box', tab === 'done' ? 'Nothing finished yet' : 'No loads on the go', tab === 'done' ? 'Delivered loads will show here.' : 'Add the goods you are carrying so you can check them at the drop-off.', tab === 'active' ? h('a', { class: 'btn', href: '#/load/new/edit' }, 'Add a load') : null)); return; }
    const ul = h('ul', { class: 'list card tight' });
    for (const l of all) {
      const st = STATUS[l.status] || STATUS.booked;
      const mine = l.user_id === store.userId();
      ul.append(h('li', null, h('a', { class: 'item', href: `#/load/${l.id}` }, h('span', { class: 'ico' }, icon('box', 26)),
        h('span', { class: 'grow' }, h('div', { class: 't' }, loadName(l)),
          h('div', { class: 'muted small' }, [l.pickup_label, l.drop_label].filter(Boolean).join(' → ') || 'No places yet'),
          h('div', null, pill(st.label, st.kind), ' ', !mine ? pill('For ' + driverName(l.user_id), 'info') : null, ' ', l.created_by !== store.userId() ? pill('From dispatcher', 'info') : null)),
        l.rate_cents ? h('span', { class: 'amt' }, money(l.rate_cents, l.currency)) : null)));
    }
    out.append(ul);
  }
  draw();
  ctx.watch(['loads'], draw);
});

route('/load/:id/edit', (ctx) => {
  const isNew = ctx.params.id === 'new';
  const l0 = isNew ? {} : store.find('loads', ctx.params.id);
  ctx.header({ title: isNew ? 'New load' : 'Edit load', back: isNew ? '/loads' : `/load/${ctx.params.id}` });
  ctx.tab = 'loads';
  if (!l0) { ctx.root.append(empty('alert', 'Not found', null, h('a', { class: 'btn', href: '#/loads' }, 'Back to loads'))); return; }
  const currency = l0.currency || cur();
  const ref = textInput({ id: 'ref', maxlength: 60, value: l0.reference || '', placeholder: 'Order or waybill number' });
  const customer = textInput({ id: 'cust', maxlength: 100, value: l0.customer || '', placeholder: 'Who is it for?' });
  const desc = textInput({ id: 'desc', maxlength: 500, value: l0.description || '', placeholder: 'What are you carrying?' });
  const weight = h('input', { id: 'wt', inputmode: 'decimal', autocomplete: 'off', value: l0.weight_kg ?? '', placeholder: 'kg (optional)' });
  const pLabel = textInput({ id: 'pl', maxlength: 200, value: l0.pickup_label || '', placeholder: 'Pick up from' });
  const pAt = h('input', { type: 'datetime-local', id: 'pa', value: l0.pickup_at ? toLocalInput(l0.pickup_at) : '' });
  const dLabel = textInput({ id: 'dl', maxlength: 200, value: l0.drop_label || '', placeholder: 'Deliver to' });
  const dAt = h('input', { type: 'datetime-local', id: 'da', value: l0.drop_at ? toLocalInput(l0.drop_at) : '' });
  const rate = h('input', { id: 'rate', inputmode: 'decimal', autocomplete: 'off', value: l0.rate_cents ? String(l0.rate_cents / 100) : '', placeholder: '0' });
  const notes = h('textarea', { id: 'notes', maxlength: 1000, rows: 3 }, l0.notes || '');
  const items = (l0.items || []).map((i) => ({ ...i }));
  const itemsBox = h('div', { class: 'stack' });
  const drivers = (S.crews.some((c) => c.role === 'owner' || c.role === 'admin') ? Object.values(S.rosters || {}).flat().filter((m) => m.role === 'driver') : []);
  const assignSel = drivers.length ? selectInput([{ value: store.userId(), label: 'Me' }, ...drivers.map((d) => ({ value: d.user_id, label: d.display_name }))], l0.user_id || store.userId(), { id: 'asg' }) : null;
  const canAssign = !!assignSel && (isNew || l0.created_by === store.userId());

  function drawItems() {
    clear(itemsBox);
    items.forEach((it, i) => {
      const name = textInput({ maxlength: 60, value: it.name || '', placeholder: 'Item (e.g. rice)', 'aria-label': `Item ${i + 1} name` });
      const qty = h('input', { inputmode: 'decimal', value: it.qty ?? '', placeholder: 'How many', 'aria-label': `Item ${i + 1} amount` });
      const unit = selectInput(UNITS.map((u) => ({ value: u, label: u })), it.unit || 'pieces', { 'aria-label': `Item ${i + 1} unit` });
      name.addEventListener('input', () => { it.name = name.value; }); qty.addEventListener('input', () => { it.qty = qty.value; }); unit.addEventListener('change', () => { it.unit = unit.value; });
      itemsBox.append(h('div', { class: 'card stack' }, name, h('div', { class: 'input-row' }, qty, unit),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { items.splice(i, 1); drawItems(); } }, icon('trash', 20), 'Remove')));
    });
    if (items.length < 100) itemsBox.append(h('button', { class: 'btn', type: 'button', onclick: () => { items.push({ name: '', qty: '', unit: 'pieces' }); drawItems(); itemsBox.querySelectorAll('input[type=text],input:not([type])')[items.length * 1 - 1]?.focus?.(); } }, icon('plus', 24), 'Add an item'));
  }
  drawItems();

  const save = h('button', { class: 'btn primary', type: 'submit' }, icon('check', 26), 'Save load');
  ctx.root.append(h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    if (![ref.value, customer.value, desc.value, pLabel.value, dLabel.value].some((v) => v.trim()) && !items.some((i) => (i.name || '').trim())) { toast('Add at least a name, a place or an item.', { bad: true }); ref.focus(); return; }
    let rate_cents = 0;
    if (rate.value.trim()) { rate_cents = parseMoney(rate.value); if (rate_cents == null) { toast('Check the rate. Use numbers only.', { bad: true }); rate.focus(); return; } }
    let weight_kg = null;
    if (weight.value.toString().trim()) { weight_kg = Number(String(weight.value).replace(/,/g, '')); if (!(weight_kg >= 0 && weight_kg <= 1000000)) { toast('Check the weight.', { bad: true }); weight.focus(); return; } }
    const cleanItems = [];
    for (const it of items) {
      const name = (it.name || '').trim(); if (!name) continue;
      const q = Number(String(it.qty).replace(/,/g, ''));
      if (!(q >= 0 && q < 1e9) || String(it.qty).trim() === '') { toast(`How many "${name}"? Type a number.`, { bad: true }); return; }
      cleanItems.push({ name, qty: q, unit: it.unit || 'pieces' });
    }
    const pa = pAt.value ? fromLocalInput(pAt.value) : null, da = dAt.value ? fromLocalInput(dAt.value) : null;
    save.disabled = true;
    const row = { ...l0, id: l0.id || uuid(), reference: ref.value.trim(), customer: customer.value.trim(), description: desc.value.trim(), weight_kg, pickup_label: pLabel.value.trim(), pickup_at: pa ? pa.toISOString() : null,
      drop_label: dLabel.value.trim(), drop_at: da ? da.toISOString() : null, rate_cents, currency, items: cleanItems, notes: notes.value.trim(), status: l0.status || 'booked' };
    row.created_by = l0.created_by || store.userId();
    row.user_id = canAssign ? assignSel.value : (l0.user_id || store.userId());
    const saved = await store.save('loads', row);
    toast('Load saved.');
    go(`/load/${saved.id}`);
  } },
  field('Name or number', ref), field('Customer', customer), field('What is it?', desc), field('Weight (kg)', weight),
  field('Pick up from', pLabel), field('Pick up time', pAt), field('Deliver to', dLabel), field('Deliver by', dAt),
  field(`Agreed pay (${currency === 'USD' ? 'US$' : 'J$'})`, rate, { hint: 'What you or the company will be paid for this load.' }),
  h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Goods list'), h('p', { class: 'hint muted' }, 'Add each thing you carry. At the drop-off you count what arrived and it checks for anything missing.'), itemsBox),
  canAssign ? field('Give this load to', assignSel) : null,
  field('Notes', notes), save));
});

route('/load/:id', (ctx) => {
  const id = ctx.params.id;
  ctx.header({ title: 'Load', back: '/loads' });
  ctx.tab = 'loads';
  const out = h('div', { class: 'stack' });
  ctx.root.append(out);
  function draw() {
    clear(out);
    const l = store.find('loads', id);
    if (!l || l.deleted_at) { out.append(empty('alert', 'Not found', 'That load is not here any more.', h('a', { class: 'btn', href: '#/loads' }, 'Back to loads'))); return; }
    const st = STATUS[l.status] || STATUS.booked;
    const mine = l.user_id === store.userId();
    const del = deliveryFor(l.id);
    const exp = live('expenses'), inc = live('income');
    const fin = loadFinance(l.id, exp, inc, l.currency);
    out.append(h('div', { class: 'card stack' },
      h('div', { class: 'row' }, h('h2', { class: 'grow' }, loadName(l)), pill(st.label, st.kind)),
      st.step ? h('div', { class: 'stepper', role: 'img', 'aria-label': `Step ${Math.min(st.step, 4)} of 4` }, [1, 2, 3, 4].map((n) => h('span', { class: 's' + (n <= st.step ? ' on' : '') }))) : null,
      !mine ? banner('info', 'user', `This load is for ${driverName(l.user_id)}.`) : null,
      l.description ? h('p', null, l.description) : null,
      kv('Pick up', [l.pickup_label, l.pickup_at ? fmtDateTime(l.pickup_at) : ''].filter(Boolean).join(' · ') || 'Not set'),
      kv('Deliver', [l.drop_label, l.drop_at ? fmtDateTime(l.drop_at) : ''].filter(Boolean).join(' · ') || 'Not set'),
      l.weight_kg != null ? kv('Weight', `${l.weight_kg} kg`) : null,
      l.rate_cents ? kv('Agreed pay', money(l.rate_cents, l.currency)) : null,
      l.notes ? h('p', { class: 'muted' }, l.notes) : null));

    if (mine && !DONE.has(l.status)) {
      const next = { booked: ['I picked it up', 'picked_up', 'truck'], picked_up: ['I am on the road', 'in_transit', 'road'], in_transit: null }[l.status];
      const row = h('div', { class: 'btn-row' });
      if (next) row.append(h('button', { class: 'btn primary', type: 'button', onclick: async () => { await store.save('loads', { ...l, status: next[1] }); toast(`Marked: ${STATUS[next[1]].label}`); } }, icon(next[2], 26), next[0]));
      row.append(h('a', { class: 'btn ' + (next ? '' : 'primary'), href: `#/deliver/${l.id}` }, icon('check', 26), 'Deliver this load'));
      out.append(row);
    }
    if (l.drop_label || l.pickup_label) {
      const dest = l.status === 'booked' ? l.pickup_label : l.drop_label || l.pickup_label;
      out.append(h('div', { class: 'card stack' }, h('h3', null, 'Directions'), h('div', { class: 'btn-row two' },
        h('a', { class: 'btn', href: mapsLink({ origin: l.pickup_label, destination: dest }), target: '_blank', rel: 'noopener' }, icon('map', 24), 'Google Maps'),
        h('a', { class: 'btn', href: wazeLink(dest), target: '_blank', rel: 'noopener' }, icon('road', 24), 'Waze')),
        h('a', { class: 'btn ghost', href: `#/trips?load=${l.id}` }, icon('gps', 24), 'Start a trip for this load')));
    }
    if ((l.items || []).length) {
      out.append(h('div', { class: 'card' }, h('h3', null, `Goods (${plural(l.items.length, 'item')})`),
        h('ul', { class: 'list' }, l.items.map((i) => h('li', { class: 'kv' }, h('span', null, i.name), h('b', null, `${i.qty} ${i.unit}`))))));
    }
    if (del) {
      out.append(h('div', { class: 'card stack' }, h('h3', null, 'Delivery proof'),
        kv('Received by', del.receiver_name || 'Not written'), kv('When', fmtDateTime(del.delivered_at)),
        del.has_discrepancy ? banner('bad', 'alert', h('b', null, 'Some goods did not match.'), del.discrepancy_note ? h('p', null, del.discrepancy_note) : null) : banner('ok', 'check', 'Everything matched.'),
        h('a', { class: 'btn', href: `#/proof/${l.id}` }, icon('shield', 24), 'See proof')));
    }
    // money for this load
    const outstanding = l.rate_cents ? l.rate_cents - sumCents(inc.filter((i) => i.load_id === l.id && (i.kind === 'pay' || i.kind === 'advance')), l.currency) : 0;
    out.append(h('div', { class: 'card stack' }, h('h3', null, 'Money for this load'),
      kv('Received', money(fin.income, l.currency)), kv('Spent', money(fin.expenses, l.currency)), kv('Left over', money(fin.net, l.currency), fin.net < 0 ? 'neg' : 'pos'),
      l.rate_cents ? kv('Still to be paid', money(Math.max(0, outstanding), l.currency), outstanding > 0 ? 'neg' : 'pos') : null,
      h('div', { class: 'btn-row two' }, h('a', { class: 'btn', href: `#/expense/new?load=${l.id}` }, icon('plus', 22), 'Expense'), h('a', { class: 'btn', href: `#/income/new?load=${l.id}` }, icon('plus', 22), 'Money in'))));
    if (l.status === 'delivered' && mine) {
      out.append(h('div', { class: 'card stack' }, h('h3', null, 'Settle up'), h('p', { class: 'muted' }, outstanding > 0 ? `You are still owed ${money(outstanding, l.currency)}. Settle when it is paid.` : 'Goods checked and money is in.'),
        h('button', { class: 'btn green', type: 'button', onclick: async () => {
          if (outstanding > 0 && !(await confirmDialog({ title: 'Mark as settled?', body: `${money(outstanding, l.currency)} is still unpaid.`, yes: 'Yes, settled', no: 'Not yet' }))) return;
          await store.save('loads', { ...l, status: 'reconciled' }); toast('Load settled.');
        } }, icon('check', 24), 'Mark as settled')));
    }
    const actions = h('div', { class: 'btn-row' }, h('a', { class: 'btn', href: `#/load/${l.id}/edit` }, icon('edit', 24), 'Edit load'));
    if (!DONE.has(l.status) && (mine || l.created_by === store.userId())) actions.append(h('button', { class: 'btn ghost', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Cancel this load?', body: 'It moves to Finished as Cancelled.', yes: 'Yes, cancel it', no: 'No', danger: true })) { await store.save('loads', { ...l, status: 'cancelled' }); } } }, 'Cancel this load'));
    if (l.created_by === store.userId()) actions.append(h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete this load?', body: 'Expenses linked to it stay, but will not be tied to a load.', yes: 'Yes, delete', no: 'No, keep it', danger: true })) { await store.remove('loads', l.id); toast('Load deleted.'); go('/loads'); } } }, icon('trash', 24), 'Delete load'));
    out.append(actions);
  }
  draw();
  ctx.watch(['loads', 'expenses', 'income', 'deliveries'], draw);
});
