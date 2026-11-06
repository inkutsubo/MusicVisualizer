export type LayerKind = 'spectrumBars' | 'waveform' | 'radialSpectrum' | 'lyrics' | 'image' | 'particles' | 'hud';
export type BarsDistribution = 'linear' | 'centerOut' | 'edgeIn' | 'dualStereo';
export type BarsAlignment = 'bottomUp' | 'topDown' | 'symmetricCenter' | 'mirroredHorizon';
export type BarsGradientMode = 'frequency' | 'amplitude' | 'flat';
export type ImageFit = 'cover' | 'contain';

/** Normalised layout rectangle in UV space: (0,0) top-left, (1,1) bottom-right. */
export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const FULL_LAYOUT: LayoutRect = { x: 0, y: 0, w: 1, h: 1 };

export interface SpectrumBarsConfig {
  readonly kind: 'spectrumBars';
  readonly id: string;
  readonly layout: LayoutRect;
  readonly visible: boolean;
  readonly opacity: number;              // 0..1
  readonly barCount: number;             // 16..512
  readonly rotation: number;             // degrees, about the layout centre
  readonly distribution: BarsDistribution;
  readonly alignment: BarsAlignment;
  readonly gapRatio: number;             // 0..1 (fraction of cell that is gap)
  readonly cornerRadius: number;         // 0..1 (of min bar dimension)
  readonly hollow: boolean;
  readonly ledSegments: number;          // 0 = off, else vertical segments
  readonly gradientMode: BarsGradientMode;
  readonly baseColor: string;            // hex (used by palette when gradientMode='flat')
  readonly hotCoreIntensity: number;     // 0..4 (white spine tint)
  readonly color: string;               // '' = palette, else #rrggbb override
  readonly color2: string;              // '' = no gradient, else #rrggbb
}

export type WaveformTopology =
  | 'oscilloscopeLine'
  | 'mirroredEnvelope'
  | 'multiHarmonicRibbon'
  | 'closedPolarWave'
  | 'violentWave';

export type WaveformGradientMode = 'frequency' | 'amplitude' | 'flat';

export interface WaveformConfig {
  readonly kind: 'waveform';
  readonly id: string;
  readonly layout: LayoutRect;
  readonly visible: boolean;
  readonly opacity: number;
  readonly topology: WaveformTopology;
  readonly rotation: number;
  
  readonly thickness: number;        // pixels (at 1080p reference)
  readonly gapRatio: number;         // for mirroredEnvelope (0..1)
  readonly gradientMode: WaveformGradientMode;
  readonly baseColor: string;
  readonly glowIntensity: number;    // 0..4 HDR emission multiplier
  readonly polarBaseRadius: number;  // 0..1 (fraction of min dimension) for closedPolarWave
  readonly color: string;            // '' = palette, else #rrggbb override
  readonly color2: string;           // '' = no gradient, else #rrggbb
}

export interface RadialSpectrumConfig {
  readonly kind: 'radialSpectrum';
  readonly id: string;
  readonly layout: LayoutRect;
  readonly visible: boolean;
  readonly opacity: number;
  readonly symmetry: number;         // 1, 2, 3, 4, 6, 8 (K-fold rotational symmetry)
  readonly barCount: number;         // 16..512 (total bars around the circle)
  readonly baseRadius: number;       // 0..1 (fraction of min dimension)
  readonly barLength: number;        // 0..1 (max extension from baseRadius)
  readonly barWidth: number;         // 0..1 (fraction of angular slice)
  readonly showContinuousWave: boolean; // renders a spline loop alongside the bars
  readonly reticleRings: number;     // Number of concentric SDF rings (0 = off)
  readonly reticleTicks: number;     // Number of degree ticks around the ring (e.g., 360)
  readonly style: 'standard' | 'ring';
  readonly color: string;
  readonly color2: string;
  readonly idleOmega: number;        // Base rotation speed (rad/s) during silence
  readonly audioOmega: number;       // Extra rotation speed multiplier driven by bass
}

export interface LyricsConfig {
  readonly kind: 'lyrics';
  readonly id: string;
  readonly layout: LayoutRect;
  readonly visible: boolean;
  readonly opacity: number;
  readonly presetId: string;
  readonly showBackdrop: boolean;
  readonly backdropOpacity: number;  // 0 = use the preset value
  readonly hdrIntensity: number;     // 0 = use the preset value
  readonly audioReactive: boolean;
  readonly lyricsColor: string;      // text tint (hex)
  readonly lyricsGlow: number;       // 0..4 emission multiplier
  readonly showLyricsBackdrop: boolean; // false = no dark band/shadow behind text
}

export interface ImageLayerConfig {
  readonly kind: 'image';
  readonly id: string;
  readonly layout: LayoutRect;
  readonly visible: boolean;
  readonly opacity: number;
  readonly imageUrl: string;         // object/data URL; empty = dark gradient fallback
  readonly fit: ImageFit;
  readonly bassPulse: number;        // 0..1 zoom pulse amount
  readonly brightness: number;       // 0..2
  readonly bgBlur: number;           // 0..12 texel blur radius
  readonly bgSaturation: number;     // 0..2
}

export interface ParticleConfig {
  readonly kind: 'particles';
  readonly id: string;
  readonly layout: LayoutRect;
  readonly visible: boolean;
  readonly opacity: number;
  readonly count: number;            // max live particles 16..512
  readonly speed: number;            // 0..2
  readonly lifetime: number;         // seconds 0.4..6
  readonly glow: number;             // 0..4 HDR emission
  readonly noteRatio: number;        // 0 = diamonds, 1 = eighth notes
  readonly depth: 'foreground' | 'background';
  readonly color: string;            // '' = palette, else #rrggbb override
  readonly motion: 'radial' | 'upward' | 'directional';
  readonly motionAngle: number;      // degrees, used by directional motion
}

export interface HudConfig {
  readonly kind: 'hud';
  readonly id: string;
  readonly layout: LayoutRect;
  readonly visible: boolean;
  readonly opacity: number;
  readonly title: string;
  readonly showTimer: boolean;
  readonly titleSize: number;        // pixels at 1080p
  readonly accent: string;           // hex
}

export type LayerConfig =
  | SpectrumBarsConfig
  | WaveformConfig
  | RadialSpectrumConfig
  | LyricsConfig
  | ImageLayerConfig
  | ParticleConfig
  | HudConfig;

// role: layer configuration contract; spectrumBars, waveform, radialSpectrum, lyrics, image,
//       particles and hud, each with a normalised layout rectangle.
// invariants: config is readonly and replaced wholesale via updateConfig(); layout lives in UV
//             space and defaults to the full screen; barCount 16..512.
// owner milestone: M11
