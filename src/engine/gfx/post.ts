// WebGL2 post-processing: lighting composite, bloom, grade, chromatic aberration,
// rewind distortion, vignette, grain, sub-pixel camera, sharp-bilinear upscale.

export const VIEW_W = 640;
export const VIEW_H = 360;
/** world layers carry a 1px margin for sub-pixel camera offset */
export const WORLD_W = VIEW_W + 2;
export const WORLD_H = VIEW_H + 2;

export interface PostParams {
  camFracX: number;
  camFracY: number;
  time: number;
  /** 0..1 rewind effect strength */
  rewind: number;
  /** chromatic aberration in source pixels */
  ca: number;
  /** red damage vignette 0..1 */
  hurt: number;
  /** white flash 0..1 */
  flash: number;
  /** fade to black 0..1 (applies to world only) */
  fade: number;
  saturation: number;
  contrast: number;
  /** colour multiply (grade) */
  tint: [number, number, number];
  /** lift shadows toward colour */
  lift: [number, number, number];
  vignette: number;
  bloom: number;
  bloomThreshold: number;
  grain: number;
  /** 0 = sharp bilinear any scale, 1 = integer pixel perfect */
  pixelPerfect: boolean;
  /** use light texture (false = unlit, e.g. menus) */
  lighting: boolean;
  /** stasis/time-stop greyscale for world */
  timestop: number;
}

export const defaultPost = (): PostParams => ({
  camFracX: 0, camFracY: 0, time: 0, rewind: 0, ca: 0, hurt: 0, flash: 0, fade: 0,
  saturation: 1, contrast: 1, tint: [1, 1, 1], lift: [0, 0, 0], vignette: 0.35, bloom: 0.55,
  bloomThreshold: 0.62, grain: 0.025, pixelPerfect: false, lighting: true, timestop: 0,
});

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uWorld, uLight, uUnlit, uGlow;
uniform float uLighting, uSat, uContrast, uRewind, uTime, uTimestop;
uniform vec3 uTint, uLift;
float luma(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
void main(){
  // keep canvas orientation (v=0 = top) inside the FBO chain
  vec2 uv = vUv;
  vec3 w = texture(uWorld, uv).rgb;
  vec3 l = texture(uLight, uv).rgb;
  vec3 c = uLighting > 0.5 ? w * l * 2.0 : w;
  // grade the lit world
  c = c * uTint + uLift * (1.0 - luma(c));
  float g = luma(c);
  c = mix(vec3(g), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  // time-stop: world goes cold grey (actors in unlit layer stay coloured)
  c = mix(c, vec3(g*0.85, g*0.9, g*1.1), uTimestop);
  vec4 u = texture(uUnlit, uv);
  c = mix(c, u.rgb, u.a);
  vec4 gl = texture(uGlow, uv);
  c += gl.rgb * gl.a;
  // rewind: desaturate toward cyan-tinted mono
  float gg = luma(c);
  c = mix(c, vec3(gg*0.75, gg*1.0, gg*1.15), uRewind*0.75);
  o = vec4(c, 1.0);
}`;

const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform float uThreshold;
void main(){
  vec3 c = texture(uSrc, vUv).rgb;
  float b = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.35, b);
  o = vec4(c * k, 1.0);
}`;

const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uDir;
void main(){
  vec3 c = texture(uSrc, vUv).rgb * 0.227027;
  c += texture(uSrc, vUv + uDir*1.3846).rgb * 0.3162162;
  c += texture(uSrc, vUv - uDir*1.3846).rgb * 0.3162162;
  c += texture(uSrc, vUv + uDir*3.2307).rgb * 0.0702703;
  c += texture(uSrc, vUv - uDir*3.2307).rgb * 0.0702703;
  o = vec4(c, 1.0);
}`;

const FS_FINAL = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloomA, uBloomB;
uniform vec2 uSrcSize;   // world texture size (642x362)
uniform vec2 uViewSize;  // 640x360
uniform vec2 uCamFrac;
uniform float uScale, uTime, uRewind, uCA, uHurt, uFlash, uFade, uVignette, uBloom, uGrain;

vec2 sharp(vec2 px, vec2 size){
  // px in texel space -> sharp-bilinear uv
  vec2 fl = floor(px);
  vec2 f = fract(px) - 0.5;
  float r = 0.5 - 0.5 / uScale;
  f = (f - clamp(f, -r, r)) * uScale + 0.5;
  return (fl + f) / size;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

void main(){
  vec2 v = vec2(vUv.x, 1.0 - vUv.y) * uViewSize; // view pixel coords (0..640)
  // rewind wobble: horizontal displacement per scanline band
  float band = floor(v.y / 2.0);
  float wob = uRewind * (sin(band * 0.35 + uTime * 22.0) * 2.0 + sin(band * 0.07 - uTime * 9.0) * 3.0);
  vec2 sp = v + vec2(1.0) + uCamFrac + vec2(wob, 0.0);
  vec3 c;
  if (uCA > 0.01) {
    c.r = texture(uScene, sharp(sp + vec2(uCA, 0.0), uSrcSize)).r;
    c.g = texture(uScene, sharp(sp, uSrcSize)).g;
    c.b = texture(uScene, sharp(sp - vec2(uCA, 0.0), uSrcSize)).b;
  } else {
    c = texture(uScene, sharp(sp, uSrcSize)).rgb;
  }
  vec2 buv = sp / uSrcSize;
  c += (texture(uBloomA, buv).rgb * 0.6 + texture(uBloomB, buv).rgb * 0.9) * uBloom;

  vec2 q = v / uViewSize - 0.5;
  float vig = 1.0 - dot(q, q) * uVignette * 2.2;
  c *= clamp(vig, 0.0, 1.0);
  // rewind scanlines + cyan edge
  c *= 1.0 - uRewind * 0.18 * step(1.0, mod(v.y, 3.0));
  c += vec3(0.1, 0.55, 0.7) * uRewind * smoothstep(0.15, 0.55, length(q)) * 0.5;
  // hurt vignette
  c = mix(c, vec3(0.62, 0.04, 0.1), uHurt * smoothstep(0.32, 0.72, length(q)) * 0.55);
  c = mix(c, vec3(1.0), uFlash);
  c += (hash(v + fract(uTime) * 91.0) - 0.5) * uGrain;
  c *= 1.0 - uFade;
  // the UI is not composited here: it lives on its own device-resolution canvas above this one
  o = vec4(c, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  return {
    p,
    u(name: string) {
      if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(p, name));
      return uniforms.get(name)!;
    },
  };
}

interface Target { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }

export class PostFX {
  gl: WebGL2RenderingContext;
  private progComposite; private progBright; private progBlur; private progFinal;
  private texWorld: WebGLTexture; private texLight: WebGLTexture; private texUnlit: WebGLTexture;
  private texGlow: WebGLTexture;
  private scene: Target; private bA: Target; private bA2: Target; private bB: Target; private bB2: Target;

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.progComposite = compile(gl, VS, FS_COMPOSITE);
    this.progBright = compile(gl, VS, FS_BRIGHT);
    this.progBlur = compile(gl, VS, FS_BLUR);
    this.progFinal = compile(gl, VS, FS_FINAL);

    this.texWorld = this.mkTex(gl.NEAREST);
    this.texLight = this.mkTex(gl.LINEAR);
    this.texUnlit = this.mkTex(gl.NEAREST);
    this.texGlow = this.mkTex(gl.LINEAR);

    this.scene = this.mkTarget(WORLD_W, WORLD_H, gl.LINEAR);
    this.bA = this.mkTarget(WORLD_W >> 1, WORLD_H >> 1, gl.LINEAR);
    this.bA2 = this.mkTarget(WORLD_W >> 1, WORLD_H >> 1, gl.LINEAR);
    this.bB = this.mkTarget(WORLD_W >> 2, WORLD_H >> 2, gl.LINEAR);
    this.bB2 = this.mkTarget(WORLD_W >> 2, WORLD_H >> 2, gl.LINEAR);
  }

  private mkTex(filter: number) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  private mkTarget(w: number, h: number, filter: number): Target {
    const gl = this.gl;
    const tex = this.mkTex(filter);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }
  private upload(tex: WebGLTexture, src: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }
  private bind(unit: number, tex: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }
  private draw(t: Target | null, vw?: number, vh?: number, vx = 0, vy = 0) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
    gl.viewport(vx, vy, t ? t.w : vw!, t ? t.h : vh!);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** compute display viewport (in device pixels) */
  layout(pixelPerfect: boolean) {
    const cw = this.canvas.width, ch = this.canvas.height;
    let s = Math.min(cw / VIEW_W, ch / VIEW_H);
    if (pixelPerfect && s >= 1) s = Math.floor(s);
    const w = Math.round(VIEW_W * s), h = Math.round(VIEW_H * s);
    return { x: Math.floor((cw - w) / 2), y: Math.floor((ch - h) / 2), w, h, s };
  }

  render(layers: { world: HTMLCanvasElement; light: HTMLCanvasElement; unlit: HTMLCanvasElement; glow: HTMLCanvasElement }, p: PostParams) {
    const gl = this.gl;
    this.upload(this.texWorld, layers.world);
    if (p.lighting) this.upload(this.texLight, layers.light);
    this.upload(this.texUnlit, layers.unlit);
    this.upload(this.texGlow, layers.glow);

    // 1. composite
    let pr = this.progComposite;
    gl.useProgram(pr.p);
    this.bind(0, this.texWorld); gl.uniform1i(pr.u('uWorld'), 0);
    this.bind(1, this.texLight); gl.uniform1i(pr.u('uLight'), 1);
    this.bind(2, this.texUnlit); gl.uniform1i(pr.u('uUnlit'), 2);
    this.bind(3, this.texGlow); gl.uniform1i(pr.u('uGlow'), 3);
    gl.uniform1f(pr.u('uLighting'), p.lighting ? 1 : 0);
    gl.uniform1f(pr.u('uSat'), p.saturation);
    gl.uniform1f(pr.u('uContrast'), p.contrast);
    gl.uniform1f(pr.u('uRewind'), p.rewind);
    gl.uniform1f(pr.u('uTime'), p.time);
    gl.uniform1f(pr.u('uTimestop'), p.timestop);
    gl.uniform3fv(pr.u('uTint'), p.tint);
    gl.uniform3fv(pr.u('uLift'), p.lift);
    this.draw(this.scene);

    // 2. bloom
    if (p.bloom > 0) {
      pr = this.progBright;
      gl.useProgram(pr.p);
      this.bind(0, this.scene.tex); gl.uniform1i(pr.u('uSrc'), 0);
      gl.uniform1f(pr.u('uThreshold'), p.bloomThreshold);
      this.draw(this.bA);
      pr = this.progBlur;
      gl.useProgram(pr.p);
      gl.uniform1i(pr.u('uSrc'), 0);
      const blur = (src: Target, dst: Target, dx: number, dy: number) => {
        this.bind(0, src.tex);
        gl.uniform2f(pr.u('uDir'), dx / src.w, dy / src.h);
        this.draw(dst);
      };
      blur(this.bA, this.bA2, 1, 0); blur(this.bA2, this.bA, 0, 1);
      blur(this.bA, this.bB, 1, 0); blur(this.bB, this.bB2, 0, 1);
      blur(this.bB2, this.bB, 1.5, 0); blur(this.bB, this.bB2, 0, 1.5);
    }

    // 3. final
    const L = this.layout(p.pixelPerfect);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.027, 0.024, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    pr = this.progFinal;
    gl.useProgram(pr.p);
    this.bind(0, this.scene.tex); gl.uniform1i(pr.u('uScene'), 0);
    this.bind(1, this.bA.tex); gl.uniform1i(pr.u('uBloomA'), 1);
    this.bind(2, this.bB2.tex); gl.uniform1i(pr.u('uBloomB'), 2);
    gl.uniform2f(pr.u('uSrcSize'), WORLD_W, WORLD_H);
    gl.uniform2f(pr.u('uViewSize'), VIEW_W, VIEW_H);
    gl.uniform2f(pr.u('uCamFrac'), p.camFracX, p.camFracY);
    gl.uniform1f(pr.u('uScale'), L.s);
    gl.uniform1f(pr.u('uTime'), p.time);
    gl.uniform1f(pr.u('uRewind'), p.rewind);
    gl.uniform1f(pr.u('uCA'), p.ca);
    gl.uniform1f(pr.u('uHurt'), p.hurt);
    gl.uniform1f(pr.u('uFlash'), p.flash);
    gl.uniform1f(pr.u('uFade'), p.fade);
    gl.uniform1f(pr.u('uVignette'), p.vignette);
    gl.uniform1f(pr.u('uBloom'), p.bloom);
    gl.uniform1f(pr.u('uGrain'), p.grain);
    gl.viewport(L.x, this.canvas.height - L.y - L.h, L.w, L.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
