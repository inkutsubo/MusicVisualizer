import type { AudioFramePacket } from '../types/audio';
import type { ColorPalette } from '../core/ColorPalette';
import type { LayerConfig, LayoutRect } from '../types/layers';

export interface LayerRenderContext {
  readonly gl: WebGL2RenderingContext;
  readonly time: number;           // seconds, absolute (from Clock)
  readonly dt: number;             // seconds since last frame
  readonly width: number;          // canvas backing width (pixels)
  readonly height: number;         // canvas backing height (pixels)
  readonly audio: AudioFramePacket;
  readonly palette: ColorPalette;
  readonly layout: LayoutRect;    // normalised UV rectangle this layer draws into
  readonly lyricOffsetMs: number; // global lyric timing offset
}

/**
 * Contract: render() draws into the currently-bound framebuffer, using the
 * currently-set viewport. It must not bind/unbind framebuffers or re-set
 * viewport. It must not allocate per call (no `new`, no array literals, no
 * object literals, no template strings inside render()).
 */
export interface ILayerRenderer {
  readonly kind: string;
  render(ctx: LayerRenderContext): void;
  /** Optional live config update; the engine calls this when a store snapshot changes. */
  updateConfig?(config: LayerConfig): void;
  dispose(): void;
}

// role: layer contract shared by every renderer family and the engine's dispatch loop.
// invariants: ctx is a single engine-owned mutable object handed to every layer each frame;
//             render() must not touch FBOs/viewport and must not allocate.
// owner milestone: M3a
