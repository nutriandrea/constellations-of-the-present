export function seedFromHash(hash: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < hash.length; i++) {
    h ^= hash.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function PRNG(seed: number): () => number {
  let t = seed
  return () => {
    t += 0x6d2b79f5
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export function hashToPosition(hash: string, radius = 3.2): { x: number; y: number; z: number } {
  const rand = PRNG(seedFromHash(hash))
  const u1 = rand()
  const u2 = rand()
  const cost = 1 - 2 * u1
  const sint = Math.sqrt(Math.max(0, 1 - cost * cost))
  const phi = 2 * Math.PI * u2
  return {
    x: radius * sint * Math.cos(phi),
    y: radius * cost,
    z: radius * sint * Math.sin(phi),
  }
}
