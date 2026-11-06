import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { RenderEngine } from '../core/RenderEngine';

export interface ExportOptions {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly duration: number;      // seconds
  readonly bitrate?: number;
  readonly onProgress?: (progress: number) => void;
  readonly signal?: AbortSignal;
}

const DEFAULT_BITRATE = 15_000_000;
const MAX_QUEUE = 8;
const YIELD_EVERY = 8;

const AUDIO_CODEC = 'mp4a.40.2';
const AUDIO_RATE = 48000;
const AUDIO_CHANNELS = 2;
const AUDIO_BITRATE = 192_000;   // 320 kbps is rejected by the platform AAC encoder
const AUDIO_CHUNK_FRAMES = 1024;

interface VideoSupport { readonly supported: boolean; readonly codec: string }

async function pickVideoCodec(width: number, height: number, fps: number, bitrate: number): Promise<VideoSupport> {
  const candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42e01f'];
  for (let i = 0; i < candidates.length; i++) {
    const codec = candidates[i]!;
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
      if (s.supported === true) return { supported: true, codec };
    } catch { /* try next */ }
  }
  return { supported: false, codec: candidates[0]! };
}

async function audioEncodingSupported(): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return false;
  try {
    const s = await AudioEncoder.isConfigSupported({
      codec: AUDIO_CODEC, sampleRate: AUDIO_RATE, numberOfChannels: AUDIO_CHANNELS, bitrate: AUDIO_BITRATE,
    });
    return s.supported === true;
  } catch {
    return false;
  }
}

export interface ExportStats {
  readonly frames: number;
  readonly audio: boolean;
  readonly bytes: number;
}

/**
 * Deterministic offline exporter: steps the engine at exactly 1/fps, captures the canvas into a
 * VideoFrame, feeds WebCodecs with strict queue backpressure, and muxes a silent AAC-LC track
 * alongside the H.264 video.
 */
export class OfflineVideoExporter {
  constructor(private readonly engine: RenderEngine) {}

  async export(opts: ExportOptions): Promise<Blob> {
    const width = Math.max(2, Math.round(opts.width / 2) * 2);
    const height = Math.max(2, Math.round(opts.height / 2) * 2);
    const fps = Math.max(1, Math.round(opts.fps));
    const duration = Math.max(0, opts.duration);
    const totalFrames = Math.max(1, Math.round(duration * fps));
    const bitrate = opts.bitrate ?? DEFAULT_BITRATE;

    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
      throw new Error('WebCodecs is unavailable in this browser');
    }

    const video = await pickVideoCodec(width, height, fps, bitrate);
    if (!video.supported) throw new Error(`H.264 encoder does not support ${width}x${height}@${fps}`);

    const withAudio = await audioEncodingSupported();
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width, height, frameRate: fps },
      ...(withAudio
        ? { audio: { codec: 'aac' as const, numberOfChannels: AUDIO_CHANNELS, sampleRate: AUDIO_RATE } }
        : {}),
      fastStart: 'in-memory',
    });

    let encoderError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encoderError = e; },
    });
    encoder.configure({ codec: video.codec, width, height, bitrate, framerate: fps });

    let audioEncoder: AudioEncoder | null = null;
    if (withAudio) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => { encoderError = e; },
      });
      audioEncoder.configure({
        codec: AUDIO_CODEC,
        sampleRate: AUDIO_RATE,
        numberOfChannels: AUDIO_CHANNELS,
        bitrate: AUDIO_BITRATE,
      });
    }

    const silent = new Float32Array(AUDIO_CHUNK_FRAMES * AUDIO_CHANNELS);
    const totalSamples = Math.round(duration * AUDIO_RATE);
    let sampleOffset = 0;

    this.engine.beginOffline(width, height);
    try {
      for (let frame = 0; frame < totalFrames; frame++) {
        if (opts.signal?.aborted === true) throw new DOMException('Export aborted', 'AbortError');
        if (encoderError !== null) throw encoderError;

        this.engine.renderFrame(frame / fps, 1 / fps);

        const videoFrame = new VideoFrame(this.engine.getCanvas(), {
          timestamp: Math.round((frame * 1_000_000) / fps),
          duration: Math.round(1_000_000 / fps),
        });
        encoder.encode(videoFrame, { keyFrame: frame % fps === 0 });
        videoFrame.close();

        // Keep the audio track roughly interleaved with video by timestamp.
        const nextVideoTime = (frame + 1) / fps;
        while (audioEncoder !== null && sampleOffset < totalSamples && sampleOffset / AUDIO_RATE < nextVideoTime) {
          const frames = Math.min(AUDIO_CHUNK_FRAMES, totalSamples - sampleOffset);
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: AUDIO_RATE,
            numberOfFrames: frames,
            numberOfChannels: AUDIO_CHANNELS,
            timestamp: Math.round((sampleOffset / AUDIO_RATE) * 1_000_000),
            data: silent.subarray(0, frames * AUDIO_CHANNELS),
          });
          audioEncoder.encode(audioData);
          audioData.close();
          sampleOffset += frames;
        }

        while (encoder.encodeQueueSize > MAX_QUEUE || (audioEncoder !== null && audioEncoder.encodeQueueSize > MAX_QUEUE)) {
          if (encoderError !== null) throw encoderError;
          await new Promise<void>((resolve) => { setTimeout(resolve, 1); });
        }

        if (frame % YIELD_EVERY === 0) {
          opts.onProgress?.((frame + 1) / totalFrames);
          await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
        }
      }

      if (opts.signal?.aborted === true) throw new DOMException('Export aborted', 'AbortError');
      await Promise.all([
        encoder.flush(),
        audioEncoder !== null ? audioEncoder.flush() : Promise.resolve(),
      ]);
      if (encoderError !== null) throw encoderError;
      encoder.close();
      if (audioEncoder !== null) audioEncoder.close();
      muxer.finalize();

      const buffer = muxer.target.buffer;
      if (buffer === null) throw new Error('Muxer produced no buffer');
      opts.onProgress?.(1);
      return new Blob([buffer], { type: 'video/mp4' });
    } finally {
      this.engine.endOffline();
      if (encoder.state !== 'closed') {
        try { encoder.close(); } catch { /* already closed */ }
      }
      if (audioEncoder !== null && audioEncoder.state !== 'closed') {
        try { audioEncoder.close(); } catch { /* already closed */ }
      }
    }
  }
}

// role: offline export orchestrator — deterministic frame stepping, VideoFrame capture, silent AAC
//       audio track, strict backpressure and muxing.
// invariants: time comes only from frame index / fps (no wall clock); encoder queues stay <= 8;
//             canvas resolution and trail history are restored even on abort/error.
// owner milestone: M8
