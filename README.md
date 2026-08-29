# Next Games

Next Games is a dark-themed web booking experience for games at Next House Copenhagen. Customers can reserve pool, darts, ping pong and shuffleboard sessions online, while payment is handled physically at reception or the bar.

## Stack

- React
- TypeScript
- Vite
- React Router
- date-fns
- Vitest

## Install

```bash
npm install
```

## Run locally

```bash
npm run dev
```

## Test

```bash
npm test
```

## Build

```bash
npm run build
```

## Project structure

```text
src/
  app/
  components/
  domain/
  pages/
  services/
  styles/
  App.tsx
  main.tsx
```

## Current limitations

- No real authentication
- No real payment integration
- No Supabase backend yet
- Booking identity is based only on a normalized name in this V1 prototype
- The admin screen is a reception-focused MVP without server-side enforcement

## Next planned step

The next step is to replace the mock repository with a Supabase-backed backend while keeping the same domain and UI architecture.

## Product reference

The product rules live in [docs/PRODUCT.md](docs/PRODUCT.md), and the architecture notes live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
