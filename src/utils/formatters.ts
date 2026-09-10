import { buildSessionWindow } from '../domain/session-time'
import type { BookingStatus } from '../domain/types'

export function formatStatusLabel(status: BookingStatus): string {
  const labels: Record<BookingStatus, string> = {
    PENDING_PAYMENT: 'Pending payment',
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed',
    NO_SHOW: 'No show',
  }

  return labels[status]
}

export function formatMoney(amount: number): string {
  return `${amount} DKK`
}

export function formatDeadlineText(deadline: string, now = new Date()): string {
  const deadlineDate = new Date(deadline)
  const differenceMinutes = Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / 60000))

  if (differenceMinutes <= 10) {
    return `Pay within ${differenceMinutes} min`
  }

  if (differenceMinutes <= 60) {
    return `Pay before ${deadlineDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  return `Pay before ${deadlineDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

export function formatDateLabel(date: string, startTime?: string): string {
  return new Date(startTime ? buildSessionWindow(date, startTime).sessionStart : `${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(dateTime: string): string {
  const value = new Date(dateTime)
  const today = new Date()
  const isToday = value.toDateString() === today.toDateString()
  const time = value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return isToday ? `Today, ${time}` : value.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatEndTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  return `${String((hours + 1) % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatShortTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
