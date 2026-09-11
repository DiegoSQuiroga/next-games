import { useCallback, useEffect, useState } from 'react'
import { bookingRepository } from '../services/bookingRepository'
import { subscribeToBookingChanges } from '../services/bookingRealtime'
import type { BookingAvailability } from '../services/bookingRepository'
import type { BookingGroup } from '../domain/types'

export function useAsyncData<T>(load: () => Promise<T>, initial: T) {
  const [empty] = useState(() => initial)
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ load: typeof load | null; data: T; error: string }>({ load: null, data: initial, error: '' })
  const refresh = useCallback(() => setRevision(v => v + 1), [])
  useEffect(() => {
    let active = true
    let running = false
    let queued = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = async () => {
      if (!active) return
      if (running) { queued = true; return }
      running = true
      clearTimeout(timer)
      try {
        const result = await load()
        if (active) setState({ load, data: result, error: '' })
      } catch (cause) {
        if (active) setState({ load, data: empty, error: cause instanceof Error ? cause.message : 'Unable to load bookings.' })
      } finally {
        running = false
        if (active && queued) { queued = false; void run() }
        // Low-frequency recovery also lets existing RPCs expire unpaid bookings:
        // the passage of a deadline alone does not emit a database change.
        else if (active) timer = setTimeout(() => void run(), 60_000)
      }
    }
    const onResume = () => { if (document.visibilityState === 'visible') void run() }
    const unsubscribe = subscribeToBookingChanges(() => void run())
    window.addEventListener('online', onResume)
    document.addEventListener('visibilitychange', onResume)
    void run()
    return () => {
      active = false
      clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('online', onResume)
      document.removeEventListener('visibilitychange', onResume)
    }
  }, [load, revision, empty])
  const current = state.load === load
  // Keep the current route's data visible during background reads; never reuse
  // another reference/date's data while a route change is loading.
  return { data: current ? state.data : empty, error: current ? state.error : '', loading: !current, refresh }
}

export function useBookingGroups() {
  return useAsyncData(useCallback(() => bookingRepository.getAllGroups(), []), [] as BookingGroup[])
}
export function useBookingGroup(reference: string) {
  return useAsyncData(useCallback(() => bookingRepository.getGroupByReference(reference), [reference]), undefined as BookingGroup | undefined)
}
export function useBookingAvailability(date: string) {
  return useAsyncData(useCallback(async () => ({ ...await bookingRepository.getAvailability(date), date }), [date]),
    { games: [], reservations: [], date: '' } as BookingAvailability & { date: string })
}
