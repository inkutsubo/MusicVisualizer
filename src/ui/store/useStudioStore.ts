import { create } from 'zustand';
import { FULL_LAYOUT } from '../../types/layers';
import type { LayerConfig, LayerKind } from '../../types/layers';
import type { GlobalSettings, Preset } from '../../types/preset';
import type { ModulationBinding } from '../../core/ModulationMatrix';
import type { Clock } from '../../core/Clock';
import type { RenderEngine } from '../../core/RenderEngine';

/** Mutable transport shared by the rAF loop and the DOM playhead — deliberately not React state. */
export const transport = {
  time: 0,
  seekTo: null as number | null,
  onTick: null as ((time: number) => void) | null,
};

export function seekTransport(time: number): void {
  const t = Math.max(0, time);
  transport.time = t;
  transport.seekTo = t;
}

let activeEngine: RenderEngine | null = null;

export function setActiveEngine(engine: RenderEngine | null): void {
  activeEngine = engine;
}

export function getActiveEngine(): RenderEngine | null {
  return activeEngine;
}

export const studioClock: Clock = {
  time: () => transport.time,
  seek: (s: number) => seekTransport(s),
};

const LRC = [
  '[00:01.00]<00:01.00>Tonight <00:01.70>the <00:02.15>city <00:02.90>breathes <00:03.55>in <00:04.05>neon',
  '[00:05.00]We drift through static and light',
  '[00:09.00]Every pulse a constellation',
  '[00:13.00]Hold the horizon in your hands',
].join('\n');

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  bloomIntensity: 0.55,
  bloomThreshold: 1.15,
  trailDecay: 0.82,
  chromatic: 0.002,
  vignette: 0.35,
  exposure: 1,
};

export interface StudioState {
  layers: LayerConfig[];
  globalSettings: GlobalSettings;
  modulations: ModulationBinding[];
  selectedLayerId: string | null;
  soloLayerId: string | null;
  isPlaying: boolean;
  duration: number;
  activeFixtureId: string;
  lrcText: string;
  lyricOffsetMs: number;

  setPlaying: (playing: boolean) => void;
  setDuration: (dur: number) => void;
  addLayer: (kind: LayerKind) => void;
  removeLayer: (id: string) => void;
  updateLayerConfig: (id: string, updates: Partial<LayerConfig>) => void;
  selectLayer: (id: string | null) => void;
  toggleSolo: (id: string) => void;
  moveLayer: (id: string, direction: -1 | 1) => void;
  setFixture: (id: string) => void;
  setLrcText: (text: string) => void;
  setLyricOffset: (ms: number) => void;
  setGlobalSettings: (settings: GlobalSettings) => void;
  addModulation: (binding: ModulationBinding) => void;
  removeModulation: (index: number) => void;
  applyPreset: (preset: Preset) => void;
}

export function createLayerConfig(kind: LayerKind, id: string): LayerConfig {
  switch (kind) {
    case 'spectrumBars':
      return {
        kind: 'spectrumBars', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
        barCount: 96, rotation: 0, distribution: 'linear', alignment: 'bottomUp',
        gapRatio: 0.18, cornerRadius: 0.35, hollow: false, ledSegments: 0,
        gradientMode: 'frequency', baseColor: '#00d9ff', hotCoreIntensity: 1.5, color: '', color2: '',
      };
    case 'waveform':
      return {
        kind: 'waveform', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
        topology: 'oscilloscopeLine', rotation: 0, thickness: 2.5, gapRatio: 0,
        gradientMode: 'amplitude', baseColor: '#00d9ff',
        glowIntensity: 2.0, polarBaseRadius: 0.6, color: '', color2: '',
      };
    case 'radialSpectrum':
      return {
        kind: 'radialSpectrum', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
        symmetry: 4, barCount: 128, baseRadius: 0.16, barLength: 0.3,
        barWidth: 0.55, showContinuousWave: true, reticleRings: 3,
        reticleTicks: 72, style: 'standard', color: '', color2: '', idleOmega: 0.15, audioOmega: 1.2,
      };
    case 'lyrics':
      return {
        kind: 'lyrics', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
        presetId: 'cinematic-wide', showBackdrop: true,
        backdropOpacity: 0, hdrIntensity: 0, audioReactive: true, lyricsColor: '#ffffff', lyricsGlow: 1.5, showLyricsBackdrop: false,
      };
    case 'image':
      return {
        kind: 'image', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
        imageUrl: '', fit: 'cover', bassPulse: 0.05, brightness: 0.9, bgBlur: 0, bgSaturation: 1,
      };
    case 'particles':
      return {
        kind: 'particles', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
        count: 128, speed: 0.55, lifetime: 2.6, glow: 2.4, noteRatio: 0.5, depth: 'foreground', color: '', motion: 'radial', motionAngle: 30,
      };
    case 'hud':
      return {
        kind: 'hud', id, layout: FULL_LAYOUT, visible: true, opacity: 1,
        title: 'SYNTHESIS HUD', showTimer: true, titleSize: 34, accent: '#67e8f9',
      };
  }
}

export function layerLabel(kind: LayerKind): string {
  switch (kind) {
    case 'spectrumBars': return 'Bars';
    case 'waveform': return 'Waveform';
    case 'radialSpectrum': return 'Radial';
    case 'lyrics': return 'Lyrics';
    case 'image': return 'Image';
    case 'particles': return 'Particles';
    case 'hud': return 'HUD';
  }
}

export function layerName(layer: LayerConfig): string {
  const index = layer.id.split('-').pop() ?? '';
  return `${layerLabel(layer.kind)} ${index}`;
}

let nextLayerId = 1;

export const useStudioStore = create<StudioState>()((set) => ({
  layers: [
    createLayerConfig('spectrumBars', 'bars-1'),
    createLayerConfig('waveform', 'wave-1'),
    createLayerConfig('radialSpectrum', 'radial-1'),
    createLayerConfig('lyrics', 'lyrics-1'),
  ],
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  modulations: [],
  selectedLayerId: 'bars-1',
  soloLayerId: null,
  isPlaying: true,
  duration: 20,
  activeFixtureId: 'musicLike',
  lrcText: LRC,
  lyricOffsetMs: 0,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setDuration: (duration) => set({ duration: Math.max(1, duration) }),

  addLayer: (kind) => set((state) => {
    const id = `${kind}-${nextLayerId++}`;
    return { layers: [...state.layers, createLayerConfig(kind, id)], selectedLayerId: id };
  }),

  removeLayer: (id) => set((state) => ({
    layers: state.layers.filter((l) => l.id !== id),
    selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
    soloLayerId: state.soloLayerId === id ? null : state.soloLayerId,
  })),

  updateLayerConfig: (id, updates) => set((state) => ({
    layers: state.layers.map((l) => (l.id === id ? ({ ...l, ...updates } as LayerConfig) : l)),
  })),

  selectLayer: (selectedLayerId) => set({ selectedLayerId }),

  toggleSolo: (id) => set((state) => ({ soloLayerId: state.soloLayerId === id ? null : id })),

  moveLayer: (id, direction) => set((state) => {
    const index = state.layers.findIndex((l) => l.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.layers.length) return {};
    const layers = state.layers.slice();
    const [item] = layers.splice(index, 1);
    if (item === undefined) return {};
    layers.splice(target, 0, item);
    return { layers };
  }),

  setFixture: (activeFixtureId) => set({ activeFixtureId }),
  setLrcText: (lrcText) => set({ lrcText }),
  setLyricOffset: (lyricOffsetMs) => set({ lyricOffsetMs }),
  setGlobalSettings: (globalSettings) => set({ globalSettings }),
  addModulation: (binding) => set((state) => ({
    modulations: [
      ...state.modulations.filter(
        (b) => !(b.targetLayerId === binding.targetLayerId && b.targetParameter === binding.targetParameter),
      ),
      binding,
    ],
  })),
  removeModulation: (index) => set((state) => ({
    modulations: state.modulations.filter((_, i) => i !== index),
  })),
  applyPreset: (preset) => {
    const layers = preset.layers.map((layer) => ({ ...layer })) as LayerConfig[];
    transport.time = 0;
    transport.seekTo = 0;
    set({
      layers,
      selectedLayerId: layers[0]?.id ?? null,
      soloLayerId: null,
      globalSettings: { ...preset.globalSettings },
      modulations: preset.modulations.map((m) => ({ ...m })) as ModulationBinding[],
      isPlaying: false,
      ...(preset.duration !== undefined ? { duration: preset.duration } : {}),
      ...(preset.lrcText !== undefined ? { lrcText: preset.lrcText } : {}),
    });
  },
}));


// role: studio state — layers, selection, transport and LRC, plus the non-React transport bridge.
// invariants: the playhead time lives in `transport` (mutable) and is never mirrored into React
//             state; store updates happen only on user actions, never inside the rAF loop.
// owner milestone: M6
