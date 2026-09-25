// ===========================================================
// BudgetBridge — storage layer (IndexedDB)
// Everything lives in the visitor's browser. Nothing here talks
// to a server. See DataSettings view / README for the multi-user
// story (export/import a workbook via a shared drive folder).
// ===========================================================

const DB_NAME = "budgetbridge";
const DB_VERSION = 2;

/** @type {IDBDatabase|null} */
let _db = null;

function openDb() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "code" });
      }
      if (!db.objectStoreNames.contains("budgetLines")) {
        const s = db.createObjectStore("budgetLines", { keyPath: "id" });
        s.createIndex("byFyProject", ["fiscalYear", "projectCode"], { unique: false });
        s.createIndex("byFy", "fiscalYear", { unique: false });
      }
      if (!db.objectStoreNames.contains("transactions")) {
        const s = db.createObjectStore("transactions", { keyPath: "id" });
        s.createIndex("byProject", "project", { unique: false });
        s.createIndex("byYear", "year", { unique: false });
        s.createIndex("byBatch", "batchId", { unique: false });
      }
      if (!db.objectStoreNames.contains("importBatches")) {
        db.createObjectStore("importBatches", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("planNotes")) {
        const s = db.createObjectStore("planNotes", { keyPath: "id" });
        s.createIndex("byFyProject", ["fiscalYear", "projectCode"], { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(storeNames, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = {};
    for (const n of [].concat(storeNames)) stores[n] = t.objectStore(n);
    let result;
    Promise.resolve(fn(stores, t))
      .then((r) => { result = r; })
      .catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("transaction aborted"));
  }));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  async getAll(store) {
    return tx(store, "readonly", (s) => reqToPromise(s[store].getAll()));
  },
  async get(store, key) {
    return tx(store, "readonly", (s) => reqToPromise(s[store].get(key)));
  },
  async put(store, value) {
    return tx(store, "readwrite", (s) => reqToPromise(s[store].put(value)));
  },
  async bulkPut(store, values) {
    return tx(store, "readwrite", (s) => {
      for (const v of values) s[store].put(v);
    });
  },
  async delete(store, key) {
    return tx(store, "readwrite", (s) => reqToPromise(s[store].delete(key)));
  },
  async clear(store) {
    return tx(store, "readwrite", (s) => reqToPromise(s[store].clear()));
  },
  async count(store) {
    return tx(store, "readonly", (s) => reqToPromise(s[store].count()));
  },
  async deleteByIndex(store, indexName, value) {
    return tx(store, "readwrite", (s) => new Promise((resolve, reject) => {
      const idx = s[store].index(indexName);
      const req = idx.openCursor(IDBKeyRange.only(value));
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) { cur.delete(); cur.continue(); } else resolve();
      };
      req.onerror = () => reject(req.error);
    }));
  },
  async wipeAll() {
    return tx(["meta", "categories", "projects", "budgetLines", "transactions", "importBatches", "planNotes"], "readwrite", (s) => {
      for (const n of Object.keys(s)) s[n].clear();
    });
  },
};

export async function getMeta(key, fallback = null) {
  const row = await db.get("meta", key);
  return row ? row.value : fallback;
}
export async function setMeta(key, value) {
  return db.put("meta", { key, value });
}

export async function estimateUsage() {
  if (navigator.storage && navigator.storage.estimate) {
    try { return await navigator.storage.estimate(); } catch { return null; }
  }
  return null;
}
