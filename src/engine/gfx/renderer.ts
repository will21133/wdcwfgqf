import { makeCanvas, Ctx } from './canvas';
import { PostFX, PostParams, defaultPost, VIEW_W, VIEW_H, WORLD_W, WORLD_H } from './post';
import { hexToRgb, col } from '../../art/palette';

/**
 * Layered renderer.
 *  world  — lit scene (tiles, actors) — 642x362 with 1px margin
 *  light  — light map at half res (0.5 grey = neutral) — multiplied in shader (x2)
 *  unlit  — drawn over the lit scene without lighting (bullets, telegraphs, numbers)
 *  glow   — additive emissive (halos, sparks)
 *  ui     — screen-space interface 640x360
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
  ambient = '#3a3a52';
  private lightSprites = new Map<string, HTMLCanvasElement>();
  private fallbackCtx: Ctx | null = null;

  constructor(public screen: HTMLCanvasElement) {
    [this.world, this.w] = makeCanvas(WORLD_W, WORLD_H);
    [this.light, this.l] = makeCanvas(Math.ceil(WORLD_W / 2), Math.ceil(WORLD_H / 2));
    [this.unlit, this.u] = makeCanvas(WORLD_W, WORLD_H);
    [this.glow, this.g] = makeCanvas(WORLD_W, WORLD_H);
    [this.ui, this.ui2] = makeCanvas(VIEW_W, VIEW_H);
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
  }

  /** convert css-pixel position on screen element to internal view coords */
  toView(cx: number, cy: number): [number, number] {
    const dpr = this.screen.width / Math.max(1, this.screen.clientWidth);
    const x = cx * dpr, y = cy * dpr;
    const L = this.post ? this.post.layout(this.params.pixelPerfect) : this.fallbackLayout();
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
    this.ui2.setTransform(1, 0, 0, 1, 0, 0);
    this.ui2.globalAlpha = 1;
    this.ui2.globalCompositeOperation = 'source-over';
    this.ui2.clearRect(0, 0, VIEW_W, VIEW_H);
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
    if (this.post) {
      this.post.render({ world: this.world, light: this.light, unlit: this.unlit, glow: this.glow, ui: this.ui }, this.params);
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
      ctx.drawImage(this.ui, 0, 0, VIEW_W, VIEW_H, L.x, L.y, L.w, L.h);
    }
  }
}

export { VIEW_W, VIEW_H, WORLD_W, WORLD_H };
