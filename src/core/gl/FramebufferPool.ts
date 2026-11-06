export interface RenderTarget {
  readonly fbo: WebGLFramebuffer;
  readonly tex: WebGLTexture;
  readonly w: number;
  readonly h: number;
}

export type RTFormat = 'rgba16f' | 'r11g11b10f';

export class FramebufferPool {
  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly format: RTFormat = 'rgba16f',
  ) {}

  create(w: number, h: number, filter: 'linear' | 'nearest' = 'linear'): RenderTarget {
    const { gl } = this;
    const tex = gl.createTexture();
    if (!tex) throw new Error('texture alloc failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.format === 'rgba16f') {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R11F_G11F_B10F, w, h, 0, gl.RGB, gl.FLOAT, null);
    }
    const f = filter === 'linear' ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('framebuffer alloc failed');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      throw new Error(`FBO incomplete: 0x${status.toString(16)}`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, w, h };
  }

  destroy(rt: RenderTarget): void {
    this.gl.deleteFramebuffer(rt.fbo);
    this.gl.deleteTexture(rt.tex);
  }
}

// role: allocates/destroys HDR render targets (RGBA16F, or R11F_G11F_B10F when float color
//       buffers are unavailable) and validates completeness at creation time.
// invariants: format fixed at construction — no mixed-precision path; every FBO is status-checked;
//             destroy() is the only release path (keeps the render loop allocation-free).
// owner milestone: M1
