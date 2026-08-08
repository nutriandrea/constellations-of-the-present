import { describe, it, expect } from 'vitest'
import { sha256Hex, makeMomentHash } from './hash'

describe('sha256Hex', () => {
  it('is deterministic for the same input', async () => {
    const a = await sha256Hex('joy|0.70')
    const b = await sha256Hex('joy|0.70')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs for different inputs', async () => {
    const a = await sha256Hex('joy')
    const b = await sha256Hex('sadness')
    expect(a).not.toBe(b)
  })
})

describe('makeMomentHash', () => {
  it('produces a code different from the raw seed (non-reversible surface)', async () => {
    const m = await makeMomentHash('joy', 0.7, null, 10_000)
    expect(m.code).not.toBe(m.seed)
    expect(m.code).toMatch(/^[0-9a-f]{64}$/)
  })

  it('quantizes state: same emotion+confidence gives same seed, different nonce gives different code', async () => {
    const a = await makeMomentHash('joy', 0.7, null, 10_000)
    const b = await makeMomentHash('joy', 0.7, null, 10_000)
    expect(a.seed).toBe(b.seed)
    expect(a.code).not.toBe(b.code)
  })

  it('never leaks raw state in the code', async () => {
    const m = await makeMomentHash('sadness', 0.61, '20-29', 42_000)
    expect(m.code).not.toContain('sadness')
    expect(m.code).not.toContain('20-29')
    expect(m.code).not.toContain('42000')
  })
})
