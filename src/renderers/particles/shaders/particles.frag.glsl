#version 300 es
precision highp float;

uniform sampler2D u_palette;
uniform float u_glow;
uniform float u_opacity;
uniform vec3 u_colorOverride;
uniform int u_hasColorOverride;

in vec2 vUv;
in float vType;
in float vColorT;
in float vAlpha;

out vec4 fragColor;

float sdDiamond(vec2 p, float r) {
  return abs(p.x) + abs(p.y) - r;
}

float sdCircle(vec2 p, vec2 c, float r) {
  return length(p - c) - r;
}

// Procedural eighth note: note head + stem + flag, all in a [-1,1] square.
float sdNote(vec2 p) {
  float head = sdCircle(p, vec2(-0.18, -0.45), 0.28);
  float stem = abs(p.x - 0.12) - 0.055;
  stem = max(stem, -0.55 - p.y);
  stem = max(stem, p.y - 0.62);
  float flag = abs(p.x - 0.3 + p.y * 0.35) - 0.06;
  flag = max(flag, max(-0.55 - p.y, p.y - 0.1));
  float d = min(head, min(stem, flag));
  return d;
}

float daystep(float x) { return x > 0.5 ? 1.0 : 0.0; }

void main() {
  float shape = mix(sdDiamond(vUv, 0.55), sdNote(vUv), daystep(vType));
  float aa = fwidth(shape) + 1e-4;
  float core = 1.0 - smoothstep(-aa, aa, shape);
  float halo = exp(-max(shape, 0.0) * 6.0);
  float emission = u_glow * vAlpha * (core * 1.6 + halo * 0.6);
  vec3 color = u_hasColorOverride == 1
    ? u_colorOverride
    : texture(u_palette, vec2(clamp(vColorT, 0.0, 1.0), 0.5)).rgb;
  fragColor = vec4(color * emission, u_opacity * (core + halo * 0.35));
}

// role: particle fragment — procedural glowing diamond / eighth-note SDF with palette tint.
// owner milestone: M11
