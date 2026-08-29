import { addMinutes, format, isAfter, isBefore, parseISO } from 'date-fns'

export const OPENING_HOUR = 10
export const CLOSING_HOUR = 2
export const SLOT_START_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1]

export function isSameOperatingNight(_date: string, startHour: number): boolean {
  return startHour >= 0 && startHour <= 1
}

export function getOperatingDateLabel(date: string, hour: number): string {
  const parsed = parseISO(date)

  if (hour >= 0 && hour <= 1) {
    return format(addMinutes(parsed, 0), 'yyyy-MM-dd')
  }

  return format(parsed, 'yyyy-MM-dd')
}

export function getDailyTimeSlots(date: string): string[] {
  return SLOT_START_HOURS.map((hour) => `${format(parseISO(date), 'yyyy-MM-dd')}T${String(hour).padStart(2, '0')}:00:00`)
}

export function toBookingDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

export function buildSessionWindow(date: string, startTime: string): { sessionStart: string; sessionEnd: string } {
  const sessionStart = new Date(`${date}T${startTime}:00`)
  const sessionEnd = addMinutes(sessionStart, 60)

  return {
    sessionStart: sessionStart.toISOString(),
    sessionEnd: sessionEnd.toISOString(),
  }
}

export function getAvailableStartTimes(): string[] {
  return SLOT_START_HOURS.map((hour) => `${String(hour).padStart(2, '0')}:00`)
}

export function getDeadlineForBooking(createdAt: Date, sessionStart: Date): string {
  const diffMinutes = (sessionStart.getTime() - createdAt.getTime()) / (1000 * 60)

  if (diffMinutes > 45) {
    return addMinutes(sessionStart, -45).toISOString()
  }

  return addMinutes(createdAt, 10).toISOString()
}

export function isBookingExpired(paymentDeadline: string, now: Date = new Date()): boolean {
  return isBefore(new Date(paymentDeadline), now) && !isAfter(new Date(paymentDeadline), now)
}

export function isSameCustomerName(source: string, target: string): boolean {
  return source.trim().toLowerCase() === target.trim().toLowerCase()
}

export function getTodayIsoString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function getDateFromSlot(date: string): Date {
  return parseISO(date)
}
