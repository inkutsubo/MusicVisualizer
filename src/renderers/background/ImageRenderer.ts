import { ShaderProgram } from '../../core/gl/ShaderProgram';
import type { ImageLayerConfig } from '../../types/layers';
import type { ILayerRenderer, LayerRenderContext } from '../ILayerRenderer';
import IMAGE_VERT from './shaders/image.vert.glsl?raw';
import IMAGE_FRAG from './shaders/image.frag.glsl?raw';

export class ImageRenderer implements ILayerRenderer {
  readonly kind = 'image';
  private readonly gl: WebGL2RenderingContext;
  private readonly prog: ShaderProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly tex: WebGLTexture;
  private cfg: ImageLayerConfig;

  private loadedUrl = '';
  private hasImage = false;
  private imageAspect = 1;
  private textureDirty = false;
  private texelW = 1 / 512;
  private texelH = 1 / 512;
  private image: HTMLImageElement | null = null;

  constructor(gl: WebGL2RenderingContext, cfg: ImageLayerConfig) {
    this.gl = gl;
    this.cfg = cfg;
    this.prog = new ShaderProgram(gl, IMAGE_VERT, IMAGE_FRAG);
    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('image VAO alloc failed');
    this.vao = vao;
    const tex = gl.createTexture();
    if (tex === null) throw new Error('image texture alloc failed');
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.syncImage();
  }

  updateConfig(cfg: ImageLayerConfig): void {
    this.cfg = cfg;
    this.syncImage();
  }

  private syncImage(): void {
    const url = this.cfg.imageUrl;
    if (url === this.loadedUrl) return;
    this.loadedUrl = url;
    this.hasImage = false;
    if (url === '') return;
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (this.loadedUrl !== url) return;
      this.image = image;
      this.imageAspect = image.width / Math.max(1, image.height);
      this.texelW = 1 / Math.max(1, image.width);
      this.texelH = 1 / Math.max(1, image.height);
      this.hasImage = true;
      this.textureDirty = true;
    };
    image.onerror = () => { this.hasImage = false; };
    image.src = url;
  }

  render(ctx: LayerRenderContext): void {
    const { gl } = this;
    const cfg = this.cfg;
    if (!cfg.visible || cfg.opacity <= 0) return;

    if (this.textureDirty && this.image !== null) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.bindTexture(gl.TEXTURE_2D, null);
      this.textureDirty = false;
    }

    const layout = ctx.layout;
    const boxAspect = (layout.w * ctx.width) / Math.max(1, layout.h * ctx.height);
    let sx = 1;
    let sy = 1;
    if (this.hasImage) {
      if (this.imageAspect > boxAspect) {
        sx = boxAspect / this.imageAspect;
      } else {
        sy = this.imageAspect / boxAspect;
      }
      if (cfg.fit === 'contain') { sx = 1 / sx; sy = 1 / sy; }
    }

    this.prog.use();
    this.prog.i('u_tex', 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    this.prog.v4('u_layoutRect', layout.x, layout.y, layout.w, layout.h);
    this.prog.v2('u_uvScale', sx, sy);
    this.prog.v2('u_uvOffset', 0, 0);
    this.prog.f('u_opacity', cfg.opacity);
    this.prog.f('u_brightness', cfg.brightness);
    this.prog.f('u_hasImage', this.hasImage ? 1 : 0);
    this.prog.i('u_contain', cfg.fit === 'contain' ? 1 : 0);
    this.prog.f('u_zoom', 1 + ctx.audio.bands.bass * cfg.bassPulse);
    this.prog.f('u_saturation', cfg.bgSaturation);
    this.prog.f('u_blur', cfg.bgBlur);
    this.prog.v2('u_texel', this.texelW, this.texelH);
    this.prog.v2('u_drift', Math.sin(ctx.time * 0.5) * 0.02, Math.cos(ctx.time * 0.37) * 0.015);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  dispose(): void {
    this.prog.dispose();
    this.gl.deleteTexture(this.tex);
    this.gl.deleteVertexArray(this.vao);
    this.image = null;
  }
}

// role: background image layer — async Image decode, GL texture upload, bass-reactive zoom and
//       cover/contain UV fitting inside its layout rectangle.
// owner milestone: M11
