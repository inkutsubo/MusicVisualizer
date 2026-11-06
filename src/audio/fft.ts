/**
 * In-place iterative Cooley–Tukey radix-2 FFT. All lookup tables are built once in the
 * constructor; `transform` performs no allocations.
 */
export class FFT {
  public readonly size: number;
  private readonly rev: Uint16Array;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) throw new Error('FFT size must be a power of two >= 2');
    this.size = size;
    this.rev = new Uint16Array(size);
    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);

    const bits = Math.log2(size) | 0;
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    for (let i = 0; i < size / 2; i++) {
      const a = (-2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(a);
      this.sinTable[i] = Math.sin(a);
    }
  }

  /** In-place complex FFT. `real`/`imag` must both have length === size. */
  transform(real: Float32Array, imag: Float32Array): void {
    const n = this.size;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i]!;
      if (j > i) {
        const tr = real[i]!; real[i] = real[j]!; real[j] = tr;
        const ti = imag[i]!; imag[i] = imag[j]!; imag[j] = ti;
      }
    }
    const cos = this.cosTable;
    const sin = this.sinTable;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let off = 0; off < n; off += len) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step]!;
          const wi = sin[k * step]!;
          const a = off + k;
          const b = a + half;
          const tr = real[b]! * wr - imag[b]! * wi;
          const ti = real[b]! * wi + imag[b]! * wr;
          real[b] = real[a]! - tr;
          imag[b] = imag[a]! - ti;
          real[a] = real[a]! + tr;
          imag[a] = imag[a]! + ti;
        }
      }
    }
  }
}

// role: allocation-free radix-2 FFT used exclusively by the DSP worker.
// invariants: power-of-two size, in-place transform, no per-call heap allocation.
// owner milestone: M9
