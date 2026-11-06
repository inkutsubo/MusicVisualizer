import { MASTER_BANDS, WAVEFORM_SAMPLES } from '../../types/audio';
import type { AudioFramePacket } from '../../types/audio';
import type { FixtureRunner } from './index';

type MutablePacket = { -readonly [K in keyof AudioFramePacket]: AudioFramePacket[K] };

const PERIOD = 0.5;    // impulse every 500 ms
const HOLD = 0.05;     // full-scale hold so a 60 fps frame always lands on the snap
const TAU = 0.15;      // post-hold exponential decay (≈ -60 dB after 400 ms)

/** Impulse train: broadband snap every 500 ms, then exponential decay. */
export function createImpulseTrain(): FixtureRunner {
  const spectrum = new Float32Array(MASTER_BANDS);
  const peakHold = new Float32Array(MASTER_BANDS);
  const waveform = new Float32Array(WAVEFORM_SAMPLES);
  const waveformSmoothed = new Float32Array(WAVEFORM_SAMPLES);
  const bands = { subBass: 0, bass: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };
  const transients = { kickImpulse: 0, snareImpulse: 0, fullImpulse: 0 };
  const frame: MutablePacket = {
    t: 0, spectrum, peakHold, waveform, waveformSmoothed, bands, transients,
    phaseAudio: 0, rms: 0, lufsApprox: -Infinity,
  };

  return {
    id: 'impulseTrain',
    frameAt(t: number): AudioFramePacket {
      const phase = ((t % PERIOD) + PERIOD) % PERIOD;
      const env = phase <= HOLD ? 1.0 : Math.exp(-(phase - HOLD) / TAU);

      for (let i = 0; i < MASTER_BANDS; i++) spectrum[i] = env;
      peakHold.set(spectrum);

      for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
        const tau = t - (WAVEFORM_SAMPLES - i) / 48000;
        waveform[i] = Math.sin(2 * Math.PI * 62 * tau) * env * 0.9;
      }
      waveformSmoothed.set(waveform);

      bands.subBass = env; bands.bass = env; bands.lowMid = env;
      bands.mid = env; bands.highMid = env; bands.high = env;

      transients.kickImpulse = env;
      transients.snareImpulse = env;
      transients.fullImpulse = env;

      frame.t = t;
      frame.phaseAudio = t * 2.0;
      frame.rms = env * 0.9;
      frame.lufsApprox = -14 + 20 * Math.log10(Math.max(env, 1e-6));
      return frame;
    },
    reset(): void {
      spectrum.fill(0);
      peakHold.fill(0);
      waveform.fill(0);
      waveformSmoothed.fill(0);
    },
  };
}

// role: impulse-train fixture — simultaneous full-band snap every 500 ms then exp(-Δt/0.15) decay.
// invariants: envelope is a step to 1.0 (never a ramp) and decays to <6% before the next hit;
//             same arrays/packet every call; Φ_audio advances with t.
// owner milestone: M3a
