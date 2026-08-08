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

export function hashToPosition(hash: string, radius = 2.2): { x: number; y: number; z: number } {
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

/** Distanza della camera dal centro della sfera delle stelle. */
export const SKY_CAMERA_DISTANCE = 5
/** Metà FOV verticale della PerspectiveCamera (gradi). */
export const SKY_VERTICAL_HALF_FOV_DEG = 30
/** Margine per la deriva della camera e il raggio visivo dello sprite. */
const FRAME_MARGIN = 0.85

/**
 * Raggio della sfera delle stelle che garantisce che ogni stella resti dentro
 * la cornice dello schermo, per qualsiasi aspect ratio: il vincolo è il più
 * stretto tra FOV verticale e orizzontale.
 */
export function safeSkyRadius(aspect: number): number {
  const safeAspect = Math.max(0.1, aspect)
  const halfFov = (SKY_VERTICAL_HALF_FOV_DEG * Math.PI) / 180
  const tanH = Math.tan(halfFov) * safeAspect
  return Math.min(Math.tan(halfFov), tanH) * SKY_CAMERA_DISTANCE * FRAME_MARGIN
}
