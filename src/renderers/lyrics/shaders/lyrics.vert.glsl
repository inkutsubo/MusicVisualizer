#version 300 es
precision highp float;
precision highp int;

layout(location = 0) in vec4 a_posRect;   // x, y, w, h (normalized screen, y down)
layout(location = 1) in vec4 a_uvRect;    // u0, v0, u1, v1
layout(location = 2) in vec4 a_meta;      // charIndex, wordIndex, lineIndex, normalizedLineX

uniform float u_t;            // absolute track time
uniform float u_start;        // active cue start
uniform float u_end;          // active cue end
uniform float u_enter;        // entrance duration, seconds
uniform float u_exit;         // exit duration, seconds
uniform int u_animMode;       // 0 clip-reveal, 1 tracking-drift, 2 baseline-mask
uniform float u_charCount;
uniform float u_drift;        // tracking-drift spread, normalized screen units
uniform float u_pulse;        // smoothed audio transient 0..1
uniform int u_pass;           // 0 glyphs, 1 backdrop band
uniform float u_bandCenter;   // normalized screen Y
uniform float u_bandHalf;     // normalized half-height
uniform int u_shadow;         // 1 = dark dilated shadow pass
uniform vec2 u_shadowOffset;  // normalized screen offset for the shadow
uniform vec4 u_layoutRect;   // x,y,w,h in UV space

out vec2 vUv;
out vec2 vLocalPos;
out float vProgress;
out float vAlpha;

vec2 layoutMap(vec2 uv) {
  vec2 center = u_layoutRect.xy + u_layoutRect.zw * 0.5;
  float s = max(u_layoutRect.w, 0.05);
  return center + (uv - 0.5) * s;
}

const vec2 CORNERS[6] = vec2[](
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
  vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0)
);

void main() {
  vec2 corner = CORNERS[gl_VertexID];

  if (u_pass == 1) {
    float y = u_bandCenter + (corner.y - 0.5) * 2.0 * u_bandHalf;
    vUv = vec2(0.0);
    vLocalPos = corner;
    vProgress = 1.0;
    vAlpha = 1.0;
    vec2 bp = layoutMap(vec2(corner.x, y));
    gl_Position = vec4(bp.x * 2.0 - 1.0, 1.0 - bp.y * 2.0, 0.0, 1.0);
    return;
  }

  float pIn = smoothstep(0.0, 1.0, clamp((u_t - u_start) / max(u_enter, 1e-4), 0.0, 1.0));
  float pOut = smoothstep(0.0, 1.0, clamp((u_end - u_t) / max(u_exit, 1e-4), 0.0, 1.0));

  float charFrac = clamp(a_meta.x / max(u_charCount, 1.0), 0.0, 1.0);
  // Stagger: later characters start later within the entrance window.
  float local = smoothstep(0.0, 1.0, clamp((pIn - charFrac * 0.45) / 0.55, 0.0, 1.0));

  vec2 pos = a_posRect.xy + corner * a_posRect.zw;

  if (u_animMode == 1) {
    pos.x += (charFrac - 0.5) * (1.0 - pIn) * u_drift;
  } else if (u_animMode == 2) {
    pos.y += (1.0 - pIn) * 0.03;
  }

  vec2 center = a_posRect.xy + a_posRect.zw * 0.5;
  float audioScale = 1.0 + u_pulse * 0.02;
  pos = center + (pos - center) * mix(0.86, 1.0, pIn) * mix(0.94, 1.0, pOut) * audioScale;
  pos.y -= (1.0 - pOut) * 0.02;

  if (u_shadow == 1) pos += u_shadowOffset;

  vUv = mix(a_uvRect.xy, a_uvRect.zw, corner);
  vLocalPos = corner;
  vProgress = local;
  vAlpha = pOut * (u_animMode == 2 ? pIn : 1.0);

  vec2 mapped = layoutMap(pos);
  gl_Position = vec4(mapped.x * 2.0 - 1.0, 1.0 - mapped.y * 2.0, 0.0, 1.0);
}

// role: lyric geometry — instanced glyph quads from normalized rects plus staged enter/exit
//       transforms; also emits the legibility backdrop band.
// invariants: animation depends only on (u_t - cue times), so scrubbing is deterministic; no
//             CPU-side layout in the shader path; one instance == one character.
// owner milestone: M4
