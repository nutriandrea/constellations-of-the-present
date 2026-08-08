/**
 * Geometria e luce di un filo di costellazione.
 *
 * I legami non sono segmenti dritti: sono archi che si incurvano verso
 * l'esterno della sfera, come i tratti che si immaginano guardando il cielo.
 * Ogni arco si disegna da un capo all'altro, sfuma vicino alle stelle
 * (così non "trafigge" il bagliore) e lascia passare ogni tanto un respiro
 * di luce.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Quanto l'arco si scosta dalla corda, in frazione della sua lunghezza. */
export const ARC_BULGE = 0.16

/**
 * Punto sull'arco fra `a` e `b` al parametro `t` in [0,1].
 * Curva di Bézier quadratica con il controllo spinto verso l'esterno.
 */
export function arcPoint(a: Vec3, b: Vec3, t: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const mz = (a.z + b.z) / 2
  const chord = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

  let nx = mx
  let ny = my
  let nz = mz
  let len = Math.hypot(nx, ny, nz)
  if (len < 1e-6) {
    // Corda che passa per il centro: scegliamo una normale stabile.
    nx = -(a.y - b.y)
    ny = a.x - b.x
    nz = 0
    len = Math.hypot(nx, ny, nz)
    if (len < 1e-6) {
      nx = 0
      ny = 0
      nz = 1
      len = 1
    }
  }

  const bulge = (chord * ARC_BULGE * 2) / len
  const cx = mx + nx * bulge
  const cy = my + ny * bulge
  const cz = mz + nz * bulge

  const u = 1 - t
  const w0 = u * u
  const w1 = 2 * u * t
  const w2 = t * t

  out.x = w0 * a.x + w1 * cx + w2 * b.x
  out.y = w0 * a.y + w1 * cy + w2 * b.y
  out.z = w0 * a.z + w1 * cz + w2 * b.z
  return out
}

/**
 * Sfumatura verso i capi: il filo nasce e muore nel bagliore delle stelle
 * invece di terminare di netto.
 */
export function taper(t: number): number {
  return Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.65)
}

/**
 * Il tratto si disegna: `progress` avanza da 0 a 1 e scopre l'arco da `a`
 * verso `b`, con un bordo morbido invece di un taglio netto.
 */
export function drawReveal(t: number, progress: number): number {
  return Math.min(1, Math.max(0, (progress - t) * 7 + 1))
}

/**
 * Respiro di luce che scorre lungo il filo: una gobba morbida che passa
 * ogni tanto, senza mai diventare un effetto "laser".
 */
export function pulse(t: number, phase: number, strength = 0.55): number {
  let d = Math.abs(t - phase)
  if (d > 0.5) d = 1 - d
  return 1 + strength * Math.exp(-(d * d) / 0.006)
}

/** Fase del respiro per un filo, sfalsata per chiave così non pulsano all'unisono. */
export function pulsePhase(nowMs: number, seed: number, periodMs = 5200): number {
  const offset = (Math.abs(Math.sin(seed * 12.9898)) * 1000) % 1
  return ((nowMs / periodMs + offset) % 1 + 1) % 1
}

/** Seme stabile da una chiave testuale. */
export function keySeed(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}
