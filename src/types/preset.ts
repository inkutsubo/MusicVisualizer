import { z } from 'zod';


const idSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const layoutSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.02).max(1),
  h: z.number().min(0.02).max(1),
});
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const barsSchema = z.object({
  kind: z.literal('spectrumBars'),
  id: idSchema,
  layout: layoutSchema,
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  barCount: z.number().int().min(16).max(512),
  rotation: z.number().min(-360).max(360).default(0),
  distribution: z.enum(['linear', 'centerOut', 'edgeIn', 'dualStereo']),
  alignment: z.enum(['bottomUp', 'topDown', 'symmetricCenter', 'mirroredHorizon']),
  gapRatio: z.number().min(0).max(0.95),
  cornerRadius: z.number().min(0).max(1),
  hollow: z.boolean(),
  ledSegments: z.number().int().min(0).max(64),
  gradientMode: z.enum(['frequency', 'amplitude', 'flat']),
  baseColor: hexColor,
  hotCoreIntensity: z.number().min(0).max(4),
  color: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/).default(''),
  color2: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/).default(''),
});

const waveformSchema = z.object({
  kind: z.literal('waveform'),
  id: idSchema,
  layout: layoutSchema,
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  topology: z.enum(['oscilloscopeLine', 'mirroredEnvelope', 'multiHarmonicRibbon', 'closedPolarWave', 'violentWave']),
  rotation: z.number().min(-360).max(360).default(0),
  thickness: z.number().min(0.25).max(16),
  gapRatio: z.number().min(0).max(0.95),
  gradientMode: z.enum(['frequency', 'amplitude', 'flat']),
  baseColor: hexColor,
  glowIntensity: z.number().min(0).max(4),
  polarBaseRadius: z.number().min(0.05).max(1),
  color: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/).default(''),
  color2: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/).default(''),
});

const radialSchema = z.object({
  kind: z.literal('radialSpectrum'),
  id: idSchema,
  layout: layoutSchema,
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  symmetry: z.number().int().refine((v) => [1, 2, 3, 4, 6, 8].includes(v), 'unsupported symmetry'),
  barCount: z.number().int().min(16).max(512),
  baseRadius: z.number().min(0.02).max(0.9),
  barLength: z.number().min(0.01).max(1),
  barWidth: z.number().min(0.02).max(1),
  showContinuousWave: z.boolean(),
  reticleRings: z.number().int().min(0).max(12),
  reticleTicks: z.number().int().min(0).max(720),
  style: z.enum(['standard', 'ring']).default('standard'),
  color: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/).default(''),
  color2: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/).default(''),
  idleOmega: z.number().min(0).max(4),
  audioOmega: z.number().min(0).max(6),
});

const lyricsSchema = z.object({
  kind: z.literal('lyrics'),
  id: idSchema,
  layout: layoutSchema,
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  presetId: z.string().min(1).max(64),
  showBackdrop: z.boolean(),
  backdropOpacity: z.number().min(0).max(1),
  hdrIntensity: z.number().min(0).max(4),
  audioReactive: z.boolean(),
  lyricsColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffffff'),
  lyricsGlow: z.number().min(0).max(4).default(1.5),
  showLyricsBackdrop: z.boolean().default(false),
});

const imageSchema = z.object({
  kind: z.literal('image'),
  id: idSchema,
  layout: layoutSchema,
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  imageUrl: z.string().max(8_000_000),
  fit: z.enum(['cover', 'contain']),
  bassPulse: z.number().min(0).max(1),
  brightness: z.number().min(0).max(2),
  bgBlur: z.number().min(0).max(12).default(0),
  bgSaturation: z.number().min(0).max(2).default(1),
});

const particlesSchema = z.object({
  kind: z.literal('particles'),
  id: idSchema,
  layout: layoutSchema,
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  count: z.number().int().min(16).max(512),
  speed: z.number().min(0).max(2),
  lifetime: z.number().min(0.4).max(6),
  glow: z.number().min(0).max(4),
  noteRatio: z.number().min(0).max(1),
  depth: z.enum(['foreground', 'background']).default('foreground'),
  motion: z.enum(['radial', 'upward', 'directional']).default('radial'),
  motionAngle: z.number().min(-180).max(180).default(30),
  color: z.string().regex(/^$|^#[0-9a-fA-F]{6}$/).default(''),
});

const hudSchema = z.object({
  kind: z.literal('hud'),
  id: idSchema,
  layout: layoutSchema,
  visible: z.boolean(),
  opacity: z.number().min(0).max(1),
  title: z.string().max(64),
  showTimer: z.boolean(),
  titleSize: z.number().min(8).max(120),
  accent: hexColor,
});

export const LayerConfigSchema = z.discriminatedUnion('kind', [
  barsSchema, waveformSchema, radialSchema, lyricsSchema, imageSchema, particlesSchema, hudSchema,
]);

export const GlobalSettingsSchema = z.object({
  bloomIntensity: z.number().min(0).max(2),
  bloomThreshold: z.number().min(0).max(8),
  trailDecay: z.number().min(0).max(0.96),
  chromatic: z.number().min(0).max(0.05),
  vignette: z.number().min(0).max(1),
  exposure: z.number().min(0.1).max(3),
});

export const ModulationBindingSchema = z.object({
  targetLayerId: z.string().min(1).max(64),
  targetParameter: z.enum(['opacity', 'barCount', 'gapRatio', 'cornerRadius', 'hotCoreIntensity', 'thickness', 'glowIntensity', 'polarBaseRadius', 'baseRadius', 'barLength', 'barWidth', 'symmetry', 'idleOmega', 'audioOmega', 'backdropOpacity', 'hdrIntensity']),
  source: z.enum(['none', 'bass', 'mid', 'high', 'kickImpulse', 'rms']),
  amount: z.number().min(-2).max(2),
});

export const PresetSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1).max(80),
  globalSettings: GlobalSettingsSchema,
  layers: z.array(LayerConfigSchema).min(1).max(8)
    .refine((layers) => new Set(layers.map((l) => l.id)).size === layers.length, 'duplicate layer ids'),
  modulations: z.array(ModulationBindingSchema).max(32).default([]),
  duration: z.number().positive().max(1800).optional(),
  lrcText: z.string().max(4000).optional(),
});

export type Preset = z.infer<typeof PresetSchema>;
export type GlobalSettings = z.infer<typeof GlobalSettingsSchema>;
export type PresetLayerConfig = z.infer<typeof LayerConfigSchema>;

// role: preset schema — strict Zod validation for the complete studio state.
// invariants: schemaVersion is literal 1; layers are a discriminated union so unknown/malformed
//             kinds fail closed; ids unique; numeric ranges mirror renderer clamps.
// owner milestone: M10
