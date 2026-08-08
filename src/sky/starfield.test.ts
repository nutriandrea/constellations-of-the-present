import { describe, it, expect } from 'vitest'
import { buildStarfield } from './starfield'

describe('buildStarfield', () => {
  it('is deterministic for the same seed', () => {
    const a = buildStarfield(200, 50, 20260808)
    const b = buildStarfield(200, 50, 20260808)
    expect(a.positions).toEqual(b.positions)
    expect(a.sizes).toEqual(b.sizes)
  })

  it('varies across seeds', () => {
    const a = buildStarfield(200, 50, 111)
    const b = buildStarfield(200, 50, 222)
    expect(a.positions).not.toEqual(b.positions)
  })

  it('produces the requested number of stars', () => {
    const { positions, sizes } = buildStarfield(1200, 50, 7)
    expect(positions.length / 3).toBe(1200)
    expect(sizes.length).toBe(1200)
  })

  it('places every star inside the shell radius', () => {
    const radius = 55
    const { positions } = buildStarfield(300, radius, 99)
    for (let i = 0; i < positions.length; i += 3) {
      const norm = Math.hypot(positions[i], positions[i + 1], positions[i + 2])
      expect(norm).toBeLessThanOrEqual(radius)
      expect(norm).toBeGreaterThan(0)
    }
  })

  it('keeps sizes within the given range', () => {
    const { sizes } = buildStarfield(300, 50, 5)
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(0.4)
      expect(size).toBeLessThanOrEqual(1.6)
    }
  })
})
