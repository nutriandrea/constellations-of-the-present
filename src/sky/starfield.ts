import { PRNG, seedFromHash } from './remotePosition'

export interface StarfieldLayout {
  positions: Float32Array
  sizes: Float32Array
  /** Per-star colour temperature, 0 = cold blue-white, 1 = warm amber. */
  tints: Float32Array
}

/**
 * Deterministic background starfield: `count` points placed on a spherical
 * shell (radius) with a radial bias toward the shell surface. Same seed →
 * same sky for every client.
 */
export function buildStarfield(count: number, radius: number, seed: number): StarfieldLayout {
  const rand = PRNG(seedFromHash(`starfield:${seed}`))
  const positions = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const tints = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const u1 = rand()
    const u2 = rand()
    const r = radius * (0.6 + 0.4 * rand())
    const cost = 1 - 2 * u1
    const sint = Math.sqrt(Math.max(0, 1 - cost * cost))
    const phi = 2 * Math.PI * u2
    const o = i * 3
    positions[o] = r * sint * Math.cos(phi)
    positions[o + 1] = r * cost
    positions[o + 2] = r * sint * Math.sin(phi)
    sizes[i] = 0.4 + rand() * 1.2
    // Colour temperature skewed cold: a real sky is mostly blue-white, with
    // a few warm giants scattered through it.
    const t = rand()
    tints[i] = t * t * t
  }

  return { positions, sizes, tints }
}
