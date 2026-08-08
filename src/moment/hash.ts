import type { EmotionBucket } from '../sensing/expression'

export interface MomentHash {
  seed: string
  nonce: string
  code: string
}

const encoder = new TextEncoder()

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function makeMomentHash(
  emotion: EmotionBucket,
  confidence: number,
  ageBand: string | null,
  presenceMs: number,
): Promise<MomentHash> {
  const nonce = crypto.randomUUID()
  const quantized = [emotion, confidence.toFixed(2), ageBand ?? 'unknown', Math.floor(presenceMs / 1000)].join('|')
  const seed = await sha256Hex(quantized)
  const code = await sha256Hex(seed + ':' + nonce)
  return { seed, nonce, code }
}
