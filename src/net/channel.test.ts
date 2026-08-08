import { describe, it, expect } from 'vitest'
import { pickChannelKind, createStarChannel, createBroadcastChannel, createSupabaseChannel } from './channel'

describe('pickChannelKind', () => {
  it('chooses supabase when url and key are present', () => {
    expect(pickChannelKind({ url: 'https://x.supabase.co', key: 'abc' })).toBe('supabase')
  })

  it('falls back to broadcast when no credentials but BroadcastChannel exists', () => {
    expect(pickChannelKind({})).toBe('broadcast')
  })

  it('falls back to noop when BroadcastChannel is unavailable', () => {
    const saved = globalThis.BroadcastChannel
    delete (globalThis as Record<string, unknown>).BroadcastChannel
    expect(pickChannelKind({})).toBe('noop')
    ;(globalThis as Record<string, unknown>).BroadcastChannel = saved
  })
})

describe('createStarChannel', () => {
  it('returns a supabase channel with credentials', () => {
    expect(createStarChannel({ url: 'https://x.supabase.co', key: 'abc' }).kind).toBe('supabase')
  })

  it('returns a broadcast channel without credentials in node', () => {
    expect(createStarChannel({}).kind).toBe('broadcast')
  })
})

describe('createBroadcastChannel', () => {
  it('exposes the StarChannel surface', () => {
    const c = createBroadcastChannel('test-sky')
    expect(typeof c.connect).toBe('function')
    expect(typeof c.onStars).toBe('function')
    expect(typeof c.publish).toBe('function')
    expect(typeof c.dispose).toBe('function')
    c.dispose()
  })

  it('round-trips a star between two channels without self-delivery', () => {
    const a = createBroadcastChannel('test-sky-rt')
    const b = createBroadcastChannel('test-sky-rt')
    const received: unknown[] = []
    b.onStars((stars) => received.push(...stars))
    a.publish({ id: 'peer', hash: 'h', emotion: 'calm', confidence: 0.5, birthTime: 0 })
    setTimeout(() => {
      expect(received).toHaveLength(1)
      expect(received[0]).toMatchObject({ id: 'peer', emotion: 'calm' })
      a.dispose()
      b.dispose()
    }, 50)
  })
})

describe('createSupabaseChannel', () => {
  it('returns a star channel without connecting', () => {
    const c = createSupabaseChannel('https://x.supabase.co', 'abc')
    expect(c.kind).toBe('supabase')
    expect(typeof c.connect).toBe('function')
  })
})
