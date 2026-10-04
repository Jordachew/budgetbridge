import { h, icon, clear, uuid, ls } from '../util.js';
import * as store from '../store.js';
import { route, go } from '../router.js';
import { S, isAccount } from '../session.js';
import { fmtTime, fmtDate, fmtRelative, initials } from '../format.js';
import { field, textInput, selectInput, toast, confirmDialog, empty, banner, pill, choiceChips, switchRow, kv, haptic } from '../ui.js';
import { micButton, shareText, download, money, dist } from './common.js';
import { getPositionOnce } from '../gps.js';
import { ALERT_KINDS, alertKind, alertSpeech, messageSpeech } from '../phrases.js';
import { speak } from '../voice.js';
import { describeRelative, mapsLink } from '../geo.js';
import { prefs } from '../prefs.js';
import { periodRange } from '../dates.js';
import { toCSV } from '../csv.js';

/* ---------- crew data ---------- */
export async function refreshCrews() {
  if (!S.api || !navigator.onLine) return false;
  try {
    S.crews = await S.api.myCrews();
    S.rosters = S.rosters || {};
    for (const c of S.crews) S.rosters[c.id] = await S.api.roster(c.id);
    store.emit(['crews']);
    return true;
  } catch (e) { console.warn('crew refresh failed', e); return false; }
}
export function currentCrew() {
  if (!S.crews.length) return null;
  const saved = ls('roadbook.crew');
  return S.crews.find((c) => c.id === saved) || S.crews[0];
}
const myName = () => store.getProfile().display_name || 'Driver';
export const chatSeenKey = (crewId) => `roadbook.chatSeen.${crewId}`;
export function unreadCount() {
  const c = currentCrew(); if (!c) return 0;
  const seen = ls(chatSeenKey(c.id)) || '1970-01-01';
  return store.rows('messages').filter((m) => m.crew_id === c.id && m.user_id !== store.userId() && (m.created_at || '') > seen).length;
}
export const activeAlerts = (crewId) => store.rows('road_alerts').filter((a) => (!crewId || a.crew_id === crewId) && !a.cleared_at && new Date(a.expires_at) > new Date()).sort((a, b) => b.created_at.localeCompare(a.created_at));

/* ---------- hub ---------- */
route('/crew', (ctx) => {
  ctx.header({ title: 'Crew', actions: [{ icon: 'settings', label: 'Settings', href: '#/settings' }] });
  const out = h('div', { class: 'stack' });
  ctx.root.append(out);
  async function draw() {
    clear(out);
    if (!isAccount()) {
      out.append(empty('users', 'Crew needs an account', 'Chat with other drivers, share road problems and get jobs from your boss. Your records stay private unless you choose to share.', h('a', { class: 'btn primary', href: '#/settings/account' }, 'Make an account')));
      return;
    }
    const crew = currentCrew();
    if (!crew) { out.append(...noCrew()); return; }
    const roster = (S.rosters || {})[crew.id] || [];
    const owner = crew.role === 'owner';
    const admin = crew.role === 'admin';
    const manager = owner || admin;
    const alerts = activeAlerts(crew.id);
    const unread = unreadCount();
    if (S.crews.length > 1) {
      const sel = selectInput(S.crews.map((c) => ({ value: c.id, label: c.name })), crew.id, { 'aria-label': 'Which crew' });
      sel.addEventListener('change', () => { ls('roadbook.crew', sel.value); draw(); });
      out.append(sel);
    }
    out.append(h('div', { class: 'card', style: /^#[0-9a-fA-F]{6}$/.test(crew.brand_color || '') ? { borderTop: `8px solid ${crew.brand_color}` } : {} }, h('div', { class: 'row' }, h('h2', { class: 'grow' }, crew.name), pill(owner ? 'You run this company' : admin ? 'Admin' : 'Driver', manager ? 'ok' : 'info')), h('p', { class: 'muted' }, `${roster.length} ${roster.length === 1 ? 'person' : 'people'}`)));
    out.append(h('div', { class: 'tiles' },
      h('a', { class: 'tile', href: '#/chat' }, h('span', { class: 'ico' }, icon('chat', 30)), h('span', null, h('div', { class: 'label' }, 'Chat'), h('div', { class: 'sub' }, unread ? `${unread} new` : 'Talk to the crew'))),
      h('a', { class: 'tile' + (alerts.length ? ' warn' : ''), href: '#/alerts' }, h('span', { class: 'ico' }, icon('alert', 30)), h('span', null, h('div', { class: 'label' }, 'Road alerts'), h('div', { class: 'sub' }, alerts.length ? `${alerts.length} active` : 'All clear'))),
      h('a', { class: 'tile hot', href: '#/alert/new' }, h('span', { class: 'ico' }, icon('siren', 30)), h('span', null, h('div', { class: 'label' }, 'Report a problem'), h('div', { class: 'sub' }, 'Warn other drivers'))),
      manager ? h('a', { class: 'tile', href: '#/crew/report' }, h('span', { class: 'ico' }, icon('chart', 30)), h('span', null, h('div', { class: 'label' }, 'Team report'), h('div', { class: 'sub' }, 'Miles, loads, costs'))) : h('a', { class: 'tile', href: '#/loads' }, h('span', { class: 'ico' }, icon('box', 30)), h('span', null, h('div', { class: 'label' }, 'My loads'), h('div', { class: 'sub' }, 'From dispatch')))));
    if (manager) out.append(h('a', { class: 'btn', href: '#/load/new/edit' }, icon('send', 24), 'Give a driver a load'));

    out.append(h('div', { class: 'card tight' }, h('div', { class: 'day-head' }, 'People'), h('ul', { class: 'list' }, roster.map((m) => {
      const li = h('li', null, h('div', { class: 'item' }, h('span', { class: 'ico' }, initials(m.display_name)), h('span', { class: 'grow' }, h('div', { class: 't' }, m.display_name + (m.user_id === store.userId() ? ' (you)' : '')),
        h('div', { class: 'muted small' }, m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin (dispatcher)' : manager ? (m.share_data ? 'Shares numbers with you' : 'Keeps numbers private') : 'Driver')),
        owner && m.role !== 'owner' && m.user_id !== store.userId() ? h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          const to = m.role === 'admin' ? 'driver' : 'admin';
          if (!(await confirmDialog({ title: to === 'admin' ? `Make ${m.display_name} an admin?` : `Make ${m.display_name} a driver again?`, body: to === 'admin' ? 'Admins can give out loads, see the join code and the team report, and see the numbers of drivers who share. They cannot delete the company or change roles.' : 'They lose admin powers.', yes: 'Yes', no: 'No' }))) return;
          try { await S.api.setMemberRole(crew.id, m.user_id, to); await refreshCrews(); toast('Done.'); draw(); } catch { toast('Could not change that. Check your signal.', { bad: true }); }
        } }, m.role === 'admin' ? 'Make driver' : 'Make admin') : null,
        (manager && m.role === 'driver') || (owner && m.role === 'admin') ? h('button', { class: 'btn small ghost', type: 'button', onclick: async () => {
          if (!(await confirmDialog({ title: `Remove ${m.display_name}?`, body: 'They will leave the crew and stop seeing chat and alerts. Their own records stay on their phone.', yes: 'Yes, remove', no: 'No', danger: true }))) return;
          try { await S.api.removeMember(crew.id, m.user_id); await refreshCrews(); toast('Removed.'); draw(); } catch { toast('Could not remove. Check your signal.', { bad: true }); }
        } }, 'Remove') : null));
      return li;
    }))));

    if (manager) out.append(joinCodeCard(crew));
    if (owner) out.append(companyCard(crew));
    else out.append(h('div', { class: 'card stack' }, h('h3', null, admin ? 'Your role' : 'Privacy'),
      admin ? null : switchRow('Share my totals with the owner and admins', crew.share_data, async (v) => { try { await S.api.setShare(crew.id, v); crew.share_data = v; toast(v ? 'The owner can now see your trips, loads, costs and receipts.' : 'The owner can no longer see your numbers.'); } catch { toast('Could not change that. Check your signal.', { bad: true }); } },
        'Off by default. When on, the owner and admins see your trips, loads, costs, income and receipt photos.'),
      h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!(await confirmDialog({ title: 'Leave this crew?', body: 'You will stop seeing chat and alerts for it.', yes: 'Yes, leave', no: 'Stay', danger: true }))) return;
        try { await S.api.leaveCrew(crew.id); await refreshCrews(); toast('You left the crew.'); draw(); } catch { toast('Could not leave. Check your signal.', { bad: true }); }
      } }, 'Leave crew')));
    if (owner) out.append(h('button', { class: 'btn danger', type: 'button', onclick: async () => {
      if (!(await confirmDialog({ title: `Delete ${crew.name}?`, body: 'Everyone is removed and the chat and alerts are deleted. Drivers keep their own records.', yes: 'Yes, delete the crew', no: 'No', danger: true }))) return;
      try { await S.api.deleteCrew(crew.id); await refreshCrews(); toast('Crew deleted.'); draw(); } catch { toast('Could not delete. Check your signal.', { bad: true }); }
    } }, icon('trash', 24), 'Delete this crew'));
  }
  function noCrew() {
    const code = textInput({ id: 'jc', maxlength: 12, autocapitalize: 'characters', autocomplete: 'off', placeholder: 'Code from your boss', 'aria-label': 'Join code' });
    const link = ls('roadbook.joinCode'); if (link) code.value = link;
    let share = false;
    const cname = textInput({ id: 'cn', maxlength: 60, placeholder: 'Name of your company or team' });
    const joinBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Join');
    return [
      h('form', { class: 'card stack', onsubmit: async (e) => {
        e.preventDefault();
        const v = code.value.trim().toUpperCase(); if (!v) { toast('Type the code your boss gave you.', { bad: true }); code.focus(); return; }
        joinBtn.disabled = true;
        try { const id = await S.api.joinCrew(v, share); if (!id) { toast('That code is not right. Check it with your boss.', { bad: true }); joinBtn.disabled = false; return; } await refreshCrews(); store.emit(['crews']); ls('roadbook.joinCode', null); toast('You joined the crew.'); await S.sync?.run(); draw(); }
        catch (err) { toast(/too many/i.test(err.message) ? 'Too many wrong tries. Wait a few minutes.' : 'Could not join. Check your signal.', { bad: true }); joinBtn.disabled = false; }
      } }, h('h2', null, 'Join my team'), h('p', { class: 'muted' }, 'Ask your boss or another driver for the crew code.'), field('Crew code', code),
      switchRow('Share my totals with the owner and admins', false, (v) => { share = v; }, 'Optional. They can see your trips, loads, costs, income and receipt photos. Your reminders and planned routes stay private. You can turn this off later.'), joinBtn),
      h('form', { class: 'card stack', onsubmit: async (e) => {
        e.preventDefault();
        const n = cname.value.trim(); if (n.length < 2) { toast('Type a name for the team.', { bad: true }); cname.focus(); return; }
        try { await S.api.createCrew(n); await refreshCrews(); toast('Crew created. Share the code with your drivers.'); draw(); } catch { toast('Could not create the crew. Check your signal.', { bad: true }); }
      } }, h('h2', null, 'I run a company'), h('p', { class: 'muted' }, 'Set up your company, then send your drivers the join link. You can add admins (dispatchers), send loads and see team totals that drivers agree to share. Other companies never see your data.'), field('Team name', cname), h('button', { class: 'btn', type: 'submit' }, 'Create my crew')),
    ];
  }
  function companyCard(crew) {
    const name = textInput({ id: 'co-name', maxlength: 60, value: crew.name });
    const color = textInput({ id: 'co-color', maxlength: 7, value: crew.brand_color || '', placeholder: '#0b5cad', autocomplete: 'off', autocapitalize: 'off' });
    const phone = textInput({ id: 'co-phone', maxlength: 30, value: crew.phone || '', inputmode: 'tel', placeholder: 'Office phone' });
    return h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      if (name.value.trim().length < 2) { toast('Type the company name.', { bad: true }); name.focus(); return; }
      if (color.value.trim() && !/^#[0-9a-fA-F]{6}$/.test(color.value.trim())) { toast('Colour should look like #0b5cad, or leave it empty.', { bad: true }); color.focus(); return; }
      try { await S.api.updateCrew(crew.id, name.value.trim(), color.value.trim(), phone.value.trim()); await refreshCrews(); toast('Company details saved.'); draw(); }
      catch { toast('Could not save. Check your signal.', { bad: true }); }
    } }, h('h3', null, 'Company details'), field('Company name', name), field('Accent colour', color, { hint: 'Optional. Shown as a stripe on your crew page, for example #0b5cad.' }), field('Office phone', phone), h('button', { class: 'btn', type: 'submit' }, 'Save details'));
  }
  function joinCodeCard(crew) {
    const out2 = h('div', { class: 'card stack' }, h('h3', null, 'Code for drivers'));
    const body = h('div', { class: 'stack' });
    let shown = false, code = '';
    const paint = () => { clear(body); body.append(h('div', { class: 'big-num mono center', 'aria-live': 'polite' }, shown ? code : '••••••'),
      h('div', { class: 'btn-row two' }, h('button', { class: 'btn', type: 'button', onclick: async () => { if (!shown) { try { code = await S.api.joinCode(crew.id); shown = true; paint(); } catch { toast('Could not load the code.', { bad: true }); } } else { shown = false; paint(); } } }, shown ? 'Hide code' : 'Show code'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { if (!shown) { try { code = await S.api.joinCode(crew.id); shown = true; paint(); } catch { return; } } shareText(`Join "${crew.name}" on Roadbook. Tap this link, make a free account, and you are in: ${location.origin}${location.pathname}#/join/${code}  (or open the app, go to Crew and type the code ${code})`); } }, icon('share', 22), 'Send')),
      h('button', { class: 'link-btn', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Make a new code?', body: 'The old code stops working. People already in the crew stay.', yes: 'Make new code', no: 'No' })) { try { code = await S.api.newJoinCode(crew.id); shown = true; paint(); toast('New code made.'); } catch { toast('Could not make a new code.', { bad: true }); } } } }, 'Make a new code')); };
    paint(); out2.append(body);
    return out2;
  }
  draw();
  ctx.watch(['crews', 'messages', 'road_alerts'], draw);
  refreshCrews().then((ok) => { if (ok && ctx.isCurrent()) draw(); });
});

/* ---------- join link: #/join/CODE ---------- */
route('/join/:code', (ctx) => {
  const code = String(ctx.params.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  if (code) ls('roadbook.joinCode', code);
  go('/crew');
});

/* ---------- chat ---------- */
route('/chat', (ctx) => {
  ctx.header({ title: 'Chat', back: '/crew' });
  ctx.tab = 'crew';
  const crew = currentCrew();
  if (!crew) { ctx.root.append(empty('chat', 'No crew yet', null, h('a', { class: 'btn', href: '#/crew' }, 'Go to Crew'))); return; }
  const list = h('div', { class: 'chat', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' });
  const input = h('input', { type: 'text', maxlength: 1000, autocomplete: 'off', 'aria-label': 'Type a message', placeholder: 'Type a message' });
  const send = h('button', { class: 'icon-btn', type: 'submit', 'aria-label': 'Send message' }, icon('send', 26));
  const form = h('form', { class: 'compose', onsubmit: async (e) => {
    e.preventDefault();
    const body = input.value.trim(); if (!body) return;
    input.value = '';
    await store.save('messages', { id: uuid(), crew_id: crew.id, author_name: myName().slice(0, 60), body: body.slice(0, 1000) });
    haptic(15);
  } }, input, micButton((t) => { input.value = (input.value + ' ' + t).trim(); input.focus(); }, 'Speak your message'), send);
  ctx.root.append(list, h('div', { style: { height: '70px' } }), form);
  let lastCount = -1;
  function draw() {
    const msgs = store.rows('messages').filter((m) => m.crew_id === crew.id).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')).slice(-200);
    clear(list);
    if (!msgs.length) list.append(empty('chat', 'No messages yet', 'Say hello to the crew.'));
    let day = '';
    for (const m of msgs) {
      const d = fmtDate(m.created_at); if (d !== day) { day = d; list.append(h('div', { class: 'center muted small' }, d)); }
      const mine = m.user_id === store.userId();
      list.append(h('div', { class: 'msg' + (mine ? ' me' : '') }, !mine ? h('div', { class: 'who' }, m.author_name || 'Driver') : null, h('div', null, m.body),
        h('div', { class: 'when' }, fmtTime(m.created_at), m._dirty ? ' · sending…' : ''),
        h('div', { class: 'row', style: { gap: '4px', marginTop: '4px' } },
          h('button', { class: 'link-btn', type: 'button', style: { color: 'inherit', minHeight: '36px' }, onclick: () => speak(messageSpeech(m.author_name || 'Driver', m.body), { force: true }) }, 'Read aloud'),
          mine || crew.role === 'owner' || crew.role === 'admin' ? h('button', { class: 'link-btn', type: 'button', style: { color: 'inherit', minHeight: '36px' }, onclick: async () => {
            if (!(await confirmDialog({ title: 'Delete this message?', yes: 'Delete', no: 'No', danger: true }))) return;
            try { await S.api.deleteMessage(m.id); await store.save('messages', { ...m, deleted_at: new Date().toISOString() }, { fromServer: true }); } catch { toast('Could not delete. Check your signal.', { bad: true }); }
          } }, 'Delete') : null)));
    }
    if (msgs.length !== lastCount) { lastCount = msgs.length; requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight })); }
    const newest = msgs.at(-1)?.created_at; if (newest) ls(chatSeenKey(crew.id), newest);
  }
  draw();
  ctx.watch(['messages'], draw);
  S.sync?.run();
});

/* ---------- road alerts ---------- */
route('/alerts', (ctx) => {
  ctx.header({ title: 'Road alerts', back: '/crew', actions: [{ icon: 'plus', label: 'Report a problem', href: '#/alert/new' }] });
  ctx.tab = 'crew';
  const crew = currentCrew();
  if (!crew) { ctx.root.append(empty('alert', 'No crew yet', 'Join a crew to see road problems other drivers report.', h('a', { class: 'btn', href: '#/crew' }, 'Go to Crew'))); return; }
  const out = h('div', { class: 'stack' });
  ctx.root.append(h('a', { class: 'btn primary', href: '#/alert/new' }, icon('siren', 26), 'Report a road problem'), out);
  let here = S.tracker?.lastPosition() || null;
  async function draw() {
    clear(out);
    const list = activeAlerts(crew.id);
    if (!list.length) { out.append(empty('check', 'All clear', 'No problems reported in the last few hours.')); return; }
    for (const a of list) {
      const k = alertKind(a.kind);
      out.append(h('div', { class: 'card stack' }, h('div', { class: 'row' }, h('span', { class: 'ico item', style: { border: 0, padding: 0, minHeight: 0, width: 'auto' } }, h('span', { class: 'ico', style: { background: 'var(--red-soft)', color: 'var(--red)' } }, icon(k.icon, 28))),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: '700', fontSize: '1.15em' } }, k.label), h('div', { class: 'muted small' }, `${a.author_name || 'Driver'} · ${fmtRelative(a.created_at)}`))),
        a.note ? h('p', null, a.note) : null,
        here ? h('p', { class: 'muted' }, describeRelative(here, a, prefs().unit)) : null,
        h('div', { class: 'btn-row two' }, h('a', { class: 'btn small', href: mapsLink({ destination: `${a.lat},${a.lng}` }), target: '_blank', rel: 'noopener' }, icon('map', 22), 'Show on map'),
          h('button', { class: 'btn small', type: 'button', onclick: async () => { try { await S.api.clearAlert(a.id); await store.save('road_alerts', { ...a, cleared_at: new Date().toISOString() }, { fromServer: true }); toast('Marked as cleared.'); } catch { toast('Could not clear it. Check your signal.', { bad: true }); } } }, icon('check', 22), 'It is cleared')),
        h('button', { class: 'link-btn', type: 'button', onclick: () => speak(alertSpeech(a, here, prefs().unit), { force: true }) }, 'Read aloud')));
    }
  }
  draw();
  ctx.watch(['road_alerts'], draw);
  getPositionOnce({ timeout: 5000, maxAge: 120000 }).then((p) => { if (p && ctx.isCurrent()) { here = p; draw(); } });
  S.sync?.run();
});

route('/alert/new', (ctx) => {
  ctx.header({ title: 'Report a problem', back: '/crew' });
  ctx.tab = 'crew';
  const crew = currentCrew();
  if (!crew) { ctx.root.append(empty('alert', 'Join a crew first', 'Road alerts go to the other drivers in your crew.', h('a', { class: 'btn primary', href: '#/crew' }, 'Go to Crew'))); return; }
  let kind = null, pos = null;
  const note = textInput({ id: 'an', maxlength: 300, placeholder: 'What did you see? (optional)' });
  const where = h('div', { role: 'status', 'aria-live': 'polite' });
  const send = h('button', { class: 'btn primary', type: 'submit', disabled: true }, icon('siren', 26), 'Warn the crew');
  async function locate() {
    clear(where); where.append(h('div', { class: 'row' }, h('div', { class: 'spinner' }), h('span', null, 'Finding where you are…')));
    pos = await getPositionOnce({ timeout: 12000, maxAge: 20000 });
    clear(where);
    if (pos) { where.append(banner('ok', 'pin', `Got your position (within ${pos.accuracy} m).`)); }
    else where.append(banner('bad', 'alert', h('div', null, h('b', null, 'Could not find you.'), h('p', null, 'Turn on location for this app in your phone settings, then try again.'), h('button', { class: 'btn small', type: 'button', onclick: locate }, 'Try again'))));
    refresh();
  }
  const refresh = () => { send.disabled = !(kind && pos); };
  const chips = choiceChips(ALERT_KINDS, null, (id) => { kind = id; refresh(); }, { label: 'What is the problem?', wide: true });
  ctx.root.append(h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    if (!kind) { toast('Choose what the problem is.', { bad: true }); return; }
    if (!pos) { toast('Waiting for your position.', { bad: true }); return; }
    send.disabled = true;
    await store.save('road_alerts', { id: uuid(), crew_id: crew.id, author_name: myName().slice(0, 60), kind, note: note.value.trim().slice(0, 300), lat: pos.lat, lng: pos.lng, expires_at: new Date(Date.now() + 6 * 36e5).toISOString() });
    speak(`${alertKind(kind).label} reported. Thank you.`);
    toast('The crew has been warned.'); haptic(40); go('/alerts');
  } }, banner('', 'siren', 'This sends your position to everyone in your crew.'), h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'What is the problem?'), chips),
  h('div', { class: 'input-row' }, field('Note', note), h('div', { style: { alignSelf: 'end' } }, micButton((t) => { note.value = t.slice(0, 300); }, 'Say what you saw'))), where, send));
  locate();
});

/* ---------- owner report ---------- */
route('/crew/report', (ctx) => {
  ctx.header({ title: 'Team report', back: '/crew' });
  ctx.tab = 'crew';
  const crew = currentCrew();
  if (!crew || (crew.role !== 'owner' && crew.role !== 'admin')) { ctx.root.append(empty('lock', 'Only the owner or an admin can see this', null, h('a', { class: 'btn', href: '#/crew' }, 'Back'))); return; }
  const out = h('div', { class: 'stack' });
  let kind = 'week', rows = null;
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Period' });
  ctx.root.append(seg, out);
  async function load() {
    clear(seg);
    for (const [k, l] of [['week', 'This week'], ['month', 'This month']]) seg.append(h('button', { type: 'button', 'aria-pressed': String(k === kind), onclick: () => { kind = k; load(); } }, l));
    clear(out); out.append(h('div', { class: 'row' }, h('div', { class: 'spinner' }), h('span', null, 'Loading…')));
    const r = periodRange(kind);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    try { rows = await S.api.report(crew.id, iso(r.from), iso(new Date(r.to.getTime() - 864e5))); } catch { clear(out); out.append(banner('bad', 'alert', 'Could not load the report. Check your signal.')); return; }
    clear(out);
    if (!rows.length) { out.append(empty('users', 'No drivers yet', 'Give drivers your crew code.')); return; }
    out.append(banner('info', 'shield', 'Drivers choose whether to share their numbers. You only see totals from drivers who said yes.'));
    for (const d of rows) {
      if (!d.shared) { out.append(h('div', { class: 'card' }, h('b', null, d.display_name), h('p', { class: 'muted' }, 'Not sharing numbers with you.'))); continue; }
      const cur = (o) => Object.entries(o || {}).map(([c, v]) => money(v, c)).join(' + ') || money(0);
      out.append(h('div', { class: 'card stack' }, h('h3', null, d.display_name), kv('Distance', dist(d.distance_m)), kv('Trips', String(d.trips)), kv('Loads delivered', String(d.loads_delivered)), kv('Money in', cur(d.income)), kv('Spent', cur(d.expenses))));
    }
    out.append(h('button', { class: 'btn', type: 'button', onclick: () => download(`team-report-${kind}.csv`, '﻿' + toCSV(rows.filter((x) => x.shared), [{ label: 'Driver', get: (x) => x.display_name }, { label: 'Distance km', get: (x) => Math.round(x.distance_m / 10) / 100 }, { label: 'Trips', get: (x) => x.trips }, { label: 'Loads delivered', get: (x) => x.loads_delivered }, { label: 'Money in', get: (x) => Object.entries(x.income).map(([c, v]) => `${v / 100} ${c}`).join('; ') }, { label: 'Spent', get: (x) => Object.entries(x.expenses).map(([c, v]) => `${v / 100} ${c}`).join('; ') }]), 'text/csv') }, icon('download', 24), 'Download as spreadsheet'));
  }
  load();
});
