// On-device database (IndexedDB). Everything the driver does is saved here first, so the app
// works with no signal. Each account (or the no-account "local" mode) gets its own database,
// so two people sharing a phone never see each other's records.

export const TABLES = ['loads', 'expenses', 'income', 'trips', 'deliveries', 'reminders', 'route_plans', 'messages', 'road_alerts',
  'vehicles', 'invoices', 'maintenance', 'documents', 'places', 'settlements'];
export const SYNCED_UP = TABLES;
const FILES = 'files';
const META = 'meta';

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('aborted')); });

export function dbNameFor(userId) { return `roadbook:${userId || 'local'}`; }

export class Db {
  constructor(idb, name) { this.idb = idb; this.name = name; }

  static async open(name, factory = globalThis.indexedDB) {
    const open = factory.open(name, 2);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'path' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'k' });
    };
    return new Db(await req(open), name);
  }

  close() { this.idb.close(); }

  async all(table) { return req(this.idb.transaction(table).objectStore(table).getAll()); }
  async get(table, id) { return req(this.idb.transaction(table).objectStore(table).get(id)); }
  async put(table, row) { const tx = this.idb.transaction(table, 'readwrite'); tx.objectStore(table).put(row); return done(tx); }
  async putMany(table, rows) {
    if (!rows.length) return;
    const tx = this.idb.transaction(table, 'readwrite');
    for (const r of rows) tx.objectStore(table).put(r);
    return done(tx);
  }
  async remove(table, id) { const tx = this.idb.transaction(table, 'readwrite'); tx.objectStore(table).delete(id); return done(tx); }
  async clearTable(table) { const tx = this.idb.transaction(table, 'readwrite'); tx.objectStore(table).clear(); return done(tx); }

  async meta(k) { const r = await req(this.idb.transaction(META).objectStore(META).get(k)); return r ? r.v : undefined; }
  async setMeta(k, v) { const tx = this.idb.transaction(META, 'readwrite'); tx.objectStore(META).put({ k, v }); return done(tx); }

  // Files (receipt photos, signatures). `uploaded` false means still waiting to go to the server.
  async putFile(path, blob, uploaded = false) {
    const tx = this.idb.transaction(FILES, 'readwrite');
    tx.objectStore(FILES).put({ path, blob, type: blob.type || 'application/octet-stream', uploaded, at: Date.now() });
    return done(tx);
  }
  async getFile(path) { return req(this.idb.transaction(FILES).objectStore(FILES).get(path)); }
  async markUploaded(path) {
    const f = await this.getFile(path);
    if (f) await this.putFile(path, f.blob, true);
  }
  async pendingFiles() { return (await req(this.idb.transaction(FILES).objectStore(FILES).getAll())).filter((f) => !f.uploaded); }
  async allFiles() { return req(this.idb.transaction(FILES).objectStore(FILES).getAll()); }
  async removeFile(path) { const tx = this.idb.transaction(FILES, 'readwrite'); tx.objectStore(FILES).delete(path); return done(tx); }

  async wipe() {
    const names = [...TABLES, FILES, META];
    const tx = this.idb.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    return done(tx);
  }
}
