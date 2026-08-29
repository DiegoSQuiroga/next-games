import { addDays, addMinutes, format, isBefore, parseISO } from 'date-fns'
import { getGameByType } from './games'
import { calculatePaymentDeadline, canCustomerCreateReservation, findFirstAvailableResource, normalizeCustomerName } from './booking-rules'
import type { BookingGroup, GameType, Reservation } from './types'

export const OPERATING_START_HOUR = 10
export const OPERATING_END_HOUR = 2
export const OPERATING_SLOT_TIMES = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00']

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

export function buildSessionWindow(date: string, startTime: string): { sessionStart: string; sessionEnd: string } {
  const sessionStart = new Date(`${date}T${startTime}:00`)
  const sessionEnd = addMinutes(sessionStart, 60)

  return {
    sessionStart: sessionStart.toISOString(),
    sessionEnd: sessionEnd.toISOString(),
  }
}

export function getAvailabilityForGame(
  gameType: GameType,
  date: string,
  reservations: Reservation[],
): SlotAvailability[] {
  const game = getGameByType(gameType)
  const capacity = game.resources.length

  return OPERATING_SLOT_TIMES.map((time) => {
    const occupied = reservations.filter((reservation) => {
      const sameGame = reservation.gameType === gameType
      const sameDate = reservation.date === date
      const sameTime = reservation.startTime === time
      const active = ['PENDING_PAYMENT', 'CONFIRMED'].includes(reservation.status)
      return sameGame && sameDate && sameTime && active
    }).length

    const available = Math.max(0, capacity - occupied)

    return {
      time,
      occupied,
      capacity,
      available,
      isFull: occupied >= capacity,
    }
  })
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
  createdAt?: string
}): BookingGroup {
  const { customerName, reservationInputs, existingGroups, allReservations, createdAt = new Date().toISOString() } = params
  const normalizedName = normalizeCustomerName(customerName)

  if (!normalizedName) {
    throw new Error('Customer name is required.')
  }

  if (!canCustomerCreateReservation(customerName, allReservations)) {
    throw new Error('This customer already has 2 active reservations.')
  }

  const bookingGroupId = `group-${Date.now()}`
  const bookingReference = generateBookingReference(existingGroups)

  const reservations = reservationInputs.map((input, index) =>
    createReservationRecord({
      bookingGroupId,
      gameType: input.gameType,
      date: input.date,
      startTime: input.time,
      customerName: normalizedName,
      createdAt,
      reservations: allReservations,
      index,
    }),
  )

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
