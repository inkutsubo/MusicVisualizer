import { ShaderProgram } from '../../core/gl/ShaderProgram';
import type { FramebufferPool, RenderTarget } from '../../core/gl/FramebufferPool';
import BLOOM_DOWN_FRAG from './shaders/bloom_down.frag.glsl?raw';
import BLOOM_UP_FRAG from './shaders/bloom_up.frag.glsl?raw';

const VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const LEVELS = 4;

/** Dual-Kawase HDR bloom: 4 downsampled mips (1/2 .. 1/16), thresholded, then additive upsample. */
export class DualKawaseBloomPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly pool: FramebufferPool;
  private readonly downProg: ShaderProgram;
  private readonly upProg: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly mips: RenderTarget[] = [];
  private width = 0;
  private height = 0;

  constructor(gl: WebGL2RenderingContext, pool: FramebufferPool) {
    this.gl = gl;
    this.pool = pool;
    this.downProg = new ShaderProgram(gl, VS, BLOOM_DOWN_FRAG);
    this.upProg = new ShaderProgram(gl, VS, BLOOM_UP_FRAG);
    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('bloom VAO alloc failed');
    this.vao = vao;
    gl.bindVertexArray(vao);
  }

  resize(width: number, height: number): void {
    if (this.mips.length > 0 && width === this.width && height === this.height) return;
    for (let i = 0; i < this.mips.length; i++) this.pool.destroy(this.mips[i]!);
    this.mips.length = 0;
    let w = Math.max(1, width);
    let h = Math.max(1, height);
    for (let i = 0; i < LEVELS; i++) {
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      this.mips.push(this.pool.create(w, h, 'linear'));
    }
    this.width = width;
    this.height = height;

    const gl = this.gl;
    for (let i = 0; i < this.mips.length; i++) {
      const m = this.mips[i]!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private down(
    srcTex: WebGLTexture,
    srcW: number,
    srcH: number,
    dst: RenderTarget,
    threshold: number,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.disable(gl.BLEND);
    this.downProg.use();
    this.downProg.i('u_src', 0);
    this.downProg.v2('u_texel', 1 / Math.max(1, srcW), 1 / Math.max(1, srcH));
    this.downProg.f('u_threshold', threshold);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private up(src: RenderTarget, dst: RenderTarget): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    this.upProg.use();
    this.upProg.i('u_src', 0);
    this.upProg.v2('u_texel', 1 / Math.max(1, src.w), 1 / Math.max(1, src.h));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  /** Downsample/threshold then upsample; returns the half-resolution bloom target. */
  process(scene: RenderTarget, threshold: number): RenderTarget {
    if (this.mips.length !== LEVELS) throw new Error('bloom pass used before resize');
    this.down(scene.tex, scene.w, scene.h, this.mips[0]!, Math.max(0, threshold));
    for (let i = 1; i < LEVELS; i++) {
      const src = this.mips[i - 1]!;
      this.down(src.tex, src.w, src.h, this.mips[i]!, 0);
    }
    for (let i = LEVELS - 1; i > 0; i--) {
      this.up(this.mips[i]!, this.mips[i - 1]!);
    }
    this.gl.bindVertexArray(null);
    return this.mips[0]!;
  }

  dispose(): void {
    for (let i = 0; i < this.mips.length; i++) this.pool.destroy(this.mips[i]!);
    this.mips.length = 0;
    this.downProg.dispose();
    this.upProg.dispose();
    this.gl.deleteVertexArray(this.vao);
  }
}

// role: dual-Kawase bloom — 13-tap thresholded downsample chain and 9-tap additive upsample.
// invariants: threshold gates HDR content once (first tap), mips are half-float linear, all
//             targets allocated in resize(), and process() performs no JS allocation.
// owner milestone: M5
