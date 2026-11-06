import { MASTER_BANDS, WAVEFORM_SAMPLES } from '../types/audio';
import type { AudioFramePacket } from '../types/audio';

interface MutableBands { subBass: number; bass: number; lowMid: number; mid: number; highMid: number; high: number }
interface MutableTransients { kickImpulse: number; snareImpulse: number; fullImpulse: number }

export interface TimelineData {
  readonly frames: number;
  readonly tickRate: number;
  readonly duration: number;
  readonly spectra: Float32Array;
  readonly bands: Float32Array;
  readonly transients: Float32Array;
  readonly phase: Float32Array;
  readonly rms: Float32Array;
  readonly lufs: Float32Array;
}

/**
 * Frame-indexed checkpoint store. All DSP results live in flat typed arrays produced by the
 * worker; a single reusable `AudioFramePacket` is filled on lookup so scrubbing and export can
 * query any time without allocations.
 */
export class FeatureTimelineCache {
  private readonly data: TimelineData;
  private pcm: Float32Array | null = null;
  private sampleRate = 48000;
  private readonly packet: AudioFramePacket;
  private readonly bands: MutableBands;
  private readonly transients: MutableTransients;

  constructor(data: TimelineData) {
    this.data = data;
    this.bands = { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };
    this.transients = { kickImpulse: 0, snareImpulse: 0, fullImpulse: 0 };
    this.packet = {
      t: 0,
      spectrum: new Float32Array(MASTER_BANDS),
      peakHold: new Float32Array(MASTER_BANDS),
      waveform: new Float32Array(WAVEFORM_SAMPLES),
      waveformSmoothed: new Float32Array(WAVEFORM_SAMPLES),
      bands: this.bands,
      transients: this.transients,
      phaseAudio: 0,
      rms: 0,
      lufsApprox: -Infinity,
    };
  }

  get frameCount(): number { return this.data.frames; }
  get duration(): number { return this.data.duration; }

  /** PCM is retained only for deterministic waveform slicing (never analysed on demand). */
  setWaveformSource(pcm: Float32Array, sampleRate: number): void {
    this.pcm = pcm;
    this.sampleRate = sampleRate;
  }

  getFrameAt(t: number): AudioFramePacket {
    const frames = this.data.frames;
    if (frames === 0) return this.emptyPacket(t);
    const idx = Math.min(frames - 1, Math.max(0, Math.round(t * this.data.tickRate)));
    const spectra = this.data.spectra;
    const base = idx * MASTER_BANDS;
    const spectrum = this.packet.spectrum;
    const peakHold = this.packet.peakHold;
    for (let i = 0; i < MASTER_BANDS; i++) {
      const v = spectra[base + i] ?? 0;
      spectrum[i] = v;
      peakHold[i] = v;
    }
    const b = this.data.bands;
    const bo = idx * 6;
    this.bands.subBass = b[bo] ?? 0;
    this.bands.bass = b[bo + 1] ?? 0;
    this.bands.lowMid = b[bo + 2] ?? 0;
    this.bands.mid = b[bo + 3] ?? 0;
    this.bands.highMid = b[bo + 4] ?? 0;
    this.bands.high = b[bo + 5] ?? 0;
    const tr = this.data.transients;
    const to = idx * 3;
    this.transients.kickImpulse = tr[to] ?? 0;
    this.transients.snareImpulse = tr[to + 1] ?? 0;
    this.transients.fullImpulse = tr[to + 2] ?? 0;

    (this.packet as { t: number }).t = t;
    (this.packet as { phaseAudio: number }).phaseAudio = this.data.phase[idx] ?? 0;
    (this.packet as { rms: number }).rms = this.data.rms[idx] ?? 0;
    (this.packet as { lufsApprox: number }).lufsApprox = this.data.lufs[idx] ?? -Infinity;

    this.fillWaveform(t);
    return this.packet;
  }

  private emptyPacket(t: number): AudioFramePacket {
    this.packet.spectrum.fill(0);
    this.packet.peakHold.fill(0);
    this.packet.waveform.fill(0);
    this.packet.waveformSmoothed.fill(0);
    this.bands.subBass = 0; this.bands.bass = 0; this.bands.lowMid = 0;
    this.bands.mid = 0; this.bands.highMid = 0; this.bands.high = 0;
    this.transients.kickImpulse = 0; this.transients.snareImpulse = 0; this.transients.fullImpulse = 0;
    (this.packet as { t: number }).t = t;
    (this.packet as { phaseAudio: number }).phaseAudio = 0;
    (this.packet as { rms: number }).rms = 0;
    (this.packet as { lufsApprox: number }).lufsApprox = -Infinity;
    return this.packet;
  }

  private fillWaveform(t: number): void {
    const out = this.packet.waveform;
    const smooth = this.packet.waveformSmoothed;
    const pcm = this.pcm;
    if (pcm === null) {
      out.fill(0);
      smooth.fill(0);
      return;
    }
    const windowSamples = Math.max(WAVEFORM_SAMPLES, Math.round(this.sampleRate * 0.046));
    const start = Math.round(t * this.sampleRate) - (windowSamples >> 1);
    const stride = windowSamples / WAVEFORM_SAMPLES;
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      const pos = start + i * stride;
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      const a = pcm[i0] ?? 0;
      const b = pcm[i0 + 1] ?? 0;
      const v = a + (b - a) * frac;
      out[i] = v;
      smooth[i] = v;
    }
  }
}

// role: deterministic checkpoint cache — maps any time t to a pre-computed AudioFramePacket.
// invariants: one reusable packet, allocation-free lookups, waveform derived deterministically
//             from the decoded PCM; no analyser or wall-clock involvement.
// owner milestone: M9
