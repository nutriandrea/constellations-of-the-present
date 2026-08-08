import { describe, it, expect } from 'vitest'
import { createLinkAnimator } from './constellation'

function conn(a: string, b: string, opacity = 0.8) {
  return { a, b, ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, opacity }
}

describe('createLinkAnimator', () => {
  it('fa comparire i fili gradualmente', () => {
    const animator = createLinkAnimator(1000, 1000)
    animator.sync([conn('a', 'b')])
    const first = animator.step(100)
    expect(first).toHaveLength(1)
    expect(first[0].alpha).toBeGreaterThan(0)
    expect(first[0].alpha).toBeLessThan(1)

    const later = animator.step(2000)
    expect(later[0].alpha).toBeCloseTo(1, 5)
  })

  it('dissolve e rimuove i fili spariti dalla topologia', () => {
    const animator = createLinkAnimator(1, 1000)
    animator.sync([conn('a', 'b')])
    animator.step(10)
    animator.sync([])
    const fading = animator.step(100)
    expect(fading).toHaveLength(1)
    expect(fading[0].alpha).toBeLessThan(1)

    animator.step(2000)
    expect(animator.size()).toBe(0)
  })

  it('riusa lo stesso filo se la topologia lo ripropone', () => {
    const animator = createLinkAnimator(1000, 1000)
    animator.sync([conn('a', 'b')])
    animator.step(500)
    animator.sync([conn('b', 'a')])
    expect(animator.size()).toBe(1)
  })
})
