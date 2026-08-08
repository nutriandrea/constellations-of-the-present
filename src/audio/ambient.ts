export interface GainOptions {
  minLevel: number
  maxLevel: number
  maxGain: number
}

/**
 * Maps a live mic RMS level in [minLevel, maxLevel] to a gain in [0, maxGain].
 * Levels at/below minLevel produce silence; levels at/above maxLevel saturate.
 */
export function mapLevelToGain(level: number, { minLevel, maxLevel, maxGain }: GainOptions): number {
  if (level <= minLevel) return 0
  if (level >= maxLevel) return maxGain
  const t = (level - minLevel) / (maxLevel - minLevel)
  return t * maxGain
}

export interface AmbientAudio {
  start(): Promise<void>
  stop(): void
  readonly active: boolean
}

export interface AmbientAudioCallbacks {
  onStateChange: (active: boolean) => void
}

/**
 * Reactive ambient drone. Reads the microphone, computes a live RMS level and
 * drives a soft oscillator+noise bed. No audio is ever recorded or re-emitted:
 * only the instantaneous level is used, then discarded (the mic signal never
 * reaches the speakers — analyser is a read-only sink).
 */
export function createAmbientAudio(callbacks: AmbientAudioCallbacks): AmbientAudio {
  let ctx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let gainNode: GainNode | null = null
  let stream: MediaStream | null = null
  let raf = 0
  let active = false
  let starting = false
  const gainOptions: GainOptions = { minLevel: 0.015, maxLevel: 0.5, maxGain: 0.18 }

  function loop(): void {
    if (!analyser || !gainNode) return
    const data = new Uint8Array(analyser.fftSize)
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / data.length)
    const target = mapLevelToGain(rms, gainOptions)
    gainNode.gain.setTargetAtTime(target, ctx!.currentTime, 0.12)
    raf = requestAnimationFrame(loop)
  }

  function releaseStream(): void {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
  }

  return {
    get active() {
      return active
    },
    async start() {
      if (active || starting) return
      starting = true
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (!starting) {
          releaseStream()
          return
        }
        ctx = new AudioContext()
        analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        gainNode = ctx.createGain()
        gainNode.gain.value = 0

        const source = ctx.createMediaStreamSource(stream)
        source.connect(analyser)

        const osc1 = ctx.createOscillator()
        osc1.type = 'sine'
        osc1.frequency.value = 55
        const osc2 = ctx.createOscillator()
        osc2.type = 'sine'
        osc2.frequency.value = 82.5
        const osc3 = ctx.createOscillator()
        osc3.type = 'triangle'
        osc3.frequency.value = 110

        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 400
        filter.Q.value = 0.5

        osc1.connect(filter)
        osc2.connect(filter)
        osc3.connect(filter)
        filter.connect(gainNode)
        gainNode.connect(ctx.destination)

        osc1.start()
        osc2.start()
        osc3.start()

        active = true
        callbacks.onStateChange(true)
        loop()
      } catch (error) {
        releaseStream()
        if (ctx) {
          void ctx.close().catch(() => undefined)
          ctx = null
        }
        analyser = null
        gainNode = null
        throw error
      } finally {
        starting = false
      }
    },
    stop() {
      if (!active && !starting) return
      starting = false
      cancelAnimationFrame(raf)
      releaseStream()
      if (ctx) {
        void ctx.close().catch(() => undefined)
        ctx = null
      }
      analyser = null
      gainNode = null
      if (active) callbacks.onStateChange(false)
      active = false
    },
  }
}
