import { h, icon, clear, uuid } from '../util.js';
import * as store from '../store.js';
import { route, go } from '../router.js';
import { S } from '../session.js';
import { fmtDateTime } from '../format.js';
import { discrepancies } from '../calc.js';
import { field, textInput, toast, empty, banner, kv, haptic } from '../ui.js';
import { photoPicker, loadName, shareText } from './common.js';
import { signaturePad } from '../images.js';
import { getPositionOnce } from '../gps.js';
import { proofHash, verifyProof } from '../hash.js';
import { speak } from '../voice.js';
import { deliveryFor, driverName } from './loads.js';

const buf = async (b) => (b ? new Uint8Array(await b.arrayBuffer()) : null);

route('/deliver/:id', (ctx) => {
  const load = store.find('loads', ctx.params.id);
  ctx.header({ title: 'Deliver load', back: `/load/${ctx.params.id}` });
  ctx.tab = 'loads';
  if (!load) { ctx.root.append(empty('alert', 'Not found', null, h('a', { class: 'btn', href: '#/loads' }, 'Back to loads'))); return; }
  const prev = deliveryFor(load.id);
  const rows = (load.items || []).map((i) => ({ name: i.name, unit: i.unit, expected: Number(i.qty), received: Number(i.qty) }));
  let extraNote = '';
  let receiver = prev?.receiver_name || '';
  let step = 1;
  let sigPad = null;
  let sigCanvas = null;
  const photo = photoPicker({ label: 'Photo of the goods or paperwork' });
  const body = h('div', { class: 'stack' });
  const dots = h('div', { class: 'stepper', role: 'img' });
  ctx.root.append(h('div', { class: 'card' }, h('h2', null, loadName(load)), h('p', { class: 'muted' }, load.drop_label ? `Deliver to ${load.drop_label}` : 'Delivery'), dots), body);

  const nSteps = 4;
  function setDots() { clear(dots); dots.setAttribute('aria-label', `Step ${step} of ${nSteps}`); for (let i = 1; i <= nSteps; i++) dots.append(h('span', { class: 's' + (i <= step ? ' on' : '') })); }

  function draw() {
    setDots(); clear(body);
    if (step === 1) {
      body.append(h('h2', null, '1. Count the goods'));
      if (!rows.length) {
        body.append(banner('', 'box', 'No goods list was added for this load. Add what you delivered, or carry on.'));
      }
      rows.forEach((r) => {
        const qty = h('input', { inputmode: 'decimal', value: String(r.received), 'aria-label': `${r.name}: how many arrived`, class: 'money-input' });
        const sync = (v) => { r.received = v; qty.value = String(v); mark(); };
        const bad = h('span', { class: 'pill bad', hidden: true });
        const mark = () => { const d = Number(r.received) - r.expected; bad.hidden = d === 0 || Number.isNaN(d); bad.textContent = d < 0 ? `${-d} missing` : `${d} extra`; };
        qty.addEventListener('input', () => { r.received = qty.value === '' ? NaN : Number(qty.value.replace(/,/g, '')); mark(); });
        mark();
        body.append(h('div', { class: 'card stack' },
          r.extra ? field('Name of the extra item', textInput({ maxlength: 60, value: r.name, placeholder: 'What was it?', oninput: (e) => { r.name = e.target.value; } })) : h('div', { class: 'row' }, h('b', { class: 'grow' }, r.name), h('span', { class: 'muted' }, `Expected ${r.expected} ${r.unit}`)),
          h('div', { class: 'row' },
            h('button', { class: 'icon-btn', type: 'button', style: { background: 'var(--card-2)', border: '2px solid var(--line)' }, 'aria-label': `One less ${r.name}`, onclick: () => sync(Math.max(0, Number(r.received) - 1)) }, icon('minus', 28)),
            h('div', { class: 'grow' }, qty),
            h('button', { class: 'icon-btn', type: 'button', style: { background: 'var(--card-2)', border: '2px solid var(--line)' }, 'aria-label': `One more ${r.name}`, onclick: () => sync(Number(r.received || 0) + 1) }, icon('plus', 28))),
          h('div', { class: 'center' }, bad, h('button', { class: 'link-btn', type: 'button', onclick: () => sync(r.expected) }, 'All arrived'))));
      });
      body.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => { rows.push({ name: '', unit: 'pieces', expected: 0, received: 1, extra: true }); draw(); } }, icon('plus', 24), 'Something else was delivered'));
      body.append(h('button', { class: 'btn primary', type: 'button', onclick: () => {
        for (const r of rows) {
          if (r.extra && !r.name.trim()) { toast('Write the name of the extra item, or remove it.', { bad: true }); return; }
          if (!(Number(r.received) >= 0)) { toast(`How many ${r.name || 'items'} arrived? Type a number.`, { bad: true }); return; }
        }
        step = 2; draw();
      } }, 'Next', icon('next', 24)));
    }
    if (step === 2) {
      body.append(h('h2', null, '2. Who received it?'));
      const name = textInput({ id: 'rcv', maxlength: 100, value: receiver, placeholder: 'Name of the person receiving' });
      name.addEventListener('input', () => { receiver = name.value; });
      if (!sigCanvas) { sigCanvas = h('canvas', { class: 'sig', width: 900, height: 380, 'aria-label': 'Signature box. Draw the receiver\'s signature with a finger.', role: 'img' }); sigPad = signaturePad(sigCanvas); }
      const canvas = sigCanvas;
      body.append(field('Receiver\'s name', name), h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Receiver signs here'), canvas,
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => sigPad.clear() }, 'Clear signature')));
      body.append(h('div', { class: 'btn-row two' }, h('button', { class: 'btn', type: 'button', onclick: () => { step = 1; draw(); } }, 'Back'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => {
          if (!receiver.trim()) { toast('Write the receiver\'s name.', { bad: true }); name.focus(); return; }
          step = 3; draw();
        } }, 'Next', icon('next', 24))));
    }
    if (step === 3) {
      const diffs = discrepancies(rows);
      body.append(h('h2', null, '3. Photo and notes'));
      body.append(photo.el);
      const note = h('textarea', { id: 'dn', maxlength: 500, rows: 3, placeholder: diffs.length ? 'Say what happened to the missing goods' : 'Anything to note (optional)' }, extraNote);
      note.addEventListener('input', () => { extraNote = note.value; });
      body.append(diffs.length ? banner('bad', 'alert', h('b', null, 'Some goods do not match:'), h('ul', null, diffs.map((d) => h('li', null, `${d.name}: ${d.diff < 0 ? -d.diff + ' missing' : d.diff + ' extra'}`)))) : null, field('Notes', note),
        h('div', { class: 'btn-row two' }, h('button', { class: 'btn', type: 'button', onclick: () => { step = 2; draw(); } }, 'Back'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => { if (diffs.length && !extraNote.trim()) { toast('Write a short note about what did not match.', { bad: true }); note.focus(); return; } step = 4; draw(); } }, 'Next', icon('next', 24))));
    }
    if (step === 4) {
      const diffs = discrepancies(rows);
      const sigEmpty = sigPad ? sigPad.isEmpty() : true;
      const go1 = h('button', { class: 'btn primary', type: 'button' }, icon('check', 28), 'Confirm delivery');
      body.append(h('h2', null, '4. Check and confirm'),
        h('div', { class: 'card' }, kv('Load', loadName(load)), kv('Received by', receiver), kv('Signature', sigEmpty ? 'None' : 'Yes'), kv('Photo', photo.get() ? 'Yes' : 'None'),
          kv('Goods', diffs.length ? `${plural1(diffs.length)} do not match` : 'All matched', diffs.length ? 'neg' : 'pos')),
        sigEmpty ? banner('', 'sign', 'No signature yet. A signature makes your proof stronger. Go back to add it.') : null,
        h('p', { class: 'muted small' }, 'When you confirm, the phone records the time and where you are, and makes a fingerprint of this delivery so nobody can change it later without it showing.'),
        h('div', { class: 'btn-row two' }, h('button', { class: 'btn', type: 'button', onclick: () => { step = 3; draw(); } }, 'Back'), go1));
      go1.addEventListener('click', async () => {
        go1.disabled = true; go1.textContent = 'Saving…';
        try {
          const when = new Date();
          const pos = await getPositionOnce({ timeout: 8000, maxAge: 60000 });
          const sigBlob = sigEmpty ? null : await sigPad.toBlob();
          const photoBlob = photo.get();
          const id = prev?.id || uuid();
          const base = `${store.userId()}/proof/${load.id}`;
          const sigPath = sigBlob ? `${base}/signature.png` : null;
          const photoPath = photoBlob ? `${base}/photo.jpg` : null;
          if (sigBlob) await store.getDb().putFile(sigPath, sigBlob, false);
          if (photoBlob) await store.getDb().putFile(photoPath, photoBlob, false);
          const items = rows.map((r) => ({ name: r.name.trim(), unit: r.unit, expected: r.expected, received: Number(r.received) }));
          const d = { id, load_id: load.id, delivered_at: when.toISOString(), lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, accuracy_m: pos ? pos.accuracy : null,
            receiver_name: receiver.trim().slice(0, 100), signature_path: sigPath, photo_path: photoPath, items, has_discrepancy: diffs.length > 0, discrepancy_note: extraNote.trim().slice(0, 500) };
          d.proof_hash = await proofHash(d, await buf(sigBlob), await buf(photoBlob));
          await store.save('deliveries', d);
          await store.save('loads', { ...load, status: 'delivered' });
          haptic(60);
          speak(diffs.length ? 'Delivery saved. Some goods did not match.' : 'Delivery saved. Everything matched.');
          go(`/proof/${load.id}?new=1`, { replace: true });
        } catch (e) {
          console.error(e);
          toast('Could not save the delivery. Try again.', { bad: true });
          go1.disabled = false; go1.textContent = 'Confirm delivery';
        }
      });
    }
  }
  const plural1 = (n) => (n === 1 ? '1 item' : `${n} items`);
  draw();
});

route('/proof/:id', (ctx) => {
  const load = store.find('loads', ctx.params.id);
  const d = deliveryFor(ctx.params.id);
  ctx.header({ title: 'Delivery proof', back: `/load/${ctx.params.id}` });
  ctx.tab = 'loads';
  if (!load || !d) { ctx.root.append(empty('shield', 'No delivery yet', 'Deliver the load to create proof.', h('a', { class: 'btn', href: `#/load/${ctx.params.id}` }, 'Back to load'))); return; }
  const imgs = h('div', { class: 'stack' });
  const verify = h('div', { 'aria-live': 'polite' });
  const files = {};
  async function getFile(path) { if (!path) return null; try { return await (S.sync ? S.sync.fetchFile(path) : store.getDb().getFile(path).then((f) => f?.blob)); } catch { return null; } }
  (async () => {
    for (const [k, label] of [['signature_path', 'Signature'], ['photo_path', 'Photo']]) {
      const b = await getFile(d[k]); files[k] = b;
      if (b) { const url = URL.createObjectURL(b); ctx.onLeave(() => URL.revokeObjectURL(url)); imgs.append(h('figure', { style: { margin: '0' } }, h('img', { class: 'thumb', src: url, alt: label + ' for this delivery' }), h('figcaption', { class: 'small muted' }, label))); }
      else if (d[k]) imgs.append(h('p', { class: 'muted small' }, `${label} is not on this phone yet. Connect to the internet to load it.`));
    }
  })();
  const code = (d.proof_hash || '').slice(0, 8).toUpperCase();
  const place = d.lat != null ? `https://www.google.com/maps?q=${d.lat},${d.lng}` : '';
  ctx.root.append(
    ctx.query.new ? banner('ok', 'check', h('b', null, 'Delivery saved.'), h('p', null, 'You can show or share this proof any time.')) : null,
    h('div', { class: 'card stack' }, h('h2', null, loadName(load)), kv('Delivered', fmtDateTime(d.delivered_at)), kv('Received by', d.receiver_name || 'Not written'),
      kv('Driver', driverName(d.user_id)), d.lat != null ? kv('Place', `${d.lat.toFixed(4)}, ${d.lng.toFixed(4)} (within ${Math.round(d.accuracy_m ?? 0)} m)`) : kv('Place', 'Not recorded'),
      kv('Proof code', code || 'None')),
    h('div', { class: 'card stack' }, h('h3', null, 'Goods checked'),
      (d.items || []).length ? h('ul', { class: 'list' }, d.items.map((i) => h('li', { class: 'kv' }, h('span', null, i.name), h('b', { class: i.received === i.expected ? 'pos' : 'neg' }, `${i.received} of ${i.expected} ${i.unit}`)))) : h('p', { class: 'muted' }, 'No goods list.'),
      d.has_discrepancy ? banner('bad', 'alert', h('b', null, 'Did not match'), d.discrepancy_note ? h('p', null, d.discrepancy_note) : null) : banner('ok', 'check', 'Everything matched.')),
    imgs,
    h('div', { class: 'card stack' }, h('h3', null, 'Is this proof untouched?'), h('p', { class: 'muted small' }, 'This compares the saved details, signature and photo with the fingerprint made at the drop-off.'),
      h('button', { class: 'btn green', type: 'button', onclick: async () => {
        clear(verify);
        const ok = await verifyProof(d, await buf(files.signature_path), await buf(files.photo_path));
        if ((d.signature_path && !files.signature_path) || (d.photo_path && !files.photo_path)) verify.append(banner('', 'alert', 'The picture files are not on this phone yet, so this cannot be checked. Connect to the internet and try again.'));
        else verify.append(ok ? banner('ok', 'check', h('b', null, 'Matches.'), ' Nothing has been changed since the delivery.') : banner('bad', 'alert', h('b', null, 'Does NOT match.'), ' Something was changed after the delivery.'));
      } }, icon('shield', 24), 'Check it now'), verify),
    h('button', { class: 'btn', type: 'button', onclick: () => shareText(`Delivery proof ${code}\nLoad: ${loadName(load)}\nDelivered: ${fmtDateTime(d.delivered_at)}\nReceived by: ${d.receiver_name}\nGoods: ${d.has_discrepancy ? 'DID NOT MATCH' : 'All matched'}${place ? '\nPlace: ' + place : ''}`, 'Delivery proof') }, icon('share', 24), 'Share with the office'));
});
