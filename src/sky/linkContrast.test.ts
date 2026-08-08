import { describe, expect, it } from 'vitest'
import { densityDamping, linkContrast } from './linkContrast'

describe('linkContrast', () => {
  it('un legame assente resta invisibile', () => {
    expect(linkContrast(0, 'dark')).toBe(0)
    expect(linkContrast(0, 'light')).toBe(0)
  })

  it('è monotona crescente', () => {
    for (const ambient of ['dark', 'light'] as const) {
      let prev = -1
      for (let x = 0.01; x <= 1; x += 0.01) {
        const v = linkContrast(x, ambient)
        expect(v).toBeGreaterThanOrEqual(prev)
        prev = v
      }
    }
  })

  it('resta sempre in [0,1]', () => {
    for (let x = 0; x <= 1; x += 0.05) {
      for (const r of [0, 0.5, 1]) {
        for (const ambient of ['dark', 'light'] as const) {
          const v = linkContrast(x, ambient, r)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('su ambiente chiaro i fili sono più marcati', () => {
    for (const x of [0.05, 0.3, 0.7, 1]) {
      expect(linkContrast(x, 'light')).toBeGreaterThan(linkContrast(x, 'dark'))
    }
  })

  it('solleva i legami deboli sopra la soglia di visibilità', () => {
    expect(linkContrast(0.02, 'dark')).toBeGreaterThan(0.08)
    expect(linkContrast(0.02, 'light')).toBeGreaterThan(0.2)
  })

  it('non supera il tetto del profilo', () => {
    expect(linkContrast(1, 'dark')).toBeCloseTo(0.62, 5)
    expect(linkContrast(1, 'light')).toBeCloseTo(0.92, 5)
  })

  it('un cielo affollato abbassa tutti i fili', () => {
    expect(linkContrast(0.8, 'dark', 1)).toBeLessThan(linkContrast(0.8, 'dark', 0))
  })
})

describe('densityDamping', () => {
  it('è 1 a cielo vuoto e non scende sotto 0.68', () => {
    expect(densityDamping(0)).toBe(1)
    expect(densityDamping(1)).toBeCloseTo(0.68, 5)
  })

  it('accetta valori fuori scala senza rompersi', () => {
    expect(densityDamping(-1)).toBe(1)
    expect(densityDamping(4)).toBeCloseTo(0.68, 5)
  })
})
