import { AnalysisCore, type AnalysisFrame, type Onset, type Wants } from './core'

export type EngineStatus = 'idle' | 'starting' | 'running' | 'error'

type Unsub = () => void

/**
 * Owns the AudioContext + microphone stream and fans analysis out to listeners.
 * Everything signal-processing related lives in AnalysisCore so it can be tested without a browser.
 */
class AudioEngine {
  status: EngineStatus = 'idle'
  error: string | null = null
  ctx: AudioContext | null = null
  core: AnalysisCore | null = null
  deviceLabel = ''
  inputLatency = 0.02

  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private frameListeners = new Set<(f: AnalysisFrame) => void>()
  private onsetListeners = new Set<(o: Onset) => void>()
  private statusListeners = new Set<() => void>()
  private wantsByOwner = new Map<string, Partial<Wants>>()
  private a4 = 440
  private minFlux = 7

  get running(): boolean {
    return this.status === 'running'
  }

  /** Best guess of (output + input) latency in seconds. */
  get autoLatency(): number {
    const ctx = this.ctx
    if (!ctx) return 0.05
    const out = ctx.outputLatency || ctx.baseLatency || 0.015
    return out + this.inputLatency
  }

  get signal(): boolean {
    return this.core?.signalNow ?? false
  }

  get levelDb(): number {
    return this.core?.level ?? -120
  }

  ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext({ latencyHint: 'interactive' })
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  onFrame(cb: (f: AnalysisFrame) => void): Unsub {
    this.frameListeners.add(cb)
    return () => this.frameListeners.delete(cb)
  }

  onOnset(cb: (o: Onset) => void): Unsub {
    this.onsetListeners.add(cb)
    return () => this.onsetListeners.delete(cb)
  }

  onStatus(cb: () => void): Unsub {
    this.statusListeners.add(cb)
    return () => this.statusListeners.delete(cb)
  }

  /** Declare which (expensive) analyses an owner needs; they are combined across owners. */
  want(owner: string, w: Partial<Wants> | null): void {
    if (w) this.wantsByOwner.set(owner, w)
    else this.wantsByOwner.delete(owner)
    this.applyWants()
  }

  configure(opts: { a4?: number; minFlux?: number }): void {
    if (opts.a4 !== undefined) this.a4 = opts.a4
    if (opts.minFlux !== undefined) this.minFlux = opts.minFlux
    if (this.core) {
      this.core.a4 = this.a4
      this.core.setOnsetSensitivity(this.minFlux)
    }
  }

  private applyWants(): void {
    if (!this.core) return
    const w: Wants = { pitch: false, chroma: false }
    for (const v of this.wantsByOwner.values()) {
      if (v.pitch) w.pitch = true
      if (v.chroma) w.chroma = true
    }
    this.core.wants = w
  }

  private setStatus(s: EngineStatus, error: string | null = null): void {
    this.status = s
    this.error = error
    this.statusListeners.forEach((l) => l())
  }

  async listInputs(): Promise<MediaDeviceInfo[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      return all.filter((d) => d.kind === 'audioinput')
    } catch {
      return []
    }
  }

  async start(deviceId?: string | null): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') return
    this.setStatus('starting')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser has no microphone access (needs HTTPS or localhost).')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      })
      const ctx = this.ensureContext()
      await ctx.resume()
      await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}worklets/capture.js`)

      const track = stream.getAudioTracks()[0]
      this.deviceLabel = track?.label ?? ''
      const lat = (track?.getSettings?.() as MediaTrackSettings & { latency?: number } | undefined)?.latency
      this.inputLatency = typeof lat === 'number' && lat > 0 && lat < 0.5 ? lat + (ctx.baseLatency || 0) : 0.025

      const core = new AnalysisCore(ctx.sampleRate, {
        onFrame: (f) => this.frameListeners.forEach((l) => l(f)),
        onOnset: (o) => this.onsetListeners.forEach((l) => l(o)),
      })
      this.core = core
      core.a4 = this.a4
      core.setOnsetSensitivity(this.minFlux)

      const source = ctx.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(ctx, 'capture-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
      })
      node.port.onmessage = (e: MessageEvent<{ samples: Float32Array; frame: number }>) => {
        core.pushBlock(e.data.samples, e.data.frame)
      }
      const mute = ctx.createGain()
      mute.gain.value = 0
      source.connect(node)
      node.connect(mute).connect(ctx.destination)

      this.stream = stream
      this.source = source
      this.node = node
      this.applyWants()
      this.setStatus('running')
    } catch (err) {
      const e = err as DOMException
      let msg = e?.message || 'Could not start the microphone.'
      if (e?.name === 'NotAllowedError') msg = 'Microphone permission was denied. Allow it in the browser address bar and try again.'
      if (e?.name === 'NotFoundError') msg = 'No microphone found.'
      this.cleanup()
      this.setStatus('error', msg)
    }
  }

  private cleanup(): void {
    this.node?.port.close()
    this.node?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.node = null
    this.source = null
    this.stream = null
    this.core = null
  }

  async stop(): Promise<void> {
    this.cleanup()
    this.setStatus('idle')
  }

  async restart(deviceId?: string | null): Promise<void> {
    await this.stop()
    await this.start(deviceId)
  }
}

export const engine = new AudioEngine()
