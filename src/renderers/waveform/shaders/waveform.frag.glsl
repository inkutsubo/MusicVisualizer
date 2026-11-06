#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;            // corner: x in [0,1] along the segment, y in [-0.5,0.5] across the stroke
in float vSampleVal;
flat in int vInstance;

uniform sampler2D u_palette;      // 256x1 RGBA16F linear RGB
uniform int u_topology;
uniform int u_gradient;           // 0=frequency 1=amplitude 2=flat
uniform int u_sampleCount;
uniform float u_glowIntensity;    // 0..4
uniform float u_gapRatio;         // mirroredEnvelope centre gap, 0..1
uniform float u_opacity;
uniform vec3 u_colorOverride;
uniform int u_hasColorOverride;
uniform vec3 u_color2;
uniform int u_hasColor2;

out vec4 outColor;

void main() {
  float u;
  if (u_gradient == 0) u = float(vInstance) / float(u_sampleCount);
  else if (u_gradient == 1) u = abs(vSampleVal);
  else u = 0.5;

  vec3 base = u_hasColorOverride == 1
    ? u_colorOverride
    : texture(u_palette, vec2(clamp(u, 0.0, 1.0), 0.5)).rgb;
  if (u_hasColor2 == 1) base = mix(base, u_color2, clamp(abs(vSampleVal), 0.0, 1.0));
  float d = abs(vUv.y) * 2.0;   // 0 at the stroke centreline, 1 at the AA edge
  float aa = max(fwidth(d), 0.0001);

  if (u_topology == 1) {
    // Solid envelope fill between +v and -v: no centre seam by construction. gapRatio > 0
    // intentionally opens a symmetric centre gap (0 = solid, which is the acceptance case).
    float mask = 1.0;
    if (u_gapRatio > 0.0) mask = smoothstep(u_gapRatio - aa, u_gapRatio + aa, d);
    if (mask <= 0.001) discard;
    vec3 c = base * (0.6 + 0.45 * u_glowIntensity);
    outColor = vec4(c, mask * u_opacity);
    return;
  }

  float mask = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  if (mask <= 0.001) discard;

  // HDR stroke: white-hot core, saturated palette edges.
  float core = 1.0 - smoothstep(0.12, 0.85, d);
  vec3 edgeColor = base * (0.9 + 0.18 * u_glowIntensity);
  vec3 coreColor = u_hasColorOverride == 1
    ? u_colorOverride * (2.0 * u_glowIntensity)
    : vec3(1.0) * (1.6 * u_glowIntensity);
  vec3 c = mix(edgeColor, coreColor, core);

  outColor = vec4(c, mask * u_opacity);
}

// role: waveform fragment — fwidth AA stroke edges, white-hot core / saturated edge falloff,
//       palette lookup by frequency or amplitude, solid mirrored envelope fill.
// invariants: emission is linear-light (ACES lives in RenderEngine); alpha carries AA and opacity;
//             no per-fragment branching on topology beyond fill vs stroke.
// owner milestone: M3b
