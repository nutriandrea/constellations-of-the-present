/**
 * Palette del cielo.
 *
 * Le sei emozioni non sono sei colori scelti a caso: sono sei punti prelevati
 * da un unico gradiente globale — la stessa nebulosa che attraversa tutto il
 * sito. Così qualunque coppia di stelle si colleghi, l'arco che nasce dalla
 * loro mescolanza resta dentro la stessa famiglia cromatica.
 *
 * Due accorgimenti rendono il risultato "elegante" invece che sgargiante:
 *  1. **Luminanza normalizzata** — ogni tinta viene portata alla stessa
 *     luminosità percepita (Rec.709), così nessuna emozione urla più delle
 *     altre e le costellazioni hanno peso uniforme.
 *  2. **Miscela con correzione gamma** — l'interpolazione avviene in spazio
 *     lineare, non in sRGB: niente più grigi fangosi a metà arco tra due
 *     tinte complementari.
 */

export interface RGB {
  r: number
  g: number
  b: number
}

export type PaletteEmotion = 'joy' | 'calm' | 'sadness' | 'anger' | 'surprise' | 'neutral'

/** Il gradiente unico da cui discende tutto: ambra → rosa → viola → ciano. */
const GRADIENT: Array<{ t: number; color: RGB }> = [
  { t: 0, color: hex(0xffd08a) },
  { t: 0.14, color: hex(0xff8f6b) },
  { t: 0.32, color: hex(0xef7aa6) },
  { t: 0.5, color: hex(0xb478e6) },
  { t: 0.7, color: hex(0x7a8bea) },
  { t: 0.87, color: hex(0x6ec9e8) },
  { t: 1, color: hex(0x9fd6df) },
]

/** Posizione di ciascuna emozione lungo il gradiente. */
export const EMOTION_STOPS: Record<PaletteEmotion, number> = {
  joy: 0.03,
  anger: 0.15,
  surprise: 0.42,
  sadness: 0.66,
  calm: 0.86,
  neutral: 0.98,
}

/** Luminanza percepita comune a tutte le emozioni. */
const TARGET_LUMA = 0.46
/** Quanto forte è la normalizzazione (1 = tutte identiche in luminanza). */
const LUMA_NORMALIZATION = 0.72

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return clamp01(v)
}

/** Luminanza percepita (Rec.709) calcolata in spazio lineare. */
export function luminance(color: RGB): number {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  )
}

/**
 * Miscela due colori con correzione gamma: si passa in lineare, si interpola,
 * si torna in sRGB. È il modo in cui la luce si somma davvero.
 */
export function mixGamma(a: RGB, b: RGB, t: number): RGB {
  const k = clamp01(t)
  return {
    r: linearToSrgb(lerp(srgbToLinear(a.r), srgbToLinear(b.r), k)),
    g: linearToSrgb(lerp(srgbToLinear(a.g), srgbToLinear(b.g), k)),
    b: linearToSrgb(lerp(srgbToLinear(a.b), srgbToLinear(b.b), k)),
  }
}

/** Campiona il gradiente globale in `t` ∈ [0,1], con miscela gamma-corretta. */
export function sampleGradient(t: number): RGB {
  const x = clamp01(t)
  for (let i = 0; i < GRADIENT.length - 1; i++) {
    const a = GRADIENT[i]!
    const b = GRADIENT[i + 1]!
    if (x <= b.t) {
      const span = b.t - a.t
      const local = span <= 0 ? 0 : (x - a.t) / span
      return mixGamma(a.color, b.color, local)
    }
  }
  return { ...GRADIENT[GRADIENT.length - 1]!.color }
}

/**
 * Riporta un colore verso la luminanza comune, conservandone la tinta.
 * Con `amount` 0 non cambia nulla, con 1 la luminanza è esattamente quella
 * bersaglio.
 */
export function normalizeLuma(color: RGB, target = TARGET_LUMA, amount = LUMA_NORMALIZATION): RGB {
  const current = luminance(color)
  if (current <= 0) return { ...color }
  const wanted = lerp(current, target, clamp01(amount))
  // Il riscalamento avviene in spazio lineare: solo lì moltiplicare per un
  // fattore equivale davvero a "più luce".
  const scale = wanted / current
  return {
    r: linearToSrgb(srgbToLinear(color.r) * scale),
    g: linearToSrgb(srgbToLinear(color.g) * scale),
    b: linearToSrgb(srgbToLinear(color.b) * scale),
  }
}

/** Colore definitivo di un'emozione: gradiente globale + luminanza uniforme. */
export function emotionColor(emotion: PaletteEmotion): RGB {
  return normalizeLuma(sampleGradient(EMOTION_STOPS[emotion]))
}

/** Palette completa, precalcolata. */
export const EMOTION_PALETTE: Record<PaletteEmotion, RGB> = {
  joy: emotionColor('joy'),
  calm: emotionColor('calm'),
  sadness: emotionColor('sadness'),
  anger: emotionColor('anger'),
  surprise: emotionColor('surprise'),
  neutral: emotionColor('neutral'),
}

function hex(value: number): RGB {
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
