import { useEffect, useState } from 'react';
import { TYPOGRAPHY_PRESETS } from '../../presets/typographyPresets';
import { getActiveEngine, layerName, useStudioStore } from '../store/useStudioStore';
import { AUDIO_SOURCES } from '../../core/ModulationMatrix';
import type { AudioSource, ModulationTarget } from '../../core/ModulationMatrix';
import type {
  BarsAlignment,
  BarsDistribution,
  BarsGradientMode,
  LayerConfig,
  WaveformGradientMode,
  WaveformTopology,
  ImageFit,
} from '../../types/layers';

interface SliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

function Slider({ label, min, max, step, value, onChange }: SliderProps) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="field__range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="field__value">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="select field__select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function ParameterInspector() {
  const layers = useStudioStore((s) => s.layers);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const updateLayerConfig = useStudioStore((s) => s.updateLayerConfig);
  const lrcText = useStudioStore((s) => s.lrcText);
  const setLrcText = useStudioStore((s) => s.setLrcText);
  const lyricOffsetMs = useStudioStore((s) => s.lyricOffsetMs);
  const setLyricOffset = useStudioStore((s) => s.setLyricOffset);

  const layer = layers.find((l) => l.id === selectedLayerId) ?? null;

  const modulations = useStudioStore((s) => s.modulations);
  const addModulation = useStudioStore((s) => s.addModulation);
  const removeModulation = useStudioStore((s) => s.removeModulation);
  const [modTarget, setModTarget] = useState<ModulationTarget>('baseRadius');
  const [modSource, setModSource] = useState<AudioSource>('bass');
  const [modAmount, setModAmount] = useState(0.3);
  const [fontStatus, setFontStatus] = useState('');

  const [draftLrc, setDraftLrc] = useState(lrcText);
  useEffect(() => { setDraftLrc(lrcText); }, [lrcText]);

  if (layer === null) {
    return (
      <aside className="panel panel--inspector">
        <h2 className="panel__title">Inspector</h2>
        <p className="panel__empty">Select a layer to edit its parameters.</p>
      </aside>
    );
  }

  const patch = (updates: Partial<LayerConfig>): void => updateLayerConfig(layer.id, updates);

  const uploadImage = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') patch({ imageUrl: reader.result } as Partial<LayerConfig>);
    };
    reader.readAsDataURL(file);
  };

  const uploadFont = async (file: File): Promise<void> => {
    setFontStatus('Loading font…');
    try {
      const buffer = await file.arrayBuffer();
      const engine = getActiveEngine();
      if (engine === null) throw new Error('renderer not ready');
      const name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '') || 'CustomFont';
      await engine.loadLyricFont(buffer, name);
      setFontStatus(`Font “${name}” loaded`);
    } catch (e) {
      setFontStatus(`Font failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const modTargets: ModulationTarget[] = layer.kind === 'spectrumBars'
    ? ['opacity', 'barCount', 'gapRatio', 'cornerRadius', 'hotCoreIntensity']
    : layer.kind === 'waveform'
      ? ['opacity', 'thickness', 'glowIntensity', 'polarBaseRadius', 'gapRatio']
      : layer.kind === 'radialSpectrum'
        ? ['opacity', 'barCount', 'baseRadius', 'barLength', 'barWidth', 'symmetry', 'idleOmega', 'audioOmega']
        : layer.kind === 'image'
          ? ['opacity', 'bassPulse', 'brightness']
          : layer.kind === 'particles'
            ? ['opacity', 'speed', 'lifetime', 'glow', 'noteRatio']
            : layer.kind === 'hud'
              ? ['opacity', 'titleSize']
              : ['opacity', 'backdropOpacity', 'hdrIntensity'];
  const layerBindings = modulations
    .map((binding, index) => ({ binding, index }))
    .filter((entry) => entry.binding.targetLayerId === layer.id);

  return (
    <aside className="panel panel--inspector">
      <h2 className="panel__title">Inspector</h2>
      <p className="panel__subtitle">{layerName(layer)}</p>

      <div className="field-group">
        <Slider label="Opacity" min={0} max={1} step={0.01} value={layer.opacity} onChange={(v) => patch({ opacity: v })} />
        <Slider label="Layout X" min={0} max={0.95} step={0.01} value={layer.layout.x} onChange={(v) => patch({ layout: { ...layer.layout, x: v } })} />
        <Slider label="Layout Y" min={0} max={0.95} step={0.01} value={layer.layout.y} onChange={(v) => patch({ layout: { ...layer.layout, y: v } })} />
        <Slider label="Layout W" min={0.05} max={1} step={0.01} value={layer.layout.w} onChange={(v) => patch({ layout: { ...layer.layout, w: v } })} />
        <Slider label="Layout H" min={0.05} max={1} step={0.01} value={layer.layout.h} onChange={(v) => patch({ layout: { ...layer.layout, h: v } })} />
        <label className="field field--check">
          <span className="field__label">Visible</span>
          <input type="checkbox" checked={layer.visible} onChange={(e) => patch({ visible: e.target.checked })} />
        </label>
      </div>

      {layer.kind === 'spectrumBars' && (
        <div className="field-group">
          <Slider label="Bar count" min={16} max={512} step={1} value={layer.barCount} onChange={(v) => patch({ barCount: Math.round(v) })} />
          <Slider label="Gap ratio" min={0} max={0.9} step={0.01} value={layer.gapRatio} onChange={(v) => patch({ gapRatio: v })} />
          <Slider label="Corner radius" min={0} max={1} step={0.01} value={layer.cornerRadius} onChange={(v) => patch({ cornerRadius: v })} />
          <Slider label="LED segments" min={0} max={16} step={1} value={layer.ledSegments} onChange={(v) => patch({ ledSegments: Math.round(v) })} />
          <Slider label="Hot core" min={0} max={4} step={0.05} value={layer.hotCoreIntensity} onChange={(v) => patch({ hotCoreIntensity: v })} />
          <Slider label="Rotation" min={-180} max={180} step={1} value={layer.rotation} onChange={(v) => patch({ rotation: v })} />
          <label className="field">
            <span className="field__label">Color override</span>
            <input type="color" value={layer.color !== '' ? layer.color : '#00d9ff'} onChange={(e) => patch({ color: e.target.value })} />
            <button type="button" className="btn" onClick={() => patch({ color: '' })}>Palette</button>
          </label>
          <label className="field">
            <span className="field__label">Gradient to</span>
            <input type="color" value={layer.color2 !== '' ? layer.color2 : '#b400ff'} onChange={(e) => patch({ color2: e.target.value })} />
            <button type="button" className="btn" onClick={() => patch({ color2: '' })}>Off</button>
          </label>
          <Select<BarsAlignment>
            label="Alignment"
            value={layer.alignment}
            options={[
              { value: 'bottomUp', label: 'Bottom up' },
              { value: 'topDown', label: 'Top down' },
              { value: 'symmetricCenter', label: 'Symmetric' },
              { value: 'mirroredHorizon', label: 'Mirrored' },
            ]}
            onChange={(v) => patch({ alignment: v })}
          />
          <Select<BarsDistribution>
            label="Distribution"
            value={layer.distribution}
            options={[
              { value: 'linear', label: 'Linear' },
              { value: 'centerOut', label: 'Center out' },
              { value: 'edgeIn', label: 'Edge in' },
              { value: 'dualStereo', label: 'Dual stereo' },
            ]}
            onChange={(v) => patch({ distribution: v })}
          />
          <Select<BarsGradientMode>
            label="Gradient"
            value={layer.gradientMode}
            options={[
              { value: 'frequency', label: 'Frequency' },
              { value: 'amplitude', label: 'Amplitude' },
              { value: 'flat', label: 'Flat' },
            ]}
            onChange={(v) => patch({ gradientMode: v })}
          />
        </div>
      )}

      {layer.kind === 'waveform' && (
        <div className="field-group">
          <Slider label="Thickness" min={0.5} max={12} step={0.1} value={layer.thickness} onChange={(v) => patch({ thickness: v })} />
          <Slider label="Glow" min={0} max={4} step={0.05} value={layer.glowIntensity} onChange={(v) => patch({ glowIntensity: v })} />
          <Slider label="Polar radius" min={0.1} max={0.95} step={0.01} value={layer.polarBaseRadius} onChange={(v) => patch({ polarBaseRadius: v })} />
          <Slider label="Rotation" min={-180} max={180} step={1} value={layer.rotation} onChange={(v) => patch({ rotation: v })} />
          <label className="field">
            <span className="field__label">Color override</span>
            <input type="color" value={layer.color !== '' ? layer.color : '#00d9ff'} onChange={(e) => patch({ color: e.target.value })} />
            <button type="button" className="btn" onClick={() => patch({ color: '' })}>Palette</button>
          </label>
          <label className="field">
            <span className="field__label">Gradient to</span>
            <input type="color" value={layer.color2 !== '' ? layer.color2 : '#b400ff'} onChange={(e) => patch({ color2: e.target.value })} />
            <button type="button" className="btn" onClick={() => patch({ color2: '' })}>Off</button>
          </label>
          <Select<WaveformTopology>
            label="Topology"
            value={layer.topology}
            options={[
              { value: 'oscilloscopeLine', label: 'Oscilloscope' },
              { value: 'mirroredEnvelope', label: 'Mirrored envelope' },
              { value: 'multiHarmonicRibbon', label: 'Multi-harmonic' },
              { value: 'closedPolarWave', label: 'Closed polar' },
              { value: 'violentWave', label: 'Violent wave' },
            ]}
            onChange={(v) => patch({ topology: v })}
          />
          <Select<WaveformGradientMode>
            label="Gradient"
            value={layer.gradientMode}
            options={[
              { value: 'frequency', label: 'Frequency' },
              { value: 'amplitude', label: 'Amplitude' },
              { value: 'flat', label: 'Flat' },
            ]}
            onChange={(v) => patch({ gradientMode: v })}
          />
        </div>
      )}

      {layer.kind === 'radialSpectrum' && (
        <div className="field-group">
          <label className="field">
            <span className="field__label">Style</span>
            <select className="select field__select" value={layer.style} onChange={(e) => patch({ style: e.target.value as 'standard' | 'ring' })}>
              <option value="standard">Standard</option>
              <option value="ring">Ring halo</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Color override</span>
            <input type="color" value={layer.color !== '' ? layer.color : '#00d9ff'} onChange={(e) => patch({ color: e.target.value })} />
            <button type="button" className="btn" onClick={() => patch({ color: '' })}>Palette</button>
          </label>
          <label className="field">
            <span className="field__label">Gradient to</span>
            <input type="color" value={layer.color2 !== '' ? layer.color2 : '#b400ff'} onChange={(e) => patch({ color2: e.target.value })} />
            <button type="button" className="btn" onClick={() => patch({ color2: '' })}>Off</button>
          </label>
          <Slider label="Symmetry" min={1} max={8} step={1} value={layer.symmetry} onChange={(v) => patch({ symmetry: Math.round(v) })} />
          <Slider label="Bar count" min={16} max={512} step={1} value={layer.barCount} onChange={(v) => patch({ barCount: Math.round(v) })} />
          <Slider label="Base radius" min={0.05} max={0.45} step={0.01} value={layer.baseRadius} onChange={(v) => patch({ baseRadius: v })} />
          <Slider label="Bar length" min={0.05} max={0.5} step={0.01} value={layer.barLength} onChange={(v) => patch({ barLength: v })} />
          <Slider label="Reticle rings" min={0} max={8} step={1} value={layer.reticleRings} onChange={(v) => patch({ reticleRings: Math.round(v) })} />
          <Slider label="Reticle ticks" min={0} max={360} step={1} value={layer.reticleTicks} onChange={(v) => patch({ reticleTicks: Math.round(v) })} />
          <label className="field field--check">
            <span className="field__label">Continuous wave</span>
            <input type="checkbox" checked={layer.showContinuousWave} onChange={(e) => patch({ showContinuousWave: e.target.checked })} />
          </label>
        </div>
      )}

      {layer.kind === 'lyrics' && (
        <div className="field-group">
          <Select<string>
            label="Preset"
            value={layer.presetId}
            options={TYPOGRAPHY_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            onChange={(v) => patch({ presetId: v })}
          />
          <label className="field field--stack">
            <span className="field__label">Custom font (.ttf / .woff2)</span>
            <input
              type="file"
              accept=".ttf,.woff2,font/ttf,font/woff2"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file !== undefined) void uploadFont(file);
                e.target.value = '';
              }}
            />
          </label>
          {fontStatus !== '' && <p className="field__note">{fontStatus}</p>}
          <Slider label="HDR intensity" min={0} max={4} step={0.05} value={layer.hdrIntensity} onChange={(v) => patch({ hdrIntensity: v })} />
          <Slider label="Lyric offset (ms)" min={-2000} max={2000} step={10} value={lyricOffsetMs} onChange={setLyricOffset} />
          <label className="field">
            <span className="field__label">Text color</span>
            <input type="color" value={layer.lyricsColor} onChange={(e) => patch({ lyricsColor: e.target.value })} />
          </label>
          <Slider label="Text glow" min={0} max={4} step={0.05} value={layer.lyricsGlow} onChange={(v) => patch({ lyricsGlow: v })} />
          <label className="field field--check">
            <span className="field__label">Backdrop / shadow</span>
            <input type="checkbox" checked={layer.showLyricsBackdrop} onChange={(e) => patch({ showLyricsBackdrop: e.target.checked })} />
          </label>
          <Slider label="Backdrop" min={0} max={1} step={0.01} value={layer.backdropOpacity} onChange={(v) => patch({ backdropOpacity: v })} />
          <label className="field field--check">
            <span className="field__label">Backdrop on</span>
            <input type="checkbox" checked={layer.showBackdrop} onChange={(e) => patch({ showBackdrop: e.target.checked })} />
          </label>
          <label className="field field--check">
            <span className="field__label">Audio reactive</span>
            <input type="checkbox" checked={layer.audioReactive} onChange={(e) => patch({ audioReactive: e.target.checked })} />
          </label>
          <label className="field field--stack">
            <span className="field__label">LRC</span>
            <textarea
              className="textarea"
              rows={6}
              value={draftLrc}
              onChange={(e) => setDraftLrc(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn--accent" onClick={() => setLrcText(draftLrc)}>Apply lyrics</button>
        </div>
      )}

      {layer.kind === 'image' && (
        <div className="field-group">
          <label className="field field--stack">
            <span className="field__label">Image file</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file !== undefined) uploadImage(file);
                e.target.value = '';
              }}
            />
          </label>
          <Select<ImageFit>
            label="Fit"
            value={layer.fit}
            options={[
              { value: 'cover', label: 'Cover' },
              { value: 'contain', label: 'Contain' },
            ]}
            onChange={(v) => patch({ fit: v })}
          />
          <Slider label="Bass pulse" min={0} max={0.3} step={0.01} value={layer.bassPulse} onChange={(v) => patch({ bassPulse: v })} />
          <Slider label="Brightness" min={0} max={2} step={0.05} value={layer.brightness} onChange={(v) => patch({ brightness: v })} />
          <Slider label="Blur" min={0} max={12} step={0.5} value={layer.bgBlur} onChange={(v) => patch({ bgBlur: v })} />
          <Slider label="Saturation" min={0} max={2} step={0.05} value={layer.bgSaturation} onChange={(v) => patch({ bgSaturation: v })} />
        </div>
      )}

      {layer.kind === 'particles' && (
        <div className="field-group">
          <Slider label="Count" min={16} max={512} step={1} value={layer.count} onChange={(v) => patch({ count: Math.round(v) })} />
          <Slider label="Speed" min={0} max={2} step={0.05} value={layer.speed} onChange={(v) => patch({ speed: v })} />
          <Slider label="Lifetime" min={0.4} max={6} step={0.1} value={layer.lifetime} onChange={(v) => patch({ lifetime: v })} />
          <Slider label="Glow" min={0} max={4} step={0.05} value={layer.glow} onChange={(v) => patch({ glow: v })} />
          <Slider label="Note ratio" min={0} max={1} step={0.05} value={layer.noteRatio} onChange={(v) => patch({ noteRatio: v })} />
          <label className="field">
            <span className="field__label">Depth</span>
            <select className="select field__select" value={layer.depth} onChange={(e) => patch({ depth: e.target.value as 'foreground' | 'background' })}>
              <option value="foreground">Foreground</option>
              <option value="background">Background</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Motion</span>
            <select className="select field__select" value={layer.motion} onChange={(e) => patch({ motion: e.target.value as 'radial' | 'upward' | 'directional' })}>
              <option value="radial">Radial burst</option>
              <option value="upward">Upward embers</option>
              <option value="directional">Directional</option>
            </select>
          </label>
          <Slider label="Motion angle" min={-180} max={180} step={1} value={layer.motionAngle} onChange={(v) => patch({ motionAngle: v })} />
          <label className="field">
            <span className="field__label">Color override</span>
            <input type="color" value={layer.color !== '' ? layer.color : '#67e8f9'} onChange={(e) => patch({ color: e.target.value })} />
            <button type="button" className="btn" onClick={() => patch({ color: '' })}>Palette</button>
          </label>
        </div>
      )}

      {layer.kind === 'hud' && (
        <div className="field-group">
          <label className="field">
            <span className="field__label">Title</span>
            <input
              className="preset-name"
              value={layer.title}
              onChange={(e) => patch({ title: e.target.value.slice(0, 64) })}
            />
          </label>
          <label className="field field--check">
            <span className="field__label">Show timer</span>
            <input type="checkbox" checked={layer.showTimer} onChange={(e) => patch({ showTimer: e.target.checked })} />
          </label>
          <Slider label="Title size" min={8} max={120} step={1} value={layer.titleSize} onChange={(v) => patch({ titleSize: Math.round(v) })} />
        </div>
      )}

      <div className="field-group">
        <h3 className="panel__subtitle">Modulation</h3>
        <Select<ModulationTarget>
          label="Target"
          value={modTargets.includes(modTarget) ? modTarget : modTargets[0]!}
          options={modTargets.map((t) => ({ value: t, label: t }))}
          onChange={(v) => setModTarget(v)}
        />
        <Select<AudioSource>
          label="Source"
          value={modSource}
          options={AUDIO_SOURCES.map((s) => ({ value: s, label: s }))}
          onChange={(v) => setModSource(v)}
        />
        <Slider label="Amount" min={-1} max={1} step={0.05} value={modAmount} onChange={setModAmount} />
        <button
          type="button"
          className="btn"
          onClick={() => addModulation({
            targetLayerId: layer.id,
            targetParameter: modTargets.includes(modTarget) ? modTarget : modTargets[0]!,
            source: modSource,
            amount: modAmount,
          })}
        >
          Bind modulation
        </button>
        {layerBindings.length > 0 && (
          <div className="binding-list">
            {layerBindings.map(({ binding, index }) => (
              <div className="binding-row" key={`${binding.targetParameter}-${binding.source}`}>
                <span className="binding-row__text">
                  {binding.source} → {binding.targetParameter} ({binding.amount >= 0 ? '+' : ''}{Math.round(binding.amount * 100)}%)
                </span>
                <button type="button" className="btn binding-row__remove" onClick={() => removeModulation(index)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// role: parameter inspector — context-sensitive controls for the selected layer, plus the LRC editor.
// invariants: every edit flows through updateLayerConfig; the textarea keeps a local draft so
//             parsing/rasterizing only happens when the user applies the lyrics.
// owner milestone: M6
