-- =====================================================================
-- Roadbook: database schema for Supabase (Postgres 15+)
--
-- Safe to run inside a Supabase project that other apps already use: every table
-- and function here starts with rb_ (schema rb_private), nothing existing is
-- changed, and there is no trigger on auth.users.
--
-- How to run: open your Supabase project > SQL Editor > paste this whole
-- file > Run. It is safe to run more than once.
--
-- Security model in one paragraph:
--   * Every table has Row Level Security (RLS) switched on.
--   * A driver can only read and write their own rows.
--   * A fleet owner can read a driver's loads, trips, expenses and income
--     ONLY if that driver agreed when joining (crew_members.share_data).
--   * Crew chat and road alerts are visible only to members of that crew.
--   * Crews, members and join codes are changed only through the
--     functions at the bottom (no direct table writes), so nobody can
--     promote themselves to owner or read someone else's join code.
-- =====================================================================

create schema if not exists rb_private;
grant usage on schema rb_private to authenticated;

-- ---------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------

create table if not exists public.rb_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '' check (char_length(display_name) <= 60),
  truck_label   text not null default '' check (char_length(truck_label) <= 40),
  currency      text not null default 'JMD' check (currency in ('JMD','USD')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.rb_crews (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 60),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  brand_color text not null default '' check (brand_color = '' or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  phone       text not null default '' check (char_length(phone) <= 30),
  created_at  timestamptz not null default now()
);

-- Join codes live in their own table so only the owner can ever read them.
create table if not exists public.rb_crew_secrets (
  crew_id    uuid primary key references public.rb_crews(id) on delete cascade,
  join_code  text not null unique
);

create table if not exists public.rb_crew_members (
  crew_id     uuid not null references public.rb_crews(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','admin','driver')),
  share_data  boolean not null default false,
  joined_at   timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index if not exists rb_crew_members_user_idx on public.rb_crew_members(user_id);

create table if not exists rb_private.join_failures (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists rb_join_failures_idx on rb_private.join_failures(user_id, at);

-- ---------------------------------------------------------------------
-- 2. Helper functions used by the security policies
-- ---------------------------------------------------------------------

create or replace function rb_private.is_crew_member(p_crew uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rb_crew_members m
    where m.crew_id = p_crew and m.user_id = (select auth.uid())
  );
$$;

create or replace function rb_private.is_crew_owner(p_crew uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rb_crew_members m
    where m.crew_id = p_crew and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Owner or admin (dispatcher) of this company.
create or replace function rb_private.is_crew_manager(p_crew uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rb_crew_members m
    where m.crew_id = p_crew and m.user_id = (select auth.uid()) and m.role in ('owner','admin')
  );
$$;

-- True when the signed-in user is an owner or admin of a crew that this driver belongs to.
create or replace function rb_private.is_owner_of(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.rb_crew_members o
    join public.rb_crew_members d on d.crew_id = o.crew_id
    where o.user_id = (select auth.uid()) and o.role in ('owner','admin')
      and d.user_id = p_user and d.role = 'driver'
  );
$$;

-- True when the signed-in user may READ this person's records:
-- it is themselves, or an owner of a crew where the driver chose to share.
create or replace function rb_private.can_view_user(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid())
  or exists (
    select 1
    from public.rb_crew_members o
    join public.rb_crew_members d on d.crew_id = o.crew_id
    where o.user_id = (select auth.uid()) and o.role in ('owner','admin')
      and d.user_id = p_user and d.role = 'driver' and d.share_data
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Records the app syncs (one row per thing, id made on the phone)
-- ---------------------------------------------------------------------

create table if not exists public.rb_loads (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_by    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reference     text not null default '' check (char_length(reference) <= 60),
  customer      text not null default '' check (char_length(customer) <= 100),
  description   text not null default '' check (char_length(description) <= 500),
  weight_kg     numeric(10,2) check (weight_kg is null or (weight_kg >= 0 and weight_kg <= 1000000)),
  pickup_label  text not null default '' check (char_length(pickup_label) <= 200),
  pickup_at     timestamptz,
  drop_label    text not null default '' check (char_length(drop_label) <= 200),
  drop_at       timestamptz,
  rate_cents    bigint not null default 0 check (rate_cents between 0 and 100000000000),
  currency      text not null default 'JMD' check (currency in ('JMD','USD')),
  status        text not null default 'booked'
                check (status in ('booked','picked_up','in_transit','delivered','reconciled','cancelled')),
  items         jsonb not null default '[]'::jsonb
                check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 100),
  notes         text not null default '' check (char_length(notes) <= 1000),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.rb_expenses (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  load_id       uuid,
  category      text not null check (category in
                ('fuel','toll','food','repairs','tyres','parking','fines','lodging','phone','permits','wages','other')),
  amount_cents  bigint not null check (amount_cents between 0 and 100000000000),
  currency      text not null default 'JMD' check (currency in ('JMD','USD')),
  vendor        text not null default '' check (char_length(vendor) <= 100),
  note          text not null default '' check (char_length(note) <= 500),
  litres        numeric(8,2) check (litres is null or (litres > 0 and litres <= 5000)),
  paid_by       text not null default 'driver' check (paid_by in ('driver','company')),
  spent_at      timestamptz not null,
  odometer_m    bigint check (odometer_m is null or (odometer_m >= 0 and odometer_m <= 100000000000)),
  receipt_path  text check (receipt_path is null or char_length(receipt_path) <= 300),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists rb_expenses_user_time on public.rb_expenses(user_id, spent_at desc);

create table if not exists public.rb_income (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  load_id       uuid,
  kind          text not null check (kind in ('pay','advance','other')),
  amount_cents  bigint not null check (amount_cents between 0 and 100000000000),
  currency      text not null default 'JMD' check (currency in ('JMD','USD')),
  note          text not null default '' check (char_length(note) <= 500),
  received_at   timestamptz not null,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists rb_income_user_time on public.rb_income(user_id, received_at desc);

create table if not exists public.rb_trips (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  load_id          uuid,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  distance_m       bigint not null default 0 check (distance_m between 0 and 50000000),
  start_odometer_m bigint check (start_odometer_m is null or start_odometer_m between 0 and 100000000000),
  end_odometer_m   bigint check (end_odometer_m is null or end_odometer_m between 0 and 100000000000),
  method           text not null default 'gps' check (method in ('gps','odometer')),
  origin_label     text not null default '' check (char_length(origin_label) <= 200),
  dest_label       text not null default '' check (char_length(dest_label) <= 200),
  note             text not null default '' check (char_length(note) <= 500),
  path             jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(path) = 'array' and jsonb_array_length(path) <= 3000),
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists rb_trips_user_time on public.rb_trips(user_id, started_at desc);

create table if not exists public.rb_deliveries (
  id                uuid primary key,
  load_id           uuid not null,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  delivered_at      timestamptz not null,
  lat               double precision check (lat is null or lat between -90 and 90),
  lng               double precision check (lng is null or lng between -180 and 180),
  accuracy_m        real check (accuracy_m is null or accuracy_m between 0 and 100000),
  receiver_name     text not null default '' check (char_length(receiver_name) <= 100),
  signature_path    text check (signature_path is null or char_length(signature_path) <= 300),
  photo_path        text check (photo_path is null or char_length(photo_path) <= 300),
  items             jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 100),
  has_discrepancy   boolean not null default false,
  discrepancy_note  text not null default '' check (char_length(discrepancy_note) <= 500),
  proof_hash        text check (proof_hash is null or proof_hash ~ '^[0-9a-f]{64}$'),
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists rb_deliveries_load on public.rb_deliveries(load_id);

create table if not exists public.rb_reminders (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 100),
  kind              text not null default 'date' check (kind in ('date','km')),
  due_at            timestamptz,
  due_odometer_m    bigint check (due_odometer_m is null or due_odometer_m between 0 and 100000000000),
  repeat            text not null default 'none' check (repeat in ('none','daily','weekly','monthly','yearly')),
  repeat_every_m    bigint check (repeat_every_m is null or repeat_every_m between 1 and 100000000),
  lead_minutes      integer not null default 60 check (lead_minutes between 0 and 525600),
  snoozed_until     timestamptz,
  done_at           timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.rb_route_plans (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  load_id         uuid,
  title           text not null default '' check (char_length(title) <= 100),
  origin          text not null default '' check (char_length(origin) <= 200),
  destination     text not null default '' check (char_length(destination) <= 200),
  stops           jsonb not null default '[]'::jsonb
                  check (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) <= 20),
  planned_at      timestamptz,
  est_distance_m  bigint check (est_distance_m is null or est_distance_m between 0 and 50000000),
  notes           text not null default '' check (char_length(notes) <= 1000),
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Crew chat and road alerts (shared with the crew, not private).
create table if not exists public.rb_messages (
  id           uuid primary key,
  crew_id      uuid not null references public.rb_crews(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name  text not null default '' check (char_length(author_name) <= 60),
  body         text not null check (char_length(body) between 1 and 1000),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists rb_messages_crew_time on public.rb_messages(crew_id, created_at desc);

create table if not exists public.rb_road_alerts (
  id           uuid primary key,
  crew_id      uuid not null references public.rb_crews(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name  text not null default '' check (char_length(author_name) <= 60),
  kind         text not null check (kind in
               ('accident','flood','roadworks','police','breakdown','traffic','landslide','fuel','other')),
  note         text not null default '' check (char_length(note) <= 300),
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  expires_at   timestamptz not null default (now() + interval '6 hours'),
  cleared_at   timestamptz,
  cleared_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists rb_road_alerts_crew_time on public.rb_road_alerts(crew_id, created_at desc);

-- ---------------------------------------------------------------------
-- 4. Triggers: server time, locked columns, spam limits
-- ---------------------------------------------------------------------

create or replace function rb_private.touch_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Nobody can move a record to another person.
create or replace function rb_private.lock_user_id()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  return new;
end $$;

-- Loads: created_by never changes; only the creator may hand a load to another driver.
create or replace function rb_private.protect_load()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;
  if new.user_id is distinct from old.user_id then
    if old.created_by is distinct from (select auth.uid())
       or not (new.user_id = old.created_by or rb_private.is_owner_of(new.user_id)) then
      raise exception 'You cannot reassign this load';
    end if;
  end if;
  return new;
end $$;

-- Once a delivery has its fingerprint, the proof fields cannot be edited (note and discrepancy stay editable).
create or replace function rb_private.protect_delivery()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.proof_hash is not null and (
       new.proof_hash is distinct from old.proof_hash
    or new.delivered_at is distinct from old.delivered_at
    or new.lat is distinct from old.lat or new.lng is distinct from old.lng
    or new.receiver_name is distinct from old.receiver_name
    or new.signature_path is distinct from old.signature_path
    or new.photo_path is distinct from old.photo_path
    or new.items is distinct from old.items
    or new.load_id is distinct from old.load_id) then
    raise exception 'A sealed delivery proof cannot be changed';
  end if;
  return new;
end $$;

create or replace function rb_private.limit_messages()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.author_name := coalesce((select nullif(p.display_name, '') from public.rb_profiles p where p.id = new.user_id), 'Driver');
  if (select count(*) from public.rb_messages
      where user_id = new.user_id and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Too many messages. Wait a minute.';
  end if;
  return new;
end $$;

create or replace function rb_private.limit_alerts()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.author_name := coalesce((select nullif(p.display_name, '') from public.rb_profiles p where p.id = new.user_id), 'Driver');
  if (select count(*) from public.rb_road_alerts
      where user_id = new.user_id and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many alerts. Wait a few minutes.';
  end if;
  if new.expires_at > now() + interval '48 hours' then
    new.expires_at := now() + interval '48 hours';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rb_profiles','rb_loads','rb_expenses','rb_income','rb_trips','rb_deliveries',
                           'rb_reminders','rb_route_plans','rb_messages','rb_road_alerts']
  loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I
                    for each row execute function rb_private.touch_row()', t);
  end loop;

  foreach t in array array['rb_expenses','rb_income','rb_trips','rb_deliveries','rb_reminders','rb_route_plans']
  loop
    execute format('drop trigger if exists lock_user_id on public.%I', t);
    execute format('create trigger lock_user_id before update on public.%I
                    for each row execute function rb_private.lock_user_id()', t);
  end loop;
end $$;

drop trigger if exists protect_load on public.rb_loads;
create trigger protect_load before update on public.rb_loads
  for each row execute function rb_private.protect_load();

drop trigger if exists protect_delivery on public.rb_deliveries;
create trigger protect_delivery before update on public.rb_deliveries
  for each row execute function rb_private.protect_delivery();

drop trigger if exists limit_messages on public.rb_messages;
create trigger limit_messages before insert on public.rb_messages
  for each row execute function rb_private.limit_messages();

drop trigger if exists limit_alerts on public.rb_road_alerts;
create trigger limit_alerts before insert on public.rb_road_alerts
  for each row execute function rb_private.limit_alerts();

-- No trigger on auth.users: this database is shared with other apps. The app creates the profile row itself on first sign-in.

-- Is the loaded record's creator the signed-in user? (used for delivery proof access)
create or replace function rb_private.is_load_creator(p_load uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.rb_loads l
    where l.id = p_load and l.created_by = (select auth.uid())
  );
$$;

grant execute on all functions in schema rb_private to authenticated;
revoke execute on function rb_private.touch_row(), rb_private.lock_user_id(), rb_private.protect_load(),
  rb_private.limit_messages(), rb_private.limit_alerts(), rb_private.protect_delivery() from authenticated;

-- ---------------------------------------------------------------------
-- 5. Row Level Security policies
-- ---------------------------------------------------------------------

alter table public.rb_profiles      enable row level security;
alter table public.rb_crews         enable row level security;
alter table public.rb_crew_secrets  enable row level security;
alter table public.rb_crew_members  enable row level security;
alter table public.rb_loads         enable row level security;
alter table public.rb_expenses      enable row level security;
alter table public.rb_income        enable row level security;
alter table public.rb_trips         enable row level security;
alter table public.rb_deliveries    enable row level security;
alter table public.rb_reminders     enable row level security;
alter table public.rb_route_plans   enable row level security;
alter table public.rb_messages      enable row level security;
alter table public.rb_road_alerts   enable row level security;
alter table rb_private.join_failures enable row level security;

-- Nothing is readable by anonymous visitors.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'rb\_%' loop
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);   -- re-granted below, table by table
  end loop;
end $$;


-- profiles: your own row only
drop policy if exists profiles_select on public.rb_profiles;
drop policy if exists profiles_insert on public.rb_profiles;
drop policy if exists profiles_update on public.rb_profiles;
create policy profiles_select on public.rb_profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert on public.rb_profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.rb_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- crews and members: read-only for members; all changes go through functions
drop policy if exists crews_select on public.rb_crews;
create policy crews_select on public.rb_crews for select to authenticated
  using (rb_private.is_crew_member(id));

drop policy if exists crew_members_select on public.rb_crew_members;
create policy crew_members_select on public.rb_crew_members for select to authenticated
  using (user_id = (select auth.uid()) or rb_private.is_crew_manager(crew_id));

-- crew_secrets and join_failures: no policies at all, so nobody can touch them directly.

-- Personal records: own rows, plus read access for owners the driver agreed to share with.
do $$
declare t text;
begin
  foreach t in array array['rb_expenses','rb_income','rb_trips','rb_reminders','rb_route_plans']
  loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using (rb_private.can_view_user(user_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
                    with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated
                    using (user_id = (select auth.uid()))', t);
  end loop;
end $$;
-- reminders and route plans are personal planning notes: only you can read them.
drop policy if exists rb_reminders_select on public.rb_reminders;
create policy rb_reminders_select on public.rb_reminders for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists rb_route_plans_select on public.rb_route_plans;
create policy rb_route_plans_select on public.rb_route_plans for select to authenticated
  using (user_id = (select auth.uid()));

-- loads: the driver it is assigned to, the person who created it, and shared-with owners
drop policy if exists loads_select on public.rb_loads;
drop policy if exists loads_insert on public.rb_loads;
drop policy if exists loads_update on public.rb_loads;
drop policy if exists loads_delete on public.rb_loads;
create policy loads_select on public.rb_loads for select to authenticated
  using (user_id = (select auth.uid()) or created_by = (select auth.uid())
         or rb_private.can_view_user(user_id));
create policy loads_insert on public.rb_loads for insert to authenticated
  with check (created_by = (select auth.uid())
              and (user_id = (select auth.uid()) or rb_private.is_owner_of(user_id)));
create policy loads_update on public.rb_loads for update to authenticated
  using (user_id = (select auth.uid()) or created_by = (select auth.uid()))
  with check (user_id = (select auth.uid()) or created_by = (select auth.uid()));
create policy loads_delete on public.rb_loads for delete to authenticated
  using (created_by = (select auth.uid()));

-- deliveries: the driver, shared-with owners, and whoever dispatched the load
drop policy if exists deliveries_select on public.rb_deliveries;
drop policy if exists deliveries_insert on public.rb_deliveries;
drop policy if exists deliveries_update on public.rb_deliveries;
drop policy if exists deliveries_delete on public.rb_deliveries;
create policy deliveries_select on public.rb_deliveries for select to authenticated
  using (rb_private.can_view_user(user_id) or rb_private.is_load_creator(load_id));
create policy deliveries_insert on public.rb_deliveries for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy deliveries_update on public.rb_deliveries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy deliveries_delete on public.rb_deliveries for delete to authenticated
  using (user_id = (select auth.uid()));

-- chat: members read; you may only post as yourself into a crew you belong to
drop policy if exists messages_select on public.rb_messages;
drop policy if exists messages_insert on public.rb_messages;
create policy messages_select on public.rb_messages for select to authenticated
  using (rb_private.is_crew_member(crew_id));
create policy messages_insert on public.rb_messages for insert to authenticated
  with check (user_id = (select auth.uid()) and rb_private.is_crew_member(crew_id));

-- road alerts: same rules
drop policy if exists road_alerts_select on public.rb_road_alerts;
drop policy if exists road_alerts_insert on public.rb_road_alerts;
create policy road_alerts_select on public.rb_road_alerts for select to authenticated
  using (rb_private.is_crew_member(crew_id));
create policy road_alerts_insert on public.rb_road_alerts for insert to authenticated
  with check (user_id = (select auth.uid()) and rb_private.is_crew_member(crew_id)
              and cleared_at is null and cleared_by is null);

-- ---------------------------------------------------------------------
-- 6. Crew functions (the only way to change crews and members)
-- ---------------------------------------------------------------------

create or replace function rb_private.new_join_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symbols, no I, O, 0, 1
  bytes bytea := uuid_send(gen_random_uuid());
  code text := '';
  i int;
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end $$;

create or replace function public.rb_create_crew(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
  v_try  int := 0;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'Crew name must be 2 to 60 characters';
  end if;
  if (select count(*) from public.rb_crew_members where user_id = v_uid and role = 'owner') >= 5 then
    raise exception 'You can run up to 5 crews';
  end if;
  insert into public.rb_crews (name, owner_id) values (v_name, v_uid) returning id into v_id;
  insert into public.rb_crew_members (crew_id, user_id, role, share_data) values (v_id, v_uid, 'owner', false);
  loop
    begin
      insert into public.rb_crew_secrets (crew_id, join_code) values (v_id, rb_private.new_join_code());
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 5 then raise exception 'Could not make a join code, try again'; end if;
    end;
  end loop;
  return v_id;
end $$;

-- Returns the crew id, or NULL when the code is wrong (we return instead of
-- raising so the failed try is still counted by the limiter below).
create or replace function public.rb_join_crew(p_code text, p_share boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_crew  uuid;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  delete from rb_private.join_failures where at < now() - interval '1 day';
  if (select count(*) from rb_private.join_failures
      where user_id = v_uid and at > now() - interval '15 minutes') >= 8 then
    raise exception 'Too many wrong codes. Wait 15 minutes and try again.';
  end if;
  select crew_id into v_crew from public.rb_crew_secrets where join_code = v_code;
  if v_crew is null then
    insert into rb_private.join_failures (user_id) values (v_uid);
    return null;
  end if;
  if (select count(*) from public.rb_crew_members where crew_id = v_crew) >= 200 then
    raise exception 'This crew is full';
  end if;
  insert into public.rb_crew_members (crew_id, user_id, role, share_data)
  values (v_crew, v_uid, 'driver', coalesce(p_share, false))
  on conflict (crew_id, user_id) do update set share_data = coalesce(p_share, false)
    where public.rb_crew_members.role = 'driver';
  return v_crew;
end $$;

create or replace function public.rb_leave_crew(p_crew uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.rb_crew_members
  where crew_id = p_crew and user_id = auth.uid() and role in ('driver','admin');
end $$;

create or replace function public.rb_delete_crew(p_crew uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not rb_private.is_crew_owner(p_crew) then raise exception 'Only the crew owner can do this'; end if;
  delete from public.rb_crews where id = p_crew;
end $$;

create or replace function public.rb_remove_member(p_crew uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not rb_private.is_crew_manager(p_crew) then raise exception 'Only the owner or an admin can do this'; end if;
  -- admins can remove drivers; only the owner can remove an admin
  delete from public.rb_crew_members where crew_id = p_crew and user_id = p_user
    and (role = 'driver' or (role = 'admin' and rb_private.is_crew_owner(p_crew)));
end $$;

create or replace function public.rb_set_share_data(p_crew uuid, p_share boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rb_crew_members set share_data = coalesce(p_share, false)
  where crew_id = p_crew and user_id = auth.uid() and role = 'driver';
end $$;

create or replace function public.rb_crew_join_code(p_crew uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if not rb_private.is_crew_manager(p_crew) then raise exception 'Only the owner or an admin can do this'; end if;
  select join_code into v from public.rb_crew_secrets where crew_id = p_crew;
  return v;
end $$;

create or replace function public.rb_regenerate_join_code(p_crew uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v text; v_try int := 0;
begin
  if not rb_private.is_crew_manager(p_crew) then raise exception 'Only the owner or an admin can do this'; end if;
  loop
    begin
      v := rb_private.new_join_code();
      update public.rb_crew_secrets set join_code = v where crew_id = p_crew;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try > 5 then raise exception 'Could not make a join code, try again'; end if;
    end;
  end loop;
  return v;
end $$;

create or replace function public.rb_crew_roster(p_crew uuid)
returns table (user_id uuid, display_name text, role text, share_data boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not rb_private.is_crew_member(p_crew) then raise exception 'Not a member of this crew'; end if;
  return query
    select m.user_id, coalesce(nullif(p.display_name, ''), 'Driver'), m.role,
           -- only the owner (and the person themselves) may see who shares data
           case when rb_private.is_crew_manager(p_crew) or m.user_id = auth.uid() then m.share_data else null end,
           m.joined_at
    from public.rb_crew_members m
    left join public.rb_profiles p on p.id = m.user_id
    where m.crew_id = p_crew
    order by (m.role = 'owner') desc, (m.role = 'admin') desc, m.joined_at;
end $$;

-- Totals per driver for the owner. Drivers who did not agree to share show as not shared, with no numbers.
create or replace function public.rb_crew_report(p_crew uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_out jsonb;
  v_from timestamptz;
  v_to timestamptz;
begin
  if not rb_private.is_crew_manager(p_crew) then raise exception 'Only the owner or an admin can do this'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose a date range of up to 400 days';
  end if;
  -- Days are Jamaica days (UTC-5, no daylight saving), not UTC days.
  v_from := p_from::timestamp at time zone 'America/Jamaica';
  v_to := (p_to + 1)::timestamp at time zone 'America/Jamaica';
  select coalesce(jsonb_agg(row_data order by name), '[]'::jsonb) into v_out
  from (
    select coalesce(nullif(p.display_name, ''), 'Driver') as name,
      case when m.share_data then jsonb_build_object(
        'user_id', m.user_id,
        'display_name', coalesce(nullif(p.display_name, ''), 'Driver'),
        'shared', true,
        'distance_m', coalesce((select sum(t.distance_m) from public.rb_trips t
            where t.user_id = m.user_id and t.deleted_at is null
              and t.started_at >= v_from and t.started_at < v_to), 0),
        'trips', (select count(*) from public.rb_trips t
            where t.user_id = m.user_id and t.deleted_at is null
              and t.started_at >= v_from and t.started_at < v_to),
        'loads_delivered', (select count(*) from public.rb_loads l
            where l.user_id = m.user_id and l.deleted_at is null
              and l.status in ('delivered','reconciled')
              and exists (select 1 from public.rb_deliveries d
                          where d.load_id = l.id and d.deleted_at is null
                            and d.delivered_at >= v_from and d.delivered_at < v_to)),
        'expenses', coalesce((select jsonb_object_agg(c.currency, c.total) from (
            select e.currency, sum(e.amount_cents) as total from public.rb_expenses e
            where e.user_id = m.user_id and e.deleted_at is null
              and e.spent_at >= v_from and e.spent_at < v_to
            group by e.currency) c), '{}'::jsonb),
        'income', coalesce((select jsonb_object_agg(c.currency, c.total) from (
            select i.currency, sum(i.amount_cents) as total from public.rb_income i
            where i.user_id = m.user_id and i.deleted_at is null
              and i.received_at >= v_from and i.received_at < v_to
            group by i.currency) c), '{}'::jsonb)
      ) else jsonb_build_object(
        'user_id', m.user_id,
        'display_name', coalesce(nullif(p.display_name, ''), 'Driver'),
        'shared', false)
      end as row_data
    from public.rb_crew_members m
    left join public.rb_profiles p on p.id = m.user_id
    where m.crew_id = p_crew and m.role = 'driver'
  ) s;
  return v_out;
end $$;

create or replace function public.rb_delete_message(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rb_messages m set deleted_at = now()
  where m.id = p_id and m.deleted_at is null
    and (m.user_id = auth.uid() or rb_private.is_crew_manager(m.crew_id));
end $$;

create or replace function public.rb_clear_alert(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rb_road_alerts a set cleared_at = now(), cleared_by = auth.uid()
  where a.id = p_id and a.cleared_at is null and rb_private.is_crew_member(a.crew_id);
end $$;

-- Owner only: promote a driver to admin (dispatcher) or move an admin back to driver.
create or replace function public.rb_set_member_role(p_crew uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not rb_private.is_crew_owner(p_crew) then raise exception 'Only the crew owner can do this'; end if;
  if p_role not in ('admin','driver') then raise exception 'Role must be admin or driver'; end if;
  update public.rb_crew_members set role = p_role, share_data = case when p_role = 'admin' then false else share_data end
  where crew_id = p_crew and user_id = p_user and role in ('admin','driver');
end $$;

-- Owner only: company name, accent colour and contact phone.
create or replace function public.rb_update_crew(p_crew uuid, p_name text, p_color text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not rb_private.is_crew_owner(p_crew) then raise exception 'Only the crew owner can do this'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then raise exception 'Crew name must be 2 to 60 characters'; end if;
  if coalesce(p_color, '') <> '' and p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Colour must look like #1a73e8'; end if;
  update public.rb_crews set name = v_name, brand_color = coalesce(p_color, ''), phone = left(btrim(coalesce(p_phone, '')), 30)
  where id = p_crew;
end $$;

-- Right to erasure: removes the account and (through cascades) every row it owns.
-- The app removes the person's files from Storage first.
create or replace function public.rb_delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  delete from public.rb_crews where owner_id = v;            -- members, messages, alerts go with the crew
  delete from public.rb_crew_members where user_id = v;
  delete from public.rb_messages where user_id = v;
  delete from public.rb_road_alerts where user_id = v;
  delete from public.rb_deliveries where user_id = v;
  delete from public.rb_loads where user_id = v or created_by = v;
  delete from public.rb_expenses where user_id = v;
  delete from public.rb_income where user_id = v;
  delete from public.rb_trips where user_id = v;
  delete from public.rb_reminders where user_id = v;
  delete from public.rb_route_plans where user_id = v;
  delete from public.rb_profiles where id = v;
  -- The login itself (auth.users) is NOT deleted here because other apps in this project may use it.
end $$;

-- Functions are callable only by signed-in users.
do $$
declare f text;
begin
  foreach f in array array[
    'rb_create_crew(text)','rb_join_crew(text,boolean)','rb_leave_crew(uuid)','rb_delete_crew(uuid)',
    'rb_remove_member(uuid,uuid)','rb_set_share_data(uuid,boolean)','rb_crew_join_code(uuid)',
    'rb_regenerate_join_code(uuid)','rb_crew_roster(uuid)','rb_crew_report(uuid,date,date)',
    'rb_delete_message(uuid)','rb_clear_alert(uuid)','rb_delete_my_account()',
    'rb_set_member_role(uuid,uuid,text)','rb_update_crew(uuid,text,text,text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Table permissions for signed-in users (RLS above decides the rows)
-- ---------------------------------------------------------------------

grant select, insert, update on public.rb_profiles to authenticated;
grant select on public.rb_crews, public.rb_crew_members to authenticated;
grant select, insert, update, delete on public.rb_loads, public.rb_expenses, public.rb_income, public.rb_trips,
  public.rb_deliveries, public.rb_reminders, public.rb_route_plans to authenticated;
grant select, insert on public.rb_messages, public.rb_road_alerts to authenticated;

-- ---------------------------------------------------------------------
-- 8. Realtime (live chat and alerts)
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.rb_messages;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.rb_road_alerts;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. Storage: private bucket for receipts, signatures and delivery photos
--    Files live under  <user id>/...  and only that person can open them.
--    Owners the driver shares with can read them too; whoever dispatched a
--    load can read its delivery proof (<user id>/proof/<load id>/...).
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roadbook-files', 'roadbook-files', false, 3145728, array['image/jpeg','image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png'];

drop policy if exists roadbook_files_select on storage.objects;
drop policy if exists roadbook_files_insert on storage.objects;
drop policy if exists roadbook_files_update on storage.objects;
drop policy if exists roadbook_files_delete on storage.objects;

create policy roadbook_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'roadbook-files'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      rb_private.can_view_user(((storage.foldername(name))[1])::uuid)
      or ((storage.foldername(name))[2] = 'proof'
          and (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and rb_private.is_load_creator(((storage.foldername(name))[3])::uuid))
    )
  );
create policy roadbook_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'roadbook-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy roadbook_files_update on storage.objects for update to authenticated
  using (bucket_id = 'roadbook-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'roadbook-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy roadbook_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'roadbook-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
