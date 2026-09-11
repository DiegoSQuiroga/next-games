import { describe, expect, it } from 'vitest'
import {
  calculatePaymentDeadline,
  canCustomerCreateReservation,
  confirmGroupPayment,
  createBookingReference,
  findFirstAvailableResource,
  getEarliestPaymentDeadline,
  isExactFortyFiveMinutesBefore,
  isLessThanFortyFiveMinutesBefore,
  isReservationExpired,
  normalizeCustomerName,
} from './booking-rules'
import type { BookingGroup, Reservation } from './types'

const sampleReservations: Reservation[] = [
  {
    id: 'r-1',
    bookingGroupId: 'g-1',
    gameType: 'pool',
    resourceId: 'pool-1',
    date: '2026-08-29',
    startTime: '18:00',
    status: 'PENDING_PAYMENT',
    customerName: 'Lucas',
    price: 60,
    createdAt: '2026-08-29T17:00:00.000Z',
    paymentDeadline: '2026-08-29T19:15:00.000Z',
    sessionStart: '2026-08-29T18:00:00.000Z',
    sessionEnd: '2026-08-29T19:00:00.000Z',
  },
  {
    id: 'r-2',
    bookingGroupId: 'g-2',
    gameType: 'pool',
    resourceId: 'pool-2',
    date: '2026-08-29',
    startTime: '19:00',
    status: 'CONFIRMED',
    customerName: 'Anna',
    price: 60,
    createdAt: '2026-08-29T18:15:00.000Z',
    paymentDeadline: '2026-08-29T19:30:00.000Z',
    sessionStart: '2026-08-29T19:00:00.000Z',
    sessionEnd: '2026-08-29T20:00:00.000Z',
  },
]

describe('payment deadline logic', () => {
  it('uses session start minus 45 minutes when created more than 45 minutes before', () => {
    const deadline = calculatePaymentDeadline('2026-08-29T17:00:00.000Z', '2026-08-29T20:00:00.000Z')
    expect(deadline).toBe('2026-08-29T19:15:00.000Z')
  })

  it('uses created time plus 10 minutes when created exactly 45 minutes before', () => {
    const deadline = calculatePaymentDeadline('2026-08-29T19:15:00.000Z', '2026-08-29T20:00:00.000Z')
    expect(deadline).toBe('2026-08-29T19:25:00.000Z')
    expect(isExactFortyFiveMinutesBefore('2026-08-29T19:15:00.000Z', '2026-08-29T20:00:00.000Z')).toBe(true)
  })

  it('uses created time plus 10 minutes when within 45 minutes of the start', () => {
    const deadline = calculatePaymentDeadline('2026-08-29T19:35:00.000Z', '2026-08-29T20:00:00.000Z')
    expect(deadline).toBe('2026-08-29T19:45:00.000Z')
    expect(isLessThanFortyFiveMinutesBefore('2026-08-29T19:35:00.000Z', '2026-08-29T20:00:00.000Z')).toBe(true)
  })
})

describe('availability and resource assignment', () => {
  it('returns the first free resource for the selected slot', () => {
    const selected = findFirstAvailableResource('pool', sampleReservations, '2026-08-29', '18:00')
    expect(selected).toBe('pool-2')
  })

  it('does not double-book the same physical resource in the same slot', () => {
    const selected = findFirstAvailableResource('pool', [
      ...sampleReservations,
      {
        ...sampleReservations[0],
        id: 'r-3',
        resourceId: 'pool-1',
        date: '2026-08-29',
        startTime: '18:00',
        status: 'PENDING_PAYMENT',
      },
    ], '2026-08-29', '18:00')
    expect(selected).toBe('pool-2')
  })
})

describe('customer booking limits', () => {
  it('allows zero or one active booking', () => {
    expect(canCustomerCreateReservation('Lucas', [])).toBe(true)
    expect(canCustomerCreateReservation('Lucas', [sampleReservations[0]])).toBe(true)
  })

  it('blocks a third active booking', () => {
    const reservations: Reservation[] = [
      { ...sampleReservations[0], customerName: ' Lucas ', status: 'CONFIRMED' },
      { ...sampleReservations[1], customerName: 'lucas', status: 'PENDING_PAYMENT' },
      { ...sampleReservations[0], id: 'r-5', customerName: 'Lucas', status: 'PENDING_PAYMENT' },
    ]

    expect(canCustomerCreateReservation(' lucas ', reservations)).toBe(false)
  })
})

describe('booking groups and deadlines', () => {
  it('calculates total price and earliest deadline', () => {
    const groupReservations = [
      { ...sampleReservations[0], bookingGroupId: 'g-100', price: 60 },
      { ...sampleReservations[1], bookingGroupId: 'g-100', price: 60 },
    ]

    const total = groupReservations.reduce((sum, reservation) => sum + reservation.price, 0)
    expect(total).toBe(120)
    expect(getEarliestPaymentDeadline(groupReservations)).toBe('2026-08-29T19:15:00.000Z')
  })

  it('confirms all reservations in a group', () => {
    const group: BookingGroup = {
      id: 'g-1',
      bookingReference: 'NG-4821',
      customerName: 'Lucas',
      reservations: [...sampleReservations],
      totalPrice: 120,
      createdAt: '2026-08-29T17:00:00.000Z',
      paymentDeadline: '2026-08-29T19:15:00.000Z',
      paymentState: 'PENDING',
    }

    const confirmed = confirmGroupPayment(group)
    expect(confirmed.reservations.every((reservation) => reservation.status === 'CONFIRMED')).toBe(true)
    expect(confirmed.paymentState).toBe('PAID')
  })
})

describe('other helpers', () => {
  it('normalizes a customer name for V1 comparison', () => {
    expect(normalizeCustomerName(' lucas ')).toBe('lucas')
  })

  it('creates short booking references', () => {
    expect(createBookingReference(0)).toBe('NG-0001')
    expect(createBookingReference(4820)).toBe('NG-4821')
  })

  it('marks expired payment deadlines', () => {
    const expired = isReservationExpired({
      ...sampleReservations[0],
      paymentDeadline: '2021-01-01T00:00:00.000Z',
    })
    expect(expired).toBe(true)
  })
})
