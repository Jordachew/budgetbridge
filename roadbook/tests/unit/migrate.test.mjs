import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import * as store from '../../app/js/store.js';
import { migrateLocalToAccount, localHasData } from '../../app/js/migrate.js';

test('local records move into the new account, paths rewritten, then local copy is cleared', async () => {
  const f = new IDBFactory();
  await store.openStore(null, f);
  store.setKick(() => {});
  await store.save('expenses', { id: '11111111-1111-4111-8111-111111111111', category: 'fuel', amount_cents: 500, currency: 'JMD', spent_at: '2026-10-01T00:00:00Z', receipt_path: 'local/receipts/11111111-1111-4111-8111-111111111111.jpg' });
  await store.save('loads', { id: '22222222-2222-4222-8222-222222222222', description: 'rice', status: 'booked', created_by: 'local' });
  await store.save('expenses', { id: '33333333-3333-4333-8333-333333333333', category: 'toll', amount_cents: 1, currency: 'JMD', spent_at: '2026-10-01T00:00:00Z', deleted_at: '2026-10-02T00:00:00Z' });
  await store.getDb().putFile('local/receipts/11111111-1111-4111-8111-111111111111.jpg', new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }), true);
  await store.setProfile({ display_name: 'Winston', odometer_manual: { v: 5, at: '2026-10-01T00:00:00Z' } });
  assert.equal(await localHasData(f), true);

  const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await store.openStore(uid, f);
  const n = await migrateLocalToAccount(uid, f);
  assert.equal(n, 2, 'deleted rows are not moved');
  const e = store.rows('expenses');
  assert.equal(e.length, 1); assert.equal(e[0].user_id, uid); assert.equal(e[0]._dirty, true);
  assert.equal(e[0].receipt_path, `${uid}/receipts/11111111-1111-4111-8111-111111111111.jpg`);
  assert.equal(store.rows('loads')[0].created_by, uid); assert.equal(store.rows('loads')[0].user_id, uid);
  const file = await store.getDb().getFile(e[0].receipt_path);
  assert.equal(file.uploaded, false); assert.equal(file.blob.size, 2);
  assert.equal(store.getProfile().display_name, 'Winston'); assert.equal(store.getProfile().odometer_manual.v, 5);
  assert.equal(await localHasData(f), false);
});
