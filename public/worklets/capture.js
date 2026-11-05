// Forwards mono microphone audio to the main thread in 256-sample blocks,
// tagging each block with the absolute frame index of its first sample.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.hop = 256
    this.buf = new Float32Array(this.hop)
    this.n = 0
    this.start = 0
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length; i++) {
      if (this.n === 0) this.start = currentFrame + i
      this.buf[this.n++] = ch[i]
      if (this.n === this.hop) {
        const out = this.buf
        this.port.postMessage({ samples: out, frame: this.start }, [out.buffer])
        this.buf = new Float32Array(this.hop)
        this.n = 0
      }
    }
    return true
  }
}

registerProcessor('capture-processor', CaptureProcessor)
