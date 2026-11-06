#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
flat in int vInstance;
in float vHeight;
in vec2 vHalfSizePx;
in float vUpness;

uniform sampler2D u_palette;      // 256x1 RGBA16F linear RGB
uniform int u_barCount;
uniform int u_gradient;           // 0=frequency 1=amplitude 2=flat
uniform int u_ledSegments;        // 0 = off
uniform float u_cornerRadius;     // 0..1 of the smaller bar dimension
uniform int u_hollow;             // 0/1
uniform float u_hotCoreIntensity; // 0..4
uniform float u_opacity;          // 0..1
uniform vec3 u_colorOverride;
uniform int u_hasColorOverride;
uniform vec3 u_color2;
uniform int u_hasColor2;

out vec4 outColor;

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 palette(float u) { return texture(u_palette, vec2(clamp(u, 0.0, 1.0), 0.5)).rgb; }

void main() {
  // Work in pixels about the bar centre: a rounded corner must stay circular regardless of
  // how narrow or tall the bar is (the reference's normalised-space SDF distorted it).
  vec2 halfSz = max(vHalfSizePx, vec2(0.5));
  vec2 p = (vUv - 0.5) * 2.0 * halfSz;
  float r = clamp(u_cornerRadius, 0.0, 1.0) * min(halfSz.x, halfSz.y);

  float d = sdRoundedBox(p, halfSz, r);
  float aa = max(fwidth(d), 0.0001);
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask <= 0.001) discard;

  if (u_ledSegments > 0) {
    float segs = float(u_ledSegments);
    float sy = vUv.y * segs;
    float f = fract(sy);
    float w = max(fwidth(sy), 0.0001);
    float edge = 0.12;   // fraction of each segment that is dark gap
    float segMask = smoothstep(0.0, edge + w, f) * (1.0 - smoothstep(1.0 - edge - w, 1.0, f));
    mask *= segMask;
  }

  if (u_hollow == 1) {
    vec2 bIn = halfSz * 0.84;
    float rIn = min(r * 0.7, min(bIn.x, bIn.y));
    float dIn = sdRoundedBox(p, bIn, rIn);
    float aaIn = max(fwidth(dIn), 0.0001);
    mask *= smoothstep(0.0, aaIn, dIn);
  }

  float u;
  if (u_gradient == 0) u = float(vInstance) / float(u_barCount);
  else if (u_gradient == 1) u = vHeight;
  else u = 0.5;

  vec3 color = u_hasColorOverride == 1 ? u_colorOverride : palette(u);
  if (u_hasColor2 == 1) color = mix(color, u_color2, clamp(vHeight, 0.0, 1.0));

  // Hot white spine at the growing tip only: height-driven heat would whiten the whole bar.
  float heat = smoothstep(0.55, 1.0, vUpness);
  float spine = clamp(u_hotCoreIntensity * heat, 0.0, 1.0);
  vec3 emissive = u_hasColorOverride == 1
    ? mix(color, vec3(1.0), spine * 0.45)
    : mix(color, vec3(1.0), spine);

  // HDR emission: dim base, hot peak. ACES in the final pass turns the tip white.
  float emit = 0.6 + vHeight * 2.5;

  outColor = vec4(emissive * emit, mask * u_opacity);
}

// role: bar fragment — pixel-space rounded-box SDF, LED segmentation, hollow cutout, palette
//       lookup, tip-local hot spine and HDR emission for the ACES final pass.
// invariants: emission is linear-light (no gamma here); the spine is driven by vUpness, never by
//             whole-bar height, so bases stay saturated; alpha is the AA mask times opacity.
// owner milestone: M3a
