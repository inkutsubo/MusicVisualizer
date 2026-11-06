import { ShaderProgram } from '../../core/gl/ShaderProgram';
import { DataTexture } from '../../core/gl/DataTexture';
import { MASTER_BANDS } from '../../types/audio';
import type { RadialSpectrumConfig } from '../../types/layers';
import type { ILayerRenderer, LayerRenderContext } from '../ILayerRenderer';
import RADIAL_VERT from './shaders/radial.vert.glsl?raw';
import RADIAL_FRAG from './shaders/radial.frag.glsl?raw';

const TAU = Math.PI * 2;
const BASS_EXPAND_PX = 12;   // must match BASS_EXPAND_PX in radial.vert.glsl
const RETICLE_MARGIN_PX = 16;

export class RadialSpectrumRenderer implements ILayerRenderer {
  readonly kind = 'radialSpectrum';
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly spectrumTex: DataTexture;
  private cfg: RadialSpectrumConfig;
  private hasColor = false;
  private hasColor2 = false;
  private colorR = 1;
  private colorG = 1;
  private colorB = 1;
  private color2R = 1;
  private color2G = 1;
  private color2B = 1;

  /** Integrated rotation: Φ_audio delta scaled by bass + idle-omega drift. */
  private rot = 0;
  private prevPhase = 0;
  private hasPhase = false;

  constructor(gl: WebGL2RenderingContext, cfg: RadialSpectrumConfig) {
    this.gl = gl;
    this.cfg = cfg;
    this.prog = new ShaderProgram(gl, RADIAL_VERT, RADIAL_FRAG);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('VAO alloc failed');
    this.vao = vao;
    this.spectrumTex = new DataTexture(gl, MASTER_BANDS, 'nearest');
  }

  updateConfig(cfg: RadialSpectrumConfig): void {
    this.cfg = cfg;
    this.hasColor = /^#[0-9a-fA-F]{6}$/.test(cfg.color);
    if (this.hasColor) {
      const value = Number.parseInt(cfg.color.slice(1), 16);
      this.colorR = ((value >> 16) & 255) / 255;
      this.colorG = ((value >> 8) & 255) / 255;
      this.colorB = (value & 255) / 255;
    }
    this.hasColor2 = /^#[0-9a-fA-F]{6}$/.test(cfg.color2);
    if (this.hasColor2) {
      const value = Number.parseInt(cfg.color2.slice(1), 16);
      this.color2R = ((value >> 16) & 255) / 255;
      this.color2G = ((value >> 8) & 255) / 255;
      this.color2B = (value & 255) / 255;
    }
  }

  render(ctx: LayerRenderContext): void {
    const { gl } = this;
    const { audio, width, height, palette, dt } = ctx;
    const cfg = this.cfg;
    if (!cfg.visible || cfg.opacity <= 0) return;

    this.spectrumTex.upload(audio.spectrum);

    // Rotation is integrated, not phase * gain: multiplying an accumulated phase by a
    // time-varying bass gain would make the rings jump whenever the kick hits.
    let dPhi = this.hasPhase ? audio.phaseAudio - this.prevPhase : 0;
    if (dPhi < 0 || dPhi > 0.5) dPhi = 0;   // fixture reset / seek
    this.prevPhase = audio.phaseAudio;
    this.hasPhase = true;
    const bass = Math.min(Math.max(audio.bands.bass, 0), 1);
    this.rot += dPhi * (1 + cfg.audioOmega * bass) + cfg.idleOmega * dt;
    if (this.rot > TAU) this.rot -= TAU;

    const barCount = Math.max(16, Math.min(512, Math.round(cfg.barCount)));
    const symmetry = Math.max(1, Math.min(8, Math.round(cfg.symmetry)));
    const rings = Math.max(0, Math.min(16, Math.round(cfg.reticleRings)));
    const ticks = Math.max(0, Math.round(cfg.reticleTicks));

    const minDim = Math.min(width, height);
    const rBase = cfg.baseRadius * 0.5 * minDim;
    const rLen = cfg.barLength * 0.5 * minDim;
    const ring = cfg.style === 'ring';
    const ringDraw = 720;
    const ringLen = minDim * 0.02;
    const rOuter = Math.min(rBase + rLen + BASS_EXPAND_PX + RETICLE_MARGIN_PX, minDim * 0.5 - 2);
    const retBase = Math.max(rBase, 8);

    this.prog.use();
    this.prog.i('u_spectrumTex', 0);
    this.prog.i('u_palette', 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.spectrumTex.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, palette.tex);
    gl.activeTexture(gl.TEXTURE0);

    this.prog.v2('u_resolution', width, height);
    this.prog.v4('u_layoutRect', ctx.layout.x, ctx.layout.y, ctx.layout.w, ctx.layout.h);
    this.prog.i('u_spectrumBands', MASTER_BANDS);
    this.prog.i('u_symmetry', symmetry);
    this.prog.i('u_barCount', barCount);
    this.prog.i('u_style', cfg.style === 'ring' ? 1 : 0);
    this.prog.i('u_ringCount', 720);
    this.prog.f('u_baseRadius', rBase);
    this.prog.f('u_barLength', ring ? ringLen : rLen);
    this.prog.f('u_barWidth', Math.min(Math.max(cfg.barWidth, 0), 1));
    this.prog.f('u_phase', this.rot);
    this.prog.f('u_bass', bass);
    this.prog.i('u_reticleRings', rings);
    this.prog.i('u_reticleTicks', ticks);
    this.prog.f('u_retBase', retBase);
    this.prog.f('u_retOuter', rOuter);
    this.prog.v2('u_clipExt', rOuter / (width * 0.5), rOuter / (height * 0.5));
    this.prog.f('u_opacity', cfg.opacity);
    this.prog.v3('u_colorOverride', this.colorR, this.colorG, this.colorB);
    this.prog.i('u_hasColorOverride', this.hasColor ? 1 : 0);
    this.prog.v3('u_color2', this.color2R, this.color2G, this.color2B);
    this.prog.i('u_hasColor2', this.hasColor2 ? 1 : 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);   // additive in linear-light HDR
    gl.bindVertexArray(this.vao);

    if (rings > 0 || ticks > 0) {
      this.prog.i('u_pass', 1);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 1);
    }
    if (cfg.showContinuousWave) {
      this.prog.i('u_pass', 2);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, barCount);
    }
    this.prog.i('u_pass', 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, ring ? ringDraw : barCount);

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    this.prog.dispose();
    this.spectrumTex.dispose();
    this.gl.deleteVertexArray(this.vao);
  }
}

// role: radial spectrum layer — three passes (SDF reticle, continuous trace, instanced bars) with
//       audio-driven rotation and bass-elastic radius.
// invariants: rotation = integrated Φ_audio delta × (1 + audioOmega·bass) + idleOmega·dt, so it
//             slows to idle drift in silence and never uses wall-clock time; no per-frame JS
//             allocation; framebuffer/viewport stay owned by the engine.
// owner milestone: M3c
