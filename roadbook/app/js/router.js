// Tiny hash router. Each route handler draws into ctx.root and may register clean-up work.
import { onChange } from './store.js';
import { clear } from './util.js';

const routes = [];
let leaveFns = [];
let shell = null;
let gen = 0;

export function route(pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, handler, opts });
}
export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { path: path || '/', query };
}
export function go(path, { replace = false } = {}) {
  const target = '#' + path;
  if (replace) { history.replaceState(null, '', target); render(); }
  else if (location.hash === target) render();
  else location.hash = target;
}

export function start(shellApi) {
  shell = shellApi;
  window.addEventListener('hashchange', render);
  render();
}

export function render() {
  const my = ++gen;
  for (const f of leaveFns.splice(0)) { try { f(); } catch (e) { console.error(e); } }
  const { path, query } = parseHash();
  let match = null;
  for (const r of routes) { const m = r.re.exec(path); if (m) { match = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; break; } }
  if (!match) match = { r: routes.find((x) => x.opts.notFound) || routes[0], params: {} };
  const root = shell.root();
  clear(root);
  const ctx = {
    root, params: match.params, query, path,
    header: (h) => shell.header(h),
    tab: match.r.opts.tab ?? null,
    isCurrent: () => my === gen,
    onLeave: (fn) => leaveFns.push(fn),
    /** Re-run `draw` whenever any of these tables change (debounced). */
    watch(tables, draw) {
      let t = null;
      const off = onChange((changed) => {
        if (!changed.some((c) => tables.includes(c))) return;
        clearTimeout(t); t = setTimeout(() => { if (my === gen) draw(); }, 80);
      });
      leaveFns.push(() => { off(); clearTimeout(t); });
    },
  };
  shell.beforeRender(ctx);
  try {
    const out = match.r.handler(ctx);
    if (out && typeof out.catch === 'function') out.catch((e) => { console.error(e); shell.crash(root, e); });
  } catch (e) { console.error(e); shell.crash(root, e); }
  shell.afterRender(ctx);
}
