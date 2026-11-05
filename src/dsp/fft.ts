/** In-place iterative radix-2 complex FFT with cached twiddles. */
export class FFT {
  readonly n: number
  private readonly cosT: Float64Array
  private readonly sinT: Float64Array
  private readonly rev: Uint32Array

  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT size must be a power of two')
    this.n = n
    this.cosT = new Float64Array(n / 2)
    this.sinT = new Float64Array(n / 2)
    for (let i = 0; i < n / 2; i++) {
      const a = (-2 * Math.PI * i) / n
      this.cosT[i] = Math.cos(a)
      this.sinT[i] = Math.sin(a)
    }
    const bits = Math.log2(n)
    this.rev = new Uint32Array(n)
    for (let i = 0; i < n; i++) {
      this.rev[i] = (this.rev[i >> 1] >> 1) | ((i & 1) << (bits - 1))
    }
  }

  forward(re: Float64Array, im: Float64Array): void {
    this.transform(re, im, false)
  }

  inverse(re: Float64Array, im: Float64Array): void {
    this.transform(re, im, true)
    const s = 1 / this.n
    for (let i = 0; i < this.n; i++) {
      re[i] *= s
      im[i] *= s
    }
  }

  private transform(re: Float64Array, im: Float64Array, inv: boolean): void {
    const n = this.n
    const rev = this.rev
    for (let i = 0; i < n; i++) {
      const j = rev[i]
      if (j > i) {
        const tr = re[i]
        re[i] = re[j]
        re[j] = tr
        const ti = im[i]
        im[i] = im[j]
        im[j] = ti
      }
    }
    const sign = inv ? -1 : 1
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1
      const step = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = this.cosT[k]
          const wi = sign * this.sinT[k]
          const a = i + j
          const b = a + half
          const tr = re[b] * wr - im[b] * wi
          const ti = re[b] * wi + im[b] * wr
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }
  }
}

export function hann(n: number): Float64Array {
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
  return w
}
