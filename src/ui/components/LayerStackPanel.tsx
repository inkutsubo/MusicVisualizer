import { useState } from 'react';
import type { LayerKind } from '../../types/layers';
import { layerName, useStudioStore } from '../store/useStudioStore';

const KIND_OPTIONS: readonly { kind: LayerKind; label: string }[] = [
  { kind: 'spectrumBars', label: 'Spectrum Bars' },
  { kind: 'waveform', label: 'Waveform' },
  { kind: 'radialSpectrum', label: 'Radial Spectrum' },
  { kind: 'lyrics', label: 'Lyrics' },
  { kind: 'image', label: 'Image' },
  { kind: 'particles', label: 'Particles' },
  { kind: 'hud', label: 'HUD' },
];

export function LayerStackPanel() {
  const layers = useStudioStore((s) => s.layers);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const soloLayerId = useStudioStore((s) => s.soloLayerId);
  const selectLayer = useStudioStore((s) => s.selectLayer);
  const updateLayerConfig = useStudioStore((s) => s.updateLayerConfig);
  const removeLayer = useStudioStore((s) => s.removeLayer);
  const moveLayer = useStudioStore((s) => s.moveLayer);
  const toggleSolo = useStudioStore((s) => s.toggleSolo);
  const addLayer = useStudioStore((s) => s.addLayer);

  const [newKind, setNewKind] = useState<LayerKind>('spectrumBars');

  return (
    <aside className="panel panel--layers">
      <h2 className="panel__title">Layers</h2>

      <div className="layer-list">
        {layers.map((layer, index) => (
          <div
            key={layer.id}
            className={layer.id === selectedLayerId ? 'layer-row layer-row--selected' : 'layer-row'}
            onClick={() => selectLayer(layer.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') selectLayer(layer.id); }}
          >
            <input
              type="checkbox"
              className="layer-row__vis"
              checked={layer.visible}
              title="Visible"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => updateLayerConfig(layer.id, { visible: e.target.checked })}
            />
            <span className="layer-row__name">{layerName(layer)}</span>
            <div className="layer-row__actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={soloLayerId === layer.id ? 'mini mini--active' : 'mini'}
                title="Solo"
                onClick={() => toggleSolo(layer.id)}
              >S</button>
              <button type="button" className="mini" title="Move up" disabled={index === 0} onClick={() => moveLayer(layer.id, -1)}>▲</button>
              <button type="button" className="mini" title="Move down" disabled={index === layers.length - 1} onClick={() => moveLayer(layer.id, 1)}>▼</button>
              <button type="button" className="mini mini--danger" title="Remove" onClick={() => removeLayer(layer.id)}>✕</button>
            </div>
          </div>
        ))}
        {layers.length === 0 && <p className="panel__empty">No layers. Add one below.</p>}
      </div>

      <div className="add-row">
        <select className="select" value={newKind} onChange={(e) => setNewKind(e.target.value as LayerKind)}>
          {KIND_OPTIONS.map((o) => <option key={o.kind} value={o.kind}>{o.label}</option>)}
        </select>
        <button type="button" className="btn btn--accent" onClick={() => addLayer(newKind)}>Add</button>
      </div>
    </aside>
  );
}

// role: layer stack — add, select, reorder, toggle visibility, solo and remove layers.
// invariants: all mutations go through the store; the engine reconciles on the next effect pass.
// owner milestone: M6
