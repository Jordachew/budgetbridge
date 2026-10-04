// Moves everything recorded in "no account" mode into a new account, then clears the old copy.
import { Db, dbNameFor, TABLES } from './db.js';
import * as store from './store.js';

const swap = (p, uid) => (typeof p === 'string' && p.startsWith('local/') ? `${uid}/${p.slice(6)}` : p);

export async function migrateLocalToAccount(uid, factory = globalThis.indexedDB) {
  const local = await Db.open(dbNameFor(null), factory);
  let moved = 0;
  try {
    const acct = store.getDb();
    for (const t of TABLES) {
      const rows = (await local.all(t)).filter((r) => !r.deleted_at).map((r) => {
        const o = { ...r, user_id: uid };
        if (t === 'loads') o.created_by = uid;
        for (const k of ['receipt_path', 'signature_path', 'photo_path']) if (k in o) o[k] = swap(o[k], uid);
        return o;
      });
      if (t === 'messages' || t === 'road_alerts') continue;
      await store.importRows(t, rows);
      moved += rows.length;
    }
    for (const f of await local.allFiles()) await acct.putFile(swap(f.path, uid), f.blob, false);
    const prof = await local.meta('profile');
    if (prof) await store.setProfile({ ...prof }, { dirty: true });
    await local.wipe();
  } finally { local.close(); }
  return moved;
}
export async function localHasData(factory = globalThis.indexedDB) {
  const local = await Db.open(dbNameFor(null), factory);
  try {
    for (const t of TABLES) if ((await local.all(t)).some((r) => !r.deleted_at)) return true;
    return false;
  } finally { local.close(); }
}
