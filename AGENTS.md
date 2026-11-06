# Project: Visualizer TWO

Client-side-only procedural audio visualizer with deterministic video export.
Stack: Vite 6 + TypeScript 5 strict + React 19 + Zustand + Zod + mp4-muxer.
WebGL2 + WebCodecs. Package manager: **npm**.

## Non-negotiables (violation = rejection)
- WebGL2 only. No WebGL1 fallback path in code.
- RGBA16F HDR pipeline. ACES tone-map + linear→sRGB at final pass.
  Fallback to R11F_G11F_B10F ONLY if EXT_color_buffer_float is absent.
- No `AudioContext.createAnalyser()` in the render path. Audio features come
  exclusively from the DSP worker's `AudioFramePacket`.
- No `MediaRecorder` / `captureStream()`. Video export is WebCodecs only.
- No `u_time * speed` shader animation. Time-driven motion flows through
  `Φ_audio` (audio-integrated phase) or explicit idle-omega constants.
- Exponential smoothing uses `α = 1 - exp(-Δt/τ)`. Never `val *= 0.9`.
- Trail / feedback decay uniforms clamped ≤ 0.96 before upload.
- Zero per-frame JS heap allocations in `RenderEngine.render()`.
  Pre-allocate Float32Arrays, VAOs, FBOs, uniform locations at init.
- No Canvas2D for visualizer layers. Canvas2D / OffscreenCanvas is allowed
  ONLY inside `LyricAtlasBuilder` for glyph rasterization.
- No Three.js / PixiJS / d3 / any scene-graph or rendering library.
- Plain CSS modules. No Tailwind (architect overrode the plan's Tailwind note).

## Directory map
src/core/gl/*      — GLContext, ShaderProgram, FramebufferPool, DataTexture
src/core/*         — RenderEngine, Clock, ModulationMatrix, ColorPalette
src/audio/*        — AudioEngine, dsp.worker, fft, FeatureTimelineCache, LrcParser
src/renderers/*/*  — per-layer renderer families + shaders
src/presets/*      — curated presets, typography presets
src/export/*       — WebCodecs + mp4-muxer exporter
src/ui/*           — Zustand store, React components
src/types/*        — TS types (audio, layers, lyrics, modulation, preset)

## Milestone gate
Each milestone ends with an M<N>-REPORT + architect sign-off.
Do not start milestone N+1 until sign-off. Do not add files outside the
milestone's stated scope without asking.
