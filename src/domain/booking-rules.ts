import { addMinutes, isAfter, isBefore, isSameMinute, parseISO } from 'date-fns'
import { buildSessionWindow, timeRangesOverlap } from './session-time'
import { getGameByType } from './games'
import type { BookingGroup, BookingStatus, GameType, PhysicalResource, Reservation, ResourceId } from './types'

export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['PENDING_PAYMENT', 'CONFIRMED']
export const OCCUPYING_BOOKING_STATUSES: BookingStatus[] = ['PENDING_PAYMENT', 'CONFIRMED']

export function normalizeCustomerName(name: string): string {
  return name.trim()
}

export function isActiveReservation(status: BookingStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status)
}

export function isResourceOccupied(status: BookingStatus): boolean {
  return OCCUPYING_BOOKING_STATUSES.includes(status)
}

export function calculateGroupTotalPrice(reservations: Reservation[]): number {
  return reservations.reduce((total, reservation) => total + reservation.price, 0)
}

export function getEarliestPaymentDeadline(reservations: Reservation[]): string {
  return reservations.reduce((earliest, reservation) => {
    if (!earliest || isBefore(parseISO(reservation.paymentDeadline), parseISO(earliest))) {
      return reservation.paymentDeadline
    }
    return earliest
  }, reservations[0]?.paymentDeadline ?? new Date().toISOString())
}

export function createBookingReference(index: number): string {
  const numeric = (index + 1).toString().padStart(4, '0')
  return `NG-${numeric}`
}

export function calculatePaymentDeadline(createdAt: string, sessionStart: string): string {
  const createdDate = new Date(createdAt)
  const sessionDate = new Date(sessionStart)
  const diffMinutes = (sessionDate.getTime() - createdDate.getTime()) / 60000

  if (diffMinutes > 45) {
    return addMinutes(sessionDate, -45).toISOString()
  }

  return addMinutes(createdDate, 10).toISOString()
}

export function getAvailableResources(
  gameType: GameType, reservations: Reservation[], date?: string, startTime?: string,
  resources = getGameByType(gameType).resources as PhysicalResource[],
): ResourceId[] {
  const requested = date && startTime ? buildSessionWindow(date, startTime) : null
  const taken = new Set(reservations
    .filter((r) => r.gameType === gameType && r.resourceId && isResourceOccupied(r.status))
    // Rebuild from the operating date for compatibility with older midnight records.
    .filter((r) => requested ? timeRangesOverlap(buildSessionWindow(r.date, r.startTime), requested) : (!date || r.date === date))
    .map((r) => r.resourceId))
  return resources.map((r) => r.id).filter((id) => !taken.has(id))
}

export function findFirstAvailableResource(
  gameType: GameType, reservations: Reservation[], date?: string, startTime?: string,
  existingAssignments: ResourceId[] = [],
): ResourceId | null {
  return getAvailableResources(gameType, reservations, date, startTime)
    .find((id) => !existingAssignments.includes(id)) ?? null
}

export function canCustomerCreateReservation(
  customerName: string,
  reservations: Reservation[],
): boolean {
  const normalized = normalizeCustomerName(customerName)
  const activeCount = reservations.filter(
    (reservation) =>
      reservation.customerName.trim().toLowerCase() === normalized.toLowerCase() &&
      isActiveReservation(reservation.status),
  ).length

  return activeCount < 2
}

export function groupReservationsByCustomer(reservations: Reservation[]) {
  return reservations.reduce<Record<string, Reservation[]>>((groups, reservation) => {
    const key = reservation.customerName.trim().toLowerCase()
    groups[key] = groups[key] ?? []
    groups[key].push(reservation)
    return groups
  }, {})
}

export function isReservationExpired(reservation: Reservation, now: Date = new Date()): boolean {
  return isBefore(new Date(reservation.paymentDeadline), now)
}

export function confirmGroupPayment(group: BookingGroup): BookingGroup {
  return {
    ...group,
    paymentState: 'PAID',
    reservations: group.reservations.map((reservation) => ({
      ...reservation,
      status: 'CONFIRMED',
    })),
  }
}

export function cancelGroup(group: BookingGroup): BookingGroup {
  return {
    ...group,
    reservations: group.reservations.map((reservation) => ({
      ...reservation,
      status: 'CANCELLED',
      resourceId: null,
    })),
  }
}

export function isSameSessionTime(a: { date: string; startTime: string }, b: { date: string; startTime: string }): boolean {
  return a.date === b.date && a.startTime === b.startTime
}

export function isBookingGroupPaymentDeadlineExpired(group: BookingGroup, now: Date = new Date()): boolean {
  return isBefore(new Date(group.paymentDeadline), now)
}

export function isExactFortyFiveMinutesBefore(createdAt: string, sessionStart: string): boolean {
  const createdDate = new Date(createdAt)
  const sessionDate = new Date(sessionStart)
  return isSameMinute(addMinutes(sessionDate, -45), createdDate)
}

export function isLessThanFortyFiveMinutesBefore(createdAt: string, sessionStart: string): boolean {
  const createdDate = new Date(createdAt)
  const sessionDate = new Date(sessionStart)
  return isAfter(createdDate, addMinutes(sessionDate, -45)) && isBefore(createdDate, sessionDate)
}
