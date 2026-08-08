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

/** Stella storica restituita dal campione anonimo: solo hash, emozione, confidenza, timestamp. */
export interface RecentStar {
  hash: string
  emotion: EmotionBucket
  confidence: number
  ts: number
}

export interface RetentionSink {
  kind: 'supabase' | 'noop'
  log(record: RetentionRecord): void
  loadRecentStars(limit?: number, maxAgeDays?: number): Promise<RecentStar[]>
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

const EMOTIONS: readonly EmotionBucket[] = ['joy', 'calm', 'sadness', 'anger', 'surprise', 'neutral']
const HASH_RE = /^[0-9a-f]{64}$/

function isRecentStarRow(value: unknown): value is { hash: string; emotion: string; confidence: number; ts: string } {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.hash === 'string' &&
    HASH_RE.test(row.hash) &&
    typeof row.emotion === 'string' &&
    (EMOTIONS as readonly string[]).includes(row.emotion) &&
    typeof row.confidence === 'number' &&
    Number.isFinite(row.confidence) &&
    row.confidence >= 0 &&
    row.confidence <= 1 &&
    typeof row.ts === 'string' &&
    !Number.isNaN(Date.parse(row.ts))
  )
}

function mapRecentStar(row: { hash: string; emotion: string; confidence: number; ts: string }): RecentStar {
  return {
    hash: row.hash,
    emotion: row.emotion as EmotionBucket,
    confidence: row.confidence,
    ts: Date.parse(row.ts),
  }
}

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
    async loadRecentStars(limit = 200, maxAgeDays = 1) {
      try {
        const { data, error } = await supabase.rpc('get_recent_stars', {
          p_limit: limit,
          p_max_age_days: maxAgeDays,
        })
        if (error) {
          if (import.meta.env.DEV) console.error('load recent stars failed:', error)
          return []
        }
        if (!Array.isArray(data)) return []
        return data.filter(isRecentStarRow).map(mapRecentStar)
      } catch (error) {
        if (import.meta.env.DEV) console.error('load recent stars failed:', error)
        return []
      }
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
    async loadRecentStars() {
      return []
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
