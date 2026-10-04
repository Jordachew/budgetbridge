// Sync engine. The phone is the source of truth while offline; when there is signal it
//   1) uploads waiting files, 2) uploads changed rows, 3) downloads rows changed elsewhere.
// The server API is injected (api-supabase.js in the app, a fake in tests).

import { TABLES } from './db.js';
import * as store from './store.js';

const OVERLAP_MS = 2 * 60 * 1000;       // re-read the last 2 minutes: late-committing rows are never missed
const BATCH = 50;
export const SHARED_TABLES = new Set(['messages', 'road_alerts']);   // insert-only for the driver; deletes go through RPCs

export function isNetworkError(e) {
  if (!e) return false;
  if (e.name === 'TypeError' || /fetch|network|load failed|failed to fetch/i.test(e.message || '')) return true;
  return e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500;
}
// Only a real sign-in problem. A 403 can just mean one row broke a rule (e.g. you left the crew), so it must not stop the rest.
export const isAuthError = (e) => e && (e.status === 401 || /jwt|not authenticated/i.test(e.message || ''));

/** Local row is waiting to upload -> keep it. Otherwise the server copy wins. */
export function shouldApply(local) { return !local || !local._dirty; }

export function createSync({ api, onStatus = () => {}, now = () => Date.now() }) {
  let running = false;
  let again = false;
  let timer = null;
  const failed = new Map();            // "table:id" -> message; skipped for the rest of this session
  let status = { state: 'idle', lastOk: null, pending: 0, failed: 0, error: null };

  const set = (patch) => { status = { ...status, ...patch, pending: store.dirtyCount(), failed: failed.size }; onStatus(status); };

  async function pushFiles() {
    const db = store.getDb();
    for (const f of await db.pendingFiles()) {
      if (failed.has(`file:${f.path}`)) continue;
      try {
        await api.uploadFile(f.path, f.blob, f.type);
        await db.markUploaded(f.path);
      } catch (e) {
        if (isNetworkError(e) || isAuthError(e)) throw e;
        failed.set(`file:${f.path}`, e.message || 'refused');   // one refused file must not block everything else
      }
    }
  }

  async function pushTable(table) {
    const dirty = store.dirtyRows(table).filter((r) => !failed.has(`${table}:${r.id}`));
    for (let i = 0; i < dirty.length; i += BATCH) {
      const batch = dirty.slice(i, i + BATCH);
      try {
        await api.upsert(table, batch.map(store.toServer));
        for (const r of batch) await store.markClean(table, r.id, r._v);
      } catch (e) {
        if (isNetworkError(e) || isAuthError(e)) throw e;
        // The server refused something in this batch: try one by one so one bad row cannot block the rest.
        for (const r of batch) {
          try { await api.upsert(table, [store.toServer(r)]); await store.markClean(table, r.id, r._v); }
          catch (e2) {
            if (isNetworkError(e2) || isAuthError(e2)) throw e2;
            failed.set(`${table}:${r.id}`, e2.message || 'refused');
          }
        }
      }
    }
  }

  async function pullTable(table) {
    const db = store.getDb();
    const cur = await db.meta(`cursor:${table}`);
    const since = cur ? new Date(new Date(cur).getTime() - OVERLAP_MS).toISOString() : null;
    const rows = await api.pull(table, since);
    let max = cur || null;
    for (const r of rows) {
      if (!r || !r.id) continue;
      if (!max || r.updated_at > max) max = r.updated_at;
      if (shouldApply(store.find(table, r.id))) {
        const prev = store.find(table, r.id);
        if (prev && prev.updated_at === r.updated_at && !prev._dirty) continue;   // nothing new
        await store.save(table, r, { fromServer: true, silent: true });
      }
    }
    if (max && max !== cur) await db.setMeta(`cursor:${table}`, max);
    return rows.length;
  }

  async function run({ pull = true } = {}) {
    if (running) { again = true; return status; }
    if (!store.getDb() || store.getCtx().mode !== 'account') return status;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { set({ state: 'offline' }); return status; }
    running = true;
    set({ state: 'syncing', error: null });
    try {
      const db = store.getDb();
      await pushFiles();
      if (await db.meta('profile_dirty')) {
        await api.saveProfile(store.getProfile());
        await db.setMeta('profile_dirty', false);
      }
      for (const t of TABLES) await pushTable(t);
      let changed = 0;
      if (pull) {
        let prof = await api.getProfile();
        if (!prof) { await api.saveProfile(store.getProfile()); prof = null; }   // first sign-in: create it
        if (prof && !(await db.meta('profile_dirty'))) await store.setProfile(prof, { dirty: false });
        for (const t of TABLES) changed += await pullTable(t);
      }
      set({ state: 'idle', lastOk: now(), error: null });
      if (changed) store.emit(TABLES);
    } catch (e) {
      if (isAuthError(e)) set({ state: 'signedout', error: 'Please sign in again' });
      else if (isNetworkError(e)) set({ state: 'offline', error: null });
      else set({ state: 'error', error: e.message || 'Could not sync' });
    } finally {
      running = false;
      if (again) { again = false; schedule(500); }
    }
    return status;
  }

  function schedule(ms = 2000) { clearTimeout(timer); timer = setTimeout(() => { run(); }, ms); }
  const stop = () => clearTimeout(timer);

  /** Fetches a file: from this phone if we have it, else from the server (and keeps a copy). */
  async function fetchFile(path) {
    const db = store.getDb();
    const local = await db.getFile(path);
    if (local) return local.blob;
    const blob = await api.downloadFile(path);
    if (blob) await db.putFile(path, blob, true);
    return blob;
  }

  return { run, schedule, stop, fetchFile, getStatus: () => status, failedItems: () => [...failed.entries()], retryFailed: () => { failed.clear(); return run(); } };
}
