import { ShaderProgram } from '../../core/gl/ShaderProgram';
import type { FramebufferPool, RenderTarget } from '../../core/gl/FramebufferPool';
import TRAIL_FRAG from './shaders/trail.frag.glsl?raw';

const VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Ping-pong RGBA16F motion trails: out = max(current, previous * decay). */
export class PersistenceTrailPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly pool: FramebufferPool;
  private readonly prog: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private rtA: RenderTarget | null = null;
  private rtB: RenderTarget | null = null;
  private width = 0;
  private height = 0;

  constructor(gl: WebGL2RenderingContext, pool: FramebufferPool) {
    this.gl = gl;
    this.pool = pool;
    this.prog = new ShaderProgram(gl, VS, TRAIL_FRAG);
    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('trail VAO alloc failed');
    this.vao = vao;
    gl.bindVertexArray(vao);
    gl.bindVertexArray(null);
  }

  resize(width: number, height: number): void {
    if (this.rtA !== null && width === this.width && height === this.height) return;
    const gl = this.gl;
    if (this.rtA !== null) this.pool.destroy(this.rtA);
    if (this.rtB !== null) this.pool.destroy(this.rtB);
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.rtA = this.pool.create(w, h, 'linear');
    this.rtB = this.pool.create(w, h, 'linear');
    this.width = w;
    this.height = h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rtA.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.rtB.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Zeroes both ping-pong targets — used before an offline export for a deterministic start. */
  clear(): void {
    const gl = this.gl;
    for (let i = 0; i < 2; i++) {
      const rt = i === 0 ? this.rtA : this.rtB;
      if (rt === null) continue;
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Renders the merged frame into the spare target, swaps, and returns the merged target. */
  process(current: RenderTarget, decay: number): RenderTarget {
    const gl = this.gl;
    const read = this.rtA;
    const write = this.rtB;
    if (read === null || write === null) throw new Error('trail pass used before resize');

    gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
    gl.viewport(0, 0, write.w, write.h);
    gl.disable(gl.BLEND);
    this.prog.use();
    this.prog.i('u_current', 0);
    this.prog.i('u_prev', 1);
    this.prog.f('u_decay', Math.min(0.96, Math.max(0, decay)));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, current.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, read.tex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    this.rtA = write;
    this.rtB = read;
    return write;
  }

  dispose(): void {
    if (this.rtA !== null) this.pool.destroy(this.rtA);
    if (this.rtB !== null) this.pool.destroy(this.rtB);
    this.rtA = null;
    this.rtB = null;
    this.prog.dispose();
    this.gl.deleteVertexArray(this.vao);
  }
}

// role: persistence trail pass â€” ping-pong half-float feedback with clamped decay.
// invariants: decay clamped to <= 0.96 before upload; max() merge keeps static content from
//             accumulating; resize allocates, process() never does; targets stay linear HDR.
// owner milestone: M5
