import './style.css'
import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { initFaceLandmarker, detectFace, landmarksFromResult, requestCamera, stopCamera } from './sensing/face'
import { readExpression, type ExpressionReading } from './sensing/expression'
import { makeMomentHash } from './moment/hash'
import { requestCoarseGeo } from './geo/geo'
import { createStarChannel } from './net/channel'
import { createStarRegistry, prune, REMOTE_TTL_MS } from './sky/presence'
import { createRetentionSink, createRetentionGate } from './retention/retention'
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
  presenceEl.textContent = count > 0 ? `${count} ${count === 1 ? 'stella presente' : 'stelle presenti'}` : ''
}

function setConnection(state: 'connecting' | 'connected' | 'off'): void {
  connEl.dataset.state = state
  connEl.textContent = state === 'off' ? '' : state === 'connected' ? '●' : '○'
}

const PUBLISH_INTERVAL_MS = 5_000

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

async function main(): Promise<void> {
  let sky: SkyHandles | null = null
  try {
    // Code-splitting: three.js carica in un chunk separato.
    sky = (await import('./sky/scene')).createSky(canvas)
  } catch {
    setStatus('Grafica 3D non disponibile.')
    return
  }
  sky.setReducedMotion(reducedMotionQuery.matches)
  reducedMotionQuery.addEventListener('change', (event) => sky?.setReducedMotion(event.matches))

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    setStatus('Contesto grafico perso — in ripristino…')
  })
  canvas.addEventListener('webglcontextrestored', () => {
    if (geo?.coarse === 'unknown' || !landmarker) {
      setStatus(landmarker ? 'Cielo aperto.' : 'Camera o modello AI non disponibili — cielo in modalità presenza.')
    } else {
      setStatus(`Stella da ${geo.coarse} — cielo aperto.`)
    }
  })

  let landmarker: FaceLandmarker | null = null
  try {
    await requestCamera(video)
    landmarker = await initFaceLandmarker()
  } catch {
    stopCamera(video)
    setStatus('Camera o modello AI non disponibili — cielo in modalità presenza.')
  }

  const geo = await requestCoarseGeo()
  const birthTime = performance.now()
  let lastStateKey = ''
  let currentMoment: { code: string; seed: string } | null = null
  let momentSeq = 0

  const env = {
    url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
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

  // Aggiorna il colore/luminosità live; senza re-publish/re-log (solo a cambio di key).
  function paintStar(reading: ExpressionReading): void {
    if (!currentMoment) return
    sky?.setStar({
      emotion: reading.emotion,
      confidence: reading.confidence,
      birthTime,
      hash: currentMoment.code,
    })
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
    publish(
      {
        id: channel.ownId,
        hash: code,
        emotion: reading.emotion,
        confidence: Math.round(reading.confidence * 100) / 100,
        // Date.now() (clock reale) per i peer; l'animazione locale usa performance.now().
        birthTime: Date.now(),
      },
      now,
    )
    logRetention(moment, reading, geo.coarse !== 'unknown', now)
  }

  function frame(now: number): void {
    if (landmarker) {
      const result = landmarksFromResult(detectFace(landmarker, video, now))
      const reading = result ? readExpression(result) : { emotion: 'neutral' as const, confidence: 0.2 }
      const key = `${reading.emotion}:${Math.round(reading.confidence * 4) / 4}`
      if (key !== lastStateKey) {
        lastStateKey = key
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

  if (landmarker) {
    setStatus(geo.coarse === 'unknown' ? 'Cielo aperto.' : `Stella da ${geo.coarse} — cielo aperto.`)
  }
  // Se degraded (landmarker null), mantiene il messaggio "Camera o modello AI…" già mostrato.
  requestAnimationFrame(frame)

  window.addEventListener('resize', () => sky?.resize(window.innerWidth, window.innerHeight))

  const ambient = createAmbientAudio({
    onStateChange(active) {
      soundToggle.setAttribute('aria-pressed', String(active))
      soundToggle.textContent = active ? 'Silenzia suono ambientale' : 'Attiva suono ambientale'
    },
  })
  soundToggle.hidden = false
  soundToggle.addEventListener('click', () => {
    if (ambient.active) {
      ambient.stop()
    } else {
      void ambient.start().catch(() => {
        setStatus('Microfono non disponibile — nessun suono ambientale.')
      })
    }
  })

  window.addEventListener('beforeunload', () => {
    window.clearInterval(pruneTimer)
    ambient.stop()
    stopCamera(video)
    channel.dispose()
    sink.dispose()
  })
}

void main().catch((error) => {
  console.error('Avvio fallito:', error)
  setStatus('Impossibile avviare il cielo.')
})
