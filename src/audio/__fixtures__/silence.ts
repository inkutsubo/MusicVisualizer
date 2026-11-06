import { MASTER_BANDS, WAVEFORM_SAMPLES } from '../../types/audio';
import type { AudioFramePacket } from '../../types/audio';
import type { FixtureRunner } from './index';

type MutablePacket = { -readonly [K in keyof AudioFramePacket]: AudioFramePacket[K] };

/** All-zero packet: no spectrum, no transients, Φ_audio held at 0, silence in LUFS terms. */
export function createSilence(): FixtureRunner {
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
    id: 'silence',
    frameAt(t: number): AudioFramePacket {
      frame.t = t;
      return frame;
    },
    reset(): void {
      frame.t = 0;
    },
  };
}

// role: silence fixture — proves the zero-height / no-emission path of every layer.
// invariants: every numeric field stays 0 (lufsApprox = -Infinity); the same arrays and packet
//             are returned on every call, so the render path never allocates.
// owner milestone: M3a
