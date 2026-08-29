import type { BookingGroup, BookingStatus, Reservation } from '../domain/types'

const STORAGE_KEY = 'next-games-bookings'

export interface BookingRepository {
  getAllGroups(): BookingGroup[]
  getGroupByReference(reference: string): BookingGroup | undefined
  saveGroup(group: BookingGroup): BookingGroup
  updateGroup(group: BookingGroup): BookingGroup
  deleteGroup(groupId: string): void
  expirePendingBookings(): BookingGroup[]
  flattenReservations(): Reservation[]
}

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

  expirePendingBookings(): BookingGroup[] {
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

  getAllGroups(): BookingGroup[] {
    return this.expirePendingBookings()
  }

  getGroupByReference(reference: string): BookingGroup | undefined {
    return this.getAllGroups().find((group) => group.bookingReference === reference)
  }

  saveGroup(group: BookingGroup): BookingGroup {
    const groups = this.readGroups()
    const nextGroups = [...groups, group]
    this.writeGroups(nextGroups)
    return group
  }

  updateGroup(group: BookingGroup): BookingGroup {
    const groups = this.readGroups().filter((item) => item.id !== group.id)
    this.writeGroups([...groups, group])
    return group
  }

  deleteGroup(groupId: string): void {
    const groups = this.readGroups().filter((group) => group.id !== groupId)
    this.writeGroups(groups)
  }

  flattenReservations(): Reservation[] {
    return this.getAllGroups().flatMap((group) => group.reservations)
  }
}

export const bookingRepository = new MockBookingRepository()
