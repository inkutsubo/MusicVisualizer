export type LyricEntrance = 'clip-reveal' | 'tracking-drift' | 'baseline-mask';

export interface TypographyPreset {
  readonly id: string;
  readonly label: string;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontSize: number;        // px at a 1080p reference height
  readonly letterSpacing: number;   // px at 1080p
  readonly lineHeight: number;      // multiplier of fontSize
  readonly entrance: LyricEntrance;
  readonly audioReactive: boolean;
  readonly hdrIntensity: number;    // linear-light emission multiplier
  readonly backdropOpacity: number; // darkness of the legibility band
}

export const TYPOGRAPHY_PRESETS: readonly TypographyPreset[] = [
  {
    id: 'cinematic-wide',
    label: 'Cinematic Wide-Track',
    fontFamily: 'sans-serif',
    fontWeight: 300,
    fontSize: 46,
    letterSpacing: 7,
    lineHeight: 1.28,
    entrance: 'tracking-drift',
    audioReactive: true,
    hdrIntensity: 1.7,
    backdropOpacity: 0.36,
  },
  {
    id: 'minimal-architectural',
    label: 'Minimal Architectural',
    fontFamily: 'sans-serif',
    fontWeight: 300,
    fontSize: 38,
    letterSpacing: 2,
    lineHeight: 1.34,
    entrance: 'baseline-mask',
    audioReactive: false,
    hdrIntensity: 1.15,
    backdropOpacity: 0.24,
  },
  {
    id: 'cyber-glitch',
    label: 'Aggressive Cyber-Glitch',
    fontFamily: 'monospace',
    fontWeight: 700,
    fontSize: 40,
    letterSpacing: 1,
    lineHeight: 1.16,
    entrance: 'clip-reveal',
    audioReactive: true,
    hdrIntensity: 2.5,
    backdropOpacity: 0.46,
  },
  {
    id: 'hud-telemetry',
    label: 'Futuristic HUD Telemetry',
    fontFamily: 'monospace',
    fontWeight: 500,
    fontSize: 34,
    letterSpacing: 4,
    lineHeight: 1.22,
    entrance: 'clip-reveal',
    audioReactive: true,
    hdrIntensity: 2.0,
    backdropOpacity: 0.32,
  },
];

export function getPreset(id: string): TypographyPreset {
  for (let i = 0; i < TYPOGRAPHY_PRESETS.length; i++) {
    const p = TYPOGRAPHY_PRESETS[i]!;
    if (p.id === id) return p;
  }
  return TYPOGRAPHY_PRESETS[0]!;
}

// role: curated typography presets — font, tracking, entrance behaviour, HDR and backdrop tone.
// invariants: system font families only (no network font requests); every preset defines all
//             fields; ids are stable because LyricsConfig references them.
// owner milestone: M4
