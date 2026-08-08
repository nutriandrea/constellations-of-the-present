/**
 * Slow, organic breathing flicker — two offset sine components.
 * Returns a multiplier that breathes symmetrically around 1 (roughly
 * [0.62, 1.38]): the star both dims and brightens over time. Amplitude
 * scales with uncertainty (1 - confidence). With reducedMotion, returns
 * ~1 (static star).
 */
export function breathingFlicker(
  nowMs: number,
  confidence: number,
  seed: number,
  reducedMotion = false,
): number {
  if (reducedMotion) return 1

  const t = nowMs / 1000
  const slow = Math.sin(t * 0.72 + seed * 0.13)
  const slower = Math.sin(t * 0.21 + seed * 0.77)
  const envelope = 0.55 + 0.45 * slow * slower
  const inverted = Math.max(0, Math.min(1, 1 - confidence))
  const amp = 0.4 + 0.8 * inverted
  return 1 + (envelope - 0.55) * 2 * amp * 0.35
}
