import { h, icon, clear, uuid } from '../util.js';
import * as store from '../store.js';
import { route, go } from '../router.js';
import { S } from '../session.js';
import { CATEGORIES, categoryLabel, parseReceiptText, parseSpokenExpense } from '../receipt.js';
import { parseMoney, fmtDate, fmtTime, toLocalInput, fromLocalInput, parseDistance, clip } from '../format.js';
import { sumCents, byCategory, within, otherCurrencyCount } from '../calc.js';
import { field, textInput, selectInput, choiceChips, segmented, toast, confirmDialog, empty, banner, haptic } from '../ui.js';
import { cur, money, live, periodBar, micButton, photoPicker, loadName, activeLoads, unitName } from './common.js';
import { readReceipt } from '../ocr.js';
import { prefs } from '../prefs.js';
import { speak } from '../voice.js';
import { savedSpeech } from '../phrases.js';

const catIcon = (id) => (CATEGORIES.find((c) => c.id === id) || CATEGORIES.at(-1)).icon;

route('/expenses', (ctx) => {
  ctx.header({ title: 'Expenses', back: '/money', actions: [{ icon: 'plus', label: 'Add expense', href: '#/expense/new' }] });
  ctx.tab = 'money';
  const out = h('div', { class: 'stack' });
  let range = null;
  const bar = periodBar('week', (r) => { range = r; draw(); });
  ctx.root.append(h('a', { class: 'btn primary', href: '#/expense/new' }, icon('plus', 26), 'Add an expense'), bar, out);

  function draw() {
    if (!range) return;
    clear(out);
    const c = cur();
    const all = within(live('expenses'), 'spent_at', range).sort((a, b) => b.spent_at.localeCompare(a.spent_at));
    const total = sumCents(all, c);
    const sum = h('div', { class: 'card' },
      h('div', { class: 'muted' }, 'Spent'), h('div', { class: 'big-num' }, money(total)),
      otherCurrencyCount(all, c) ? h('p', { class: 'small muted' }, `${otherCurrencyCount(all, c)} in another currency are not counted here.`) : null);
    const cats = byCategory(all, c).slice(0, 5);
    if (cats.length) sum.append(h('div', { class: 'stack', style: { marginTop: '12px' } }, cats.map((k) =>
      h('div', null, h('div', { class: 'row' }, h('span', { class: 'grow' }, categoryLabel(k.id)), h('b', null, money(k.cents))),
        h('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(k.share * 100)} percent` }, h('i', { style: { width: Math.max(2, Math.round(k.share * 100)) + '%' } }))))));
    out.append(sum);
    if (!all.length) { out.append(empty('wallet', 'No expenses yet', 'Tap "Add an expense" after you buy fuel, pay a toll or eat.')); return; }
    const card = h('div', { class: 'card tight' });
    let day = '';
    const list = h('ul', { class: 'list' });
    for (const e of all) {
      const d = fmtDate(e.spent_at, { weekday: true });
      if (d !== day) { day = d; card.append(h('div', { class: 'day-head' }, d)); card.append(list.cloneNode(false)); }
      const ul = card.lastChild;
      const load = e.load_id ? store.find('loads', e.load_id) : null;
      ul.append(h('li', null, h('a', { class: 'item', href: `#/expense/${e.id}` },
        h('span', { class: 'ico' }, icon(catIcon(e.category), 26)),
        h('span', { class: 'grow' }, h('div', { class: 't' }, e.vendor || categoryLabel(e.category)),
          h('div', { class: 'muted small' }, [categoryLabel(e.category), fmtTime(e.spent_at), e.paid_by === 'company' ? 'Company paid' : '', load ? loadName(load) : ''].filter(Boolean).join(' · ')),
          e._dirty && S.user ? h('span', { class: 'pill warn' }, 'Not uploaded yet') : null),
        h('span', { class: 'amt' }, money(e.amount_cents, e.currency)),
        e.receipt_path ? h('span', { 'aria-label': 'Has receipt photo' }, icon('camera', 20)) : null)));
    }
    out.append(card);
  }
  ctx.watch(['expenses', 'loads'], draw);
});

route('/expense/:id', (ctx) => {
  const isNew = ctx.params.id === 'new';
  const existing = isNew ? null : store.find('expenses', ctx.params.id);
  ctx.header({ title: isNew ? 'New expense' : 'Expense', back: '/expenses' });
  ctx.tab = 'money';
  if (!isNew && !existing) { ctx.root.append(empty('alert', 'Not found', 'That expense is not here any more.', h('a', { class: 'btn', href: '#/expenses' }, 'Back to expenses'))); return; }

  const e0 = existing || {};
  const state = {
    category: e0.category || ctx.query.category || 'fuel',
    paid_by: e0.paid_by || 'driver',
    receipt_path: e0.receipt_path || null,
  };
  const currency = e0.currency || cur();

  const amount = h('input', { class: 'money-input', id: 'amt', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', 'aria-label': 'Amount', value: e0.amount_cents != null ? String(e0.amount_cents / 100) : '' });
  const fAmount = field(`How much? (${currency === 'USD' ? 'US dollars' : 'Jamaican dollars'})`, amount);
  const vendor = textInput({ id: 'ven', maxlength: 60, value: e0.vendor || '', placeholder: 'Where? (shop, station, toll plaza)' });
  const note = textInput({ id: 'note', maxlength: 200, value: e0.note || '', placeholder: 'Anything to remember' });
  const litres = h('input', { id: 'lit', inputmode: 'decimal', autocomplete: 'off', value: e0.litres ?? '', placeholder: 'e.g. 45' });
  const odo = h('input', { id: 'odo', inputmode: 'decimal', autocomplete: 'off', value: e0.odometer_m != null ? String(Math.round(e0.odometer_m / (prefs().unit === 'mi' ? 1609.344 : 1000))) : '', placeholder: 'Number on the dashboard' });
  const when = h('input', { type: 'datetime-local', id: 'when', value: toLocalInput(e0.spent_at || new Date()), max: toLocalInput(new Date(Date.now() + 36e5)) });
  const loads = [...activeLoads(), ...(e0.load_id && !activeLoads().some((l) => l.id === e0.load_id) && store.find('loads', e0.load_id) ? [store.find('loads', e0.load_id)] : [])];
  const loadSel = selectInput([{ value: '', label: 'Not for a particular load' }, ...loads.map((l) => ({ value: l.id, label: loadName(l) }))], e0.load_id || ctx.query.load || '', { id: 'load' });
  const fuelBox = h('div', { class: 'stack' }, field('Litres bought', litres), field(`Odometer (${unitName()})`, odo, { hint: 'Helps work out your fuel use and service reminders.' }));
  const noteBox = h('div', { class: 'stack' });
  const photo = photoPicker({ label: 'Photo of receipt' });

  const chips = choiceChips(CATEGORIES, state.category, (id) => { state.category = id; fuelBox.hidden = id !== 'fuel'; }, { label: 'What was it for?' });
  fuelBox.hidden = state.category !== 'fuel';
  const paid = segmented([{ id: 'driver', label: 'I paid' }, { id: 'company', label: 'Company paid' }], state.paid_by, (v) => { state.paid_by = v; }, 'Who paid');

  // show the saved receipt when editing
  if (e0.receipt_path) {
    const img = h('img', { class: 'thumb', alt: 'Saved receipt', hidden: true });
    photo.el.prepend(img);
    (async () => { try { const b = await (S.sync ? S.sync.fetchFile(e0.receipt_path) : store.getDb().getFile(e0.receipt_path).then((f) => f?.blob)); if (b) { img.src = URL.createObjectURL(b); img.hidden = false; ctx.onLeave(() => URL.revokeObjectURL(img.src)); } } catch { /* offline: fine */ } })();
  }

  function applySpoken(text) {
    const p = parseSpokenExpense(text);
    if (p.amount_cents) amount.value = String(p.amount_cents / 100);
    if (p.category) { state.category = p.category; chips.set(p.category); fuelBox.hidden = p.category !== 'fuel'; }
    if (!note.value) note.value = clip(text, 120);
    toast(p.amount_cents ? `Heard ${money(p.amount_cents, currency)}. Check it, then save.` : 'I heard you but not an amount. Type the amount.');
  }

  // receipt scanning
  const scanProgress = h('div', { class: 'progress', hidden: true, role: 'progressbar', 'aria-label': 'Reading receipt' }, h('i', { style: { width: '0%' } }));
  const scanNote = h('div', { 'aria-live': 'polite' });
  const scanInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', tabindex: '-1', 'aria-label': 'Take a photo of the receipt to read it' });
  const scanBtn = h('button', { class: 'btn green', type: 'button', onclick: () => scanInput.click() }, icon('scan', 26), 'Scan a receipt');
  scanInput.addEventListener('change', async () => {
    const f = scanInput.files?.[0]; scanInput.value = '';
    if (!f) return;
    clear(scanNote); scanBtn.disabled = true; scanProgress.hidden = false;
    try {
      const { shrinkPhoto } = await import('../images.js');
      const blob = await shrinkPhoto(f);
      photo.set(blob);
      const text = await readReceipt(blob, (p) => { scanProgress.firstChild.style.width = Math.round(p * 100) + '%'; });
      const r = parseReceiptText(text);
      const found = [];
      if (r.amount_cents) { amount.value = String(r.amount_cents / 100); found.push(`amount ${money(r.amount_cents, currency)}${r.amount_sure ? '' : ' (not sure)'}`); }
      if (r.category) { state.category = r.category; chips.set(r.category); fuelBox.hidden = r.category !== 'fuel'; found.push(categoryLabel(r.category)); }
      if (r.vendor && !vendor.value) { vendor.value = r.vendor; found.push(r.vendor); }
      if (r.date) { when.value = r.date + 'T' + (when.value.slice(11) || '12:00'); found.push(`date ${r.date}${r.date_ambiguous ? ' (day first)' : ''}`); }
      if (r.litres) { litres.value = String(r.litres); found.push(`${r.litres} litres`); }
      scanNote.append(found.length ? banner('info', 'scan', h('b', null, 'I read this from the picture:'), h('p', null, found.join(' · ')), h('p', { class: 'small' }, 'Please check it against the receipt before you save. Reading can make mistakes.'))
        : banner('', 'alert', h('b', null, 'I could not read that one.'), h('p', null, 'Try again in good light with the whole receipt flat, or type it in. The photo is still attached.')));
      amount.focus();
    } catch (err) {
      scanNote.append(banner('bad', 'alert', h('b', null, 'Could not scan.'), h('p', null, 'You can still type it in. ' + (err.message || ''))));
    } finally { scanBtn.disabled = false; scanProgress.hidden = true; scanProgress.firstChild.style.width = '0%'; }
  });

  const saveBtn = h('button', { class: 'btn primary', type: 'submit' }, icon('check', 26), 'Save expense');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault();
    fAmount.setError('');
    const cents = parseMoney(amount.value);
    if (!cents || cents <= 0) { fAmount.setError('Type how much it cost, like 4500 or 1250.50'); amount.focus(); return; }
    const at = fromLocalInput(when.value);
    if (!at) { toast('Check the date and time.', { bad: true }); when.focus(); return; }
    let lit = null;
    if (state.category === 'fuel' && litres.value.trim()) {
      lit = Number(litres.value.replace(/,/g, ''));
      if (!(lit > 0 && lit <= 2000)) { toast('Litres should be a number like 45.', { bad: true }); litres.focus(); return; }
    }
    let odoM = null;
    if (odo.value.trim()) {
      odoM = parseDistance(odo.value, prefs().unit);
      if (odoM == null) { toast('Odometer should be a number.', { bad: true }); odo.focus(); return; }
    }
    saveBtn.disabled = true;
    const id = e0.id || uuid();
    let receipt_path = state.receipt_path;
    const blob = photo.get();
    if (blob) { receipt_path = `${store.userId()}/receipts/${id}.jpg`; await store.getDb().putFile(receipt_path, blob, false); }
    await store.save('expenses', {
      id, category: state.category, amount_cents: cents, currency, vendor: vendor.value.trim(), note: note.value.trim(),
      litres: lit, paid_by: state.paid_by, spent_at: at.toISOString(), odometer_m: odoM, receipt_path: receipt_path || null,
      load_id: loadSel.value || null,
    });
    haptic(30);
    speak(savedSpeech('Expense', money(cents, currency)));
    toast(`Saved ${money(cents, currency)} for ${categoryLabel(state.category)}.`);
    go('/expenses');
  } },
  scanBtn, scanInput, scanProgress, scanNote,
  h('div', { class: 'input-row' }, fAmount, h('div', { style: { alignSelf: 'end' } }, micButton(applySpoken, 'Say it, like: fuel five thousand'))),
  h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'What was it for?'), chips),
  fuelBox,
  field('Where', vendor), field('Note', note),
  h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Who paid?'), paid),
  field('Which load', loadSel), field('When', when),
  h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Receipt picture'), photo.el),
  noteBox, saveBtn,
  existing ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (await confirmDialog({ title: 'Delete this expense?', body: `${money(e0.amount_cents, e0.currency)} for ${categoryLabel(e0.category)} will be removed.`, yes: 'Yes, delete', no: 'No, keep it', danger: true })) {
      await store.remove('expenses', e0.id); toast('Expense deleted.', { action: { label: 'Undo', run: () => store.save('expenses', { ...e0, deleted_at: null }) } }); go('/expenses');
    } } }, icon('trash', 24), 'Delete') : null);
  ctx.root.append(form);
  if (isNew && ctx.query.scan) scanBtn.scrollIntoView({ block: 'center' });
  if (isNew) amount.focus({ preventScroll: true });
});
