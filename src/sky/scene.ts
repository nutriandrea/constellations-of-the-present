import * as THREE from 'three'
import { EMOTION_COLORS, starSizeForDuration } from './star'
import type { StarState } from './star'
import type { EmotionBucket } from '../sensing/expression'
import type { TrackedStar } from './presence'
import { REMOTE_TTL_MS } from './presence'
import { hashToPosition } from './remotePosition'
import { buildLines } from './connections'
import { createLinkAnimator } from './constellation'
import { arcPoint, drawReveal, keySeed, pulse, pulsePhase, taper } from './arc'
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
const MAX_NEIGHBORS = 3
const MAX_LINES = 256
/** Segmenti per arco: abbastanza per una curva morbida, non tanti da pesare. */
const ARC_SEGMENTS = 14
/** La topologia si ricalcola a bassa frequenza; le dissolvenze girano a ogni frame. */
const TOPOLOGY_INTERVAL_MS = 220
/** Quanto l'emozione dei due capi tinge il filo (0 = filo neutro). */
const LINK_TINT = 0.7
/** Luminosità massima di un filo: i legami sussurrano, non gridano. */
const LINK_GAIN = 0.5

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
  // Alone della propria stella: un cerchio sottile e discreto, non un anello
  // grigio che taglia il cielo.
  const ownRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x8fa0d8,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const ownRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.012, 96), ownRingMaterial)
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
  const VERTS_PER_ARC = ARC_SEGMENTS * 2
  const linePositions = new Float32Array(MAX_LINES * VERTS_PER_ARC * 3)
  const lineColors = new Float32Array(MAX_LINES * VERTS_PER_ARC * 3)
  const lineGeometry = new THREE.BufferGeometry()
  const linePositionsAttribute = new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage)
  const lineColorsAttribute = new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage)
  lineGeometry.setAttribute('position', linePositionsAttribute)
  lineGeometry.setAttribute('color', lineColorsAttribute)
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
  scene.add(lines)

  const linkAnimator = createLinkAnimator()
  const linkColorA = new THREE.Color()
  const linkColorB = new THREE.Color()
  const linkColorMix = new THREE.Color()
  const arcHead = { x: 0, y: 0, z: 0 }
  const arcTail = { x: 0, y: 0, z: 0 }
  const neutralColor = EMOTION_COLORS['neutral']
  /** Emozione per capo del filo, per tingere la linea. */
  const emotionByPoint = new Map<string, EmotionBucket>()

  let current: StarState | null = null
  const ownPosition = new THREE.Vector3(0, 0, 0)
  let remote: TrackedStar[] = []
  let reducedMotion = false
  let lastFrame = 0
  let lastTopology = 0
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

  function tintFor(id: string, target: THREE.Color): THREE.Color {
    const emotion = emotionByPoint.get(id)
    target.copy(neutralColor)
    if (emotion) target.lerp(EMOTION_COLORS[emotion], LINK_TINT)
    return target
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
      const dt = lastFrame === 0 ? 16 : Math.min(100, now - lastFrame)
      lastFrame = now

      if (!reducedMotion) {
        starfield.rotation.y += 0.0001
        // Deriva lentissima della camera: il cielo respira, le costellazioni
        // cambiano prospettiva senza che nulla si muova davvero.
        const t = now / 1000
        camera.position.x = Math.sin(t * 0.045) * 0.32
        camera.position.y = Math.sin(t * 0.031 + 1.7) * 0.22
        camera.lookAt(0, 0, 0)
      }

      if (current) {
        const elapsed = now - current.birthTime
        const size = starSizeForDuration(elapsed, 0.55)
        const flicker = breathingFlicker(now, current.confidence, seedFor(current.hash), reducedMotion)

        ownMaterial.color.copy(EMOTION_COLORS[current.emotion])
        ownMaterial.opacity = 0.75 + current.confidence * 0.25
        ownStar.scale.setScalar(size * flicker)
        ownRingMaterial.color.copy(EMOTION_COLORS[current.emotion])
        ownRing.scale.setScalar(size * 0.85)
        ownRing.quaternion.copy(camera.quaternion)
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

      // Topologia della costellazione: ricalcolata a scatti lenti…
      if (now - lastTopology >= TOPOLOGY_INTERVAL_MS) {
        lastTopology = now
        emotionByPoint.clear()
        const points: { id: string; x: number; y: number; z: number }[] = []
        for (const s of remote) {
          if (!present.has(s.hash)) continue
          const pos = positionFor(s.hash)
          emotionByPoint.set(s.hash, s.emotion)
          points.push({ id: s.hash, x: pos.x, y: pos.y, z: pos.z })
        }
        if (current) {
          emotionByPoint.set('self', current.emotion)
          points.push({ id: 'self', x: ownPosition.x, y: ownPosition.y, z: ownPosition.z })
        }
        linkAnimator.sync(buildLines(points, MAX_DIST, MAX_NEIGHBORS))
      }

      // …mentre le dissolvenze avanzano a ogni frame: i fili si disegnano.
      const live = linkAnimator.step(dt)
      const count = Math.min(live.length, MAX_LINES)
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const line = live[i]
          const key = line.a + '|' + line.b
          const seed = keySeed(key)
          const phase = reducedMotion ? -1 : pulsePhase(now, seed)

          // Intensità di base del legame: distanza + presenza del filo.
          const base = Math.max(0.05, Math.min(1, line.opacity)) * LINK_GAIN
          const ca = tintFor(line.a, linkColorA)
          const cb = tintFor(line.b, linkColorB)

          const arcOffset = i * VERTS_PER_ARC * 3
          arcPoint(
            { x: line.ax, y: line.ay, z: line.az },
            { x: line.bx, y: line.by, z: line.bz },
            0,
            arcTail,
          )

          for (let sIdx = 0; sIdx < ARC_SEGMENTS; sIdx++) {
            const t0 = sIdx / ARC_SEGMENTS
            const t1 = (sIdx + 1) / ARC_SEGMENTS
            arcPoint(
              { x: line.ax, y: line.ay, z: line.az },
              { x: line.bx, y: line.by, z: line.bz },
              t1,
              arcHead,
            )

            const o = arcOffset + sIdx * 6
            linePositions[o] = arcTail.x
            linePositions[o + 1] = arcTail.y
            linePositions[o + 2] = arcTail.z
            linePositions[o + 3] = arcHead.x
            linePositions[o + 4] = arcHead.y
            linePositions[o + 5] = arcHead.z

            for (let end = 0; end < 2; end++) {
              const t = end === 0 ? t0 : t1
              // il filo si spegne vicino alle stelle, si disegna da a verso b
              // e ogni tanto lo attraversa un respiro di luce
              let v = base * taper(t) * drawReveal(t, line.alpha)
              if (phase >= 0) v *= pulse(t, phase)
              linkColorMix.copy(ca).lerp(cb, t).multiplyScalar(Math.min(1, v))
              const co = o + end * 3
              lineColors[co] = linkColorMix.r
              lineColors[co + 1] = linkColorMix.g
              lineColors[co + 2] = linkColorMix.b
            }

            arcTail.x = arcHead.x
            arcTail.y = arcHead.y
            arcTail.z = arcHead.z
          }
        }
        linePositionsAttribute.needsUpdate = true
        lineColorsAttribute.needsUpdate = true
        lineGeometry.setDrawRange(0, count * VERTS_PER_ARC)
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
