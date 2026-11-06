import { useEffect, useRef, useState } from 'react';
import type { RenderEngine } from '../../core/RenderEngine';
import { OfflineVideoExporter } from '../../export/OfflineVideoExporter';
import { checkExportCapabilities } from '../../export/ExportDiagnostics';
import type { ExportCapabilities } from '../../export/ExportDiagnostics';
import { useStudioStore } from '../store/useStudioStore';
import './ExportModal.css';

interface ExportModalProps {
  readonly engine: RenderEngine;
  readonly duration: number;
  readonly onClose: () => void;
}

type Status = 'idle' | 'exporting' | 'done' | 'error' | 'aborted';

export function ExportModal({ engine, duration, onClose }: ExportModalProps) {
  const setPlaying = useStudioStore((s) => s.setPlaying);

  const [caps, setCaps] = useState<ExportCapabilities | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [clipSeconds, setClipSeconds] = useState(2);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkExportCapabilities(1920, 1080, 60).then((result) => {
      if (!cancelled) setCaps(result);
    });
    return () => { cancelled = true; };
  }, []);

  const start = async (): Promise<void> => {
    setPlaying(false);
    setStatus('exporting');
    setProgress(0);
    setMessage('Rendering…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const exporter = new OfflineVideoExporter(engine);
      const blob = await exporter.export({
        width: 1920,
        height: 1080,
        fps: 60,
        duration: Math.min(clipSeconds, duration),
        onProgress: (p) => setProgress(p),
        signal: controller.signal,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `visualizer-${clipSeconds}s.mp4`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setProgress(1);
      setStatus('done');
      setMessage(`Done — ${(blob.size / 1024 / 1024).toFixed(1)} MB, ${audioEnabled ? 'H.264 + silent AAC' : 'video-only MP4'}`);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      setStatus(aborted ? 'aborted' : 'error');
      setMessage(aborted ? 'Export cancelled' : `Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = (): void => {
    abortRef.current?.abort();
  };

  const busy = status === 'exporting';
  const audioEnabled = caps?.audio === true;

  return (
    <div className="export-modal__backdrop" role="dialog" aria-modal="true" aria-label="Export video">
      <div className="export-modal">
        <header className="export-modal__header">
          <h2>Export Video</h2>
          <button type="button" className="export-modal__close" onClick={onClose} disabled={busy}>✕</button>
        </header>

        <div className="export-modal__body">
          <p className="export-modal__spec">1920 × 1080 · 60 fps · H.264 (High) · MP4</p>

          <div className="export-modal__caps">
            <span className={caps?.video ? 'cap cap--ok' : 'cap cap--bad'}>
              {caps === null ? 'Checking encoder…' : caps.video ? `Encoder ready · ${caps.codec}` : caps.reason}
            </span>
            <span className={caps?.audio ? 'cap cap--ok' : 'cap cap--muted'}>
              {caps === null ? 'Checking audio encoder…' : caps.audio ? 'Audio: silent AAC-LC 48 kHz stereo' : 'Audio: unavailable (video-only)'}
            </span>
          </div>

          <label className="export-modal__field">
            Clip length
            <select
              value={clipSeconds}
              onChange={(e) => setClipSeconds(Number(e.target.value))}
              disabled={busy}
            >
              <option value={2}>2 s</option>
              <option value={5}>5 s</option>
              <option value={10}>10 s</option>
              <option value={Math.max(1, Math.round(duration))}>Full ({Math.round(duration)} s)</option>
            </select>
          </label>

          <div className="export-modal__progress">
            <div className="export-modal__bar" style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="export-modal__status">{message !== '' ? message : 'Ready.'}</p>
        </div>

        <footer className="export-modal__footer">
          {busy ? (
            <button type="button" className="btn" onClick={cancel}>Cancel</button>
          ) : (
            <button
              type="button"
              className="btn btn--accent"
              onClick={start}
              disabled={caps === null || caps.video !== true}
            >
              Start Export
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Close</button>
        </footer>
      </div>
    </div>
  );
}

// role: export modal — capability readout, clip length, progress, cancel and auto-download.
// invariants: playback is paused before exporting; the blob is downloaded via an object URL that
//             is revoked after the click; errors and aborts surface as status text.
// owner milestone: M7
