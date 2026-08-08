import { describe, it, expect } from 'vitest'
import { hashToPosition, PRNG, seedFromHash } from './remotePosition'

describe('seedFromHash', () => {
  it('is stable for the same hash', () => {
    expect(seedFromHash('a'.repeat(64))).toBe(seedFromHash('a'.repeat(64)))
  })

  it('differs for different hashes', () => {
    expect(seedFromHash('a'.repeat(64))).not.toBe(seedFromHash('b'.repeat(64)))
  })
})

describe('PRNG', () => {
  it('is deterministic for the same seed and varies across seeds', () => {
    const s1 = PRNG(42)
    const s2 = PRNG(42)
    expect(s1()).toBe(s2())
    expect(PRNG(43)()).not.toBe(s1())
  })
})

describe('hashToPosition', () => {
  it('maps the same hash to the same position (two clients see the same star)', () => {
    const a = hashToPosition('ff'.repeat(32))
    const b = hashToPosition('ff'.repeat(32))
    expect(a).toEqual(b)
  })

  it('maps different hashes to different positions', () => {
    const a = hashToPosition('00'.repeat(32))
    const b = hashToPosition('11'.repeat(32))
    expect(a).not.toEqual(b)
  })

  it('places stars on the sphere of the given radius', () => {
    const radius = 3.2
    const pos = hashToPosition('abc'.padEnd(64, '0'), radius)
    const norm = Math.hypot(pos.x, pos.y, pos.z)
    expect(norm).toBeCloseTo(radius, 2)
  })

  it('returns values inside the viewable shell (norm in [0, radius])', () => {
    for (let i = 0; i < 50; i++) {
      const pos = hashToPosition(String(i).padStart(64, '0'))
      const norm = Math.hypot(pos.x, pos.y, pos.z)
      expect(norm).toBeLessThanOrEqual(3.21)
      expect(norm).toBeGreaterThan(0)
    }
  })
})
