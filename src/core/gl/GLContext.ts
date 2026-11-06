export interface GLContextCaps {
  colorBufferFloat: boolean;
  colorBufferHalfFloat: boolean;
  floatBlend: boolean;
  linearFloat: boolean;
}

export class GLContext {
  readonly gl: WebGL2RenderingContext;
  readonly caps: GLContextCaps;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.caps = {
      colorBufferFloat: !!gl.getExtension('EXT_color_buffer_float'),
      colorBufferHalfFloat: !!gl.getExtension('EXT_color_buffer_half_float'),
      floatBlend: !!gl.getExtension('EXT_float_blend'),
      linearFloat: !!gl.getExtension('OES_texture_float_linear'),
    };
    if (!this.caps.colorBufferFloat && !this.caps.colorBufferHalfFloat) {
      throw new Error('Device lacks float framebuffer support (need EXT_color_buffer_float)');
    }
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const pw = Math.max(1, Math.round(cssW * dpr));
    const ph = Math.max(1, Math.round(cssH * dpr));
    if (this.gl.canvas.width !== pw || this.gl.canvas.height !== ph) {
      this.gl.canvas.width = pw;
      this.gl.canvas.height = ph;
    }
  }

  get drawingBufferSize(): { w: number; h: number } {
    const c = this.gl.canvas as HTMLCanvasElement;
    return { w: c.width, h: c.height };
  }
}

// role: sole owner of the WebGL2 context — creation, capability probe, drawing-buffer sizing.
// invariants: webgl2 only (throws otherwise, no WebGL1 fallback); HDR is impossible without a
//             float color buffer, so construction fails loudly; resize only touches the canvas.
// owner milestone: M1
