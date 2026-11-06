/**
 * Oklab-perceptual gradient LUT → RGBA16F linear-float texture.
 * Interpolating sRGB hex stops in Oklab avoids muddy gray midpoints between
 * complementary neons (cyan↔magenta). Output texels are LINEAR RGB so the
 * HDR compositor can use them directly without a gamma decode.
 */

type RGB = readonly [number, number, number];

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

function hexToLinearRGB(hex: string): RGB {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length !== 6) throw new Error(`bad hex: ${hex}`);
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) throw new Error(`bad hex: ${hex}`);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

function linearRGBToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  return [L, a, bb];
}

function oklabToLinearRGB(L: number, a: number, b: number): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [r, g, bb];
}

export interface GradientStop {
  readonly t: number;
  readonly color: string;
}

export class ColorPalette {
  readonly tex: WebGLTexture;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    stops: readonly GradientStop[],
    readonly size = 256,
  ) {
    if (stops.length < 2) throw new Error('ColorPalette needs >= 2 stops');
    if (size < 2) throw new Error('ColorPalette size must be >= 2');

    const sorted = [...stops].sort((a, b) => a.t - b.t);
    const oklab = sorted.map((s) => {
      const [r, g, b] = hexToLinearRGB(s.color);
      const [L, a, bb] = linearRGBToOklab(r, g, b);
      return { t: s.t, L, a, b: bb };
    });

    const data = new Float32Array(size * 4);
    for (let i = 0; i < size; i++) {
      const t = i / (size - 1);
      let lo = oklab[0]!;
      let hi = oklab[oklab.length - 1]!;
      for (let k = 0; k < oklab.length - 1; k++) {
        const a = oklab[k]!;
        const b = oklab[k + 1]!;
        if (t >= a.t && t <= b.t) { lo = a; hi = b; break; }
      }
      const span = Math.max(hi.t - lo.t, 1e-6);
      const u = Math.min(Math.max((t - lo.t) / span, 0), 1);
      const L = lo.L + (hi.L - lo.L) * u;
      const a = lo.a + (hi.a - lo.a) * u;
      const b = lo.b + (hi.b - lo.b) * u;
      const [r, g, bb] = oklabToLinearRGB(L, a, b);
      const o = i * 4;
      data[o + 0] = Math.max(0, r);
      data[o + 1] = Math.max(0, g);
      data[o + 2] = Math.max(0, bb);
      data[o + 3] = 1;
    }

    const tex = gl.createTexture();
    if (!tex) throw new Error('ColorPalette texture alloc failed');
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, 1, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  dispose(): void { this.gl.deleteTexture(this.tex); }
}

// role: builds a 256×1 RGBA16F Oklab-interpolated gradient LUT of LINEAR RGB texels.
// invariants: stops interpolated in Oklab, never sRGB (no gray complementary midpoints);
//             texels are linear-light so shaders must not gamma-decode them; built once at init.
// owner milestone: M1
