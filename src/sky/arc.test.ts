import { describe, expect, it } from 'vitest'
import { arcPoint, drawReveal, keySeed, pulse, pulsePhase, taper } from './arc'

const A = { x: -1, y: 0, z: 0 }
const B = { x: 1, y: 0.5, z: 0 }

describe('arcPoint', () => {
  it('parte da a e finisce in b', () => {
    const p0 = arcPoint(A, B, 0)
    const p1 = arcPoint(A, B, 1)
    expect(p0.x).toBeCloseTo(A.x)
    expect(p0.y).toBeCloseTo(A.y)
    expect(p1.x).toBeCloseTo(B.x)
    expect(p1.y).toBeCloseTo(B.y)
  })

  it('si incurva verso l esterno rispetto alla corda', () => {
    const mid = arcPoint(A, B, 0.5)
    const chordMid = { x: 0, y: 0.25, z: 0 }
    const deviation = Math.hypot(mid.x - chordMid.x, mid.y - chordMid.y, mid.z - chordMid.z)
    expect(deviation).toBeGreaterThan(0)
    // l'arco si allontana dall'origine, non ci passa dentro
    expect(Math.hypot(mid.x, mid.y, mid.z)).toBeGreaterThan(Math.hypot(chordMid.x, chordMid.y, chordMid.z))
  })

  it('resta finito anche quando la corda passa per il centro', () => {
    const mid = arcPoint({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0.5)
    expect(Number.isFinite(mid.x)).toBe(true)
    expect(Number.isFinite(mid.y)).toBe(true)
    expect(Number.isFinite(mid.z)).toBe(true)
  })
})

describe('taper', () => {
  it('si spegne ai capi e brilla al centro', () => {
    expect(taper(0)).toBeCloseTo(0)
    expect(taper(1)).toBeCloseTo(0)
    expect(taper(0.5)).toBeCloseTo(1)
  })
})

describe('drawReveal', () => {
  it('scopre il filo da a verso b', () => {
    expect(drawReveal(0.9, 0)).toBe(0)
    expect(drawReveal(0.1, 0.5)).toBe(1)
    expect(drawReveal(0.5, 1)).toBe(1)
  })
})

describe('pulse', () => {
  it('e massimo sulla fase e neutro lontano', () => {
    expect(pulse(0.4, 0.4)).toBeGreaterThan(1.4)
    expect(pulse(0.0, 0.5)).toBeCloseTo(1, 3)
  })

  it('la fase avanza e resta in [0,1)', () => {
    const p = pulsePhase(1234, keySeed('a|b'))
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThan(1)
  })
})
