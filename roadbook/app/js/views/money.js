import { h, icon, clear, uuid } from '../util.js';
import * as store from '../store.js';
import { route, go } from '../router.js';
import { parseMoney, fmtDate, toLocalInput, fromLocalInput } from '../format.js';
import { sumCents, byCategory, within, settleUp, loadFinance, sumDistance, fuelEconomy, otherCurrencyCount } from '../calc.js';
import { periodTitle } from '../dates.js';
import { toCSV } from '../csv.js';
import { field, textInput, selectInput, segmented, toast, confirmDialog, empty, banner, kv } from '../ui.js';
import { live, money, cur, periodBar, loadName, download, shareText, dist } from './common.js';
import { categoryLabel } from '../receipt.js';
import { prefs } from '../prefs.js';

const KINDS = [{ id: 'pay', label: 'Pay' }, { id: 'advance', label: 'Advance' }, { id: 'other', label: 'Other' }];
const kindLabel = (k) => (KINDS.find((x) => x.id === k) || KINDS[2]).label;

route('/money', (ctx) => {
  ctx.header({ title: 'Money', actions: [{ icon: 'download', label: 'Export', href: '#/export' }] });
  let range = null, kind = 'month';
  const out = h('div', { class: 'stack' });
  const bar = periodBar('month', (r, k) => { range = r; kind = k; draw(); });
  ctx.root.append(h('div', { class: 'btn-row two' }, h('a', { class: 'btn primary', href: '#/expense/new' }, icon('plus', 24), 'Expense'), h('a', { class: 'btn green', href: '#/income/new' }, icon('plus', 24), 'Money in')), bar, out);

  function draw() {
    if (!range) return;
    clear(out);
    const c = cur();
    const exp = within(live('expenses'), 'spent_at', range), inc = within(live('income'), 'received_at', range), trips = within(live('trips'), 'started_at', range);
    const tin = sumCents(inc, c), tex = sumCents(exp, c), net = tin - tex;
    out.append(h('div', { class: 'tiles' },
      h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Money in'), h('div', { class: 'big-num pos mono' }, money(tin))),
      h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Spent'), h('div', { class: 'big-num neg mono' }, money(tex)))));
    out.append(h('div', { class: 'card' }, h('div', { class: 'muted' }, 'Left over'), h('div', { class: 'big-num mono ' + (net < 0 ? 'neg' : 'pos') }, money(net)),
      (otherCurrencyCount(exp, c) + otherCurrencyCount(inc, c)) ? h('p', { class: 'small muted' }, 'Records in another currency are not counted here.') : null));

    const km = sumDistance(trips);
    if (km > 0 && tex > 0) {
      const mi = prefs().unit === 'mi';
      const eco = fuelEconomy(exp);
      out.append(h('div', { class: 'card' }, kv('Distance driven', dist(km)), kv(`Cost per ${mi ? 'mile' : 'km'}`, money(Math.round(tex / (km / (mi ? 1609.344 : 1000))))), eco ? kv('Fuel use', `${eco} litres per 100 km`) : null));
    }

    const s = settleUp(exp, inc, c);
    if (s.driverPaid || s.advances) {
      out.append(h('div', { class: 'card stack' }, h('h3', null, 'Settle up with the company'),
        kv('You paid yourself', money(s.driverPaid)), kv('Advances you got', money(s.advances)),
        s.due >= 0 ? banner('info', 'wallet', h('b', null, `Company owes you ${money(s.due)}`)) : banner('', 'wallet', h('b', null, `You hold ${money(-s.due)} extra`), h('p', { class: 'small' }, 'You were given more in advances than you paid out.')),
        h('button', { class: 'btn', type: 'button', onclick: () => shareText(`Roadbook settle-up, ${periodTitle(kind, range)}\nI paid: ${money(s.driverPaid)}\nAdvances received: ${money(s.advances)}\n${s.due >= 0 ? 'Company owes me: ' + money(s.due) : 'I hold extra: ' + money(-s.due)}`) }, icon('share', 24), 'Send to the office')));
    }
    const cats = byCategory(exp, c);
    if (cats.length) out.append(h('div', { class: 'card stack' }, h('h3', null, 'Where the money went'), cats.map((k) =>
      h('div', null, h('div', { class: 'row' }, h('span', { class: 'grow' }, categoryLabel(k.id)), h('b', null, money(k.cents))), h('div', { class: 'bar' }, h('i', { style: { width: Math.max(2, Math.round(k.share * 100)) + '%' } }))))));

    const loadsHere = live('loads').filter((l) => exp.some((e) => e.load_id === l.id) || inc.some((i) => i.load_id === l.id));
    if (loadsHere.length) out.append(h('div', { class: 'card tight' }, h('div', { class: 'day-head' }, 'Each load'), h('ul', { class: 'list' }, loadsHere.map((l) => {
      const f = loadFinance(l.id, exp, inc, c);
      return h('li', null, h('a', { class: 'item', href: `#/load/${l.id}` }, h('span', { class: 'grow' }, h('div', { class: 't' }, loadName(l)), h('div', { class: 'muted small' }, `In ${money(f.income)} · Spent ${money(f.expenses)}`)), h('span', { class: 'amt ' + (f.net < 0 ? 'neg' : 'pos') }, money(f.net))));
    }))));

    const ul = h('ul', { class: 'list' });
    for (const i of inc.sort((a, b) => b.received_at.localeCompare(a.received_at))) {
      const load = i.load_id ? store.find('loads', i.load_id) : null;
      ul.append(h('li', null, h('a', { class: 'item', href: `#/income/${i.id}` }, h('span', { class: 'ico' }, icon('wallet', 26)),
        h('span', { class: 'grow' }, h('div', { class: 't' }, kindLabel(i.kind)), h('div', { class: 'muted small' }, [fmtDate(i.received_at), i.note, load ? loadName(load) : ''].filter(Boolean).join(' · '))), h('span', { class: 'amt pos' }, money(i.amount_cents, i.currency)))));
    }
    out.append(inc.length ? h('div', { class: 'card tight' }, h('div', { class: 'day-head' }, 'Money in'), ul) : empty('wallet', 'No money in yet', 'Add your pay or an advance when you get it.'));
    out.append(h('a', { class: 'btn', href: '#/expenses' }, icon('fuel', 24), 'See all expenses'));
  }
  ctx.watch(['expenses', 'income', 'trips', 'loads'], draw);
});

route('/income/:id', (ctx) => {
  const isNew = ctx.params.id === 'new';
  const i0 = isNew ? {} : store.find('income', ctx.params.id);
  ctx.header({ title: isNew ? 'Money in' : 'Money in', back: '/money' });
  ctx.tab = 'money';
  if (!i0) { ctx.root.append(empty('alert', 'Not found', null, h('a', { class: 'btn', href: '#/money' }, 'Back'))); return; }
  const currency = i0.currency || cur();
  let kind = i0.kind || 'pay';
  const amount = h('input', { class: 'money-input', id: 'iamt', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', 'aria-label': 'Amount', value: i0.amount_cents != null ? String(i0.amount_cents / 100) : '' });
  const fAmt = field(`How much? (${currency === 'USD' ? 'US dollars' : 'Jamaican dollars'})`, amount);
  const note = textInput({ id: 'inote', maxlength: 200, value: i0.note || '', placeholder: 'Who paid you? (optional)' });
  const when = h('input', { type: 'datetime-local', id: 'iwhen', value: toLocalInput(i0.received_at || new Date()), max: toLocalInput(new Date(Date.now() + 36e5)) });
  const lq = [...live('loads')].filter((l) => !['cancelled'].includes(l.status)).sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 40);
  const loadSel = selectInput([{ value: '', label: 'Not for a particular load' }, ...lq.map((l) => ({ value: l.id, label: loadName(l) }))], i0.load_id || ctx.query.load || '', { id: 'iload' });
  const save = h('button', { class: 'btn primary', type: 'submit' }, icon('check', 26), 'Save');
  ctx.root.append(h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); fAmt.setError('');
    const cents = parseMoney(amount.value);
    if (!cents || cents <= 0) { fAmt.setError('Type how much you received.'); amount.focus(); return; }
    const at = fromLocalInput(when.value); if (!at) { toast('Check the date.', { bad: true }); return; }
    save.disabled = true;
    await store.save('income', { id: i0.id || uuid(), kind, amount_cents: cents, currency, note: note.value.trim(), received_at: at.toISOString(), load_id: loadSel.value || null });
    toast(`Saved ${money(cents, currency)}.`); go(ctx.query.load ? `/load/${ctx.query.load}` : '/money');
  } }, fAmt,
  h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'What kind?'), segmented(KINDS, kind, (v) => { kind = v; }, 'Kind of money'),
    h('p', { class: 'hint muted small' }, 'Advance is cash the company gave you up front for the road. It is taken off what they owe you.')),
  field('Which load', loadSel), field('Note', note), field('When', when), save,
  !isNew ? h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Delete this?', yes: 'Yes, delete', no: 'No', danger: true })) { await store.remove('income', i0.id); toast('Deleted.'); go('/money'); } } }, icon('trash', 24), 'Delete') : null));
});

route('/export', (ctx) => {
  ctx.header({ title: 'Export', back: '/money' });
  ctx.tab = 'money';
  let range = null, kind = 'month';
  const out = h('div', { class: 'stack' });
  ctx.root.append(periodBar('month', (r, k) => { range = r; kind = k; draw(); }), out);
  const stamp = () => new Date().toISOString().slice(0, 10);
  function draw() {
    clear(out);
    const exp = within(live('expenses'), 'spent_at', range), inc = within(live('income'), 'received_at', range), trips = within(live('trips'), 'started_at', range);
    const loadsIn = live('loads').filter((l) => within([{ t: l.created_at }], 't', range).length);
    const d = (v) => (v ? new Date(v).toISOString().slice(0, 16).replace('T', ' ') : '');
    const files = [
      ['Expenses', exp.length, () => toCSV(exp, [{ label: 'Date', get: (r) => d(r.spent_at) }, { label: 'Category', get: (r) => categoryLabel(r.category) }, { label: 'Amount', get: (r) => r.amount_cents / 100 }, { label: 'Currency', get: (r) => r.currency }, { label: 'Where', get: (r) => r.vendor }, { label: 'Note', get: (r) => r.note }, { label: 'Paid by', get: (r) => r.paid_by }, { label: 'Litres', get: (r) => r.litres }, { label: 'Odometer km', get: (r) => (r.odometer_m == null ? '' : r.odometer_m / 1000) }, { label: 'Load', get: (r) => (r.load_id ? loadName(store.find('loads', r.load_id)) : '') }])],
      ['Money in', inc.length, () => toCSV(inc, [{ label: 'Date', get: (r) => d(r.received_at) }, { label: 'Kind', get: (r) => kindLabel(r.kind) }, { label: 'Amount', get: (r) => r.amount_cents / 100 }, { label: 'Currency', get: (r) => r.currency }, { label: 'Note', get: (r) => r.note }, { label: 'Load', get: (r) => (r.load_id ? loadName(store.find('loads', r.load_id)) : '') }])],
      ['Trips', trips.length, () => toCSV(trips, [{ label: 'Start', get: (r) => d(r.started_at) }, { label: 'End', get: (r) => d(r.ended_at) }, { label: 'Distance km', get: (r) => Math.round(r.distance_m / 10) / 100 }, { label: 'From', get: (r) => r.origin_label }, { label: 'To', get: (r) => r.dest_label }, { label: 'Method', get: (r) => r.method }, { label: 'Load', get: (r) => (r.load_id ? loadName(store.find('loads', r.load_id)) : '') }])],
      ['Loads', loadsIn.length, () => toCSV(loadsIn, [{ label: 'Reference', get: (r) => r.reference }, { label: 'Customer', get: (r) => r.customer }, { label: 'From', get: (r) => r.pickup_label }, { label: 'To', get: (r) => r.drop_label }, { label: 'Status', get: (r) => r.status }, { label: 'Agreed pay', get: (r) => r.rate_cents / 100 }, { label: 'Currency', get: (r) => r.currency }, { label: 'Goods', get: (r) => (r.items || []).map((i) => `${i.name} ${i.qty} ${i.unit}`).join('; ') }])],
    ];
    out.append(h('p', { class: 'muted' }, `Spreadsheet files (CSV) for ${periodTitle(kind, range)}. Open them in Excel, Google Sheets or send to your accountant.`));
    for (const [name, n, make] of files) out.append(h('button', { class: 'btn', type: 'button', disabled: !n, onclick: () => { download(`roadbook-${name.toLowerCase().replace(/\s/g, '-')}-${stamp()}.csv`, '﻿' + make(), 'text/csv'); toast(`${name} file ready.`); } }, icon('download', 24), `${name} (${n})`));
    if (!files.some((f) => f[1])) out.append(empty('doc', 'Nothing in this period', 'Choose another week or month above.'));
  }
});
