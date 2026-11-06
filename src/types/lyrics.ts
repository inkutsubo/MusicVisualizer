export interface WordToken {
  readonly text: string;
  readonly startTime: number;  // relative to cue start
  readonly endTime: number;    // relative to cue start
}

export interface LyricCue {
  readonly id: string;
  readonly startTime: number;  // absolute in track
  readonly endTime: number;    // absolute in track
  readonly text: string;
  readonly words: WordToken[];
  readonly alignment: 'left' | 'center' | 'right';
}

export interface GlyphQuad {
  readonly x: number;       // 0..1 normalized screen X
  readonly y: number;       // 0..1 normalized screen Y
  readonly w: number;       // width in normalized units
  readonly h: number;       // height in normalized units
  readonly u0: number;      // atlas UV min X
  readonly v0: number;      // atlas UV min Y
  readonly u1: number;      // atlas UV max X
  readonly v1: number;      // atlas UV max Y
  readonly charIndex: number;
  readonly wordIndex: number;
  readonly lineIndex: number;
  readonly normalizedLineX: number; // 0..1 across the line, for stagger animations
}

export interface LyricDocument {
  readonly cues: LyricCue[];
}

// role: lyric data contract — parsed cues, word timings, and rasterized glyph quads.
// invariants: cue times are absolute track seconds; word times are relative to their cue;
//             GlyphQuad rects and UVs are 0..1 so the GPU needs no per-frame CPU layout.
// owner milestone: M4
