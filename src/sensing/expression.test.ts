import { describe, it, expect } from 'vitest'
import { readExpressionFromBlendshapes } from './expression'

const smile = (v: number) => ({ mouthSmileLeft: v, mouthSmileRight: v })

describe('readExpressionFromBlendshapes', () => {
  it('returns low-confidence neutral when nothing is activated', () => {
    const r = readExpressionFromBlendshapes({})
    expect(r.emotion).toBe('neutral')
    expect(r.confidence).toBeLessThan(0.5)
  })

  it('treats tiny blendshape noise as neutral', () => {
    const r = readExpressionFromBlendshapes(smile(0.05))
    expect(r.emotion).toBe('neutral')
  })

  it('detects joy from a wide smile with squinted eyes', () => {
    const r = readExpressionFromBlendshapes({
      ...smile(0.9),
      eyeSquintLeft: 0.6,
      eyeSquintRight: 0.6,
      jawOpen: 0.1,
    })
    expect(r.emotion).toBe('joy')
    expect(r.confidence).toBeGreaterThan(0.5)
  })

  it('detects surprise from an open jaw with wide eyes', () => {
    const r = readExpressionFromBlendshapes({
      jawOpen: 0.8,
      eyeWideLeft: 0.5,
      eyeWideRight: 0.5,
      browInnerUp: 0.5,
    })
    expect(r.emotion).toBe('surprise')
  })

  it('detects anger from lowered brows and pressed lips', () => {
    const r = readExpressionFromBlendshapes({
      browDownLeft: 0.7,
      browDownRight: 0.7,
      mouthPressLeft: 0.6,
      mouthPressRight: 0.6,
    })
    expect(r.emotion).toBe('anger')
  })

  it('detects sadness from frowning and raised inner brows', () => {
    const r = readExpressionFromBlendshapes({
      mouthFrownLeft: 0.6,
      mouthFrownRight: 0.6,
      browInnerUp: 0.4,
    })
    expect(r.emotion).toBe('sadness')
  })

  it('detects calm from a gentle smile', () => {
    const r = readExpressionFromBlendshapes(smile(0.3))
    expect(r.emotion).toBe('calm')
  })

  it('reads an asymmetric smile from a single lip corner', () => {
    const r = readExpressionFromBlendshapes({ mouthSmileLeft: 0.9 })
    expect(r.emotion).toBe('joy')
  })

  it('always returns a confidence within [0, 1]', () => {
    const r = readExpressionFromBlendshapes({ jawOpen: 1, eyeWideLeft: 1, eyeWideRight: 1, browInnerUp: 1 })
    expect(r.confidence).toBeGreaterThanOrEqual(0)
    expect(r.confidence).toBeLessThanOrEqual(1)
  })
})
