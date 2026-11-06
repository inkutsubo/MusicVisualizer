import type { LyricCue } from '../../types/lyrics';
import type { TypographyPreset } from '../../presets/typographyPresets';

/** Logical atlas space (screen pixels are mapped into this via a per-build scale). */
const ATLAS_W = 1024;
const ATLAS_H = 512;
const SUPERSAMPLE = 2;          // device pixels per logical atlas pixel

/** Floats written per glyph: posRect(4) + uvRect(4) + meta(4). */
export const GLYPH_FLOATS = 12;

/**
 * Rasterizes one lyric cue into an OffscreenCanvas atlas and writes the matching GlyphQuad
 * instance data. Called only when the active cue, preset or viewport changes.
 */
export class LyricAtlasBuilder {
  readonly tex: WebGLTexture;
  bandCenter = 0.72;
  bandHalf = 0.08;

  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: OffscreenCanvas;
  private readonly ctx: OffscreenCanvasRenderingContext2D;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.canvas = new OffscreenCanvas(ATLAS_W * SUPERSAMPLE, ATLAS_H * SUPERSAMPLE);
    const ctx = this.canvas.getContext('2d', { alpha: true });
    if (ctx === null) throw new Error('OffscreenCanvas 2D context unavailable');
    this.ctx = ctx;

    const tex = gl.createTexture();
    if (tex === null) throw new Error('lyric atlas texture alloc failed');
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_W * SUPERSAMPLE, ATLAS_H * SUPERSAMPLE, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  /** @returns number of glyph quads written to `out` (GLYPH_FLOATS floats per glyph). */
  build(
    cue: LyricCue,
    preset: TypographyPreset,
    screenW: number,
    screenH: number,
    out: Float32Array,
    maxGlyphs: number,
  ): number {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const w = Math.max(1, screenW);
    const h = Math.max(1, screenH);
    const s = Math.min(ATLAS_W / w, ATLAS_H / h);   // screen px -> atlas logical px
    ctx.scale(SUPERSAMPLE * s, SUPERSAMPLE * s);

    const sizePx = Math.max(8, preset.fontSize * (h / 1080));
    const spacingPx = preset.letterSpacing * (h / 1080);
    const lineHeightPx = sizePx * preset.lineHeight;
    ctx.font = `${preset.fontWeight} ${sizePx}px ${preset.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';

    const spaceW = ctx.measureText(' ').width;
    const maxWidth = w * 0.8;

    const words = cue.words.length > 0 ? cue.words : [{ text: cue.text, startTime: 0, endTime: 0 }];
    const widths: number[] = [];
    for (let i = 0; i < words.length; i++) widths.push(ctx.measureText(words[i]!.text).width);

    const lines: number[][] = [];
    let current: number[] = [];
    let currentW = 0;
    for (let i = 0; i < words.length; i++) {
      const wordW = widths[i]!;
      if (current.length > 0 && currentW + spaceW + wordW > maxWidth) {
        lines.push(current);
        current = [];
        currentW = 0;
      }
      currentW += (current.length > 0 ? spaceW : 0) + wordW;
      current.push(i);
    }
    if (current.length > 0) lines.push(current);
    if (lines.length === 0) return 0;

    const blockH = lines.length * lineHeightPx;
    const blockTop = Math.max(h * 0.5, Math.min(h * 0.72 - blockH * 0.5, h * 0.92 - blockH));
    this.bandCenter = (blockTop + blockH * 0.5) / h;
    this.bandHalf = (blockH * 0.5 + sizePx * 1.1) / h;

    let glyphCount = 0;
    let charIndex = 0;

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      let lineW = 0;
      for (let k = 0; k < line.length; k++) {
        lineW += (k > 0 ? spaceW : 0) + widths[line[k]!]!;
      }
      const startX = cue.alignment === 'left'
        ? w * 0.1
        : cue.alignment === 'right'
          ? w * 0.9 - lineW
          : (w - lineW) * 0.5;

      let penX = startX;
      const lineTop = blockTop + li * lineHeightPx;
      const baseline = lineTop + sizePx * 0.8;

      for (let k = 0; k < line.length; k++) {
        const wi = line[k]!;
        const text = words[wi]!.text;
        for (let ci = 0; ci < text.length; ci++) {
          const ch = text.charAt(ci);
          if (ch === ' ') continue;
          const cw = ctx.measureText(ch).width;
          ctx.fillText(ch, penX, baseline);

          if (glyphCount < maxGlyphs) {
            const o = glyphCount * GLYPH_FLOATS;
            out[o] = penX / w;
            out[o + 1] = lineTop / h;
            out[o + 2] = cw / w;
            out[o + 3] = lineHeightPx / h;
            out[o + 4] = Math.min(Math.max((penX * s) / ATLAS_W, 0), 1);
            out[o + 5] = Math.min(Math.max((lineTop * s) / ATLAS_H, 0), 1);
            out[o + 6] = Math.min(Math.max(((penX + cw) * s) / ATLAS_W, 0), 1);
            out[o + 7] = Math.min(Math.max(((lineTop + lineHeightPx) * s) / ATLAS_H, 0), 1);
            out[o + 8] = charIndex;
            out[o + 9] = wi;
            out[o + 10] = li;
            out[o + 11] = lineW > 0 ? (penX + cw * 0.5 - startX) / lineW : 0.5;
          }
          glyphCount++;
          charIndex++;
          penX += cw + spacingPx;
        }
        penX += spaceW;
      }
    }

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);

    return Math.min(glyphCount, maxGlyphs);
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex);
  }
}

// role: lyric atlas — rasterizes one cue with OffscreenCanvas (the only Canvas2D use allowed)
//       and emits per-character GlyphQuad instance data for the GPU.
// invariants: called only on cue/preset/viewport change (never per frame); quad rects and UVs
//             match the drawn pixels; text is white-on-transparent so the shader owns colour.
// owner milestone: M4
