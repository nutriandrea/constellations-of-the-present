import './style.css'
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { initFaceLandmarker, detectFace, landmarksFromResult, requestCamera } from './sensing/face'
import { readExpression, type ExpressionReading } from './sensing/expression'
import { makeMomentHash } from './moment/hash'
import { createSky } from './sky/scene'
import { requestCoarseGeo } from './geo/geo'
import { createStarChannel } from './net/channel'
import { createStarRegistry, prune, REMOTE_TTL_MS } from './sky/presence'
import { createRetentionSink, createRetentionGate } from './retention/retention'
import type { RemoteStar } from './net/StarChannel'

const canvas = document.getElementById('sky') as HTMLCanvasElement
const statusEl = document.getElementById('status') as HTMLDivElement
const presenceEl = document.getElementById('presence') as HTMLDivElement
const connEl = document.getElementById('conn') as HTMLDivElement
const video = document.getElementById('cam') as HTMLVideoElement
const codeEl = document.getElementById('code') as HTMLSpanElement

const sky = createSky(canvas)

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

async function main(): Promise<void> {
  try {
    await requestCamera(video)
  } catch {
    setStatus('Camera non disponibile — stella a bassa confidenza.')
  }

  let landmarker: FaceLandmarker | null = null
  try {
    landmarker = await initFaceLandmarker()
  } catch {
    setStatus('Modello AI non caricato.')
    return
  }
  if (!landmarker) return
  const lm = landmarker

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
      sky.setRemoteStars(registry.list())
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
      sky.setRemoteStars(registry.list())
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

  function applyMoment(moment: { code: string; seed: string }, reading: ExpressionReading, now: number): void {
    const code = moment.code
    currentMoment = moment
    sky.setStar({
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
        birthTime: Date.now(),
      },
      now,
    )
    logRetention(moment, reading, geo.coarse !== 'unknown', now)
  }

  function frame(now: number): void {
    const result = landmarksFromResult(detectFace(lm, video, now))
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
      applyMoment(currentMoment, reading, now)
    }
    sky.update(now)
    requestAnimationFrame(frame)
  }

  setStatus(geo.coarse === 'unknown' ? 'Cielo aperto.' : `Stella da ${geo.coarse} — cielo aperto.`)
  requestAnimationFrame(frame)

  window.addEventListener('beforeunload', () => {
    window.clearInterval(pruneTimer)
    channel.dispose()
    sink.dispose()
  })
}

window.addEventListener('resize', () => sky.resize(window.innerWidth, window.innerHeight))

void main()
