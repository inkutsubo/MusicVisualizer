import { MASTER_BANDS, WAVEFORM_SAMPLES } from '../../types/audio';
import type { AudioFramePacket } from '../../types/audio';
import type { FixtureRunner } from './index';

type MutablePacket = { -readonly [K in keyof AudioFramePacket]: AudioFramePacket[K] };

const SWEEP_PERIOD = 8;        // seconds for one full log sweep
const PEAK_HOLD_TAU = 0.35;    // seconds

/** Single-bin log-sweep peak, one 440 Hz monitoring waveform, peak-hold with gravity. */
export function createSineSweep(): FixtureRunner {
  const spectrum = new Float32Array(MASTER_BANDS);
  const peakHold = new Float32Array(MASTER_BANDS);
  const waveform = new Float32Array(WAVEFORM_SAMPLES);
  const waveformSmoothed = new Float32Array(WAVEFORM_SAMPLES);
  const bands = { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };
  const transients = { kickImpulse: 0, snareImpulse: 0, fullImpulse: 0 };
  const frame: MutablePacket = {
    t: 0, spectrum, peakHold, waveform, waveformSmoothed, bands, transients,
    phaseAudio: 0, rms: 0.5, lufsApprox: -14,
  };

  let prevT = 0;

  return {
    id: 'sineSweep',
    frameAt(t: number): AudioFramePacket {
      const dt = Math.max(0, Math.min(t - prevT, 0.1));
      prevT = t;

      spectrum.fill(0);
      const u = (((t % SWEEP_PERIOD) + SWEEP_PERIOD) % SWEEP_PERIOD) / SWEEP_PERIOD;
      const bandIdx = Math.min(MASTER_BANDS - 1, Math.max(0, Math.floor(u * MASTER_BANDS)));
      spectrum[bandIdx] = 1.0;
      // One neighbor at 0.5 so a single-bin peak can never read as two equal bars.
      if (bandIdx > 0) spectrum[bandIdx - 1] = 0.5;

      // Peak hold: α = 1 - exp(-Δt/τ) applied as the equivalent exp(-Δt/τ) decay.
      const keep = Math.exp(-dt / PEAK_HOLD_TAU);
      for (let i = 0; i < MASTER_BANDS; i++) {
        const s = spectrum[i]!;
        const p = peakHold[i]! * keep;
        peakHold[i] = s > p ? s : p;
      }

      // Waveform: pure 440 Hz sine over the trailing 1 s window.
      const f = 440;
      for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
        const tau = t - (WAVEFORM_SAMPLES - i) / 48000;
        const v = Math.sin(2 * Math.PI * f * tau) * 0.5;
        waveform[i] = v;
        waveformSmoothed[i] = v;
      }

      bands.subBass = 0; bands.bass = 0; bands.lowMid = 0;
      bands.mid = 0; bands.highMid = 0; bands.high = 0;
      if (u < 0.2) bands.subBass = 1;
      else if (u < 0.4) bands.bass = 1;
      else if (u < 0.55) bands.lowMid = 1;
      else if (u < 0.75) bands.mid = 1;
      else if (u < 0.88) bands.highMid = 1;
      else bands.high = 1;

      frame.t = t;
      frame.phaseAudio = t * 1.5;
      return frame;
    },
    reset(): void {
      peakHold.fill(0);
      prevT = 0;
    },
  };
}

// role: sine-sweep fixture — one moving spectral peak (8 s loop) for single-bar and wrap checks.
// invariants: exactly one bin at 1.0 and at most one neighbor at 0.5; the peak advances with
//             t % 8; peak-hold decays with exp(-Δt/τ), never a fixed per-frame multiply-down.
// owner milestone: M3a
