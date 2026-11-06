#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_spectrumTex;
uniform sampler2D u_peakHoldTex;   // TODO M3b: peak-hold cap pass (declared, unused in M3a)
uniform vec2 u_resolution;
uniform int u_barCount;
uniform int u_spectrumBands;  // MASTER_BANDS
uniform int u_distribution;   // 0=linear 1=centerOut 2=edgeIn 3=dualStereo
uniform int u_alignment;      // 0=bottomUp 1=topDown 2=symmetricCenter 3=mirroredHorizon
uniform int u_mirror;         // 1 only for the attenuated mirroredHorizon reflection pass
uniform float u_gapRatio;
uniform vec4 u_layoutRect;
uniform float u_rotation;

out vec2 vUv;
flat out int vInstance;
out float vHeight;
out vec2 vHalfSizePx;
out float vUpness;

const vec2 CORNERS[6] = vec2[](
  vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
  vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0)
);

// Bar index -> spectrum lookup. Each bar owns a contiguous span of bins and reports the span's
// maximum, so a single-bin peak can never fall between bars when barCount < MASTER_BANDS.
float sampleSpectrum(int barIdx) {
  int n = u_barCount;
  int bands = u_spectrumBands;
  int start = (barIdx * bands) / n;
  int end = ((barIdx + 1) * bands + n - 1) / n;
  if (end <= start) end = start + 1;
  float m = 0.0;
  for (int b = start; b < end; b++) {
    m = max(m, texelFetch(u_spectrumTex, ivec2(min(b, bands - 1), 0), 0).r);
  }
  return m;
}

int spectrumIndex(int id) {
  int n = u_barCount;
  int halfN = n / 2;
  if (u_distribution == 1) {
    // centerOut: low frequency at the centre, rising toward both outer edges.
    return id < halfN ? (halfN - 1 - id) * 2 : (id - halfN) * 2;
  }
  if (u_distribution == 2) {
    // edgeIn: low frequency at both edges, rising toward the centre.
    return id < halfN ? id * 2 : (n - 1 - id) * 2;
  }
  if (u_distribution == 3) {
    // dualStereo: AudioFramePacket is still mono, so both halves mirror even bins into the
    // two channel slots (left half ascending, right half ascending) until stereo PCM exists.
    return id < halfN ? id * 2 : (id - halfN) * 2;
  }
  return id;
}

void main() {
  vec2 corner = CORNERS[gl_VertexID];
  int barIdx = spectrumIndex(gl_InstanceID);
  float value = clamp(sampleSpectrum(barIdx), 0.0, 1.0);

  float cellW = 1.0 / float(u_barCount);
  float barW = cellW * (1.0 - clamp(u_gapRatio, 0.0, 0.95));
  float xCenter = (float(gl_InstanceID) + 0.5) * cellW;
  float xLocal = xCenter + (corner.x - 0.5) * barW;

  float yLocal;
  if (u_alignment == 0) {          // bottomUp: baseline at the bottom, grows up
    yLocal = corner.y * value;
  } else if (u_alignment == 1) {   // topDown: baseline at the top, grows down
    yLocal = 1.0 - corner.y * value;
  } else if (u_alignment == 2) {   // symmetricCenter: grows +/- value/2 about the midline
    yLocal = 0.5 + (corner.y - 0.5) * value;
  } else if (u_mirror == 0) {      // mirroredHorizon, main bar above the midline
    yLocal = 0.5 + corner.y * value * 0.5;
  } else {                         // mirroredHorizon, attenuated reflection below
    yLocal = 0.5 - corner.y * value * 0.5;
  }

  // Heat coordinate: 1.0 at the growing tip (both tips for symmetric), 0.0 at the baseline.
  float upness = (u_alignment == 2) ? abs(corner.y - 0.5) * 2.0 : corner.y;

  float quadHeightN = value * ((u_alignment == 3) ? 0.5 : 1.0);
  vHalfSizePx = vec2(barW * u_resolution.x * u_layoutRect.z, quadHeightN * u_resolution.y * u_layoutRect.w) * 0.5;

  vUv = corner;
  vInstance = barIdx;
  vHeight = value;
  vUpness = upness;

  vec2 centered = vec2(xLocal, yLocal) - 0.5;
  float rad = radians(u_rotation);
  float rc = cos(rad);
  float rs = sin(rad);
  vec2 rotated = vec2(centered.x * rc - centered.y * rs, centered.x * rs + centered.y * rc) + 0.5;
  vec2 finalPos = u_layoutRect.xy + rotated * u_layoutRect.zw;
  vec2 clip = finalPos * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);
}

// role: instanced bar quad emitter — resamples the spectrum into barCount cells and lays out the
//       four distributions and four alignments entirely on the GPU.
// invariants: one instance == one bar; geometry is emitted in normalised device space; the mirror
//             flag only shifts the reflection pass; no allocation and no CPU-side per-bar work.
// owner milestone: M3a
