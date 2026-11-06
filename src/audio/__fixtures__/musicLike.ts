import { MASTER_BANDS, WAVEFORM_SAMPLES } from '../../types/audio';
import type { AudioFramePacket } from '../../types/audio';
import type { FixtureRunner } from './index';

type MutablePacket = { -readonly [K in keyof AudioFramePacket]: AudioFramePacket[K] };

const TWO_PI = Math.PI * 2;
const PEAK_HOLD_TAU = 0.25;

/** One 1/e half-width Gaussian bump over bin index. */
function bump(i: number, center: number, sigma: number): number {
  const d = (i - center) / sigma;
  return Math.exp(-0.5 * d * d);
}

/** 120 BPM pattern: kick on every beat, snare on the backbeat, hi-hat on eighths. */
export function createMusicLike(): FixtureRunner {
  const spectrum = new Float32Array(MASTER_BANDS);
  const peakHold = new Float32Array(MASTER_BANDS);
  const waveform = new Float32Array(WAVEFORM_SAMPLES);
  const waveformSmoothed = new Float32Array(WAVEFORM_SAMPLES);
  const bands = { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };
  const transients = { kickImpulse: 0, snareImpulse: 0, fullImpulse: 0 };
  const frame: MutablePacket = {
    t: 0, spectrum, peakHold, waveform, waveformSmoothed, bands, transients,
    phaseAudio: 0, rms: 0.35, lufsApprox: -14,
  };

  let prevT = 0;

  return {
    id: 'musicLike',
    frameAt(t: number): AudioFramePacket {
      const dt = Math.max(0, Math.min(t - prevT, 0.1));
      prevT = t;

      const beat = ((t % 0.5) + 0.5) % 0.5;                 // every 500 ms
      const snarePhase = (((t - 0.5) % 1.0) + 1.0) % 1.0;   // backbeat at 0.5, 1.5, …
      const hatPhase = ((t % 0.25) + 0.25) % 0.25;           // every 250 ms

      const envKick = Math.exp(-beat / 0.14);
      const envSnare = Math.exp(-snarePhase / 0.10);
      const envHat = Math.exp(-hatPhase / 0.045);

      for (let i = 0; i < MASTER_BANDS; i++) {
        let v = 0;
        v += envKick * bump(i, 18, 12);
        v += envSnare * 0.85 * bump(i, 105, 24);
        v += envSnare * 0.65 * bump(i, 150, 22);
        v += envHat * 0.8 * bump(i, 215, 28);
        spectrum[i] = v > 1 ? 1 : v;
      }

      const keep = Math.exp(-dt / PEAK_HOLD_TAU);
      for (let i = 0; i < MASTER_BANDS; i++) {
        const p = peakHold[i]! * keep;
        const s = spectrum[i]!;
        peakHold[i] = s > p ? s : p;
      }

      for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
        const tau = t - (WAVEFORM_SAMPLES - i) / 48000;
        let v = 0;
        v += Math.sin(TWO_PI * 55 * tau) * envKick * 0.6;
        v += Math.sin(TWO_PI * 190 * tau) * envSnare * 0.5;
        v += Math.sin(TWO_PI * 9000 * tau) * envHat * 0.08;
        waveform[i] = v;
      }
      waveformSmoothed.set(waveform);

      bands.subBass = envKick * 0.7;
      bands.bass = envKick;
      bands.lowMid = Math.max(envKick * 0.3, envSnare * 0.3);
      bands.mid = envSnare;
      bands.highMid = envSnare * 0.8;
      bands.high = envHat;

      transients.kickImpulse = envKick;
      transients.snareImpulse = envSnare;
      transients.fullImpulse = Math.max(envKick, envSnare);

      frame.t = t;
      frame.phaseAudio = t * 2.0;
      frame.rms = 0.2 + 0.5 * Math.max(envKick, envSnare, envHat * 0.5);
      frame.lufsApprox = -14 + 20 * Math.log10(Math.max(envKick, envSnare, 1e-6));
      return frame;
    },
    reset(): void {
      spectrum.fill(0);
      peakHold.fill(0);
      waveform.fill(0);
      waveformSmoothed.fill(0);
      prevT = 0;
    },
  };
}

// role: music-like fixture — 120 BPM kick/snare/hat pattern as four Gaussian spectral peaks.
// invariants: kick every 0.5 s (bass), snare at 0.5+1.0k (mid/highMid), hat every 0.25 s (high);
//             peak-hold uses exp(-Δt/τ); arrays/packet shared across calls.
// owner milestone: M3a
