#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D u_src;   // smaller (already upsampled from deeper) mip
uniform vec2 u_texel;      // 1 / source size
out vec4 outColor;

void main() {
  vec2 t = u_texel;
  // 9-tap tent: centre 0.25, axis 0.125, corners 0.0625.
  vec3 c = texture(u_src, vUv).rgb * 0.25;
  c += texture(u_src, vUv + vec2(-t.x, 0.0)).rgb * 0.125;
  c += texture(u_src, vUv + vec2(t.x, 0.0)).rgb * 0.125;
  c += texture(u_src, vUv + vec2(0.0, -t.y)).rgb * 0.125;
  c += texture(u_src, vUv + vec2(0.0, t.y)).rgb * 0.125;
  c += texture(u_src, vUv + vec2(-t.x, -t.y)).rgb * 0.0625;
  c += texture(u_src, vUv + vec2(t.x, -t.y)).rgb * 0.0625;
  c += texture(u_src, vUv + vec2(-t.x, t.y)).rgb * 0.0625;
  c += texture(u_src, vUv + vec2(t.x, t.y)).rgb * 0.0625;
  outColor = vec4(c, 1.0);
}

// role: dual-Kawase 9-tap upsample — blended additively into the next larger mip.
// invariants: tent weights sum to 1; destination mip already holds its downsample, so the
//             ONE/ONE blend produces the composite mip without a second target.
// owner milestone: M5
