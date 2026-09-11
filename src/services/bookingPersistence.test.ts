import { afterEach, describe, expect, it, vi } from 'vitest'
import { bookingError, bookingPayload, mapAvailability, mapBookingGroup, venueSessionLabels } from './bookingMapping'
import type { BookingGroupRow } from './bookingMapping'
import { SupabaseBookingRepository } from './SupabaseBookingRepository'
import { getRecentBookingReferences, rememberBookingReference } from './recentBookings'
import { getAvailabilityForGame } from '../domain/booking-engine'
import { readBookingDraft } from './bookingDraft'

const row: BookingGroupRow = {
  id: 'group-uuid', reference: 'NG-8152', customer_name: 'Sebita', status: 'pending_payment',
  total_price_dkk: 60, created_at: '2099-09-10T12:00:00Z', payment_deadline: '2099-09-10T22:00:00Z',
  bookings: [{ id: 'booking-uuid', resource_id: '6', game_name: 'Ping Pong', resource_name: 'Ping Pong 1',
    starts_at: '2099-09-10T22:45:00Z', ends_at: '2099-09-10T23:45:00Z', price_dkk: 60, created_at: '2099-09-10T12:00:00Z' }],
}
const input = { customerName: ' Sebita ', reservationInputs: [{ gameType: 'ping-pong' as const, date: '2099-09-10', time: '00:30' }] }

describe('database mapping', () => {
  it('maps customer responses without physical assignments', () => {
    const customerRow = { ...row, bookings: row.bookings.map(b => ({ ...b, resource_id: undefined, resource_name: undefined })) }
    const group = mapBookingGroup(customerRow)
    expect(group.reservations[0].resourceId).toBeNull()
    expect(group.reservations[0].resourceLabel).toBeUndefined()
    expect(group.totalPrice).toBe(60)
    expect(group.bookingReference).toBe(row.reference)
  })
  it('maps group, status, resource IDs and venue operating night', () => {
    const group = mapBookingGroup(row)
    expect(group).toMatchObject({ id: 'group-uuid', bookingReference: 'NG-8152', paymentState: 'PENDING', totalPrice: 60 })
    expect(group.reservations[0]).toMatchObject({ bookingGroupId: 'group-uuid', resourceId: '6', date: '2099-09-10', startTime: '00:45', status: 'PENDING_PAYMENT' })
    expect(group.reservations[0].paymentDeadline).toBe(row.payment_deadline)
  })
  it('maps paid and expired states consistently', () => {
    expect(mapBookingGroup({ ...row, status: 'confirmed' }).paymentState).toBe('PAID')
    expect(mapBookingGroup({ ...row, status: 'expired' }).reservations[0]).toMatchObject({ status: 'CANCELLED', resourceId: null })
    expect(() => mapBookingGroup({ ...row, status: 'unknown' })).toThrow(/Unsupported booking status/)
  })
  it('interprets venue times independent of browser timezone in winter and summer', () => {
    expect(venueSessionLabels('2099-01-10T23:45:00Z')).toEqual({ date: '2099-01-10', startTime: '00:45' })
    expect(venueSessionLabels('2099-09-10T22:45:00Z')).toEqual({ date: '2099-09-10', startTime: '00:45' })
  })
  it('uses real resource inventory with the existing overlap rule', () => {
    const reservation = mapAvailability({ ...row.bookings[0], status: 'confirmed' })
    const inventory = { type: 'ping-pong' as const, name: 'Ping Pong', price: 60, resources: [{ id: '6', gameType: 'ping-pong' as const, label: 'Ping Pong 1' }] }
    expect(getAvailabilityForGame('ping-pong', '2099-09-10', [reservation], inventory).find(s => s.time === '00:30')?.isFull).toBe(true)
    expect(reservation.customerName).toBe('')
  })
})

describe('controlled request payloads', () => {
  it('trims names and sends only name and session choices', () => {
    expect(bookingPayload(input)).toEqual({ p_customer_name: 'Sebita', p_sessions: input.reservationInputs })
    const poisoned = { ...input, price: 1, status: 'confirmed', resource_id: 'forged' }
    expect(bookingPayload(poisoned)).toEqual(bookingPayload(input))
  })
  it('enforces input count, nonblank name, opening hours and customer increments', () => {
    expect(() => bookingPayload({ ...input, customerName: '  ' })).toThrow(/name/)
    expect(() => bookingPayload({ ...input, reservationInputs: [] })).toThrow(/one or two/)
    expect(() => bookingPayload({ ...input, reservationInputs: [...input.reservationInputs, ...input.reservationInputs, ...input.reservationInputs] })).toThrow(/one or two/)
    expect(() => bookingPayload({ ...input, reservationInputs: [{ ...input.reservationInputs[0], time: '01:30' }] })).toThrow(/02:00/)
    const arbitrary = { ...input, reservationInputs: [{ ...input.reservationInputs[0], time: '18:17' }] }
    expect(() => bookingPayload(arbitrary)).toThrow(/30-minute/)
    expect(bookingPayload(arbitrary, true).p_sessions[0].time).toBe('18:17')
  })
  it('provides actionable conflict and missing-migration errors', () => {
    expect(bookingError({ code: '23P01', message: 'conflict' }).message).toMatch(/just booked/)
    expect(bookingError({ code: 'PGRST202', message: 'missing' }).message).toMatch(/migration/)
    expect(bookingError({ message: 'Network unavailable' }).message).toBe('Network unavailable')
  })
})

describe('SupabaseBookingRepository', () => {
  it('maps reads and not-found references through RPCs', async () => {
    const call = vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce(null)
    const repo = new SupabaseBookingRepository(call)
    expect(await repo.getAllGroups()).toEqual([mapBookingGroup(row)])
    expect(await repo.getGroupByReference(' ng-0000 ')).toBeUndefined()
    expect(call).toHaveBeenLastCalledWith('get_booking_group', { p_reference: 'NG-0000' })
  })
  it('preflights against real inventory and lets server conflicts propagate', async () => {
    const call = vi.fn().mockRejectedValue(bookingError({ code: '23P01', message: '' }))
    const repo = new SupabaseBookingRepository(call)
    vi.spyOn(repo, 'getAvailability').mockResolvedValue({ games: [{ type: 'ping-pong', name: 'Ping Pong', price: 60, resources: [{ id: '6', gameType: 'ping-pong', label: 'Ping Pong 1' }] }], reservations: [] })
    await expect(repo.createGroup(input)).rejects.toThrow(/just booked/)
    expect(call).toHaveBeenCalledWith('create_booking_group', bookingPayload(input))
  })
  it('rejects full preflight without sending a write and never falls back to localStorage', async () => {
    const call = vi.fn()
    const repo = new SupabaseBookingRepository(call)
    vi.spyOn(repo, 'getAvailability').mockResolvedValue({ games: [], reservations: [] })
    await expect(repo.createGroup(input)).rejects.toThrow(/just booked/)
    expect(call).not.toHaveBeenCalled()
  })
  it('uses explicit admin RPCs for edits and payment confirmation', async () => {
    const call = vi.fn().mockResolvedValue({ ...row, status: 'confirmed' })
    const repo = new SupabaseBookingRepository(call)
    await repo.saveAdminGroup(input, row.id, 'CONFIRMED')
    expect(call).toHaveBeenCalledWith('admin_save_booking_group', { ...bookingPayload(input, true), p_id: row.id, p_status: 'confirmed' })
    await repo.setGroupStatus(row.id, 'CONFIRMED')
    expect(call).toHaveBeenLastCalledWith('admin_set_booking_status', { p_id: row.id, p_status: 'confirmed' })
  })
})

describe('recent references only', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('stores only references, deduplicates and limits history', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
    for (let i = 1000; i < 1007; i++) rememberBookingReference(`NG-${i}`)
    rememberBookingReference('NG-1003')
    rememberBookingReference('invalid')
    expect(getRecentBookingReferences()).toEqual(['NG-1003', 'NG-1006', 'NG-1005', 'NG-1004', 'NG-1002'])
    expect([...storage.keys()]).toEqual(['next-games-recent-booking-references'])
    expect([...storage.values()][0]).not.toMatch(/customer|status|resource/)
    rememberBookingReference('NG-7K4P2ABCDEF') // Too short.
    expect(getRecentBookingReferences()[0]).toBe('NG-1003')
    rememberBookingReference('NG-7K4P2ABCDEFG')
    expect(getRecentBookingReferences()[0]).toBe('NG-7K4P2ABCDEFG')
  })
  it('tolerates malformed or unavailable localStorage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{bad json', setItem: () => { throw new Error('Blocked') } })
    expect(getRecentBookingReferences()).toEqual([])
    expect(() => rememberBookingReference('NG-8152')).not.toThrow()
  })
  it('handles corrupt or invalid session drafts without crashing the review page', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => '{invalid' })
    expect(readBookingDraft()).toBeNull()
    vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ gameType: 'unknown', date: '2099-09-10', times: ['18:00'] }) })
    expect(readBookingDraft()).toBeNull()
    vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ gameType: 'pool', date: '2099-09-10', times: ['18:30'] }) })
    expect(readBookingDraft()?.times).toEqual(['18:30'])
  })
})
