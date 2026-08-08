import type { EmotionBucket } from '../sensing/expression'

export interface RemoteStar {
  id: string
  hash: string
  emotion: EmotionBucket
  confidence: number
  /** Epoch milliseconds (Date.now()); il clock locale resta performance.now() per l'animazione. */
  birthTime: number
}

export interface StarChannel {
  kind: 'supabase' | 'broadcast' | 'noop'
  ownId: string
  connect(): void
  onStars(callback: (stars: RemoteStar[]) => void): () => void
  publish(star: RemoteStar): void
  dispose(): void
}
