import { FULL_LAYOUT } from '../types/layers';
import type { Preset } from '../types/preset';
import type {
  LyricsConfig, RadialSpectrumConfig, SpectrumBarsConfig, WaveformConfig,
} from '../types/layers';

function bars(id: string, overrides: Partial<SpectrumBarsConfig> = {}): SpectrumBarsConfig {
  return {
    kind: 'spectrumBars', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
    barCount: 96, rotation: 0, distribution: 'linear', alignment: 'bottomUp',
    gapRatio: 0.18, cornerRadius: 0.35, hollow: false, ledSegments: 0,
    gradientMode: 'frequency', baseColor: '#00d9ff', hotCoreIntensity: 1.5, color: '', color2: '',
    ...overrides,
  };
}

function wave(id: string, overrides: Partial<WaveformConfig> = {}): WaveformConfig {
  return {
    kind: 'waveform', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
    topology: 'oscilloscopeLine', rotation: 0, thickness: 2.5, gapRatio: 0,
    gradientMode: 'amplitude', baseColor: '#00d9ff', glowIntensity: 2, color: '', color2: '',
    polarBaseRadius: 0.6, ...overrides,
  };
}

function radial(id: string, overrides: Partial<RadialSpectrumConfig> = {}): RadialSpectrumConfig {
  return {
    kind: 'radialSpectrum', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
    symmetry: 4, barCount: 128, baseRadius: 0.16, barLength: 0.3, barWidth: 0.55,
    showContinuousWave: true, reticleRings: 3, reticleTicks: 72, style: 'standard', color: '', color2: '',
    idleOmega: 0.15, audioOmega: 1.2, ...overrides,
  };
}

function lyrics(id: string, overrides: Partial<LyricsConfig> = {}): LyricsConfig {
  return {
    kind: 'lyrics', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
    presetId: 'cinematic-wide', showBackdrop: true, backdropOpacity: 0,
    hdrIntensity: 0, audioReactive: true, lyricsColor: '#ffffff', lyricsGlow: 1.5, showLyricsBackdrop: false, ...overrides,
  };
}

const HUD_LAYOUT = { x: 0, y: 0, w: 1, h: 0.22 };

export const defaultPresets: Preset[] = [
  {
    schemaVersion: 1,
    name: 'Cyber Grid',
    globalSettings: { bloomIntensity: 0.85, bloomThreshold: 1.05, trailDecay: 0.88, chromatic: 0.006, vignette: 0.45, exposure: 1.05 },
    layers: [
      radial('radial-1', { symmetry: 8, barCount: 192, baseRadius: 0.1, barLength: 0.42, barWidth: 0.7, reticleRings: 5, reticleTicks: 144, idleOmega: 0.6, audioOmega: 2.4 }),
      bars('bars-1', { barCount: 160, distribution: 'centerOut', alignment: 'symmetricCenter', gapRatio: 0.1, hotCoreIntensity: 2.4, cornerRadius: 0.1 }),
      lyrics('lyrics-1', { presetId: 'neon-stack', opacity: 0.9 }),
    ],
    modulations: [
      { targetLayerId: 'radial-1', targetParameter: 'baseRadius', source: 'bass', amount: 0.35 },
      { targetLayerId: 'bars-1', targetParameter: 'hotCoreIntensity', source: 'high', amount: 0.6 },
    ],
  },
  {
    schemaVersion: 1,
    name: 'Horizon Sweep',
    globalSettings: { bloomIntensity: 0.4, bloomThreshold: 1.25, trailDecay: 0.8, chromatic: 0.002, vignette: 0.3, exposure: 1 },
    layers: [
      wave('wave-1', { topology: 'mirroredEnvelope', thickness: 3.5, gapRatio: 0.2, glowIntensity: 2.6, opacity: 0.95 }),
      bars('bars-1', { barCount: 64, distribution: 'centerOut', gapRatio: 0.24, cornerRadius: 0.5, hotCoreIntensity: 1 }),
      lyrics('lyrics-1', { presetId: 'cinematic-wide', hdrIntensity: 1.2 }),
    ],
    modulations: [
      { targetLayerId: 'wave-1', targetParameter: 'glowIntensity', source: 'rms', amount: 0.4 },
    ],
  },
  {
    schemaVersion: 1,
    name: 'Oracle Ring',
    globalSettings: { bloomIntensity: 0.3, bloomThreshold: 1.4, trailDecay: 0.9, chromatic: 0, vignette: 0.55, exposure: 0.95 },
    layers: [
      radial('radial-1', { symmetry: 1, barCount: 96, baseRadius: 0.3, barLength: 0.16, barWidth: 0.35, reticleRings: 2, reticleTicks: 360, showContinuousWave: false, idleOmega: 0.05, audioOmega: 0.6 }),
      lyrics('lyrics-1', { presetId: 'oracle-serif', opacity: 1, hdrIntensity: 1.8 }),
    ],
    modulations: [
      { targetLayerId: 'radial-1', targetParameter: 'barLength', source: 'mid', amount: 0.5 },
    ],
  },
  {
    schemaVersion: 1,
    name: 'Signal Bloom',
    globalSettings: { bloomIntensity: 1.35, bloomThreshold: 0.95, trailDecay: 0.93, chromatic: 0.004, vignette: 0.2, exposure: 1.1 },
    layers: [
      bars('bars-1', { barCount: 128, distribution: 'edgeIn', gapRatio: 0.12, hotCoreIntensity: 2 }),
      wave('wave-1', { thickness: 2, glowIntensity: 2.4, opacity: 0.8 }),
      lyrics('lyrics-1', { presetId: 'cinematic-wide', showBackdrop: false, audioReactive: true }),
    ],
    modulations: [
      { targetLayerId: 'bars-1', targetParameter: 'barCount', source: 'kickImpulse', amount: -0.2 },
    ],
  },
  {
    schemaVersion: 1,
    name: 'Synthesis HUD',
    globalSettings: { bloomIntensity: 0.9, bloomThreshold: 1.1, trailDecay: 0.86, chromatic: 0.003, vignette: 0.35, exposure: 1 },
    layers: [
      {
        kind: 'image', id: 'image-1', layout: FULL_LAYOUT, visible: true, opacity: 0.55,
        imageUrl: '', fit: 'cover', bassPulse: 0.05, brightness: 0.75, bgBlur: 0, bgSaturation: 1,
      },
      bars('bars-1', {
        layout: { x: 0.05, y: 0.2, w: 0.2, h: 0.6 },
        barCount: 48, distribution: 'linear', alignment: 'symmetricCenter',
        gapRatio: 0.24, hotCoreIntensity: 2.2,
      }),
      wave('wave-1', { layout: { x: 0.75, y: 0.2, w: 0.2, h: 0.6 }, topology: 'oscilloscopeLine', thickness: 3 }),
      radial('radial-1', {
        layout: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
        symmetry: 1, barCount: 144, baseRadius: 0.18, barLength: 0.3, reticleRings: 4, reticleTicks: 180,
      }),
      {
        kind: 'particles', id: 'particles-1', layout: FULL_LAYOUT, visible: true, opacity: 0.95,
        count: 160, speed: 0.6, lifetime: 2.8, glow: 2.8, noteRatio: 0.6, depth: 'foreground', color: '', motion: 'radial', motionAngle: 30,
      },
      {
        kind: 'hud', id: 'hud-1', layout: HUD_LAYOUT, visible: true, opacity: 1,
        title: 'SYNTHESIS HUD', showTimer: true, titleSize: 40, accent: '#67e8f9',
      },
      lyrics('lyrics-1', { opacity: 0.8, presetId: 'cinematic-wide' }),
    ],
    modulations: [
      { targetLayerId: 'radial-1', targetParameter: 'barLength', source: 'bass', amount: 0.45 },
    ],
  },
  {
    schemaVersion: 1,
    name: 'Empty Canvas',
    globalSettings: { bloomIntensity: 0.15, bloomThreshold: 1.6, trailDecay: 0.6, chromatic: 0, vignette: 0.4, exposure: 0.8 },
    layers: [
      bars('bars-1', { visible: true, opacity: 0.12, barCount: 32, hotCoreIntensity: 0 }),
      lyrics('lyrics-1', { opacity: 0.35, presetId: 'cinematic-wide' }),
    ],
    modulations: [],
  },
];

// role: curated presets — five complete studio compositions used by the preset browser.
// invariants: every preset validates against PresetSchema (verified at load time by the UI).
// owner milestone: M10
