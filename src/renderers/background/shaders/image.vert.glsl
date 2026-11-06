#version 300 es
precision highp float;

uniform vec4 u_layoutRect;
uniform float u_zoom;

out vec2 vUv;

const vec2 CORNERS[6] = vec2[](
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
  vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0)
);

void main() {
  vec2 corner = CORNERS[gl_VertexID];
  vUv = corner;
  vec2 local = (corner - 0.5) * u_zoom + 0.5;
  vec2 finalPos = u_layoutRect.xy + local * u_layoutRect.zw;
  gl_Position = vec4(finalPos * 2.0 - 1.0, 0.0, 1.0);
}

// role: image layer vertex stage — layout-mapped quad with bass-reactive zoom.
// owner milestone: M11
