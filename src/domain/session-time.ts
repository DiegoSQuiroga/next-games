import { addDays, addMinutes, format } from 'date-fns'

export const OPERATING_START_HOUR = 10
export const OPERATING_END_HOUR = 2
export const SESSION_DURATION_MINUTES = 60
export const CUSTOMER_INTERVAL_MINUTES = 30

export function operatingMinute(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return (hour < OPERATING_START_HOUR ? hour + 24 : hour) * 60 + minute
}

export const OPERATING_SLOT_TIMES = Array.from(
  { length: ((24 + OPERATING_END_HOUR - OPERATING_START_HOUR) * 60 - SESSION_DURATION_MINUTES) / CUSTOMER_INTERVAL_MINUTES + 1 },
  (_, index) => {
    const minutes = OPERATING_START_HOUR * 60 + index * CUSTOMER_INTERVAL_MINUTES
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  },
)

const venueClockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function venueClock(now: Date) {
  const parts = venueClockFormat.formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return { date: part('year') + '-' + part('month') + '-' + part('day'), time: part('hour') + ':' + part('minute') }
}

function shiftCalendarDate(date: string, days: number): string {
  const day = new Date(date + 'T12:00:00Z')
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

export function getOperatingDate(now = new Date()): string {
  const clock = venueClock(now)
  return clock.time < '02:00' ? shiftCalendarDate(clock.date, -1) : clock.date
}

// Customer starts are minute-aligned and never fall in Copenhagen's DST transition
// hour (02:00 to 03:00), so comparing venue calendar labels also works across DST.
export function isFutureCustomerSlot(date: string, time: string, now = new Date()): boolean {
  if (!OPERATING_SLOT_TIMES.includes(time)) return false
  const clock = venueClock(now)
  const calendarDate = time < '10:00' ? shiftCalendarDate(date, 1) : date
  return calendarDate + 'T' + time > clock.date + 'T' + clock.time
}

// The date identifies the operating night; times after midnight belong to the next calendar day.
export function buildSessionWindow(date: string, startTime: string): { sessionStart: string; sessionEnd: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    throw new Error('Enter a valid date and start time.')
  }
  const day = new Date(`${date}T12:00:00`)
  if (Number.isNaN(day.getTime()) || format(day, 'yyyy-MM-dd') !== date) throw new Error('Enter a valid date.')
  const minute = operatingMinute(startTime)
  if (minute < OPERATING_START_HOUR * 60 || minute + SESSION_DURATION_MINUTES > (24 + OPERATING_END_HOUR) * 60) {
    throw new Error('Sessions must start between 10:00 and 01:00 and finish by 02:00.')
  }
  const start = Number(startTime.slice(0, 2)) < OPERATING_START_HOUR ? addDays(day, 1) : day
  const [hour, minutes] = startTime.split(':').map(Number)
  start.setHours(hour, minutes, 0, 0)
  return { sessionStart: start.toISOString(), sessionEnd: addMinutes(start, SESSION_DURATION_MINUTES).toISOString() }
}

export function timeRangesOverlap(
  existing: { sessionStart: string; sessionEnd: string },
  requested: { sessionStart: string; sessionEnd: string },
): boolean {
  return new Date(existing.sessionStart).getTime() < new Date(requested.sessionEnd).getTime()
    && new Date(requested.sessionStart).getTime() < new Date(existing.sessionEnd).getTime()
}
