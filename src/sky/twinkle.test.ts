import { describe, expect, it } from 'vitest'
import { twinkle, twinklePersonality } from './twinkle'

describe('twinklePersonality', () => {
  it('è deterministico per lo stesso seed', () => {
    expect(twinklePersonality(1234)).toEqual(twinklePersonality(1234))
  })

  it('dà caratteri diversi a seed diversi', () => {
    const a = twinklePersonality(11)
    const b = twinklePersonality(12)
    expect(a.rate).not.toBeCloseTo(b.rate, 3)
    expect(a.phase).not.toBeCloseTo(b.phase, 3)
  })

  it('resta nei limiti dichiarati', () => {
    for (let seed = 1; seed < 400; seed++) {
      const p = twinklePersonality(seed)
      expect(p.rate).toBeGreaterThanOrEqual(0.28)
      expect(p.rate).toBeLessThanOrEqual(1.06)
      expect(p.phase).toBeGreaterThanOrEqual(0)
      expect(p.phase).toBeLessThanOrEqual(Math.PI * 2)
      expect(p.depth).toBeGreaterThanOrEqual(0.35)
      expect(p.depth).toBeLessThanOrEqual(1)
    }
  })
})

describe('twinkle', () => {
  it('resta vicino a 1 e nei limiti su tutta la durata', () => {
    for (const seed of [1, 57, 903, 4211]) {
      for (let ms = 0; ms < 60_000; ms += 37) {
        const { intensity, size } = twinkle(ms, 0.4, seed)
        expect(intensity).toBeGreaterThanOrEqual(0.55)
        expect(intensity).toBeLessThanOrEqual(1.45)
        expect(size).toBeGreaterThanOrEqual(0.7)
        expect(size).toBeLessThanOrEqual(1.3)
      }
    }
  })

  it('la dimensione varia meno dell’intensità', () => {
    let maxI = 0
    let maxS = 0
    for (let ms = 0; ms < 30_000; ms += 50) {
      const { intensity, size } = twinkle(ms, 0.2, 77)
      maxI = Math.max(maxI, Math.abs(intensity - 1))
      maxS = Math.max(maxS, Math.abs(size - 1))
    }
    expect(maxS).toBeLessThan(maxI)
  })

  it('una lettura incerta scintilla più di una sicura', () => {
    const amp = (confidence: number) => {
      let max = 0
      for (let ms = 0; ms < 30_000; ms += 50) {
        max = Math.max(max, Math.abs(twinkle(ms, confidence, 321).intensity - 1))
      }
      return max
    }
    expect(amp(0.1)).toBeGreaterThan(amp(0.95))
  })

  it('con prefers-reduced-motion è immobile nel tempo', () => {
    const a = twinkle(0, 0.5, 42, true)
    const b = twinkle(999_999, 0.5, 42, true)
    expect(a).toEqual(b)
    expect(a.size).toBe(1)
    expect(a.intensity).toBeLessThanOrEqual(1)
    expect(a.intensity).toBeGreaterThan(0.8)
  })

  it('è deterministico: stesso istante e seed → stesso valore', () => {
    expect(twinkle(5000, 0.6, 9)).toEqual(twinkle(5000, 0.6, 9))
  })
})
