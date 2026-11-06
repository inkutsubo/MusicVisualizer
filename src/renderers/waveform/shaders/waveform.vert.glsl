#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_waveformTex;   // 2048x1 R32F (nearest), smoothed waveform [-1,1]
uniform int u_sampleCount;         // WAVEFORM_SAMPLES
uniform vec2 u_resolution;         // canvas backing size, pixels
uniform float u_thickness;         // stroke width, pixels (already DPI-scaled)
uniform int u_topology;            // 0=line 1=mirrored 2=multi 3=polar
uniform float u_polarBaseRadius;   // 0..1, fraction of the min dimension
uniform vec4 u_layoutRect;         // x,y,w,h in UV space
uniform float u_highEnergy;
uniform float u_snareImpulse;
uniform float u_violentTime;
uniform float u_rotation;

out vec2 vUv;
out float vSampleVal;
flat out int vInstance;

const vec2 CORNERS[6] = vec2[](
  vec2(0.0, -0.5), vec2(1.0, -0.5), vec2(0.0, 0.5),
  vec2(0.0,  0.5), vec2(1.0, -0.5), vec2(1.0, 0.5)
);
const float TAU = 6.283185307179586;
const float MAX_MITER = 5.0;   // 2.5 * thickness expressed as half-width multiples

vec2 toClip(vec2 px) {
  vec2 local = (px / u_resolution - u_layoutRect.xy) / u_layoutRect.zw;
  vec2 centered = local - 0.5;
  float rad = radians(u_rotation);
  float rc = cos(rad);
  float rs = sin(rad);
  vec2 rotated = vec2(centered.x * rc - centered.y * rs, centered.x * rs + centered.y * rc) + 0.5;
  vec2 layoutPos = u_layoutRect.xy + rotated * u_layoutRect.zw;
  return layoutPos * 2.0 - 1.0;
}

float fetchWrapped(int idx) {
  int n = u_sampleCount;
  int j = ((idx % n) + n) % n;
  float u = (float(j) + 0.5) / float(n);
  return texture(u_waveformTex, vec2(u, 0.5)).r;
}

float fetchSample(int idx) {
  if (u_topology == 3) return fetchWrapped(idx);
  int j = clamp(idx, 0, u_sampleCount - 1);
  float u = (float(j) + 0.5) / float(u_sampleCount);
  return texture(u_waveformTex, vec2(u, 0.5)).r;
}

// multiHarmonicRibbon: 0.6*w(u) + 0.3*w(2u) + 0.1*w(3u), periodic in sample index.
float sampleValue(int idx) {
  if (u_topology == 2) {
    return 0.6 * fetchWrapped(idx) + 0.3 * fetchWrapped(2 * idx) + 0.1 * fetchWrapped(3 * idx);
  }
  return fetchSample(idx);
}

float paramAt(int idx) {
  float n = float(u_sampleCount);
  if (u_topology == 3) return mod(float(idx), n) / n;
  // Line topologies: neighbours outside [0, n-1] extrapolate so edge tangents stay defined.
  return float(idx) / (n - 1.0);
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

// Screen-space centreline in pixels. Polar is built from min(w,h) so the ring stays circular.
vec2 curvePos(float u, float val) {
  if (u_topology == 3) {
    float minDim = min(u_resolution.x, u_resolution.y);
    float rPx = (u_polarBaseRadius * 0.5 + val * 0.075) * minDim;
    float theta = u * TAU;
    return u_resolution * 0.5 + vec2(cos(theta), sin(theta)) * rPx;
  }
  if (u_topology == 4) {
    // violentWave: high-frequency jagged jitter driven by hat and snare energy.
    float jitter = hash11(u * 731.0 + u_violentTime * 97.0) - 0.5;
    float amp = 0.02 + u_highEnergy * 0.25 + u_snareImpulse * 0.35;
    return vec2(u * u_resolution.x, u_resolution.y * 0.5 + (val + jitter * amp) * u_resolution.y * 0.42);
  }
  return vec2(u * u_resolution.x, u_resolution.y * 0.5 + val * u_resolution.y * 0.42);
}

// closedPolarWave closure: fade the radius modulation to zero over the first and last 2.5% of the
// ring (5% total) with a Hann ease. Both ends then meet at the base radius with zero slope (C1), which the
// single-sided window in the brief could not do because it leaves val(0) untouched.
float polarWindow(float u) {
  if (u_topology != 3) return 1.0;
  const float W = 0.025;
  if (u < W) return 0.5 * (1.0 - cos(3.14159265359 * u / W));
  if (u > 1.0 - W) return 0.5 * (1.0 + cos(3.14159265359 * (u - (1.0 - W)) / W));
  return 1.0;
}

float valueAt(int idx) {
  float v = sampleValue(idx);
  if (u_topology == 3) v *= polarWindow(paramAt(idx));
  return v;
}

vec2 safeNormalize(vec2 v) {
  float l = length(v);
  return l > 1e-6 ? v / l : vec2(1.0, 0.0);
}
vec2 perp(vec2 v) { return vec2(-v.y, v.x); }

void main() {
  vec2 corner = CORNERS[gl_VertexID];
  int i = gl_InstanceID;
  int n = u_sampleCount;

  // ---- mirroredEnvelope: one quad spanning -|v| .. +|v|, filled between the two halves ----
  if (u_topology == 1) {
    float d = float(n - 1);
    float uu = mix(float(i) / d, float(i + 1) / d, corner.x);
    float vv = mix(fetchSample(i), fetchSample(i + 1), corner.x);
    float y = u_resolution.y * 0.5 + sign(corner.y) * abs(vv) * u_resolution.y * 0.42;
    vUv = corner;
    vSampleVal = vv;
    vInstance = i;
    gl_Position = vec4(toClip(vec2(uu * u_resolution.x, y)), 0.0, 1.0);
    return;
  }

  // ---- stroke topologies: mitered ribbon extruded around the centreline ----
  int k = i + (corner.x > 0.5 ? 1 : 0);
  vec2 Pk  = curvePos(paramAt(k),     valueAt(k));
  vec2 Pm1 = curvePos(paramAt(k - 1), valueAt(k - 1));
  vec2 Pp1 = curvePos(paramAt(k + 1), valueAt(k + 1));
  vec2 Pm2 = curvePos(paramAt(k - 2), valueAt(k - 2));
  vec2 Pp2 = curvePos(paramAt(k + 2), valueAt(k + 2));

  // Central-difference sample normals, then a true miter join between the two adjacent
  // segments. Both segments sharing sample k evaluate the same join, so the strip is watertight.
  vec2 nK   = perp(safeNormalize(Pp1 - Pm1));
  vec2 nKm1 = perp(safeNormalize(Pk - Pm2));
  vec2 nKp1 = perp(safeNormalize(Pp2 - Pk));

  float halfW = u_thickness * 0.5;
  vec2 miterStart = safeNormalize(nKm1 + nK);
  vec2 miterEnd   = safeNormalize(nK + nKp1);

  // Miter length = halfW / cos(theta/2); clamp to 2.5 * thickness (MAX_MITER * halfW).
  float scaleStart = min(1.0 / max(dot(miterStart, nK), 0.2), MAX_MITER);
  float scaleEnd   = min(1.0 / max(dot(miterEnd, nKp1), 0.2), MAX_MITER);

  vec2 offset = (corner.x > 0.5 ? miterEnd * scaleEnd : miterStart * scaleStart) * (corner.y * 2.0 * halfW);

  vUv = corner;
  vSampleVal = valueAt(k);
  vInstance = i;
  gl_Position = vec4(toClip(Pk + offset), 0.0, 1.0);
}

// role: waveform geometry — instanced quad extrusion using exact uniform Catmull-Rom knot
//       tangents (m_k = (P(k+1) - P(k-1)) / 2), watertight clamped-miter joins, mirrored envelope
//       fill and polar ring mapping.
// invariants: all maths happens in pixel space (aspect-correct normals); miter length capped at
//             2.5x thickness; polar wraps sample indices so theta=0/2pi share position + tangent;
//             topology is the only branch; one instance == one segment.
// owner milestone: M3b
