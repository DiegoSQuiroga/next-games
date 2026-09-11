-- Apply manually as postgres AFTER the booking persistence and Broadcast migrations.
-- Never reapply the old development migration afterward: it grants anon Admin access.
begin;

do $$
begin
  if to_regprocedure('public.admin_list_booking_groups()') is null
    or to_regprocedure('public.admin_save_booking_group(text,jsonb,text,text)') is null
    or to_regprocedure('public.admin_set_booking_status(text,text)') is null then
    raise exception 'Install the booking persistence migration before Admin authorization';
  end if;
end $$;

create table if not exists public.staff_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.staff_users enable row level security;
revoke all on public.staff_users from public, anon, authenticated;
-- Membership is managed only by trusted SQL/dashboard administrators, never by clients.
revoke all on schema next_games_private from public, anon, authenticated;

create or replace function next_games_private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.staff_users s where s.user_id = auth.uid()
  );
$$;
revoke all on function next_games_private.is_staff() from public, anon, authenticated;

-- Safe UX check: no arguments, no membership list, only the caller's authorization.
create or replace function public.is_current_user_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select next_games_private.is_staff();
$$;
revoke all on function public.is_current_user_staff() from public, anon, authenticated;
grant execute on function public.is_current_user_staff() to authenticated;

create or replace function public.admin_list_booking_groups()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not next_games_private.is_staff() then
    raise exception using errcode = '42501', message = 'Staff authorization required';
  end if;
  perform next_games_private.expire_groups();
  return coalesce((select jsonb_agg(next_games_private.group_json(id::text) order by created_at desc)
    from public.booking_groups), '[]'::jsonb);
end $$;

create or replace function public.admin_save_booking_group(
  p_customer_name text, p_sessions jsonb, p_id text default null, p_status text default 'pending_payment'
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if not next_games_private.is_staff() then
    raise exception using errcode = '42501', message = 'Staff authorization required';
  end if;
  return next_games_private.write_group(p_customer_name, p_sessions, true, p_id, p_status);
end $$;

create or replace function public.admin_set_booking_status(p_id text, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_group public.booking_groups%rowtype;
begin
  if not next_games_private.is_staff() then
    raise exception using errcode = '42501', message = 'Staff authorization required';
  end if;
  if p_status is null or p_status not in ('confirmed', 'cancelled') then raise exception 'Invalid status change'; end if;
  perform next_games_private.expire_groups();
  select * into v_group from public.booking_groups where id::text = p_id;
  if not found then raise exception 'Booking not found'; end if;
  if p_status = 'confirmed' and v_group.status::text not in ('pending_payment', 'confirmed') then
    raise exception 'This booking has expired or was cancelled. Edit it to re-check availability first.';
  end if;
  v_group.status := p_status;
  update public.booking_groups set status = v_group.status where id = v_group.id;
  return next_games_private.group_json(p_id);
end $$;

revoke all on function public.admin_list_booking_groups(),
  public.admin_save_booking_group(text, jsonb, text, text), public.admin_set_booking_status(text, text)
  from public, anon, authenticated;
grant execute on function public.admin_list_booking_groups(),
  public.admin_save_booking_group(text, jsonb, text, text), public.admin_set_booking_status(text, text)
  to authenticated;

-- Customer RPCs, catalog grants, booking RLS and public Broadcast remain unchanged.
-- No actual Auth user or staff membership is created by this migration.
notify pgrst, 'reload schema';
commit;
