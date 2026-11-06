import { MASTER_BANDS, WAVEFORM_SAMPLES } from '../../types/audio';
import type { AudioFramePacket } from '../../types/audio';
import type { FixtureRunner } from './index';

type MutablePacket = { -readonly [K in keyof AudioFramePacket]: AudioFramePacket[K] };

/** Deterministic [0,1) hash — same value for the same index on every call and every run. */
function hash01(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Full-scale pink-ish noise with a deliberate headroom notch: every bin sits in
 * [0.92, 0.98], never 1.0, so a visibly clipped bar means the emission/HDR path is wrong.
 */
export function createBrickwallNoise(): FixtureRunner {
  const spectrum = new Float32Array(MASTER_BANDS);
  const peakHold = new Float32Array(MASTER_BANDS);
  const waveform = new Float32Array(WAVEFORM_SAMPLES);
  const waveformSmoothed = new Float32Array(WAVEFORM_SAMPLES);
  const bands = { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };
  const transients = { kickImpulse: 0, snareImpulse: 0, fullImpulse: 0 };
  const frame: MutablePacket = {
    t: 0, spectrum, peakHold, waveform, waveformSmoothed, bands, transients,
    phaseAudio: 0, rms: 0.95, lufsApprox: -9,
  };

  // Static content: computed once, never re-randomised per frame.
  for (let i = 0; i < MASTER_BANDS; i++) spectrum[i] = 0.92 + 0.06 * hash01(i);
  peakHold.set(spectrum);

  // Pink-ish 1/f weighting over four octaves of deterministic noise.
  for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
    let v = 0;
    v += 0.45 * (hash01(i) - 0.5);
    v += 0.28 * (hash01(i / 2 + 1013) - 0.5);
    v += 0.16 * (hash01(i / 4 + 2027) - 0.5);
    v += 0.08 * (hash01(i / 8 + 3041) - 0.5);
    waveform[i] = v;
  }
  waveformSmoothed.set(waveform);

  bands.subBass = 0.95; bands.bass = 0.95; bands.lowMid = 0.95;
  bands.mid = 0.95; bands.highMid = 0.95; bands.high = 0.95;

  return {
    id: 'brickwall',
    frameAt(t: number): AudioFramePacket {
      frame.t = t;
      return frame;
    },
    reset(): void {
      frame.t = 0;
    },
  };
}

// role: brickwall fixture — steady 0.92–0.98 noise floor with a headroom notch below 1.0.
// invariants: no bin ever reaches 1.0; content is static across frames; no transients;
//             arrays/packet are shared across calls.
// owner milestone: M3a
