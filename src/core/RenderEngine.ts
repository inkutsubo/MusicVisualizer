import { GLContext } from './gl/GLContext';
import { ShaderProgram } from './gl/ShaderProgram';
import { FramebufferPool } from './gl/FramebufferPool';
import type { RenderTarget } from './gl/FramebufferPool';
import type { Clock } from './Clock';
import { ColorPalette } from './ColorPalette';
import { MASTER_BANDS, WAVEFORM_SAMPLES } from '../types/audio';
import type { AudioFramePacket } from '../types/audio';
import type { ILayerRenderer } from '../renderers/ILayerRenderer';
import { clampModulated, evaluateModulation, readNumericParam } from './ModulationMatrix';
import type { ModulationBinding, ModulationTarget } from './ModulationMatrix';
import { FULL_LAYOUT } from '../types/layers';
import type { LayerConfig, LayoutRect } from '../types/layers';
import type { LyricDocument } from '../types/lyrics';
import { PersistenceTrailPass } from '../renderers/post/PersistenceTrailPass';
import { DualKawaseBloomPass } from '../renderers/post/DualKawaseBloomPass';
import { CompositeToneMapPass } from '../renderers/post/CompositeToneMapPass';

/** Mutable twin of LayerRenderContext: one instance lives in the engine and is filled per frame. */
interface MutableLayerCtx {
  gl: WebGL2RenderingContext;
  time: number;
  dt: number;
  width: number;
  height: number;
  audio: AudioFramePacket;
  palette: ColorPalette;
  layout: LayoutRect;
  lyricOffsetMs: number;
}


/** Idle angular velocity (rad/s) integrated into Φ in JS — never a wall-clock shader term. */
const IDLE_OMEGA = 0.5;
const TWO_PI = Math.PI * 2;
const MAX_DT = 0.1;

const VS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS_HDR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform float u_phase;
void main() {
  vec2 uv = vUv - 0.5;
  float r = length(uv);
  float ang = atan(uv.y, uv.x) + u_phase;
  float spokes = 0.5 + 0.5 * cos(ang * 8.0);
  float core = 1.0 - smoothstep(0.0, 0.5, r);
  vec3 c = mix(vec3(0.1, 0.05, 0.2), vec3(0.0, 0.8, 1.0), spokes);
  c *= core * 3.0;
  c += vec3(1.5) * pow(core, 6.0);
  float halo = smoothstep(0.38, 0.47, r) * (1.0 - smoothstep(0.47, 0.52, r));
  c += vec3(1.2, 0.1, 0.6) * halo;
  o = vec4(c, 1.0);
}`;

export class RenderEngine {
  private readonly canvas: HTMLCanvasElement;
  private ctx!: GLContext;
  private pool!: FramebufferPool;
  private hdr!: ShaderProgram;
  private trails!: PersistenceTrailPass;
  private bloom!: DualKawaseBloomPass;
  private composite!: CompositeToneMapPass;
  private vao!: WebGLVertexArrayObject;
  private palette!: ColorPalette;
  private layerCtx!: MutableLayerCtx;

  private readonly onContextLost: (ev: Event) => void;
  private readonly onContextRestored: () => void;
  private readonly layers: ILayerRenderer[] = [];
  private readonly layerEntries = new Map<string, {
    renderer: ILayerRenderer;
    config: LayerConfig;
    effectiveVisible: boolean;
    renderCfg: LayerConfig;
  }>();
  private modBindings: readonly ModulationBinding[] = [];
  private lyricOffsetMs = 0;
  private layerFactory: ((gl: WebGL2RenderingContext, cfg: LayerConfig) => ILayerRenderer) | null = null;
  private readonly layerOrder: string[] = [];
  private lastConfigs: LayerConfig[] = [];
  private lastSoloId: string | null = null;
  private contextRestoreHandler: (() => void) | null = null;
  private audioSource: ((t: number) => AudioFramePacket) | null = null;
  private rt: RenderTarget | null = null;
  private offline = false;
  private offlineW = 0;
  private offlineH = 0;
  private rtCssW = 0;
  private rtCssH = 0;
  private rtDpr = 0;
  private phase = 0;
  private lastT = 0;
  private disposed = false;
  private isContextLost = false;
  private frames = 0;
  private trailDecay = 0.85;
  private bloomThreshold = 1.1;
  private bloomIntensity = 0.9;
  private chromatic = 0.002;
  private vignette = 0.35;
  private exposure = 1.0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initGraphics();

    this.onContextLost = (ev: Event): void => {
      ev.preventDefault();
      this.isContextLost = true;
    };
    this.onContextRestored = (): void => {
      this.recoverContext();
    };
    canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
  }

  /** (Re)creates every GL-owned object. Also used after a context restore. */
  private initGraphics(): void {
    const canvas = this.canvas;
    this.ctx = new GLContext(canvas);
    const fmt = this.ctx.caps.colorBufferFloat ? 'rgba16f' : 'r11g11b10f';
    this.pool = new FramebufferPool(this.ctx.gl, fmt);
    this.hdr = new ShaderProgram(this.ctx.gl, VS, FS_HDR);
    this.trails = new PersistenceTrailPass(this.ctx.gl, this.pool);
    this.bloom = new DualKawaseBloomPass(this.ctx.gl, this.pool);
    this.composite = new CompositeToneMapPass(this.ctx.gl);
    const vao = this.ctx.gl.createVertexArray();
    if (!vao) throw new Error('VAO alloc failed');
    this.vao = vao;

    this.palette = new ColorPalette(this.ctx.gl, [
      { t: 0, color: '#00d9ff' },
      { t: 0.55, color: '#b400ff' },
      { t: 1, color: '#ffcc44' },
    ]);

    const quietSpectrum = new Float32Array(MASTER_BANDS);
    const quietPeaks = new Float32Array(MASTER_BANDS);
    const quietWave = new Float32Array(WAVEFORM_SAMPLES);
    const placeholder: AudioFramePacket = {
      t: 0,
      spectrum: quietSpectrum,
      peakHold: quietPeaks,
      waveform: quietWave,
      waveformSmoothed: quietWave,
      bands: { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 },
      transients: { kickImpulse: 0, snareImpulse: 0, fullImpulse: 0 },
      phaseAudio: 0,
      rms: 0,
      lufsApprox: -Infinity,
    };
    this.layerCtx = {
      gl: this.ctx.gl,
      time: 0,
      dt: 0,
      width: 1,
      height: 1,
      audio: placeholder,
      palette: this.palette,
      layout: FULL_LAYOUT,
      lyricOffsetMs: 0,
    };

    this.rt = null;
    this.rtCssW = -1;
    this.rtCssH = -1;
    this.rtDpr = -1;
  }

  /** Rebuilds the whole GL stack and re-instantiates layers from the last store snapshot. */
  private recoverContext(): void {
    try {
      this.initGraphics();
    } catch (e) {
      console.error('WebGL2 context restore failed:', e);
      return;
    }
    this.isContextLost = false;
    this.offline = false;
    this.offlineW = 0;
    this.offlineH = 0;
    this.layerEntries.clear();
    this.layers.length = 0;
    this.layerOrder.length = 0;
    const configs = this.lastConfigs;
    const solo = this.lastSoloId;
    if (configs.length > 0) this.syncLayers(configs, solo);
    if (this.contextRestoreHandler !== null) this.contextRestoreHandler();
  }

  setContextRestoreHandler(handler: (() => void) | null): void {
    this.contextRestoreHandler = handler;
  }
  private ensureRT(): void {
    const { gl } = this.ctx;
    const canvas = gl.canvas as HTMLCanvasElement;

    if (this.offline) {
      if (this.rt !== null && this.rt.w === this.offlineW && this.rt.h === this.offlineH) return;
      canvas.width = this.offlineW;
      canvas.height = this.offlineH;
      if (this.rt) this.pool.destroy(this.rt);
      this.rt = this.pool.create(this.offlineW, this.offlineH, 'linear');
      this.trails.resize(this.offlineW, this.offlineH);
      this.bloom.resize(this.offlineW, this.offlineH);
      this.rtCssW = -1;
      this.rtCssH = -1;
      this.rtDpr = -1;
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (
      this.rt !== null &&
      cssW === this.rtCssW &&
      cssH === this.rtCssH &&
      dpr === this.rtDpr
    ) return;

    this.ctx.resize(cssW, cssH, dpr);
    if (this.rt) this.pool.destroy(this.rt);
    this.rt = this.pool.create(canvas.width, canvas.height, 'linear');
    this.trails.resize(this.rt.w, this.rt.h);
    this.bloom.resize(this.rt.w, this.rt.h);
    this.rtCssW = cssW;
    this.rtCssH = cssH;
    this.rtDpr = dpr;
  }

  render(clock: Clock): void {
    if (this.disposed || this.offline || this.isContextLost) return;
    const t = clock.time();
    const raw = t - this.lastT;
    const dt = raw > 0 ? (raw < MAX_DT ? raw : MAX_DT) : 0;
    this.lastT = t;
    this.renderAt(t, dt);
  }

  /** Deterministic single-frame render used by the offline exporter. */
  renderFrame(t: number, dt: number): void {
    if (this.disposed || this.isContextLost) return;
    const d = dt > 0 ? Math.min(dt, MAX_DT) : 0;
    this.renderAt(t, d);
  }

  private renderAt(t: number, dt: number): void {
    const { gl } = this.ctx;

    this.ensureRT();
    const rt = this.rt;
    if (!rt) return;

    // F integration stays explicit: only the caller-supplied dt reaches the idle-omega term.
    this.phase += dt * IDLE_OMEGA;
    if (this.phase >= TWO_PI) this.phase -= TWO_PI;

    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
    gl.viewport(0, 0, rt.w, rt.h);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const source = this.audioSource;
    const frame = source !== null ? source(t) : null;
    if (frame !== null) this.applyModulations(frame);
    if (frame !== null && this.layers.length > 0) {
      const lc = this.layerCtx;
      lc.time = t;
      lc.dt = dt;
      lc.width = rt.w;
      lc.height = rt.h;
      lc.audio = frame;
      lc.lyricOffsetMs = this.lyricOffsetMs;
      // Depth-sorted passes: background particles, main geometry, foreground particles, overlays.
      for (let pass = 0; pass < 4; pass++) {
        for (let i = 0; i < this.layerOrder.length; i++) {
          const entry = this.layerEntries.get(this.layerOrder[i]!);
          if (entry === undefined) continue;
          const kind = entry.renderCfg.kind;
          const isParticles = kind === 'particles';
          const isOverlay = kind === 'lyrics' || kind === 'hud';
          const depth = isParticles ? ((entry.renderCfg as unknown as { depth?: string }).depth ?? 'foreground') : '';
          let draw = false;
          if (pass === 0) draw = isParticles && depth === 'background';
          else if (pass === 1) draw = !isParticles && !isOverlay;
          else if (pass === 2) draw = isParticles && depth !== 'background';
          else draw = isOverlay;
          if (!draw) continue;
          lc.layout = entry.renderCfg.layout;
          entry.renderer.render(lc);
        }
      }
    } else {
      this.hdr.use();
      this.hdr.f('u_phase', this.phase);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Post graph: scene -> trails -> bloom -> composite.
    const blended = this.trails.process(rt, this.trailDecay);
    const bloomRT = this.bloom.process(blended, this.bloomThreshold);
    this.composite.render(
      blended.tex,
      bloomRT.tex,
      rt.w,
      rt.h,
      this.chromatic,
      this.bloomIntensity,
      this.vignette,
      this.exposure,
    );
    gl.bindVertexArray(null);

    this.frames++;
  }

  /** Switches the engine to a fixed export resolution and clears temporal state. */
  private recreateLayers(): void {
    const factory = this.layerFactory;
    if (factory === null || this.layerOrder.length === 0) return;
    const old: { renderer: ILayerRenderer; config: LayerConfig; effectiveVisible: boolean; renderCfg: LayerConfig }[] = [];
    for (let i = 0; i < this.layerOrder.length; i++) {
      const entry = this.layerEntries.get(this.layerOrder[i]!);
      if (entry !== undefined) old.push(entry);
    }
    for (let i = 0; i < old.length; i++) old[i]!.renderer.dispose();
    this.layerEntries.clear();
    this.layers.length = 0;
    for (let i = 0; i < old.length; i++) {
      const entry = old[i]!;
      const renderer = factory(this.ctx.gl, entry.config);
      const renderCfg = { ...entry.config, visible: entry.effectiveVisible } as LayerConfig;
      this.layerEntries.set(entry.config.id, { renderer, config: entry.config, effectiveVisible: entry.effectiveVisible, renderCfg });
      renderer.updateConfig?.(renderCfg);
      this.layers.push(renderer);
    }
  }

  beginOffline(width: number, height: number): void {
    this.recreateLayers();
    this.offlineW = Math.max(2, Math.round(width / 2) * 2);
    this.offlineH = Math.max(2, Math.round(height / 2) * 2);
    this.offline = true;
    this.phase = 0;
    this.lastT = 0;
    this.ensureRT();
    this.trails.clear();
  }

  /** Restores the on-screen backing size and resets the post history. */
  endOffline(): void {
    if (!this.offline) return;
    this.offline = false;
    this.offlineW = 0;
    this.offlineH = 0;
    this.rtCssW = -1;
    this.rtCssH = -1;
    this.rtDpr = -1;
    this.ensureRT();
    this.trails.clear();
  }

  getCanvas(): HTMLCanvasElement {
    return this.ctx.gl.canvas as HTMLCanvasElement;
  }
  setAudioSource(fn: ((t: number) => AudioFramePacket) | null): void {
    this.audioSource = fn;
  }

  addLayer(layer: ILayerRenderer): void {
    this.layers.push(layer);
  }

  setLayerFactory(factory: ((gl: WebGL2RenderingContext, cfg: LayerConfig) => ILayerRenderer) | null): void {
    this.layerFactory = factory;
  }

  /**
   * Reconciles the renderer list against a store snapshot: disposes removed layers, applies
   * config changes in place, and instantiates new layers through the factory. Solo overrides
   * visibility without mutating the stored config.
   */
  syncLayers(configs: readonly LayerConfig[], soloId: string | null): void {
    this.lastConfigs = configs.slice();
    this.lastSoloId = soloId;
    this.layerEntries.forEach((entry, id) => {
      let present = false;
      for (let i = 0; i < configs.length; i++) {
        if (configs[i]!.id === id) { present = true; break; }
      }
      if (!present) {
        entry.renderer.dispose();
        this.layerEntries.delete(id);
      }
    });

    const ordered: ILayerRenderer[] = [];
    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]!;
      const visible = cfg.visible && (soloId === null || soloId === cfg.id);
      const entry = this.layerEntries.get(cfg.id);
      if (entry === undefined) {
        if (this.layerFactory === null) continue;
        const renderer = this.layerFactory(this.ctx.gl, cfg);
        const renderCfg = { ...cfg, visible } as LayerConfig;
        this.layerEntries.set(cfg.id, { renderer, config: cfg, effectiveVisible: visible, renderCfg });
        renderer.updateConfig?.(renderCfg);
        ordered.push(renderer);
        continue;
      }
      if (entry.config !== cfg || entry.effectiveVisible !== visible) {
        entry.renderCfg = { ...cfg, visible } as LayerConfig;
        entry.renderer.updateConfig?.(entry.renderCfg);
        entry.config = cfg;
        entry.effectiveVisible = visible;
      }
      ordered.push(entry.renderer);
    }

    this.layers.length = 0;
    for (let i = 0; i < ordered.length; i++) this.layers.push(ordered[i]!);
    this.layerOrder.length = 0;
    for (let i = 0; i < configs.length; i++) this.layerOrder.push(configs[i]!.id);
  }

  /** Installs modulation bindings and immediately restores any parameter that is no longer bound. */
  setLyricOffsetMs(ms: number): void { this.lyricOffsetMs = ms; }

  setModulationBindings(bindings: readonly ModulationBinding[]): void {
    const previous = this.modBindings;
    this.modBindings = bindings;
    for (let i = 0; i < previous.length; i++) {
      const b = previous[i]!;
      const entry = this.layerEntries.get(b.targetLayerId);
      if (entry === undefined) continue;
      const base = readNumericParam(entry.config, b.targetParameter);
      if (base === null) continue;
      (entry.renderCfg as unknown as Record<string, number>)[b.targetParameter] = base;
    }
  }

  private applyModulations(audio: AudioFramePacket): void {
    const bindings = this.modBindings;
    for (let i = 0; i < bindings.length; i++) {
      const b = bindings[i]!;
      const entry = this.layerEntries.get(b.targetLayerId);
      if (entry === undefined) continue;
      const base = readNumericParam(entry.config, b.targetParameter);
      if (base === null) continue;
      const value = clampModulated(b.targetParameter as ModulationTarget, evaluateModulation(base, b, audio));
      (entry.renderCfg as unknown as Record<string, number>)[b.targetParameter] = value;
    }
  }

  /** Loads a custom font into every lyric renderer (FontFace is created inside the renderer). */
  async loadLyricFont(buffer: ArrayBuffer, name: string): Promise<void> {
    const jobs: Promise<void>[] = [];
    this.layerEntries.forEach((entry) => {
      const sink = entry.renderer as ILayerRenderer & { loadFont?: (b: ArrayBuffer, n: string) => Promise<void> };
      if (typeof sink.loadFont === 'function') jobs.push(sink.loadFont(buffer, name));
    });
    await Promise.all(jobs);
  }

  /** Pushes a new lyric document into any attached lyric layer (structural, no renderer import). */
  syncLyricsDocument(doc: LyricDocument): void {
    this.layerEntries.forEach((entry) => {
      const sink = entry.renderer as ILayerRenderer & { setDocument?: (d: LyricDocument) => void };
      if (typeof sink.setDocument === 'function') sink.setDocument(doc);
    });
  }

  /** Removes every layer and disposes it (the engine owns attached layers). */
  clearLayers(): void {
    for (let i = 0; i < this.layers.length; i++) this.layers[i]!.dispose();
    this.layers.length = 0;
    this.layerEntries.clear();
    this.lastConfigs = [];
  }

  getGL(): WebGL2RenderingContext {
    return this.ctx.gl;
  }

  /** Trail feedback decay; clamped to <= 0.96 so the framebuffer can never integrate to infinity. */
  setTrailDecay(decay: number): void {
    this.trailDecay = Math.min(0.96, Math.max(0, decay));
  }

  setBloomThreshold(threshold: number): void {
    this.bloomThreshold = Math.max(0, threshold);
  }

  setBloomIntensity(intensity: number): void {
    this.bloomIntensity = Math.max(0, intensity);
  }

  setChromatic(amount: number): void {
    this.chromatic = Math.min(0.05, Math.max(0, amount));
  }

  setVignette(amount: number): void {
    this.vignette = Math.min(1, Math.max(0, amount));
  }

  setExposure(exposure: number): void {
    this.exposure = Math.min(8, Math.max(0.05, exposure));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const canvas = this.ctx.gl.canvas as HTMLCanvasElement;
    canvas.removeEventListener('webglcontextlost', this.onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored, false);
    this.clearLayers();
    this.palette.dispose();
    this.trails.dispose();
    this.bloom.dispose();
    this.composite.dispose();
    this.hdr.dispose();
    this.ctx.gl.deleteVertexArray(this.vao);
    if (this.rt) this.pool.destroy(this.rt);
    this.rt = null;
  }

  getFrameCount(): number { return this.frames; }
  getCaps() { return this.ctx.caps; }
}

// role: render loop — audio-source fetch + layer dispatch into an offscreen RGBA16F target, then
//       an ACES tone-map + linear→sRGB pass to the default framebuffer. Falls back to the M1 spoke
//       shader when no layer is attached. Owns the RT, the palette, the layer context and Φ.
// invariants: render() allocates nothing (no `new`, literals, string keys, or template strings —
//             resize detection uses numeric fields); layerCtx is allocated once and mutated;
//             Φ accumulates IDLE_OMEGA*dt in JS and is uploaded as u_phase, so no wall-clock shader
//             term exists; RT format is RGBA16F unless EXT_color_buffer_float is absent; no WebGL1.
// owner milestone: M6 (M1 fallback retained)
