-- Run this entire file in Supabase SQL Editor as postgres. Transactional and non-destructive.
-- DEVELOPMENT ONLY: admin RPC access is temporarily anonymous at the product owner's request.
begin;

-- Validate the existing manually-created schema first. Never recreate the four tables.
do $$
declare
  v_table text;
  v_column text;
  v_columns text[];
  v_status_type text;
  v_status text;
begin
  foreach v_table in array array['games', 'resources', 'booking_groups', 'bookings'] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Existing table public.% is missing; migration stopped without replacing tables', v_table;
    end if;
    v_columns := case v_table
      when 'games' then array['id', 'name', 'price_dkk', 'active']
      when 'resources' then array['id', 'game_id', 'name', 'active']
      when 'booking_groups' then array['id', 'reference', 'customer_name', 'status', 'total_price_dkk', 'payment_deadline', 'created_at']
      else array['id', 'booking_group_id', 'resource_id', 'starts_at', 'ends_at', 'price_dkk', 'created_at'] end;
    foreach v_column in array v_columns loop
      if not exists (select 1 from pg_attribute where attrelid = to_regclass('public.' || v_table)
        and attname = v_column and not attisdropped) then
        raise exception 'Required column public.%.% is missing', v_table, v_column;
      end if;
      if v_column in ('starts_at', 'ends_at', 'payment_deadline', 'created_at') and exists (
        select 1 from pg_attribute where attrelid = to_regclass('public.' || v_table)
        and attname = v_column and atttypid <> 'timestamptz'::regtype) then
        raise exception 'public.%.% must be timestamptz; review schema before proceeding', v_table, v_column;
      end if;
    end loop;
    if v_table in ('bookings', 'booking_groups') and not exists (
      select 1 from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = to_regclass('public.' || v_table) and a.attname = 'id'
      and (a.attidentity <> '' or d.oid is not null)) then
      raise exception 'public.%.id needs an existing identity/default generator', v_table;
    end if;
  end loop;
  select format_type(atttypid, atttypmod) into v_status_type from pg_attribute
    where attrelid = 'public.booking_groups'::regclass and attname = 'status';
  foreach v_status in array array['pending_payment', 'confirmed', 'cancelled'] loop
    execute format('select %L::%s', v_status, v_status_type);
  end loop;
  if exists (select 1 from public.bookings a join public.bookings b
    on a.id::text < b.id::text and a.resource_id = b.resource_id
    and a.starts_at < b.ends_at and b.starts_at < a.ends_at
    join public.booking_groups ga on ga.id = a.booking_group_id
    join public.booking_groups gb on gb.id = b.booking_group_id
    where (ga.status::text = 'confirmed' or (ga.status::text = 'pending_payment' and ga.payment_deadline >= now()))
      and (gb.status::text = 'confirmed' or (gb.status::text = 'pending_payment' and gb.payment_deadline >= now()))) then
    raise exception 'Existing active bookings overlap. Review these rows before applying this migration';
  end if;
end $$;

create schema if not exists next_games_private;
revoke all on schema next_games_private from public, anon, authenticated;
create unique index if not exists next_games_booking_reference_unique on public.booking_groups(reference);
create index if not exists next_games_booking_resource_window on public.bookings(resource_id, starts_at, ends_at);
create index if not exists next_games_booking_group_idx on public.bookings(booking_group_id);
create index if not exists next_games_customer_idx on public.booking_groups(lower(btrim(customer_name)));

alter table public.booking_groups enable row level security;
alter table public.bookings enable row level security;
alter table public.games enable row level security;
alter table public.resources enable row level security;
-- Existing policies cannot bypass revoked table privileges. All browser access goes through RPCs.
revoke all on public.booking_groups, public.bookings from public, anon, authenticated;
-- Keep existing catalog SELECT policies; explicitly remove all anonymous/authenticated write grants.
revoke insert, update, delete, truncate, references, trigger on public.games, public.resources from public, anon, authenticated;
grant select on public.games, public.resources to anon, authenticated;
-- Preserve anonymous catalog policies; future Reception sessions also need read access.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'games' and policyname = 'next_games_authenticated_read') then
    create policy next_games_authenticated_read on public.games for select to authenticated using (active);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'resources' and policyname = 'next_games_authenticated_read') then
    create policy next_games_authenticated_read on public.resources for select to authenticated using (active);
  end if;
end $$;
do $$
declare v_table text; v_columns text;
begin
  foreach v_table in array array['games', 'resources', 'booking_groups', 'bookings'] loop
    select string_agg(quote_ident(attname), ',') into v_columns from pg_attribute
      where attrelid = to_regclass('public.' || v_table) and attnum > 0 and not attisdropped;
    execute format('revoke insert (%s), update (%s), references (%s) on public.%I from public, anon, authenticated',
      v_columns, v_columns, v_columns, v_table);
  end loop;
end $$;

-- Retain existing foreign keys. Add only missing relationships, validating existing rows.
do $$
declare r record; v_source smallint; v_target smallint;
begin
  for r in select * from (values
    ('resources', 'game_id', 'games', 'next_games_resource_game_fk'),
    ('bookings', 'booking_group_id', 'booking_groups', 'next_games_session_group_fk'),
    ('bookings', 'resource_id', 'resources', 'next_games_session_resource_fk')
  ) as relationships(source_table, source_column, target_table, constraint_name) loop
    select attnum into v_source from pg_attribute where attrelid = to_regclass('public.' || r.source_table) and attname = r.source_column;
    select attnum into v_target from pg_attribute where attrelid = to_regclass('public.' || r.target_table) and attname = 'id';
    if not exists (select 1 from pg_constraint where contype = 'f'
      and conrelid = to_regclass('public.' || r.source_table) and confrelid = to_regclass('public.' || r.target_table)
      and conkey = array[v_source] and confkey = array[v_target]) then
      execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id)',
        r.source_table, r.constraint_name, r.source_column, r.target_table);
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.bookings'::regclass and conname = 'next_games_one_hour') then
    alter table public.bookings add constraint next_games_one_hour check (ends_at = starts_at + interval '1 hour');
  end if;
end $$;

create or replace function next_games_private.lock_bookings()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  -- All RPC mutations acquire the SAME transaction-scoped lock before reading availability.
  -- VOLATILE + READ COMMITTED obtains a fresh snapshot after a competing transaction commits.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Booking RPCs require READ COMMITTED isolation';
  end if;
  perform pg_advisory_xact_lock(781546, 1);
end $$;

create or replace function next_games_private.expire_groups()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform next_games_private.lock_bookings();
  update public.booking_groups set status = 'cancelled'
    where status::text = 'pending_payment' and payment_deadline < clock_timestamp();
end $$;

create or replace function next_games_private.group_json(p_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id::text, 'reference', g.reference, 'customer_name', g.customer_name,
    'status', g.status::text, 'total_price_dkk', g.total_price_dkk,
    'payment_deadline', g.payment_deadline, 'created_at', g.created_at,
    'bookings', coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id::text, 'resource_id', b.resource_id::text,
      'game_name', game.name, 'resource_name', r.name,
      'starts_at', b.starts_at, 'ends_at', b.ends_at,
      'price_dkk', b.price_dkk, 'created_at', b.created_at
    ) order by b.starts_at, b.id) from public.bookings b
      join public.resources r on r.id = b.resource_id
      join public.games game on game.id = r.game_id
      where b.booking_group_id = g.id), '[]'::jsonb)
  ) from public.booking_groups g where g.id::text = p_id;
$$;

-- Customer responses omit physical assignments; admin responses retain them.
create or replace function next_games_private.customer_group_json(p_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select payload || jsonb_build_object('bookings', coalesce((
    select jsonb_agg(session - 'resource_id' - 'resource_name' order by ordinal)
    from jsonb_array_elements(payload->'bookings') with ordinality as sessions(session, ordinal)
  ), '[]'::jsonb))
  from (select next_games_private.group_json(p_id) as payload) source
  where payload is not null;
$$;

-- 12 unambiguous base-32 characters (60 random bits), with no public sequence.
create or replace function next_games_private.generate_booking_reference()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_reference text := 'NG-';
begin
  for i in 1..12 loop
    -- The first byte of each random UUID is random, not a version/variant byte.
    v_reference := v_reference || substr(v_alphabet, (get_byte(uuid_send(gen_random_uuid()), 0) % 32) + 1, 1);
  end loop;
  return v_reference;
end $$;

create or replace function next_games_private.write_group(
  p_customer_name text, p_sessions jsonb, p_admin boolean,
  p_id text default null, p_status text default 'pending_payment'
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_group public.booking_groups%rowtype;
  v_game public.games%rowtype;
  v_resource public.resources%rowtype;
  v_session jsonb;
  v_name text := regexp_replace(p_customer_name, '^\s+|\s+$', '', 'g');
  v_date date;
  v_time time;
  v_start timestamptz;
  v_end timestamptz;
  v_created timestamptz;
  v_deadline timestamptz;
  v_session_deadline timestamptz;
  v_total numeric := 0;
  v_count integer;
  v_reference text;
  v_attempt integer := 0;
begin
  if v_name is null or v_name = '' then raise exception 'Customer name is required'; end if;
  if jsonb_typeof(p_sessions) is distinct from 'array' then raise exception 'Choose one or two sessions'; end if;
  v_count := jsonb_array_length(p_sessions);
  if v_count not between 1 and 2 then raise exception 'Choose one or two sessions'; end if;
  if p_status is null or p_status not in ('pending_payment', 'confirmed') then raise exception 'Invalid booking status'; end if;
  if not p_admin and (p_id is not null or p_status <> 'pending_payment') then raise exception 'Invalid customer action'; end if;

  perform next_games_private.expire_groups();
  v_created := clock_timestamp();
  if p_id is not null then
    select * into v_group from public.booking_groups where id::text = p_id;
    if not found then raise exception 'Booking not found'; end if;
    v_created := v_group.created_at;
  end if;

  if (select count(*) from public.bookings b join public.booking_groups g on g.id = b.booking_group_id
      where lower(regexp_replace(g.customer_name, '^\s+|\s+$', '', 'g')) = lower(v_name)
      and g.status::text in ('pending_payment', 'confirmed')
      and (p_id is null or g.id::text <> p_id)) + v_count > 2 then
    raise exception 'This customer already has 2 active reservations';
  end if;

  if p_id is null then
    -- UNIQUE remains authoritative; collisions never overwrite existing bookings.
    loop
      v_attempt := v_attempt + 1;
      if v_attempt > 10 then raise exception 'Unable to generate a unique booking reference; please retry'; end if;
      v_reference := next_games_private.generate_booking_reference();
      insert into public.booking_groups(reference, customer_name, status, total_price_dkk, payment_deadline, created_at)
      values (v_reference, v_name, 'pending_payment', 0, v_created, v_created)
      on conflict (reference) do nothing returning * into v_group;
      exit when found;
    end loop;
  else
    -- Replacement is inside this transaction: any error rolls back both deletion and reassignment.
    delete from public.bookings where booking_group_id = v_group.id;
  end if;

  for v_session in select value from jsonb_array_elements(p_sessions) loop
    if jsonb_typeof(v_session) is distinct from 'object'
       or coalesce(v_session->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(v_session->>'time', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
      raise exception 'Enter a valid operating date and start time';
    end if;
    v_date := (v_session->>'date')::date;
    v_time := (v_session->>'time')::time;
    if v_time > time '01:00' and v_time < time '10:00' then
      raise exception 'Sessions must start between 10:00 and 01:00 and finish by 02:00';
    end if;
    if not p_admin and mod(extract(minute from v_time)::integer, 30) <> 0 then
      raise exception 'Choose a customer start time in 30-minute increments';
    end if;
    v_start := ((v_date + case when v_time < time '10:00' then 1 else 0 end) + v_time) at time zone 'Europe/Copenhagen';
    v_end := v_start + interval '1 hour';
    select * into v_game from public.games where active and name = case v_session->>'gameType'
      when 'pool' then 'Pool' when 'darts' then 'Darts' when 'ping-pong' then 'Ping Pong' when 'shuffleboard' then 'Shuffleboard' end;
    if not found then raise exception 'Game is not available'; end if;

    select r.* into v_resource from public.resources r where r.active and r.game_id = v_game.id
      and not exists (select 1 from public.bookings b join public.booking_groups g on g.id = b.booking_group_id
        where b.resource_id = r.id and (g.id = v_group.id or g.status::text in ('pending_payment', 'confirmed'))
        and b.starts_at < v_end and v_start < b.ends_at)
      order by r.id limit 1;
    if not found then raise exception using errcode = '23P01', message = 'That time was just booked by someone else. Please choose another slot.'; end if;
    insert into public.bookings(booking_group_id, resource_id, starts_at, ends_at, price_dkk, created_at)
      values (v_group.id, v_resource.id, v_start, v_end, v_game.price_dkk, v_created);
    v_total := v_total + v_game.price_dkk;
    v_session_deadline := case when v_start - v_created > interval '45 minutes'
      then v_start - interval '45 minutes' else v_created + interval '10 minutes' end;
    v_deadline := least(v_deadline, v_session_deadline);
  end loop;
  v_group.status := p_status;
  update public.booking_groups set customer_name = v_name, status = v_group.status,
    total_price_dkk = v_total, payment_deadline = v_deadline where id = v_group.id;
  perform next_games_private.expire_groups();
  if p_admin then return next_games_private.group_json(v_group.id::text); end if;
  return next_games_private.customer_group_json(v_group.id::text);
end $$;

create or replace function public.create_booking_group(p_customer_name text, p_sessions jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select next_games_private.write_group(p_customer_name, p_sessions, false);
$$;

create or replace function public.admin_save_booking_group(
  p_customer_name text, p_sessions jsonb, p_id text default null, p_status text default 'pending_payment'
) returns jsonb language sql volatile security definer set search_path = '' as $$
  select next_games_private.write_group(p_customer_name, p_sessions, true, p_id, p_status);
$$;

create or replace function public.admin_set_booking_status(p_id text, p_status text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_group public.booking_groups%rowtype;
begin
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

create or replace function public.get_booking_group(p_reference text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id text;
begin
  perform next_games_private.expire_groups();
  select id::text into v_id from public.booking_groups where reference = upper(btrim(p_reference));
  return next_games_private.customer_group_json(v_id);
end $$;

create or replace function public.admin_list_booking_groups()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform next_games_private.expire_groups();
  return coalesce((select jsonb_agg(next_games_private.group_json(id::text) order by created_at desc)
    from public.booking_groups), '[]'::jsonb);
end $$;

-- Public availability omits customer names/references. The browser uses the existing overlap rule.
create or replace function public.get_booking_availability(p_date date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform next_games_private.expire_groups();
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', b.id::text, 'resource_id', b.resource_id::text, 'game_name', game.name,
    'starts_at', b.starts_at, 'ends_at', b.ends_at, 'status', g.status::text
  )) from public.bookings b join public.booking_groups g on g.id = b.booking_group_id
    join public.resources r on r.id = b.resource_id join public.games game on game.id = r.game_id
    where g.status::text in ('pending_payment', 'confirmed')
    and b.starts_at < ((p_date + 1) + time '02:00') at time zone 'Europe/Copenhagen'
    and b.ends_at > (p_date + time '10:00') at time zone 'Europe/Copenhagen'), '[]'::jsonb);
end $$;

revoke all on all functions in schema next_games_private from public, anon, authenticated;
revoke all on function public.create_booking_group(text, jsonb), public.get_booking_group(text),
  public.get_booking_availability(date), public.admin_list_booking_groups(),
  public.admin_save_booking_group(text, jsonb, text, text), public.admin_set_booking_status(text, text)
  from public, anon, authenticated;
grant execute on function public.create_booking_group(text, jsonb), public.get_booking_group(text),
  public.get_booking_availability(date) to anon, authenticated;
-- LOCAL DEVELOPMENT ONLY: anonymous Admin grants MUST be removed BEFORE deployment.
-- Replace with staff authorization; authentication alone is insufficient.
grant execute on function public.admin_list_booking_groups(), public.admin_save_booking_group(text, jsonb, text, text),
  public.admin_set_booking_status(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
