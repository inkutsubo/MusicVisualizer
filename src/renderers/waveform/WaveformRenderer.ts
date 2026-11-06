import { ShaderProgram } from '../../core/gl/ShaderProgram';
import { DataTexture } from '../../core/gl/DataTexture';
import { WAVEFORM_SAMPLES } from '../../types/audio';
import type { WaveformConfig } from '../../types/layers';
import type { ILayerRenderer, LayerRenderContext } from '../ILayerRenderer';
import WAVE_VERT from './shaders/waveform.vert.glsl?raw';
import WAVE_FRAG from './shaders/waveform.frag.glsl?raw';

/** Thickness is authored against a 1080p reference and scaled to the current backing height. */
const REFERENCE_HEIGHT = 1080;

export class WaveformRenderer implements ILayerRenderer {
  readonly kind = 'waveform';
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly waveTex: DataTexture;
  private cfg: WaveformConfig;
  private hasColor = false;
  private colorR = 1;
  private colorG = 1;
  private colorB = 1;
  private hasColor2 = false;
  private color2R = 1;
  private color2G = 1;
  private color2B = 1;

  private readonly enumTopology = {
    oscilloscopeLine: 0,
    mirroredEnvelope: 1,
    multiHarmonicRibbon: 2,
    closedPolarWave: 3,
    violentWave: 4,
  } as const;
  private readonly enumGradient = { frequency: 0, amplitude: 1, flat: 2 } as const;

  constructor(gl: WebGL2RenderingContext, cfg: WaveformConfig) {
    this.gl = gl;
    this.cfg = cfg;
    this.prog = new ShaderProgram(gl, WAVE_VERT, WAVE_FRAG);
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('VAO alloc failed');
    this.vao = vao;
    // Nearest sampling: 2048 samples already exceed any on-screen segment count, and R32F
    // linear filtering is not guaranteed without OES_texture_float_linear.
    this.waveTex = new DataTexture(gl, WAVEFORM_SAMPLES, 'nearest');
  }

  updateConfig(cfg: WaveformConfig): void {
    this.cfg = cfg;
    this.parseColor(cfg.color);
  }

  private parseColor(hex: string): void {
    this.hasColor = /^#[0-9a-fA-F]{6}$/.test(hex);
    if (!this.hasColor) return;
    const value = Number.parseInt(hex.slice(1), 16);
    this.colorR = ((value >> 16) & 255) / 255;
    this.colorG = ((value >> 8) & 255) / 255;
    this.colorB = (value & 255) / 255;
  }

  render(ctx: LayerRenderContext): void {
    const { gl } = this;
    const { audio, width, height, palette } = ctx;
    const cfg = this.cfg;
    if (!cfg.visible || cfg.opacity <= 0) return;

    this.waveTex.upload(audio.waveformSmoothed);

    this.prog.use();
    this.prog.i('u_waveformTex', 0);
    this.prog.i('u_palette', 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTex.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, palette.tex);
    gl.activeTexture(gl.TEXTURE0);

    this.prog.v2('u_resolution', width, height);
    this.prog.v4('u_layoutRect', ctx.layout.x, ctx.layout.y, ctx.layout.w, ctx.layout.h);
    this.prog.f('u_rotation', cfg.rotation);
    this.prog.i('u_sampleCount', WAVEFORM_SAMPLES);
    this.prog.f('u_thickness', Math.max(1, cfg.thickness * (height / REFERENCE_HEIGHT)));
    this.prog.i('u_topology', this.enumTopology[cfg.topology]);
    this.prog.i('u_gradient', this.enumGradient[cfg.gradientMode]);
    this.prog.f('u_polarBaseRadius', cfg.polarBaseRadius);
    this.prog.f('u_gapRatio', cfg.gapRatio);
    this.prog.f('u_glowIntensity', cfg.glowIntensity);
    this.prog.f('u_opacity', cfg.opacity);
    this.prog.f('u_highEnergy', audio.bands.high);
    this.prog.f('u_snareImpulse', audio.transients.snareImpulse);
    this.prog.f('u_violentTime', ctx.time);
    this.prog.v3('u_colorOverride', this.colorR, this.colorG, this.colorB);
    this.prog.i('u_hasColorOverride', this.hasColor ? 1 : 0);
    this.prog.v3('u_color2', this.color2R, this.color2G, this.color2B);
    this.prog.i('u_hasColor2', this.hasColor2 ? 1 : 0);

    // polar needs one extra segment to close the ring (sample N wraps to sample 0).
    const instances = cfg.topology === 'closedPolarWave' ? WAVEFORM_SAMPLES : WAVEFORM_SAMPLES - 1;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);   // additive in linear-light HDR
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, instances);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    this.prog.dispose();
    this.waveTex.dispose();
    this.gl.deleteVertexArray(this.vao);
  }
}

// role: waveform layer — uploads the smoothed waveform and dispatches one instanced quad strip
//       (line / mirrored fill / multi-harmonic / closed polar) with the shared palette.
// invariants: no per-frame JS allocation; framebuffer/viewport untouched; thickness DPI-scaled
//             from a 1080p reference; blend is restored before the engine tone-map pass.
// owner milestone: M3b
