import type { BookingGroup, Game, GameType, Reservation } from '../domain/types'
import { SupabaseBookingRepository } from './SupabaseBookingRepository'

export type BookingInput = {
  customerName: string
  reservationInputs: Array<{ gameType: GameType; date: string; time: string }>
}
export type BookingAvailability = { games: Game[]; reservations: Reservation[] }

// Network-backed repositories are asynchronous; UI code never imports the Supabase client.
export interface BookingRepository {
  getAllGroups(): Promise<BookingGroup[]>
  getGroupByReference(reference: string): Promise<BookingGroup | undefined>
  createGroup(input: BookingInput): Promise<BookingGroup>
  saveAdminGroup(input: BookingInput, id: string | null, status: 'PENDING_PAYMENT' | 'CONFIRMED'): Promise<BookingGroup>
  setGroupStatus(id: string, status: 'CONFIRMED' | 'CANCELLED'): Promise<BookingGroup>
  getAvailability(date: string): Promise<BookingAvailability>
  saveGroup(group: BookingGroup): Promise<BookingGroup>
  updateGroup(group: BookingGroup): Promise<BookingGroup>
  deleteGroup(groupId: string): Promise<void>
  expirePendingBookings(): Promise<BookingGroup[]>
  flattenReservations(): Promise<Reservation[]>
}

// The mock is imported explicitly from MockBookingRepository.ts by tests/reference tools only.
export const bookingRepository: BookingRepository = new SupabaseBookingRepository()
