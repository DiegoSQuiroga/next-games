import { addDays, format, isBefore, parseISO } from 'date-fns'
import { getGameByType } from './games'
import { calculatePaymentDeadline, canCustomerCreateReservation, findFirstAvailableResource, getAvailableResources, normalizeCustomerName } from './booking-rules'
import type { BookingGroup, Game, GameType, Reservation } from './types'

import { buildSessionWindow, OPERATING_SLOT_TIMES } from './session-time'
export { buildSessionWindow, OPERATING_SLOT_TIMES, OPERATING_START_HOUR, OPERATING_END_HOUR } from './session-time'

export type SlotAvailability = {
  time: string
  occupied: number
  capacity: number
  available: number
  isFull: boolean
}

export function makeDayOptions(daysAhead = 7): string[] {
  const today = new Date()
  return Array.from({ length: daysAhead }, (_, index) => format(addDays(today, index), 'yyyy-MM-dd'))
}

export function getSessionTimeLabels(date: string): string[] {
  return OPERATING_SLOT_TIMES.map((time) => `${date} ${time}`)
}

export function getAvailabilityAtTime(
  gameType: GameType, date: string, time: string, reservations: Reservation[],
  game: Game = getGameByType(gameType),
): SlotAvailability {
  const capacity = game.resources.length
  const available = getAvailableResources(gameType, reservations, date, time, game.resources).length
  return { time, occupied: capacity - available, capacity, available, isFull: available === 0 }
}

export function getAvailabilityForGame(
  gameType: GameType, date: string, reservations: Reservation[],
  game: Game = getGameByType(gameType),
): SlotAvailability[] {
  return OPERATING_SLOT_TIMES.map((time) => getAvailabilityAtTime(gameType, date, time, reservations, game))
}

export function getNextAvailableSlot(gameType: GameType, date: string, reservations: Reservation[]): string | null {
  const slots = getAvailabilityForGame(gameType, date, reservations)
  const nextSlot = slots.find((slot) => !slot.isFull)
  return nextSlot?.time ?? null
}

export function createReservationRecord(params: {
  bookingGroupId: string
  gameType: GameType
  date: string
  startTime: string
  customerName: string
  createdAt: string
  reservations: Reservation[]
  index: number
}): Reservation {
  const { bookingGroupId, gameType, date, startTime, customerName, createdAt, reservations, index } = params
  const resourceId = findFirstAvailableResource(gameType, reservations, date, startTime)
  const { sessionStart, sessionEnd } = buildSessionWindow(date, startTime)
  if (!resourceId) throw new Error('One or more selected sessions are full.')
  const paymentDeadline = calculatePaymentDeadline(createdAt, sessionStart)

  return {
    id: `${bookingGroupId}-${index}`,
    bookingGroupId,
    gameType,
    resourceId,
    date,
    startTime,
    status: 'PENDING_PAYMENT',
    customerName,
    price: getGameByType(gameType).price,
    createdAt,
    paymentDeadline,
    sessionStart,
    sessionEnd,
  }
}

export function generateBookingReference(existingGroups: BookingGroup[] = []): string {
  const used = new Set(existingGroups.map((group) => group.bookingReference))
  let candidate = 1000 + Math.floor(Math.random() * 9000)

  while (used.has(`NG-${String(candidate).padStart(4, '0')}`)) {
    candidate = 1000 + Math.floor(Math.random() * 9000)
  }

  return `NG-${String(candidate).padStart(4, '0')}`
}

export function createBookingGroup(params: {
  customerName: string
  reservationInputs: Array<{ gameType: GameType; date: string; time: string }>
  existingGroups: BookingGroup[]
  allReservations: Reservation[]
  source?: 'customer' | 'admin'
  createdAt?: string
}): BookingGroup {
  const { customerName, reservationInputs, existingGroups, allReservations, createdAt = new Date().toISOString(), source = 'customer' } = params
  const normalizedName = normalizeCustomerName(customerName)

  if (!normalizedName) {
    throw new Error('Customer name is required.')
  }

  if (reservationInputs.length < 1 || reservationInputs.length > 2) {
    throw new Error('Choose one or two sessions.')
  }
  const bookingGroupId = 'group-' + crypto.randomUUID()
  const bookingReference = generateBookingReference(existingGroups)
  const reservations: Reservation[] = []
  for (const [index, input] of reservationInputs.entries()) {
    if (source === 'customer' && !OPERATING_SLOT_TIMES.includes(input.time)) {
      throw new Error('Choose a customer start time in 30-minute increments.')
    }
    const occupied = [...allReservations, ...reservations]
    if (!canCustomerCreateReservation(customerName, occupied)) {
      throw new Error('This customer already has 2 active reservations.')
    }
    reservations.push(createReservationRecord({
      bookingGroupId, gameType: input.gameType, date: input.date, startTime: input.time,
      customerName: normalizedName, createdAt, reservations: occupied, index,
    }))
  }

  const totalPrice = reservations.reduce((sum, reservation) => sum + reservation.price, 0)
  const paymentDeadline = reservations.reduce((earliest, reservation) => {
    if (!earliest) {
      return reservation.paymentDeadline
    }

    return isBefore(parseISO(reservation.paymentDeadline), parseISO(earliest))
      ? reservation.paymentDeadline
      : earliest
  }, '')

  return {
    id: bookingGroupId,
    bookingReference,
    customerName: normalizedName,
    reservations,
    totalPrice,
    createdAt,
    paymentDeadline,
    paymentState: 'PENDING',
  }
}

export function saveAdminBooking(params: {
  customerName: string
  reservationInputs: Array<{ gameType: GameType; date: string; time: string }>
  groups: BookingGroup[]
  original?: BookingGroup | null
  status: 'PENDING_PAYMENT' | 'CONFIRMED'
}): BookingGroup {
  const { original, groups, status } = params
  const remaining = groups.filter((g) => g.id !== original?.id)
  const next = createBookingGroup({
    ...params, source: 'admin', existingGroups: groups,
    allReservations: remaining.flatMap((g) => g.reservations),
    createdAt: original?.createdAt,
  })
  return {
    ...next,
    id: original?.id ?? next.id,
    bookingReference: original?.bookingReference ?? next.bookingReference,
    paymentState: status === 'CONFIRMED' ? 'PAID' : 'PENDING',
    reservations: next.reservations.map((r, index) => ({
      ...r, status,
      id: original?.reservations[index]?.id ?? r.id,
      bookingGroupId: original?.id ?? next.id,
    })),
  }
}

export function bookingGroupStatusLabel(group: BookingGroup): string {
  if (group.reservations.some((reservation) => reservation.status === 'CONFIRMED')) {
    return 'Confirmed'
  }

  if (group.reservations.some((reservation) => reservation.status === 'CANCELLED')) {
    return 'Cancelled'
  }

  if (group.reservations.some((reservation) => reservation.status === 'PENDING_PAYMENT')) {
    return 'Payment pending'
  }

  return 'Pending review'
}

export function getReservationStatusDisplay(status: Reservation['status']): string {
  return status.replace('_', ' ')
}

export function getGroupTotalDisplay(group: BookingGroup): string {
  return `${group.totalPrice} DKK`
}

export function toReadableTime(dateString: string): string {
  return format(parseISO(dateString), 'HH:mm')
}

export function getRemainingMinutes(deadline: string, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now.getTime()) / (1000 * 60)))
}

export function getReservationSummaryText(reservation: Reservation): string {
  return `${reservation.date} ${reservation.startTime} ${getGameByType(reservation.gameType).name}`
}
