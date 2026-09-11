import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createAuthService } from './authService'

const session = { user: { id: 'staff-id' } } as Session
function fixture(restored: Session | null = null, staff = true) {
  let callback: (event: string, value: Session | null) => void = () => {}
  const unsubscribe = vi.fn()
  const client = {
    auth: {
      onAuthStateChange: vi.fn(cb => { callback = cb; return { data: { subscription: { unsubscribe } } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: restored }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: staff, error: null }),
  }
  const service = createAuthService(async () => client as unknown as SupabaseClient)
  return { service, client, unsubscribe, emit: (value: Session | null, event = 'SIGNED_IN') => callback(event, value) }
}
const flush = () => vi.advanceTimersByTimeAsync(1)

describe('Supabase staff authentication', () => {
  afterEach(() => vi.useRealTimers())
  it('restores anonymous state without a staff RPC or password gate', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const stop = f.service.subscribe(vi.fn())
    await flush()
    expect(f.service.getSnapshot().status).toBe('anonymous')
    expect(f.client.rpc).not.toHaveBeenCalled()
    stop()
  })
  it('reports incorrect credentials and never authorizes a failed login', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const stop = f.service.subscribe(vi.fn())
    await flush()
    f.client.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { code: 'invalid_credentials' } })
    await expect(f.service.signIn('staff@example.test', 'wrong')).rejects.toThrow('Incorrect email or password')
    expect(f.service.getSnapshot().status).toBe('anonymous')
    expect(f.client.rpc).not.toHaveBeenCalled()
    stop()
  })
  it('signs in through Supabase and verifies membership with a no-argument RPC', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const stop = f.service.subscribe(vi.fn())
    await flush()
    await f.service.signIn(' staff@example.test ', 'password-not-stored')
    await flush()
    expect(f.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'staff@example.test', password: 'password-not-stored' })
    expect(f.client.rpc).toHaveBeenCalledWith('is_current_user_staff')
    expect(f.service.getSnapshot()).toEqual({ status: 'staff', message: '' })
    stop()
  })
  it('restores an existing session after refresh and denies non-staff', async () => {
    vi.useFakeTimers()
    for (const staff of [true, false]) {
      const f = fixture(session, staff)
      const stop = f.service.subscribe(vi.fn())
      await flush()
      expect(f.service.getSnapshot().status).toBe(staff ? 'staff' : 'forbidden')
      expect(f.client.auth.signInWithPassword).not.toHaveBeenCalled()
      stop()
    }
  })
  it('defers RPCs outside auth callbacks and keeps Admin mounted during token refresh', async () => {
    vi.useFakeTimers()
    const f = fixture(session)
    const stop = f.service.subscribe(vi.fn())
    await flush()
    f.client.rpc.mockClear()
    f.emit(session, 'TOKEN_REFRESHED')
    expect(f.client.rpc).not.toHaveBeenCalled()
    expect(f.service.getSnapshot().status).toBe('staff')
    await flush()
    expect(f.client.rpc).toHaveBeenCalledOnce()
    stop()
  })
  it('uses one listener, handles Strict Mode import races and unsubscribes on last cleanup', async () => {
    vi.useFakeTimers()
    const f = fixture()
    f.service.subscribe(vi.fn())()
    const a = f.service.subscribe(vi.fn()), b = f.service.subscribe(vi.fn())
    await flush()
    expect(f.client.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
    a()
    expect(f.unsubscribe).not.toHaveBeenCalled()
    b()
    expect(f.unsubscribe).toHaveBeenCalledTimes(1)
  })
  it('signs out and ignores a staff-check response arriving after logout', async () => {
    vi.useFakeTimers()
    const f = fixture(session)
    let resolve!: (value: unknown) => void
    f.client.rpc.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const stop = f.service.subscribe(vi.fn())
    await flush()
    await f.service.signOut()
    resolve({ data: true, error: null })
    await flush()
    expect(f.client.auth.signOut).toHaveBeenCalledOnce()
    expect(f.service.getSnapshot().status).toBe('anonymous')
    stop()
  })
  it('fails closed on staff-check and logout errors', async () => {
    vi.useFakeTimers()
    const f = fixture(session)
    f.client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Missing migration' } })
    const stop = f.service.subscribe(vi.fn())
    await flush()
    expect(f.service.getSnapshot().status).toBe('error')
    await f.service.retry(); await flush()
    expect(f.service.getSnapshot().status).toBe('staff')
    f.client.auth.signOut.mockResolvedValueOnce({ error: { message: 'Network failure' } })
    await f.service.signOut()
    expect(f.service.getSnapshot().status).toBe('error')
    stop()
  })
  it('does not restore a stale session after a newer sign-out event', async () => {
    vi.useFakeTimers()
    const f = fixture()
    let resolve!: (value: unknown) => void
    f.client.auth.getSession.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const stop = f.service.subscribe(vi.fn())
    await flush()
    f.emit(null, 'SIGNED_OUT')
    resolve({ data: { session }, error: null })
    await flush()
    expect(f.service.getSnapshot().status).toBe('anonymous')
    expect(f.client.rpc).not.toHaveBeenCalled()
    stop()
  })
})
