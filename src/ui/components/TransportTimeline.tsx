import { useEffect, useMemo, useRef } from 'react';
import { parseLrc } from '../../audio/LrcParser';
import { seekTransport, transport, useStudioStore } from '../store/useStudioStore';

export function TransportTimeline() {
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const setPlaying = useStudioStore((s) => s.setPlaying);
  const duration = useStudioStore((s) => s.duration);
  const lrcText = useStudioStore((s) => s.lrcText);

  const rangeRef = useRef<HTMLInputElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const cues = useMemo(() => parseLrc(lrcText).cues, [lrcText]);

  // rAF tick: transform only (no React state, no layout reads).
  useEffect(() => {
    transport.onTick = (t: number): void => {
      const d = durationRef.current > 0 ? durationRef.current : 1;
      const frac = Math.min(1, Math.max(0, t / d));
      if (playheadRef.current !== null) playheadRef.current.style.transform = `scaleX(${frac})`;
    };
    return () => { transport.onTick = null; };
  }, []);

  // Low-rate DOM sync for the native slider + label (kept out of the rAF loop).
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = durationRef.current;
      if (rangeRef.current !== null && document.activeElement !== rangeRef.current) {
        rangeRef.current.value = String(Math.min(d, transport.time));
      }
      if (timeRef.current !== null) timeRef.current.textContent = `${transport.time.toFixed(1)} / ${d.toFixed(0)} s`;
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <footer className="transport">
      <div className="transport__buttons">
        <button type="button" className={isPlaying ? 'btn btn--active' : 'btn'} onClick={() => setPlaying(true)}>Play</button>
        <button type="button" className={!isPlaying ? 'btn btn--active' : 'btn'} onClick={() => setPlaying(false)}>Pause</button>
        <button type="button" className="btn" onClick={() => seekTransport(0)}>⟲</button>
      </div>

      <div className="transport__track">
        <div className="transport__markers">
          {cues.map((cue) => (
            <button
              key={cue.id}
              type="button"
              className="transport__marker"
              style={{ left: `${Math.min(100, (cue.startTime / duration) * 100)}%` }}
              title={cue.text}
              onClick={() => seekTransport(cue.startTime)}
            />
          ))}
        </div>
        <div ref={playheadRef} className="transport__playhead" />
        <input
          ref={rangeRef}
          className="transport__range"
          type="range"
          min={0}
          max={duration}
          step={0.01}
          defaultValue={0}
          onChange={(e) => seekTransport(Number(e.target.value))}
        />
      </div>

      <span ref={timeRef} className="transport__time">0.0 / 20 s</span>
    </footer>
  );
}

// role: transport bar — play/pause, native range scrubbing, LRC cue markers and the DOM playhead.
// invariants: the playhead is moved with ref.style.transform from the rAF tick; neither the range
//             value nor the label is React state, so playback never re-renders this component.
// owner milestone: M6
