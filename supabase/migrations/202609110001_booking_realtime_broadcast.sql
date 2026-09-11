-- Run this entire file manually in Supabase SQL Editor as postgres AFTER
-- 202609100001_booking_persistence.sql. No booking data or permissions are changed.
begin;

do $$
begin
  if to_regclass('public.booking_groups') is null or to_regclass('public.bookings') is null
     or to_regnamespace('next_games_private') is null then
    raise exception 'Apply the booking persistence migration before the Broadcast migration';
  end if;
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    raise exception 'Supabase realtime.send(jsonb,text,text,boolean) is required';
  end if;
end $$;

-- Public topic carries ONLY an empty invalidation signal. Never pass NEW/OLD,
-- names, references, IDs, resource assignments, dates or status into the payload.
-- Public listeners may also send this generic signal: it is never trusted as data.
-- Existing booking RLS, table grants and RPC authorization remain unchanged.
create or replace function next_games_private.broadcast_booking_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'booking_changed', 'next-games-bookings', false);
  return null; -- AFTER trigger; the return value does not affect the booking row.
exception when others then
  -- Notifications are best-effort and must not break authoritative booking writes.
  -- No row values or error detail are logged. Recovery reads cover delivery failures.
  raise warning 'Booking Broadcast notification unavailable';
  return null;
end $$;

revoke all on function next_games_private.broadcast_booking_change() from public, anon, authenticated;

-- Row triggers emit nothing for zero-row UPDATEs (including expiration reads).
-- This prevents notification -> RPC read -> empty UPDATE -> notification loops.
create or replace trigger next_games_booking_groups_broadcast
after insert or update or delete on public.booking_groups
for each row execute function next_games_private.broadcast_booking_change();

create or replace trigger next_games_bookings_broadcast
after insert or update or delete on public.bookings
for each row execute function next_games_private.broadcast_booking_change();

-- No direct Postgres Changes publication or anonymous booking SELECT is needed.
-- Supabase Realtime must allow public channels for this anonymous notification topic.
commit;
