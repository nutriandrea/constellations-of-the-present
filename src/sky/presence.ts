import type { RemoteStar } from '../net/StarChannel'

// Deve superare il publish interval (5s) per evitare flicker dei remoti.
export const REMOTE_TTL_MS = 10_000
export const MAX_REMOTE_STARS = 60

export interface TrackedStar extends RemoteStar {
  lastSeen: number
}

export interface StarRegistry {
  apply(star: RemoteStar, now: number): void
  ignore(id: string): void
  remove(id: string): void
  list(): TrackedStar[]
  size(): number
}

export function createStarRegistry(ignored = new Set<string>(), maxStars = MAX_REMOTE_STARS): StarRegistry {
  const stars = new Map<string, TrackedStar>()

  return {
    apply(star: RemoteStar, now: number) {
      if (ignored.has(star.id)) return
      const existing = stars.get(star.id)
      if (existing) {
        stars.set(star.id, { ...existing, ...star, lastSeen: now })
        return
      }
      if (stars.size >= maxStars) {
        let oldest: string | null = null
        let oldestSeen = Infinity
        for (const [id, tracked] of stars) {
          if (tracked.lastSeen < oldestSeen) {
            oldestSeen = tracked.lastSeen
            oldest = id
          }
        }
        if (oldest) stars.delete(oldest)
      }
      stars.set(star.id, { ...star, lastSeen: now })
    },
    ignore(id: string) {
      ignored.add(id)
      stars.delete(id)
    },
    remove(id: string) {
      stars.delete(id)
    },
    list() {
      return [...stars.values()]
    },
    size() {
      return stars.size
    },
  }
}

export function prune(registry: StarRegistry, now: number, ttl = REMOTE_TTL_MS): string[] {
  const removed: string[] = []
  for (const star of registry.list()) {
    if (now - star.lastSeen > ttl) {
      removed.push(star.id)
      registry.remove(star.id)
    }
  }
  return removed
}
