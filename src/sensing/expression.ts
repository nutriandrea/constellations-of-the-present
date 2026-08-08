export type EmotionBucket = 'joy' | 'calm' | 'sadness' | 'anger' | 'surprise' | 'neutral'

export interface ExpressionReading {
  emotion: EmotionBucket
  confidence: number
}

const JOY_LIP_RATIO = 0.55
const ANGER_BROW_DROP = 0.35

export function readExpression(landmarks: number[][]): ExpressionReading {
  if (landmarks.length < 478) {
    return { emotion: 'neutral', confidence: 0.2 }
  }

  const mouthLeft = landmarks[61]
  const mouthRight = landmarks[291]
  const mouthTop = landmarks[13]
  const mouthBottom = landmarks[14]
  const browLeft = landmarks[21]
  const browRight = landmarks[22]
  const eyeLeft = landmarks[33]

  const mouthWidth = mouthLeft && mouthRight ? Math.max(0.001, Math.abs(mouthLeft[0] - mouthRight[0])) : 1

  const mouthOpen = mouthTop && mouthBottom ? Math.abs(mouthTop[1] - mouthBottom[1]) / mouthWidth : 0
  const smile =
    mouthLeft && mouthRight && mouthTop && mouthBottom
      ? (mouthTop[1] - mouthLeft[1] + mouthTop[1] - mouthRight[1]) / mouthWidth
      : 0
  const browDrop = browLeft && browRight && eyeLeft ? ((browLeft[1] - eyeLeft[1]) + (browRight[1] - eyeLeft[1])) / 2 : 0

  if (smile > JOY_LIP_RATIO && mouthOpen < 0.35) {
    return { emotion: 'joy', confidence: 0.7 }
  }
  if (mouthOpen > 0.5) {
    return { emotion: 'surprise', confidence: 0.6 }
  }
  if (browDrop > ANGER_BROW_DROP) {
    return { emotion: 'anger', confidence: 0.6 }
  }
  if (smile > 0.25) {
    return { emotion: 'calm', confidence: 0.5 }
  }
  return { emotion: 'neutral', confidence: 0.4 }
}
