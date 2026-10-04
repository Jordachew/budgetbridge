import { h, icon, clear, ls } from '../util.js';
import * as store from '../store.js';
import { route } from '../router.js';
import { S, isAccount, lastUser } from '../session.js';
import { field, textInput, selectInput, segmented, switchRow, toast, confirmDialog, openSheet, banner, kv, infoDialog } from '../ui.js';
import { prefs, setPref } from '../prefs.js';
import { speak, canSpeak, canListen } from '../voice.js';
import { enableNotifications, notificationsAllowed } from '../engine.js';
import { fmtDateTime } from '../format.js';
import { download } from './common.js';
import { signUp, signOut, friendlyAuthError } from '../auth.js';
import { TABLES } from '../db.js';
import { getInstallPrompt } from '../install.js';

export const APP_VERSION = '1.0.0';

route('/settings/:section', (ctx) => renderSettings(ctx), {});
route('/settings', (ctx) => renderSettings(ctx), {});

function section(title, ...kids) { return h('section', { class: 'card stack', 'aria-label': title }, h('h2', null, title), ...kids); }

function renderSettings(ctx) {
  ctx.header({ title: 'Settings', back: '/' });
  ctx.tab = 'none';
  const out = h('div', { class: 'stack' });
  ctx.root.append(out);
  function draw() {
    clear(out);
    const p = store.getProfile();
    const name = textInput({ id: 'sn', maxlength: 60, value: p.display_name || '', autocomplete: 'name' });
    const truck = textInput({ id: 'st', maxlength: 40, value: p.truck_label || '', placeholder: 'e.g. Hino 500, JA 1234' });
    const cur = selectInput([{ value: 'JMD', label: 'Jamaican dollars (J$)' }, { value: 'USD', label: 'US dollars (US$)' }], p.currency || 'JMD', { id: 'sc' });
    out.append(section('About you',
      field('Your name', name, { hint: 'Other drivers in your crew see this.' }), field('Truck', truck), field('Money', cur),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => { await store.setProfile({ display_name: name.value.trim(), truck_label: truck.value.trim(), currency: cur.value }); toast('Saved.'); } }, 'Save')));

    out.append(section('Looks',
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Text size'), segmented([{ id: '100', label: 'Normal' }, { id: '115', label: 'Large' }, { id: '130', label: 'Huge' }], String(prefs().textSize), (v) => setPref({ textSize: Number(v) }), 'Text size')),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Colours'), segmented([{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Day' }, { id: 'dark', label: 'Night' }], prefs().theme, (v) => setPref({ theme: v }), 'Colours')),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Distance'), segmented([{ id: 'km', label: 'Kilometres' }, { id: 'mi', label: 'Miles' }], prefs().unit, (v) => setPref({ unit: v }), 'Distance unit'))));

    const rate = h('input', { type: 'range', min: '0.7', max: '1.2', step: '0.05', value: String(prefs().voiceRate), 'aria-label': 'How fast the voice talks' });
    rate.addEventListener('change', () => setPref({ voiceRate: Number(rate.value) }));
    const radius = selectInput([5, 15, 30, 50, 100].map((k) => ({ value: String(k), label: `${k} km` })), String(prefs().alertRadiusKm), { id: 'rad' });
    radius.addEventListener('change', () => setPref({ alertRadiusKm: Number(radius.value) }));
    out.append(section('Voice and alerts',
      canSpeak() ? null : banner('', 'alert', 'This phone cannot speak out loud from the browser. Alerts will show on screen only.'),
      switchRow('Speak alerts and reminders', prefs().voice, (v) => setPref({ voice: v }), 'The phone reads out reminders, road warnings and trip updates.'),
      field('Voice speed', rate, { hint: 'Slide left for slower.' }),
      h('button', { class: 'btn', type: 'button', onclick: () => speak('This is how your Roadbook alerts will sound. Warning. Flooding reported 3 kilometres ahead. Take care.', { force: true }) }, icon('speaker', 24), 'Test the voice'),
      field('Warn me about road problems within', radius, { hint: 'Only for problems reported by your crew.' }),
      switchRow('Read new crew messages aloud', prefs().readMessages, (v) => setPref({ readMessages: v })),
      switchRow('Buzz', prefs().haptics, (v) => setPref({ haptics: v })),
      'Notification' in window ? h('div', { class: 'stack' }, h('button', { class: 'btn', type: 'button', onclick: async () => { const ok = await enableNotifications(); toast(ok ? 'Notifications are on.' : 'Blocked. Allow notifications for this app in your phone settings.', { bad: !ok }); draw(); } }, icon('bell', 24), notificationsAllowed() && prefs().notify ? 'Notifications are on' : 'Turn on notifications')) : null,
      h('p', { class: 'small muted' }, 'Voice and pop-ups work while Roadbook is open. For reminders when the app is closed, use "Add to my phone calendar" on the Reminders page.'),
      canListen() ? h('p', { class: 'small muted' }, 'Voice typing (the microphone button) uses your browser\'s speech service, which may send what you say to the browser maker to turn it into text. It only listens after you tap the microphone.') : null));

    // backup
    const st = S.sync?.getStatus() || S.status;
    const backup = section('Backup and sync', id('sync'));
    if (isAccount()) {
      backup.append(h('p', null, `Signed in as ${S.user.email || 'your account'}.`),
        kv('Status', { idle: 'Backed up', syncing: 'Syncing…', offline: 'No signal', error: 'Problem', signedout: 'Sign in again' }[st.state] || 'Backed up'),
        kv('Waiting to upload', String(store.dirtyCount())), st.lastOk ? kv('Last backup', fmtDateTime(new Date(st.lastOk))) : null,
        st.error ? banner('bad', 'alert', st.error) : null,
        S.sync?.failedItems().length ? banner('bad', 'alert', h('div', null, h('b', null, `${S.sync.failedItems().length} item(s) could not be saved to the cloud.`), h('p', { class: 'small' }, 'They are safe on this phone. Try again, or edit them.'), h('button', { class: 'btn small', type: 'button', onclick: () => S.sync.retryFailed().then(draw) }, 'Try again'))) : null,
        h('button', { class: 'btn', type: 'button', onclick: async () => { toast('Syncing…'); const r = await S.sync.run(); toast(r.state === 'idle' ? 'All backed up.' : r.state === 'offline' ? 'No signal. Your records are saved on this phone and will upload later.' : 'There was a problem. Try again later.', { bad: r.state === 'error' }); draw(); } }, icon('sync', 24), 'Back up now'));
    } else {
      backup.append(banner('', 'offline', h('div', null, h('b', null, 'Your records are only on this phone.'), h('p', null, 'If the phone is lost or reset, they are gone. Make a free account to back them up and use Crew features.'))),
        h('button', { class: 'btn primary', type: 'button', onclick: () => createAccountSheet() }, icon('shield', 24), 'Make an account and back up'));
    }
    out.append(backup);

    const install = getInstallPrompt();
    out.append(section('Put Roadbook on your home screen',
      install.canPrompt() ? h('button', { class: 'btn primary', type: 'button', onclick: async () => { const r = await install.prompt(); if (r === 'accepted') toast('Installed. Look for Roadbook on your home screen.'); draw(); } }, icon('download', 24), 'Install the app')
        : install.isStandalone() ? h('p', { class: 'pos' }, 'Roadbook is installed on this phone.')
        : install.isIOS() ? h('p', null, 'On an iPhone: tap the Share button at the bottom of Safari, then "Add to Home Screen".')
        : h('p', null, 'Open your browser menu (the three dots) and choose "Install app" or "Add to Home screen".')));

    out.append(section('Your data',
      h('button', { class: 'btn', type: 'button', onclick: exportAll }, icon('download', 24), 'Download all my records'),
      h('a', { class: 'btn ghost', href: 'privacy.html', target: '_blank', rel: 'noopener' }, icon('lock', 24), 'Privacy notice'),
      h('a', { class: 'btn ghost', href: 'accessibility.html', target: '_blank', rel: 'noopener' }, icon('eye', 24), 'Accessibility'),
      h('button', { class: 'btn danger', type: 'button', onclick: deleteEverything }, icon('trash', 24), isAccount() ? 'Delete all my Roadbook data' : 'Erase everything on this phone')));

    out.append(section('Help',
      h('a', { class: 'btn', href: '#/help' }, icon('doc', 24), 'How to use Roadbook'),
      isAccount() ? h('button', { class: 'btn', type: 'button', onclick: async () => { if (store.dirtyCount() && !(await confirmDialog({ title: 'Sign out?', body: `${store.dirtyCount()} change(s) have not uploaded yet. They stay on this phone and upload next time you sign in.`, yes: 'Sign out', no: 'Stay signed in' }))) return; await signOut(); lastUser(null); location.hash = '#/'; location.reload(); } }, 'Sign out') : null,
      h('p', { class: 'small muted center' }, `Roadbook version ${APP_VERSION}`)));
  }
  const id = (x) => h('span', { id: x, class: 'sr-only' }, '');
  draw();
  ctx.watch(['profile'], draw);
  if (ctx.params.section) setTimeout(() => document.getElementById(ctx.params.section)?.scrollIntoView(), 50);
}

async function exportAll() {
  const data = { app: 'Roadbook', exported_at: new Date().toISOString(), profile: store.getProfile() };
  for (const t of TABLES) data[t] = store.rows(t, { includeDeleted: false }).map(store.toServer);
  download(`roadbook-all-my-records-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('Your records are downloaded as a file.');
}

async function deleteEverything() {
  const acct = isAccount();
  const ok = await openSheet((close) => {
    const inp = textInput({ id: 'del', autocomplete: 'off', placeholder: 'Type DELETE' });
    return [h('h2', null, acct ? 'Delete your Roadbook data?' : 'Erase this phone?'),
      h('p', null, acct ? 'This permanently deletes all your Roadbook records, receipts and delivery photos from the cloud and from this phone. It cannot be undone. Your sign-in login is shared with other apps and stays; ask us if you want that removed too.' : 'This permanently erases every record stored in Roadbook on this phone. It cannot be undone.'),
      h('p', { class: 'muted small' }, 'Tip: download your records first.'), field('Type DELETE to confirm', inp),
      h('button', { class: 'btn danger', type: 'button', onclick: () => { if (inp.value.trim().toUpperCase() !== 'DELETE') { toast('Type the word DELETE to confirm.', { bad: true }); inp.focus(); return; } close(true); } }, acct ? 'Delete everything' : 'Erase everything'),
      h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, 'No, keep my records')];
  }, { center: true, label: 'Confirm delete' });
  if (!ok) return;
  try {
    if (acct) {
      if (!navigator.onLine) { toast('You need a signal to delete your data.', { bad: true }); return; }
      await S.api.deleteMyAccount();
      await signOut();
    }
    await store.getDb().wipe();
    ls('roadbook.prefs.v1', null); lastUser(null);
    indexedDB.deleteDatabase(store.getDb().name);
    toast('Everything has been deleted.');
    setTimeout(() => { location.hash = '#/'; location.reload(); }, 800);
  } catch (e) { console.error(e); toast('Could not delete. Check your signal and try again.', { bad: true }); }
}

function createAccountSheet() {
  return openSheet((close) => {
    const name = textInput({ id: 'cn1', maxlength: 60, value: store.getProfile().display_name || '', autocomplete: 'name' });
    const email = textInput({ id: 'ce1', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'none' });
    const pw = textInput({ id: 'cp1', type: 'password', autocomplete: 'new-password', minlength: 8 });
    const msg = h('div', { role: 'alert' });
    const go1 = h('button', { class: 'btn primary', type: 'submit' }, 'Create account');
    return [h('h2', null, 'Make an account'), h('p', { class: 'muted' }, 'Your records on this phone will be copied into your account.'),
      h('form', { class: 'stack', onsubmit: async (e) => {
        e.preventDefault(); clear(msg);
        if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) { msg.append(banner('bad', 'alert', 'Type your email address.')); return; }
        if (pw.value.length < 8) { msg.append(banner('bad', 'alert', 'Use a password of at least 8 letters or numbers.')); return; }
        go1.disabled = true;
        try {
          ls('roadbook.migrateLocal', email.value.trim().toLowerCase());
          const r = await signUp(email.value, pw.value, name.value);
          if (r.needsConfirm) { close(null); await infoDialog('Check your email', h('p', null, `We sent a link to ${email.value.trim()}. Tap it, then open Roadbook and sign in. Your records will be copied across.`)); await signOut(); location.reload(); return; }
          setPref({ lastMode: 'account' }); close(null); location.reload();
        } catch (err) { ls('roadbook.migrateLocal', null); msg.append(banner('bad', 'alert', friendlyAuthError(err))); go1.disabled = false; }
      } }, field('Your name', name), field('Email', email), field('Password', pw, { hint: 'At least 8 letters or numbers.' }), msg, go1),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'Not now')];
  }, { label: 'Make an account' });
}
