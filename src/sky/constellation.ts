import type { Connection } from './connections'
import { pairKey } from './connections'

export interface LiveLink extends Connection {
  /** 0 → invisibile, 1 → completamente disegnato */
  alpha: number
}

export interface LinkAnimator {
  /** Aggiorna la topologia (chiamata a bassa frequenza). */
  sync: (connections: Connection[]) => void
  /** Avanza le dissolvenze di dtMs e restituisce i fili visibili. */
  step: (dtMs: number) => LiveLink[]
  size: () => number
}

interface Entry {
  connection: Connection
  alpha: number
  target: number
}

/**
 * I fili non appaiono e spariscono di colpo: si disegnano e si spengono.
 * Le costellazioni si formano davanti a chi guarda invece di lampeggiare
 * a ogni frame in cui una stella entra o esce dal raggio.
 */
export function createLinkAnimator(fadeInMs = 900, fadeOutMs = 1400): LinkAnimator {
  const entries = new Map<string, Entry>()

  return {
    sync(connections: Connection[]) {
      const present = new Set<string>()
      for (const connection of connections) {
        const key = pairKey(connection.a, connection.b)
        present.add(key)
        const existing = entries.get(key)
        if (existing) {
          existing.connection = connection
          existing.target = 1
        } else {
          entries.set(key, { connection, alpha: 0, target: 1 })
        }
      }
      for (const [key, entry] of entries) {
        if (!present.has(key)) entry.target = 0
      }
    },
    step(dtMs: number) {
      const live: LiveLink[] = []
      const inStep = dtMs / Math.max(1, fadeInMs)
      const outStep = dtMs / Math.max(1, fadeOutMs)

      for (const [key, entry] of entries) {
        if (entry.target > entry.alpha) {
          entry.alpha = Math.min(1, entry.alpha + inStep)
        } else if (entry.target < entry.alpha) {
          entry.alpha = Math.max(0, entry.alpha - outStep)
        }
        if (entry.alpha <= 0 && entry.target === 0) {
          entries.delete(key)
          continue
        }
        // Ease-out: il filo prende corpo in fretta e poi si assesta.
        const eased = entry.alpha * entry.alpha * (3 - 2 * entry.alpha)
        live.push({ ...entry.connection, alpha: eased })
      }

      live.sort((p, q) => q.opacity * q.alpha - p.opacity * p.alpha)
      return live
    },
    size() {
      return entries.size
    },
  }
}
