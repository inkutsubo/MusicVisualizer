import { useState } from 'react';
import { PresetSchema } from '../../types/preset';
import { defaultPresets } from '../../presets/defaultPresets';
import { useStudioStore } from '../store/useStudioStore';
import './ExportModal.css';

interface PresetBrowserModalProps {
  readonly onClose: () => void;
}

function buildCurrentPreset(name: string): unknown {
  const state = useStudioStore.getState();
  return {
    schemaVersion: 1,
    name,
    globalSettings: state.globalSettings,
    layers: state.layers,
    modulations: state.modulations,
    duration: state.duration,
    lrcText: state.lrcText,
  };
}

export function PresetBrowserModal({ onClose }: PresetBrowserModalProps) {
  const applyPreset = useStudioStore((s) => s.applyPreset);
  const [name, setName] = useState('My Preset');
  const [status, setStatus] = useState('Presets are validated with Zod before loading.');

  const save = (): void => {
    const parsed = PresetSchema.safeParse(buildCurrentPreset(name));
    if (!parsed.success) {
      setStatus(`Cannot save: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      return;
    }
    const blob = new Blob([JSON.stringify(parsed.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'preset'}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    setStatus(`Saved “${name}”.`);
  };

  const importText = (text: string): void => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      setStatus(`Import failed: invalid JSON (${e instanceof Error ? e.message : String(e)})`);
      return;
    }
    const parsed = PresetSchema.safeParse(json);
    if (!parsed.success) {
      setStatus(`Import rejected: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      return;
    }
    applyPreset(parsed.data);
    setStatus(`Loaded “${parsed.data.name}” — ${parsed.data.layers.length} layers.`);
  };

  return (
    <div className="export-modal__backdrop" role="dialog" aria-modal="true" aria-label="Presets">
      <div className="export-modal preset-modal">
        <header className="export-modal__header">
          <h2>Presets</h2>
          <button type="button" className="export-modal__close" onClick={onClose}>✕</button>
        </header>

        <div className="export-modal__body">
          <div className="preset-list">
            {defaultPresets.map((preset) => (
              <button
                type="button"
                key={preset.name}
                className="preset-list__item"
                onClick={() => {
                  applyPreset(preset);
                  setStatus(`Loaded “${preset.name}” — ${preset.layers.length} layers.`);
                }}
              >
                <span className="preset-list__name">{preset.name}</span>
                <span className="preset-list__meta">{preset.layers.length} layers</span>
              </button>
            ))}
          </div>

          <label className="export-modal__field">
            Preset name
            <input className="preset-name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="preset-actions">
            <button type="button" className="btn btn--accent" onClick={save}>Export JSON</button>
            <label className="btn preset-import">
              Import JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file !== undefined) {
                    void file.text().then(importText);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <p className="export-modal__status">{status}</p>
        </div>

        <footer className="export-modal__footer">
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}

// role: preset browser — curated presets plus validated JSON export/import of the studio state.
// invariants: every import is parsed by PresetSchema before touching the store; failures surface
//             as text and never throw into React.
// owner milestone: M10
