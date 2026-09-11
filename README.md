# Next Games

React + Vite + TypeScript booking frontend for Next House Copenhagen. Payment happens at reception/bar. Customer sessions last one hour and start every 30 minutes. Reception can create/edit sessions at arbitrary minutes.

## Local setup

Use Node.js 22 or newer. Run npm install, then npm run dev.

Configure a Git-ignored .env.local from .env.example with your Supabase project URL and publishable key. The only variables are VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Never put a service-role or secret key in the frontend. Restart Vite after environment changes.

## Database and Admin setup

Supabase is the booking source of truth. Booking persistence, notification-only Realtime Broadcast, and Admin Auth migrations have been applied to the existing hosted project; the owner has verified the first staff login. Customer bookings remain anonymous. Reception signs in at /admin/login using Supabase Auth and staff_users membership. Every Admin RPC independently checks staff membership.

The three SQL files in supabase/migrations record the setup in chronological order. Do not rerun the historical booking persistence migration on this configured database: it contains temporary development Admin grants that the later Auth migration removes. For a new project, review the required existing schema and apply all migrations in order. See docs/ARCHITECTURE.md for details and manual staff provisioning.

Realtime Broadcast sends only an empty booking_changed notification; hooks then re-read authoritative RPC data. RLS and direct booking-table restrictions remain intact. No service-role key is used in the frontend. Deployment has not been performed.

## Validation

Run npm run lint, npm test and npm run build. Unit tests do not contact Supabase.

Optional SQL integration tests use PGlite installed outside application dependencies. In PowerShell:

```powershell
npm.cmd install --prefix "$env:TEMP/next-games-sql-validation" @electric-sql/pglite --no-audit --no-fund
$env:PGLITE_MODULE = "$env:TEMP/next-games-sql-validation/node_modules/@electric-sql/pglite/dist/index.js"
node supabase/tests/booking_persistence.mjs
$env:TEST_ID_TYPE = 'bigint'
$env:TEST_STATUS_TYPE = 'text'
node supabase/tests/booking_persistence.mjs
```

These checks use a disposable in-memory fixture and test transactions, conflicts, rollback, deadlines, limits, references, grants and reapplication. They do not perform hosted writes or multi-connection concurrency tests.

## Architecture and storage

Pages call the async BookingRepository; SupabaseBookingRepository calls controlled RPCs. bookingMapping.ts maps database rows. booking_groups stores customer/reference/status/total/deadline; bookings stores assigned sessions. Mutations share a transaction lock and overlap checks. MockBookingRepository is retained for tests/reference only.

Application booking localStorage remembers recent references only; the Supabase SDK separately persists Auth session tokens. Old local booking data is ignored, not imported or deleted. SessionStorage holds unfinished selections. Images and branding stay in src/assets.

See [PRODUCT.md](docs/PRODUCT.md) for rules and [ARCHITECTURE.md](docs/ARCHITECTURE.md) for migration/security details and limitations.
