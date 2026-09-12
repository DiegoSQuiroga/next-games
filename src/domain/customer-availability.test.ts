import { describe, expect, it } from 'vitest'
import { getOperatingDate, isFutureCustomerSlot, OPERATING_SLOT_TIMES } from './session-time'
import { getAvailabilityForGame, getCustomerAvailabilityForGame, saveAdminBooking } from './booking-engine'
import { getGameByType } from './games'

const date = '2026-09-12'
const slots = (day: string, instant: string) => getCustomerAvailabilityForGame('ping-pong', day, [], undefined, new Date(instant))

describe('customer start times in Copenhagen', () => {
  it('hides earlier starts and the exact current start, preserving all later starts', () => {
    const times = slots(date, '2026-09-12T10:00:00Z').map(s => s.time) // Noon CEST.
    expect(times[0]).toBe('12:30')
    expect(times).not.toContain('10:00')
    expect(times).not.toContain('11:00')
    expect(times).not.toContain('12:00')
    expect(times.slice(-3)).toEqual(['00:00', '00:30', '01:00'])
  })
  it('expires a start precisely when its minute begins', () => {
    expect(isFutureCustomerSlot(date, '12:00', new Date('2026-09-12T09:59:59.999Z'))).toBe(true)
    expect(isFutureCustomerSlot(date, '12:00', new Date('2026-09-12T10:00:00Z'))).toBe(false)
    expect(isFutureCustomerSlot(date, '12:00', new Date('2026-09-12T10:00:00.001Z'))).toBe(false)
  })
  it('preserves every operating slot for future dates and before opening', () => {
    expect(slots('2026-09-13', '2026-09-12T10:00:00Z').map(s => s.time)).toEqual(OPERATING_SLOT_TIMES)
    expect(slots(date, '2026-09-12T06:00:00Z').map(s => s.time)).toEqual(OPERATING_SLOT_TIMES)
    expect(slots('2026-09-11', '2026-09-12T10:00:00Z')).toEqual([])
  })
  it.each([
    ['2026-09-12T21:45:00Z', ['00:00', '00:30', '01:00']],
    ['2026-09-12T22:00:00Z', ['00:30', '01:00']],
    ['2026-09-12T22:45:00Z', ['01:00']],
    ['2026-09-12T23:00:00Z', []],
    ['2026-09-13T00:00:00Z', []],
  ])('respects the overnight window at %s', (instant, expected) => {
    expect(slots(date, instant).map(s => s.time)).toEqual(expected)
  })
  it.each([
    ['2026-09-12T22:45:00Z', '2026-09-12'],
    ['2026-09-13T00:00:00Z', '2026-09-13'],
    ['2026-01-12T23:45:00Z', '2026-01-12'],
    ['2026-03-29T00:30:00Z', '2026-03-28'],
    ['2026-10-24T23:30:00Z', '2026-10-24'],
  ])('uses the venue operating date for %s independently of device timezone', (instant, expected) => {
    expect(getOperatingDate(new Date(instant))).toBe(expected)
  })
  it.each([
    ['2026-01-12', '2026-01-12T11:00:00Z'],
    ['2026-07-12', '2026-07-12T10:00:00Z'],
    ['2026-03-29', '2026-03-29T10:00:00Z'],
    ['2026-10-25', '2026-10-25T11:00:00Z'],
  ])('handles noon in winter, summer and DST-change dates (%s)', (day, instant) => {
    expect(slots(day, instant)[0].time).toBe('12:30')
  })
  it('retains full slots and all existing physical-resource overlap checks', () => {
    const group = saveAdminBooking({ customerName: 'Test', reservationInputs: [{ gameType: 'ping-pong', date, time: '13:00' }], groups: [], status: 'CONFIRMED' })
    const inventory = getGameByType('ping-pong')
    const result = getCustomerAvailabilityForGame('ping-pong', date, group.reservations, inventory, new Date('2026-09-12T10:00:00Z'))
    expect(result).toEqual(getAvailabilityForGame('ping-pong', date, group.reservations, inventory).filter(s => isFutureCustomerSlot(date, s.time, new Date('2026-09-12T10:00:00Z'))))
    expect(result.find(s => s.time === '13:00')).toMatchObject({ available: 0, isFull: true })
    expect(result.find(s => s.time === '14:00')).toMatchObject({ available: 1, isFull: false })
  })
})
