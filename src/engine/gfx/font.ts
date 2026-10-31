// Pixel-perfect text: glyphs from the Fusion Pixel webfont are rasterised once,
// alpha-thresholded to 1-bit, and cached. Rendered strings are cached too.
// Supports inline colour markup:  "造成 {g:12} 点伤害"  →  12 in gold.
//
// Two output paths:
//  · 1× contexts (offscreen bakes, world layers): blocks are drawn at their native size.
//  · the device-resolution UI context (transform scale s ≠ 1): blocks are blitted at an
//    integer multiple m = textMul(s) of the font pixel, aligned to the device grid, so
//    glyphs stay razor sharp at any window size. Layout stays in 640×360 logical units:
//    measure() returns logical widths (font px × m / s).

import { col } from '../../art/palette';
import { makeCanvas, Ctx } from './canvas';

interface Glyph { c: HTMLCanvasElement; adv: number }

const COLOR_TAGS: Record<string, string> = {
  g: 'B5', // gold — numbers / key values
  r: 'R4', // red — damage / danger
  c: 'C3', // cyan — echo / rewind / sand
  v: 'V4', // violet — stasis / fixed
  o: 'O3', // orange — burn
  t: 'T5', // teal — rust / growth
  b: 'U4', // blue — resonance
  w: 'K10', // white
  k: 'K7', // grey — flavour
  p: 'M3', // pink
  y: 'G4', // lime — gearwork
};

/** CJK ideographs, kana, fullwidth forms and CJK punctuation */
export const CJK_RE = /[⺀-鿿豈-﫿︰-﹏＀-￯]/;

/**
 * Integer device pixels per font pixel for a UI drawn at scale s (device px per logical px).
 * round(s), stepped down when that would make text more than 12.5% larger than its logical box.
 */
export function textMul(s: number): number {
  let m = artMul(s);
  // text size 125%: one device-pixel step larger, as long as that stays within 150% of the layout
  if (textScale.boost && (m + 1) / s <= 1.5) m++;
  return m;
}

/** integer device px per art px for free-floating pixel art (never affected by the text-size setting) */
export function artMul(s: number): number {
  let m = Math.max(1, Math.round(s));
  if (m > 1 && m / s > 1.125) m--;
  return m;
}

/**
 * logical px per font px on the UI layer this frame (k = m / s); set by the renderer.
 * boost = the 125% text-size setting (settings.ts); r = how much larger text is than at 100%
 * this frame (1 when boost is off) — layouts with fixed row heights scale by it.
 */
export const textScale = { k: 1, s: 1, m: 1, boost: false, r: 1 };

const isDev = (() => { try { return !!(import.meta as any).env?.DEV; } catch { return false; } })();
const warned = new Set<string>();

export interface TextOpts {
  color?: string;
  align?: 'left' | 'center' | 'right';
  shadow?: string | false;
  outline?: string | false;
  /** wrap width in logical px */
  wrap?: number;
  /** line height in font px (default: the font's) */
  lineH?: number;
  alpha?: number;
  /** vertical alignment of the block relative to y */
  valign?: 'top' | 'middle' | 'bottom';
  /** extra integer magnification (title text = FP12 × 2) */
  scale?: number;
}

interface Run { text: string; color: string | null }
interface Block { c: HTMLCanvasElement; w: number; lines: number }

/** true when ctx carries a non-identity scale (the device-resolution UI layer) */
export function ctxScale(ctx: Ctx): number {
  const t = ctx.getTransform();
  if (t.b !== 0 || t.c !== 0) return 1;
  return Math.abs(t.a - 1) < 1e-4 ? 1 : t.a;
}

export class PixelFont {
  private glyphs = new Map<string, Glyph>();
  private cache = new Map<string, Block>();
  private gctx: Ctx;
  private gcan: HTMLCanvasElement;
  readonly ascent: number;
  readonly descent: number;
  /** height of a rasterised glyph cell: ascent + descent + 2 (keeps g/j/p/q/y and _ intact) */
  readonly cellH: number;
  readonly lineH: number;

  constructor(public family: string, public size: number, lineH?: number, private opts: { latinOnly?: boolean; fallback?: () => PixelFont } = {}) {
    [this.gcan, this.gctx] = makeCanvas(size * 3, size * 3);
    this.gctx.font = `${size}px "${family}"`;
    const m = this.gctx.measureText('国Ag');
    this.ascent = Math.round(m.fontBoundingBoxAscent || size * 0.85);
    this.descent = Math.round(m.fontBoundingBoxDescent || size * 0.25);
    this.cellH = Math.ceil(this.ascent + this.descent) + 2;
    if (this.gcan.height < this.cellH + 2) [this.gcan, this.gctx] = makeCanvas(size * 3, this.cellH + 2);
    this.lineH = lineH ?? size + 3;
  }

  /** latin-only fonts (tiny) hand CJK strings to their fallback and warn in dev builds */
  private route(text: string): PixelFont | null {
    if (!this.opts.latinOnly || !CJK_RE.test(text)) return null;
    if (isDev && !warned.has(text)) { warned.add(text); console.warn('[text] CJK in tiny:', text.slice(0, 24)); }
    return this.opts.fallback?.() ?? null;
  }

  glyph(ch: string): Glyph {
    let g = this.glyphs.get(ch);
    if (g) return g;
    const ctx = this.gctx;
    ctx.clearRect(0, 0, this.gcan.width, this.gcan.height);
    ctx.font = `${this.size}px "${this.family}"`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ch, 1, this.ascent + 1);
    const adv = Math.max(1, Math.round(ctx.measureText(ch).width));
    const w = adv + 2, h = this.cellH;
    const id = ctx.getImageData(0, 0, w, h);
    const [c, cctx] = makeCanvas(w, h);
    const out = cctx.createImageData(w, h);
    for (let i = 0; i < id.data.length; i += 4) {
      const on = id.data[i + 3] > 110;
      out.data[i] = out.data[i + 1] = out.data[i + 2] = 255;
      out.data[i + 3] = on ? 255 : 0;
    }
    cctx.putImageData(out, 0, 0);
    g = { c, adv };
    this.glyphs.set(ch, g);
    return g;
  }

  /** Width of plain text (markup stripped) in font pixels */
  measureRaw(text: string): number {
    const f = this.route(text);
    if (f) return f.measureRaw(text);
    let w = 0;
    for (const r of parseRuns(text)) for (const ch of r.text) w += this.glyph(ch).adv;
    return w;
  }

  /** Width of plain text in logical (640×360) pixels on the UI layer */
  measure(text: string): number {
    const f = this.route(text);
    if (f) return f.measure(text);
    return this.measureRaw(text) * textScale.k;
  }

  /** Lay out text into lines of runs, with CJK-aware wrapping (wrap in font px) */
  layout(text: string, wrap?: number): Run[][] {
    const lines: Run[][] = [];
    for (const para of text.split('\n')) {
      const runs = parseRuns(para);
      if (!wrap) { lines.push(runs); continue; }
      // tokenise: each CJK char is a token; latin words stay together
      const tokens: Run[] = [];
      for (const r of runs) {
        const re = /([　-鿿＀-￯])|(\s+)|([^\s　-鿿＀-￯]+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(r.text))) tokens.push({ text: m[0], color: r.color });
      }
      let line: Run[] = [];
      let lw = 0;
      const noLead = '，。、；：？！）》」』,.;:?!)%';
      for (const t of tokens) {
        const tw = this.measureRaw(t.text);
        const isSpace = /^\s+$/.test(t.text);
        if (lw + tw > wrap && lw > 0 && !isSpace && !(noLead.includes(t.text[0]) && t.text.length === 1)) {
          // drop a trailing space before breaking
          if (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
          lines.push(line);
          line = [];
          lw = 0;
        }
        if (isSpace && lw === 0) continue;
        line.push(t);
        lw += tw;
      }
      lines.push(line);
    }
    return lines;
  }

  /** wrapped lines as markup strings (wrap in logical px on the UI layer) */
  wrapLines(text: string, wrapLogical: number): string[] {
    const f = this.route(text);
    if (f) return f.wrapLines(text, wrapLogical);
    return this.layout(text, wrapLogical / textScale.k).map((l) => l.map((r) => (r.color ? `{${r.color}:${r.text}}` : r.text)).join(''));
  }

  /** Render text block to a cached canvas (all units font px) */
  private renderBlock(text: string, o: TextOpts, wrapRaw: number | undefined): Block {
    const key = `${text}\u0001${o.color}\u0001${o.shadow}\u0001${o.outline}\u0001${wrapRaw}\u0001${o.align}\u0001${o.lineH}`;
    const hit = this.cache.get(key);
    if (hit) {
      // refresh LRU
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const lines = this.layout(text, wrapRaw);
    const lh = o.lineH ?? this.lineH;
    const widths = lines.map((l) => l.reduce((s, r) => s + this.measureRaw(r.text), 0));
    const maxW = Math.max(1, ...widths);
    const pad = 2;
    // the last line's glyph cell may reach below the line box (descenders)
    const W = maxW + pad * 2, H = (lines.length - 1) * lh + Math.max(lh, this.cellH - 1) + pad * 2 + 1;
    const [cv, ctx] = makeCanvas(W, H);
    const [tmp, tctx] = makeCanvas(W, H);
    const baseColor = col(o.color ?? 'K10');
    lines.forEach((line, li) => {
      let x = pad;
      if (o.align === 'center') x = pad + Math.floor((maxW - widths[li]) / 2);
      else if (o.align === 'right') x = pad + (maxW - widths[li]);
      const y = pad + li * lh;
      for (const r of line) {
        const color = r.color ? col(r.color) : baseColor;
        for (const ch of r.text) {
          const g = this.glyph(ch);
          tctx.drawImage(this.tinted(ch, g, color), x - 1, y - 1);
          x += g.adv;
        }
      }
    });
    if (o.outline) {
      const oc = this.silhouette(tmp, col(o.outline));
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.drawImage(oc, dx, dy);
    } else if (o.shadow !== false) {
      const sc = this.silhouette(tmp, col(o.shadow ?? 'K0'));
      ctx.drawImage(sc, 0, 1);
    }
    ctx.drawImage(tmp, 0, 0);
    const b: Block = { c: cv, w: maxW, lines: lines.length };
    this.cache.set(key, b);
    if (this.cache.size > 900) {
      const first = this.cache.keys().next().value!;
      this.cache.delete(first);
    }
    return b;
  }

  private tintCache = new Map<string, HTMLCanvasElement>();
  private tinted(ch: string, g: Glyph, color: string) {
    const k = ch + color;
    let c = this.tintCache.get(k);
    if (!c) {
      const [cv, ctx] = makeCanvas(g.c.width, g.c.height);
      ctx.drawImage(g.c, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, cv.width, cv.height);
      c = cv;
      this.tintCache.set(k, c);
      if (this.tintCache.size > 6000) this.tintCache.clear();
    }
    return c;
  }
  private silhouette(src: HTMLCanvasElement, color: string) {
    const [cv, ctx] = makeCanvas(src.width, src.height);
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  /** Draw text. Returns the block's [width, height] in the context's logical units. */
  draw(ctx: Ctx, text: string, x: number, y: number, o: TextOpts = {}): [number, number] {
    if (!text) return [0, 0];
    const f = this.route(text);
    if (f) return f.draw(ctx, text, x, y, o);
    const s = ctxScale(ctx);
    const mag = Math.max(1, Math.round(o.scale ?? 1));
    // device px per font px, and logical px per font px
    const m = (s === 1 ? 1 : textMul(s)) * mag;
    const k = m / s;
    const wrapRaw = o.wrap ? Math.max(1, Math.floor(o.wrap / k)) : undefined;
    const blk = this.renderBlock(text, o, wrapRaw);
    const c = blk.c;
    const pad = 2;
    const innerW = blk.w, innerH = blk.lines * (o.lineH ?? this.lineH);
    const prevA = ctx.globalAlpha;
    if (o.alpha !== undefined && o.alpha < 1) {
      if (o.alpha <= 0) return [innerW * k, innerH * k];
      ctx.globalAlpha = prevA * o.alpha;
    }
    if (s === 1 && mag === 1) {
      let dx = Math.round(x) - pad;
      if (o.align === 'center') dx = Math.round(x - innerW / 2) - pad;
      else if (o.align === 'right') dx = Math.round(x - innerW) - pad;
      let dy = Math.round(y) - pad;
      if (o.valign === 'middle') dy = Math.round(y - innerH / 2) - pad;
      else if (o.valign === 'bottom') dy = Math.round(y - innerH) - pad;
      ctx.drawImage(c, dx, dy);
    } else {
      // device-space blit at an integer multiple, snapped to the device pixel grid
      const t = ctx.getTransform();
      let X = t.e + t.a * x, Y = t.f + t.d * y;
      const dW = innerW * m, dH = innerH * m;
      if (o.align === 'center') X -= dW / 2;
      else if (o.align === 'right') X -= dW;
      if (o.valign === 'middle') Y -= dH / 2;
      else if (o.valign === 'bottom') Y -= dH;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(c, Math.round(X) - pad * m, Math.round(Y) - pad * m, c.width * m, c.height * m);
      ctx.restore();
    }
    ctx.globalAlpha = prevA;
    return [innerW * k, innerH * k];
  }

  /** measure a wrapped block in logical px (wrap in logical px) */
  blockSize(text: string, wrap?: number, lineH?: number): [number, number] {
    const f = this.route(text);
    if (f) return f.blockSize(text, wrap, lineH);
    const k = textScale.k;
    const lines = this.layout(text, wrap ? Math.floor(wrap / k) : undefined);
    const w = Math.max(0, ...lines.map((l) => l.reduce((s, r) => s + this.measureRaw(r.text), 0)));
    return [w * k, lines.length * (lineH ?? this.lineH) * k];
  }
}

export function parseRuns(text: string): Run[] {
  const runs: Run[] = [];
  const re = /\{(\w+):([^{}]*)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), color: null });
    runs.push({ text: m[2], color: COLOR_TAGS[m[1]] ?? m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), color: null });
  return runs;
}

export function stripMarkup(text: string) {
  return text.replace(/\{(\w+):([^{}]*)\}/g, '$2');
}

/** Chunky custom digit font (5x7, and 3x5 for tiny corner badges) for numbers and counters. */
const DIGITS_BIG: Record<string, string[]> = {
  '0': ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
  '1': ['..##.', '.###.', '..##.', '..##.', '..##.', '..##.', '.####'],
  '2': ['.###.', '##.##', '...##', '..##.', '.##..', '##...', '#####'],
  '3': ['####.', '...##', '...##', '.###.', '...##', '...##', '####.'],
  '4': ['...##', '..###', '.#.##', '#..##', '#####', '...##', '...##'],
  '5': ['#####', '##...', '####.', '...##', '...##', '##.##', '.###.'],
  '6': ['.###.', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
  '7': ['#####', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
  '8': ['.###.', '##.##', '##.##', '.###.', '##.##', '##.##', '.###.'],
  '9': ['.###.', '##.##', '##.##', '.####', '...##', '...##', '.###.'],
  '!': ['##', '##', '##', '##', '##', '..', '##'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '/': ['...##', '...##', '..##.', '..##.', '.##..', '##...', '##...'],
  'x': ['.....', '.....', '##.##', '.###.', '.###.', '##.##', '.....'],
  '%': ['##..#', '##.##', '...#.', '..##.', '.#...', '##.##', '#..##'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  ':': ['..', '##', '##', '..', '##', '##', '..'],
  's': ['....', '....', '.###', '##..', '.##.', '..##', '###.'],
  ' ': ['..', '..', '..', '..', '..', '..', '..'],
};
const DIGITS_SMALL: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '##.'],
  '/': ['..#', '..#', '.#.', '#..', '#..'], 'x': ['...', '#.#', '.#.', '#.#', '...'],
  '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'], '.': ['...', '...', '...', '...', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'], 's': ['...', '.##', '##.', '.##', '##.'],
};

export class DigitFont {
  private cache = new Map<string, HTMLCanvasElement>();
  constructor(private big: boolean) {}
  render(str: string, fill: string, outline: string, hi?: string): HTMLCanvasElement {
    const key = str + fill + outline + (hi ?? '');
    let c = this.cache.get(key);
    if (c) return c;
    const set = this.big ? DIGITS_BIG : DIGITS_SMALL;
    const gh = this.big ? 7 : 5;
    const chars = [...str].map((ch) => set[ch] ?? set['0']);
    const gap = 1;
    const w = chars.reduce((s, g) => s + g[0].length + gap, 0) - gap + 2;
    const h = gh + 2;
    const [cv, ctx] = makeCanvas(w, h);
    const id = ctx.createImageData(w, h);
    const px = (x: number, y: number, hex: string) => {
      const n = parseInt(hex.slice(1), 16), i = (y * w + x) * 4;
      id.data[i] = (n >> 16) & 255; id.data[i + 1] = (n >> 8) & 255; id.data[i + 2] = n & 255; id.data[i + 3] = 255;
    };
    const on = new Uint8Array(w * h);
    let ox = 1;
    for (const g of chars) {
      for (let y = 0; y < gh; y++) for (let x = 0; x < g[y].length; x++) if (g[y][x] === '#') on[(y + 1) * w + ox + x] = 1;
      ox += g[0].length + gap;
    }
    const fc = col(fill), oc = col(outline), hc = hi ? col(hi) : fc;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (on[y * w + x]) px(x, y, y <= 2 ? hc : fc);
        else {
          let n = false;
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && on[yy * w + xx]) { n = true; break; }
          }
          if (n) px(x, y, oc);
        }
      }
    ctx.putImageData(id, 0, 0);
    this.cache.set(key, cv);
    if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value!);
    return cv;
  }

  /** logical width of a rendered string on the UI layer */
  measure(str: string): number { return this.render(str, 'K10', 'K0').width * textScale.k; }

  /**
   * Draw a number. On the UI layer it is blitted at the integer text multiple and snapped to
   * the device grid. Returns its logical width.
   */
  draw(ctx: Ctx, str: string, x: number, y: number, o: { fill?: string; outline?: string; hi?: string; align?: 'left' | 'center' | 'right'; alpha?: number; pop?: number } = {}): number {
    const img = this.render(str, o.fill ?? 'K10', o.outline ?? 'K0', o.hi);
    const s = ctxScale(ctx);
    const pop = Math.max(1, Math.round(o.pop ?? 1));
    const m = (s === 1 ? 1 : textMul(s)) * pop;
    const prevA = ctx.globalAlpha;
    if (o.alpha !== undefined) ctx.globalAlpha = prevA * Math.max(0, Math.min(1, o.alpha));
    const t = ctx.getTransform();
    let X = t.e + t.a * x;
    const W = img.width * m;
    if (o.align === 'center') X -= W / 2;
    else if (o.align === 'right') X -= W;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(X), Math.round(t.f + t.d * y), W, img.height * m);
    ctx.restore();
    ctx.globalAlpha = prevA;
    return W / t.a;
  }
}
