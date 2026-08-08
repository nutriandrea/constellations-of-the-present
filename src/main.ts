import './style.css'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { initFaceLandmarker, detectFace, blendshapesFromResult, requestCamera, stopCamera } from './sensing/face'
import { readExpressionFromBlendshapes, type ExpressionReading } from './sensing/expression'
import { createEmotionSmoother } from './sensing/smoother'
import { makeMomentHash } from './moment/hash'
import { requestCoarseGeo } from './geo/geo'
import { createStarChannel } from './net/channel'
import { createStarRegistry, prune, REMOTE_TTL_MS } from './sky/presence'
import { createRetentionSink, createRetentionGate } from './retention/retention'
import { projectRecentStars } from './sky/historical'
import { createAmbientAudio } from './audio/ambient'
import type { RemoteStar } from './net/StarChannel'
import type { SkyHandles } from './sky/scene'

const canvas = document.getElementById('sky') as HTMLCanvasElement
const statusEl = document.getElementById('status') as HTMLDivElement
const presenceEl = document.getElementById('presence') as HTMLDivElement
const connEl = document.getElementById('conn') as HTMLDivElement
const video = document.getElementById('cam') as HTMLVideoElement
const codeEl = document.getElementById('code-value') as HTMLSpanElement
const soundToggle = document.getElementById('sound-toggle') as HTMLButtonElement

function setStatus(text: string): void {
  statusEl.textContent = text
}

function setPresence(count: number): void {
  presenceEl.textContent = count > 0 ? `${count} ${count === 1 ? 'star present' : 'stars present'}` : ''
}

function setConnection(state: 'connecting' | 'connected' | 'off'): void {
  connEl.dataset.state = state
  connEl.textContent = state === 'off' ? '' : state === 'connected' ? '●' : '○'
}

const PUBLISH_INTERVAL_MS = 5_000
/** How often the historical sky (last 24h) is refreshed. */
const HISTORICAL_REFRESH_MS = 5 * 60_000
/** Stillness before the interface withdraws and only the sky remains. */
const IDLE_AFTER_MS = 1_000

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

async function main(): Promise<void> {
  let sky: SkyHandles | null = null
  try {
    // Code-splitting: three.js loads in its own chunk.
    sky = (await import('./sky/scene')).createSky(canvas)
  } catch {
    setStatus('3D graphics unavailable.')
    return
  }
  sky.setReducedMotion(reducedMotionQuery.matches)
  reducedMotionQuery.addEventListener('change', (event) => sky?.setReducedMotion(event.matches))

  let cameraReady = false
  let modelReady = false
  let faceVisible = false
  let geo: { coarse: string } = { coarse: 'unknown' }

  function refreshStatus(): void {
    if (!cameraReady) {
      setStatus('Camera unavailable — sky in presence mode.')
    } else if (!modelReady) {
      setStatus('Model unavailable — sky in presence mode.')
    } else if (!faceVisible) {
      setStatus('Look into the camera to light your star.')
    } else {
      setStatus(geo.coarse === 'unknown' ? 'Sky open.' : `Star from ${geo.coarse} — sky open.`)
    }
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    setStatus('Graphics context lost — restoring…')
  })
  canvas.addEventListener('webglcontextrestored', refreshStatus)

  let landmarker: FaceLandmarker | null = null
  try {
    await requestCamera(video)
    cameraReady = true
  } catch {
    cameraReady = false
  }
  if (cameraReady) {
    try {
      landmarker = await initFaceLandmarker()
      modelReady = true
    } catch {
      modelReady = false
      stopCamera(video)
    }
  }

  const resolvedGeo = await requestCoarseGeo()
  geo = resolvedGeo
  const birthTime = performance.now()
  let currentMoment: { code: string; seed: string } | null = null
  let lastRemoteStar: RemoteStar | null = null
  let momentSeq = 0

  // Deploy panels can hand back env values with stray spaces or newlines
  // pasted in by mistake: trim before use, otherwise the realtime WebSocket
  // is rejected (apikey ending in %0A).
  const cleanEnv = (value: unknown): string | undefined => {
    const text = typeof value === 'string' ? value.trim() : ''
    return text.length > 0 ? text : undefined
  }
  const env = {
    url: cleanEnv(import.meta.env.VITE_SUPABASE_URL),
    key: cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY),
  }
  const channel = createStarChannel(env)
  const registry = createStarRegistry(new Set([channel.ownId]))
  const sink = createRetentionSink(env)

  channel.connect()
  if (channel.kind === 'noop') {
    setConnection('off')
  } else {
    setConnection('connecting')
    channel.onStars((stars) => {
      setConnection('connected')
      for (const star of stars) registry.apply(star, performance.now())
      sky?.setRemoteStars(registry.list())
      setPresence(registry.size())
    })
  }

  const smoother = createEmotionSmoother()
  let lastPublishedAt = 0

  function publish(star: RemoteStar, now: number): void {
    if (now - lastPublishedAt < PUBLISH_INTERVAL_MS) return
    lastPublishedAt = now
    channel.publish(star)
  }

  const pruneTimer = window.setInterval(() => {
    const removed = prune(registry, performance.now(), REMOTE_TTL_MS)
    if (removed.length > 0) {
      sky?.setRemoteStars(registry.list())
      setPresence(registry.size())
    }
  }, 2_000)

  let lastLoggedSeed = ''
  const retentionGate = createRetentionGate(PUBLISH_INTERVAL_MS)

  function logRetention(moment: { seed: string }, reading: ExpressionReading, geoOptIn: boolean, now: number): void {
    if (sink.kind === 'noop') return
    if (!retentionGate(now)) return
    if (moment.seed === lastLoggedSeed) return
    lastLoggedSeed = moment.seed
    sink.log({
      hashSeed: moment.seed,
      emotion: reading.emotion,
      confidence: reading.confidence,
      ageBand: null,
      geoOptIn,
      ts: Date.now(),
    })
  }

  // Updates colour/brightness of the star (which stays the same for the whole
  // visit); no re-publish/re-log, peers see the colour change with the
  // periodic heartbeat.
  function paintStar(reading: ExpressionReading): void {
    if (!currentMoment) return
    sky?.setStar({
      emotion: reading.emotion,
      confidence: reading.confidence,
      birthTime,
      hash: currentMoment.code,
    })
    if (lastRemoteStar) {
      lastRemoteStar.emotion = reading.emotion
      lastRemoteStar.confidence = Math.round(reading.confidence * 100) / 100
    }
  }

  function applyMoment(moment: { code: string; seed: string }, reading: ExpressionReading, now: number): void {
    const code = moment.code
    currentMoment = moment
    sky?.setStar({
      emotion: reading.emotion,
      confidence: reading.confidence,
      birthTime,
      hash: code,
    })
    codeEl.textContent = code.slice(0, 12)
    lastRemoteStar = {
      id: channel.ownId,
      hash: code,
      emotion: reading.emotion,
      confidence: Math.round(reading.confidence * 100) / 100,
      // Date.now() (wall clock) for peers; local animation uses performance.now().
      birthTime: Date.now(),
    }
    publish(lastRemoteStar, now)
    logRetention(moment, reading, geo.coarse !== 'unknown', now)
  }

  function frame(now: number): void {
    if (landmarker) {
      const blendshapes = blendshapesFromResult(detectFace(landmarker, video, now))
      const nextFace = blendshapes !== null
      if (nextFace !== faceVisible) {
        faceVisible = nextFace
        refreshStatus()
      }
      // Without a face we do not push neutrals into the smoother (a blink must
      // not switch off a stable emotion); we only paint the neutral star.
      const reading = blendshapes
        ? smoother.push(readExpressionFromBlendshapes(blendshapes))
        : { emotion: 'neutral' as const, confidence: 0.2 }
      // The star is born ONCE, the first time the face is seen: code, position
      // and identity stay fixed for the whole visit. Emotion only changes the
      // colour, never the star.
      if (!currentMoment && blendshapes) {
        const seq = ++momentSeq
        void makeMomentHash(reading.emotion, reading.confidence, null, now - birthTime).then((moment) => {
          if (seq !== momentSeq) return
          applyMoment(moment, reading, now)
        })
      } else if (currentMoment) {
        paintStar(reading)
      }
    }
    sky?.update(now)
    requestAnimationFrame(frame)
  }

  refreshStatus()
  requestAnimationFrame(frame)

  // Immersion: after a few still seconds the interface withdraws and only the
  // sky remains. It returns on the first move, touch or key.
  let idleTimer: number | undefined
  const wake = (): void => {
    document.body.dataset.idle = 'false'
    if (idleTimer !== undefined) window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => {
      document.body.dataset.idle = 'true'
    }, IDLE_AFTER_MS)
  }
  for (const evt of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(evt, wake, { passive: true })
  }
  wake()

  // Presence heartbeat: republish the same star every 5s even without an
  // emotion change, so peers keep it alive across missed network beats.
  const heartbeatTimer = window.setInterval(() => {
    if (lastRemoteStar) channel.publish(lastRemoteStar)
  }, PUBLISH_INTERVAL_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && lastRemoteStar) channel.publish(lastRemoteStar)
  })

  // Historical sky: stars from the last 24h, sampled at start and then slowly
  // refreshed. Only when the backend is configured.
  let historicalTimer: number | undefined
  if (sink.kind !== 'noop') {
    const refreshHistorical = (): void => {
      void sink.loadRecentStars().then((stars) => {
        sky?.setHistoricalStars(projectRecentStars(stars, Date.now()))
      })
    }
    refreshHistorical()
    historicalTimer = window.setInterval(refreshHistorical, HISTORICAL_REFRESH_MS)
  }

  window.addEventListener('resize', () => sky?.resize(window.innerWidth, window.innerHeight))

  const ambient = createAmbientAudio({
    onStateChange(active) {
      soundToggle.setAttribute('aria-pressed', String(active))
      soundToggle.textContent = active ? 'sound on' : 'sound'
    },
  })
  soundToggle.hidden = false
  soundToggle.addEventListener('click', () => {
    if (ambient.active) {
      ambient.stop()
    } else {
      void ambient.start().catch(() => {
        setStatus('Microphone unavailable — no ambient sound.')
      })
    }
  })

  window.addEventListener('beforeunload', () => {
    window.clearInterval(pruneTimer)
    window.clearInterval(heartbeatTimer)
    if (historicalTimer !== undefined) window.clearInterval(historicalTimer)
    if (idleTimer !== undefined) window.clearTimeout(idleTimer)
    ambient.stop()
    stopCamera(video)
    channel.dispose()
    sink.dispose()
  })
}

void main().catch((error) => {
  console.error('Startup failed:', error)
  setStatus('Unable to start the sky.')
})
