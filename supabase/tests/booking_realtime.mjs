// Isolated PostgreSQL trigger tests. realtime.send is a local test double;
// this does not connect to Supabase or validate live WebSocket delivery.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite')
const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema next_games_private;
    revoke all on schema next_games_private from public, anon, authenticated;
    create table public.booking_groups(id integer primary key, customer_name text);
    create table public.bookings(id integer primary key, resource_id integer);
    alter table public.booking_groups enable row level security;
    alter table public.bookings enable row level security;
    create schema realtime;
    create table realtime.test_messages(payload jsonb, event text, topic text, private boolean);
    create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$
      insert into realtime.test_messages values ($1,$2,$3,$4);
    $$;
  `)
  const migration = await readFile(new URL('../migrations/202609110001_booking_realtime_broadcast.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // Repeat installation without duplicate triggers.
  await db.exec(`
    insert into public.booking_groups values (1,'Private customer');
    update public.booking_groups set customer_name='Another private name' where id=1;
    delete from public.booking_groups where id=1;
    insert into public.bookings values (1,99);
    update public.bookings set resource_id=100 where id=1;
    delete from public.bookings where id=1;
    update public.booking_groups set customer_name='No matching rows';
    update public.bookings set resource_id=101;
  `)
  await db.exec(`
    begin;
    insert into public.bookings values (2,102);
    rollback;
  `)
  const { rows } = await db.query('select * from realtime.test_messages')
  assert.equal(rows.length, 6)
  for (const message of rows) assert.deepEqual(message, {
    payload: {}, event: 'booking_changed', topic: 'next-games-bookings', private: false,
  })
  const tables = (await db.query("select relrowsecurity from pg_class where oid in ('public.bookings'::regclass,'public.booking_groups'::regclass)")).rows
  assert.ok(tables.every(t => t.relrowsecurity))
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    await assert.rejects(db.query('select * from public.booking_groups'), /permission denied/)
    await assert.rejects(db.query('select * from public.bookings'), /permission denied/)
    await assert.rejects(db.query('insert into public.bookings values (3,103)'), /permission denied/)
    await assert.rejects(db.query('select next_games_private.broadcast_booking_change()'), /permission denied/)
    await db.exec('reset role')
  }
  // A failed notification must not abort the booking transaction.
  await db.exec(`
    create or replace function realtime.send(jsonb,text,text,boolean) returns void language plpgsql as $$
    begin raise exception 'Simulated notification outage'; end $$;
    insert into public.bookings values (4,104);
  `)
  assert.equal((await db.query('select resource_id from public.bookings where id=4')).rows[0].resource_id, 104)
  console.log('Broadcast SQL checks passed: six change events, empty payloads, no zero-row/rollback events, repeat installation, preserved security, notification outage isolation. Local test double only.')
} finally { await db.close() }
