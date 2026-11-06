#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_spectrumTex;
uniform int u_spectrumBands;
uniform vec2 u_resolution;
uniform int u_symmetry;
uniform int u_barCount;
uniform float u_baseRadius;   // pixels
uniform float u_barLength;    // pixels
uniform float u_barWidth;     // 0..1 fraction of the angular slice
uniform float u_phase;        // Φ_audio + integrated idle omega (radians)
uniform float u_bass;         // 0..1 kick/bass metric
uniform int u_pass;           // 0=bars 1=reticle 2=continuous wave
uniform float u_retBase;      // reticle inner radius, pixels
uniform float u_retOuter;     // reticle outer radius, pixels
uniform vec2 u_clipExt;       // reticle bounding box half-extent in clip space
uniform vec4 u_layoutRect;    // x,y,w,h in UV space
uniform int u_style;         // 0=standard 1=ring
uniform int u_ringCount;

out vec2 vUv;
out vec2 vLocalPos;
out float vRadius;
out float vTheta;
out float vValue;
flat out int vInstance;

const vec2 CORNERS[6] = vec2[](
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
  vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0)
);
const float TAU = 6.283185307179586;
const float BASS_EXPAND_PX = 12.0;

// K-fold mirrored mapping: phi in [0,1) inside the sector, 0 at the fold line, 1 at sector
// centre. u_freq = |2*phi - 1| therefore puts highs on the fold lines (both neighbours agree)
// and bass at the sector centre, so sectors meet with no frequency jump.
float spectrumAt(int slot) {
  int n = u_barCount;
  int s = ((slot % n) + n) % n;
  float k = float(u_symmetry);
  float phi = fract((float(s) + 0.5) * k / float(n));
  float ufreq = abs(2.0 * phi - 1.0);
  int bin = int(clamp(ufreq, 0.0, 1.0) * float(u_spectrumBands - 1) + 0.5);
  return texelFetch(u_spectrumTex, ivec2(clamp(bin, 0, u_spectrumBands - 1), 0), 0).r;
}

vec2 polarToPx(float radius, float theta) {
  return u_resolution * 0.5 + vec2(cos(theta), sin(theta)) * radius;
}

vec2 layoutClip(vec2 px) {
  vec2 uv = px / u_resolution;
  vec2 layoutPos = u_layoutRect.xy + uv * u_layoutRect.zw;
  return layoutPos * 2.0 - 1.0;
}

void main() {
  vec2 corner = CORNERS[gl_VertexID];
  vec2 center = u_resolution * 0.5;

  // ---- reticle pass: one bounding-box quad tightly wrapping the outermost ring ----
  if (u_pass == 1) {
    vec2 p = corner * 2.0 - 1.0;
    vLocalPos = p * u_retOuter;
    vRadius = length(vLocalPos);
    vTheta = atan(vLocalPos.y, vLocalPos.x);
    vValue = 0.0;
    vUv = corner;
    vInstance = 0;
    vec2 retPos = u_resolution * 0.5 + p * u_retOuter;
    gl_Position = vec4(layoutClip(retPos), 0.0, 1.0);
    return;
  }

  // ---- continuous spline loop: thin segment between adjacent spectrum slots ----
  if (u_pass == 2) {
    int n = u_barCount;
    int i = gl_InstanceID;
    float th0 = (float(i) + 0.5) * TAU / float(n) + u_phase;
    float th1 = (float(i + 1) + 0.5) * TAU / float(n) + u_phase;
    float rBase = u_baseRadius + u_bass * BASS_EXPAND_PX;
    float v0 = spectrumAt(i);
    float v1 = spectrumAt(i + 1);
    vec2 p0 = polarToPx(rBase + v0 * u_barLength, th0);
    vec2 p1 = polarToPx(rBase + v1 * u_barLength, th1);
    vec2 seg = p1 - p0;
    vec2 tang = length(seg) > 1e-5 ? seg / length(seg) : vec2(1.0, 0.0);
    vec2 nrm = vec2(-tang.y, tang.x);
    vec2 pos = mix(p0, p1, corner.x) + nrm * (corner.y * 2.0 - 1.0) * 0.9;
    vUv = corner;
    vLocalPos = pos - center;
    vRadius = length(vLocalPos);
    vTheta = atan(vLocalPos.y, vLocalPos.x);
    vValue = mix(v0, v1, corner.x);
    vInstance = i;
    gl_Position = vec4(layoutClip(pos), 0.0, 1.0);
    return;
  }

  // ---- geometry pass: instanced radial bars (or dense ring lines) ----
  int i = gl_InstanceID;
  int count = u_style == 1 ? u_ringCount : u_barCount;
  float n = float(count);
  float theta = (float(i) + 0.5) * TAU / n + u_phase;
  float halfAng = (u_style == 1 ? 0.16 : 0.5 * clamp(u_barWidth, 0.0, 1.0)) * TAU / n;
  float ang = theta + (corner.y * 2.0 - 1.0) * halfAng;

  float value = spectrumAt(i);
  if (u_style == 1) {
    int bands = u_spectrumBands;
    float u = fract((float(i) + 0.5) / n);
    int bin = int(clamp(u, 0.0, 1.0) * float(bands - 1) + 0.5);
    value = texelFetch(u_spectrumTex, ivec2(clamp(bin, 0, bands - 1), 0), 0).r;
  }
  float rBase = u_baseRadius + u_bass * BASS_EXPAND_PX;
  float r = mix(rBase, rBase + value * u_barLength, corner.x);
  vec2 pos = polarToPx(r, ang);

  vUv = corner;
  vLocalPos = pos - center;
  vRadius = r;
  vTheta = ang;
  vValue = value;
  vInstance = i;
  gl_Position = vec4(layoutClip(pos), 0.0, 1.0);
}

// role: radial spectrum geometry — K-fold mirrored bar instances, thin continuous ring segments,
//       and a tight reticle bounding quad, all in pixel space around the centre.
// invariants: pattern values are sampled from the unrotated slot angle and the whole pattern is
//             then rotated by u_phase, so rotation is rigid (no per-frame resampling jumps);
//             sector folds land on high-frequency edges, so neighbours agree at every boundary.
// owner milestone: M3c
