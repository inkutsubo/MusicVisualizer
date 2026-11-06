/**
 * 1D data texture stored as a width×1 2D texture (WebGL2 has no true 1D).
 * R32F, single channel. Used for audio spectrum / peak-hold / waveform feeds.
 */
export class DataTexture {
  readonly tex: WebGLTexture;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    readonly width: number,
    filter: 'linear' | 'nearest' = 'nearest',
  ) {
    const t = gl.createTexture();
    if (!t) throw new Error('texture alloc failed');
    this.tex = t;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, 1, 0, gl.RED, gl.FLOAT, null);
    const f = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  upload(data: Float32Array): void {
    if (data.length < this.width) throw new Error(`upload short: ${data.length} < ${this.width}`);
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, 1, gl.RED, gl.FLOAT, data);
  }

  dispose(): void { this.gl.deleteTexture(this.tex); }
}

// role: width×1 R32F texture carrying one scalar row (spectrum, waveform, peak-hold) to shaders.
// invariants: allocation happens once at construction; upload() reuses texSubImage2D so the
//             per-frame path allocates nothing on the GPU or the JS heap.
// owner milestone: M1
