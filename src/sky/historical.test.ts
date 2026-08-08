import { describe, it, expect } from 'vitest'
import { projectRecentStars } from './historical'
import type { RecentStar } from '../retention/retention'

function recent(hash: string, ts: number, emotion: RecentStar['emotion'] = 'joy', confidence = 0.7): RecentStar {
  return { hash, emotion, confidence, ts }
}

describe('projectRecentStars', () => {
  it('drops stars timestamped in the future', () => {
    const out = projectRecentStars([recent('a', 500), recent('b', 1200)], 1000)
    expect(out.map((s) => s.hash)).toEqual(['a'])
  })

  it('sorts by recency, most recent first', () => {
    const out = projectRecentStars([recent('a', 500), recent('b', 900), recent('c', 200)], 1000)
    expect(out.map((s) => s.hash)).toEqual(['b', 'a', 'c'])
  })

  it('caps the projected set', () => {
    const stars = Array.from({ length: 10 }, (_, i) => recent(String(i).padStart(2, '0'), 100 + i))
    const out = projectRecentStars(stars, 1000, 3)
    expect(out).toHaveLength(3)
  })

  it('clamps confidence into [0,1]', () => {
    const out = projectRecentStars([recent('a', 100, 'anger', 1.4), recent('b', 50, 'joy', -0.2)], 1000)
    expect(out.find((s) => s.hash === 'a')?.confidence).toBe(1)
    expect(out.find((s) => s.hash === 'b')?.confidence).toBe(0)
  })

  it('computes a non-negative age', () => {
    const out = projectRecentStars([recent('a', 750, 'calm', 0.5)], 1000)
    expect(out[0].ageMs).toBe(250)
    expect(out[0].emotion).toBe('calm')
    expect(out[0].hash).toBe('a')
  })
})
