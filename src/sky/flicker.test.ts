import { describe, it, expect } from 'vitest'
import { breathingFlicker } from './flicker'

describe('breathingFlicker', () => {
  it('is deterministic for the same (now, confidence, seed)', () => {
    expect(breathingFlicker(1_000, 0.5, 1234)).toBeCloseTo(breathingFlicker(1_000, 0.5, 1234))
  })

  it('is bounded in [0.3, 1.7] for any time/confidence', () => {
    for (let t = 0; t <= 20_000; t += 1_337) {
      for (const confidence of [0, 0.25, 0.5, 0.75, 1]) {
        const value = breathingFlicker(t, confidence, 7)
        expect(value).toBeGreaterThanOrEqual(0.3)
        expect(value).toBeLessThanOrEqual(1.7)
      }
    }
  })

  it('breathes symmetrically around 1 (dims below and brightens above)', () => {
    let min = Infinity
    let max = -Infinity
    for (let t = 0; t <= 30_000; t += 250) {
      const v = breathingFlicker(t, 0.3, 99)
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
    expect(min).toBeLessThan(0.99)
    expect(max).toBeGreaterThan(1.01)
    expect(max - min).toBeGreaterThan(0.2)
  })

  it('flickers less at high confidence', () => {
    const lowConfidence = spread(0.1)
    const highConfidence = spread(0.95)
    expect(highConfidence).toBeLessThan(lowConfidence)
  })

  it('returns ~1 when reduced motion is enabled', () => {
    const a = breathingFlicker(0, 0.2, 5, true)
    const b = breathingFlicker(10_000, 0.8, 5, true)
    expect(Math.abs(a - 1)).toBeLessThan(0.02)
    expect(Math.abs(b - 1)).toBeLessThan(0.02)
  })
})

function spread(confidence: number): number {
  let min = Infinity
  let max = -Infinity
  for (let t = 0; t <= 20_000; t += 400) {
    const v = breathingFlicker(t, confidence, 42)
    min = Math.min(min, v)
    max = Math.max(max, v)
  }
  return max - min
}
