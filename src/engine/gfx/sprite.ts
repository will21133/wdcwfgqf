import { PAL, hexToRgb, col } from '../../art/palette';
import { makeCanvas, PixelBuf, Ctx } from './canvas';

/**
 * Sprite DSL: rows of characters, each mapped through `pal` to a palette key.
 * '.' and ' ' are transparent. An outline (K0 by default) is baked automatically
 * so every sprite reads cleanly against any background (Art Bible §3).
 */
export interface SpriteDef {
  rows: string[];
  pal: Record<string, string>;
  /** anchor (pivot) in sprite pixels, default = bottom-centre */
  ox?: number;
  oy?: number;
  outline?: string | false;
  outlineDiag?: boolean;
}

export class Sprite {
  /** sprite with outline (1px padding on each side when outlined) */
  img: HTMLCanvasElement;
  w: number;
  h: number;
  /** pivot inside img */
  ox: number;
  oy: number;
  private tints = new Map<string, HTMLCanvasElement>();

  constructor(img: HTMLCanvasElement, ox: number, oy: number) {
    this.img = img;
    this.w = img.width;
    this.h = img.height;
    this.ox = ox;
    this.oy = oy;
  }

  /** solid silhouette in a colour (cached) — used for hit flash, echoes, shadows */
  tint(color: string): HTMLCanvasElement {
    let c = this.tints.get(color);
    if (!c) {
      const [cv, ctx] = makeCanvas(this.w, this.h);
      ctx.drawImage(this.img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = col(color);
      ctx.fillRect(0, 0, this.w, this.h);
      c = cv;
      this.tints.set(color, c);
    }
    return c;
  }
  get white() { return this.tint('#ffffff'); }

  private recolors = new Map<string, Sprite>();
  /** luminance-mapped palette swap (keeps detail), e.g. echoes in the cyan ramp */
  recolor(ramp: string[]): Sprite {
    const key = ramp.join(',');
    let s = this.recolors.get(key);
    if (!s) {
      const [cv, ctx] = makeCanvas(this.w, this.h);
      ctx.drawImage(this.img, 0, 0);
      const id = ctx.getImageData(0, 0, this.w, this.h);
      const cols = ramp.map((k) => hexToRgb(col(k)));
      for (let i = 0; i < id.data.length; i += 4) {
        if (!id.data[i + 3]) continue;
        const l = (id.data[i] * 0.3 + id.data[i + 1] * 0.55 + id.data[i + 2] * 0.15) / 255;
        const c = cols[Math.min(cols.length - 1, Math.floor(Math.pow(l, 0.8) * cols.length))];
        id.data[i] = c[0]; id.data[i + 1] = c[1]; id.data[i + 2] = c[2];
      }
      ctx.putImageData(id, 0, 0);
      s = new Sprite(cv, this.ox, this.oy);
      this.recolors.set(key, s);
    }
    return s;
  }
}

export function spriteFromDef(def: SpriteDef): Sprite {
  const h = def.rows.length;
  const w = Math.max(...def.rows.map((r) => r.length));
  const pad = def.outline === false ? 0 : 1;
  const pb = new PixelBuf(w + pad * 2, h + pad * 2);
  for (let y = 0; y < h; y++) {
    const row = def.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const key = def.pal[ch];
      if (!key) throw new Error(`sprite: unmapped char '${ch}'`);
      pb.set(x + pad, y + pad, hexToRgb(col(key)));
    }
  }
  if (pad) pb.outline(hexToRgb(col(def.outline || 'K0')), def.outlineDiag);
  const ox = (def.ox ?? Math.floor(w / 2)) + pad;
  const oy = (def.oy ?? h) + pad;
  return new Sprite(pb.toCanvas(), ox, oy);
}

export function spriteFromBuf(pb: PixelBuf, ox: number, oy: number, outline: string | false = 'K0', diag = false): Sprite {
  if (outline === false) return new Sprite(pb.toCanvas(), ox, oy);
  const big = new PixelBuf(pb.w + 2, pb.h + 2);
  for (let y = 0; y < pb.h; y++)
    for (let x = 0; x < pb.w; x++) {
      const [r, g, b, a] = pb.get(x, y);
      if (a) big.set(x + 1, y + 1, [r, g, b], a);
    }
  big.outline(hexToRgb(col(outline)), diag);
  return new Sprite(big.toCanvas(), ox + 1, oy + 1);
}

export function spriteFromCanvas(c: HTMLCanvasElement, ox: number, oy: number, outline: string | false = 'K0'): Sprite {
  return spriteFromBuf(PixelBuf.fromCanvas(c), ox, oy, outline);
}

/** Mirror a sprite horizontally (pivot mirrored too) */
export function flipSprite(s: Sprite): Sprite {
  const [c, ctx] = makeCanvas(s.w, s.h);
  ctx.translate(s.w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(s.img, 0, 0);
  return new Sprite(c, s.w - s.ox, s.oy);
}

export interface DrawOpts {
  flip?: boolean;
  alpha?: number;
  /** solid colour override (hit flash / silhouette) */
  tint?: string;
  sx?: number;
  sy?: number;
  rot?: number;
}

/** Draw a sprite with its pivot at (x, y). Positions are rounded to keep pixels crisp. */
export function drawSprite(ctx: Ctx, s: Sprite, x: number, y: number, o?: DrawOpts) {
  const img = o?.tint ? s.tint(o.tint) : s.img;
  const a = o?.alpha ?? 1;
  if (a <= 0) return;
  const simple = !o || (!o.flip && !o.sx && !o.sy && !o.rot);
  if (a !== 1) ctx.globalAlpha = a;
  if (simple) {
    ctx.drawImage(img, Math.round(x - s.ox), Math.round(y - s.oy));
  } else {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (o!.rot) ctx.rotate(o!.rot);
    const sx = (o!.sx ?? 1) * (o!.flip ? -1 : 1);
    const sy = o!.sy ?? 1;
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.drawImage(img, -s.ox, -s.oy);
    ctx.restore();
  }
  if (a !== 1) ctx.globalAlpha = 1;
}

export class Anim {
  constructor(public frames: Sprite[], public fps: number, public loop = true) {}
  frameAt(t: number): Sprite {
    const n = this.frames.length;
    let i = Math.floor(t * this.fps);
    i = this.loop ? ((i % n) + n) % n : Math.min(n - 1, i);
    return this.frames[i];
  }
  duration() { return this.frames.length / this.fps; }
}

/** Rotated pixel-art cache: pre-rotates a sprite into N steps with nearest sampling (RotSprite-lite via 3x upscale). */
export class RotCache {
  private steps: Sprite[] = [];
  constructor(src: Sprite, public n = 32) {
    for (let i = 0; i < n; i++) this.steps.push(rotateSprite(src, (i / n) * Math.PI * 2));
  }
  get(angle: number): Sprite {
    const i = ((Math.round((angle / (Math.PI * 2)) * this.n) % this.n) + this.n) % this.n;
    return this.steps[i];
  }
}

function rotateSprite(s: Sprite, ang: number): Sprite {
  // upscale 4x with nearest, rotate with nearest, downsample by majority (centre sample)
  const K = 4;
  const diag = Math.ceil(Math.hypot(s.w, s.h)) + 4;
  const [big, bctx] = makeCanvas(diag * K, diag * K);
  bctx.imageSmoothingEnabled = false;
  bctx.translate(diag * K / 2, diag * K / 2);
  bctx.rotate(ang);
  bctx.scale(K, K);
  bctx.drawImage(s.img, -s.ox, -s.oy);
  const src = bctx.getImageData(0, 0, diag * K, diag * K).data;
  const pb = new PixelBuf(diag, diag);
  for (let y = 0; y < diag; y++)
    for (let x = 0; x < diag; x++) {
      const sx = x * K + (K >> 1), sy = y * K + (K >> 1);
      const i = (sy * diag * K + sx) * 4;
      if (src[i + 3] > 127) pb.set(x, y, [src[i], src[i + 1], src[i + 2]]);
    }
  return new Sprite(pb.toCanvas(), diag / 2, diag / 2);
}

export { PAL };
