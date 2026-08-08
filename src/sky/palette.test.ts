import { describe, expect, it } from 'vitest'
import {
  EMOTION_PALETTE,
  luminance,
  mixGamma,
  normalizeLuma,
  sampleGradient,
  srgbToLinear,
  linearToSrgb,
  type PaletteEmotion,
} from './palette'

const EMOTIONS: PaletteEmotion[] = ['joy', 'calm', 'sadness', 'anger', 'surprise', 'neutral']

describe('palette', () => {
  it('srgb <-> linear round trip', () => {
    for (const v of [0, 0.02, 0.2, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 5)
    }
  })

  it('mixGamma is brighter than naive sRGB mixing in the middle', () => {
    const a = { r: 1, g: 0, b: 0 }
    const b = { r: 0, g: 0, b: 1 }
    const mixed = mixGamma(a, b, 0.5)
    expect(mixed.r).toBeGreaterThan(0.5)
    expect(mixed.b).toBeGreaterThan(0.5)
  })

  it('mixGamma returns endpoints exactly', () => {
    const a = { r: 0.2, g: 0.4, b: 0.6 }
    const b = { r: 0.9, g: 0.1, b: 0.3 }
    expect(mixGamma(a, b, 0).r).toBeCloseTo(a.r, 4)
    expect(mixGamma(a, b, 1).b).toBeCloseTo(b.b, 4)
  })

  it('normalizeLuma pulls colors toward the target', () => {
    const dark = normalizeLuma({ r: 0.1, g: 0.1, b: 0.12 }, 0.6, 1)
    expect(luminance(dark)).toBeGreaterThan(0.3)
  })

  it('all emotions share a similar perceived luminance', () => {
    const lumas = EMOTIONS.map((e) => luminance(EMOTION_PALETTE[e]))
    const spread = Math.max(...lumas) - Math.min(...lumas)
    expect(spread).toBeLessThan(0.12)
  })

  it('emotions remain visually distinct', () => {
    for (let i = 0; i < EMOTIONS.length; i++) {
      for (let j = i + 1; j < EMOTIONS.length; j++) {
        const a = EMOTION_PALETTE[EMOTIONS[i]!]
        const b = EMOTION_PALETTE[EMOTIONS[j]!]
        const d = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)
        expect(d).toBeGreaterThan(0.04)
      }
    }
  })

  it('gradient stays inside gamut and is continuous', () => {
    let prev = sampleGradient(0)
    for (let t = 0.02; t <= 1; t += 0.02) {
      const c = sampleGradient(t)
      for (const v of [c.r, c.g, c.b]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      const jump = Math.abs(c.r - prev.r) + Math.abs(c.g - prev.g) + Math.abs(c.b - prev.b)
      expect(jump).toBeLessThan(0.15)
      prev = c
    }
  })
})
