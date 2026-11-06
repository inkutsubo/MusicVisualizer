#version 300 es
precision highp float;

uniform vec4 u_layoutRect;
uniform vec2 u_resolution;

layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_size;
layout(location = 2) in float a_rot;
layout(location = 3) in float a_alpha;
layout(location = 4) in float a_type;
layout(location = 5) in float a_colorT;

out vec2 vUv;
out float vType;
out float vColorT;
out float vAlpha;

const vec2 CORNERS[6] = vec2[](
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
  vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0)
);

void main() {
  vec2 corner = CORNERS[gl_VertexID];
  float c = cos(a_rot);
  float s = sin(a_rot);
  vec2 rotated = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);

  float sizePx = a_size * min(u_resolution.x, u_resolution.y);
  vec2 px = a_pos * u_resolution + rotated * sizePx;
  vec2 uv = px / u_resolution;
  vec2 finalPos = u_layoutRect.xy + uv * u_layoutRect.zw;

  vUv = rotated;
  vType = a_type;
  vColorT = a_colorT;
  vAlpha = a_alpha;
  gl_Position = vec4(finalPos * 2.0 - 1.0, 0.0, 1.0);
}

// role: particle quad emitter — instanced billboards rotated and scaled in pixel space, then
//       mapped through the layer's layout rectangle.
// owner milestone: M11
