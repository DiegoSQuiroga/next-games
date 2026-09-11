// Local PostgreSQL fixture only. No hosted SQL or actual Auth user is created.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite')
const db = new PGlite()
const numericIds = process.env.TEST_ID_TYPE === 'bigint'
const idDefinition = numericIds ? 'bigint generated always as identity' : 'uuid default gen_random_uuid()'
const idType = numericIds ? 'bigint' : 'uuid'
const statusType = numericIds ? 'text' : 'public.booking_status'
const staff = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const migration = async name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    insert into auth.users values ('${staff}'), ('${other}');
    create type public.booking_status as enum ('pending_payment','confirmed','cancelled','expired','completed','no_show');
    create table public.games(id bigint generated always as identity primary key, name text not null, price_dkk numeric not null, active boolean default true);
    create table public.resources(id bigint generated always as identity primary key, game_id bigint references public.games, name text not null, active boolean default true);
    create table public.booking_groups(id ${idDefinition} primary key, reference text not null unique, customer_name text not null, status ${statusType} not null, total_price_dkk numeric not null, payment_deadline timestamptz not null, created_at timestamptz not null default now());
    create table public.bookings(id ${idDefinition} primary key, booking_group_id ${idType} not null references public.booking_groups, resource_id bigint not null references public.resources, starts_at timestamptz not null, ends_at timestamptz not null, price_dkk numeric not null, created_at timestamptz not null default now());
    insert into public.games(name,price_dkk) values ('Pool',60),('Darts',60),('Ping Pong',60),('Shuffleboard',75);
    insert into public.resources(game_id,name) values (1,'Pool 1'),(1,'Pool 2'),(2,'Darts 1'),(2,'Darts 2'),(2,'Darts 3'),(3,'Ping Pong 1'),(4,'Shuffleboard 1'),(4,'Shuffleboard 2');
    grant select on public.games, public.resources to anon, authenticated;
    create policy games_read on public.games for select to anon using(active);
    create policy resources_read on public.resources for select to anon using(active);
    create schema realtime;
    create table realtime.test_messages(payload jsonb, event text, topic text, private boolean);
    create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$
      insert into realtime.test_messages values ($1,$2,$3,$4);
    $$;
  `)
  await db.exec(await migration('202609100001_booking_persistence.sql'))
  await db.exec(await migration('202609110001_booking_realtime_broadcast.sql'))
  const authSql = await migration('202609110002_admin_auth.sql')
  await db.exec(authSql)
  await db.query('insert into public.staff_users(user_id) values ($1)', [staff])
  await db.exec(authSql) // Repeat install must preserve existing membership.
  const call = async (sql, args = []) => (await db.query(sql, args)).rows[0].result
  const role = async (name, uid = '') => {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid])
    await db.exec(`set role ${name}`)
  }
  const sessions = JSON.stringify([{ gameType: 'pool', date: '2099-09-10', time: '18:00' }])
  const adminCalls = [
    ['select public.admin_list_booking_groups() result', []],
    ['select public.admin_save_booking_group($1,$2::jsonb) result', ['Forbidden', sessions]],
    ['select public.admin_set_booking_status($1,$2) result', ['missing-id', 'confirmed']],
  ]
  for (const [name, uid, pattern] of [
    ['anon', '', /permission denied/],
    ['authenticated', '', /Staff authorization required/],
    ['authenticated', other, /Staff authorization required/],
  ]) {
    await role(name, uid)
    for (const [sql, args] of adminCalls) await assert.rejects(call(sql, args), pattern)
    await assert.rejects(db.query('select * from public.staff_users'), /permission denied/)
    await assert.rejects(db.query('insert into public.staff_users(user_id) values ($1)', [other]), /permission denied/)
    await assert.rejects(db.query('select next_games_private.is_staff()'), /permission denied/)
    if (name === 'authenticated') assert.equal(await call('select public.is_current_user_staff() result'), false)
  }
  await role('anon')
  const customer = await call('select public.create_booking_group($1,$2::jsonb) result', ['Anonymous customer', sessions])
  assert.equal(customer.status, 'pending_payment')
  assert.ok(customer.bookings.every(b => !('resource_id' in b) && !('resource_name' in b)))
  assert.equal((await call('select public.get_booking_group($1) result', [customer.reference])).reference, customer.reference)
  assert.equal((await call("select public.get_booking_availability('2099-09-10') result")).length, 1)

  await role('authenticated', staff)
  assert.equal(await call('select public.is_current_user_staff() result'), true)
  assert.equal((await call('select public.admin_list_booking_groups() result')).length, 1)
  assert.equal((await call('select public.admin_set_booking_status($1,$2) result', [customer.id, 'confirmed'])).status, 'confirmed')
  const moved = JSON.stringify([{ gameType: 'pool', date: '2099-09-10', time: '19:17' }])
  assert.equal((await call('select public.admin_save_booking_group($1,$2::jsonb,$3,$4) result', ['Anonymous customer', moved, customer.id, 'confirmed'])).reference, customer.reference)
  const created = await call('select public.admin_save_booking_group($1,$2::jsonb) result', ['Staff-created booking', sessions])
  assert.equal(created.total_price_dkk, 60)
  assert.equal((await call('select public.admin_set_booking_status($1,$2) result', [created.id, 'cancelled'])).status, 'cancelled')
  await assert.rejects(db.query('select * from public.staff_users'), /permission denied/)
  await assert.rejects(db.query("update public.games set price_dkk=1"), /permission denied/)
  assert.equal((await db.query('select * from public.games')).rows.length, 4)

  await role('anon')
  assert.equal((await call('select public.get_booking_group($1) result', [customer.reference])).status, 'confirmed')
  await db.exec('reset role')
  const messages = (await db.query('select * from realtime.test_messages')).rows
  assert.ok(messages.length >= 8)
  assert.ok(messages.every(m => JSON.stringify(m.payload) === '{}' && m.topic === 'next-games-bookings' && m.event === 'booking_changed' && m.private === false))
  await db.query('delete from public.staff_users where user_id=$1', [staff])
  await role('authenticated', staff)
  assert.equal(await call('select public.is_current_user_staff() result'), false)
  for (const [sql, args] of adminCalls) await assert.rejects(call(sql, args), /Staff authorization required/)
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from public.booking_groups')).rows[0].n, 2)
  console.log(`Admin authorization SQL passed (${idType}/${statusType}): anon/non-staff denied, staff allowed, revoked staff denied, customer RPCs and empty Broadcasts preserved. Isolated PostgreSQL only.`)
} finally { await db.close() }
