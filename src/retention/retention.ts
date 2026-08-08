import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { EmotionBucket } from '../sensing/expression'

export interface RetentionRecord {
  hashSeed: string
  emotion: EmotionBucket
  confidence: number
  ageBand: string | null
  geoOptIn: boolean
  ts: number
}

export interface RetentionSink {
  kind: 'supabase' | 'noop'
  log(record: RetentionRecord): void
  dispose(): void
}

export interface RetentionEnv {
  url?: string
  key?: string
}

export function pickRetentionKind(env: RetentionEnv): 'supabase' | 'noop' {
  if (env.url && env.key) return 'supabase'
  return 'noop'
}

export type RetentionClient = Pick<SupabaseClient, 'rpc'>

export function createSupabaseRetentionSink(url: string, key: string, client?: RetentionClient): RetentionSink {
  const supabase = client ?? createClient(url, key)
  return {
    kind: 'supabase',
    log(record) {
      void Promise.resolve(
        supabase.rpc('log_star', {
          p_hash: record.hashSeed,
          p_emotion: record.emotion,
          p_confidence: record.confidence,
          p_age_band: record.ageBand,
          p_geo_optin: record.geoOptIn,
          p_ts: new Date(record.ts).toISOString(),
        }),
      ).catch((error: unknown) => {
        if (import.meta.env.DEV) console.error('retention log failed:', error)
      })
    },
    dispose() {
      /* no persistent connection to close */
    },
  }
}

export function createNoopRetentionSink(): RetentionSink {
  return {
    kind: 'noop',
    log() {
      /* nothing leaves the device */
    },
    dispose() {
      /* noop */
    },
  }
}

export function createRetentionSink(env: RetentionEnv, client?: RetentionClient): RetentionSink {
  switch (pickRetentionKind(env)) {
    case 'supabase':
      return createSupabaseRetentionSink(env.url!, env.key!, client)
    default:
      return createNoopRetentionSink()
  }
}

export function createRetentionGate(minIntervalMs = 5_000): (now: number) => boolean {
  let lastLogAt = -Infinity
  return (now: number): boolean => {
    if (now - lastLogAt < minIntervalMs) return false
    lastLogAt = now
    return true
  }
}
