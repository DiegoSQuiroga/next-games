import type { BookingGroup, BookingStatus, GameType, Reservation } from '../domain/types'
import type { BookingInput } from './bookingRepository'
import { buildSessionWindow, OPERATING_SLOT_TIMES } from '../domain/session-time'
import { GAME_TYPES } from '../domain/games'

export const gameTypeByName: Record<string, GameType> = {
  Pool: 'pool', Darts: 'darts', 'Ping Pong': 'ping-pong', Shuffleboard: 'shuffleboard',
}
export type BookingRow = {
  id: string; resource_id?: string; game_name: string; resource_name?: string
  starts_at: string; ends_at: string; price_dkk: number; created_at: string
}
export type BookingGroupRow = {
  id: string; reference: string; customer_name: string; status: string
  total_price_dkk: number; payment_deadline: string; created_at: string; bookings: BookingRow[]
}
export type AvailabilityRow = Pick<BookingRow, 'id' | 'resource_id' | 'game_name' | 'starts_at' | 'ends_at'> & { status: string }

export function mapStatus(status: string): BookingStatus {
  const statuses: Record<string, BookingStatus> = {
    pending_payment: 'PENDING_PAYMENT', confirmed: 'CONFIRMED', cancelled: 'CANCELLED',
    expired: 'CANCELLED', completed: 'COMPLETED', no_show: 'NO_SHOW',
  }
  if (!statuses[status]) throw new Error(`Unsupported booking status: ${status}`)
  return statuses[status]
}

export function venueSessionLabels(startsAt: string): { date: string; startTime: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(startsAt))
  const part = (type: string) => parts.find(p => p.type === type)!.value
  const day = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`)
  if (Number(part('hour')) < 2) day.setUTCDate(day.getUTCDate() - 1)
  return { date: day.toISOString().slice(0, 10), startTime: `${part('hour')}:${part('minute')}` }
}

export function mapReservation(row: BookingRow, group: Omit<BookingGroupRow, 'bookings'>): Reservation {
  const gameType = gameTypeByName[row.game_name]
  if (!gameType) throw new Error(`Unsupported game: ${row.game_name}`)
  const status = mapStatus(group.status)
  return {
    id: String(row.id), bookingGroupId: String(group.id), gameType,
    resourceId: status === 'CANCELLED' || row.resource_id == null ? null : String(row.resource_id), resourceLabel: row.resource_name,
    ...venueSessionLabels(row.starts_at), status, customerName: group.customer_name,
    price: Number(row.price_dkk), createdAt: row.created_at, paymentDeadline: group.payment_deadline,
    sessionStart: row.starts_at, sessionEnd: row.ends_at,
  }
}

export function mapBookingGroup(row: BookingGroupRow): BookingGroup {
  if (!row.bookings?.length) throw new Error('The booking group has no sessions. Check database integrity.')
  return {
    id: String(row.id), bookingReference: row.reference, customerName: row.customer_name,
    reservations: row.bookings.map(b => mapReservation(b, row)), totalPrice: Number(row.total_price_dkk),
    createdAt: row.created_at, paymentDeadline: row.payment_deadline,
    paymentState: row.status === 'confirmed' || row.status === 'completed' || row.status === 'no_show' ? 'PAID' : 'PENDING',
  }
}

export function mapAvailability(row: AvailabilityRow): Reservation {
  return mapReservation({ ...row, price_dkk: 0, created_at: row.starts_at }, {
    id: '', reference: '', customer_name: '', status: row.status,
    total_price_dkk: 0, payment_deadline: row.starts_at, created_at: row.starts_at,
  })
}

export function bookingPayload(input: BookingInput, admin = false) {
  const name = input.customerName.trim()
  if (!name) throw new Error('Customer name is required.')
  if (input.reservationInputs.length < 1 || input.reservationInputs.length > 2) throw new Error('Choose one or two sessions.')
  const sessions = input.reservationInputs.map(({ gameType, date, time }) => {
    if (!GAME_TYPES.includes(gameType)) throw new Error('Game is not available.')
    buildSessionWindow(date, time)
    if (!admin && !OPERATING_SLOT_TIMES.includes(time)) throw new Error('Choose a customer start time in 30-minute increments.')
    return { gameType, date, time }
  })
  // Never send client prices, resource assignments, creation times or payment deadlines.
  return { p_customer_name: name, p_sessions: sessions }
}

export function bookingError(error: { code?: string; message: string }): Error {
  if (error.code === '23P01' || error.code === '40001') return new Error('That time was just booked by someone else. Please choose another slot.')
  if (error.code === 'PGRST202' || error.code === '42883') return new Error('Booking database setup is incomplete. Apply the booking persistence SQL migration in Supabase.')
  return new Error(error.message || 'Supabase is unavailable. Please try again.')
}
