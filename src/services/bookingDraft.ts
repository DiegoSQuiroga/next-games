import { GAME_TYPES } from '../domain/games'
import { buildSessionWindow, OPERATING_SLOT_TIMES } from '../domain/session-time'
import type { GameType } from '../domain/types'

export type BookingDraft = { gameType: GameType; date: string; times: string[]; quantity: number }
export function readBookingDraft(): BookingDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem('next-games-draft') ?? 'null') as BookingDraft | null
    if (!value || !GAME_TYPES.includes(value.gameType) || !Array.isArray(value.times)
      || value.times.length < 1 || value.times.length > 2) return null
    for (const time of value.times) {
      if (!OPERATING_SLOT_TIMES.includes(time)) return null
      buildSessionWindow(value.date, time)
    }
    return { ...value, quantity: value.times.length }
  } catch { return null }
}
