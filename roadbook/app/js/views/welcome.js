// First screen: sign in, create an account, or use the app on this phone only.
import { h, icon, clear } from '../util.js';
import { field, textInput, btn } from '../ui.js';
import { signIn, signUp, resetPassword, updatePassword, friendlyAuthError, configured } from '../auth.js';
import { setPref } from '../prefs.js';

const cfg = () => window.ROADBOOK_CONFIG || {};

export function showWelcome(app, { onDone, startMode = 'signin' } = {}) {
  clear(app);
  let mode = startMode;
  const box = h('div', { class: 'auth-card' });
  const msg = h('div', { role: 'alert' });
  const draw = () => {
    clear(box);
    const email = textInput({ type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'none', spellcheck: 'false', required: true, id: 'a-email' });
    const pw = textInput({ type: 'password', autocomplete: mode === 'signup' ? 'new-password' : 'current-password', required: true, id: 'a-pw', minlength: 8 });
    const name = textInput({ autocomplete: 'name', id: 'a-name', maxlength: 60 });
    const show = h('button', { type: 'button', class: 'link-btn', 'aria-pressed': 'false', onclick: () => { const on = pw.type === 'password'; pw.type = on ? 'text' : 'password'; show.textContent = on ? 'Hide password' : 'Show password'; show.setAttribute('aria-pressed', String(on)); } }, 'Show password');
    const fEmail = field('Email', email);
    const fPw = field(mode === 'signup' ? 'Choose a password' : 'Password', pw, { hint: mode === 'signup' ? 'At least 8 letters or numbers.' : '' });
    const fName = field('Your name', name, { hint: 'Other drivers will see this name.' });
    const submit = h('button', { class: 'btn primary', type: 'submit' }, mode === 'signup' ? 'Create my account' : 'Sign in');
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      fEmail.setError(''); fPw.setError(''); clear(msg);
      const em = email.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(em)) { fEmail.setError('Type your email, like name@example.com'); email.focus(); return; }
      if (pw.value.length < (mode === 'signup' ? 8 : 1)) { fPw.setError(mode === 'signup' ? 'Use at least 8 letters or numbers.' : 'Type your password.'); pw.focus(); return; }
      submit.disabled = true; submit.textContent = 'One moment…';
      try {
        if (mode === 'signup') {
          const r = await signUp(em, pw.value, name.value);
          if (r.needsConfirm) { msg.append(h('div', { class: 'banner ok' }, icon('check', 24), h('div', null, h('b', null, 'Check your email.'), h('p', null, `We sent a link to ${em}. Tap it, then come back and sign in.`)))); mode = 'signin'; submit.disabled = false; submit.textContent = 'Sign in'; return; }
        } else await signIn(em, pw.value);
        setPref({ lastMode: 'account' });
        onDone();
      } catch (err) {
        msg.append(h('div', { class: 'banner bad' }, icon('alert', 24), h('div', null, friendlyAuthError(err))));
        submit.disabled = false; submit.textContent = mode === 'signup' ? 'Create my account' : 'Sign in';
      }
    } },
    mode === 'signup' ? fName : null, fEmail, fPw, h('div', null, show), msg, submit,
    mode === 'signup' ? h('p', { class: 'small muted' }, 'By creating an account you agree that Roadbook stores your records as described in the ', h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy Notice'), '.') : null);

    box.append(
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Sign in or create account' },
        h('button', { type: 'button', 'aria-pressed': String(mode === 'signin'), onclick: () => { mode = 'signin'; draw(); } }, 'Sign in'),
        h('button', { type: 'button', 'aria-pressed': String(mode === 'signup'), onclick: () => { mode = 'signup'; draw(); } }, 'New here')),
      form,
      mode === 'signin' ? h('button', { class: 'link-btn', type: 'button', onclick: async () => {
        const em = email.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(em)) { fEmail.setError('Type your email above first, then tap this again.'); email.focus(); return; }
        clear(msg);
        try { await resetPassword(em); msg.append(h('div', { class: 'banner ok' }, icon('check', 24), h('div', null, 'If that email has an account, we sent a link to choose a new password.'))); }
        catch (err) { msg.append(h('div', { class: 'banner bad' }, icon('alert', 24), h('div', null, friendlyAuthError(err)))); }
      } }, 'I forgot my password') : null,
    );
  };
  draw();

  app.append(h('div', { class: 'splash' },
    h('div', { class: 'guide-sign' }, icon('truck', 64), h('h1', null, cfg().appName || 'Roadbook'), h('p', null, 'Expenses, miles and loads. In your pocket. Works with no signal.')),
    box,
    h('div', { class: 'auth-card' },
      h('h3', null, 'Just want to try it?'),
      h('p', { class: 'muted' }, 'Use Roadbook on this phone only. Nothing is sent anywhere. You can make an account later to back everything up.'),
      btn('Use without an account', () => { setPref({ lastMode: 'local' }); onDone(); }, { kind: '' })),
    h('p', { class: 'small' }, h('a', { href: 'privacy.html', style: { color: '#fff' }, target: '_blank', rel: 'noopener' }, 'Privacy'), ' · ', h('a', { href: 'accessibility.html', style: { color: '#fff' }, target: '_blank', rel: 'noopener' }, 'Accessibility'))));
}

export function showSetPassword(app, { onDone }) {
  clear(app);
  const pw = textInput({ type: 'password', autocomplete: 'new-password', id: 'np', minlength: 8 });
  const f = field('New password', pw, { hint: 'At least 8 letters or numbers.' });
  const msg = h('div', { role: 'alert' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, 'Save new password');
  app.append(h('div', { class: 'splash' }, h('div', { class: 'auth-card' }, h('h2', null, 'Choose a new password'),
    h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); clear(msg); f.setError('');
      if (pw.value.length < 8) { f.setError('Use at least 8 letters or numbers.'); return; }
      go.disabled = true;
      try { await updatePassword(pw.value); onDone(); } catch (err) { msg.append(h('div', { class: 'banner bad' }, icon('alert', 24), h('div', null, friendlyAuthError(err)))); go.disabled = false; }
    } }, f, msg, go))));
}
export const authAvailable = configured;
