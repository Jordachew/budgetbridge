// The app's data layer. Screens read and write through here; the sync engine sits behind it.
//  - save(): stamps the row, marks it dirty (needs uploading), tells the screens to refresh.
//  - remove(): soft delete (deleted_at), so the delete also reaches the server.
// Local-only fields start with "_": _dirty (waiting to upload) and _v (edit counter).

import { Db, dbNameFor, TABLES } from './db.js';
import { uuid, nowIso } from './util.js';

const listeners = new Set();
let db = null;
let ctx = { userId: null, mode: 'local' };      // mode: 'local' | 'account'
let cache = new Map();                           // table -> rows (kept in memory for quick screens)
let profile = null;

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function emit(tables = TABLES) { for (const fn of [...listeners]) { try { fn(tables); } catch (e) { console.error(e); } } }

export const getCtx = () => ({ ...ctx });
export const getDb = () => db;
export const userId = () => ctx.userId || 'local';

export async function openStore(userIdOrNull, factory) {
  if (db) db.close();
  ctx = { userId: userIdOrNull, mode: userIdOrNull ? 'account' : 'local' };
  db = await Db.open(dbNameFor(userIdOrNull), factory);
  cache = new Map();
  for (const t of TABLES) cache.set(t, await db.all(t));
  profile = (await db.meta('profile')) || { display_name: '', truck_label: '', currency: 'JMD' };
  emit();
}
export function closeStore() { if (db) db.close(); db = null; cache = new Map(); emit(); }

export function rows(table, { includeDeleted = false } = {}) {
  const r = cache.get(table) || [];
  return includeDeleted ? r.slice() : r.filter((x) => !x.deleted_at);
}
export const find = (table, id) => (cache.get(table) || []).find((x) => x.id === id);

export async function save(table, row, { fromServer = false, silent = false } = {}) {
  const prev = find(table, row.id);
  let out;
  if (fromServer) out = { ...row, _dirty: false, _v: prev?._v ?? 0 };
  else {
    out = { ...(prev || {}), ...row };
    out.user_id = out.user_id || userId();
    out.created_at = out.created_at || nowIso();
    out.updated_at = nowIso();
    out._dirty = true;
    out._v = (prev?._v ?? 0) + 1;
  }
  await db.put(table, out);
  const list = cache.get(table);
  const i = list.findIndex((x) => x.id === out.id);
  if (i >= 0) list[i] = out; else list.push(out);
  if (!silent) emit([table]);
  if (!fromServer) kick();
  return out;
}

export function create(table, fields) { return save(table, { id: uuid(), ...fields }); }

export async function remove(table, id) {
  const prev = find(table, id);
  if (!prev) return;
  await save(table, { ...prev, deleted_at: nowIso() });
}

/** Marks a dirty row clean, but only if the driver has not edited it again meanwhile. */
export async function markClean(table, id, v) {
  const cur = find(table, id);
  if (!cur || cur._v !== v) return;
  const out = { ...cur, _dirty: false };
  await db.put(table, out);
  const list = cache.get(table);
  list[list.findIndex((x) => x.id === id)] = out;
}

export const dirtyRows = (table) => (cache.get(table) || []).filter((r) => r._dirty);
export const dirtyCount = () => TABLES.reduce((n, t) => n + dirtyRows(t).length, 0);

export const getProfile = () => ({ ...profile });
export async function setProfile(p, { dirty = true } = {}) {
  profile = { ...profile, ...p };
  await db.setMeta('profile', profile);
  if (dirty) { await db.setMeta('profile_dirty', true); kick(); }
  emit(['profile']);
}

let kickFn = null;
export const setKick = (fn) => { kickFn = fn; };
function kick() { if (kickFn) kickFn(); }

/** Strips local-only fields before sending to the server. */
export const toServer = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('_')));

/** Bulk-adds rows (used when a no-account phone is turned into an account). Rows are marked as waiting to upload. */
export async function importRows(table, newRows) {
  if (!newRows.length) return;
  const list = cache.get(table);
  const out = newRows.map((r) => ({ ...r, _dirty: true, _v: 1 }));
  await db.putMany(table, out);
  for (const r of out) { const i = list.findIndex((x) => x.id === r.id); if (i >= 0) list[i] = r; else list.push(r); }
  emit([table]);
  kick();
}
