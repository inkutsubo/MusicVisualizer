#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform vec2 u_uvScale;
uniform vec2 u_uvOffset;
uniform float u_opacity;
uniform float u_brightness;
uniform float u_hasImage;
uniform int u_contain;
uniform float u_saturation;
uniform float u_blur;
uniform vec2 u_texel;
uniform vec2 u_drift;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 uv = (vUv - 0.5) * u_uvScale + 0.5 + u_uvOffset;
  uv += u_drift;
  if (u_hasImage > 0.5) {
    float inside = (u_contain == 1 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) ? 0.0 : 1.0;
    vec4 tex;
    if (u_blur > 0.5) {
      vec4 acc = vec4(0.0);
      float total = 0.0;
      for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
          float w = 1.0 / (1.0 + float(x * x + y * y));
          acc += texture(u_tex, clamp(uv + vec2(float(x), float(y)) * u_texel * u_blur * 0.5, 0.0, 1.0)) * w;
          total += w;
        }
      }
      tex = acc / total;
    } else {
      tex = texture(u_tex, clamp(uv, 0.0, 1.0));
    }
    float luma = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 saturated = mix(vec3(luma), tex.rgb, u_saturation);
    fragColor = vec4(saturated * u_brightness, tex.a * u_opacity * inside);
  } else {
    // Deterministic dark gradient fallback so the background is never an empty black hole.
    vec3 base = mix(vec3(0.012, 0.016, 0.045), vec3(0.05, 0.02, 0.09), vUv.y);
    float glow = 0.06 * exp(-6.0 * distance(vUv, vec2(0.5, 0.35)));
    fragColor = vec4(base + vec3(glow), u_opacity);
  }
}

// role: image layer fragment — texture sample with cover/contain fitting and gradient fallback.
// owner milestone: M11
