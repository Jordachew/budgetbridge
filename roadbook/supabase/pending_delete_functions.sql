-- Run this once in Supabase > SQL Editor (these contain DELETE statements, which the assistant's database tool will not run without an approval prompt).
-- It completes the Roadbook install in the shared jw-excel-academy project. Safe to run again.

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

revoke all on function public.rb_join_crew(text,boolean), public.rb_leave_crew(uuid), public.rb_delete_crew(uuid),
  public.rb_remove_member(uuid,uuid), public.rb_delete_my_account() from public, anon;
grant execute on function public.rb_join_crew(text,boolean), public.rb_leave_crew(uuid), public.rb_delete_crew(uuid),
  public.rb_remove_member(uuid,uuid), public.rb_delete_my_account() to authenticated;
