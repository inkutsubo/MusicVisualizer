#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
in vec2 vLocalPos;
in float vRadius;
in float vTheta;
in float vValue;
flat in int vInstance;

uniform sampler2D u_palette;
uniform int u_pass;
uniform int u_reticleRings;
uniform int u_reticleTicks;
uniform float u_phase;        // same Φ_audio + idle phase as the geometry pass
uniform float u_retBase;
uniform float u_retOuter;
uniform float u_opacity;
uniform vec3 u_colorOverride;
uniform int u_hasColorOverride;
uniform vec3 u_color2;
uniform int u_hasColor2;

out vec4 outColor;

const float TAU = 6.283185307179586;

vec3 palette(float u) { return texture(u_palette, vec2(clamp(u, 0.0, 1.0), 0.5)).rgb; }

void main() {
  if (u_pass == 1) {
    float r = length(vLocalPos);
    float aa = max(fwidth(r), 0.35);
    float acc = 0.0;

    int rings = clamp(u_reticleRings, 0, 16);
    for (int k = 0; k < 16; k++) {
      if (k >= rings) break;
      float t = rings <= 1 ? 0.0 : float(k) / float(rings - 1);
      float R = mix(u_retBase, u_retOuter, t);
      // Alternating spin direction: even rings CW, odd rings CCW. Dashes make the rotation
      // visible on an otherwise rotationally symmetric circle.
      float dir = mod(float(k), 2.0) < 0.5 ? 1.0 : -1.0;
      float speed = 0.55 + 0.15 * float(k);
      float segs = 18.0 + 8.0 * float(k);
      float a = fract((vTheta - u_phase * dir * speed) * segs / TAU);
      float dash = smoothstep(0.0, 0.045, a) * (1.0 - smoothstep(0.50, 0.545, a));
      float d = abs(r - R);
      float line = 1.0 - smoothstep(0.9 - aa * 0.5, 0.9 + aa * 0.5, d);
      acc += line * dash;
    }

    float ticks = float(max(u_reticleTicks, 0));
    if (ticks > 0.0) {
      float band = step(u_retOuter - 8.0, r) * step(r, u_retOuter);
      float a = fract((vTheta - u_phase * 0.35) * ticks / TAU);
      float arc = min(a, 1.0 - a) * (TAU / ticks) * max(r, 1.0);
      float tick = 1.0 - smoothstep(0.9 - aa * 0.5, 0.9 + aa * 0.5, arc);
      acc += band * tick * 0.8;
    }

    vec3 c = vec3(0.30, 0.78, 1.0) * acc * 0.85;
    outColor = vec4(c, u_opacity);
    return;
  }

  // AA from the quad's own UV: distance to the nearest edge measured in pixels.
  vec2 dmin = min(vUv, 1.0 - vUv);
  vec2 aa = max(fwidth(vUv), vec2(1e-5));
  float edge = min(dmin.x / aa.x, dmin.y / aa.y);
  float mask = smoothstep(0.0, 1.0, edge);
  if (mask <= 0.001) discard;

  if (u_pass == 2) {
    // continuous spectrum loop: cool white-cyan trace
    vec3 base = u_hasColorOverride == 1 ? u_colorOverride : palette(vValue);
    if (u_hasColor2 == 1) base = mix(base, u_color2, clamp(vValue, 0.0, 1.0));
    vec3 c = mix(base, vec3(1.0), 0.35) * (1.1 + 0.6 * vValue);
    outColor = vec4(c, mask * u_opacity);
    return;
  }

  // bars: saturated palette body, white-hot tip
  vec3 base = u_hasColorOverride == 1 ? u_colorOverride : palette(vValue);
  if (u_hasColor2 == 1) base = mix(base, u_color2, clamp(vValue, 0.0, 1.0));
  float tip = smoothstep(0.6, 1.0, vUv.x);
  vec3 col = mix(base * (0.7 + 0.9 * vValue), vec3(1.0) * 2.4, tip);
  outColor = vec4(col, mask * u_opacity);
}

// role: radial fragment — analytic SDF reticle (alternating-spin dashed rings + degree ticks) and
//       HDR bar/trace shading with white-hot tips.
// invariants: reticle AA is fwidth-based in backing pixels so lines stay ~1 px at any DPI; rings
//             take their rotation from u_phase only (Φ_audio + idle), never wall-clock time.
// owner milestone: M3c
