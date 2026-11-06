#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
in vec2 vLocalPos;
in float vProgress;
in float vAlpha;

uniform sampler2D u_atlasTex;
uniform sampler2D u_palette;
uniform int u_pass;              // 0 glyphs, 1 backdrop band
uniform int u_animMode;
uniform int u_audioReact;        // 0/1
uniform float u_pulse;
uniform float u_hdr;
uniform float u_opacity;
uniform float u_backdropOpacity;
uniform int u_shadow;
uniform vec2 u_atlasTexel;
uniform float u_shadowStrength;
uniform vec3 u_lyricsColor;
uniform float u_lyricsGlow;

out vec4 outColor;

void main() {
  if (u_pass == 1) {
    // Soft-edged dimming band: standard alpha blending against the HDR target darkens the scene
    // behind the text without changing its hue.
    float d = abs(vLocalPos.y - 0.5) * 2.0;
    float a = u_backdropOpacity * (1.0 - smoothstep(0.65, 1.0, d));
    outColor = vec4(0.0, 0.0, 0.0, a);
    return;
  }

  if (u_shadow == 1) {
    // Dark dilated silhouette, drawn with standard alpha before the additive glyph pass.
    vec2 t = u_atlasTexel;
    float a = texture(u_atlasTex, vUv).a;
    a = max(a, texture(u_atlasTex, vUv + vec2(t.x, 0.0)).a);
    a = max(a, texture(u_atlasTex, vUv - vec2(t.x, 0.0)).a);
    a = max(a, texture(u_atlasTex, vUv + vec2(0.0, t.y)).a);
    a = max(a, texture(u_atlasTex, vUv - vec2(0.0, t.y)).a);
    a = smoothstep(0.18, 0.65, a) * u_shadowStrength;
    outColor = vec4(0.0, 0.0, 0.0, a * vAlpha * u_opacity);
    return;
  }

  vec4 tex = texture(u_atlasTex, vUv);
  if (tex.a < 0.01) discard;

  float reveal = 1.0;
  if (u_animMode == 0) {
    reveal = smoothstep(0.0, 0.15, vProgress - vLocalPos.x * 1.1);
  }
  if (reveal <= 0.001) discard;

  float pulse = u_pulse * float(u_audioReact);
  vec3 color = u_lyricsColor * u_hdr * u_lyricsGlow * (1.0 + pulse * 1.6);

  outColor = vec4(color, tex.a * reveal * vAlpha * u_opacity);
}

// role: lyric fragment — atlas alpha mask, per-glyph clip reveal, palette-tinted white-hot HDR
//       emission and the legibility dimming band.
// invariants: emission is linear-light for ACES; alpha carries coverage/opacity; no per-fragment
//             time reads beyond the interpolated animation progress.
// owner milestone: M4
