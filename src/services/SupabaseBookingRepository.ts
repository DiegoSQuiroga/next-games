import type { BookingGroup, Game } from '../domain/types'
import type { BookingAvailability, BookingInput, BookingRepository } from './bookingRepository'
import { bookingError, bookingPayload, gameTypeByName, mapAvailability, mapBookingGroup } from './bookingMapping'
import type { AvailabilityRow, BookingGroupRow } from './bookingMapping'
import { getAvailableResources } from '../domain/booking-rules'
import { buildSessionWindow } from '../domain/session-time'

type Rpc = <T>(name: string, args?: Record<string, unknown>) => Promise<T>
const rpc: Rpc = async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw bookingError(error)
  return data as T
}

export class SupabaseBookingRepository implements BookingRepository {
  private call: Rpc
  constructor(call: Rpc = rpc) { this.call = call }

  async getAllGroups(): Promise<BookingGroup[]> {
    return (await this.call<BookingGroupRow[]>('admin_list_booking_groups')).map(mapBookingGroup)
  }
  async getGroupByReference(reference: string): Promise<BookingGroup | undefined> {
    const row = await this.call<BookingGroupRow | null>('get_booking_group', { p_reference: reference.trim().toUpperCase() })
    return row ? mapBookingGroup(row) : undefined
  }
  async getAvailability(date: string): Promise<BookingAvailability> {
    const { supabase } = await import('../lib/supabase')
    const [rows, games, resources] = await Promise.all([
      this.call<AvailabilityRow[]>('get_booking_availability', { p_date: date }),
      supabase.from('games').select('id,name,price_dkk').eq('active', true),
      supabase.from('resources').select('id,game_id,name').eq('active', true).order('id'),
    ])
    if (games.error) throw bookingError(games.error)
    if (resources.error) throw bookingError(resources.error)
    const catalog: Game[] = games.data.map(g => {
      const type = gameTypeByName[g.name]
      if (!type) throw new Error(`Unsupported game: ${g.name}`)
      return { type, name: g.name, price: g.price_dkk, resources: resources.data
        .filter(r => r.game_id === g.id).map(r => ({ id: String(r.id), gameType: type, label: r.name })) }
    })
    return { games: catalog, reservations: rows.map(mapAvailability) }
  }

  async createGroup(input: BookingInput): Promise<BookingGroup> {
    bookingPayload(input)
    // Advisory frontend preflight; the RPC repeats allocation under a database transaction lock.
    for (const date of new Set(input.reservationInputs.map(s => s.date))) {
      const availability = await this.getAvailability(date)
      const assigned = [...availability.reservations]
      for (const session of input.reservationInputs.filter(s => s.date === date)) {
        const game = availability.games.find(g => g.type === session.gameType)
        const resource = game && getAvailableResources(game.type, assigned, date, session.time, game.resources)[0]
        if (!resource) throw bookingError({ code: '23P01', message: '' })
        assigned.push({ id: 'preflight', bookingGroupId: '', customerName: '', price: 0,
          createdAt: '', paymentDeadline: '', ...buildSessionWindow(date, session.time),
          gameType: session.gameType, resourceId: resource, date, startTime: session.time, status: 'PENDING_PAYMENT' })
      }
    }
    return mapBookingGroup(await this.call<BookingGroupRow>('create_booking_group', bookingPayload(input)))
  }
  async saveAdminGroup(input: BookingInput, id: string | null, status: 'PENDING_PAYMENT' | 'CONFIRMED'): Promise<BookingGroup> {
    return mapBookingGroup(await this.call<BookingGroupRow>('admin_save_booking_group', {
      ...bookingPayload(input, true), p_id: id, p_status: status.toLowerCase(),
    }))
  }
  async setGroupStatus(id: string, status: 'CONFIRMED' | 'CANCELLED'): Promise<BookingGroup> {
    return mapBookingGroup(await this.call<BookingGroupRow>('admin_set_booking_status', { p_id: id, p_status: status.toLowerCase() }))
  }
  saveGroup(group: BookingGroup): Promise<BookingGroup> {
    return this.createGroup(this.inputFromGroup(group))
  }
  updateGroup(group: BookingGroup): Promise<BookingGroup> {
    if (group.reservations.every(r => r.status === 'CANCELLED')) return this.setGroupStatus(group.id, 'CANCELLED')
    return this.saveAdminGroup(this.inputFromGroup(group), group.id, group.paymentState === 'PAID' ? 'CONFIRMED' : 'PENDING_PAYMENT')
  }
  async deleteGroup(id: string): Promise<void> { await this.setGroupStatus(id, 'CANCELLED') }
  expirePendingBookings(): Promise<BookingGroup[]> { return this.getAllGroups() }
  async flattenReservations() { return (await this.getAllGroups()).flatMap(g => g.reservations) }
  private inputFromGroup(group: BookingGroup): BookingInput {
    return { customerName: group.customerName, reservationInputs: group.reservations.map(r => ({ gameType: r.gameType, date: r.date, time: r.startTime })) }
  }
}
