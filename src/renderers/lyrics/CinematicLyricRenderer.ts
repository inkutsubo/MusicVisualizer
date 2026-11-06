import { ShaderProgram } from '../../core/gl/ShaderProgram';
import { LyricAtlasBuilder, GLYPH_FLOATS } from './LyricAtlasBuilder';
import type { LyricCue, LyricDocument } from '../../types/lyrics';
import type { LyricsConfig } from '../../types/layers';
import type { TypographyPreset } from '../../presets/typographyPresets';
import type { ILayerRenderer, LayerRenderContext } from '../ILayerRenderer';
import LYRICS_VERT from './shaders/lyrics.vert.glsl?raw';
import LYRICS_FRAG from './shaders/lyrics.frag.glsl?raw';

const MAX_GLYPHS = 1024;
const ENTER_SECONDS = 0.65;
const EXIT_SECONDS = 0.45;
const PULSE_TAU = 0.09;

export class CinematicLyricRenderer implements ILayerRenderer {
  readonly kind = 'lyrics';
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vbo: WebGLBuffer;
  private readonly atlas: LyricAtlasBuilder;
  private readonly quads = new Float32Array(MAX_GLYPHS * GLYPH_FLOATS);
  private cfg: LyricsConfig;
  private doc: LyricDocument;
  private preset: TypographyPreset;
  private activePreset: TypographyPreset;
  private customFontFamily: string | null = null;
  private textR = 1;
  private textG = 1;
  private textB = 1;

  private activeIndex = -1;
  private activeCue: LyricCue | null = null;
  private glyphCount = 0;
  private lastW = 0;
  private lastH = 0;
  private presetDirty = true;
  private pulse = 0;

  constructor(
    gl: WebGL2RenderingContext,
    cfg: LyricsConfig,
    doc: LyricDocument,
    preset: TypographyPreset,
  ) {
    this.gl = gl;
    this.cfg = cfg;
    this.doc = doc;
    this.preset = preset;
    this.activePreset = preset;
    this.prog = new ShaderProgram(gl, LYRICS_VERT, LYRICS_FRAG);
    this.atlas = new LyricAtlasBuilder(gl);

    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('VAO alloc failed');
    this.vao = vao;
    const vbo = gl.createBuffer();
    if (vbo === null) throw new Error('lyric VBO alloc failed');
    this.vbo = vbo;

    const stride = GLYPH_FLOATS * 4;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.quads.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  updateConfig(cfg: LyricsConfig): void {
    this.cfg = cfg;
    const hex = cfg.lyricsColor;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      const value = Number.parseInt(hex.slice(1), 16);
      this.textR = ((value >> 16) & 255) / 255;
      this.textG = ((value >> 8) & 255) / 255;
      this.textB = (value & 255) / 255;
    }
  }

  setDocument(doc: LyricDocument): void {
    this.doc = doc;
    this.activeIndex = -1;
    this.presetDirty = true;
  }

  setPreset(preset: TypographyPreset): void {
    this.preset = preset;
    this.activePreset = this.customFontFamily !== null
      ? { ...preset, fontFamily: this.customFontFamily }
      : preset;
    this.presetDirty = true;
  }

  /** Loads a custom .ttf/.woff2 through FontFace and flags the atlas for a safe rebuild. */
  async loadFont(buffer: ArrayBuffer, fontName: string): Promise<void> {
    const face = new FontFace(fontName, buffer);
    await face.load();
    document.fonts.add(face);
    this.customFontFamily = `"${fontName}"`;
    this.activePreset = { ...this.preset, fontFamily: this.customFontFamily };
    this.presetDirty = true;
  }

  private rebuild(idx: number, width: number, height: number): void {
    if (idx < 0) {
      this.glyphCount = 0;
      this.activeCue = null;
      return;
    }
    const cue = this.doc.cues[idx]!;
    this.activeCue = cue;
    this.glyphCount = this.atlas.build(cue, this.activePreset, width, height, this.quads, MAX_GLYPHS);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.quads, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  render(ctx: LayerRenderContext): void {
    const { audio, width, height, dt, palette } = ctx;
    const cfg = this.cfg;
    if (!cfg.visible || cfg.opacity <= 0) return;

    const t = ctx.time - ctx.lyricOffsetMs / 1000;
    const cues = this.doc.cues;
    let idx = -1;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i]!.startTime <= t) idx = i;
      else break;
    }
    if (idx >= 0 && t >= cues[idx]!.endTime) idx = -1;

    if (idx !== this.activeIndex || width !== this.lastW || height !== this.lastH || this.presetDirty) {
      this.rebuild(idx, width, height);
      this.activeIndex = idx;
      this.lastW = width;
      this.lastH = height;
      this.presetDirty = false;
    }

    const reactive = cfg.audioReactive && this.preset.audioReactive;
    const target = reactive ? audio.transients.fullImpulse : 0;
    const alpha = 1 - Math.exp(-dt / PULSE_TAU);
    this.pulse += (target - this.pulse) * alpha;

    const cue = this.activeCue;
    if (cue === null || this.glyphCount === 0) return;

    const hdr = cfg.hdrIntensity > 0 ? cfg.hdrIntensity : this.preset.hdrIntensity;
    const backdrop = cfg.backdropOpacity > 0 ? cfg.backdropOpacity : this.preset.backdropOpacity;
    const animMode = this.preset.entrance === 'clip-reveal'
      ? 0
      : this.preset.entrance === 'tracking-drift' ? 1 : 2;

    const gl = this.gl;
    this.prog.use();
    this.prog.i('u_atlasTex', 0);
    this.prog.i('u_palette', 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, palette.tex);
    gl.activeTexture(gl.TEXTURE0);

    this.prog.f('u_t', t);
    this.prog.f('u_start', cue.startTime);
    this.prog.f('u_end', cue.endTime);
    this.prog.f('u_enter', ENTER_SECONDS);
    this.prog.f('u_exit', EXIT_SECONDS);
    this.prog.i('u_animMode', animMode);
    this.prog.f('u_charCount', this.glyphCount);
    this.prog.f('u_drift', 0.05);
    this.prog.f('u_pulse', this.pulse);
    this.prog.i('u_audioReact', reactive ? 1 : 0);
    this.prog.f('u_hdr', hdr);
    this.prog.f('u_opacity', cfg.opacity);
    this.prog.v4('u_layoutRect', ctx.layout.x, ctx.layout.y, ctx.layout.w, ctx.layout.h);
    this.prog.f('u_bandCenter', this.atlas.bandCenter);
    this.prog.f('u_bandHalf', this.atlas.bandHalf);
    this.prog.f('u_backdropOpacity', backdrop);
    this.prog.f('u_shadowStrength', 0.92);
    this.prog.v2('u_shadowOffset', 2 / width, 3 / height);
    this.prog.v2('u_atlasTexel', 1 / 2048, 1 / 1024);
    this.prog.v3('u_lyricsColor', this.textR, this.textG, this.textB);
    this.prog.f('u_lyricsGlow', cfg.lyricsGlow);

    gl.enable(gl.BLEND);
    gl.bindVertexArray(this.vao);

    if (cfg.showLyricsBackdrop && cfg.showBackdrop) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.prog.i('u_pass', 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Optional dark silhouette (disabled with the clean-text toggle), then additive glyphs.
    if (cfg.showLyricsBackdrop) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.prog.i('u_shadow', 1);
      this.prog.i('u_pass', 0);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.glyphCount);
    }

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this.prog.i('u_shadow', 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.glyphCount);

    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    this.prog.dispose();
    this.atlas.dispose();
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteVertexArray(this.vao);
  }
}

// role: cinematic lyric layer — owns the parsed document, atlas, instance VBO and draw state;
//       rebuilds the atlas only when the active cue, preset or viewport changes.
// invariants: zero per-frame JS allocation; glyph layout/rasterization never happens per frame;
//             animation is a pure function of (t, cue) so scrubbing is deterministic.
// owner milestone: M4
