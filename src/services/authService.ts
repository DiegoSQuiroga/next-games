import type { Session, SupabaseClient } from '@supabase/supabase-js'

export type AuthState = {
  status: 'loading' | 'anonymous' | 'staff' | 'forbidden' | 'error'
  message: string
}
const initialState: AuthState = { status: 'loading', message: '' }

// The SDK owns session persistence. Never store passwords or duplicate tokens here.
export function createAuthService(loadClient: () => Promise<SupabaseClient>) {
  let state = initialState
  const listeners = new Set<() => void>()
  let stop: (() => void) | undefined
  let generation = 0
  let request = 0
  let userId: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const publish = (next: AuthState) => {
    state = next
    listeners.forEach(listener => listener())
  }
  const accept = (session: Session | null, client: SupabaseClient) => {
    const current = ++request
    clearTimeout(timer)
    if (!session) { userId = undefined; publish({ status: 'anonymous', message: '' }); return }
    const sameStaff = userId === session.user.id && state.status === 'staff'
    userId = session.user.id
    // Token refresh/focus events must not unmount Admin and discard an open edit.
    if (!sameStaff) publish(initialState)
    // Never await a Supabase operation inside onAuthStateChange (SDK auth lock).
    timer = setTimeout(() => {
      void (async () => {
        try {
          const { data, error } = await client.rpc('is_current_user_staff')
          if (current !== request || !listeners.size) return
          if (error) throw error
          publish({ status: data === true ? 'staff' : 'forbidden', message: '' })
        } catch {
          if (current === request && listeners.size) publish({ status: 'error', message: 'Unable to verify staff access. Please retry.' })
        }
      })()
    }, 0)
  }
  const start = async () => {
    const current = ++generation
    try {
      const client = await loadClient()
      if (current !== generation || !listeners.size) return
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (current === generation) accept(session, client)
      })
      stop = () => data.subscription.unsubscribe()
      const before = request
      const { data: restored, error } = await client.auth.getSession()
      if (current !== generation || request !== before) return
      if (error) throw error
      accept(restored.session, client)
    } catch {
      if (current === generation && listeners.size) publish({ status: 'error', message: 'Unable to load your session. Check your connection and retry.' })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (listeners.size === 1) void start()
      return () => {
        listeners.delete(listener)
        if (listeners.size) return
        ++generation; ++request
        clearTimeout(timer)
        stop?.(); stop = undefined
        userId = undefined
        state = initialState
      }
    },
    async signIn(email: string, password: string) {
      const client = await loadClient()
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(error.code === 'invalid_credentials' ? 'Incorrect email or password.' : 'Unable to sign in. Check your credentials and connection, then try again.')
      if (listeners.size) accept(data.session, client)
    },
    async signOut() {
      ++request; clearTimeout(timer)
      publish(initialState)
      try {
        const client = await loadClient()
        const { error } = await client.auth.signOut()
        if (error) throw error
        publish({ status: 'anonymous', message: '' })
      } catch {
        publish({ status: 'error', message: 'Unable to log out. Please try again.' })
      }
    },
    async retry() {
      if (!stop) { publish(initialState); await start(); return }
      const current = ++request
      publish(initialState)
      try {
        const client = await loadClient()
        const { data, error } = await client.auth.getSession()
        if (current !== request || !listeners.size) return
        if (error) throw error
        accept(data.session, client)
      } catch {
        if (current === request && listeners.size) publish({ status: 'error', message: 'Unable to verify staff access. Please retry.' })
      }
    },
  }
}

export const authService = createAuthService(async () => (await import('../lib/supabase')).supabase)
