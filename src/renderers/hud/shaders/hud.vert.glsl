#version 300 es
precision highp float;

uniform vec4 u_layoutRect;
out vec2 vUv;

const vec2 CORNERS[6] = vec2[](
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
  vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0)
);

void main() {
  vec2 corner = CORNERS[gl_VertexID];
  vUv = corner;
  vec2 finalPos = u_layoutRect.xy + corner * u_layoutRect.zw;
  gl_Position = vec4(finalPos * 2.0 - 1.0, 0.0, 1.0);
}

// role: HUD quad — layout-mapped textured rectangle.
// owner milestone: M11
