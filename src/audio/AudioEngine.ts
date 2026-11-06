import { FeatureTimelineCache } from './FeatureTimelineCache';
import type { TimelineData } from './FeatureTimelineCache';
import type { AudioFramePacket } from '../types/audio';

export interface LoadedTrack {
  readonly name: string;
  readonly duration: number;
  readonly frames: number;
  readonly sampleRate: number;
}

export interface LoadProgress {
  readonly stage: 'decode' | 'dsp';
  readonly progress: number;
}

interface WorkerDone extends TimelineData {
  readonly type: 'done';
}

/**
 * Owns decoding, the DSP worker, the checkpoint cache and audible playback. The render path only
 * ever reads `getFrameAt(t)`, so scrubbing and offline export are deterministic.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private cache: FeatureTimelineCache | null = null;
  private worker: Worker | null = null;
  private source: AudioBufferSourceNode | null = null;

  private playing = false;
  private startCtxTime = 0;
  private startOffset = 0;
  private pausedAt = 0;

  private track: LoadedTrack | null = null;

  onLoad: ((track: LoadedTrack) => void) | null = null;
  onProgress: ((p: LoadProgress) => void) | null = null;

  get loaded(): boolean { return this.cache !== null; }
  get duration(): number { return this.track?.duration ?? 0; }
  get trackName(): string { return this.track?.name ?? ''; }
  get isPlaying(): boolean { return this.playing; }
  get frameCount(): number { return this.cache?.frameCount ?? 0; }
  get contextState(): AudioContextState | null { return this.ctx?.state ?? null; }

  private ensureContext(): AudioContext {
    if (this.ctx === null) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
    }
    return this.ctx;
  }

  /** Decodes a file, runs the DSP worker, and installs the resulting checkpoint cache. */
  async loadFile(file: File): Promise<LoadedTrack> {
    this.stop();
    this.cache = null;
    this.track = null;
    this.buffer = null;

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

    this.onProgress?.({ stage: 'decode', progress: 0 });
    const bytes = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(bytes);
    this.onProgress?.({ stage: 'decode', progress: 1 });

    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const mono = new Float32Array(length);
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] = (mono[i] ?? 0) + data[i]!;
    }
    const scale = 1 / Math.max(1, channels);
    for (let i = 0; i < length; i++) mono[i] = (mono[i] ?? 0) * scale;

    const data = await this.runWorker(mono, buffer.sampleRate);

    const cache = new FeatureTimelineCache(data);
    cache.setWaveformSource(mono, buffer.sampleRate);
    this.cache = cache;
    this.buffer = buffer;
    this.pausedAt = 0;
    this.track = {
      name: file.name,
      duration: buffer.duration,
      frames: data.frames,
      sampleRate: buffer.sampleRate,
    };
    this.onLoad?.(this.track);
    return this.track;
  }

  private runWorker(pcm: Float32Array, sampleRate: number): Promise<TimelineData> {
    return new Promise<TimelineData>((resolve, reject) => {
      const worker = new Worker(new URL('./dsp.worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      worker.onmessage = (ev: MessageEvent<WorkerDone | { type: 'progress'; progress: number }>) => {
        const msg = ev.data;
        if (msg.type === 'progress') {
          this.onProgress?.({ stage: 'dsp', progress: msg.progress });
          return;
        }
        this.worker = null;
        worker.terminate();
        resolve({
          frames: msg.frames, tickRate: msg.tickRate, duration: msg.duration,
          spectra: msg.spectra, bands: msg.bands, transients: msg.transients,
          phase: msg.phase, rms: msg.rms, lufs: msg.lufs,
        });
      };
      worker.onerror = (e) => {
        this.worker = null;
        worker.terminate();
        reject(new Error(`DSP worker failed: ${e.message}`));
      };
      const copy = pcm.slice();
      worker.postMessage({ type: 'process', pcm: copy, sampleRate }, [copy.buffer]);
    });
  }

  getFrameAt(t: number): AudioFramePacket | null {
    return this.cache !== null ? this.cache.getFrameAt(t) : null;
  }

  play(offset: number): void {
    if (this.buffer === null) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
    this.stopSource();
    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(ctx.destination);
    const start = Math.min(Math.max(0, offset), Math.max(0, this.buffer.duration - 0.01));
    source.start(0, start);
    this.source = source;
    this.playing = true;
    this.startCtxTime = ctx.currentTime;
    this.startOffset = start;
  }

  pause(): void {
    if (!this.playing) return;
    this.pausedAt = this.getTime();
    this.stopSource();
    this.playing = false;
  }

  seek(t: number): void {
    if (this.playing) this.play(t);
    else this.pausedAt = Math.max(0, t);
  }

  /** Master clock while audio is playing; falls back to the paused position. */
  getTime(): number {
    if (this.playing && this.ctx !== null) {
      return this.startOffset + (this.ctx.currentTime - this.startCtxTime);
    }
    return this.pausedAt;
  }

  stop(): void {
    this.stopSource();
    this.playing = false;
    this.pausedAt = 0;
  }

  private stopSource(): void {
    if (this.source !== null) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
  }

  dispose(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    if (this.ctx !== null) void this.ctx.close();
    this.ctx = null;
    this.buffer = null;
    this.cache = null;
    this.track = null;
  }
}

export const audioEngine = new AudioEngine();

// role: audio engine — decode, DSP worker orchestration, playback clock and checkpoint lookup.
// invariants: no analyser nodes; renderers only see AudioFramePacket checkpoints; AudioContext
//             time is the master clock while playing.
// owner milestone: M9
