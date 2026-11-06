import { ShaderProgram } from '../../core/gl/ShaderProgram';
import type { HudConfig } from '../../types/layers';
import type { ILayerRenderer, LayerRenderContext } from '../ILayerRenderer';
import HUD_VERT from './shaders/hud.vert.glsl?raw';
import HUD_FRAG from './shaders/hud.frag.glsl?raw';

const W = 1024;
const H = 256;

function formatTime(t: number): string {
  const clamped = Math.max(0, t);
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  const hundredths = Math.floor((clamped * 100) % 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export class HudTextRenderer implements ILayerRenderer {
  readonly kind = 'hud';
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly tex: WebGLTexture;
  private cfg: HudConfig;

  private canvas: OffscreenCanvas | null = null;
  private ctx2d: OffscreenCanvasRenderingContext2D | null = null;
  private textureDirty = true;
  private lastTick = -1;
  private lastTitle = '';
  private lastLabel = '';

  constructor(gl: WebGL2RenderingContext, cfg: HudConfig) {
    this.gl = gl;
    this.cfg = cfg;
    this.prog = new ShaderProgram(gl, HUD_VERT, HUD_FRAG);
    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('hud VAO alloc failed');
    this.vao = vao;
    const tex = gl.createTexture();
    if (tex === null) throw new Error('hud texture alloc failed');
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.ensureCanvas();
    this.rasterize(cfg, 0);
  }

  get displayedTimer(): string { return this.lastLabel; }

  updateConfig(cfg: HudConfig): void {
    this.cfg = cfg;
    this.textureDirty = true;
  }

  private ensureCanvas(): void {
    if (this.canvas !== null) return;
    this.canvas = new OffscreenCanvas(W, H);
    this.ctx2d = this.canvas.getContext('2d');
  }

  private rasterize(cfg: HudConfig, time: number): void {
    this.ensureCanvas();
    const ctx = this.ctx2d;
    if (ctx === null) return;
    ctx.clearRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8fbff';
    ctx.shadowColor = cfg.accent;
    ctx.shadowBlur = 18;
    ctx.font = `600 ${Math.max(18, Math.min(72, cfg.titleSize))}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
    ctx.fillText(cfg.title, W / 2, 58);

    if (cfg.showTimer) {
      ctx.shadowBlur = 0;
      const label = formatTime(time);
      this.lastLabel = label;
      ctx.font = '500 62px ui-monospace, SFMono-Regular, Consolas, monospace';
      const metrics = ctx.measureText(label);
      const boxW = metrics.width + 72;
      const boxH = 90;
      const x = (W - boxW) / 2;
      const y = 118;
      ctx.fillStyle = 'rgba(4, 10, 18, 0.55)';
      this.roundRect(ctx, x, y, boxW, boxH, 14);
      ctx.fill();
      ctx.strokeStyle = cfg.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#f8fdff';
      ctx.fillText(label, W / 2, y + boxH / 2 + 2);
    }

    ctx.shadowBlur = 0;
    this.textureDirty = true;
  }

  private roundRect(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  render(ctx: LayerRenderContext): void {
    const cfg = this.cfg;
    if (!cfg.visible || cfg.opacity <= 0) return;
    const tick = Math.floor(ctx.time * 10);
    if (tick !== this.lastTick || cfg.title !== this.lastTitle) {
      this.lastTick = tick;
      this.lastTitle = cfg.title;
      this.rasterize(cfg, ctx.time);
    }
    const gl = this.gl;

    if (this.textureDirty && this.canvas !== null) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.textureDirty = false;
    }

    this.prog.use();
    this.prog.i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    this.prog.v4('u_layoutRect', ctx.layout.x, ctx.layout.y, ctx.layout.w, ctx.layout.h);
    this.prog.f('u_opacity', cfg.opacity);
    this.prog.f('u_intensity', 1.35);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    this.prog.dispose();
    this.gl.deleteTexture(this.tex);
    this.gl.deleteVertexArray(this.vao);
    this.canvas = null;
    this.ctx2d = null;
  }
}

// role: HUD layer — OffscreenCanvas title + timer raster, uploaded at 10 Hz and drawn as an
//       additive layout-mapped quad.
// owner milestone: M11
