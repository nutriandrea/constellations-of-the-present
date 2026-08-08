/**
 * Twinkle — lo scintillio di una stella non è un lampeggio regolare: è
 * l'atmosfera che piega la sua luce. Ogni stella ha un carattere proprio,
 * derivato deterministicamente dal suo hash (stessa persona → stessa stella,
 * sempre), e brilla con tre onde incommensurabili tra loro, così il ciclo non
 * si ripete mai in modo percepibile.
 *
 * Intensità e dimensione variano insieme ma non all'unisono: la luminosità
 * pulsa più della taglia, come accade davvero guardando in alto.
 */

export interface TwinklePersonality {
  /** Velocità base dello scintillio, in cicli al secondo. */
  rate: number
  /** Fase iniziale, così due stelle vicine non pulsano mai in sincrono. */
  phase: number
  /** Quanto profondamente questa stella scintilla (0 = calma, 1 = inquieta). */
  depth: number
  /** Quanto la dimensione segue l'intensità. */
  sizeCoupling: number
}

export interface Twinkle {
  /** Moltiplicatore di luminosità/opacità, attorno a 1. */
  intensity: number
  /** Moltiplicatore di scala, attorno a 1. */
  size: number
}

const STILL: Twinkle = { intensity: 1, size: 1 }

/** Hash → numeri pseudo-casuali stabili in [0,1). */
function fract(x: number): number {
  return x - Math.floor(x)
}

/**
 * Carattere deterministico della stella. Stesso seed → stesso carattere,
 * su qualsiasi macchina e a ogni ricarica.
 */
export function twinklePersonality(seed: number): TwinklePersonality {
  const a = fract(Math.sin(seed * 12.9898) * 43758.5453)
  const b = fract(Math.sin(seed * 78.233) * 24634.6345)
  const c = fract(Math.sin(seed * 39.425) * 15731.7431)
  const d = fract(Math.sin(seed * 93.989) * 68219.1234)
  return {
    // Alcune stelle scintillano quasi ferme, altre vibrano: 0.28 – 1.06 Hz.
    rate: 0.28 + a * 0.78,
    phase: b * Math.PI * 2,
    depth: 0.35 + c * 0.65,
    sizeCoupling: 0.3 + d * 0.35,
  }
}

/**
 * Scintillio a un dato istante.
 *
 * `confidence` (0–1) misura quanto la lettura è salda: una stella incerta
 * tremola di più, una sicura sta quasi ferma.
 *
 * Con `reducedMotion` non c'è alcun movimento: la stella resta immobile,
 * ma conserva una luminosità propria — un filo più fioca se incerta — così
 * il cielo non diventa piatto.
 */
export function twinkle(
  nowMs: number,
  confidence: number,
  seed: number,
  reducedMotion = false,
): Twinkle {
  const p = twinklePersonality(seed)
  const uncertainty = Math.max(0, Math.min(1, 1 - confidence))

  if (reducedMotion) {
    return { intensity: 1 - uncertainty * 0.12, size: 1 }
  }

  const t = nowMs / 1000
  // Tre componenti con periodi non armonici: il battito non si richiude mai
  // su sé stesso, e questo lo rende organico invece che meccanico.
  const w1 = Math.sin(t * p.rate * 2 * Math.PI + p.phase)
  const w2 = Math.sin(t * p.rate * 0.41 * 2 * Math.PI + p.phase * 1.7)
  const w3 = Math.sin(t * p.rate * 2.63 * 2 * Math.PI + p.phase * 0.3)
  // La terza onda è un guizzo breve, pesato poco: dà il "sfarfallio" senza
  // rendere nervosa la stella.
  const wave = (w1 * 0.55 + w2 * 0.32 + w3 * 0.13)

  // Ampiezza: carattere della stella + incertezza della lettura.
  const amp = 0.14 * p.depth * (0.55 + 0.9 * uncertainty)

  const intensity = clamp(1 + wave * amp, 0.55, 1.45)
  const size = clamp(1 + wave * amp * p.sizeCoupling, 0.7, 1.3)
  return { intensity, size }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export { STILL as STILL_TWINKLE }
