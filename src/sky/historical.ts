import type { EmotionBucket } from '../sensing/expression'
import type { RecentStar } from '../retention/retention'

export interface HistoricalStar {
  hash: string
  emotion: EmotionBucket
  confidence: number
  ageMs: number
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Proietta il campione di stelle recenti per il rendering: scarta i record con
 * timestamp futuro, ordina per recency e limita il numero. `now` è il clock di
 * riferimento (Date.now()).
 */
export function projectRecentStars(stars: RecentStar[], now: number, max = 200): HistoricalStar[] {
  return stars
    .filter((star) => star.ts <= now)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, max)
    .map((star) => ({
      hash: star.hash,
      emotion: star.emotion,
      confidence: clamp01(star.confidence),
      ageMs: Math.max(0, now - star.ts),
    }))
}
