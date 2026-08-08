import * as THREE from 'three'
import { EMOTION_COLORS, starSizeForDuration, flickerForConfidence } from './star'
import type { StarState } from './star'
import type { EmotionBucket } from '../sensing/expression'
import type { TrackedStar } from './presence'
import { REMOTE_TTL_MS } from './presence'
import { hashToPosition } from './remotePosition'
import { buildLines } from './connections'

export interface SkyHandles {
  update: (now: number) => void
  setStar: (star: StarState | null) => void
  setRemoteStars: (stars: TrackedStar[]) => void
  resize: (width: number, height: number) => void
}

const BUCKETS: EmotionBucket[] = ['joy', 'calm', 'sadness', 'anger', 'surprise', 'neutral']
const MAX_DIST = 2.5
const MAX_NEIGHBORS = 4
const MAX_LINES = 256

interface StarPair {
  star: THREE.Mesh
  glow: THREE.Mesh
}

function createBucketMaterials(): Map<EmotionBucket, { star: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial }> {
  const materials = new Map<EmotionBucket, { star: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial }>()
  for (const bucket of BUCKETS) {
    const color = EMOTION_COLORS[bucket]
    materials.set(bucket, {
      star: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }),
      glow: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08 }),
    })
  }
  return materials
}

export function createSky(canvas: HTMLCanvasElement): SkyHandles {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 5)

  const starGeometry = new THREE.SphereGeometry(1, 24, 24)
  const glowGeometry = new THREE.SphereGeometry(2.2, 24, 24)
  const bucketMaterials = createBucketMaterials()

  // Own star
  const ownMaterial = new THREE.MeshBasicMaterial({ color: 0xcfd8e3, transparent: true, opacity: 0.9 })
  const ownGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xcfd8e3, transparent: true, opacity: 0.12 })
  const ownStar = new THREE.Mesh(starGeometry, ownMaterial)
  const ownGlow = new THREE.Mesh(glowGeometry, ownGlowMaterial)
  const ownRing = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.7, 48),
    new THREE.MeshBasicMaterial({ color: 0x8fa0d8, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  )
  ownStar.add(ownRing)
  scene.add(ownStar, ownGlow)

  // Remote stars
  const remoteMeshes = new Map<string, StarPair>()
  const fading: { pair: StarPair; started: number }[] = []
  const pool: StarPair[] = []

  function acquirePair(): StarPair {
    const pair = pool.pop()
    if (pair) return pair
    const star = new THREE.Mesh(starGeometry, new THREE.MeshBasicMaterial())
    const glow = new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial())
    const created = { star, glow }
    scene.add(star, glow)
    return created
  }

  function releasePair(pair: StarPair): void {
    pair.star.visible = false
    pair.glow.visible = false
    pool.push(pair)
  }

  function applyBucket(pair: StarPair, bucket: EmotionBucket): void {
    const mats = bucketMaterials.get(bucket)!
    pair.star.material = mats.star
    pair.glow.material = mats.glow
  }

  // Connections (buffers riusati, allocati una volta)
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x8fa0d8,
    vertexColors: true,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
  })
  const linePositions = new Float32Array(MAX_LINES * 6)
  const lineColors = new Float32Array(MAX_LINES * 6)
  const lineGeometry = new THREE.BufferGeometry()
  const linePositionsAttribute = new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage)
  const lineColorsAttribute = new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage)
  lineGeometry.setAttribute('position', linePositionsAttribute)
  lineGeometry.setAttribute('color', lineColorsAttribute)
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
  scene.add(lines)

  let current: StarState | null = null
  let ownPosition = new THREE.Vector3(0, 0, 0)
  let remote: TrackedStar[] = []
  const positionCache = new Map<string, { x: number; y: number; z: number }>()

  function positionFor(hash: string): { x: number; y: number; z: number } {
    let pos = positionCache.get(hash)
    if (!pos) {
      pos = hashToPosition(hash)
      positionCache.set(hash, pos)
    }
    return pos
  }

  return {
    setStar(state: StarState | null) {
      current = state
      if (state) {
        const pos = positionFor(state.hash)
        ownPosition.set(pos.x, pos.y, pos.z)
        ownStar.position.copy(ownPosition)
        ownGlow.position.copy(ownPosition)
        ownStar.visible = true
        ownGlow.visible = true
      } else {
        ownStar.visible = false
        ownGlow.visible = false
      }
    },
    setRemoteStars(stars: TrackedStar[]) {
      remote = stars
    },
    update(now: number) {
      if (current) {
        const elapsed = now - current.birthTime
        const size = starSizeForDuration(elapsed, 0.22)
        const flicker = flickerForConfidence(current.confidence, 0.15)
        const pulse = 1 + Math.sin(now / 220) * flicker

        const color = EMOTION_COLORS[current.emotion]
        ownMaterial.color.copy(color)
        ownGlowMaterial.color.copy(color)
        ownMaterial.opacity = Math.min(1, 0.5 + current.confidence)

        ownStar.scale.setScalar(size * pulse)
        ownGlow.scale.setScalar(size * 3.2 * pulse)
        ownGlow.rotation.y += 0.004
        ownRing.rotation.z += 0.002
      }

      const present = new Set<string>()
      for (const remoteStar of remote) {
        if (now - remoteStar.lastSeen > REMOTE_TTL_MS) continue
        present.add(remoteStar.hash)
        let pair = remoteMeshes.get(remoteStar.hash)
        if (!pair) {
          pair = acquirePair()
          applyBucket(pair, remoteStar.emotion)
          const pos = positionFor(remoteStar.hash)
          pair.star.position.set(pos.x, pos.y, pos.z)
          pair.glow.position.set(pos.x, pos.y, pos.z)
          remoteMeshes.set(remoteStar.hash, pair)
        }
        const flicker = flickerForConfidence(remoteStar.confidence, 0.1)
        const pulse = 1 + Math.sin(now / 240 + remoteStar.hash.charCodeAt(0)) * flicker
        pair.star.scale.setScalar(0.12 * pulse)
        pair.glow.scale.setScalar(0.12 * 3.2 * pulse)
        pair.star.visible = true
        pair.glow.visible = true
      }

      for (const [hash, pair] of remoteMeshes) {
        if (present.has(hash)) continue
        remoteMeshes.delete(hash)
        fading.push({ pair, started: now })
      }

      for (let i = fading.length - 1; i >= 0; i--) {
        const { pair, started } = fading[i]
        const t = (now - started) / 500
        if (t >= 1) {
          releasePair(pair)
          fading.splice(i, 1)
        } else {
          const scale = Math.max(0.0001, 1 - t)
          pair.star.scale.setScalar(0.12 * scale)
          pair.glow.scale.setScalar(0.12 * 3.2 * scale)
        }
      }

      // Connections between live stars only
      const points = remote
        .filter((s) => present.has(s.hash))
        .map((s) => {
          const pos = positionFor(s.hash)
          return { id: s.hash, x: pos.x, y: pos.y, z: pos.z }
        })
      if (current) points.push({ id: 'self', x: ownPosition.x, y: ownPosition.y, z: ownPosition.z })

      const connections = buildLines(points, MAX_DIST, MAX_NEIGHBORS)
      const count = Math.min(connections.length, MAX_LINES)
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const line = connections[i]
          const o = i * 6
          linePositions[o] = line.ax
          linePositions[o + 1] = line.ay
          linePositions[o + 2] = line.az
          linePositions[o + 3] = line.bx
          linePositions[o + 4] = line.by
          linePositions[o + 5] = line.bz
          const op = Math.max(0, Math.min(1, line.opacity))
          lineColors[o] = op
          lineColors[o + 1] = op
          lineColors[o + 2] = op
          lineColors[o + 3] = op
          lineColors[o + 4] = op
          lineColors[o + 5] = op
        }
        linePositionsAttribute.needsUpdate = true
        lineColorsAttribute.needsUpdate = true
        lineGeometry.setDrawRange(0, count * 2)
        lines.visible = true
      } else {
        lines.visible = false
      }

      renderer.render(scene, camera)
    },
    resize(width: number, height: number) {
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    },
  }
}
