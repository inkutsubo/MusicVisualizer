import type { AudioFramePacket } from '../types/audio';

export type AudioSource = 'bass' | 'mid' | 'high' | 'kickImpulse' | 'rms' | 'none';

export type ModulationTarget =
  | 'opacity'
  | 'barCount'
  | 'gapRatio'
  | 'cornerRadius'
  | 'hotCoreIntensity'
  | 'thickness'
  | 'glowIntensity'
  | 'polarBaseRadius'
  | 'baseRadius'
  | 'barLength'
  | 'barWidth'
  | 'symmetry'
  | 'idleOmega'
  | 'audioOmega'
  | 'backdropOpacity'
  | 'hdrIntensity'
  | 'bassPulse'
  | 'brightness'
  | 'speed'
  | 'lifetime'
  | 'glow'
  | 'noteRatio'
  | 'titleSize';

export const MODULATION_TARGETS: readonly ModulationTarget[] = [
  'opacity', 'barCount', 'gapRatio', 'cornerRadius', 'hotCoreIntensity',
  'thickness', 'glowIntensity', 'polarBaseRadius', 'baseRadius', 'barLength',
  'barWidth', 'symmetry', 'idleOmega', 'audioOmega', 'backdropOpacity', 'hdrIntensity',
  'bassPulse', 'brightness', 'speed', 'lifetime', 'glow', 'noteRatio', 'titleSize',
];

export const AUDIO_SOURCES: readonly AudioSource[] = ['none', 'bass', 'mid', 'high', 'kickImpulse', 'rms'];

export interface ModulationBinding {
  readonly targetLayerId: string;
  readonly targetParameter: ModulationTarget;
  readonly source: AudioSource;
  readonly amount: number;
}

/**
 * Evaluates one binding against the current audio packet. This function is called once per
 * binding per frame — no objects, arrays or closures are created here.
 */
export function evaluateModulation(
  baseValue: number,
  binding: ModulationBinding,
  audio: AudioFramePacket,
): number {
  if (binding.source === 'none') return baseValue;
  let signal = 0;
  if (binding.source === 'bass') signal = audio.bands.bass;
  else if (binding.source === 'mid') signal = audio.bands.mid;
  else if (binding.source === 'high') signal = audio.bands.high;
  else if (binding.source === 'kickImpulse') signal = audio.transients.kickImpulse;
  else signal = audio.rms;
  return baseValue * (1 + signal * binding.amount);
}

/** Reads a modulatable numeric field from a layer config without allocating a wrapper object. */
export function readNumericParam(config: object, target: ModulationTarget): number | null {
  const record = config as unknown as Record<string, number | undefined>;
  const value = record[target];
  return typeof value === 'number' ? value : null;
}

/** Applies target-specific clamping after modulation. */
export function clampModulated(target: ModulationTarget, value: number): number {
  switch (target) {
    case 'opacity': return Math.min(1, Math.max(0, value));
    case 'barCount': return Math.min(512, Math.max(16, Math.round(value)));
    case 'gapRatio': return Math.min(0.95, Math.max(0, value));
    case 'cornerRadius': return Math.min(1, Math.max(0, value));
    case 'hotCoreIntensity': return Math.min(4, Math.max(0, value));
    case 'thickness': return Math.min(16, Math.max(0.25, value));
    case 'glowIntensity': return Math.min(4, Math.max(0, value));
    case 'polarBaseRadius': return Math.min(1, Math.max(0.05, value));
    case 'baseRadius': return Math.min(0.9, Math.max(0.02, value));
    case 'barLength': return Math.min(1, Math.max(0.01, value));
    case 'barWidth': return Math.min(1, Math.max(0.02, value));
    case 'symmetry': {
      const allowed = [1, 2, 3, 4, 6, 8];
      let best = allowed[0]!;
      let bestDist = Infinity;
      for (let i = 0; i < allowed.length; i++) {
        const d = Math.abs(allowed[i]! - value);
        if (d < bestDist) { bestDist = d; best = allowed[i]!; }
      }
      return best;
    }
    case 'idleOmega': return Math.min(4, Math.max(0, value));
    case 'audioOmega': return Math.min(6, Math.max(0, value));
    case 'backdropOpacity': return Math.min(1, Math.max(0, value));
    case 'hdrIntensity': return Math.min(4, Math.max(0, value));
    case 'bassPulse': return Math.min(0.3, Math.max(0, value));
    case 'brightness': return Math.min(2, Math.max(0, value));
    case 'speed': return Math.min(2, Math.max(0, value));
    case 'lifetime': return Math.min(6, Math.max(0.4, value));
    case 'glow': return Math.min(4, Math.max(0, value));
    case 'noteRatio': return Math.min(1, Math.max(0, value));
    case 'titleSize': return Math.min(120, Math.max(8, value));
  }
}

// role: modulation matrix — maps audio signals onto numeric layer parameters.
// invariants: evaluateModulation allocates nothing; clamping is target-aware and applied by the
//             engine before the value reaches a renderer.
// owner milestone: M10
