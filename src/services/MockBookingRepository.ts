import type { BookingGroup, BookingStatus, Reservation } from '../domain/types'
import type { BookingRepository, BookingInput } from './bookingRepository'
import { createBookingGroup, saveAdminBooking } from '../domain/booking-engine'
import { getGameByType, GAME_TYPES } from '../domain/games'

const STORAGE_KEY = 'next-games-bookings'

export class MockBookingRepository implements BookingRepository {
  private storageKey: string

  constructor(storageKey = STORAGE_KEY) {
    this.storageKey = storageKey
  }

  private readGroups(): BookingGroup[] {
    const raw = localStorage.getItem(this.storageKey)

    if (!raw) {
      return []
    }

    try {
      const parsed = JSON.parse(raw) as BookingGroup[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private writeGroups(groups: BookingGroup[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(groups))
  }

  async expirePendingBookings(): Promise<BookingGroup[]> {
    const groups = this.readGroups().map((group): BookingGroup => {
      const now = new Date()
      const expired = group.reservations.some(
        (reservation) =>
          reservation.status === 'PENDING_PAYMENT' && new Date(reservation.paymentDeadline).getTime() < now.getTime(),
      )

      if (!expired) {
        return group
      }

      const nextReservations: Reservation[] = group.reservations.map((reservation) => {
        if (
          reservation.status === 'PENDING_PAYMENT' &&
          new Date(reservation.paymentDeadline).getTime() < now.getTime()
        ) {
          return {
            ...reservation,
            status: 'CANCELLED' as BookingStatus,
            resourceId: null,
          }
        }

        return reservation
      })

      return {
        ...group,
        reservations: nextReservations,
      }
    })

    this.writeGroups(groups)
    return groups
  }

  async getAllGroups(): Promise<BookingGroup[]> {
    return this.expirePendingBookings()
  }

  async getGroupByReference(reference: string): Promise<BookingGroup | undefined> {
    return (await this.getAllGroups()).find((group) => group.bookingReference === reference)
  }

  async saveGroup(group: BookingGroup): Promise<BookingGroup> {
    const groups = this.readGroups()
    const nextGroups = [...groups, group]
    this.writeGroups(nextGroups)
    return group
  }

  async updateGroup(group: BookingGroup): Promise<BookingGroup> {
    const groups = this.readGroups().filter((item) => item.id !== group.id)
    this.writeGroups([...groups, group])
    return group
  }

  async deleteGroup(groupId: string): Promise<void> {
    const groups = this.readGroups().filter((group) => group.id !== groupId)
    this.writeGroups(groups)
  }

  async flattenReservations(): Promise<Reservation[]> {
    return (await this.getAllGroups()).flatMap((group) => group.reservations)
  }

  async createGroup(input: BookingInput): Promise<BookingGroup> {
    const groups = await this.getAllGroups()
    return this.saveGroup(createBookingGroup({ ...input, existingGroups: groups, allReservations: groups.flatMap(g => g.reservations) }))
  }
  async saveAdminGroup(input: BookingInput, id: string | null, status: 'PENDING_PAYMENT' | 'CONFIRMED'): Promise<BookingGroup> {
    const groups = await this.getAllGroups()
    const group = saveAdminBooking({ ...input, groups, original: groups.find(g => g.id === id), status })
    return id ? this.updateGroup(group) : this.saveGroup(group)
  }
  async setGroupStatus(id: string, status: 'CONFIRMED' | 'CANCELLED'): Promise<BookingGroup> {
    const group = (await this.getAllGroups()).find(g => g.id === id)
    if (!group) throw new Error('Booking not found')
    return this.updateGroup({ ...group, paymentState: status === 'CONFIRMED' ? 'PAID' : group.paymentState,
      reservations: group.reservations.map(r => ({ ...r, status, resourceId: status === 'CANCELLED' ? null : r.resourceId })) })
  }
  async getAvailability(date: string) {
    return { games: GAME_TYPES.map(getGameByType), reservations: (await this.flattenReservations()).filter(r => r.date === date) }
  }
}


