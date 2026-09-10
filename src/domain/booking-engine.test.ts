import { describe, expect, it } from 'vitest'
import { buildSessionWindow, getOperatingDate, OPERATING_SLOT_TIMES, timeRangesOverlap } from './session-time'
import { createBookingGroup, getAvailabilityAtTime, getAvailabilityForGame, saveAdminBooking } from './booking-engine'
import { calculatePaymentDeadline } from './booking-rules'
import type { BookingGroup, GameType } from './types'

const date = '2026-09-10'
const input = (time: string, gameType: GameType = 'pool') => ({ date, time, gameType })
const admin = (time: string, groups: BookingGroup[] = [], name = 'Sebita', gameType: GameType = 'pool') => saveAdminBooking({
  customerName: name, reservationInputs: [input(time, gameType)], groups, status: 'CONFIRMED',
})

describe('customer slots and operating nights', () => {
  it('generates 31 half-hour starts ending at 01:00', () => {
    expect(OPERATING_SLOT_TIMES).toHaveLength(31)
    expect(OPERATING_SLOT_TIMES.slice(0, 3)).toEqual(['10:00', '10:30', '11:00'])
    expect(OPERATING_SLOT_TIMES.slice(-4)).toEqual(['23:30', '00:00', '00:30', '01:00'])
    expect(OPERATING_SLOT_TIMES).not.toContain('01:30')
  })
  it('maps midnight to the next calendar date with exactly one hour duration', () => {
    for (const time of ['23:30', '00:00', '00:30', '00:45', '01:00']) {
      const window = buildSessionWindow(date, time)
      expect(new Date(window.sessionStart).getDate()).toBe(time.startsWith('23') ? 10 : 11)
      expect(+new Date(window.sessionEnd) - +new Date(window.sessionStart)).toBe(3600000)
    }
    expect(getOperatingDate(new Date('2026-09-11T00:45:00'))).toBe(date)
  })
  it.each(['01:01', '01:30', '02:00', '09:59', '24:00', '17:60', '17:10:30', ''])('rejects invalid admin start %s', (time) => {
    expect(() => admin(time)).toThrow()
  })
  it('rejects invalid dates and arbitrary customer minutes', () => {
    expect(() => buildSessionWindow('2026-02-30', '18:00')).toThrow()
    expect(() => createBookingGroup({ customerName: 'A', reservationInputs: [input('18:17')], existingGroups: [], allReservations: [] })).toThrow(/30-minute/)
  })
})

describe('range overlap and physical inventory', () => {
  it('conflicts on half-hour and arbitrary minutes but allows adjacent sessions', () => {
    const existing = buildSessionWindow(date, '10:00')
    expect(timeRangesOverlap(existing, buildSessionWindow(date, '10:30'))).toBe(true)
    expect(timeRangesOverlap(existing, buildSessionWindow(date, '10:17'))).toBe(true)
    expect(timeRangesOverlap(existing, buildSessionWindow(date, '11:00'))).toBe(false)
  })
  it('counts distinct occupied resources across the entire requested interval', () => {
    const first = admin('18:00')
    expect(getAvailabilityForGame('pool', date, first.reservations).find((s) => s.time === '18:30')?.available).toBe(1)
    const second = admin('18:20', [first], 'Other')
    expect(second.reservations[0].resourceId).not.toBe(first.reservations[0].resourceId)
    expect(getAvailabilityAtTime('pool', date, '18:30', [...first.reservations, ...second.reservations]).isFull).toBe(true)
    expect(() => admin('18:30', [first, second], 'Third')).toThrow(/full/)
    const adjacent = admin('19:00', [first], 'Next')
    expect(adjacent.reservations[0].resourceId).toBe(first.reservations[0].resourceId)
    expect(getAvailabilityAtTime('pool', date, '18:30', [...first.reservations, ...adjacent.reservations]).available).toBe(1)
  })
  it.each([['pool', 2], ['darts', 3], ['ping-pong', 1], ['shuffleboard', 2]] as const)('preserves %s capacity', (game, capacity) => {
    expect(getAvailabilityAtTime(game, date, '18:30', []).available).toBe(capacity)
  })
  it('ignores cancelled reservations and other operating dates', () => {
    const first = admin('18:00')
    expect(getAvailabilityAtTime('pool', date, '18:30', first.reservations.map((r) => ({ ...r, status: 'CANCELLED' }))).available).toBe(2)
    expect(getAvailabilityAtTime('pool', '2026-09-11', '18:30', first.reservations).available).toBe(2)
  })
  it('detects overlap across midnight, including legacy stored datetimes', () => {
    const first = admin('23:30', [], 'A', 'ping-pong')
    expect(() => admin('00:15', [first], 'B', 'ping-pong')).toThrow(/full/)
    const midnight = admin('00:15', [], 'C', 'ping-pong')
    midnight.reservations[0].sessionStart = new Date(date + 'T00:15:00').toISOString()
    expect(getAvailabilityAtTime('ping-pong', date, '23:30', midnight.reservations).isFull).toBe(true)
  })
})

describe('admin creation and editing', () => {
  it.each(['17:10', '17:25', '17:40', '18:05', '23:17', '00:45'])('accepts %s', (time) => {
    expect(admin(time).reservations[0].startTime).toBe(time)
  })
  it('excludes the edited group, preserves identity and reassigns resources', () => {
    const original = admin('18:00', [], 'A', 'ping-pong')
    const edited = saveAdminBooking({ customerName: 'A', reservationInputs: [input('18:17', 'ping-pong')], groups: [original], original, status: 'CONFIRMED' })
    expect(edited.id).toBe(original.id)
    expect(edited.bookingReference).toBe(original.bookingReference)
    expect(edited.reservations[0].id).toBe(original.reservations[0].id)
    expect(edited.reservations[0].bookingGroupId).toBe(original.id)
    expect(edited.reservations[0].startTime).toBe('18:17')
    const blocked = admin('20:00', [original], 'B', 'ping-pong')
    expect(() => saveAdminBooking({ customerName: 'A', reservationInputs: [input('20:17', 'ping-pong')], groups: [original, blocked], original, status: 'CONFIRMED' })).toThrow(/full/)
    expect(original.reservations[0].startTime).toBe('18:00')
  })
  it('assigns grouped overlaps separately and rejects internal overbooking', () => {
    const group = saveAdminBooking({ customerName: 'A', reservationInputs: [input('18:05'), input('18:25')], groups: [], status: 'PENDING_PAYMENT' })
    expect(new Set(group.reservations.map((r) => r.resourceId)).size).toBe(2)
    expect(group.totalPrice).toBe(120)
    expect(() => saveAdminBooking({ customerName: 'A', reservationInputs: [input('18:05', 'ping-pong'), input('18:25', 'ping-pong')], groups: [], status: 'CONFIRMED' })).toThrow(/full/)
  })
  it('enforces the active limit including newly requested reservations', () => {
    const first = admin('12:00')
    expect(() => saveAdminBooking({ customerName: 'Sebita', reservationInputs: [input('18:00'), input('19:00')], groups: [first], status: 'CONFIRMED' })).toThrow(/2 active/)
  })
})

it('calculates payment deadlines using exact minutes', () => {
  expect(calculatePaymentDeadline('2026-09-10T16:00:00Z', '2026-09-10T18:30:00Z')).toBe('2026-09-10T17:45:00.000Z')
  expect(calculatePaymentDeadline('2026-09-10T16:00:00Z', '2026-09-10T18:17:00Z')).toBe('2026-09-10T17:32:00.000Z')
  expect(calculatePaymentDeadline('2026-09-10T18:03:00Z', '2026-09-10T18:17:00Z')).toBe('2026-09-10T18:13:00.000Z')
})

it('creates half-hour customer sessions and rejects full customer intervals', () => {
  const create = (gameType: GameType) => createBookingGroup({ customerName: 'Customer', reservationInputs: [input('10:00', gameType), input('10:30', gameType)], existingGroups: [], allReservations: [] })
  expect(create('pool').reservations.map((r) => r.resourceId)).toEqual(['pool-1', 'pool-2'])
  expect(() => create('ping-pong')).toThrow(/full/)
})

it('edits across midnight and recalculates the exact group deadline', () => {
  const original = admin('18:00')
  original.createdAt = new Date(date + 'T12:00:00').toISOString()
  const moved = saveAdminBooking({ customerName: 'Sebita', reservationInputs: [input('00:45')], groups: [original], original, status: 'PENDING_PAYMENT' })
  expect(new Date(moved.reservations[0].sessionStart).getDate()).toBe(11)
  expect(moved.paymentDeadline).toBe(new Date('2026-09-11T00:00:00').toISOString())
})
