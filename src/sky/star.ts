import * as THREE from 'three'

export interface StarState {
  emotion: EmotionBucket
  confidence: number
  birthTime: number
  hash: string
}

export type EmotionBucket = 'joy' | 'calm' | 'sadness' | 'anger' | 'surprise' | 'neutral'

export const EMOTION_COLORS: Record<EmotionBucket, THREE.Color> = {
  joy: new THREE.Color(0xffc94a),
  calm: new THREE.Color(0x9fd8ff),
  sadness: new THREE.Color(0x6b7bd6),
  anger: new THREE.Color(0xff5a4e),
  surprise: new THREE.Color(0xe0a7ff),
  neutral: new THREE.Color(0xcfd8e3),
}

export function hueForEmotion(emotion: EmotionBucket): number {
  return EMOTION_COLORS[emotion].getHSL({ h: 0, s: 0, l: 0 }).h
}

/**
 * A presence grows barely at all: it must stay part of the background field.
 * Caps at 1.2x base after a minute.
 */
export function starSizeForDuration(elapsedMs: number, baseSize: number): number {
  const growth = 1 + Math.min(elapsedMs / 60_000, 1) * 0.2
  return baseSize * growth
}

export function flickerForConfidence(confidence: number, baseFlicker: number): number {
  const inverted = 1 - confidence
  return baseFlicker * (0.4 + inverted * 1.2)
}

export function makeMomentHash(seed: string, nonce: string): string {
  return `${seed.slice(0, 4)}·${nonce.slice(0, 4)}`
}
