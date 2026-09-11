import type { SupabaseClient } from '@supabase/supabase-js'

type Listener = () => void
type LoadClient = () => Promise<SupabaseClient>

// One shared channel per browser tab, regardless of the number of mounted hooks.
// Payloads never become booking state: listeners re-read through the repository.
export function createBookingRealtime(loadClient: LoadClient, report: (message: string) => void) {
  const listeners = new Set<Listener>()
  let generation = 0
  let remove: (() => void) | undefined
  let pendingRemoval: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const notify = () => {
    if (timer || !listeners.size) return
    timer = setTimeout(() => {
      timer = undefined
      for (const listener of listeners) {
        try { listener() } catch { report('Booking refresh callback failed.') }
      }
    }, 150)
  }
  const start = async () => {
    const current = ++generation
    try {
      const client = await loadClient()
      // Supabase identifies channels by topic. Finish removing the old instance
      // before joining the same topic again during navigation/Strict Mode.
      if (pendingRemoval) await pendingRemoval
      if (current !== generation || !listeners.size) return
      const channel = client.channel('next-games-bookings', { config: { private: false } })
      const changed = () => { if (current === generation) notify() }
      remove = () => {
        pendingRemoval = client.removeChannel(channel)
          .then(status => { if (status !== 'ok') report('Booking subscription cleanup incomplete.') })
          .catch(() => report('Booking subscription cleanup failed.'))
      }
      channel
        .on('broadcast', { event: 'booking_changed' }, changed)
        .subscribe(status => {
          if (current !== generation) return
          // Read again after joining/rejoining to cover changes during connection gaps.
          if (status === 'SUBSCRIBED') notify()
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            report(`Booking Realtime ${status}; normal database reads remain available.`)
          }
        })
    } catch {
      if (current === generation) report('Booking Realtime unavailable; normal database reads remain available.')
    }
  }
  return (listener: Listener) => {
    // Separate registrations allow the same callback to be independently cleaned up.
    const registered = () => listener()
    listeners.add(registered)
    if (listeners.size === 1) void start()
    return () => {
      listeners.delete(registered)
      if (listeners.size) return
      ++generation
      clearTimeout(timer)
      timer = undefined
      remove?.()
      remove = undefined
    }
  }
}

export const subscribeToBookingChanges = createBookingRealtime(
  async () => (await import('../lib/supabase')).supabase,
  message => { if (import.meta.env.DEV) console.warn(message) },
)
