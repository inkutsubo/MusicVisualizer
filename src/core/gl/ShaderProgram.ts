export class ShaderProgram {
  readonly program: WebGLProgram;
  private readonly gl: WebGL2RenderingContext;
  private readonly cache = new Map<string, WebGLUniformLocation | null>();

  constructor(gl: WebGL2RenderingContext, vs: string, fs: string) {
    this.gl = gl;
    const v = this.compile(gl.VERTEX_SHADER, vs);
    const f = this.compile(gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram();
    if (!p) throw new Error('createProgram failed');
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) ?? 'unknown';
      gl.deleteProgram(p);
      throw new Error(`Link failed: ${log}`);
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    this.program = p;
  }

  private compile(type: number, src: string): WebGLShader {
    const { gl } = this;
    const s = gl.createShader(type);
    if (!s) throw new Error('createShader failed');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s) ?? 'unknown';
      gl.deleteShader(s);
      throw new Error(`Compile failed (${type === gl.VERTEX_SHADER ? 'VS' : 'FS'}): ${log}\n---\n${src}`);
    }
    return s;
  }

  use(): void { this.gl.useProgram(this.program); }

  u(name: string): WebGLUniformLocation | null {
    const hit = this.cache.get(name);
    if (hit !== undefined) return hit;
    const loc = this.gl.getUniformLocation(this.program, name);
    this.cache.set(name, loc);
    return loc;
  }

  f(name: string, v: number): void { this.gl.uniform1f(this.u(name), v); }
  i(name: string, v: number): void { this.gl.uniform1i(this.u(name), v); }
  v2(name: string, x: number, y: number): void { this.gl.uniform2f(this.u(name), x, y); }

  v3(name: string, x: number, y: number, z: number): void {
    this.gl.uniform3f(this.u(name), x, y, z);
  }

  v4(name: string, x: number, y: number, z: number, w: number): void {
    this.gl.uniform4f(this.u(name), x, y, z, w);
  }

  dispose(): void { this.gl.deleteProgram(this.program); }
}

// role: thin wrapper around a linked GL program with a uniform-location cache.
// invariants: locations resolve at init/cached — never a getUniformLocation inside render();
//             shaders are deleted after link; compile errors surface the full source in the throw.
// owner milestone: M1
