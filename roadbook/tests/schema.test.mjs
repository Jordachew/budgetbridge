// Runs supabase/schema.sql inside an in-memory Postgres (PGlite) with small
// stand-ins for Supabase's auth and storage schemas, then proves the security rules.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const SCHEMA = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

const STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language plpgsql as
    $$ declare _parts text[]; begin select string_to_array(name, '/') into _parts;
       return _parts[1:array_length(_parts,1)-1]; end $$;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  create publication supabase_realtime;
  -- another app already living in the same Supabase project
  create schema private;
  create table public.profiles (id uuid primary key, full_name text);
  create table public.expenses (id uuid primary key, amount numeric);
  alter table public.expenses enable row level security;
  create policy other_app_expenses on public.expenses for select to authenticated using (true);
  grant select, insert on public.profiles, public.expenses to authenticated;
  create function public.handle_new_user() returns trigger language plpgsql as $$ begin insert into public.profiles(id) values (new.id) on conflict do nothing; return new; end $$;
  create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
`;

let db;
const U = {};

async function asUser(uid, fn) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  await db.exec('set role authenticated');
  try { return await fn(); } finally { await db.exec('reset role'); }
}
async function asAnon(fn) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.exec('set role anon');
  try { return await fn(); } finally { await db.exec('reset role'); }
}
const q = (sql, params) => db.query(sql, params);
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

async function signUp(name) {
  const r = await q(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [`${name}@example.com`, JSON.stringify({ display_name: name })]);
  const id = r.rows[0].id;
  await asUser(id, () => q(`insert into public.rb_profiles (id, display_name) values ($1, $2)`, [id, name]));
  return id;
}
async function deniedOrEmpty(promise) {
  try { const r = await promise; return (r.rows?.length ?? 0) === 0 && (r.affectedRows ?? 0) === 0; }
  catch { return true; }
}

before(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  await db.exec(SCHEMA);
  U.alice = await signUp('Alice');   // fleet owner
  U.bob = await signUp('Bob');       // driver who shares
  U.carol = await signUp('Carol');   // outsider
  U.dave = await signUp('Dave');     // driver who does not share

  U.crew = (await asUser(U.alice, () => q(`select public.rb_create_crew('Alice Haulage') as id`))).rows[0].id;
  U.code = (await asUser(U.alice, () => q(`select public.rb_crew_join_code($1) as c`, [U.crew]))).rows[0].c;
  await asUser(U.bob, () => q(`select public.rb_join_crew($1, true)`, [U.code]));
  await asUser(U.dave, () => q(`select public.rb_join_crew($1, false)`, [U.code.toLowerCase().replace(/^(....)/, '$1 - ')]));
});

test('schema can be applied a second time (idempotent)', async () => {
  await db.exec(SCHEMA);
});

test('a person can create their own profile, with the name they typed', async () => {
  const r = await q(`select display_name from public.rb_profiles where id = $1`, [U.alice]);
  assert.equal(r.rows[0].display_name, 'Alice');
});

test('join code is 8 safe characters and codes are tolerant of spaces, dashes and case', async () => {
  assert.match(U.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  const m = await asUser(U.dave, () => q(`select count(*)::int n from public.rb_crew_members where user_id = $1`, [U.dave]));
  assert.equal(m.rows[0].n, 1);
});

test('anonymous visitors cannot read or call anything', async () => {
  for (const t of ['rb_expenses', 'rb_loads', 'rb_messages', 'rb_crews', 'rb_profiles']) {
    await asAnon(async () => assert.ok(await deniedOrEmpty(q(`select * from public.${t}`)), t));
  }
  await asAnon(async () => assert.rejects(q(`select public.rb_create_crew('x')`)));
});

test('a driver cannot read crew join codes or write membership directly', async () => {
  await asUser(U.bob, async () => {
    await assert.rejects(q(`select * from public.rb_crew_secrets`), /permission denied/);
    await assert.rejects(q(`insert into public.rb_crew_members (crew_id,user_id,role) values ($1,$2,'owner')`, [U.crew, U.bob]), /permission denied/);
    await assert.rejects(q(`update public.rb_crew_members set role='owner' where user_id=$1`, [U.bob]), /permission denied/);
    await assert.rejects(q(`select public.rb_crew_join_code($1)`, [U.crew]), /Only the owner or an admin/);
    await assert.rejects(q(`select public.rb_regenerate_join_code($1)`, [U.crew]), /Only the owner or an admin/);
    await assert.rejects(q(`select public.rb_delete_crew($1)`, [U.crew]), /Only the crew owner/);
    await assert.rejects(q(`select public.rb_remove_member($1,$2)`, [U.crew, U.dave]), /Only the owner or an admin/);
    await assert.rejects(q(`insert into public.rb_crews (name, owner_id) values ('Mine', $1)`, [U.bob]), /permission denied/);
  });
});

test('wrong join codes return null and are rate limited after 8 tries', async () => {
  await asUser(U.carol, async () => {
    for (let i = 0; i < 8; i++) {
      const r = await q(`select public.rb_join_crew('WRONGCDE', false) as id`);
      assert.equal(r.rows[0].id, null);
    }
    await assert.rejects(q(`select public.rb_join_crew($1, false)`, [U.code]), /Too many wrong codes/);
  });
  await q(`delete from rb_private.join_failures`);
});

test('drivers only see their own expenses; owners see them only after sharing', async () => {
  const idBob = uuid(), idDave = uuid();
  await asUser(U.bob, () => q(`insert into public.rb_expenses (id,category,amount_cents,spent_at) values ($1,'fuel',1245000,$2)`, [idBob, now()]));
  await asUser(U.dave, () => q(`insert into public.rb_expenses (id,category,amount_cents,spent_at) values ($1,'toll',50000,$2)`, [idDave, now()]));
  await asUser(U.alice, async () => {
    const r = await q(`select id from public.rb_expenses`);
    const ids = r.rows.map((x) => x.id);
    assert.ok(ids.includes(idBob), 'owner sees sharing driver');
    assert.ok(!ids.includes(idDave), 'owner does not see non-sharing driver');
  });
  await asUser(U.carol, async () => assert.equal((await q(`select id from public.rb_expenses`)).rows.length, 0));
  await asUser(U.dave, async () => {
    const ids = (await q(`select id from public.rb_expenses`)).rows.map((x) => x.id);
    assert.deepEqual(ids, [idDave]);
  });
  // Dave turns sharing on, then off again.
  await asUser(U.dave, () => q(`select public.rb_set_share_data($1, true)`, [U.crew]));
  await asUser(U.alice, async () => assert.ok((await q(`select id from public.rb_expenses`)).rows.some((x) => x.id === idDave)));
  await asUser(U.dave, () => q(`select public.rb_set_share_data($1, false)`, [U.crew]));
  await asUser(U.alice, async () => assert.ok(!(await q(`select id from public.rb_expenses`)).rows.some((x) => x.id === idDave)));
});

test('nobody can write a record for someone else or move a record to someone else', async () => {
  await asUser(U.bob, async () => {
    await assert.rejects(q(`insert into public.rb_expenses (id,user_id,category,amount_cents,spent_at) values ($1,$2,'fuel',100,$3)`, [uuid(), U.alice, now()]), /row-level security/);
    const mine = (await q(`select id from public.rb_expenses where user_id=$1 limit 1`, [U.bob])).rows[0].id;
    await assert.rejects(q(`update public.rb_expenses set user_id=$1 where id=$2`, [U.alice, mine]), /row-level security|cannot be changed/);
  });
  await asUser(U.alice, async () => {
    // Alice can read Bob's expense (shared) but not edit or delete it.
    const r = await q(`update public.rb_expenses set amount_cents = 1 where user_id=$1`, [U.bob]);
    assert.equal(r.affectedRows, 0);
    const d = await q(`delete from public.rb_expenses where user_id=$1`, [U.bob]);
    assert.equal(d.affectedRows, 0);
  });
});

test('bad data is rejected by the database', async () => {
  await asUser(U.bob, async () => {
    await assert.rejects(q(`insert into public.rb_expenses (id,category,amount_cents,spent_at) values ($1,'fuel',-5,$2)`, [uuid(), now()]), /check constraint/);
    await assert.rejects(q(`insert into public.rb_expenses (id,category,amount_cents,spent_at) values ($1,'jetski',5,$2)`, [uuid(), now()]), /check constraint/);
    await assert.rejects(q(`insert into public.rb_expenses (id,category,amount_cents,spent_at,currency) values ($1,'fuel',5,$2,'EUR')`, [uuid(), now()]), /check constraint/);
    await assert.rejects(q(`insert into public.rb_trips (id,started_at,distance_m) values ($1,$2,99999999999)`, [uuid(), now()]), /check constraint/);
    await assert.rejects(q(`insert into public.rb_deliveries (id,load_id,delivered_at,lat) values ($1,$2,$3,123)`, [uuid(), uuid(), now()]), /check constraint/);
  });
});

test('server sets updated_at (client cannot fake it)', async () => {
  const id = uuid();
  await asUser(U.bob, async () => {
    await q(`insert into public.rb_income (id,kind,amount_cents,received_at,updated_at) values ($1,'pay',100,$2,'2001-01-01')`, [id, now()]);
    const r = await q(`select updated_at from public.rb_income where id=$1`, [id]);
    assert.ok(new Date(r.rows[0].updated_at).getFullYear() >= 2025);
  });
});

test('reminders and route plans stay private even from a fleet owner', async () => {
  await asUser(U.bob, async () => {
    await q(`insert into public.rb_reminders (id,title,due_at) values ($1,'Fitness',$2)`, [uuid(), now()]);
    await q(`insert into public.rb_route_plans (id,title) values ($1,'Kingston run')`, [uuid()]);
  });
  await asUser(U.alice, async () => {
    assert.equal((await q(`select 1 from public.rb_reminders`)).rows.length, 0);
    assert.equal((await q(`select 1 from public.rb_route_plans`)).rows.length, 0);
  });
});

test('dispatch: owner can assign a load to a crew driver, not to outsiders; drivers cannot hijack it', async () => {
  const load = uuid();
  await asUser(U.alice, async () => {
    await q(`insert into public.rb_loads (id,user_id,reference,status) values ($1,$2,'JM-100','booked')`, [load, U.dave]);
    await assert.rejects(q(`insert into public.rb_loads (id,user_id,reference) values ($1,$2,'X')`, [uuid(), U.carol]), /row-level security/);
    await assert.rejects(q(`insert into public.rb_loads (id,user_id,created_by,reference) values ($1,$2,$3,'X')`, [uuid(), U.dave, U.bob]), /row-level security/);
  });
  await asUser(U.dave, async () => {
    const r = await q(`select id from public.rb_loads`);
    assert.ok(r.rows.some((x) => x.id === load), 'driver sees assigned load');
    const u = await q(`update public.rb_loads set status='picked_up' where id=$1`, [load]);
    assert.equal(u.affectedRows, 1);
    await assert.rejects(q(`update public.rb_loads set created_by=$1 where id=$2`, [U.dave, load]), /cannot be changed/);
    await assert.rejects(q(`update public.rb_loads set user_id=$1 where id=$2`, [U.bob, load]), /cannot reassign/);
    const del = await q(`delete from public.rb_loads where id=$1`, [load]);
    assert.equal(del.affectedRows, 0);
  });
  await asUser(U.bob, async () => assert.equal((await q(`select id from public.rb_loads where id=$1`, [load])).rows.length, 0));
  // Delivery proof is visible to the dispatcher even though Dave does not share his data.
  const del = uuid();
  await asUser(U.dave, () => q(`insert into public.rb_deliveries (id,load_id,delivered_at,receiver_name,proof_hash) values ($1,$2,$3,'Mr Brown',$4)`, [del, load, now(), 'a'.repeat(64)]));
  await asUser(U.alice, async () => assert.equal((await q(`select id from public.rb_deliveries where id=$1`, [del])).rows.length, 1));
  await asUser(U.bob, async () => assert.equal((await q(`select id from public.rb_deliveries where id=$1`, [del])).rows.length, 0));
  await asUser(U.dave, async () => assert.rejects(q(`insert into public.rb_deliveries (id,load_id,delivered_at,proof_hash) values ($1,$2,$3,'nothex')`, [uuid(), load, now()]), /check constraint/));
  // Alice may hand the load to another crew driver.
  await asUser(U.alice, async () => {
    const r = await q(`update public.rb_loads set user_id=$1 where id=$2`, [U.bob, load]);
    assert.equal(r.affectedRows, 1);
    await assert.rejects(q(`update public.rb_loads set user_id=$1 where id=$2`, [U.carol, load]), /cannot reassign/);
  });
});

test('chat: only crew members read/post; posting as someone else is blocked; deletion rules', async () => {
  const m1 = uuid(), m2 = uuid();
  await asUser(U.bob, () => q(`insert into public.rb_messages (id,crew_id,author_name,body) values ($1,$2,'Bob','Hello crew')`, [m1, U.crew]));
  await asUser(U.dave, () => q(`insert into public.rb_messages (id,crew_id,author_name,body) values ($1,$2,'Dave','On my way')`, [m2, U.crew]));
  await asUser(U.carol, async () => {
    assert.equal((await q(`select 1 from public.rb_messages`)).rows.length, 0);
    await assert.rejects(q(`insert into public.rb_messages (id,crew_id,body) values ($1,$2,'hi')`, [uuid(), U.crew]), /row-level security/);
  });
  await asUser(U.bob, async () => {
    await assert.rejects(q(`insert into public.rb_messages (id,crew_id,user_id,body) values ($1,$2,$3,'fake')`, [uuid(), U.crew, U.alice]), /row-level security/);
    await assert.rejects(q(`insert into public.rb_messages (id,crew_id,body) values ($1,$2,'')`, [uuid(), U.crew]), /check constraint/);
    await assert.rejects(q(`update public.rb_messages set body='edited' where id=$1`, [m1]), /permission denied/);
    await q(`select public.rb_delete_message($1)`, [m2]);   // not his message: no effect
  });
  assert.equal((await q(`select deleted_at from public.rb_messages where id=$1`, [m2])).rows[0].deleted_at, null);
  await asUser(U.carol, () => q(`select public.rb_delete_message($1)`, [m1]));
  assert.equal((await q(`select deleted_at from public.rb_messages where id=$1`, [m1])).rows[0].deleted_at, null);
  await asUser(U.bob, () => q(`select public.rb_delete_message($1)`, [m1]));
  assert.notEqual((await q(`select deleted_at from public.rb_messages where id=$1`, [m1])).rows[0].deleted_at, null);
  await asUser(U.alice, () => q(`select public.rb_delete_message($1)`, [m2]));   // owner can moderate
  assert.notEqual((await q(`select deleted_at from public.rb_messages where id=$1`, [m2])).rows[0].deleted_at, null);
});

test('chat spam limit: 30 messages a minute', async () => {
  await asUser(U.carol, () => q(`select public.rb_join_crew($1,false)`, [U.code]));
  await asUser(U.carol, async () => {
    let failed = false;
    for (let i = 0; i < 35; i++) {
      try { await q(`insert into public.rb_messages (id,crew_id,body) values ($1,$2,'spam')`, [uuid(), U.crew]); }
      catch (e) { failed = /Too many messages/.test(String(e)); break; }
    }
    assert.ok(failed);
  });
  await asUser(U.carol, () => q(`select public.rb_leave_crew($1)`, [U.crew]));
});

test('road alerts: members share; outsiders blocked; clearing; expiry capped', async () => {
  const a1 = uuid();
  await asUser(U.bob, () => q(`insert into public.rb_road_alerts (id,crew_id,author_name,kind,lat,lng,expires_at) values ($1,$2,'Bob','flood',18.0,-76.8, now() + interval '30 days')`, [a1, U.crew]));
  const row = (await q(`select expires_at, created_at from public.rb_road_alerts where id=$1`, [a1])).rows[0];
  assert.ok(new Date(row.expires_at) - new Date(row.created_at) <= 48 * 3600e3 + 1000);
  await asUser(U.carol, async () => {
    assert.equal((await q(`select 1 from public.rb_road_alerts`)).rows.length, 0);
    await q(`select public.rb_clear_alert($1)`, [a1]);
  });
  assert.equal((await q(`select cleared_at from public.rb_road_alerts where id=$1`, [a1])).rows[0].cleared_at, null);
  await asUser(U.dave, async () => {
    assert.equal((await q(`select 1 from public.rb_road_alerts`)).rows.length, 1);
    await q(`select public.rb_clear_alert($1)`, [a1]);
  });
  assert.notEqual((await q(`select cleared_at from public.rb_road_alerts where id=$1`, [a1])).rows[0].cleared_at, null);
  await asUser(U.bob, async () => {
    await assert.rejects(q(`insert into public.rb_road_alerts (id,crew_id,kind,lat,lng) values ($1,$2,'meteor',1,1)`, [uuid(), U.crew]), /check constraint/);
    await assert.rejects(q(`insert into public.rb_road_alerts (id,crew_id,kind,lat,lng) values ($1,$2,'flood',95,1)`, [uuid(), U.crew]), /check constraint/);
    await assert.rejects(q(`insert into public.rb_road_alerts (id,crew_id,kind,lat,lng,cleared_at) values ($1,$2,'flood',1,1,now())`, [uuid(), U.crew]), /row-level security/);
  });
});

test('roster: members see names; only the owner sees who shares', async () => {
  await asUser(U.dave, async () => {
    const r = (await q(`select * from public.rb_crew_roster($1)`, [U.crew])).rows;
    assert.equal(r.length, 3);
    assert.equal(r[0].role, 'owner');
    const bob = r.find((x) => x.user_id === U.bob);
    assert.equal(bob.share_data, null);
    assert.equal(r.find((x) => x.user_id === U.dave).share_data, false);
  });
  await asUser(U.alice, async () => {
    const r = (await q(`select * from public.rb_crew_roster($1)`, [U.crew])).rows;
    assert.equal(r.find((x) => x.user_id === U.bob).share_data, true);
  });
  await asUser(U.carol, async () => assert.rejects(q(`select * from public.rb_crew_roster($1)`, [U.crew]), /Not a member/));
});

test('crew report: totals only for sharing drivers; drivers and outsiders refused', async () => {
  await asUser(U.bob, async () => {
    await q(`insert into public.rb_trips (id,started_at,distance_m,method) values ($1,now(),250000,'odometer')`, [uuid()]);
    await q(`insert into public.rb_income (id,kind,amount_cents,received_at) values ($1,'pay',500000,now())`, [uuid()]);
    await assert.rejects(q(`select public.rb_crew_report($1, current_date - 7, current_date)`, [U.crew]), /Only the owner or an admin/);
  });
  await asUser(U.alice, async () => {
    const rep = (await q(`select public.rb_crew_report($1, current_date - 7, current_date) as r`, [U.crew])).rows[0].r;
    const bob = rep.find((x) => x.display_name === 'Bob');
    const dave = rep.find((x) => x.display_name === 'Dave');
    assert.equal(bob.shared, true);
    assert.equal(Number(bob.distance_m), 250000);
    assert.equal(Number(bob.income.JMD), 500100); // 500000 here + 100 from the updated_at test
    assert.equal(Number(bob.expenses.JMD), 1245000);
    assert.equal(dave.shared, false);
    assert.equal(dave.distance_m, undefined);
    await assert.rejects(q(`select public.rb_crew_report($1, current_date, current_date - 1)`, [U.crew]), /date range/);
  });
  await asUser(U.carol, async () => assert.rejects(q(`select public.rb_crew_report($1, current_date - 7, current_date)`, [U.crew]), /Only the owner or an admin/));
});

test('storage: own folder only; owners read shared files; dispatchers read delivery proof', async () => {
  const load = uuid();
  await asUser(U.alice, () => q(`insert into public.rb_loads (id,user_id,reference) values ($1,$2,'P-1')`, [load, U.dave]));
  const files = {
    bobReceipt: `${U.bob}/receipts/${uuid()}.jpg`,
    daveReceipt: `${U.dave}/receipts/${uuid()}.jpg`,
    daveProof: `${U.dave}/proof/${load}/signature.png`,
    tricky: `${U.dave}/proof/not-a-uuid/x.png`,
  };
  const put = (uid, name) => asUser(uid, () => q(`insert into storage.objects (bucket_id,name,owner) values ('roadbook-files',$1,$2)`, [name, uid]));
  await put(U.bob, files.bobReceipt);
  await put(U.dave, files.daveReceipt);
  await put(U.dave, files.daveProof);
  await put(U.dave, files.tricky);
  await asUser(U.bob, async () => {
    await assert.rejects(q(`insert into storage.objects (bucket_id,name,owner) values ('roadbook-files',$1,$2)`, [`${U.dave}/evil.jpg`, U.bob]), /row-level security/);
    await assert.rejects(q(`insert into storage.objects (bucket_id,name,owner) values ('other-bucket',$1,$2)`, [`${U.bob}/x.jpg`, U.bob]), /row-level security/);
    const names = (await q(`select name from storage.objects`)).rows.map((x) => x.name);
    assert.deepEqual(names, [files.bobReceipt]);
  });
  await asUser(U.alice, async () => {
    const names = (await q(`select name from storage.objects`)).rows.map((x) => x.name).sort();
    assert.ok(names.includes(files.bobReceipt), 'shared driver files readable');
    assert.ok(!names.includes(files.daveReceipt), 'non-shared receipts hidden');
    assert.ok(names.includes(files.daveProof), 'dispatcher reads proof');
    assert.ok(!names.includes(files.tricky), 'malformed proof path hidden without error');
  });
  await asUser(U.carol, async () => assert.equal((await q(`select 1 from storage.objects`)).rows.length, 0));
});

test('owner can remove a driver; driver loses crew chat and the owner loses their data', async () => {
  await asUser(U.alice, () => q(`select public.rb_remove_member($1,$2)`, [U.crew, U.bob]));
  await asUser(U.bob, async () => {
    assert.equal((await q(`select 1 from public.rb_messages`)).rows.length, 0);
    assert.ok((await q(`select 1 from public.rb_expenses`)).rows.length >= 1, 'keeps own data');
  });
  await asUser(U.alice, async () => assert.ok(!(await q(`select user_id from public.rb_expenses`)).rows.some((x) => x.user_id === U.bob)));
  // rejoin with a regenerated code
  const newCode = (await asUser(U.alice, () => q(`select public.rb_regenerate_join_code($1) as c`, [U.crew]))).rows[0].c;
  assert.notEqual(newCode, U.code);
  await asUser(U.bob, async () => {
    assert.equal((await q(`select public.rb_join_crew($1,false) as id`, [U.code])).rows[0].id, null, 'old code dead');
    assert.equal((await q(`select public.rb_join_crew($1,true) as id`, [newCode])).rows[0].id, U.crew);
  });
  await q(`delete from rb_private.join_failures`);
});

test('an owner cannot demote or overwrite themselves through join_crew; owner cannot leave', async () => {
  const code = (await asUser(U.alice, () => q(`select public.rb_crew_join_code($1) as c`, [U.crew]))).rows[0].c;
  await asUser(U.alice, () => q(`select public.rb_join_crew($1,true)`, [code]));
  const r = await q(`select role, share_data from public.rb_crew_members where user_id=$1 and crew_id=$2`, [U.alice, U.crew]);
  assert.equal(r.rows[0].role, 'owner');
  assert.equal(r.rows[0].share_data, false);
  await asUser(U.alice, () => q(`select public.rb_leave_crew($1)`, [U.crew]));
  assert.equal((await q(`select count(*)::int n from public.rb_crew_members where user_id=$1 and crew_id=$2`, [U.alice, U.crew])).rows[0].n, 1);
});

test('delete_my_account removes Roadbook data but leaves the shared login alone', async () => {
  const eve = await signUp('Eve');
  await asUser(eve, async () => {
    await q(`insert into public.rb_expenses (id,category,amount_cents,spent_at) values ($1,'food',100,$2)`, [uuid(), now()]);
    await q(`select public.rb_create_crew('Eve Crew')`);
    await q(`select public.rb_delete_my_account()`);
  });
  for (const t of ['rb_expenses', 'rb_crews', 'rb_crew_members']) {
    const col = t === 'rb_crews' ? 'owner_id' : 'user_id';
    assert.equal((await q(`select count(*)::int n from public.${t} where ${col}=$1`, [eve])).rows[0].n, 0, t);
  }
  assert.equal((await q(`select count(*)::int n from public.rb_profiles where id=$1`, [eve])).rows[0].n, 0);
  assert.equal((await q(`select count(*)::int n from auth.users where id=$1`, [eve])).rows[0].n, 1, 'the login belongs to every app, so it stays');
});

test('installing next to another app leaves that app untouched', async () => {
  const trg = await q(`select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal`);
  assert.deepEqual(trg.rows.map((r) => r.tgname), ['on_auth_user_created']);
  const pol = await q(`select policyname from pg_policies where schemaname='public' and tablename='expenses'`);
  assert.deepEqual(pol.rows.map((r) => r.policyname), ['other_app_expenses']);
  const gr = await q(`select privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='expenses' and grantee='authenticated' order by 1`);
  assert.deepEqual(gr.rows.map((r) => r.privilege_type), ['INSERT', 'SELECT']);
  const names = await q(`select tablename from pg_tables where schemaname='public' and tablename not like 'rb\\_%' order by 1`);
  assert.deepEqual(names.rows.map((r) => r.tablename), ['expenses', 'profiles']);
  const fn = await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'`);
  assert.equal(fn.rows[0].n, 0, 'the other app\'s private schema is not used');
});

test('only the owner of a crew may delete it, and that removes messages and alerts', async () => {
  const frank = await signUp('Frank');
  const crew = (await asUser(frank, () => q(`select public.rb_create_crew('Frank Fleet') as id`))).rows[0].id;
  await asUser(frank, () => q(`insert into public.rb_messages (id,crew_id,body) values ($1,$2,'x')`, [uuid(), crew]));
  await asUser(U.dave, async () => assert.rejects(q(`select public.rb_delete_crew($1)`, [crew]), /Only the crew owner/));
  await asUser(frank, () => q(`select public.rb_delete_crew($1)`, [crew]));
  assert.equal((await q(`select count(*)::int n from public.rb_messages where crew_id=$1`, [crew])).rows[0].n, 0);
});

test('chat and alerts: server sets the time and the author name, so neither can be faked', async () => {
  const id = uuid();
  await asUser(U.bob, () => q(`insert into public.rb_messages (id,crew_id,body,author_name,created_at) values ($1,$2,'hi','Alice','2020-01-01')`, [id, U.crew]));
  const r = (await q(`select author_name, created_at from public.rb_messages where id=$1`, [id])).rows[0];
  assert.equal(r.author_name, 'Bob');
  assert.ok(Date.now() - new Date(r.created_at).getTime() < 60000, 'created_at must be now, not 2020');
  await asUser(U.bob, async () => {
    let refused = 0;
    for (let i = 0; i < 40; i++) {
      try { await q(`insert into public.rb_messages (id,crew_id,body,created_at) values ($1,$2,'x','2020-01-01')`, [uuid(), U.crew]); }
      catch (e) { assert.match(e.message, /Too many messages/); refused++; }
    }
    assert.ok(refused >= 10, `back-dated messages must still hit the limit (refused ${refused})`);
  });
});

test('a sealed delivery proof cannot be edited, but the note can', async () => {
  const load = uuid(), del = uuid();
  const hash = 'a'.repeat(64);
  await asUser(U.bob, async () => {
    await q(`insert into public.rb_loads (id,description) values ($1,'Sand')`, [load]);
    await q(`insert into public.rb_deliveries (id,load_id,delivered_at,receiver_name,proof_hash) values ($1,$2,$3,'Mr Lee',$4)`, [del, load, now(), hash]);
    await assert.rejects(q(`update public.rb_deliveries set receiver_name='Someone else' where id=$1`, [del]), /sealed/);
    await assert.rejects(q(`update public.rb_deliveries set delivered_at=now() - interval '3 days' where id=$1`, [del]), /sealed/);
    await q(`update public.rb_deliveries set discrepancy_note='2 bags short' where id=$1`, [del]);
  });
});

test('companies are isolated, and admins (dispatchers) work for their own company only', async () => {
  const gina = await signUp('Gina'), hank = await signUp('Hank'), ivy = await signUp('Ivy');
  const crewA = (await asUser(gina, () => q(`select public.rb_create_crew('Gina Haulage') as id`))).rows[0].id;
  const crewB = (await asUser(hank, () => q(`select public.rb_create_crew('Hank Freight') as id`))).rows[0].id;
  const codeA = (await asUser(gina, () => q(`select public.rb_crew_join_code($1) as c`, [crewA]))).rows[0].c;
  await asUser(ivy, () => q(`select public.rb_join_crew($1, true)`, [codeA]));
  const bob2 = await signUp('Bob2');
  await asUser(bob2, () => q(`select public.rb_join_crew($1, true)`, [codeA]));

  // only the owner can make an admin; a driver cannot
  await asUser(ivy, async () => assert.rejects(q(`select public.rb_set_member_role($1,$2,'admin')`, [crewA, ivy]), /Only the crew owner/));
  await asUser(gina, () => q(`select public.rb_set_member_role($1,$2,'admin')`, [crewA, ivy]));
  assert.equal((await q(`select role, share_data from public.rb_crew_members where crew_id=$1 and user_id=$2`, [crewA, ivy])).rows[0].role, 'admin');

  // admin sees the join code, the roster and a driver who shares; can dispatch a load to that driver
  await asUser(ivy, async () => {
    assert.equal((await q(`select public.rb_crew_join_code($1) as c`, [crewA])).rows[0].c, codeA);
    assert.equal((await q(`select * from public.rb_crew_roster($1)`, [crewA])).rows.length, 3);
    await q(`insert into public.rb_loads (id,user_id,description) values ($1,$2,'Cement')`, [uuid(), bob2]);
  });
  // an admin cannot delete the company, promote people, rename it, or remove another admin
  await asUser(ivy, async () => {
    await assert.rejects(q(`select public.rb_delete_crew($1)`, [crewA]), /Only the crew owner/);
    await assert.rejects(q(`select public.rb_update_crew($1,'Mine now','#112233','')`, [crewA]), /Only the crew owner/);
    await assert.rejects(q(`select public.rb_set_member_role($1,$2,'admin')`, [crewA, bob2]), /Only the crew owner/);
    await q(`select public.rb_remove_member($1,$2)`, [crewA, gina]);   // silently does nothing: the owner cannot be removed
  });
  assert.equal((await q(`select count(*)::int n from public.rb_crew_members where crew_id=$1 and role='owner'`, [crewA])).rows[0].n, 1);

  // the other company sees nothing of company A, even as an owner, and cannot dispatch into it
  await asUser(hank, async () => {
    assert.equal((await q(`select * from public.rb_crews`)).rows.length, 1);
    await assert.rejects(q(`select public.rb_crew_join_code($1)`, [crewA]), /Only the owner or an admin/);
    await assert.rejects(q(`select public.rb_crew_report($1, current_date - 3, current_date)`, [crewA]), /Only the owner or an admin/);
    assert.equal((await q(`select * from public.rb_loads`)).rows.length, 0);
    await assert.rejects(q(`insert into public.rb_loads (id,user_id,description) values ($1,$2,'Steal')`, [uuid(), bob2]));
  });

  // owner edits company details; bad colour refused
  await asUser(gina, async () => {
    await q(`select public.rb_update_crew($1,'Gina Haulage Ltd','#0b5cad','876 555 0100')`, [crewA]);
    await assert.rejects(q(`select public.rb_update_crew($1,'X Y','red','')`, [crewA]), /Colour/);
    const c = (await q(`select name, brand_color, phone from public.rb_crews where id=$1`, [crewA])).rows[0];
    assert.deepEqual(c, { name: 'Gina Haulage Ltd', brand_color: '#0b5cad', phone: '876 555 0100' });
  });
  // owner can demote the admin back to driver
  await asUser(gina, () => q(`select public.rb_set_member_role($1,$2,'driver')`, [crewA, ivy]));
  await asUser(ivy, async () => assert.rejects(q(`select public.rb_crew_join_code($1)`, [crewA]), /Only the owner or an admin/));
  assert.ok(crewB);
});
