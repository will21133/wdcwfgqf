// Pixel-perfect text: glyphs from the Fusion Pixel webfont are rasterised once,
// alpha-thresholded to 1-bit, and cached. Rendered strings are cached too.
// Supports inline colour markup:  "造成 {g:12} 点伤害"  →  12 in gold.

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

export interface TextOpts {
  color?: string;
  align?: 'left' | 'center' | 'right';
  shadow?: string | false;
  outline?: string | false;
  wrap?: number;
  lineH?: number;
  alpha?: number;
  /** vertical alignment of the block relative to y */
  valign?: 'top' | 'middle' | 'bottom';
}

interface Run { text: string; color: string | null }

export class PixelFont {
  private glyphs = new Map<string, Glyph>();
  private cache = new Map<string, HTMLCanvasElement>();
  private gctx: Ctx;
  private gcan: HTMLCanvasElement;
  readonly ascent: number;
  readonly lineH: number;

  constructor(public family: string, public size: number, lineH?: number) {
    [this.gcan, this.gctx] = makeCanvas(size * 3, size * 3);
    this.gctx.font = `${size}px "${family}"`;
    const m = this.gctx.measureText('国Ag');
    this.ascent = Math.round(m.fontBoundingBoxAscent || size * 0.85);
    this.lineH = lineH ?? size + 3;
  }

  glyph(ch: string): Glyph {
    let g = this.glyphs.get(ch);
    if (g) return g;
    const ctx = this.gctx, S = this.size * 3;
    ctx.clearRect(0, 0, S, S);
    ctx.font = `${this.size}px "${this.family}"`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(ch, 1, this.ascent + 1);
    const adv = Math.max(1, Math.round(ctx.measureText(ch).width));
    const w = adv + 2, h = this.size + 3;
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

  /** Width of plain text (markup stripped) */
  measure(text: string): number {
    let w = 0;
    for (const r of parseRuns(text)) for (const ch of r.text) w += this.glyph(ch).adv;
    return w;
  }

  /** Lay out text into lines of runs, with CJK-aware wrapping */
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
        const tw = this.measure(t.text);
        const isSpace = /^\s+$/.test(t.text);
        if (lw + tw > wrap && lw > 0 && !isSpace && !(noLead.includes(t.text[0]) && t.text.length === 1)) {
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

  /** Render text block to a cached canvas */
  private renderBlock(text: string, o: TextOpts): HTMLCanvasElement {
    const key = `${text}\u0001${o.color}\u0001${o.shadow}\u0001${o.outline}\u0001${o.wrap}\u0001${o.align}\u0001${o.lineH}`;
    let c = this.cache.get(key);
    if (c) {
      // refresh LRU
      this.cache.delete(key);
      this.cache.set(key, c);
      return c;
    }
    const lines = this.layout(text, o.wrap);
    const lh = o.lineH ?? this.lineH;
    const widths = lines.map((l) => l.reduce((s, r) => s + this.measure(r.text), 0));
    const maxW = Math.max(1, o.wrap && o.align !== 'left' ? Math.max(...widths) : Math.max(...widths));
    const pad = 2;
    const W = maxW + pad * 2, H = lines.length * lh + pad * 2 + 2;
    const [cv, ctx] = makeCanvas(W, H);
    // draw coloured glyphs
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
          tctx.globalCompositeOperation = 'source-over';
          // draw glyph into its own colour via a per-colour glyph cache
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
    this.cache.set(key, cv);
    if (this.cache.size > 900) {
      const first = this.cache.keys().next().value!;
      this.cache.delete(first);
    }
    return cv;
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

  /** Draw text. Returns the block's [width, height]. */
  draw(ctx: Ctx, text: string, x: number, y: number, o: TextOpts = {}): [number, number] {
    if (!text) return [0, 0];
    const c = this.renderBlock(text, o);
    const pad = 2;
    let dx = Math.round(x) - pad;
    const innerW = c.width - pad * 2;
    if (o.align === 'center') dx = Math.round(x - innerW / 2) - pad;
    else if (o.align === 'right') dx = Math.round(x - innerW) - pad;
    let dy = Math.round(y) - pad;
    const innerH = c.height - pad * 2 - 2;
    if (o.valign === 'middle') dy = Math.round(y - innerH / 2) - pad;
    else if (o.valign === 'bottom') dy = Math.round(y - innerH) - pad;
    if (o.alpha !== undefined && o.alpha < 1) {
      if (o.alpha <= 0) return [innerW, innerH];
      ctx.globalAlpha = o.alpha;
      ctx.drawImage(c, dx, dy);
      ctx.globalAlpha = 1;
    } else ctx.drawImage(c, dx, dy);
    return [innerW, innerH];
  }

  /** measure a wrapped block */
  blockSize(text: string, wrap?: number, lineH?: number): [number, number] {
    const lines = this.layout(text, wrap);
    const w = Math.max(0, ...lines.map((l) => l.reduce((s, r) => s + this.measure(r.text), 0)));
    return [w, lines.length * (lineH ?? this.lineH)];
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

/** Chunky custom digit font (5x7 / 3x5) for damage numbers and counters. */
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
  '!': ['.##.', '.##.', '.##.', '.##.', '.##.', '....', '.##.'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '####.', '.....', '.....', '.....'],
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
}
