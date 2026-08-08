import type { ExpressionReading, EmotionBucket } from './expression'

export interface EmotionSmootherOptions {
  /** Finestra mobile di frame da considerare. */
  window?: number
  /** Frame consecutivi (nella finestra) prima di cambiare emozione. */
  minStable?: number
}

export interface EmotionSmoother {
  push(reading: ExpressionReading): ExpressionReading
  current(): ExpressionReading
  reset(): void
}

const NEUTRAL: ExpressionReading = { emotion: 'neutral', confidence: 0.2 }

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Filtro temporale sull'emozione: l'emozione corrente cambia solo quando il
 * volto la tiene stabile per `minStable` frame in una finestra di `window`
 * frame. Un singolo frame anomalo (blink, bocca semiaperta, riflesso) non
 * fa saltare la stella.
 */
export function createEmotionSmoother(options: EmotionSmootherOptions = {}): EmotionSmoother {
  const windowSize = Math.max(1, options.window ?? 5)
  const minStable = Math.max(1, Math.min(windowSize, options.minStable ?? 3))
  let history: ExpressionReading[] = []
  let current: ExpressionReading = NEUTRAL

  /** Emozione dominante nella finestra; a parità di conteggio vince la più recente. */
  function modeEmotion(): EmotionBucket {
    const counts = new Map<EmotionBucket, number>()
    let candidate: EmotionBucket = history[history.length - 1]?.emotion ?? 'neutral'
    let maxCount = 0
    for (let i = history.length - 1; i >= 0; i--) {
      const emotion = history[i].emotion
      const count = (counts.get(emotion) ?? 0) + 1
      counts.set(emotion, count)
      if (count > maxCount) {
        maxCount = count
        candidate = emotion
      }
    }
    return candidate
  }

  function medianConfidence(): number {
    if (history.length === 0) return current.confidence
    const sorted = history
      .map((h) => h.confidence)
      .sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const value = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    return clamp01(value)
  }

  return {
    push(reading) {
      history.push(reading)
      if (history.length > windowSize) history.shift()

      const mode = modeEmotion()
      if (mode !== current.emotion) {
        const count = history.filter((h) => h.emotion === mode).length
        if (count >= minStable) {
          current = { emotion: mode, confidence: medianConfidence() }
        }
      }
      return current
    },
    current() {
      return current
    },
    reset() {
      history = []
      current = NEUTRAL
    },
  }
}
