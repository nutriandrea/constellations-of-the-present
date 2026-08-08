import { describe, it, expect } from 'vitest'
import { mapLevelToGain } from './ambient'

describe('mapLevelToGain', () => {
  it('returns ~0 for level at or below minLevel', () => {
    expect(mapLevelToGain(0, { minLevel: 0.02, maxLevel: 0.6, maxGain: 0.4 })).toBe(0)
    expect(mapLevelToGain(0.02, { minLevel: 0.02, maxLevel: 0.6, maxGain: 0.4 })).toBe(0)
  })

  it('saturates at maxGain for level >= maxLevel', () => {
    expect(mapLevelToGain(0.6, { minLevel: 0.02, maxLevel: 0.6, maxGain: 0.4 })).toBeCloseTo(0.4)
    expect(mapLevelToGain(1, { minLevel: 0.02, maxLevel: 0.6, maxGain: 0.4 })).toBeCloseTo(0.4)
  })

  it('maps monotonically between min and max', () => {
    const opts = { minLevel: 0.02, maxLevel: 0.6, maxGain: 0.4 }
    let prev = -1
    for (let level = 0.02; level <= 0.6; level += 0.05) {
      const gain = mapLevelToGain(level, opts)
      expect(gain).toBeGreaterThanOrEqual(prev)
      prev = gain
    }
  })

  it('returns a scaled midpoint inside the range', () => {
    const opts = { minLevel: 0, maxLevel: 1, maxGain: 1 }
    expect(mapLevelToGain(0.5, opts)).toBeCloseTo(0.5)
  })
})
