import * as THREE from 'three'
import { EMOTION_COLORS, starSizeForDuration } from './star'
import type { StarState } from './star'
import type { EmotionBucket } from '../sensing/expression'
import type { TrackedStar } from './presence'
import { REMOTE_TTL_MS } from './presence'
import { hashToPosition } from './remotePosition'
import { buildLines } from './connections'
import { breathingFlicker } from './flicker'
import { buildStarfield } from './starfield'

export interface SkyHandles {
  update: (now: number) => void
  setStar: (star: StarState | null) => void
  setRemoteStars: (stars: TrackedStar[]) => void
  resize: (width: number, height: number) => void
  setReducedMotion: (reduced: boolean) => void
}

const BUCKETS: EmotionBucket[] = ['joy', 'calm', 'sadness', 'anger', 'surprise', 'neutral']
const MAX_DIST = 2.5
const MAX_NEIGHBORS = 4
const MAX_LINES = 256

const STARFIELD_COUNT = 1200
const STARFIELD_RADIUS = 55

interface StarSprite {
  sprite: THREE.Sprite
}

function createGlowTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.85)')
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.28)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

function createBucketMaterials(): Map<EmotionBucket, THREE.SpriteMaterial> {
  const materials = new Map<EmotionBucket, THREE.SpriteMaterial>()
  const texture = createGlowTexture()
  for (const bucket of BUCKETS) {
    const color = EMOTION_COLORS[bucket]
    materials.set(
      bucket,
      new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
  }
  return materials
}

function createStarfield(): THREE.Points {
  const { positions, sizes } = buildStarfield(STARFIELD_COUNT, STARFIELD_RADIUS, 20260808)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xaebbe8) } },
    vertexShader: `
      attribute float size;
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (400.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vAlpha = 0.5;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 cxy = 2.0 * gl_PointCoord - 1.0;
        float r = dot(cxy, cxy);
        if (r > 1.0) discard;
        gl_FragColor = vec4(uColor, (1.0 - r) * vAlpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  return new THREE.Points(geometry, material)
}

export function createSky(canvas: HTMLCanvasElement): SkyHandles {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 5)

  const bucketMaterials = createBucketMaterials()
  const starfield = createStarfield()
  scene.add(starfield)

  // Own star — dedicated material instance (bucket materials are shared with remotes)
  const ownMaterial = bucketMaterials.get('neutral')!.clone()
  const ownStar = new THREE.Sprite(ownMaterial)
  ownStar.scale.setScalar(0.55)
  const ownRing = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 1.6, 48),
    new THREE.MeshBasicMaterial({
      color: 0x8fa0d8,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  scene.add(ownStar, ownRing)

  // Remote stars
  const remoteSprites = new Map<string, StarSprite>()
  const fading: { sprite: StarSprite; started: number }[] = []
  const pool: StarSprite[] = []

  function acquireSprite(): StarSprite {
    const star = pool.pop()
    if (star) return star
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }))
    const created = { sprite }
    scene.add(sprite)
    return created
  }

  function releaseSprite(star: StarSprite): void {
    star.sprite.visible = false
    pool.push(star)
  }

  function applyBucket(star: StarSprite, bucket: EmotionBucket): void {
    star.sprite.material = bucketMaterials.get(bucket)!
  }

  // Connections (buffers riusati, allocati una volta)
  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
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
  const ownPosition = new THREE.Vector3(0, 0, 0)
  let remote: TrackedStar[] = []
  let reducedMotion = false
  const positionCache = new Map<string, { x: number; y: number; z: number }>()

  function positionFor(hash: string): { x: number; y: number; z: number } {
    let pos = positionCache.get(hash)
    if (!pos) {
      pos = hashToPosition(hash)
      positionCache.set(hash, pos)
    }
    return pos
  }

  function seedFor(hash: string): number {
    let seed = 0
    for (let i = 0; i < hash.length && i < 8; i++) seed += hash.charCodeAt(i) * (i + 1)
    return seed || 1
  }

  return {
    setStar(state: StarState | null) {
      current = state
      if (state) {
        const pos = positionFor(state.hash)
        ownPosition.set(pos.x, pos.y, pos.z)
        ownStar.position.copy(ownPosition)
        ownRing.position.copy(ownPosition)
        ownStar.visible = true
        ownRing.visible = true
      } else {
        ownStar.visible = false
        ownRing.visible = false
      }
    },
    setRemoteStars(stars: TrackedStar[]) {
      remote = stars
    },
    setReducedMotion(reduced: boolean) {
      reducedMotion = reduced
    },
    update(now: number) {
      if (!reducedMotion) starfield.rotation.y += 0.0001

      if (current) {
        const elapsed = now - current.birthTime
        const size = starSizeForDuration(elapsed, 0.55)
        const flicker = breathingFlicker(now, current.confidence, seedFor(current.hash), reducedMotion)

        ownMaterial.color.copy(EMOTION_COLORS[current.emotion])
        ownMaterial.opacity = 0.75 + current.confidence * 0.25
        ownStar.scale.setScalar(size * flicker)
        ownRing.rotation.z += reducedMotion ? 0 : 0.002
      }

      const present = new Set<string>()
      for (const remoteStar of remote) {
        if (now - remoteStar.lastSeen > REMOTE_TTL_MS) continue
        present.add(remoteStar.hash)
        let star = remoteSprites.get(remoteStar.hash)
        if (!star) {
          star = acquireSprite()
          applyBucket(star, remoteStar.emotion)
          const pos = positionFor(remoteStar.hash)
          star.sprite.position.set(pos.x, pos.y, pos.z)
          remoteSprites.set(remoteStar.hash, star)
        }
        const flicker = breathingFlicker(now, remoteStar.confidence, seedFor(remoteStar.hash), reducedMotion)
        star.sprite.scale.setScalar(0.5 * flicker)
        star.sprite.visible = true
      }

      for (const [hash, star] of remoteSprites) {
        if (present.has(hash)) continue
        remoteSprites.delete(hash)
        fading.push({ sprite: star, started: now })
      }

      for (let i = fading.length - 1; i >= 0; i--) {
        const { sprite, started } = fading[i]
        const t = (now - started) / 500
        if (t >= 1) {
          releaseSprite(sprite)
          fading.splice(i, 1)
        } else {
          sprite.sprite.scale.setScalar(Math.max(0.0001, 0.5 * (1 - t)))
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
          // Linee in tinta neutra (scelta di design: fili di connessione discreti,
          // non colorati dall'emozione dei capi). L'opacità segue la distanza.
          const color = EMOTION_COLORS['neutral']
          const op = Math.max(0.05, Math.min(0.9, line.opacity))
          lineColors[o] = color.r * op
          lineColors[o + 1] = color.g * op
          lineColors[o + 2] = color.b * op
          const opB = op * 0.45
          lineColors[o + 3] = color.r * opB
          lineColors[o + 4] = color.g * opB
          lineColors[o + 5] = color.b * opB
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
