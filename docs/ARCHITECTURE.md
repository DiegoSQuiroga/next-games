# Next Games architecture

## Current state

The frontend selects SupabaseBookingRepository as its booking source of truth. The product owner reports the booking persistence and Broadcast migrations are applied to hosted Supabase. The product owner also confirms the Admin Auth migration is applied and the first authorized Reception login works. There is no fallback to localStorage booking data.

## Application boundaries

React pages -> async BookingRepository -> SupabaseBookingRepository -> Supabase RPCs.

- src/services/bookingRepository.ts: Promise-based interface and production singleton.
- src/services/SupabaseBookingRepository.ts: reads, creation preflight and controlled RPC mutations.
- src/services/bookingMapping.ts: row mapping, venue dates, payload validation and useful errors.
- src/hooks/useBookingData.ts: loading/errors, fresh reads after shared Realtime notifications, stale-response protection, and a 60-second recovery/expiration read.
- src/services/MockBookingRepository.ts: tests/reference only, never selected by the application.
- src/domain: reusable one-hour, overlap, payment, limit and group rules. Mock creation helpers remain for tests; live writes are authoritative in SQL.
- src/services/gamesService.ts: active catalog reads for home cards. GameImage retains src/assets images.
- src/lib/supabase.ts: one publishable client using only VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Supabase Auth session persistence and token refresh are enabled for Reception; URL session detection remains disabled. Customers need no account.

React contains no Supabase booking queries. Lazy client imports let missing environment configuration reach page error states. Existing routes, visual design and local images remain.

## Existing schema and migration

supabase/migrations/202609100001_booking_persistence.sql extends public.games, public.resources, public.booking_groups and public.bookings. It never recreates or drops these tables.

booking_groups stores reference, customer name, group status, total DKK, payment deadline and creation timestamp. bookings stores one row per session with group/resource foreign keys, starts_at/ends_at timestamptz, price DKK and creation timestamp. Games/resources supply authoritative active inventory and prices. UUID or integer booking IDs work through PostgreSQL %rowtype and opaque string IDs at the RPC boundary. Enum or text statuses use the existing lowercase values.

Preflight checks required tables/columns, timestamptz types, ID defaults, required status values and existing active overlaps. The migration adds missing foreign keys, a one-hour check, indexes, unique references, random reference generation and functions. Incompatible existing data fails the transaction for review; it is never silently deleted or rewritten to force installation. Existing anonymous catalog SELECT policies are retained; authenticated users can also read active games/resources without write privileges. The full hosted DDL has not been privileged-inspected; compatibility is checked by preflight and existing constraints when the migration is eventually run.

## Customer creation and concurrency

The repository validates one/two session choices, fetches active booking intervals and inventory, and preflights with the domain overlap rule. create_booking_group accepts only the name and game/date/start-time choices. Browser prices, assignments, totals, timestamps and status are not authoritative.

Every create/edit/confirm/cancel/expiry RPC takes the SAME transaction-scoped advisory lock before reading booking state. This serializes changes for the eight-resource venue. Functions are VOLATILE and require READ COMMITTED so reads after waiting see the preceding transaction's committed changes. SQL expires overdue groups, checks the normalized-name limit, derives prices from active games and assigns resources free for the entire session. Newly allocated sessions in the same group block their resources too.

Group and session rows commit atomically. Errors roll back the whole operation. References use NG- plus 12 random uppercase base-32 characters (60 bits), excluding 0, 1, I and O. PostgreSQL random UUID bytes supply randomness; the unique index is authoritative, with up to 10 collision attempts before rolling back. No public reference sequence is created. Overlap is existingStart < newEnd AND newStart < existingEnd. Adjacent intervals do not conflict. Only pending_payment and confirmed groups block resources.

Direct browser DML is revoked, including column-level grants, so callers cannot bypass the lock through table writes. Privileged manual SQL or future backend writers must use the same locking protocol; advisory locks do not guard arbitrary privileged writes. There is no exclusion constraint or claim otherwise. The global lock is deliberately simple, not a high-throughput strategy.

The domain overlap algorithm accepts real inventory as an argument. Home availability and customer slots use real database resource IDs. Local games.ts remains for fixed routes, presentation metadata and mock/test defaults, not live assignment. Failed inventory reads are shown as unavailable, not as an empty/free venue.

## Time, payment and limits

Customer slots run every 30 minutes from 10:00 through 23:30, then 00:00, 00:30 and 01:00. Every session is one hour. Admin starts can use any minute from 10:00 to 01:00. No 01:30 session is accepted. SQL interprets operating dates in Europe/Copenhagen; after-midnight starts belong to the next calendar date. Mapping converts stored timestamps back to that operating night.

Creation more than 45 minutes before a session gives start minus 45 minutes; exactly 45 minutes or less gives creation plus 10 minutes. The group stores the earliest applicable deadline without rounding. Edits preserve original creation time and recompute deadlines. Trimmed, case-insensitive names may have at most two active reservation rows, including sessions requested in the current transaction. This V1 name rule is not secure identity enforcement.

Reads and mutations cancel overdue pending groups together under the lock. Confirmed groups do not expire. No scheduled backend expiration job exists yet; with no traffic a stored pending status may remain until the next RPC, but cannot block the next booking after expiration. Expired/cancelled groups cannot be confirmed directly: editing must revalidate resources first.

## Reads and Admin security limitation

get_booking_availability(date) returns resource intervals/status/game metadata without customer names or references. get_booking_group(reference) feeds the customer status page; its response and customer creation responses omit physical resource IDs/names at the server boundary. Admin uses admin_list_booking_groups, admin_save_booking_group and admin_set_booking_status. Editing excludes the old group's sessions and replaces them transactionally, preserving group ID/reference and rolling back on conflict. Session row IDs are regenerated on edit. Schedule labels show actual minute-level start/end times.

The new 202609110002_admin_auth.sql migration removes the old anonymous Admin grants and checks staff membership inside every Admin RPC. The product owner confirms this migration is applied. The frontend guard provides UX; database checks enforce authorization. Random customer references remain bearer lookup tokens, not staff credentials. Never reapply the old booking persistence migration after Admin Auth: it contains the historical development grants.

SECURITY DEFINER functions use an empty search_path, schema-qualified relations, private helpers inaccessible to browser roles and explicit EXECUTE grants. Anonymous customers have no unrestricted INSERT/UPDATE/DELETE on any of the four tables. See [Supabase function guidance](https://supabase.com/docs/guides/database/functions) and [PostgreSQL locking reference](https://www.postgresql.org/docs/current/explicit-locking.html).

## Browser storage

Application booking localStorage is used only by recentBookings.ts for up to five recent references. The Supabase SDK separately persists Reception Auth session tokens; application code never stores passwords or duplicates Auth tokens. Storage failure cannot turn successful server creation into an apparent failure. Old next-games-bookings data is ignored, not automatically imported or deleted. The mock can still use its former key when explicitly instantiated for tests/reference. SessionStorage holds unfinished selections only; bookingDraft.ts validates these before review.

## Validation and remaining work

Normal npm test needs no Supabase: it tests domain behavior, mapping, payloads, errors, repository calls, recent references and corrupt drafts. Optional supabase/tests/booking_persistence.mjs applies the migration to an isolated PGlite fixture and tests RPCs, grants and reapplication with existing rows, using UUID/enum and integer/text variants. PGlite is single-connection: this is not a multi-connection concurrency test or a certification of hosted schema compatibility.

After manual approval/application, test the development Supabase project end-to-end, including two independent clients racing for one resource. Scheduled expiration, rate limiting, idempotent network retries and deployment remain. Initial Admin Auth setup and staff login have been verified by the product owner. No hosted migration, commit or push is included in the repair phase.

## Realtime synchronization

Supabase Realtime Broadcast delivers generic change notifications over a WebSocket. src/services/bookingRealtime.ts shares one public channel per browser tab: topic next-games-bookings, event booking_changed. There are no direct Postgres Changes subscriptions. Only INSERT, UPDATE and DELETE changes on public.booking_groups and public.bookings produce database notifications. It batches event bursts into one notification per 150 ms. Notification payloads are never used as booking state.

useBookingGroup re-reads the current reference through getGroupByReference; useBookingGroups re-reads Admin data; useBookingAvailability re-reads the currently selected operating date. These hooks cover customer status, Home, game selection, booking review, Admin and its schedule. The Admin details sheet derives its data from the latest group list, while an open edit form keeps the user's unfinished input.

All consumers share the subscription. The last cleanup removes the channel, cancels pending notification timers and invalidates callbacks from old channels. Cleanup before a lazy client import completes is safe under React Strict Mode. Hooks ignore stale results after navigation/unmount, queue one follow-up read for changes during a read, and retain the current route's data during background refreshes.

A successful subscription/reconnection triggers a fresh read to cover connection gaps. Returning to a visible tab or coming online also refreshes data. A 60-second recovery read covers missed events and calls the existing RPC expiration logic: time passing alone does not emit a database event. This replaces the previous five-second status polling; no one-second network polling is added. Subscription failures produce concise development-only diagnostics and do not replace normal RPC reads with customer-facing Realtime errors.

### Supabase setup: notification-only Broadcast

After the booking persistence migration is installed, manually run the ENTIRE supabase/migrations/202609110001_booking_realtime_broadcast.sql file in Supabase SQL Editor as postgres, including BEGIN and COMMIT. The product owner reports this Broadcast migration is already applied.

It creates next_games_private.broadcast_booking_change() and two AFTER INSERT OR UPDATE OR DELETE row triggers: next_games_booking_groups_broadcast and next_games_bookings_broadcast. They call realtime.send('{}'::jsonb, 'booking_changed', 'next-games-bookings', false). The public topic contains no row values, customer names, references, IDs, resource assignments, dates or statuses. Row triggers avoid emitting notifications for empty expiration UPDATEs. Notifications participate in the transaction; rolled-back writes produce no committed messages. Notification errors are caught so booking writes still succeed; recovery reads cover missed events.

Keep Supabase Realtime enabled and allow public channels (disable the private-only channel restriction if it is enabled). No booking-table publication toggle, direct SELECT grant, RLS change, or authentication is required for this Broadcast transport. Existing booking permissions and RPCs remain authoritative. Public clients can also send generic notifications, so these are untrusted invalidation hints and never commands or booking data. Event batching and single-flight reads limit duplicate refresh work. Admin RPCs require staff authorization after the new Auth migration is manually applied.

Same-topic teardown finishes before a new channel is created, including quick navigation and React Strict Mode. See [Supabase Broadcast from the database](https://supabase.com/docs/guides/realtime/broadcast).

### How to test Realtime locally

After manually applying the Broadcast migration and allowing public Realtime channels:

1. Run npm run dev and open a pending /booking/REFERENCE in browser A.
2. Open /admin in browser B (another browser or incognito window).
3. Find the same reference and confirm payment. Browser A should show Confirmed within a few seconds without refresh (a result only after 60 seconds is the recovery timer, not proof of Realtime).
4. Keep Admin open in A and create a new customer booking in B. Verify the group appears automatically.
5. Open Pool selection for the same date in A; book an available Pool session in B. Verify availability changes from 2 to 1 when appropriate.
6. Move or cancel that booking in Admin. Verify the customer session/status and availability refresh. To inspect all views simultaneously, use an additional tab.
7. Navigate away/back repeatedly and check that there is only one booking channel per tab. Disconnect/reconnect the network and verify reads recover without a page reload.

supabase/tests/booking_realtime.mjs validates SQL triggers against an isolated PostgreSQL fixture with a test double for realtime.send (not live delivery). Unit tests use an injected fake client: no live Supabase is needed. They cover shared channels, batching, cleanup, Strict Mode import races, stale events, reconnection and failure handling. Live two-browser delivery still requires manual verification against configured Supabase.

## Reception authentication and authorization

/admin/login uses email/password signInWithPassword on the existing publishable Supabase client. There is no signup or password-reset UI. src/services/authService.ts owns a shared Auth listener and checks the no-argument is_current_user_staff() RPC. src/hooks/useAuth.ts exposes that state through useSyncExternalStore. Session restoration uses getSession; the SDK persists and refreshes its own tokens. Async staff checks are scheduled outside onAuthStateChange to avoid the SDK auth lock. Stale checks after sign-out/navigation are ignored. Same-user token refresh does not discard an open Admin edit form.

ProtectedAdminRoute mounts Admin only after the server reports staff membership. Anonymous users redirect to /admin/login; non-staff see Not authorized; session/check errors fail closed with retry and logout actions. Log out calls supabase.auth.signOut and returns to login. Customer routes have no auth guard and public Broadcast remains unchanged. The SDK manages the Realtime token when the Auth session changes.

202609110002_admin_auth.sql creates public.staff_users with an auth.users UUID foreign key and RLS. Browser roles cannot read or write membership directly. next_games_private.is_staff() uses auth.uid() plus the table, SECURITY DEFINER and an empty search_path; browser roles cannot execute it directly. The public boolean check exposes only the caller's membership. All three Admin RPCs check membership before reads/writes, reject non-staff with SQLSTATE 42501, and allow execution only to authenticated. Customer RPCs and their grants are untouched. Membership is never inferred from email, user metadata, browser storage or a client-provided UUID.

### Manual first-user setup

1. In Supabase SQL Editor, run the entire supabase/migrations/202609110002_admin_auth.sql file as postgres. The two earlier migrations are already applied; do not rerun them.
2. In Authentication > Providers, ensure Email/password sign-in is enabled. In Authentication settings, disable public new-user signups for this staff-only account system (customers remain anonymous and do not use Auth signup).
3. In Authentication > Users, choose Add user > Create new user. Enter the Reception email and a strong password. Auto-confirm the email for this manually provisioned account, or complete confirmation before signing in. Do not enter credentials into repository files.
4. Copy the new user's UUID and run the following as postgres, replacing only the placeholder:

~~~sql
insert into public.staff_users (user_id)
values ('USER_UUID_HERE');
~~~

5. Restart npm run dev if necessary. In a signed-out window, visit /admin and verify the login redirect. Check an incorrect password, then sign in with the staff account, refresh, and log out. An Auth account without a staff_users row must be denied.
6. With an anonymous customer window and a signed-in Admin window, confirm/move/cancel a booking and verify status/availability refresh through the existing public Broadcast. A newly created customer booking should appear in Admin. The owner has completed the first staff setup and verified login. Two-browser synchronization checks remain manual; the agent has not performed hosted writes.

To revoke staff privileges, delete that user's staff_users row as a trusted administrator; subsequent Admin RPC calls fail even with an otherwise valid Auth session. Deleting an Auth user cascades its membership. The frontend rechecks membership on Auth state events; server-side authorization is enforced on every call.

Validation: authService and route-guard unit tests cover anonymous redirect, invalid credentials, restored sessions, staff/non-staff access, auth callback cleanup, logout races, token refresh and failed checks. supabase/tests/admin_auth.mjs applies all migrations to local PostgreSQL fixtures with UUID/enum and bigint/text variants, checking denied/allowed RPCs, membership revocation, anonymous customer reads/writes and empty Broadcast notifications. The auth.uid() and realtime.send() implementations there are test doubles; they do not certify hosted Auth or WebSocket delivery.
