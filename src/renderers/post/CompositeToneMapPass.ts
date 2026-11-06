import { ShaderProgram } from '../../core/gl/ShaderProgram';
import COMPOSITE_FRAG from './shaders/composite.frag.glsl?raw';

const VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Final pass: trail scene + bloom → chromatic aberration, vignette, ACES, sRGB, dither. */
export class CompositeToneMapPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = new ShaderProgram(gl, VS, COMPOSITE_FRAG);
    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('composite VAO alloc failed');
    this.vao = vao;
  }

  render(
    sceneTex: WebGLTexture,
    bloomTex: WebGLTexture,
    width: number,
    height: number,
    chromatic: number,
    bloomIntensity: number,
    vignette: number,
    exposure: number,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    this.prog.use();
    this.prog.i('u_scene', 0);
    this.prog.i('u_bloom', 1);
    this.prog.v2('u_resolution', width, height);
    this.prog.f('u_chromatic', chromatic);
    this.prog.f('u_bloomIntensity', bloomIntensity);
    this.prog.f('u_vignette', vignette);
    this.prog.f('u_exposure', exposure);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.prog.dispose();
    this.gl.deleteVertexArray(this.vao);
  }
}

// role: composite tone-map — the only pass that writes sRGB to the default framebuffer.
// invariants: ACES then linear→sRGB; chromatic split is zero at screen centre; vignette is
//             aspect-corrected; dither is deterministic per pixel (no clock term).
// owner milestone: M5
