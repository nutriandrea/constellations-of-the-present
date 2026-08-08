import { describe, it, expect } from 'vitest'
import { readExpression } from './expression'

function face(mouth: Partial<Record<number, number[]>>): number[][] {
  const landmarks: number[][] = []
  for (let i = 0; i < 478; i++) landmarks.push([0.5, 0.5, 0])
  for (const [i, pt] of Object.entries(mouth)) {
    if (pt) landmarks[Number(i)] = pt
  }
  return landmarks
}

describe('readExpression', () => {
  it('returns low-confidence neutral for empty input', () => {
    const r = readExpression([])
    expect(r.emotion).toBe('neutral')
    expect(r.confidence).toBeLessThan(0.5)
  })

  it('detects joy from raised lip corners and closed mouth', () => {
    const lm = face({
      61: [0.30, 0.42],
      291: [0.70, 0.42],
      13: [0.50, 0.55],
      14: [0.50, 0.56],
    })
    // corners above top lip => smile ratio > 0.55
    expect(readExpression(lm).emotion).toBe('joy')
  })

  it('detects surprise from a wide-open mouth', () => {
    const lm = face({
      61: [0.40, 0.5],
      291: [0.60, 0.5],
      13: [0.50, 0.30],
      14: [0.50, 0.85],
    })
    expect(readExpression(lm).emotion).toBe('surprise')
  })

  it('detects anger from dropped brows', () => {
    const lm = face({
      21: [0.40, 0.70],
      22: [0.60, 0.70],
      33: [0.45, 0.20],
      61: [0.42, 0.60],
      291: [0.58, 0.60],
      13: [0.50, 0.62],
      14: [0.50, 0.63],
    })
    expect(readExpression(lm).emotion).toBe('anger')
  })

  it('detects calm from a gentle smile', () => {
    const lm = face({
      61: [0.35, 0.54],
      291: [0.65, 0.54],
      13: [0.50, 0.58],
      14: [0.50, 0.59],
    })
    expect(readExpression(lm).emotion).toBe('calm')
  })
})
