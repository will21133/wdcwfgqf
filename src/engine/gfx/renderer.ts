import { makeCanvas, Ctx } from './canvas';
import { PostFX, PostParams, defaultPost, VIEW_W, VIEW_H, WORLD_W, WORLD_H } from './post';
import { hexToRgb, col } from '../../art/palette';
import { textMul, baseMul, textScale, Mat2D } from './font';

/** text sizes of the game's Text API (src/game/ui/text.ts) */
export type LabelSize = 'title' | 'body' | 'small' | 'tiny';
/** a string, or a bilingual { zh, en } pair */
export type LabelText = string | { zh: string; en: string };
/**
 * Text anchored to a world position, drawn crisp on the UI layer (no bloom / CA / wobble / grain).
 * Centred on x; y is the top of the text. `alpha` is clamped UP to `minAlpha` (default 0.7, so
 * signs stay readable, GDD2 §12.1): pass `minAlpha: 0` for a label that should fade out fully.
 */
export interface WorldLabel {
  x: number; y: number; text: LabelText; size?: LabelSize; color?: string;
  plate?: boolean; alpha?: number; minAlpha?: number /* default 0.7 */; player?: number /* slot */;
}
type UiFn = (ctx: CanvasRenderingContext2D, toUi: (x: number, y: number) => { x: number; y: number }) => void;

/**
 * Keep a JS mirror of the context's transform in ctx.__t (save / restore / setTransform / translate
 * / scale / rotate / transform / resetTransform all update it), so code that needs the transform on
 * every glyph or rect (font.ts ctxTransform, the snapping below) never allocates a DOMMatrix.
 */
function mirrorTransform(ctx: CanvasRenderingContext2D): { reset(): void } {
  const t: Mat2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: Mat2D[] = [];
  (ctx as unknown as { __t: Mat2D }).__t = t;
  const set = (a: number, b: number, c: number, d: number, e: number, f: number) => { t.a = a; t.b = b; t.c = c; t.d = d; t.e = e; t.f = f; };
  const o = {
    save: ctx.save.bind(ctx), restore: ctx.restore.bind(ctx), setTransform: ctx.setTransform.bind(ctx) as (...a: unknown[]) => void,
    resetTransform: ctx.resetTransform.bind(ctx), translate: ctx.translate.bind(ctx), scale: ctx.scale.bind(ctx),
    rotate: ctx.rotate.bind(ctx), transform: ctx.transform.bind(ctx),
  };
  ctx.save = () => { stack.push({ ...t }); o.save(); };
  ctx.restore = () => { const p = stack.pop(); if (p) set(p.a, p.b, p.c, p.d, p.e, p.f); o.restore(); };
  ctx.setTransform = ((a?: number | DOMMatrix2DInit, b?: number, c?: number, d?: number, e?: number, f?: number) => {
    if (typeof a === 'number') { set(a, b!, c!, d!, e!, f!); o.setTransform(a, b, c, d, e, f); return; }
    const m = a ?? {};
    set(m.a ?? m.m11 ?? 1, m.b ?? m.m12 ?? 0, m.c ?? m.m21 ?? 0, m.d ?? m.m22 ?? 1, m.e ?? m.m41 ?? 0, m.f ?? m.m42 ?? 0);
    o.setTransform(a);
  }) as typeof ctx.setTransform;
  ctx.resetTransform = () => { set(1, 0, 0, 1, 0, 0); o.resetTransform(); };
  const mul = (a2: number, b2: number, c2: number, d2: number, e2: number, f2: number) =>
    set(t.a * a2 + t.c * b2, t.b * a2 + t.d * b2, t.a * c2 + t.c * d2, t.b * c2 + t.d * d2, t.a * e2 + t.c * f2 + t.e, t.b * e2 + t.d * f2 + t.f);
  ctx.translate = (x: number, y: number) => { mul(1, 0, 0, 1, x, y); o.translate(x, y); };
  ctx.scale = (x: number, y: number) => { mul(x, 0, 0, y, 0, 0); o.scale(x, y); };
  ctx.rotate = (r: number) => { const c = Math.cos(r), s = Math.sin(r); mul(c, s, -s, c, 0, 0); o.rotate(r); };
  ctx.transform = (a: number, b: number, c: number, d: number, e: number, f: number) => { mul(a, b, c, d, e, f); o.transform(a, b, c, d, e, f); };
  // a canvas resize resets the context: identity transform, empty state stack
  return { reset() { stack.length = 0; set(1, 0, 0, 1, 0, 0); } };
}

/**
 * Make an axis-aligned scaled context draw on whole device pixels: fillRect edges and drawImage
 * destinations are rounded to the device grid, so panels and icons never get blurry seams.
 * Needs mirrorTransform(ctx) first.
 */
function snapToDeviceGrid(ctx: CanvasRenderingContext2D) {
  const fill = ctx.fillRect.bind(ctx);
  const draw = ctx.drawImage.bind(ctx) as (...a: unknown[]) => void;
  const t = (ctx as unknown as { __t: Mat2D }).__t;
  // device-space calls go straight to the native setTransform (the mirror is restored after)
  const nativeSet = CanvasRenderingContext2D.prototype.setTransform as (this: CanvasRenderingContext2D, ...a: number[]) => void;
  const toDevice = () => nativeSet.call(ctx, 1, 0, 0, 1, 0, 0);
  const back = () => nativeSet.call(ctx, t.a, t.b, t.c, t.d, t.e, t.f);
  ctx.fillRect = (x: number, y: number, w: number, h: number) => {
    if (t.b !== 0 || t.c !== 0 || (t.a === 1 && t.d === 1)) return fill(x, y, w, h);
    let x0 = Math.round(t.e + t.a * x), x1 = Math.round(t.e + t.a * (x + w));
    let y0 = Math.round(t.f + t.d * y), y1 = Math.round(t.f + t.d * (y + h));
    if (x1 < x0) { const q = x0; x0 = x1; x1 = q; }
    if (y1 < y0) { const q = y0; y0 = y1; y1 = q; }
    if (x1 === x0 && w !== 0) x1++;
    if (y1 === y0 && h !== 0) y1++;
    toDevice();
    fill(x0, y0, x1 - x0, y1 - y0);
    back();
  };
  ctx.drawImage = ((img: CanvasImageSource, a0: number, a1: number, a2?: number, a3?: number, a4?: number, a5?: number, a6?: number, a7?: number) => {
    const n = a4 !== undefined ? 8 : a2 !== undefined ? 4 : 2;
    if (t.b !== 0 || t.c !== 0 || t.a <= 0 || t.d <= 0 || (t.a === 1 && t.d === 1)) {
      if (n === 2) return draw(img, a0, a1);
      if (n === 4) return draw(img, a0, a1, a2, a3);
      return draw(img, a0, a1, a2, a3, a4, a5, a6, a7);
    }
    const iw = (img as HTMLCanvasElement).width, ih = (img as HTMLCanvasElement).height;
    let sx = 0, sy = 0, sw = iw, sh = ih, dx: number, dy: number, dw: number, dh: number;
    if (n === 2) { dx = a0; dy = a1; dw = iw; dh = ih; }
    else if (n === 4) { dx = a0; dy = a1; dw = a2!; dh = a3!; }
    else { sx = a0; sy = a1; sw = a2!; sh = a3!; dx = a4!; dy = a5!; dw = a6!; dh = a7!; }
    const x0 = Math.round(t.e + t.a * dx), x1 = Math.round(t.e + t.a * (dx + dw));
    const y0 = Math.round(t.f + t.d * dy), y1 = Math.round(t.f + t.d * (dy + dh));
    if (x1 <= x0 || y1 <= y0) return;
    toDevice();
    draw(img, sx, sy, sw, sh, x0, y0, x1 - x0, y1 - y0);
    back();
  }) as typeof ctx.drawImage;
}

/**
 * Layered renderer.
 *  world  — lit scene (tiles, actors) — 642x362 with 1px margin
 *  light  — light map at half res (0.5 grey = neutral) — multiplied in shader (x2)
 *  unlit  — drawn over the lit scene without lighting (bullets, telegraphs, numbers)
 *  glow   — additive emissive (halos, sparks)
 *  ui     — screen-space interface: its own canvas at DEVICE resolution, layered above the
 *           WebGL canvas and untouched by post-processing. UI code still draws in 640x360
 *           logical units (the context carries a scale transform); text is blitted at an integer
 *           multiple of the font pixel and rects / images snap to the device grid.
 */
export class Renderer {
  world: HTMLCanvasElement; w: Ctx;
  light: HTMLCanvasElement; l: Ctx;
  unlit: HTMLCanvasElement; u: Ctx;
  glow: HTMLCanvasElement; g: Ctx;
  ui: HTMLCanvasElement; ui2: Ctx;
  post: PostFX | null = null;
  params: PostParams = defaultPost();
  /** camera top-left in world coords */
  camX = 0; camY = 0;
  /** device pixels per logical pixel on the UI layer */
  uiScale = 1;
  /** device-pixel offset of the logical 640x360 view inside the UI canvas */
  uiX = 0; uiY = 0;
  /** paints one world label (installed by the game's Text API) */
  static labelPainter: ((ctx: CanvasRenderingContext2D, l: WorldLabel, x: number, y: number, alpha: number) => void) | null = null;
  private worldUiQueue: (WorldLabel | UiFn)[] = [];
  private uiSaved = false;
  private uiMirror: { reset(): void };
  /** between begin() and end(): world labels may be queued */
  private inFrame = false;
  private warnedLabel = false;
  ambient = '#3a3a52';
  private lightSprites = new Map<string, HTMLCanvasElement>();
  private fallbackCtx: Ctx | null = null;

  constructor(public screen: HTMLCanvasElement) {
    [this.world, this.w] = makeCanvas(WORLD_W, WORLD_H);
    [this.light, this.l] = makeCanvas(Math.ceil(WORLD_W / 2), Math.ceil(WORLD_H / 2));
    [this.unlit, this.u] = makeCanvas(WORLD_W, WORLD_H);
    [this.glow, this.g] = makeCanvas(WORLD_W, WORLD_H);
    this.ui = document.createElement('canvas');
    this.ui.id = 'ui';
    Object.assign(this.ui.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', imageRendering: 'pixelated', zIndex: '1' });
    screen.insertAdjacentElement('afterend', this.ui);
    this.ui2 = this.ui.getContext('2d')!;
    this.uiMirror = mirrorTransform(this.ui2);
    snapToDeviceGrid(this.ui2);
    try {
      this.post = new PostFX(screen);
    } catch (e) {
      console.warn('WebGL2 post disabled', e);
      this.fallbackCtx = screen.getContext('2d')!;
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.floor(window.innerWidth * dpr), H = Math.floor(window.innerHeight * dpr);
    if (this.screen.width !== W || this.screen.height !== H) {
      this.screen.width = W;
      this.screen.height = H;
    }
    this.screen.style.width = window.innerWidth + 'px';
    this.screen.style.height = window.innerHeight + 'px';
    if (this.ui.width !== W || this.ui.height !== H) {
      this.ui.width = W;
      this.ui.height = H;
      this.uiSaved = false; // resizing resets the context state stack
      this.uiMirror.reset();
    }
    this.ui.style.width = window.innerWidth + 'px';
    this.ui.style.height = window.innerHeight + 'px';
  }

  /** where the 640x360 view sits on the screen, in device pixels */
  viewLayout() {
    return this.post ? this.post.layout(this.params.pixelPerfect) : this.fallbackLayout();
  }

  /** round a logical coordinate to the device pixel grid of the UI layer */
  snap(v: number): number { return Math.round(v * this.uiScale) / this.uiScale; }

  /** world position → logical UI position (follows camera and shake, ignores post wobble) */
  worldToUi(x: number, y: number): { x: number; y: number } { return { x: x - this.camX, y: y - this.camY }; }

  /**
   * Queue a world-anchored label for this frame; drawn on the UI layer below the HUD.
   * Call it from render code (between the scene's r.begin() and the frame's end): the queue is
   * per frame and begin() empties it, so labels queued from update() would never show.
   */
  label(l: WorldLabel) { this.checkFrame(); this.worldUiQueue.push(l); }

  /** queue free-form world-anchored UI drawing for this frame (same layer as labels; render code only) */
  worldUi(fn: UiFn) { this.checkFrame(); this.worldUiQueue.push(fn); }

  private checkFrame() {
    if (this.inFrame || this.warnedLabel) return;
    this.warnedLabel = true;
    console.warn('[ui] r.label() / r.worldUi() called outside render: world labels are per frame, queue them from render code');
  }

  /** draw queued world labels now (scenes call this right after the world, before the HUD) */
  flushWorldUi() {
    if (!this.worldUiQueue.length) return;
    const ctx = this.ui2;
    const toUi = (x: number, y: number) => this.worldToUi(x, y);
    const q = this.worldUiQueue;
    this.worldUiQueue = [];
    for (const it of q) {
      ctx.globalAlpha = 1;
      if (typeof it === 'function') { it(ctx, toUi); continue; }
      const a = Math.max(it.minAlpha ?? 0.7, Math.min(1, it.alpha ?? 1));
      if (a <= 0) continue;
      const p = toUi(it.x, it.y);
      if (p.x < -200 || p.x > VIEW_W + 200 || p.y < -60 || p.y > VIEW_H + 60) continue;
      Renderer.labelPainter?.(ctx, it, p.x, p.y, a);
    }
    ctx.globalAlpha = 1;
  }

  /** convert css-pixel position on screen element to internal view coords */
  toView(cx: number, cy: number): [number, number] {
    const dpr = this.screen.width / Math.max(1, this.screen.clientWidth);
    const x = cx * dpr, y = cy * dpr;
    const L = this.viewLayout();
    return [((x - L.x) / L.w) * VIEW_W, ((y - L.y) / L.h) * VIEW_H];
  }
  private fallbackLayout() {
    const cw = this.screen.width, ch = this.screen.height;
    const s = Math.min(cw / VIEW_W, ch / VIEW_H);
    const w = VIEW_W * s, h = VIEW_H * s;
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h, s };
  }

  /** begin a frame: clears layers and applies the camera transform to world layers */
  begin(camX: number, camY: number, clearColor = '#0b0a14') {
    this.camX = camX;
    this.camY = camY;
    const ix = Math.floor(camX), iy = Math.floor(camY);
    this.params.camFracX = camX - ix;
    this.params.camFracY = camY - iy;
    for (const c of [this.w, this.u, this.g]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
    this.w.fillStyle = clearColor;
    this.w.fillRect(0, 0, WORLD_W, WORLD_H);
    this.u.clearRect(0, 0, WORLD_W, WORLD_H);
    this.g.clearRect(0, 0, WORLD_W, WORLD_H);
    for (const c of [this.w, this.u, this.g]) c.setTransform(1, 0, 0, 1, 1 - ix, 1 - iy);
    // light: half res
    this.l.setTransform(1, 0, 0, 1, 0, 0);
    this.l.globalCompositeOperation = 'source-over';
    this.l.fillStyle = this.ambient;
    this.l.fillRect(0, 0, this.light.width, this.light.height);
    this.l.setTransform(0.5, 0, 0, 0.5, (1 - ix) * 0.5, (1 - iy) * 0.5);
    this.l.globalCompositeOperation = 'lighter';
    // UI layer: clear at device resolution, clip to the view, then work in logical units
    const L = this.viewLayout();
    const u = this.ui2;
    this.uiScale = L.s; this.uiX = L.x; this.uiY = L.y;
    textScale.s = L.s; textScale.m = textMul(L.s); textScale.k = textScale.m / L.s; textScale.r = textScale.m / baseMul(L.s);
    if (this.uiSaved) u.restore();
    u.save();
    this.uiSaved = true;
    u.setTransform(1, 0, 0, 1, 0, 0);
    u.globalAlpha = 1;
    u.globalCompositeOperation = 'source-over';
    u.clearRect(0, 0, this.ui.width, this.ui.height);
    u.beginPath();
    u.rect(L.x, L.y, L.w, L.h);
    u.clip();
    u.imageSmoothingEnabled = false;
    u.setTransform(L.s, 0, 0, L.s, L.x, L.y);
    this.worldUiQueue.length = 0;
    this.inFrame = true;
  }

  /** world-space visible test */
  visible(x: number, y: number, pad = 32) {
    return x > this.camX - pad && y > this.camY - pad && x < this.camX + VIEW_W + pad && y < this.camY + VIEW_H + pad;
  }

  private lightSprite(color: string): HTMLCanvasElement {
    let c = this.lightSprites.get(color);
    if (!c) {
      const S = 128;
      const [cv, ctx] = makeCanvas(S, S);
      const [r, g, b] = hexToRgb(col(color));
      const grd = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      // smooth falloff with a soft core
      const stops = [0, 0.15, 0.35, 0.6, 0.82, 1];
      const vals = [1, 0.82, 0.5, 0.22, 0.07, 0];
      stops.forEach((s, i) => grd.addColorStop(s, `rgba(${r},${g},${b},${vals[i]})`));
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, S, S);
      c = cv;
      this.lightSprites.set(color, c);
    }
    return c;
  }

  /** add a point light (world coords). intensity 0..~1.5 */
  lightAt(x: number, y: number, radius: number, color: string, intensity = 1) {
    if (!this.visible(x, y, radius)) return;
    const s = this.lightSprite(color);
    this.l.globalAlpha = Math.min(1, intensity);
    this.l.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
    if (intensity > 1) {
      this.l.globalAlpha = Math.min(1, intensity - 1);
      this.l.drawImage(s, x - radius * 0.6, y - radius * 0.6, radius * 1.2, radius * 1.2);
    }
    this.l.globalAlpha = 1;
  }

  /** additive glow halo on the glow layer */
  glowAt(x: number, y: number, radius: number, color: string, intensity = 1) {
    if (!this.visible(x, y, radius)) return;
    const s = this.lightSprite(color);
    this.g.globalCompositeOperation = 'lighter';
    this.g.globalAlpha = Math.min(1, intensity);
    this.g.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
    this.g.globalAlpha = 1;
    this.g.globalCompositeOperation = 'source-over';
  }

  end() {
    // labels queued by scenes that never flushed (previews) still show, on top
    this.flushWorldUi();
    this.inFrame = false;
    if (this.post) {
      this.post.render({ world: this.world, light: this.light, unlit: this.unlit, glow: this.glow }, this.params);
    } else if (this.fallbackCtx) {
      const ctx = this.fallbackCtx;
      const L = this.fallbackLayout();
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#07060d';
      ctx.fillRect(0, 0, this.screen.width, this.screen.height);
      ctx.drawImage(this.world, 1, 1, VIEW_W, VIEW_H, L.x, L.y, L.w, L.h);
      ctx.drawImage(this.unlit, 1, 1, VIEW_W, VIEW_H, L.x, L.y, L.w, L.h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.glow, 1, 1, VIEW_W, VIEW_H, L.x, L.y, L.w, L.h);
      ctx.globalCompositeOperation = 'source-over';
      // the UI canvas sits above this one in the page; nothing to composite here
    }
  }
}

export { VIEW_W, VIEW_H, WORLD_W, WORLD_H };
