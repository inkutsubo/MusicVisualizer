import { ShaderProgram } from '../../core/gl/ShaderProgram';
import { DataTexture } from '../../core/gl/DataTexture';
import { MASTER_BANDS } from '../../types/audio';
import type { SpectrumBarsConfig } from '../../types/layers';
import type { ILayerRenderer, LayerRenderContext } from '../ILayerRenderer';
import BARS_VERT from './shaders/bars.vert.glsl?raw';
import BARS_FRAG from './shaders/bars.frag.glsl?raw';

export class SpectrumBarsRenderer implements ILayerRenderer {
  readonly kind = 'spectrumBars';
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly spectrumTex: DataTexture;
  private readonly peakTex: DataTexture;
  private cfg: SpectrumBarsConfig;
  private hasColor = false;
  private colorR = 1;
  private colorG = 1;
  private colorB = 1;
  private hasColor2 = false;
  private color2R = 1;
  private color2G = 1;
  private color2B = 1;

  // Distribution/alignment/gradient enums are passed as int uniforms.
  private readonly enumDistribution = { linear: 0, centerOut: 1, edgeIn: 2, dualStereo: 3 } as const;
  private readonly enumAlignment = { bottomUp: 0, topDown: 1, symmetricCenter: 2, mirroredHorizon: 3 } as const;
  private readonly enumGradient = { frequency: 0, amplitude: 1, flat: 2 } as const;

  constructor(gl: WebGL2RenderingContext, cfg: SpectrumBarsConfig) {
    this.gl = gl;
    this.cfg = cfg;
    this.prog = new ShaderProgram(gl, BARS_VERT, BARS_FRAG);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('VAO alloc failed');
    this.vao = vao;
    // Nearest spectrum sampling keeps single-bin peaks at exactly one bar (the sweep/impulse
    // fixtures rely on this); peak-hold stays linear for the future cap pass.
    this.spectrumTex = new DataTexture(gl, MASTER_BANDS, 'nearest');
    this.peakTex = new DataTexture(gl, MASTER_BANDS, 'linear');
  }

  updateConfig(cfg: SpectrumBarsConfig): void {
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
      const v2 = Number.parseInt(cfg.color2.slice(1), 16);
      this.color2R = ((v2 >> 16) & 255) / 255;
      this.color2G = ((v2 >> 8) & 255) / 255;
      this.color2B = (v2 & 255) / 255;
    }
  }

  render(ctx: LayerRenderContext): void {
    const { gl } = this;
    const { audio, width, height, palette } = ctx;
    const cfg = this.cfg;
    if (!cfg.visible || cfg.opacity <= 0) return;

    this.spectrumTex.upload(audio.spectrum);
    this.peakTex.upload(audio.peakHold);

    this.prog.use();
    this.prog.i('u_spectrumTex', 0);
    this.prog.i('u_peakHoldTex', 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.spectrumTex.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.peakTex.tex);
    this.prog.i('u_palette', 2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, palette.tex);
    gl.activeTexture(gl.TEXTURE0);

    this.prog.v2('u_resolution', width, height);
    this.prog.v4('u_layoutRect', ctx.layout.x, ctx.layout.y, ctx.layout.w, ctx.layout.h);
    this.prog.f('u_rotation', this.cfg.rotation);
    this.prog.i('u_barCount', cfg.barCount);
    this.prog.i('u_spectrumBands', MASTER_BANDS);
    this.prog.i('u_distribution', this.enumDistribution[cfg.distribution]);
    this.prog.i('u_alignment', this.enumAlignment[cfg.alignment]);
    this.prog.i('u_gradient', this.enumGradient[cfg.gradientMode]);
    this.prog.f('u_gapRatio', cfg.gapRatio);
    this.prog.f('u_cornerRadius', cfg.cornerRadius);
    this.prog.i('u_hollow', cfg.hollow ? 1 : 0);
    this.prog.i('u_ledSegments', cfg.ledSegments);
    this.prog.f('u_hotCoreIntensity', cfg.hotCoreIntensity);
    this.prog.f('u_opacity', cfg.opacity);
    this.prog.v3('u_colorOverride', this.colorR, this.colorG, this.colorB);
    this.prog.i('u_hasColorOverride', this.hasColor ? 1 : 0);
    this.prog.v3('u_color2', this.color2R, this.color2G, this.color2B);
    this.prog.i('u_hasColor2', this.hasColor2 ? 1 : 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);   // additive in linear-light HDR
    gl.bindVertexArray(this.vao);
    this.prog.i('u_mirror', 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, cfg.barCount);

    if (cfg.alignment === 'mirroredHorizon') {
      // Attenuated reflection pass below the horizon (chosen over the stretched negative-y quad
      // because it keeps the reflection's own AA and tip heat correct).
      this.prog.i('u_mirror', 1);
      this.prog.f('u_opacity', cfg.opacity * 0.35);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, cfg.barCount);
      this.prog.i('u_mirror', 0);
    }

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    this.prog.dispose();
    this.spectrumTex.dispose();
    this.peakTex.dispose();
    this.gl.deleteVertexArray(this.vao);
  }
}

// role: instanced spectrum-bars layer — uploads spectrum/peak-hold, binds the palette, dispatches
//       one instanced draw (plus an attenuated reflection for mirroredHorizon).
// invariants: no per-frame JS allocation; framebuffer/viewport untouched (engine owns them);
//             additive linear-light blending; blend is disabled again before the tone-map pass.
// owner milestone: M3a
