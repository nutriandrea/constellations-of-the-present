import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  pickRetentionKind,
  createRetentionSink,
  createRetentionGate,
  type RetentionRecord,
} from './retention'

describe('pickRetentionKind', () => {
  it('chooses supabase when url and key are present', () => {
    expect(pickRetentionKind({ url: 'https://x.supabase.co', key: 'abc' })).toBe('supabase')
  })

  it('chooses noop without credentials', () => {
    expect(pickRetentionKind({})).toBe('noop')
  })
})

describe('createRetentionSink', () => {
  it('returns a supabase sink with credentials', () => {
    const sink = createRetentionSink({ url: 'https://x.supabase.co', key: 'abc' })
    expect(sink.kind).toBe('supabase')
    expect(typeof sink.log).toBe('function')
    sink.dispose()
  })

  it('returns a noop sink without credentials', () => {
    const sink = createRetentionSink({})
    expect(sink.kind).toBe('noop')
  })

  it('noop sink never touches the rpc', () => {
    const rpc = vi.fn()
    const fakeClient = { rpc } as unknown as Pick<SupabaseClient, 'rpc'>
    const sink = createRetentionSink({}, fakeClient)
    sink.log({
      hashSeed: 'a'.repeat(64),
      emotion: 'joy',
      confidence: 0.5,
      ageBand: null,
      geoOptIn: true,
      ts: 0,
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('supabase sink logs a mapped record via rpc with ISO timestamp', () => {
    const rpc = vi.fn().mockReturnValue({ then: vi.fn(), catch: vi.fn() })
    const fakeClient = { rpc } as unknown as Pick<SupabaseClient, 'rpc'>
    const sink = createRetentionSink({ url: 'https://x.supabase.co', key: 'abc' }, fakeClient)
    const record: RetentionRecord = {
      hashSeed: 'c'.repeat(64),
      emotion: 'surprise',
      confidence: 0.8,
      ageBand: '20-30',
      geoOptIn: true,
      ts: 1234,
    }
    sink.log(record)
    expect(rpc).toHaveBeenCalledWith('log_star', {
      p_hash: 'c'.repeat(64),
      p_emotion: 'surprise',
      p_confidence: 0.8,
      p_age_band: '20-30',
      p_geo_optin: true,
      p_ts: new Date(1234).toISOString(),
    })
    sink.dispose()
  })

  it('supabase sink never logs the nonce or code, only the seed', () => {
    const rpc = vi.fn().mockReturnValue({ then: vi.fn(), catch: vi.fn() })
    const fakeClient = { rpc } as unknown as Pick<SupabaseClient, 'rpc'>
    const sink = createRetentionSink({ url: 'https://x.supabase.co', key: 'abc' }, fakeClient)
    sink.log({
      hashSeed: 'seed123',
      emotion: 'calm',
      confidence: 0.5,
      ageBand: null,
      geoOptIn: false,
      ts: 0,
    })
    const arg = rpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(Object.keys(arg).join(',')).not.toMatch(/nonce|code/)
    expect(arg.p_hash).toBe('seed123')
    sink.dispose()
  })
})

describe('loadRecentStars', () => {
  it('noop sink resolves to an empty list', async () => {
    const sink = createRetentionSink({})
    await expect(sink.loadRecentStars()).resolves.toEqual([])
  })

  it('supabase sink requests a sample and maps valid rows', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { hash: 'a'.repeat(64), emotion: 'joy', confidence: 0.7, ts: '2026-08-01T00:00:00.000Z' },
        { hash: 'not-a-hash', emotion: 'anger', confidence: 0.5, ts: '2026-08-01T00:00:00.000Z' },
      ],
      error: null,
    })
    const fakeClient = { rpc } as unknown as Pick<SupabaseClient, 'rpc'>
    const sink = createRetentionSink({ url: 'https://x.supabase.co', key: 'abc' }, fakeClient)
    const stars = await sink.loadRecentStars(120, 30)
    expect(rpc).toHaveBeenCalledWith('get_recent_stars', { p_limit: 120, p_max_age_days: 30 })
    expect(stars).toHaveLength(1)
    expect(stars[0]).toMatchObject({ hash: 'a'.repeat(64), emotion: 'joy', confidence: 0.7 })
    expect(typeof stars[0].ts).toBe('number')
  })

  it('supabase sink resolves to an empty list when the rpc fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const fakeClient = { rpc } as unknown as Pick<SupabaseClient, 'rpc'>
    const sink = createRetentionSink({ url: 'https://x.supabase.co', key: 'abc' }, fakeClient)
    await expect(sink.loadRecentStars()).resolves.toEqual([])
  })

  it('drops rows with invalid emotion or confidence', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { hash: 'a'.repeat(64), emotion: 'giggle', confidence: 0.7, ts: '2026-08-01T00:00:00.000Z' },
        { hash: 'b'.repeat(64), emotion: 'joy', confidence: 2.5, ts: '2026-08-01T00:00:00.000Z' },
        { hash: 'c'.repeat(64), emotion: 'calm', confidence: 0.5, ts: '2026-08-01T00:00:00.000Z' },
      ],
      error: null,
    })
    const fakeClient = { rpc } as unknown as Pick<SupabaseClient, 'rpc'>
    const sink = createRetentionSink({ url: 'https://x.supabase.co', key: 'abc' }, fakeClient)
    const stars = await sink.loadRecentStars()
    expect(stars).toHaveLength(1)
    expect(stars[0].hash).toBe('c'.repeat(64))
  })
})

describe('createRetentionGate', () => {
  it('passes the first record, blocks within the interval', () => {
    const gate = createRetentionGate(5_000)
    expect(gate(0)).toBe(true)
    expect(gate(1_000)).toBe(false)
    expect(gate(4_999)).toBe(false)
  })

  it('releases after the interval elapses', () => {
    const gate = createRetentionGate(5_000)
    gate(0)
    expect(gate(5_000)).toBe(true)
  })

  it('uses an absolute timestamp, not a per-call delta', () => {
    const gate = createRetentionGate(5_000)
    gate(10_000)
    expect(gate(14_999)).toBe(false)
    expect(gate(15_000)).toBe(true)
  })
})
