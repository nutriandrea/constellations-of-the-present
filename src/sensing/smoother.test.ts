import { describe, it, expect } from 'vitest'
import { createEmotionSmoother } from './smoother'
import type { ExpressionReading } from './expression'

const neutral: ExpressionReading = { emotion: 'neutral', confidence: 0.4 }
const joy: ExpressionReading = { emotion: 'joy', confidence: 0.9 }

describe('createEmotionSmoother', () => {
  it('starts neutral', () => {
    const s = createEmotionSmoother()
    expect(s.current().emotion).toBe('neutral')
  })

  it('does not commit from a single frame', () => {
    const s = createEmotionSmoother()
    expect(s.push(joy).emotion).toBe('neutral')
  })

  it('ignores a single stray joy frame', () => {
    const s = createEmotionSmoother()
    s.push(neutral)
    s.push(neutral)
    expect(s.push(joy).emotion).toBe('neutral')
    s.push(neutral)
    expect(s.push(neutral).emotion).toBe('neutral')
  })

  it('switches to joy only after the emotion is stable across the window', () => {
    const s = createEmotionSmoother()
    s.push(neutral)
    s.push(neutral)
    s.push(joy)
    expect(s.push(joy).emotion).toBe('neutral') // held
    expect(s.push(joy).emotion).toBe('joy') // committed
  })

  it('switches back to neutral with the same stability rule', () => {
    const s = createEmotionSmoother()
    for (let i = 0; i < 5; i++) s.push(joy)
    expect(s.push(joy).emotion).toBe('joy')
    for (let i = 0; i < 5; i++) s.push(neutral)
    expect(s.current().emotion).toBe('neutral')
  })

  it('reports the median confidence of the window after commit', () => {
    const s = createEmotionSmoother()
    s.push(neutral) // 0.4
    s.push(neutral) // 0.4
    s.push(joy) // 0.9
    s.push(joy) // 0.9
    const r = s.push(joy) // 0.9 -> commit
    expect(r.emotion).toBe('joy')
    expect(r.confidence).toBe(0.9)
  })

  it('reset restores neutral', () => {
    const s = createEmotionSmoother()
    for (let i = 0; i < 5; i++) s.push(joy)
    expect(s.push(joy).emotion).toBe('joy')
    s.reset()
    expect(s.push(joy).emotion).toBe('neutral')
  })

  it('clamps confidence to [0,1]', () => {
    const s = createEmotionSmoother()
    for (let i = 0; i < 5; i++) s.push({ emotion: 'anger', confidence: 1.4 })
    expect(s.current().confidence).toBeLessThanOrEqual(1)
    for (let i = 0; i < 5; i++) s.push({ emotion: 'sadness', confidence: -0.2 })
    expect(s.current().confidence).toBeGreaterThanOrEqual(0)
  })
})
