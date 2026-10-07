-- =====================================================================
-- Roadbook v2 additions: vehicles, invoices, maintenance, documents, places, settlements.
-- Run AFTER schema.sql, in the same SQL Editor. Safe to run more than once.
-- Same rules as schema.sql: everything starts with rb_, row level security is on,
-- people only see their own rows (settlements are also visible to the driver they are for).
-- =====================================================================

-- Columns added to existing tables
alter table public.rb_expenses add column if not exists vehicle_id uuid;
alter table public.rb_expenses add column if not exists lat double precision check (lat is null or lat between -90 and 90);
alter table public.rb_expenses add column if not exists lng double precision check (lng is null or lng between -180 and 180);
alter table public.rb_trips    add column if not exists vehicle_id uuid;

create table if not exists public.rb_vehicles (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  plate       text not null default '' check (char_length(plate) <= 20),
  make        text not null default '' check (char_length(make) <= 40),
  model       text not null default '' check (char_length(model) <= 40),
  year        integer check (year is null or year between 1950 and 2100),
  vin         text not null default '' check (char_length(vin) <= 30),
  fuel_type   text not null default 'diesel' check (fuel_type in ('diesel','petrol','lpg','other')),
  tank_litres numeric(7,1) check (tank_litres is null or (tank_litres > 0 and tank_litres <= 5000)),
  odometer_m  bigint check (odometer_m is null or odometer_m between 0 and 100000000000),
  notes       text not null default '' check (char_length(notes) <= 1000),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.rb_invoices (
  id               uuid primary key,
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  load_id          uuid,
  number           text not null check (char_length(number) between 1 and 30),
  customer         text not null default '' check (char_length(customer) <= 100),
  customer_email   text not null default '' check (char_length(customer_email) <= 120),
  customer_address text not null default '' check (char_length(customer_address) <= 300),
  issue_date       date not null,
  due_date         date,
  items            jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 100),
  tax_pct          numeric(5,2) not null default 0 check (tax_pct between 0 and 100),
  discount_cents   bigint not null default 0 check (discount_cents between 0 and 100000000000),
  currency         text not null default 'JMD' check (currency in ('JMD','USD')),
  status           text not null default 'draft' check (status in ('draft','sent','paid','void')),
  paid_at          timestamptz,
  paid_cents       bigint not null default 0 check (paid_cents between 0 and 100000000000),
  notes            text not null default '' check (char_length(notes) <= 1000),
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists rb_invoices_user_issue on public.rb_invoices(user_id, issue_date desc);

create table if not exists public.rb_maintenance (
  id                   uuid primary key,
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id           uuid,
  kind                 text not null default 'other' check (kind in ('oil','tyres','brakes','inspection','repair','other')),
  title                text not null check (char_length(title) between 1 and 100),
  done_at              timestamptz not null,
  odometer_m           bigint check (odometer_m is null or odometer_m between 0 and 100000000000),
  cost_cents           bigint not null default 0 check (cost_cents between 0 and 100000000000),
  currency             text not null default 'JMD' check (currency in ('JMD','USD')),
  vendor               text not null default '' check (char_length(vendor) <= 100),
  notes                text not null default '' check (char_length(notes) <= 1000),
  next_due_at          timestamptz,
  next_due_odometer_m  bigint check (next_due_odometer_m is null or next_due_odometer_m between 0 and 100000000000),
  receipt_path         text check (receipt_path is null or char_length(receipt_path) <= 300),
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.rb_documents (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vehicle_id  uuid,
  kind        text not null default 'other' check (kind in ('licence','insurance','registration','fitness','permit','other')),
  title       text not null check (char_length(title) between 1 and 100),
  number      text not null default '' check (char_length(number) <= 60),
  issued_at   date,
  expires_at  date,
  file_path   text check (file_path is null or char_length(file_path) <= 300),
  notes       text not null default '' check (char_length(notes) <= 1000),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.rb_places (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null default 'other' check (kind in ('fuel','parking','rest','customer','yard','other')),
  name        text not null check (char_length(name) between 1 and 100),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  note        text not null default '' check (char_length(note) <= 300),
  fuel_price_cents bigint check (fuel_price_cents is null or fuel_price_cents between 0 and 1000000),
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A settlement is a pay statement an owner/dispatcher prepares for a driver.
create table if not exists public.rb_settlements (
  id           uuid primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,   -- who prepared it
  crew_id      uuid,
  driver_id    uuid not null references auth.users(id) on delete cascade,
  period_from  date not null,
  period_to    date not null,
  gross_cents  bigint not null default 0 check (gross_cents between 0 and 100000000000),
  deductions   jsonb not null default '[]'::jsonb
               check (jsonb_typeof(deductions) = 'array' and jsonb_array_length(deductions) <= 50),
  net_cents    bigint not null default 0 check (net_cents between -100000000000 and 100000000000),
  currency     text not null default 'JMD' check (currency in ('JMD','USD')),
  status       text not null default 'draft' check (status in ('draft','final','paid')),
  paid_at      timestamptz,
  notes        text not null default '' check (char_length(notes) <= 1000),
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (period_to >= period_from)
);

-- Triggers
do $$
declare t text;
begin
  foreach t in array array['rb_vehicles','rb_invoices','rb_maintenance','rb_documents','rb_places','rb_settlements'] loop
    execute format('drop trigger if exists touch_row on public.%I', t);
    execute format('create trigger touch_row before insert or update on public.%I
                    for each row execute function rb_private.touch_row()', t);
    execute format('drop trigger if exists lock_user_id on public.%I', t);
    execute format('create trigger lock_user_id before update on public.%I
                    for each row execute function rb_private.lock_user_id()', t);
  end loop;
end $$;

-- Row level security: personal tables are private to their owner
do $$
declare t text;
begin
  foreach t in array array['rb_vehicles','rb_invoices','rb_maintenance','rb_documents','rb_places'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('drop policy if exists %1$s_insert on public.%1$I', t);
    execute format('drop policy if exists %1$s_update on public.%1$I', t);
    execute format('drop policy if exists %1$s_delete on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Settlements: the preparer and the driver can read; only the preparer (a manager of a crew the driver is in) writes.
alter table public.rb_settlements enable row level security;
drop policy if exists settlements_select on public.rb_settlements;
drop policy if exists settlements_insert on public.rb_settlements;
drop policy if exists settlements_update on public.rb_settlements;
drop policy if exists settlements_delete on public.rb_settlements;
create policy settlements_select on public.rb_settlements for select to authenticated
  using (user_id = (select auth.uid()) or driver_id = (select auth.uid()));
create policy settlements_insert on public.rb_settlements for insert to authenticated
  with check (user_id = (select auth.uid()) and (driver_id = (select auth.uid()) or rb_private.is_owner_of(driver_id)));
create policy settlements_update on public.rb_settlements for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy settlements_delete on public.rb_settlements for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.rb_settlements from anon, authenticated;
grant select, insert, update, delete on public.rb_settlements to authenticated;

-- "Delete my data" must also erase the v2 tables (the shared login itself is kept).
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
  delete from public.rb_vehicles where user_id = v;
  delete from public.rb_invoices where user_id = v;
  delete from public.rb_maintenance where user_id = v;
  delete from public.rb_documents where user_id = v;
  delete from public.rb_places where user_id = v;
  delete from public.rb_settlements where user_id = v or driver_id = v;
  delete from public.rb_profiles where id = v;
  -- The login itself (auth.users) is NOT deleted here because other apps in this project may use it.
end $$;
revoke all on function public.rb_delete_my_account() from public, anon;
grant execute on function public.rb_delete_my_account() to authenticated;
