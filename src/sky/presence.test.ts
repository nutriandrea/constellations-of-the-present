import { describe, it, expect } from 'vitest'
import { createStarRegistry, prune } from './presence'
import type { RemoteStar } from '../net/StarChannel'

function star(id: string, birthTime: number): RemoteStar {
  return { id, hash: `${id}${'a'.repeat(63)}`.slice(0, 64), emotion: 'joy', confidence: 0.7, birthTime }
}

describe('createStarRegistry', () => {
  it('starts empty', () => {
    const r = createStarRegistry()
    expect(r.list()).toHaveLength(0)
  })

  it('adds and updates by id', () => {
    const r = createStarRegistry()
    r.apply(star('p1', 1000), 1000)
    expect(r.list()).toHaveLength(1)
    r.apply({ ...star('p1', 1000), confidence: 0.9 }, 2000)
    expect(r.list()[0].confidence).toBe(0.9)
    expect(r.list()).toHaveLength(1)
  })

  it('does not count a client twice when its own star is reflected back', () => {
    const r = createStarRegistry()
    r.apply(star('self', 1000), 1000)
    r.ignore('self')
    expect(r.list()).toHaveLength(0)
  })
})

describe('prune', () => {
  it('removes stars not seen within the ttl', () => {
    const r = createStarRegistry()
    r.apply(star('p1', 0), 100)
    r.apply(star('p2', 0), 100)
    const removed = prune(r, 100 + 5_000, 4_000)
    expect(removed).toContain('p1')
    expect(removed).toContain('p2')
    expect(r.list()).toHaveLength(0)
  })

  it('keeps stars refreshed inside the ttl', () => {
    const r = createStarRegistry()
    r.apply(star('p1', 0), 100)
    r.apply(star('p1', 0), 3_500) // heartbeat before expiry
    const removed = prune(r, 3_600, 4_000)
    expect(removed).not.toContain('p1')
    expect(r.list()).toHaveLength(1)
  })

  it('keeps a live star visible across the default ttl between heartbeats', () => {
    const r = createStarRegistry()
    r.apply(star('p1', 0), 0)
    // heartbeat every 5s -> a 20s gap is still inside the default ttl (30s)
    r.apply(star('p1', 0), 20_000)
    const removed = prune(r, 20_100)
    expect(removed).not.toContain('p1')
    expect(r.list()).toHaveLength(1)
  })
})
