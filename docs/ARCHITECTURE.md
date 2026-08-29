# Next Games architecture

This project is built as a simple React + TypeScript application with a clear split between business rules and UI.

The goal is to keep the booking logic easy to understand, easy to test, and easy to replace later with a real backend such as Supabase.

## Folder structure

### src/app
Contains top-level app setup such as routing.

### src/components
Contains reusable presentation components used across pages.

### src/pages
Contains screens such as the home page, booking page, review page and booking status page.

### src/domain
Contains business logic that should not depend on React.

This includes:
- game definitions
- booking status rules
- availability rules
- payment deadlines
- customer booking limits
- group logic

### src/services
Contains repository integrations. For this stage the repository is a mock in-memory/localStorage implementation.

### src/data
This is reserved for seed/mock data and static application data.

### src/hooks
This would be used later for app-specific hooks such as booking state or countdown logic.

### src/utils
Utility functions that do not belong to a domain object.

### src/styles
The app uses regular CSS in the app shell and page styles for simplicity.

## How booking creation works

A booking starts from the customer flow:

1. Customer selects a game
2. Customer selects a date
3. Customer chooses one or two slots
4. Customer enters name
5. Booking review is shown
6. The app creates a BookingGroup
7. Each reservation is assigned to the group
8. The system calculates total price and payment deadline
9. The group is saved in the repository

The app does not perform business logic directly in JSX. Instead it calls functions in the domain layer and then stores the result in the booking repository.

## How availability is calculated

Availability is calculated from the physical resources defined per game.

Each game has a list of physical resources:
- Pool: 2 tables
- Darts: 3 stations
- Ping Pong: 1 table
- Shuffleboard: 2 boards

The domain layer checks all active reservations for a chosen date and time.

Only these statuses count as occupying inventory:
- PENDING_PAYMENT
- CONFIRMED

Cancelled, completed and no-show bookings do not block a resource.

The booking engine computes how many resources are in use and how many remain available.

## How physical resources are assigned

The system never asks the customer to choose a physical resource.

The booking engine picks the first available resource for the selected game and time.

This makes the logic deterministic and easy to explain.

If a resource is already occupied, the next available one is used.

## How payment deadlines work

The deadline logic lives in the domain layer.

If a booking is created more than 45 minutes before the session starts:
- deadline = session start - 45 minutes

If it is created within 45 minutes of the session start:
- deadline = created time + 10 minutes

For a group with multiple reservations, the payment deadline uses the earliest deadline among the reservations in the group.

This keeps the group paid together and prevents inconsistent payment windows.

## Why BookingGroup exists

A booking flow can include one or two reservations, and those belong to one booking group.

A booking group stores:
- customer name
- booking reference
- reservations
- total price
- created time
- payment deadline
- payment state

This allows the app to treat a multi-booking flow as one customer action while still managing each reservation individually.

## How expiration works

In this front-end MVP, expiration is simulated in the mock repository so it can be demonstrated locally.

When a pending reservation reaches its payment deadline, it is cancelled and the resource is released again.

This is designed to be demo-friendly, but in production it must be enforced server-side or database-side because the browser cannot be trusted for final business enforcement.

## How localStorage is accessed

The repository layer reads and writes to localStorage using a simple abstraction.

The UI and domain logic never access localStorage directly.

This keeps the app easier to replace later with a Supabase repository without rewriting the front-end screens.

## How this can later connect to Supabase

The same repository interface can be replaced with a Supabase-backed implementation.

The UI will not care whether the data comes from:
- localStorage
- a mock repository
- Supabase

The domain rules stay unchanged because they are separated from the data layer.

That is the main architectural idea behind this project: keep the booking rules independent from storage and rendering.
