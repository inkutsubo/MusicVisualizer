#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D u_current;
uniform sampler2D u_prev;
uniform float u_decay;
out vec4 outColor;

void main() {
  vec4 curr = texture(u_current, vUv);
  vec4 prev = texture(u_prev, vUv) * u_decay;
  // Energy-conserving merge. Additive feedback would give static content a 1/(1-decay) gain
  // (6.7x at 0.85), which would push every reticle line over the bloom threshold.
  outColor = max(curr, prev);
}

// role: persistence trail merge — max(current, previous * decay) in linear HDR.
// invariants: decay is clamped <= 0.96 in JS before upload; no temporal accumulation of static
//             content; results stay linear-light so bright trails decay to true black in 16F.
// owner milestone: M5
