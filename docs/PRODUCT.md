# Next Games

Next Games is a web booking system for games at Next House Copenhagen.

Customers can book game sessions online, but payment is not made through the website. Payment is made physically at reception/bar.

Staff will later have an admin dashboard where they can manage bookings and confirm payments.

## Product scope

This product covers online booking of game sessions, assignment of physical resources, payment deadlines, booking lifecycle management, and a future staff/admin experience for reception operations.

This document is the source of truth for business rules and product behavior. No additional business rules should be introduced without updating this document first.

## Games and inventory

### Pool
- 2 pool tables
- 60 DKK per 1-hour session

### Darts
- 3 dart stations
- 60 DKK per 1-hour session

### Ping Pong
- 1 table
- 60 DKK per 1-hour session

### Shuffleboard
- 2 shuffleboards
- 75 DKK per 1-hour session

Customers choose only the game type. They do not choose the specific physical table, dart station, or shuffleboard.

The system must automatically assign an available physical resource.

## Opening hours

Bookings are available from 10:00 AM until 2:00 AM.

All sessions last exactly 1 hour.

The system must correctly handle operating hours that continue past midnight.

## Customer data

Ask for the minimum possible amount of personal information.

For Version 1, the customer provides only:
- Name

Do not require:
- email
- phone number
- room number

The system must also work for people who are not staying at the hostel.

## Booking reference

Every booking group should receive a short human-readable booking reference, for example:

NG-4821

This reference can be used by reception to quickly find the customer's booking.

## Maximum bookings

A customer may have a maximum of 2 active reservations at the same time.

Active means:
- pending payment
- confirmed

Cancelled, completed and no-show bookings do not count toward this limit.

Consecutive reservations are allowed.

Examples:

18:00–19:00 Pool
19:00–20:00 Pool

or

18:00–19:00 Pool
19:00–20:00 Darts

are valid if availability exists.

## Booking groups

If a customer creates two reservations in the same booking flow, they belong to the same booking group.

Example:

Booking group NG-4821

18:00 Pool — 60 DKK
19:00 Darts — 60 DKK

Total: 120 DKK

Bookings in the same group must be paid together.

When reception confirms payment for the booking group, all reservations inside that group become confirmed.

## Booking states

Use clear booking states.

Required states:
- PENDING_PAYMENT
- CONFIRMED
- CANCELLED
- COMPLETED
- NO_SHOW

A new reservation starts as PENDING_PAYMENT.

## Payment rules

Payment happens physically at reception/bar.

If the reservation is created more than 45 minutes before the session starts:

payment deadline = session start time minus 45 minutes

Example:

Session: 20:00
Payment deadline: 19:15

If the reservation is created exactly 45 minutes before, or within 45 minutes of the session start:

the customer gets 10 minutes from the moment the booking is created to pay.

Example:

Booking created: 19:35
Session: 20:00
Payment deadline: 19:45

If payment is not confirmed before the payment deadline:
- the reservation becomes CANCELLED
- the physical resource becomes available again

For booking groups containing two reservations, payment confirmation applies to the entire group.

For a booking group with multiple sessions, the system uses the earliest payment deadline among all reservations in the group. The entire group must be paid together. If that deadline expires, all unpaid reservations in the booking group are cancelled together.

## Availability

Availability is based on physical inventory.

Example:

Pool has 2 physical tables.

If one table is booked for 18:00:
the customer should see that Pool still has 1 available slot.

If both tables are unavailable:
the 18:00 Pool slot should show as full/unavailable.

The customer should never need to select the physical resource manually.

## Customer booking flow

The intended customer flow is:

1. Choose game
2. Choose date
3. View available time slots
4. Choose one or two reservations
5. Enter name
6. Review booking
7. Confirm booking
8. Receive booking reference and payment instructions
9. Booking remains pending until reception confirms payment

## Admin goals

A future staff/admin interface must allow reception to:

- view today's bookings
- search by customer name
- search by booking reference
- see pending bookings
- see confirmed bookings
- see payment deadlines
- confirm payment
- cancel bookings
- modify bookings
- move bookings when availability permits
- see expired/cancelled bookings
- manage all reservations inside a booking group together

The admin interface should prioritize speed and clarity because it will be used during reception operations.

## Product principles

- Minimize customer friction.
- Ask for as little personal data as possible.
- Do not require account creation for customers.
- Avoid unnecessary steps.
- Make availability immediately understandable.
- Make payment deadlines extremely clear.
- Keep staff actions fast.
- Prevent double booking.
- Keep business logic separate from UI components.
- Do not invent new business rules without updating this document first.

## Open product decisions

The following items remain open product decisions and should be clarified before implementation:

- Exact method used to identify whether two bookings belong to the same customer when only a name is collected.
- Whether customers should be able to cancel their own pending reservation.
- Whether reception can override expired bookings.
- Whether bookings can be made multiple days in advance and, if so, how far ahead.

## Review checklist for future implementation

Before building features, product and engineering should confirm the following:

- The system treats bookings as separate reservations but groups them under one booking reference when created in the same booking flow.
- Availability checking is based on physical inventory, not only on game type counts.
- Payment deadlines are calculated consistently for both single and grouped reservations.
- Reservation states are updated correctly as bookings are created, paid, cancelled, completed, or expired.
- The admin dashboard can operate on groups as a single unit while still allowing inspection of individual reservations.

## Booking time intervals and operating nights

Customer start slots are generated every 30 minutes: 10:00, 10:30, through 23:30, then 00:00, 00:30 and 01:00. Session duration remains exactly 1 hour; there is no 01:30 customer slot. Reception can create or edit sessions starting at any minute using native time inputs, provided the entire hour falls within 10:00?02:00.

The selected date identifies the operating night. Midnight starts belong to the following calendar date. The schedule uses that operating date and includes arbitrary-minute starts with their real start/end labels. Payment deadlines use the exact session datetime without rounding.

Availability uses time-range overlap: existingStart < newEnd and newStart < existingEnd. Adjacent sessions do not conflict. A resource must be free for the entire requested interval. Only pending-payment and confirmed reservations occupy resources; inventory remains Pool 2, Darts 3, Ping Pong 1 and Shuffleboard 2.

Slot generation, operating-date conversion and overlap detection live in src/domain/session-time.ts. Resource availability lives in booking-rules.ts; booking-engine.ts handles creation and admin editing. Group creation checks each new reservation against earlier assignments in the same group. Admin editing excludes the original group, validates all replacement sessions, preserves group/reference/reservation identities, and only saves after validation succeeds.

Existing localStorage records retain their schema. Availability reconstructs their one-hour windows from operating date and start time, so older after-midnight datetime fields cannot bypass overlap checks. New and edited records store corrected session datetimes.
