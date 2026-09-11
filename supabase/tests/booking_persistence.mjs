// Optional isolated PostgreSQL/WASM integration checks. No network and no hosted database access.
// Install @electric-sql/pglite in a temporary directory, then set PGLITE_MODULE to its dist/index.js.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite')
const db = new PGlite()
const numericIds = process.env.TEST_ID_TYPE === 'bigint'
const statusType = process.env.TEST_STATUS_TYPE === 'text' ? 'text' : 'public.booking_status'
const idDefinition = numericIds ? 'bigint generated always as identity' : 'uuid default gen_random_uuid()'
try {
  await db.exec(`
    create role anon; create role authenticated;
    create type public.booking_status as enum ('pending_payment','confirmed','cancelled','expired','completed','no_show');
    create table public.games(id bigint generated always as identity primary key, name text not null, price_dkk numeric not null, active boolean default true);
    create table public.resources(id bigint generated always as identity primary key, game_id bigint references public.games, name text not null, active boolean default true);
    create table public.booking_groups(id ${idDefinition} primary key, reference text not null unique, customer_name text not null, status ${statusType} not null, total_price_dkk numeric not null, payment_deadline timestamptz not null, created_at timestamptz not null default now());
    create table public.bookings(id ${idDefinition} primary key, booking_group_id ${numericIds ? 'bigint' : 'uuid'} not null references public.booking_groups, resource_id bigint not null references public.resources, starts_at timestamptz not null, ends_at timestamptz not null, price_dkk numeric not null, created_at timestamptz not null default now());
    insert into public.games(name,price_dkk) values ('Pool',60),('Darts',60),('Ping Pong',60),('Shuffleboard',75);
    insert into public.resources(game_id,name) values (1,'Pool 1'),(1,'Pool 2'),(2,'Darts 1'),(2,'Darts 2'),(2,'Darts 3'),(3,'Ping Pong 1'),(4,'Shuffleboard 1'),(4,'Shuffleboard 2');
    grant all on public.games, public.resources, public.booking_groups, public.bookings to anon, authenticated;
    grant update (price_dkk) on public.games to anon;
    create policy catalog_games_read on public.games for select to anon using (active);
    create policy catalog_resources_read on public.resources for select to anon using (active);
  `)
  await db.exec(await readFile(new URL('../migrations/202609100001_booking_persistence.sql', import.meta.url), 'utf8'))
  const call = async (sql, values = []) => (await db.query(sql, values)).rows[0].result
  const date = '2099-09-10'
  const session = (time, gameType = 'pool') => ({ date, time, gameType })
  const assertCustomer = result => {
    assert.ok(result.bookings.every(b => !('resource_id' in b) && !('resource_name' in b)))
    assert.match(result.reference, /^NG-[2-9A-HJ-NP-Z]{12}$/)
  }
  const create = async (name, sessions) => {
    const result = await call('select public.create_booking_group($1,$2::jsonb) result', [name, JSON.stringify(sessions)])
    assertCustomer(result)
    // Admin keeps the assignments needed by the remaining allocation tests.
    return (await call('select public.admin_list_booking_groups() result')).find(g => g.reference === result.reference)
  }
  const admin = (name, sessions, id = null, status = 'confirmed') => call('select public.admin_save_booking_group($1,$2::jsonb,$3,$4) result', [name, JSON.stringify(sessions), id, status])
  const status = (id, value) => call('select public.admin_set_booking_status($1,$2) result', [id, value])
  const before = (await db.query('select count(*)::int n from public.booking_groups')).rows[0].n
  await assert.rejects(create(' ', [session('18:00')]), /Customer name/)
  await assert.rejects(create('A', []), /one or two/)
  await assert.rejects(create('A', [session('18:17')]), /30-minute/)
  await assert.rejects(create('A', [session('01:30')]), /finish by 02:00/)
  await assert.rejects(create('A', [{ ...session('18:00'), date: '2099-02-30' }]))
  const a = await create(' Alice ', [session('18:00')])
  assert.equal(a.customer_name, 'Alice')
  assert.equal(a.total_price_dkk, 60)
  assert.equal(a.status, 'pending_payment')
  assert.equal(+new Date(a.bookings[0].ends_at) - +new Date(a.bookings[0].starts_at), 3600000)
  assert.equal(+new Date(a.bookings[0].starts_at) - +new Date(a.payment_deadline), 45 * 60000)
  const b = await admin('Bob', [session('18:20')])
  assert.notEqual(a.bookings[0].resource_id, b.bookings[0].resource_id)
  await assert.rejects(create('Third', [session('18:30')]), /just booked/)
  assert.equal((await db.query('select count(*)::int n from public.booking_groups')).rows[0].n, before + 2)
  const adjacent = await create('Next', [session('19:00')])
  assert.equal(adjacent.bookings[0].resource_id, a.bookings[0].resource_id)
  await assert.rejects(create('\t ALICE \n', [session('20:00'), session('21:00')]), /2 active/)
  await status(a.id, 'cancelled')
  await assert.rejects(status(a.id, 'confirmed'), /expired or was cancelled/)
  const c = await create('Released', [session('18:00')])
  assert.equal(c.bookings[0].resource_id, a.bookings[0].resource_id)
  const moved = await admin('Bob', [session('18:17')], b.id)
  assert.equal(moved.id, b.id)
  assert.equal(moved.reference, b.reference)
  const ping = await admin('Ping', [session('23:30', 'ping-pong')])
  await assert.rejects(admin('Night', [session('00:15', 'ping-pong')]), /just booked/)
  const midnight = await admin('Ping', [session('00:45', 'ping-pong')], ping.id)
  assert.equal(new Date(midnight.bookings[0].starts_at).toISOString(), '2099-09-10T22:45:00.000Z')
  const blocked = await admin('Blocked', [session('22:00', 'ping-pong')])
  await assert.rejects(admin('Ping', [session('22:17', 'ping-pong')], ping.id), /just booked/)
  const unchanged = await call('select public.get_booking_group($1) result', [ping.reference])
  assert.equal(unchanged.bookings[0].starts_at, midnight.bookings[0].starts_at)
  assert.ok(blocked.id)
  await assert.rejects(admin('Internal', [session('20:05', 'ping-pong'), session('20:25', 'ping-pong')]), /just booked/)
  const group = await create('Group', [session('10:00'), session('10:30')])
  assert.equal(new Set(group.bookings.map(r => r.resource_id)).size, 2)
  assert.equal(group.total_price_dkk, 120)
  const paid = await status(group.id, 'confirmed')
  assert.equal(paid.status, 'confirmed')
  const quick = await admin('Quick', [session('18:17', 'darts')])
  await db.query('update public.booking_groups set created_at=$1 where id=$2', ['2099-09-10T16:03:00Z', quick.id])
  const quickPending = await admin('Quick', [session('18:17', 'darts')], quick.id, 'pending_payment')
  assert.equal(new Date(quickPending.payment_deadline).toISOString(), '2099-09-10T16:13:00.000Z')
  await db.query('update public.booking_groups set created_at=$1 where id=$2', ['2099-09-10T15:32:00Z', quick.id])
  const exact45 = await admin('Quick', [session('18:17', 'darts')], quick.id, 'pending_payment')
  assert.equal(new Date(exact45.payment_deadline).toISOString(), '2099-09-10T15:42:00.000Z')
  await db.query('update public.booking_groups set created_at=$1 where id=$2', ['2099-09-10T15:31:59Z', quick.id])
  const beyond45 = await admin('Quick', [session('18:17', 'darts')], quick.id, 'pending_payment')
  assert.equal(new Date(beyond45.payment_deadline).toISOString(), '2099-09-10T15:32:00.000Z')
  await db.query("update public.booking_groups set payment_deadline=now()-interval '1 second' where id=$1", [c.id])
  const expired = await call('select public.get_booking_group($1) result', [c.reference])
  assert.equal(expired.status, 'cancelled')
  const availability = await call('select public.get_booking_availability($1::date) result', [date])
  assert.ok(availability.every(r => !('customer_name' in r) && !('reference' in r)))
  assert.equal(await call("select public.get_booking_group('NG-9999999') result"), null)
  // Force a reference candidate collision with an existing row and verify retry.
  const generator = await call("select pg_get_functiondef('next_games_private.generate_booking_reference()'::regprocedure) result")
  await db.exec(`create sequence public.test_reference_calls;
    create or replace function next_games_private.generate_booking_reference()
    returns text language sql volatile security definer set search_path = '' as $$
      select case when nextval('public.test_reference_calls') = 1 then '${a.reference}' else 'NG-23456789ABCD' end;
    $$;`)
  const collision = await create('Collision', [session('12:00', 'shuffleboard')])
  assert.equal(collision.reference, 'NG-23456789ABCD')
  assert.equal(Number(await call('select last_value result from public.test_reference_calls')), 2)
  await assert.rejects(create('All collisions', [session('13:00', 'shuffleboard')]), /Unable to generate a unique/)
  await db.exec(generator)
  assert.equal(await call("select to_regclass('next_games_private.booking_reference_seq') result"), null)
  const generated = (await db.query('select next_games_private.generate_booking_reference() reference from generate_series(1,128)')).rows
  assert.equal(new Set(generated.map(r => r.reference)).size, 128)
  assert.ok(generated.every(r => /^NG-[2-9A-HJ-NP-Z]{12}$/.test(r.reference)))
  await db.exec('set role anon')
  await assert.rejects(db.query('select * from public.booking_groups'), /permission denied/)
  await assert.rejects(db.query("update public.booking_groups set status='confirmed'"), /permission denied/)
  await assert.rejects(db.query('delete from public.bookings'), /permission denied/)
  await assert.rejects(db.query("insert into public.games(name,price_dkk) values ('Forged',1)"), /permission denied/)
  await assert.rejects(db.query('update public.games set price_dkk=1'), /permission denied/)
  await assert.rejects(db.query('delete from public.resources'), /permission denied/)
  assert.equal((await db.query('select * from public.games')).rows.length, 4)
  await assert.rejects(db.query("select next_games_private.write_group('Bypass','[]',true)"), /permission denied/)
  const anon = await create('Anonymous', [session('14:00')])
  assert.equal(anon.status, 'pending_payment')
  assertCustomer(await call('select public.get_booking_group($1) result', [anon.reference.toLowerCase()]))
  await db.exec('set role authenticated')
  assert.equal((await db.query('select * from public.games')).rows.length, 4)
  assert.equal((await db.query('select * from public.resources')).rows.length, 8)
  await assert.rejects(db.query('update public.games set price_dkk=1'), /permission denied/)
  await assert.rejects(db.query('delete from public.resources'), /permission denied/)
  await assert.rejects(db.query('select * from public.booking_groups'), /permission denied/)
  await db.exec('reset role')
  const savedRows = (await db.query('select count(*)::int n from public.bookings')).rows[0].n
  await db.exec(await readFile(new URL('../migrations/202609100001_booking_persistence.sql', import.meta.url), 'utf8'))
  assert.equal((await db.query('select count(*)::int n from public.bookings')).rows[0].n, savedRows)
  console.log(`SQL migration/RPC checks passed (${numericIds ? 'bigint' : 'uuid'} IDs, ${statusType}, exactly-45-minute deadline, random reference collision retries, customer redaction, authenticated catalog reads, reapplication preserved rows; isolated PGlite only).`)
} catch (error) {
  console.error(error.message, error.code ?? '', error.where ?? '')
  process.exitCode = 1
} finally { await db.close() }
