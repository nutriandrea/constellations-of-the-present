export type EmotionBucket = 'joy' | 'calm' | 'sadness' | 'anger' | 'surprise' | 'neutral'

export interface ExpressionReading {
  emotion: EmotionBucket
  confidence: number
}

/** Coefficienti blendshape di MediaPipe (nome -> valore 0..1). */
export type BlendshapeMap = Record<string, number>

export interface EmotionScores {
  joy: number
  calm: number
  sadness: number
  anger: number
  surprise: number
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
const maxPair = (a: number, b: number): number => Math.max(a, b)

/**
 * Sotto questa attivazione il volto è a riposo: nessun sorriso, sopracciglia
 * o bocca sollecitati. Non serve nemmeno calcolare i punteggi.
 */
const NEUTRAL_ACTIVATION_FLOOR = 0.1
const NEUTRAL_CONFIDENCE = 0.4
/** Oltre questa ampiezza un sorriso non è più "gentile": smette di alimentare calm. */
const SOFT_SMILE_MAX = 0.55

function blendshapeValue(bs: BlendshapeMap, name: string): number {
  const value = bs[name]
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return clamp01(value)
}

export function scoreEmotions(bs: BlendshapeMap): EmotionScores {
  const smile = maxPair(blendshapeValue(bs, 'mouthSmileLeft'), blendshapeValue(bs, 'mouthSmileRight'))
  const frown = maxPair(blendshapeValue(bs, 'mouthFrownLeft'), blendshapeValue(bs, 'mouthFrownRight'))
  const browDown = maxPair(blendshapeValue(bs, 'browDownLeft'), blendshapeValue(bs, 'browDownRight'))
  const browUp = blendshapeValue(bs, 'browInnerUp')
  const jaw = blendshapeValue(bs, 'jawOpen')
  const press = maxPair(blendshapeValue(bs, 'mouthPressLeft'), blendshapeValue(bs, 'mouthPressRight'))
  const eyeWide = maxPair(blendshapeValue(bs, 'eyeWideLeft'), blendshapeValue(bs, 'eyeWideRight'))
  const squint = maxPair(blendshapeValue(bs, 'eyeSquintLeft'), blendshapeValue(bs, 'eyeSquintRight'))

  return {
    joy: clamp01(0.9 * smile + 0.5 * squint - 0.3 * frown - 0.5 * jaw),
    surprise: clamp01(0.8 * jaw + 0.4 * eyeWide + 0.35 * browUp - 0.2 * smile),
    anger: clamp01(0.8 * browDown + 0.5 * press + 0.3 * frown - 0.25 * smile),
    sadness: clamp01(0.7 * frown + 0.5 * browUp - 0.25 * smile - 0.2 * jaw),
    // Il sorriso gentile alimenta calm solo nella fascia morbida; un sorriso
    // ampio non lo fa scattare, lascia vincere joy.
    calm: clamp01(0.9 * Math.min(smile, SOFT_SMILE_MAX) - 0.6 * jaw - 0.5 * frown - 0.45 * browDown - 0.4 * browUp - 0.3 * eyeWide + 0.05),
  }
}

export function readExpressionFromBlendshapes(bs: BlendshapeMap): ExpressionReading {
  const activation = Math.max(
    blendshapeValue(bs, 'mouthSmileLeft'),
    blendshapeValue(bs, 'mouthSmileRight'),
    blendshapeValue(bs, 'mouthFrownLeft'),
    blendshapeValue(bs, 'mouthFrownRight'),
    blendshapeValue(bs, 'browDownLeft'),
    blendshapeValue(bs, 'browDownRight'),
    blendshapeValue(bs, 'browInnerUp'),
    blendshapeValue(bs, 'jawOpen'),
    blendshapeValue(bs, 'mouthPressLeft'),
    blendshapeValue(bs, 'mouthPressRight'),
    blendshapeValue(bs, 'eyeWideLeft'),
    blendshapeValue(bs, 'eyeWideRight'),
    blendshapeValue(bs, 'eyeSquintLeft'),
    blendshapeValue(bs, 'eyeSquintRight'),
  )
  if (activation < NEUTRAL_ACTIVATION_FLOOR) {
    return { emotion: 'neutral', confidence: NEUTRAL_CONFIDENCE }
  }

  const scores = scoreEmotions(bs)
  const entries: [EmotionBucket, number][] = [
    ['joy', scores.joy],
    ['surprise', scores.surprise],
    ['anger', scores.anger],
    ['sadness', scores.sadness],
    ['calm', scores.calm],
  ]
  let best: EmotionBucket = 'calm'
  let bestScore = -1
  for (const [emotion, score] of entries) {
    if (score > bestScore) {
      best = emotion
      bestScore = score
    }
  }
  return { emotion: best, confidence: clamp01(bestScore) }
}
