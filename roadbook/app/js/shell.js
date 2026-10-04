// The frame around every screen: green sign-board header, bottom tab bar, screen-reader announcements.
import { h, icon, clear } from './util.js';
import { S } from './session.js';
import { announce } from './ui.js';

export const TABS = [
  { id: 'home', label: 'Home', icon: 'home', href: '#/' },
  { id: 'trips', label: 'Trips', icon: 'gps', href: '#/trips' },
  { id: 'loads', label: 'Loads', icon: 'box', href: '#/loads' },
  { id: 'money', label: 'Money', icon: 'wallet', href: '#/money' },
  { id: 'crew', label: 'Crew', icon: 'chat', href: '#/crew' },
];

export function buildShell(app, { appName = 'Roadbook' } = {}) {
  clear(app);
  const backBtn = h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Go back', hidden: true }, icon('back', 28));
  const title = h('h1', { id: 'page-title' }, appName);
  const actions = h('div', { class: 'row', style: { gap: '0' } });
  const syncDot = h('span', { class: 'sync-dot', 'aria-hidden': 'true' });
  const syncBtn = h('a', { class: 'icon-btn', href: '#/settings/sync', 'aria-label': 'Sync status' }, icon('sync', 26), syncDot);
  const top = h('header', { class: 'topbar' }, backBtn, title, actions, syncBtn);
  const main = h('main', { id: 'main', tabindex: '-1' });
  const tabEls = {};
  const nav = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, TABS.map((t) => {
    const a = h('a', { class: 'tab', href: t.href, dataset: { tab: t.id } }, icon(t.icon, 28), h('span', null, t.label));
    tabEls[t.id] = a;
    return a;
  }));
  app.append(top, main, nav);

  function setSync(st) {
    syncDot.className = 'sync-dot' + (!S.user ? ' off' : st.state === 'offline' || !S.online ? ' off' : st.state === 'error' || st.state === 'signedout' ? ' err' : st.state === 'syncing' ? ' busy' : '');
    const label = !S.user ? 'Saved on this phone only' : st.state === 'offline' ? 'Offline: changes are saved on this phone' : st.state === 'syncing' ? 'Syncing' : st.state === 'error' ? 'Sync problem' : st.pending ? `${st.pending} waiting to upload` : 'Everything is backed up';
    syncBtn.setAttribute('aria-label', 'Sync status: ' + label);
    syncBtn.title = label;
  }
  function setBadge(tabId, n) {
    const el = tabEls[tabId];
    el.querySelector('.badge')?.remove();
    if (n > 0) el.append(h('span', { class: 'badge', 'aria-label': `${n} new` }, n > 99 ? '99+' : String(n)));
  }

  return {
    root: () => main,
    setSync, setBadge,
    header({ title: t, back = null, actions: acts = [] } = {}) {
      title.textContent = t || appName;
      document.title = (t && t !== appName ? t + ' · ' : '') + appName;
      backBtn.hidden = !back;
      if (back) backBtn.setAttribute('href', '#' + back);
      clear(actions);
      for (const a of acts) {
        actions.append(a.href
          ? h('a', { class: 'icon-btn', href: a.href, 'aria-label': a.label }, icon(a.icon, 26))
          : h('button', { class: 'icon-btn', type: 'button', 'aria-label': a.label, onclick: a.onClick }, icon(a.icon, 26)));
      }
    },
    beforeRender() { /* tab highlighting happens in afterRender, once the screen has said which tab it belongs to */ },
    afterRender(ctx) {
      for (const [id, el] of Object.entries(tabEls)) { if (id === ctx.tab) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); }
      if (!ctx.keepScroll) window.scrollTo(0, 0);
      if (!ctx.noFocus) main.focus({ preventScroll: true });
      announce(title.textContent);
    },
    crash(root, e) {
      clear(root);
      root.append(h('div', { class: 'banner bad' }, icon('alert', 24), h('div', null, h('b', null, 'Something went wrong on this screen.'), h('p', null, 'Your saved records are safe. Go back Home and try again.'), h('a', { class: 'btn', href: '#/' }, 'Go Home'))));
      console.error(e);
    },
  };
}
