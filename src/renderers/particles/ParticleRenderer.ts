import { ShaderProgram } from '../../core/gl/ShaderProgram';
import type { ParticleConfig } from '../../types/layers';
import type { ILayerRenderer, LayerRenderContext } from '../ILayerRenderer';
import PART_VERT from './shaders/particles.vert.glsl?raw';
import PART_FRAG from './shaders/particles.frag.glsl?raw';

const STRIDE = 7;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ParticleRenderer implements ILayerRenderer {
  readonly kind = 'particles';
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private cfg: ParticleConfig;
  private motionBoost = 1;
  private hasColor = false;
  private colorR = 1;
  private colorG = 1;
  private colorB = 1;

  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly type: Float32Array;
  private readonly colorT: Float32Array;
  private readonly data: Float32Array;
  private readonly rand: () => number;

  private cooldown = 0;
  private spawnClock = 0;
  private cursor = 0;

  constructor(gl: WebGL2RenderingContext, cfg: ParticleConfig) {
    this.gl = gl;
    this.cfg = cfg;
    this.prog = new ShaderProgram(gl, PART_VERT, PART_FRAG);
    this.rand = mulberry32(0x51ed270b);

    const n = cfg.count;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.type = new Float32Array(n);
    this.colorT = new Float32Array(n);
    this.data = new Float32Array(n * STRIDE);

    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('particle VAO alloc failed');
    this.vao = vao;
    const vbo = gl.createBuffer();
    if (vbo === null) throw new Error('particle VBO alloc failed');
    this.vbo = vbo;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    const strideBytes = STRIDE * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, strideBytes, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, strideBytes, 8);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, strideBytes, 12);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, strideBytes, 16);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, strideBytes, 20);
    gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, strideBytes, 24);
    gl.vertexAttribDivisor(5, 1);
    gl.bindVertexArray(null);

    // Seed a visible field so particles exist even before the first kick.
    const seed = Math.max(8, Math.floor(cfg.count / 5));
    for (let k = 0; k < seed; k++) this.spawnSeed();
  }

  private spawnSeed(): void {
    const i = this.cursor % this.cfg.count;
    this.cursor = (this.cursor + 1) % this.cfg.count;
    const r = this.rand;
    this.px[i] = r();
    this.py[i] = r();
    this.vx[i] = (r() - 0.5) * 0.16 * this.cfg.speed;
    this.vy[i] = (r() - 0.5) * 0.16 * this.cfg.speed;
    this.maxLife[i] = 1;
    this.life[i] = 0.35 + r() * 0.65;
    this.size[i] = 0.012 + r() * 0.024;
    this.rot[i] = r() * Math.PI * 2;
    this.spin[i] = (r() - 0.5) * 1.8;
    this.type[i] = r() < this.cfg.noteRatio ? 1 : 0;
    this.colorT[i] = r();
  }

  updateConfig(cfg: ParticleConfig): void {
    this.cfg = cfg;
    this.hasColor = /^#[0-9a-fA-F]{6}$/.test(cfg.color);
    if (this.hasColor) {
      const value = Number.parseInt(cfg.color.slice(1), 16);
      this.colorR = ((value >> 16) & 255) / 255;
      this.colorG = ((value >> 8) & 255) / 255;
      this.colorB = (value & 255) / 255;
    }
  }

  private spawn(burst: boolean): void {
    const i = this.cursor % this.cfg.count;
    this.cursor = (this.cursor + 1) % this.cfg.count;
    this.spawnAt(i, burst);
  }

  /** Writes one particle slot at the centre (burst) or on a random edge (ambient). */
  private spawnAt(i: number, burst: boolean): void {
    const r = this.rand;
    const motion = this.cfg.motion;
    if (motion === 'upward') {
      this.px[i] = r();
      this.py[i] = 1.02;
      this.vx[i] = (r() - 0.5) * 0.05 * this.cfg.speed;
      this.vy[i] = -(0.08 + r() * 0.16) * this.cfg.speed * this.motionBoost;
      this.size[i] = 0.01 + r() * 0.022;
      this.maxLife[i] = 1;
      this.life[i] = 1;
      this.rot[i] = r() * Math.PI * 2;
      this.spin[i] = (r() - 0.5) * 1.6;
      this.type[i] = r() < this.cfg.noteRatio ? 1 : 0;
      this.colorT[i] = r();
      return;
    }
    if (motion === 'directional') {
      const angle = (this.cfg.motionAngle * Math.PI) / 180;
      const speed = (0.08 + r() * 0.14) * this.cfg.speed * this.motionBoost;
      this.px[i] = 0.5 + (r() - 0.5) * 0.05;
      this.py[i] = 0.5 + (r() - 0.5) * 0.05;
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed;
      this.size[i] = 0.012 + r() * 0.024;
      this.maxLife[i] = 1;
      this.life[i] = 1;
      this.rot[i] = r() * Math.PI * 2;
      this.spin[i] = (r() - 0.5) * 1.8;
      this.type[i] = r() < this.cfg.noteRatio ? 1 : 0;
      this.colorT[i] = r();
      return;
    }
    if (motion === 'radial') {
      // radial: always spawn at the exact centre and travel outward.
      this.px[i] = 0.5;
      this.py[i] = 0.5;
      const angle = r() * Math.PI * 2;
      const speed = (0.1 + r() * 0.2) * this.cfg.speed * this.motionBoost;
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed;
      this.size[i] = 0.012 + r() * 0.026;
      this.maxLife[i] = 1;
      this.life[i] = 1;
      this.rot[i] = r() * Math.PI * 2;
      this.spin[i] = (r() - 0.5) * 2.2;
      this.type[i] = r() < this.cfg.noteRatio ? 1 : 0;
      this.colorT[i] = r();
      return;
    }
    if (burst) {
      this.px[i] = 0.5 + (r() - 0.5) * 0.06;
      this.py[i] = 0.5 + (r() - 0.5) * 0.06;
      const angle = r() * Math.PI * 2;
      const speed = (0.12 + r() * 0.22) * this.cfg.speed;
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed;
      this.size[i] = 0.014 + r() * 0.026;
    } else {
      const edge = Math.floor(r() * 4);
      if (edge === 0) { this.px[i] = r(); this.py[i] = 0; }
      else if (edge === 1) { this.px[i] = r(); this.py[i] = 1; }
      else if (edge === 2) { this.px[i] = 0; this.py[i] = r(); }
      else { this.px[i] = 1; this.py[i] = r(); }
      this.vx[i] = (r() - 0.5) * 0.14 * this.cfg.speed;
      this.vy[i] = (r() - 0.5) * 0.14 * this.cfg.speed;
      this.size[i] = 0.01 + r() * 0.02;
    }
    this.maxLife[i] = 1;
    this.life[i] = 1;
    this.rot[i] = r() * Math.PI * 2;
    this.spin[i] = (r() - 0.5) * 2.2;
    this.type[i] = r() < this.cfg.noteRatio ? 1 : 0;
    this.colorT[i] = r();
  }

  /** Radial kick: every live particle is pushed away from the centre. */
  private burstOutward(strength: number): void {
    const cfg = this.cfg;
    for (let i = 0; i < cfg.count; i++) {
      if (this.life[i]! <= 0) continue;
      let dx = this.px[i]! - 0.5;
      let dy = this.py[i]! - 0.5;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-4) {
        const angle = this.rand() * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
      } else {
        dx /= len;
        dy /= len;
      }
      const push = strength * (0.35 + this.rand() * 0.35) * cfg.speed;
      this.vx[i] = this.vx[i]! + dx * push;
      this.vy[i] = this.vy[i]! + dy * push;
      this.spin[i] = this.spin[i]! + (this.rand() - 0.5) * 2.5;
    }
  }

  render(ctx: LayerRenderContext): void {
    const cfg = this.cfg;
    if (!cfg.visible || cfg.opacity <= 0) return;
    const dt = Math.min(ctx.dt, 0.1);
    if (dt <= 0) return;

    this.cooldown -= dt;
    this.spawnClock += dt;
    const impulse = Math.max(ctx.audio.transients.kickImpulse, ctx.audio.transients.snareImpulse);
    if (impulse > 0.22 && this.cooldown <= 0) {
      this.cooldown = 0.12;
      this.motionBoost = cfg.motion === 'radial' ? 1 + ctx.audio.bands.bass * 2 : 1;
      this.burstOutward(0.6 + impulse * 1.6);
      const burst = Math.max(4, Math.floor(cfg.count / 12));
      for (let k = 0; k < burst; k++) this.spawn(true);
      this.motionBoost = 1;
    }
    while (this.spawnClock > 0.06) {
      this.spawnClock -= 0.06;
      this.spawn(false);
    }

    const drag = Math.exp(-dt * 0.55);
    const lifeRate = dt / Math.max(0.4, cfg.lifetime);
    const bassPulse = 1 + ctx.audio.bands.bass * 0.6;
    const time = ctx.time;
    let count = 0;
    const data = this.data;
    for (let i = 0; i < cfg.count; i++) {
      this.life[i] = this.life[i]! - lifeRate;
      if (this.life[i]! <= 0) this.spawnAt(i, false);
      const life = this.life[i]!;
      // Chaotic 2D drift: drag plus a curl-like acceleration that depends on position/time.
      const ax = Math.sin(this.py[i]! * 9.0 + time * 1.3) * 0.05;
      const ay = Math.cos(this.px[i]! * 11.0 - time * 1.1) * 0.05;
      this.vx[i] = (this.vx[i]! + ax * dt) * drag;
      this.vy[i] = (this.vy[i]! + ay * dt) * drag;
      this.px[i] = this.px[i]! + this.vx[i]! * dt;
      this.py[i] = this.py[i]! + this.vy[i]! * dt;
      if (this.px[i]! < -0.1 || this.px[i]! > 1.1 || this.py[i]! < -0.1 || this.py[i]! > 1.1) {
        this.spawnAt(i, false);
        continue;
      }
      this.rot[i] = this.rot[i]! + this.spin[i]! * dt;
      const alpha = Math.min(1, life * 1.4);
      const o = count * STRIDE;
      data[o] = this.px[i]!;
      data[o + 1] = this.py[i]!;
      data[o + 2] = this.size[i]! * (0.35 + 0.65 * life) * bassPulse;
      data[o + 3] = this.rot[i]!;
      data[o + 4] = alpha;
      data[o + 5] = this.type[i]!;
      data[o + 6] = this.colorT[i]!;
      count++;
    }

    if (count === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * STRIDE);

    this.prog.use();
    this.prog.v4('u_layoutRect', ctx.layout.x, ctx.layout.y, ctx.layout.w, ctx.layout.h);
    this.prog.v2('u_resolution', ctx.width, ctx.height);
    this.prog.f('u_glow', cfg.glow);
    this.prog.f('u_opacity', cfg.opacity);
    this.prog.v3('u_colorOverride', this.colorR, this.colorG, this.colorB);
    this.prog.i('u_hasColorOverride', this.hasColor ? 1 : 0);
    this.prog.i('u_palette', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ctx.palette.tex);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    this.prog.dispose();
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteVertexArray(this.vao);
  }
}

// role: particle layer — deterministic CPU particle simulation with kick/snare bursts, rendered
//       as instanced procedural diamond/eighth-note billboards.
// invariants: preallocated arrays only; simulation uses dt (export-deterministic); emission is
//             capped by cfg.count and the layout rectangle is applied in the vertex shader.
// owner milestone: M11
