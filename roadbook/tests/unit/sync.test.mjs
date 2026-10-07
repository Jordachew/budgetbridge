import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import * as store from '../../src/core/store.js';
import { createSync } from '../../src/core/sync.js';
import { TABLES } from '../../src/core/db.js';

function fakeApi() {
  const server = Object.fromEntries(TABLES.map((t) => [t, new Map()]));
  const files = new Map();
  let clock = Date.parse('2026-10-03T10:00:00Z');
  const api = {
    server, files, down: false, reject: new Set(), profile: null, calls: [],
    tick() { clock += 1000; return new Date(clock).toISOString(); },
    async upsert(table, rows) {
      api.calls.push(['upsert', table, rows.length]);
      if (api.down) throw Object.assign(new TypeError('Failed to fetch'));
      for (const r of rows) if (api.reject.has(r.id)) throw Object.assign(new Error('check constraint'), { status: 400 });
      for (const r of rows) server[table].set(r.id, { ...r, updated_at: api.tick() });
    },
    async pull(table, since) {
      if (api.down) throw new TypeError('Failed to fetch');
      return [...server[table].values()].filter((r) => !since || r.updated_at > since).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    },
    async uploadFile(path, blob) { if (api.down) throw new TypeError('Failed to fetch'); files.set(path, blob); },
    async downloadFile(path) { return files.get(path) || null; },
    async getProfile() { return api.profile; },
    async saveProfile(p) { api.profile = { ...p }; },
  };
  return api;
}
let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
async function setup() {
  await store.openStore(uid(), new IDBFactory());
  const api = fakeApi();
  const sync = createSync({ api });
  store.setKick(() => {});
  return { api, sync };
}
const expense = (o = {}) => ({ id: uid(), category: 'fuel', amount_cents: 500000, currency: 'JMD', paid_by: 'driver', spent_at: '2026-10-03T09:00:00Z', ...o });

test('offline save is kept, then uploaded and marked clean', async () => {
  const { api, sync } = await setup();
  const e = await store.save('expenses', expense());
  assert.equal(e._dirty, true); assert.equal(store.dirtyCount(), 1);
  await sync.run();
  assert.equal(store.dirtyCount(), 0);
  assert.equal(api.server.expenses.size, 1);
  assert.ok(![...api.server.expenses.values()][0]._dirty, 'local-only fields must not reach the server');
  assert.ok(!('_v' in [...api.server.expenses.values()][0]));
});
test('no signal: stays dirty, state offline; works later', async () => {
  const { api, sync } = await setup();
  await store.save('expenses', expense());
  api.down = true;
  const st = await sync.run();
  assert.equal(st.state, 'offline'); assert.equal(store.dirtyCount(), 1);
  api.down = false;
  assert.equal((await sync.run()).state, 'idle'); assert.equal(store.dirtyCount(), 0);
});
test('edit made while uploading stays dirty', async () => {
  const { api, sync } = await setup();
  const e = await store.save('expenses', expense());
  const orig = api.upsert;
  api.upsert = async (t, rows) => { await orig(t, rows); await store.save('expenses', { ...e, amount_cents: 1 }); };
  await sync.run();
  assert.equal(store.find('expenses', e.id)._dirty, true);
  api.upsert = orig;
  await sync.run();
  assert.equal(store.dirtyCount(), 0); assert.equal(api.server.expenses.get(e.id).amount_cents, 1);
});
test('pull brings other-device rows; dirty local rows are not overwritten', async () => {
  const { api, sync } = await setup();
  const mine = await store.save('expenses', expense({ note: 'local edit' }));
  const other = expense({ note: 'from phone 2' });
  api.server.expenses.set(other.id, { ...other, user_id: store.userId(), updated_at: api.tick() });
  api.server.expenses.set(mine.id, { ...mine, note: 'server version', updated_at: api.tick() });
  api.down = false;
  // make push fail only for pull-phase check: use reject so mine stays dirty and failed
  api.reject.add(mine.id);
  await sync.run();
  assert.equal(store.find('expenses', other.id).note, 'from phone 2');
  assert.equal(store.find('expenses', mine.id).note, 'local edit');
});
test('one bad row does not block the others', async () => {
  const { api, sync } = await setup();
  const bad = await store.save('expenses', expense());
  const good = await store.save('expenses', expense());
  api.reject.add(bad.id);
  const st = await sync.run();
  assert.ok(api.server.expenses.has(good.id)); assert.ok(!api.server.expenses.has(bad.id));
  assert.equal(st.failed, 1); assert.equal(sync.failedItems().length, 1);
});
test('soft delete reaches the server', async () => {
  const { api, sync } = await setup();
  const e = await store.save('expenses', expense());
  await sync.run();
  await store.remove('expenses', e.id);
  assert.equal(store.rows('expenses').length, 0);
  await sync.run();
  assert.ok(api.server.expenses.get(e.id).deleted_at);
});
test('files upload once and can be fetched from the phone', async () => {
  const { api, sync } = await setup();
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
  await store.getDb().putFile('u/receipts/a.jpg', blob, false);
  await sync.run();
  assert.ok(api.files.has('u/receipts/a.jpg'));
  assert.equal((await store.getDb().pendingFiles()).length, 0);
  api.files.set('u/receipts/b.jpg', blob);
  const got = await sync.fetchFile('u/receipts/b.jpg');
  assert.equal(got.size, 3); assert.ok(await store.getDb().getFile('u/receipts/b.jpg'));
});
test('profile edits upload; server profile is applied when clean', async () => {
  const { api, sync } = await setup();
  await store.setProfile({ display_name: 'Winston', truck_label: 'Hino 500' });
  await sync.run();
  assert.equal(api.profile.display_name, 'Winston');
  api.profile = { display_name: 'Winston B', truck_label: 'Hino 500', currency: 'JMD' };
  await sync.run();
  assert.equal(store.getProfile().display_name, 'Winston B');
});
test('local mode never syncs', async () => {
  await store.openStore(null, new IDBFactory());
  const api = fakeApi();
  const sync = createSync({ api });
  await store.save('expenses', expense());
  await sync.run();
  assert.equal(api.calls.length, 0); assert.equal(store.dirtyCount(), 1);
});
test('accounts are separate databases', async () => {
  const f = new IDBFactory();
  await store.openStore('a0000000-0000-4000-8000-000000000001', f);
  await store.save('expenses', expense());
  await store.openStore('a0000000-0000-4000-8000-000000000002', f);
  assert.equal(store.rows('expenses').length, 0);
  await store.openStore('a0000000-0000-4000-8000-000000000001', f);
  assert.equal(store.rows('expenses').length, 1);
});

test('a row the server refuses with 403 does not stop the rest, and is not treated as signed out', async () => {
  const { api, sync } = await setup();
  const bad = await store.save('expenses', expense());
  const good = await store.save('expenses', expense());
  const orig = api.upsert;
  api.upsert = async (t, rows) => {
    if (rows.some((r) => r.id === bad.id)) throw Object.assign(new Error('new row violates row-level security policy'), { status: 403 });
    return orig(t, rows);
  };
  const st = await sync.run();
  assert.equal(st.state, 'idle');
  assert.ok(api.server.expenses.has(good.id), 'the good row still uploads');
  assert.equal(sync.failedItems().length, 1);
});
test('a refused file does not block other files or rows', async () => {
  const { api, sync } = await setup();
  const db = store.getDb();
  await db.putFile('u/a.jpg', new Blob(['a'], { type: 'image/jpeg' }));
  await db.putFile('u/b.jpg', new Blob(['b'], { type: 'image/jpeg' }));
  await store.save('expenses', expense());
  api.uploadFile = async (path, blob) => { if (path === 'u/a.jpg') throw Object.assign(new Error('too big'), { status: 413 }); api.files.set(path, blob); };
  const st = await sync.run();
  assert.equal(st.state, 'idle');
  assert.ok(api.files.has('u/b.jpg')); assert.equal(api.server.expenses.size, 1);
});
test('a real 401 still means sign in again', async () => {
  const { api, sync } = await setup();
  await store.save('expenses', expense());
  api.upsert = async () => { throw Object.assign(new Error('JWT expired'), { status: 401 }); };
  assert.equal((await sync.run()).state, 'signedout');
});
