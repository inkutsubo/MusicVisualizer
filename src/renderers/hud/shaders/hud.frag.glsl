#version 300 es
precision highp float;

uniform sampler2D u_tex;
uniform float u_opacity;
uniform float u_intensity;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 tex = texture(u_tex, vUv);
  vec3 rgb = tex.rgb * u_intensity;
  fragColor = vec4(rgb, tex.a * u_opacity);
}

// role: HUD fragment — samples the rasterised title/timer texture.
// owner milestone: M11
