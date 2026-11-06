export const MASTER_BANDS = 256;
export const WAVEFORM_SAMPLES = 2048;

export interface BandMetrics {
  readonly subBass: number;
  readonly bass: number;
  readonly lowMid: number;
  readonly mid: number;
  readonly highMid: number;
  readonly high: number;
}

export interface TransientMetrics {
  readonly kickImpulse: number;
  readonly snareImpulse: number;
  readonly fullImpulse: number;
}

/** Deterministic per-frame audio snapshot consumed by all renderers. */
export interface AudioFramePacket {
  readonly t: number;                        // seconds, absolute
  readonly spectrum: Float32Array;           // length MASTER_BANDS, [0,1]
  readonly peakHold: Float32Array;           // length MASTER_BANDS, [0,1]
  readonly waveform: Float32Array;           // length WAVEFORM_SAMPLES, [-1,1]
  readonly waveformSmoothed: Float32Array;   // length WAVEFORM_SAMPLES, [-1,1]
  readonly bands: BandMetrics;
  readonly transients: TransientMetrics;
  readonly phaseAudio: number;               // Φ_audio accumulator
  readonly rms: number;                      // [0,1]
  readonly lufsApprox: number;               // approx LUFS value
}

// role: canonical audio contract between the DSP worker and every renderer.
// invariants: arrays are fixed-length and reused (transferable-buffer model), spectrum/peakHold
//             in [0,1], waveform in [-1,1]; no analyser API may ever populate this type.
// owner milestone: M3a
