import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createBookingRealtime } from './bookingRealtime'

function fixture() {
  const events: (() => void)[] = []
  let status: (value: string) => void = () => {}
  const channel = {
    on: vi.fn((_kind, _filter, callback: () => void) => { events.push(callback); return channel }),
    subscribe: vi.fn(callback => { status = callback; return channel }),
  }
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn().mockResolvedValue('ok') }
  const report = vi.fn()
  const subscribe = createBookingRealtime(async () => client as unknown as SupabaseClient, report)
  return { events, channel, client, report, subscribe, status: (value: string) => status(value) }
}

describe('shared booking Realtime', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
  it('shares one channel and coalesces group/session changes into fresh-read notifications', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const customer = vi.fn(), admin = vi.fn(), availability = vi.fn()
    const cleanups = [customer, admin, availability].map(f.subscribe)
    await Promise.resolve()
    expect(f.client.channel).toHaveBeenCalledTimes(1)
    expect(f.client.channel).toHaveBeenCalledWith('next-games-bookings', { config: { private: false } })
    expect(f.channel.on).toHaveBeenCalledExactlyOnceWith('broadcast', { event: 'booking_changed' }, expect.any(Function))
    f.events[0](); f.events[0](); f.events[0]()
    await vi.advanceTimersByTimeAsync(150)
    for (const listener of [customer, admin, availability]) expect(listener).toHaveBeenCalledTimes(1)
    cleanups[0]()
    expect(f.client.removeChannel).not.toHaveBeenCalled()
    f.events[0]()
    cleanups[1](); cleanups[2]()
    await vi.advanceTimersByTimeAsync(150)
    expect(admin).toHaveBeenCalledTimes(1)
    expect(f.client.removeChannel).toHaveBeenCalledTimes(1)
  })
  it('handles Strict Mode cleanup before the client import resolves', async () => {
    const f = fixture()
    const first = f.subscribe(vi.fn())
    first()
    const second = f.subscribe(vi.fn())
    await Promise.resolve()
    expect(f.client.channel).toHaveBeenCalledTimes(1)
    second()
    expect(f.client.removeChannel).toHaveBeenCalledTimes(1)
  })
  it('ignores events from removed channels and refreshes after reconnect', async () => {
    vi.useFakeTimers()
    const f = fixture(), listener = vi.fn()
    const stop = f.subscribe(listener)
    await Promise.resolve()
    const staleEvent = f.events[0]
    stop()
    const stopNext = f.subscribe(listener)
    await vi.advanceTimersByTimeAsync(0)
    staleEvent()
    await vi.advanceTimersByTimeAsync(150)
    expect(listener).not.toHaveBeenCalled()
    f.status('SUBSCRIBED')
    await vi.advanceTimersByTimeAsync(150)
    expect(listener).toHaveBeenCalledTimes(1)
    f.status('CHANNEL_ERROR')
    expect(f.report).toHaveBeenCalledWith(expect.stringContaining('normal database reads'))
    stopNext()
  })
  it('catches configuration failures without throwing to consumers', async () => {
    const report = vi.fn()
    const subscribe = createBookingRealtime(async () => { throw new Error('Missing config') }, report)
    const stop = subscribe(vi.fn())
    await Promise.resolve()
    expect(report).toHaveBeenCalledTimes(1)
    stop()
  })
  it('waits for removal before rejoining the same Broadcast topic', async () => {
    vi.useFakeTimers()
    const f = fixture()
    let finish!: (result: string) => void
    f.client.removeChannel.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const stop = f.subscribe(vi.fn())
    await Promise.resolve()
    stop()
    const stopNext = f.subscribe(vi.fn())
    await vi.advanceTimersByTimeAsync(0)
    expect(f.client.channel).toHaveBeenCalledTimes(1)
    finish('ok')
    await vi.advanceTimersByTimeAsync(0)
    expect(f.client.channel).toHaveBeenCalledTimes(2)
    stopNext()
  })
})
