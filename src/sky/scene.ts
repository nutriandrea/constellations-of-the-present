import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { starSizeForDuration } from './star'
import { EMOTION_PALETTE, mixGamma } from './palette'
import type { StarState } from './star'
import type { EmotionBucket } from '../sensing/expression'
import type { HistoricalStar } from './historical'
import type { TrackedStar } from './presence'
import { REMOTE_TTL_MS } from './presence'
import { hashToPosition, safeSkyRadius } from './remotePosition'
import { buildLines } from './connections'
import { createLinkAnimator } from './constellation'
import { arcPoint, drawReveal, keySeed, pulse, pulsePhase, taper } from './arc'
import { twinkle } from './twinkle'
import { linkContrast } from './linkContrast'
import type { Ambient } from './linkContrast'
import { buildStarfield } from './starfield'

export interface SkyHandles {
  update: (now: number) => void
  setStar: (star: StarState | null) => void
  setRemoteStars: (stars: TrackedStar[]) => void
  /** Stelle storiche (ultime 24h): layer più tenue, fuori dalla costellazione live. */
  setHistoricalStars: (stars: HistoricalStar[]) => void
  resize: (width: number, height: number) => void
  setReducedMotion: (reduced: boolean) => void
  /** Ambiente percepito dello schermo: alza il contrasto dei fili sul chiaro. */
  setAmbient: (ambient: Ambient) => void
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

/**
 * Bloom: appena un velo. Le stelle e i fili devono *respirare* luce, non
 * bruciare. Soglia alta = solo i nuclei più caldi fioriscono; forza bassa e
 * raggio ampio = alone morbido invece di bagliore lattiginoso.
 */
const BLOOM_STRENGTH = 0.42
const BLOOM_RADIUS = 0.72
const BLOOM_THRESHOLD = 0.42
/** Esposizione del tonemapping ACES: sotto 1 per compensare l'additive blending. */
const TONE_EXPOSURE = 0.92

/**
 * Palette del cielo in forma THREE: le sei emozioni prelevate da un unico
 * gradiente globale e livellate in luminanza percepita, così nessuna urla
 * più delle altre. Vedi `palette.ts`.
 */
const SKY_COLORS: Record<EmotionBucket, THREE.Color> = BUCKETS.reduce((acc, bucket) => {
  const c = EMOTION_PALETTE[bucket]
  acc[bucket] = new THREE.Color(c.r, c.g, c.b)
  return acc
}, {} as Record<EmotionBucket, THREE.Color>)

const mixScratch = { r: 0, g: 0, b: 0 }

/** Interpolazione con correzione gamma: la luce si somma in spazio lineare. */
function mixColors(target: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  mixScratch.r = a.r
  mixScratch.g = a.g
  mixScratch.b = a.b
  const out = mixGamma(mixScratch, { r: b.r, g: b.g, b: b.b }, t)
  target.setRGB(out.r, out.g, out.b)
  return target
}

const STARFIELD_COUNT = 1200
const STARFIELD_RADIUS = 55

/**
 * Star sizes. Live stars must be indistinguishable from the background
 * starfield: same apparent diameter on screen, same drift. Only colour and
 * the threads betray a presence.
 */
const OWN_STAR_BASE_SIZE = 0.024
const REMOTE_STAR_SIZE = 0.022
const HISTORICAL_STAR_SIZE = 0.018

interface StarSprite {
  sprite: THREE.Sprite
  /** Materiale dedicato: consente un twinkle indipendente per ogni stella. */
  material: THREE.SpriteMaterial
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
    const color = SKY_COLORS[bucket]
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
  // ACES filmico: le somme additive non si tagliano più a bianco piatto,
  // conservano la tinta dell'emozione anche nei nuclei.
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = TONE_EXPOSURE

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.set(0, 0, 5)

  // Il bloom costa: su schermi molto densi lo calcoliamo a risoluzione ridotta.
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  composer.setSize(window.innerWidth, window.innerHeight)
  composer.addPass(new RenderPass(scene, camera))
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    BLOOM_STRENGTH,
    BLOOM_RADIUS,
    BLOOM_THRESHOLD,
  )
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())

  const bucketMaterials = createBucketMaterials()

  // Everything that belongs to the sky lives in one group: background field,
  // presences and threads drift together, as a single firmament.
  const drift = new THREE.Group()
  scene.add(drift)

  const starfield = createStarfield()
  drift.add(starfield)

  // Own star — dedicated material instance (bucket materials are shared with
  // remotes). No ring, no marker: your star is one of the many.
  const ownMaterial = bucketMaterials.get('neutral')!.clone()
  const ownStar = new THREE.Sprite(ownMaterial)
  ownStar.scale.setScalar(OWN_STAR_BASE_SIZE)
  drift.add(ownStar)

  // Remote stars
  const remoteSprites = new Map<string, StarSprite>()
  const fading: { sprite: StarSprite; started: number }[] = []
  const pool: StarSprite[] = []

  // Historical stars (ultime 24h): layer statico e tenue, popolato una volta.
  const historicalSprites: StarSprite[] = []
  let historicalStars: HistoricalStar[] = []

  function acquireSprite(): StarSprite {
    const star = pool.pop()
    if (star) return star
    const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(material)
    const created = { sprite, material }
    drift.add(sprite)
    return created
  }

  function releaseSprite(star: StarSprite): void {
    star.sprite.visible = false
    pool.push(star)
  }

  function applyBucket(star: StarSprite, bucket: EmotionBucket): void {
    // Copiamo l'aspetto del bucket nel materiale proprio dello sprite: il
    // twinkle deve poter modulare l'opacità di una singola stella senza
    // trascinarsi dietro tutte le altre dello stesso colore.
    const source = bucketMaterials.get(bucket)!
    star.material.map = source.map
    star.material.color.copy(source.color)
    star.material.opacity = source.opacity
    star.material.blending = source.blending
    star.material.transparent = true
    star.material.depthWrite = false
    star.material.needsUpdate = true
    star.sprite.material = star.material
  }

  /** Popola (o riposiziona, dopo un resize) il layer storico delle 24 ore. */
  function placeHistoricalStars(): void {
    for (const sprite of historicalSprites) releaseSprite(sprite)
    historicalSprites.length = 0
    for (const star of historicalStars) {
      const sprite = acquireSprite()
      applyBucket(sprite, star.emotion)
      const pos = positionFor(star.hash)
      sprite.sprite.position.set(pos.x, pos.y, pos.z)
      // Più tenue delle presenze live: solo un ricordo, non un vicino.
      sprite.sprite.scale.setScalar(HISTORICAL_STAR_SIZE)
      sprite.material.opacity = 0.28 + star.confidence * 0.2
      sprite.sprite.visible = true
      historicalSprites.push(sprite)
    }
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
  drift.add(lines)

  const linkAnimator = createLinkAnimator()
  const linkColorA = new THREE.Color()
  const linkColorB = new THREE.Color()
  const linkColorMix = new THREE.Color()
  const arcHead = { x: 0, y: 0, z: 0 }
  const arcTail = { x: 0, y: 0, z: 0 }
  const neutralColor = SKY_COLORS['neutral']
  /** Emozione per capo del filo, per tingere la linea. */
  const emotionByPoint = new Map<string, EmotionBucket>()

  let current: StarState | null = null
  const ownPosition = new THREE.Vector3(0, 0, 0)
  let remote: TrackedStar[] = []
  let reducedMotion = false
  // Su tema chiaro (o schermo molto luminoso) i fili additivi svaniscono:
  // la curva di contrasto li rinforza.
  let ambient: Ambient =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark'
  if (typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia('(prefers-color-scheme: light)')
    query.addEventListener?.('change', (event) => {
      ambient = event.matches ? 'light' : 'dark'
    })
  }
  let lastFrame = 0
  let lastTopology = 0
  const positionCache = new Map<string, { x: number; y: number; z: number }>()
  // Raggio della sfera delle stelle: calcolato dalla forma dello schermo così
  // ogni stella resta sempre dentro la cornice, senza sporgere.
  let skyRadius = safeSkyRadius(camera.aspect)
  let cachedRadius = skyRadius

  function positionFor(hash: string): { x: number; y: number; z: number } {
    if (skyRadius !== cachedRadius) {
      positionCache.clear()
      cachedRadius = skyRadius
    }
    let pos = positionCache.get(hash)
    if (!pos) {
      pos = hashToPosition(hash, skyRadius)
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
    if (!emotion) return target.copy(neutralColor)
    // Neutro → emozione, miscelati in spazio lineare: le tinte restano pulite
    // anche a metà strada, senza il grigio fangoso dell'interpolazione sRGB.
    return mixColors(target, neutralColor, SKY_COLORS[emotion], LINK_TINT)
  }

  return {
    setStar(state: StarState | null) {
      current = state
      if (state) {
        const pos = positionFor(state.hash)
        ownPosition.set(pos.x, pos.y, pos.z)
        ownStar.position.copy(ownPosition)
        ownStar.visible = true
      } else {
        ownStar.visible = false
      }
    },
    setRemoteStars(stars: TrackedStar[]) {
      remote = stars
    },
    setHistoricalStars(stars: HistoricalStar[]) {
      historicalStars = stars
      placeHistoricalStars()
    },
    setReducedMotion(reduced: boolean) {
      reducedMotion = reduced
    },
    setAmbient(next: Ambient) {
      ambient = next
    },
    update(now: number) {
      const dt = lastFrame === 0 ? 16 : Math.min(100, now - lastFrame)
      lastFrame = now

      if (!reducedMotion) {
        // Seamless drift of the whole firmament. The yaw is a continuous
        // rotation (a full turn every ~28 minutes, so the loop is invisible),
        // while pitch and roll are three non-harmonic sines: the sky never
        // repeats the same gesture twice within a viewing. Nothing ever leaves
        // the frame, because the stars only turn around their own centre.
        const t = now / 1000
        drift.rotation.y = t * 0.0037
        drift.rotation.x =
          Math.sin(t * 0.0163) * 0.035 + Math.sin(t * 0.0071 + 1.3) * 0.022
        drift.rotation.z = Math.sin(t * 0.0094 + 0.6) * 0.018
        // Barely-there parallax of the camera: depth without displacement.
        camera.position.x = Math.sin(t * 0.045) * 0.16
        camera.position.y = Math.sin(t * 0.031 + 1.7) * 0.11
        camera.lookAt(0, 0, 0)
      }

      if (current) {
        const elapsed = now - current.birthTime
        const size = starSizeForDuration(elapsed, OWN_STAR_BASE_SIZE)
        const tw = twinkle(now, current.confidence, seedFor(current.hash), reducedMotion)

        ownMaterial.color.copy(SKY_COLORS[current.emotion])
        ownMaterial.opacity = Math.min(1, (0.75 + current.confidence * 0.25) * tw.intensity)
        ownStar.scale.setScalar(size * tw.size)
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
        const tw = twinkle(now, remoteStar.confidence, seedFor(remoteStar.hash), reducedMotion)
        star.sprite.scale.setScalar(REMOTE_STAR_SIZE * tw.size)
        // Ogni stella ha il proprio materiale, così può brillare per conto suo.
        star.material.opacity = Math.min(1, 0.95 * tw.intensity)
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
          sprite.sprite.scale.setScalar(Math.max(0.0001, REMOTE_STAR_SIZE * (1 - t)))
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

          // Intensità di base del legame: distanza + presenza del filo,
          // rimappata dalla curva adattiva (ambiente + affollamento del cielo).
          const base = linkContrast(line.opacity * LINK_GAIN, ambient, count / MAX_LINES)
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
              // Lungo l'arco le due emozioni si fondono con correzione gamma:
              // il passaggio è continuo e non perde saturazione a metà.
              mixColors(linkColorMix, ca, cb, t).multiplyScalar(Math.min(1, v))
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

      composer.render()
    },
    resize(width: number, height: number) {
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      // Il raggio sicuro dipende dalla forma dello schermo: se cambia,
      // riallineamo tutte le stelle alla nuova cornice.
      skyRadius = safeSkyRadius(camera.aspect)
      positionCache.clear()
      cachedRadius = skyRadius
      if (current) {
        const pos = positionFor(current.hash)
        ownPosition.set(pos.x, pos.y, pos.z)
        ownStar.position.copy(ownPosition)
      }
      for (const [hash, star] of remoteSprites) {
        const pos = positionFor(hash)
        star.sprite.position.set(pos.x, pos.y, pos.z)
      }
      placeHistoricalStars()
      renderer.setSize(width, height)
      composer.setSize(width, height)
      bloomPass.setSize(width, height)
    },
  }
}
