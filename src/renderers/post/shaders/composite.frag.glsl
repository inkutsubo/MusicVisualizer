#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform vec2 u_resolution;
uniform float u_chromatic;
uniform float u_bloomIntensity;
uniform float u_vignette;
uniform float u_exposure;
out vec4 outColor;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 centred = vUv - 0.5;
  vec2 caDir = vec2(centred.x * aspect, centred.y);
  float r2 = dot(caDir, caDir);

  // Radial chromatic aberration: hard-zero inside a small centre disc, growing toward the edges.
  float caRamp = smoothstep(0.05, 0.45, sqrt(r2));
  vec2 offset = centred * u_chromatic * (0.35 + 2.0 * r2) * caRamp;
  vec3 base;
  base.r = texture(u_scene, vUv + offset).r;
  base.g = texture(u_scene, vUv).g;
  base.b = texture(u_scene, vUv - offset).b;

  vec3 bloom = texture(u_bloom, vUv).rgb * u_bloomIntensity;
  vec3 hdr = (base + bloom) * u_exposure;

  // Aspect-corrected vignette (edge order matters: smoothstep is undefined when edge0 > edge1).
  float vig = 1.0 - smoothstep(0.35, 0.85, length(caDir));
  hdr *= mix(1.0, vig, u_vignette);

  vec3 sdr = linearToSrgb(aces(hdr));
  // Static blue-noise-ish dither: no wall-clock term, so scrubbing/replay is deterministic.
  float dither = hash(gl_FragCoord.xy) - 0.5;
  sdr += dither / 255.0;

  outColor = vec4(sdr, 1.0);
}

// role: final composite — chromatic aberration, bloom add, aspect-correct vignette, ACES
//       tone-map, linear→sRGB and deterministic dither to the default framebuffer.
// invariants: dither is static per pixel (no clock term); HDR values stay linear until this
//             pass; the output is the only 8-bit sRGB write in the pipeline.
// owner milestone: M5
