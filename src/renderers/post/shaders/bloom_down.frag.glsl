#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
uniform sampler2D u_src;
uniform vec2 u_texel;      // 1 / source size
uniform float u_threshold; // 0 = plain downsample
out vec4 outColor;

vec3 thresholded(vec3 c) {
  if (u_threshold <= 0.0) return c;
  // Hard HDR cut: a soft knee would leak sub-threshold background (the reticle) into the bloom.
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float contrib = max(lum - u_threshold, 0.0) / max(lum, 1e-5);
  return c * clamp(contrib, 0.0, 1.0);
}

void main() {
  vec2 t = u_texel;
  // 13-tap kernel: centre (0.25), 4 axis taps (0.125 each), 8 diagonal taps (0.03125 each).
  vec3 c = thresholded(texture(u_src, vUv).rgb) * 0.25;
  c += thresholded(texture(u_src, vUv + vec2(-t.x, 0.0)).rgb) * 0.125;
  c += thresholded(texture(u_src, vUv + vec2(t.x, 0.0)).rgb) * 0.125;
  c += thresholded(texture(u_src, vUv + vec2(0.0, -t.y)).rgb) * 0.125;
  c += thresholded(texture(u_src, vUv + vec2(0.0, t.y)).rgb) * 0.125;
  c += thresholded(texture(u_src, vUv + vec2(-t.x, -t.y)).rgb) * 0.03125;
  c += thresholded(texture(u_src, vUv + vec2(t.x, -t.y)).rgb) * 0.03125;
  c += thresholded(texture(u_src, vUv + vec2(-t.x, t.y)).rgb) * 0.03125;
  c += thresholded(texture(u_src, vUv + vec2(t.x, t.y)).rgb) * 0.03125;
  outColor = vec4(c, 1.0);
}

// role: dual-Kawase 13-tap downsample with optional HDR threshold (first tap only).
// invariants: normalized weights sum to 1; thresholded taps keep sub-1.1 content out of bloom;
//             one draw per mip level, no per-frame JS work.
// owner milestone: M5
