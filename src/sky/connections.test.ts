import { describe, it, expect } from 'vitest'
import { buildLines } from './connections'

function s(id: string, x: number, y: number, z: number) {
  return { id, hash: id.padEnd(64, '0'), emotion: 'calm' as const, confidence: 0.5, birthTime: 0, x, y, z }
}

describe('buildLines', () => {
  it('connects close stars and respects maxDist', () => {
    const stars = [s('a', 0, 0, 0), s('b', 1, 0, 0), s('c', 6, 0, 0)]
    const lines = buildLines(stars, 2.5, 4)
    expect(lines).toHaveLength(1) // only a-b
    expect(lines[0].opacity).toBeGreaterThan(0)
  })

  it('caps neighbors per star at k', () => {
    const stars = [
      s('center', 0, 0, 0),
      s('n1', 1, 0, 0),
      s('n2', 1.2, 0, 0),
      s('n3', 1.4, 0, 0),
      s('n4', 1.6, 0, 0),
      s('n5', 1.8, 0, 0),
    ]
    const lines = buildLines(stars, 3, 2)
    // center has at most 2 connections
    const center = lines.filter((l) => l.a === 'center' || l.b === 'center')
    expect(center.length).toBeLessThanOrEqual(2)
  })

  it('does not connect a star to itself and dedupes pairs', () => {
    const stars = [s('a', 0, 0, 0), s('b', 1, 0, 0)]
    const lines = buildLines(stars, 2.5, 4)
    for (const l of lines) expect(l.a).not.toBe(l.b)
    expect(lines).toHaveLength(1)
  })

  it('fades opacity with distance', () => {
    const stars = [s('a', 0, 0, 0), s('b', 1, 0, 0), s('c', 2, 0, 0)]
    const lines = buildLines(stars, 2.5, 4)
    const ab = lines.find((l) => l.a === 'a' && l.b === 'b')!
    const ac = lines.find((l) => l.a === 'a' && l.b === 'c')!
    expect(ab.opacity).toBeGreaterThan(ac.opacity)
  })
})
