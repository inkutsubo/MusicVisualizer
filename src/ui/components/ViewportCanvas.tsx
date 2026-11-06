import { useEffect, useMemo, useRef } from 'react';
import { RenderEngine } from '../../core/RenderEngine';
import { createFixtureRunner } from '../../audio/__fixtures__';
import { audioEngine } from '../../audio/AudioEngine';
import { SpectrumBarsRenderer } from '../../renderers/bars/SpectrumBarsRenderer';
import { WaveformRenderer } from '../../renderers/waveform/WaveformRenderer';
import { RadialSpectrumRenderer } from '../../renderers/radial/RadialSpectrumRenderer';
import { CinematicLyricRenderer } from '../../renderers/lyrics/CinematicLyricRenderer';
import { ImageRenderer } from '../../renderers/background/ImageRenderer';
import { ParticleRenderer } from '../../renderers/particles/ParticleRenderer';
import { HudTextRenderer } from '../../renderers/hud/HudTextRenderer';
import { getPreset } from '../../presets/typographyPresets';
import { parseLrc } from '../../audio/LrcParser';
import type { FixtureId } from '../../audio/__fixtures__';
import type { LyricDocument } from '../../types/lyrics';
import type { LayerConfig } from '../../types/layers';
import type { ILayerRenderer } from '../../renderers/ILayerRenderer';
import { setActiveEngine, studioClock, transport, useStudioStore } from '../store/useStudioStore';

function createLayer(gl: WebGL2RenderingContext, cfg: LayerConfig, doc: LyricDocument): ILayerRenderer {
  switch (cfg.kind) {
    case 'spectrumBars': return new SpectrumBarsRenderer(gl, cfg);
    case 'waveform': return new WaveformRenderer(gl, cfg);
    case 'radialSpectrum': return new RadialSpectrumRenderer(gl, cfg);
    case 'lyrics': return new CinematicLyricRenderer(gl, cfg, doc, getPreset(cfg.presetId));
    case 'image': return new ImageRenderer(gl, cfg);
    case 'particles': return new ParticleRenderer(gl, cfg);
    case 'hud': return new HudTextRenderer(gl, cfg);
  }
}

export function ViewportCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RenderEngine | null>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);

  const layers = useStudioStore((s) => s.layers);
  const soloLayerId = useStudioStore((s) => s.soloLayerId);
  const lrcText = useStudioStore((s) => s.lrcText);
  const fixtureId = useStudioStore((s) => s.activeFixtureId);

  const doc = useMemo(() => parseLrc(lrcText), [lrcText]);
  const docRef = useRef(doc);
  docRef.current = doc;

  // Engine + rAF loop are created exactly once.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let engine: RenderEngine;
    try {
      engine = new RenderEngine(canvas);
    } catch (e) {
      console.error('WebGL2 init failed:', e);
      return;
    }
    engineRef.current = engine;
    setActiveEngine(engine);

    engine.setLayerFactory((gl, cfg) => createLayer(gl, cfg, docRef.current));
    const initial = useStudioStore.getState().globalSettings;
    engine.setTrailDecay(initial.trailDecay);
    engine.setBloomThreshold(initial.bloomThreshold);
    engine.setBloomIntensity(initial.bloomIntensity);
    engine.setChromatic(initial.chromatic);
    engine.setVignette(initial.vignette);
    engine.setExposure(initial.exposure);
    engine.setContextRestoreHandler(() => {
      const state = useStudioStore.getState();
      engine.syncLayers(state.layers, state.soloLayerId);
    });

    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsMark = last;
    const loop = (): void => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const state = useStudioStore.getState();
      if (state.isPlaying) {
        if (audioEngine.loaded && audioEngine.isPlaying) {
          transport.time = Math.min(audioEngine.getTime(), state.duration);
        } else {
          transport.time += dt;
        }
        if (transport.time >= state.duration) {
          transport.time = state.duration;
          state.setPlaying(false);
          if (audioEngine.loaded) audioEngine.pause();
        }
      }
      if (transport.seekTo !== null) {
        const target = transport.seekTo;
        transport.time = target;
        transport.seekTo = null;
        if (audioEngine.loaded) audioEngine.seek(target);
      }
      engine.render(studioClock);
      const tick = transport.onTick;
      if (tick !== null) tick(transport.time);
      frames++;
      if (now - fpsMark >= 500) {
        if (fpsRef.current !== null) {
          fpsRef.current.textContent = `${Math.round((frames * 1000) / (now - fpsMark))} fps`;
        }
        frames = 0;
        fpsMark = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      engine.dispose();
      engineRef.current = null;
      setActiveEngine(null);
    };
  }, []);

  useEffect(() => {
    engineRef.current?.syncLayers(layers, soloLayerId);
  }, [layers, soloLayerId]);

  useEffect(() => {
    engineRef.current?.syncLyricsDocument(doc);
  }, [doc]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    const runner = createFixtureRunner(fixtureId as FixtureId);
    const apply = (): void => {
      if (audioEngine.loaded) {
        engine.setAudioSource((t) => audioEngine.getFrameAt(t) ?? runner.frameAt(t));
      } else {
        engine.setAudioSource((t) => runner.frameAt(t));
      }
    };
    audioEngine.onLoad = (track) => {
      apply();
      const store = useStudioStore.getState();
      store.setDuration(Math.max(1, track.duration));
      store.setPlaying(false);
      transport.time = 0;
      transport.seekTo = 0;
      audioEngine.seek(0);
    };
    apply();
    return () => {
      audioEngine.onLoad = null;
    };
  }, [fixtureId]);

  const globalSettings = useStudioStore((s) => s.globalSettings);
  const modulations = useStudioStore((s) => s.modulations);
  const lyricOffsetMs = useStudioStore((s) => s.lyricOffsetMs);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) return;
    engine.setTrailDecay(globalSettings.trailDecay);
    engine.setBloomThreshold(globalSettings.bloomThreshold);
    engine.setBloomIntensity(globalSettings.bloomIntensity);
    engine.setChromatic(globalSettings.chromatic);
    engine.setVignette(globalSettings.vignette);
    engine.setExposure(globalSettings.exposure);
  }, [globalSettings]);

  useEffect(() => {
    engineRef.current?.setModulationBindings(modulations);
  }, [modulations]);

  useEffect(() => {
    engineRef.current?.setLyricOffsetMs(lyricOffsetMs);
  }, [lyricOffsetMs]);

  const isPlaying = useStudioStore((s) => s.isPlaying);
  useEffect(() => {
    if (!audioEngine.loaded) return;
    if (isPlaying) {
      audioEngine.play(transport.time);
    } else {
      audioEngine.pause();
    }
  }, [isPlaying]);

  return (
    <div className="viewport">
      <canvas ref={canvasRef} className="viewport__canvas" />
      <div className="viewport__hud">
        <span ref={fpsRef} className="viewport__fps">— fps</span>
        <span className="viewport__tag">WebGL2 · HDR</span>
      </div>
    </div>
  );
}

// role: canvas host — owns the single RenderEngine, the rAF loop and the layer/fixture sync.
// invariants: engine created once; playhead time lives in `transport`, never React state; the loop
//             allocates no objects/arrays and drives the DOM playhead through transport.onTick.
// owner milestone: M6
