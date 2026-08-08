import { describe, it, expect } from 'vitest'
import { starSizeForDuration, flickerForConfidence, hueForEmotion, makeMomentHash } from './star'
import type { EmotionBucket } from '../sensing/expression'

describe('starSizeForDuration', () => {
  it('grows over time and caps at 1.2x base', () => {
    expect(starSizeForDuration(0, 0.22)).toBeCloseTo(0.22)
    expect(starSizeForDuration(30_000, 0.22)).toBeGreaterThan(0.22)
    expect(starSizeForDuration(90_000, 0.22)).toBeLessThan(0.22 * 1.25)
  })
})

describe('flickerForConfidence', () => {
  it('flickers more at low confidence', () => {
    expect(flickerForConfidence(0.2, 0.15)).toBeGreaterThan(flickerForConfidence(0.9, 0.15))
  })
})

describe('hueForEmotion', () => {
  it('maps emotions to distinct hues', () => {
    const emotions: EmotionBucket[] = ['joy', 'calm', 'sadness', 'anger']
    expect(new Set(emotions.map(hueForEmotion)).size).toBe(4)
  })
})

describe('makeMomentHash (display helper)', () => {
  it('is stable for the same seed+nonce', () => {
    expect(makeMomentHash('abcd', '1234')).toBe(makeMomentHash('abcd', '1234'))
  })
})
