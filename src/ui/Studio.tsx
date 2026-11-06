import { useRef, useState } from 'react';
import './ui.css';
import { ViewportCanvas } from './components/ViewportCanvas';
import { TransportTimeline } from './components/TransportTimeline';
import { LayerStackPanel } from './components/LayerStackPanel';
import { ParameterInspector } from './components/ParameterInspector';
import { ExportModal } from './components/ExportModal';
import { PresetBrowserModal } from './components/PresetBrowserModal';
import { getActiveEngine, useStudioStore } from './store/useStudioStore';
import { audioEngine } from '../audio/AudioEngine';

export function Studio() {
  const duration = useStudioStore((s) => s.duration);
  const [exportOpen, setExportOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [audioName, setAudioName] = useState('');
  const [loadStatus, setLoadStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const engine = exportOpen ? getActiveEngine() : null;

  const loadFile = async (file: File): Promise<void> => {
    setLoadStatus('Decoding…');
    audioEngine.onProgress = (p) => {
      setLoadStatus(p.stage === 'decode' ? 'Decoding…' : `Analysing ${Math.round(p.progress * 100)}%`);
    };
    try {
      const track = await audioEngine.loadFile(file);
      setAudioName(track.name);
      setLoadStatus(`${track.frames.toLocaleString()} checkpoints · ${track.duration.toFixed(1)} s`);
    } catch (e) {
      setLoadStatus(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      audioEngine.onProgress = null;
    }
  };

  return (
    <div className="studio-shell">
      <header className="studio-header">
        <span className="studio-header__title">Visualizer TWO</span>
        <div className="studio-header__right">
          {audioName !== '' && <span className="studio-header__track" title={audioName}>{audioName}</span>}
          {loadStatus !== '' && <span className="studio-header__status">{loadStatus}</span>}
          <label className="btn studio-header__file">
            Load audio
            <input
              ref={fileRef}
              type="file"
              accept=".mp3,.wav,.ogg,audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file !== undefined) void loadFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="btn" onClick={() => setPresetOpen(true)}>Presets</button>
          <button
            type="button"
            className="btn btn--accent"
            onClick={() => { if (getActiveEngine() !== null) setExportOpen(true); }}
          >
            Export
          </button>
        </div>
      </header>

      <LayerStackPanel />
      <main className="studio-viewport">
        <ViewportCanvas />
      </main>
      <ParameterInspector />
      <TransportTimeline />

      {presetOpen && <PresetBrowserModal onClose={() => setPresetOpen(false)} />}

      {exportOpen && engine !== null && (
        <ExportModal engine={engine} duration={duration} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}

// role: studio shell — CSS-grid layout, audio loading and the Export entry point.
// invariants: no per-frame state; decoding/DSP happen in AudioEngine (worker), never in React.
// owner milestone: M9
