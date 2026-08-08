/**
 * Contrasto adattivo dei fili.
 *
 * Un arco additivo su nero si vede benissimo; lo stesso arco su uno schermo
 * schiarito (OLED al minimo, luce solare, tema chiaro del sistema) sparisce.
 * E quando i fili diventano tanti, la somma additiva impasta il cielo.
 *
 * Questa curva prende la forza grezza del legame (0–1) e la rimappa con:
 *  - un pavimento (`floor`): niente resta sotto la soglia di visibilità;
 *  - una gamma: schiarisce i legami deboli senza toccare i forti;
 *  - un tetto (`ceiling`): i fili non superano mai la luce delle stelle;
 *  - uno smorzamento per densità: più archi ci sono, meno pesa ciascuno.
 */

export type Ambient = 'dark' | 'light'

export interface ContrastProfile {
  floor: number
  gamma: number
  ceiling: number
}

/**
 * Su ambiente chiaro serve più corpo: pavimento più alto, gamma più
 * aggressiva sui deboli, tetto più alto perché il fondo "mangia" luce.
 */
export const CONTRAST_PROFILES: Record<Ambient, ContrastProfile> = {
  dark: { floor: 0.1, gamma: 0.78, ceiling: 0.62 },
  light: { floor: 0.24, gamma: 0.58, ceiling: 0.92 },
}

/**
 * Smorzamento per densità: con pochi fili ciascuno può brillare, con il cielo
 * pieno si abbassano tutti insieme così il disegno resta leggibile.
 * `ratio` = archi vivi / archi massimi, in [0,1].
 */
export function densityDamping(ratio: number): number {
  const r = clamp01(ratio)
  return 1 - 0.32 * r * r
}

/**
 * Rimappa la forza grezza di un legame nella sua opacità di resa.
 *
 * `raw` 0 resta 0 (un filo assente non deve apparire): il pavimento entra in
 * gioco solo quando il legame esiste davvero.
 */
export function linkContrast(
  raw: number,
  ambient: Ambient = 'dark',
  densityRatio = 0,
): number {
  const x = clamp01(raw)
  if (x <= 0) return 0
  const p = CONTRAST_PROFILES[ambient]
  const shaped = Math.pow(x, p.gamma)
  const lifted = p.floor + (p.ceiling - p.floor) * shaped
  return clamp01(lifted * densityDamping(densityRatio))
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
