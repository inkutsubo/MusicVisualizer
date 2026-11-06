/// <reference lib="webworker" />
import { FFT } from './fft';
import { MASTER_BANDS } from '../types/audio';

const TICK_RATE = 120;
const FFT_SIZE = 4096;
const HALF = FFT_SIZE / 2;

interface ProcessRequest {
  readonly type: 'process';
  readonly pcm: Float32Array;
  readonly sampleRate: number;
}

interface DoneResponse {
  readonly type: 'done';
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

interface ProgressResponse {
  readonly type: 'progress';
  readonly progress: number;
}

function bark(freq: number): number {
  return 13 * Math.atan(0.00076 * freq) + 3.5 * Math.atan((freq / 7500) * (freq / 7500));
}

function inverseBark(target: number, maxFreq: number): number {
  let lo = 0;
  let hi = maxFreq;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) * 0.5;
    if (bark(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) * 0.5;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<ProcessRequest>): void => {
  const msg = ev.data;
  if (msg.type !== 'process') return;

  const pcm = msg.pcm;
  const sampleRate = msg.sampleRate;
  const hop = Math.max(1, Math.floor(sampleRate / TICK_RATE));
  const tickRate = sampleRate / hop;
  const frames = Math.max(0, Math.floor((pcm.length - FFT_SIZE) / hop) + 1);
  const duration = pcm.length / sampleRate;
  const dt = hop / sampleRate;

  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    const x = (2 * Math.PI * i) / (FFT_SIZE - 1);
    window[i] = 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x);
  }

  const fft = new FFT(FFT_SIZE);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const mag = new Float32Array(HALF);

  // 256 logarithmic (Bark) band centres as fractional FFT bins, plus a high-frequency tilt so
  // cymbals and hats are visible next to bass energy.
  const maxFreq = Math.min(sampleRate / 2, 20000);
  const maxBark = bark(maxFreq);
  const bandBin = new Float32Array(MASTER_BANDS);
  const bandTilt = new Float32Array(MASTER_BANDS);
  for (let i = 0; i < MASTER_BANDS; i++) {
    const b = (maxBark * (i + 0.5)) / MASTER_BANDS;
    const f = inverseBark(b, maxFreq);
    bandBin[i] = Math.min(HALF - 1.001, Math.max(1, (f * FFT_SIZE) / sampleRate));
    bandTilt[i] = Math.max(1, f / 300);
  }

  const ranges = [
    [20, 60], [60, 250], [250, 500], [500, 2000], [2000, 6000], [6000, 16000],
  ] as const;
  const rangeBins: Array<[number, number]> = ranges.map(([lo, hi]) => [
    Math.max(1, Math.floor((lo * FFT_SIZE) / sampleRate)),
    Math.min(HALF - 1, Math.ceil((hi * FFT_SIZE) / sampleRate)),
  ]);
  const rangeTilt = ranges.map(([lo, hi]) => Math.max(1, ((lo + hi) * 0.5) / 300));
  const lowBinLimit = Math.max(2, Math.floor((250 * FFT_SIZE) / sampleRate));

  const spectra = new Float32Array(frames * MASTER_BANDS);
  const bandOut = new Float32Array(frames * 6);
  const transientOut = new Float32Array(frames * 3);
  const phaseOut = new Float32Array(frames);
  const rmsOut = new Float32Array(frames);
  const lufsOut = new Float32Array(frames);

  const currNorm = new Float32Array(MASTER_BANDS);
  const currRaw = new Float32Array(MASTER_BANDS);
  const bandPeak = new Float32Array(MASTER_BANDS);
  for (let i = 0; i < MASTER_BANDS; i++) bandPeak[i] = 1e-6;
  const bandPeak6 = new Float32Array(6);
  for (let i = 0; i < 6; i++) bandPeak6[i] = 1e-6;
  const peakDecay = Math.exp(-dt / 8);
  let globalPeak = 1e-6;
  let rangePeak = 1e-6;
  let prevRms = 0;
  const rangeRaw = new Float32Array(6);
  const rangePrev = new Float32Array(6);
  let phase = 0;

  for (let frame = 0; frame < frames; frame++) {
    const offset = frame * hop;

    let sumSq = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = pcm[offset + i] ?? 0;
      sumSq += s * s;
      re[i] = s * window[i]!;
      im[i] = 0;
    }
    const rms = Math.sqrt(sumSq / FFT_SIZE);
    fft.transform(re, im);

    let centroidNum = 0;
    let centroidDen = 0;

    for (let k = 1; k < HALF; k++) {
      const m = Math.sqrt(re[k]! * re[k]! + im[k]! * im[k]!);
      mag[k] = m;
      if (k < lowBinLimit) {
        centroidNum += m * ((k * sampleRate) / FFT_SIZE);
        centroidDen += m;
      }
    }

    // Per-band auto-gain: every band is normalised by its own slow-decaying peak, which keeps
    // hi-hats and bass simultaneously visible without a global AGC crushing the highs.
    for (let i = 0; i < MASTER_BANDS; i++) {
      const idx = bandBin[i]!;
      const i0 = Math.floor(idx);
      const t = idx - i0;
      const m1 = mag[Math.max(1, i0 - 1)]!;
      const m0 = mag[Math.max(1, i0)]!;
      const p1 = mag[Math.min(HALF - 1, i0 + 1)]!;
      const p2 = mag[Math.min(HALF - 1, i0 + 2)]!;
      const t2 = t * t;
      const t3 = t2 * t;
      const cubic = 0.5 * (2 * m0 + (-m1 + p1) * t + (2 * m1 - 5 * m0 + 4 * p1 - p2) * t2 + (-m1 + 3 * m0 - 3 * p1 + p2) * t3);
      const v = Math.max(0, cubic) * bandTilt[i]!;
      currRaw[i] = v;
      const gate = 1e-5;
      let norm = 0;
      if (v >= gate) {
        let peak = bandPeak[i]! * peakDecay;
        if (v > peak) peak = v;
        bandPeak[i] = peak;
        norm = Math.min(1, Math.pow(v / (peak + 1e-12), 0.5));
      } else {
        bandPeak[i] = bandPeak[i]! * peakDecay;
      }
      currNorm[i] = norm;
      spectra[frame * MASTER_BANDS + i] = norm;

    }

    let framePeak = 0;
    let rangeFramePeak = 0;
    for (let i = 0; i < MASTER_BANDS; i++) {
      const v = currRaw[i]!;
      if (v > framePeak) framePeak = v;
    }
    for (let b = 0; b < 6; b++) {
      const [lo, hi] = rangeBins[b]!;
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += mag[k]!;
      const v = (sum / Math.max(1, hi - lo + 1)) * rangeTilt[b]!;
      rangeRaw[b] = v;
      if (v > rangeFramePeak) rangeFramePeak = v;
      const rgate = 1e-6;
      let rnorm = 0;
      if (v >= rgate) {
        let peak = bandPeak6[b]! * peakDecay;
        if (v > peak) peak = v;
        bandPeak6[b] = peak;
        rnorm = Math.min(1, Math.pow(v / (peak + 1e-12), 0.5));
      } else {
        bandPeak6[b] = bandPeak6[b]! * peakDecay;
      }
      bandOut[frame * 6 + b] = rnorm;
    }
    globalPeak = Math.max(framePeak, globalPeak * peakDecay);
    rangePeak = Math.max(rangeFramePeak, rangePeak * peakDecay);

    const highNow = rangeRaw[4]! + rangeRaw[5]!;
    const kick = Math.min(1, Math.max(0, (rms - prevRms) * 10));
    const snare = Math.min(1, Math.max(0, (highNow - (rangePrev[4]! + rangePrev[5]!)) * 1.5));
    const full = Math.min(1, Math.max(0, kick + snare * 0.6));
    prevRms = rms;
    rangePrev[4] = rangeRaw[4]!;
    rangePrev[5] = rangeRaw[5]!;
    transientOut[frame * 3] = kick;
    transientOut[frame * 3 + 1] = snare;
    transientOut[frame * 3 + 2] = full;

    const centroid = centroidDen > 1e-9 ? centroidNum / centroidDen : 60;
    phase += 2 * Math.PI * Math.min(220, Math.max(30, centroid)) * dt;
    if (phase > Math.PI * 2) phase %= Math.PI * 2;
    phaseOut[frame] = phase;

    rmsOut[frame] = Math.min(1, rms * 4);
    lufsOut[frame] = 20 * Math.log10(rms + 1e-9) - 0.691;

    if ((frame & 127) === 0) {
      const progress: ProgressResponse = { type: 'progress', progress: frame / Math.max(1, frames) };
      ctx.postMessage(progress);
    }
  }

  const response: DoneResponse = {
    type: 'done', frames, tickRate, duration,
    spectra, bands: bandOut, transients: transientOut, phase: phaseOut, rms: rmsOut, lufs: lufsOut,
  };
  ctx.postMessage(response, [spectra.buffer, bandOut.buffer, transientOut.buffer, phaseOut.buffer, rmsOut.buffer, lufsOut.buffer]);
};

// role: DSP worker — STFT, Bark-band mapping with per-band auto-gain, 6-band energy, spectral flux.
// invariants: all analysis runs off the main thread; output is a fixed tick grid of checkpoints
//             transferred as ArrayBuffers; no wall-clock or frame-rate dependence.
// owner milestone: M9
