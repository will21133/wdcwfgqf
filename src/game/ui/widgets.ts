// UI toolkit (PLAN2 §1.1 / §1.2b): panels, device-aware button prompts with hand-drawn pad /
// keyboard / mouse icons, bars, tag chips, tooltips, stamps and term labels.
// Everything is built from palette fillRects at logical (640×360) pixels, so it snaps to the
// device grid on the high-resolution UI layer.
import { G } from '../G';
import { tr, L, L10n } from '../i18n';
import { keyLabel, Action } from '../../engine/input';
import { rect, panel } from './draw';
import { Text, TextSize, ColorKey } from './text';
import { artMul } from '../../engine/gfx/font';
import { term } from '../strings';
import { Terms } from '../meta/registry';

// ───────────────────────── tiny bitmap helper ─────────────────────────
export function drawBits(ctx: CanvasRenderingContext2D, rows: readonly string[], x: number, y: number, c: string) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    let i = 0;
    while (i < r.length) {
      if (r[i] === '.' || r[i] === ' ') { i++; continue; }
      let n = 1;
      while (i + n < r.length && r[i + n] !== '.' && r[i + n] !== ' ') n++;
      rect(ctx, x + i, y + j, n, 1, c);
      i += n;
    }
  }
}

/** all prompt icons are this tall (keycaps, pad buttons, mouse) */
export const PROMPT_H = 13;

// 5×7 bold letters for the face buttons, 3×5 letters for bumpers / sticks
const BIG: Record<string, string[]> = {
  A: ['.###.', '##.##', '##.##', '#####', '##.##', '##.##', '##.##'],
  B: ['####.', '##.##', '##.##', '####.', '##.##', '##.##', '####.'],
  X: ['#...#', '##.##', '.###.', '..#..', '.###.', '##.##', '#...#'],
  Y: ['#...#', '##.##', '.###.', '..#..', '..#..', '..#..', '..#..'],
};
const SMALL3: Record<string, string[]> = {
  L: ['#..', '#..', '#..', '#..', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
};
const DISC = [
  '....#####....',
  '..#########..',
  '.###########.',
  '.###########.',
  '#############',
  '#############',
  '#############',
  '#############',
  '#############',
  '.###########.',
  '.###########.',
  '..#########..',
  '....#####....',
];
const DISC_RIM = [
  '....#####....',
  '..##.....##..',
  '.#.........#.',
  '.#.........#.',
  '#...........#',
  '#...........#',
  '#...........#',
  '#...........#',
  '#...........#',
  '.#.........#.',
  '.#.........#.',
  '..##.....##..',
  '....#####....',
];
/** highlight arc on the upper half of a disc (inside the rim) */
const DISC_HI = [
  '.............',
  '....#####....',
  '..##.....##..',
  '..#.......#..',
];

export type PadGlyph = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'LS' | 'RS' | 'MENU' | 'VIEW' | 'DPAD';
const FACE_COLOR: Record<string, string> = { A: 'G4', B: 'R4', X: 'U4', Y: 'B5' };

/** width of a pad glyph */
export function padGlyphW(g: PadGlyph): number {
  return g === 'LB' || g === 'RB' ? 19 : g === 'LT' || g === 'RT' ? 15 : 13;
}

/** Hand-drawn Xbox-style button, top-left at (x, y), 13 px tall. Returns its width. */
export function drawPadGlyph(ctx: CanvasRenderingContext2D, g: PadGlyph, x: number, y: number): number {
  x = Math.round(x); y = Math.round(y);
  const w = padGlyphW(g);
  if (g === 'A' || g === 'B' || g === 'X' || g === 'Y') {
    drawBits(ctx, DISC, x, y, 'K3');
    drawBits(ctx, DISC_RIM, x, y, 'K0');
    drawBits(ctx, DISC_HI, x, y, 'K5');
    drawBits(ctx, BIG[g], x + 4, y + 4, 'K0');
    drawBits(ctx, BIG[g], x + 4, y + 3, FACE_COLOR[g]);
    return w;
  }
  if (g === 'MENU' || g === 'VIEW' || g === 'LS' || g === 'RS') {
    drawBits(ctx, DISC, x, y, 'K3');
    drawBits(ctx, DISC_RIM, x, y, 'K0');
    drawBits(ctx, DISC_HI, x, y, 'K5');
    if (g === 'MENU') { for (const j of [4, 6, 8]) rect(ctx, x + 4, y + j, 5, 1, 'K9'); }
    else if (g === 'VIEW') {
      // two overlapping windows
      drawBits(ctx, ['####.', '#..#.', '#.####', '###..#', '..#..#', '..####'], x + 3, y + 3, 'K9');
    } else {
      // thumbstick: inner ring + letter
      drawBits(ctx, ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'], x + 3, y + 3, 'K6');
      drawBits(ctx, SMALL3[g[0]], x + 5, y + 4, 'K10');
    }
    return w;
  }
  if (g === 'DPAD') {
    const cross = ['....#####....', '....#...#....', '....#...#....', '....#...#....', '#####...#####', '#...........#', '#...........#', '#...........#', '#####...#####', '....#...#....', '....#...#....', '....#...#....', '....#####....'];
    const fill = ['.............', '.....###.....', '.....###.....', '.....###.....', '.....###.....', '.###########.', '.###########.', '.###########.', '.....###.....', '.....###.....', '.....###.....', '.....###.....', '.............'];
    drawBits(ctx, fill, x, y, 'K3');
    drawBits(ctx, cross, x, y, 'K0');
    // arrow nubs
    rect(ctx, x + 6, y + 2, 1, 1, 'K9'); rect(ctx, x + 6, y + 10, 1, 1, 'K9');
    rect(ctx, x + 2, y + 6, 1, 1, 'K9'); rect(ctx, x + 10, y + 6, 1, 1, 'K9');
    rect(ctx, x + 5, y + 5, 3, 3, 'K2');
    return w;
  }
  // shoulders: bumpers are wide tabs, triggers are tall rounded paddles
  const bumper = g === 'LB' || g === 'RB';
  if (bumper) {
    rect(ctx, x + 2, y + 1, w - 4, 1, 'K0');
    rect(ctx, x + 1, y + 2, w - 2, 10, 'K0');
    rect(ctx, x + 2, y + 12, w - 4, 1, 'K0');
    rect(ctx, x + 2, y + 2, w - 4, 10, 'K2');
    rect(ctx, x + 3, y + 2, w - 6, 1, 'K4');
  } else {
    rect(ctx, x + 3, y, w - 6, 1, 'K0');
    rect(ctx, x + 1, y + 1, w - 2, 1, 'K0');
    rect(ctx, x, y + 2, w, 10, 'K0');
    rect(ctx, x + 1, y + 12, w - 2, 1, 'K0');
    rect(ctx, x + 3, y + 1, w - 6, 1, 'K2');
    rect(ctx, x + 1, y + 2, w - 2, 10, 'K2');
    rect(ctx, x + 3, y + 1, w - 6, 1, 'K4');
  }
  const a = SMALL3[g[0]], b = SMALL3[g[1]];
  const lx = x + Math.floor((w - 7) / 2);
  drawBits(ctx, a, lx, y + 4, 'K10');
  drawBits(ctx, b, lx + 4, y + 4, 'K10');
  return w;
}

/** keyboard keycap with a label (FP10), 13 px tall. Returns its width. */
export function keycapW(label: string): number {
  if (label === 'LMB' || label === 'RMB' || label === 'MMB') return 9;
  if (label === '↕↔') return 27;
  return Math.max(13, Math.ceil(G.small.measure(label)) + 8);
}

export function drawKeycap(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): number {
  x = Math.round(x); y = Math.round(y);
  if (label === 'LMB' || label === 'RMB' || label === 'MMB') return drawMouse(ctx, label, x, y);
  const w = keycapW(label);
  rect(ctx, x + 1, y, w - 2, 1, 'K0');
  rect(ctx, x, y + 1, 1, 11, 'K0');
  rect(ctx, x + w - 1, y + 1, 1, 11, 'K0');
  rect(ctx, x + 1, y + 12, w - 2, 1, 'K0');
  rect(ctx, x + 1, y + 1, w - 2, 1, 'K6');
  rect(ctx, x + 1, y + 2, w - 2, 8, 'K4');
  rect(ctx, x + 1, y + 10, w - 2, 2, 'K2');
  if (label === '↕↔') {
    // four arrows: ◂ ▴ ▾ ▸
    const c = 'K10';
    drawBits(ctx, ['..#', '.##', '###', '.##', '..#'], x + 3, y + 3, c);
    drawBits(ctx, ['..#..', '.###.', '#####'], x + 8, y + 2, c);
    drawBits(ctx, ['#####', '.###.', '..#..'], x + 14, y + 6, c);
    drawBits(ctx, ['#..', '##.', '###', '##.', '#..'], x + 21, y + 3, c);
    return w;
  }
  G.small.draw(ctx, label, x + w / 2, y - 2, { align: 'center', color: 'K10', shadow: false });
  return w;
}

function drawMouse(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): number {
  const outline = ['..###..', '.#.#.#.', '#..#..#', '#..#..#', '#######', '#.....#', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..'];
  const body = ['.......', '..#.#..', '.##.##.', '.##.##.', '.......', '.#####.', '.#####.', '.#####.', '.#####.', '..###..', '.......'];
  drawBits(ctx, body, x + 1, y + 1, 'K8');
  drawBits(ctx, outline, x + 1, y + 1, 'K0');
  rect(ctx, x + 2, y + 9, 5, 1, 'K9');
  if (label === 'LMB') drawBits(ctx, ['.#', '##', '##'], x + 2, y + 2, 'B5');
  else if (label === 'RMB') drawBits(ctx, ['#.', '##', '##'], x + 5, y + 2, 'B5');
  else rect(ctx, x + 4, y + 2, 1, 3, 'B5');
  return 9;
}

// ───────────────────────── prompts ─────────────────────────
/** anything that knows which device a player last used (F2's PlayerInput satisfies this) */
export interface PromptDevice { lastDevice?: string }

const PAD_FOR: Partial<Record<Action | 'nav', PadGlyph>> = {
  confirm: 'A', dash: 'A', cancel: 'B', interact: 'B', attack: 'X', special: 'Y', rewind: 'RB',
  pause: 'MENU', info: 'VIEW', nav: 'DPAD', up: 'DPAD', down: 'DPAD', left: 'DPAD', right: 'DPAD',
};

const usesPad = (who?: PromptDevice | null) => (who?.lastDevice ?? G.input.lastDevice) === 'pad';

function keyFor(a: Action | 'nav'): string {
  return a === 'nav' ? '↕↔' : keyLabel(G.input.bindings[a][0]);
}

/** width a prompt icon will take */
export function promptW(a: Action | 'nav', who?: PromptDevice | null): number {
  return usesPad(who) ? padGlyphW(PAD_FOR[a] ?? 'A') : keycapW(keyFor(a));
}

/** Device-aware button icon, top-left at (x, y), 13 px tall. Returns its width. */
export function drawPrompt(ctx: CanvasRenderingContext2D, action: Action | 'nav', x: number, y: number, who?: PromptDevice | null): number {
  if (usesPad(who)) return drawPadGlyph(ctx, PAD_FOR[action] ?? 'A', x, y);
  return drawKeycap(ctx, keyFor(action), x, y);
}

/**
 * World interaction prompt: [button] text on an 85% K0 plate, centred on cx with its top at y.
 * Returns the plate width. Meant for the UI layer (r.worldUi / r.label), so it is never blurred.
 */
export function drawPromptLabel(ctx: CanvasRenderingContext2D, action: Action | 'nav' | null, text: string, cx: number, y: number, o: { color?: ColorKey; who?: PromptDevice | null; plate?: boolean } = {}): number {
  const iw = action ? promptW(action, o.who) : 0;
  const tw = Math.ceil(Text.measure(text, 'body').w);
  const total = iw + (iw && tw ? 4 : 0) + tw;
  const x0 = Math.round(cx - total / 2);
  y = Math.round(y);
  if (o.plate !== false) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.85;
    rect(ctx, x0 - 4, y - 2, total + 8, PROMPT_H + 4, 'K0');
    ctx.globalAlpha = a;
  }
  if (action) drawPrompt(ctx, action, x0, y, o.who);
  if (tw) Text.draw(ctx, text, x0 + iw + (iw ? 4 : 0), y - 2, { color: o.color ?? 'K10' });
  return total + 8;
}

/**
 * Free-floating pixel art (logos, big portraits) at a whole number of device pixels per art pixel,
 * centred on (cx, cy). Use it where the art does not have to fit a frame exactly; framed icons keep
 * plain drawImage (snapped to the exact layout scale).
 */
export function drawPixelArt(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, cx: number, cy: number, k = 1) {
  const t = ctx.getTransform();
  const s = t.a;
  const m = (Math.abs(s - 1) < 1e-4 ? 1 : artMul(s)) * k;
  const W = img.width * m, H = img.height * m;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(t.e + s * cx - W / 2), Math.round(t.f + t.d * cy - H / 2), W, H);
  ctx.restore();
}

// ───────────────────────── panels ─────────────────────────
export const SLOT_COLOR: ColorKey[] = ['R3', 'B5', 'G3', 'U4'];

export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, style: 'brass' | 'dark' | 'paper' | 'slot' = 'brass', slot = 0) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (style === 'brass') { panel(ctx, x, y, w, h); return; }
  if (style === 'paper') {
    rect(ctx, x + 1, y, w - 2, h, 'K0'); rect(ctx, x, y + 1, w, h - 2, 'K0');
    rect(ctx, x + 1, y + 1, w - 2, h - 2, 'S3');
    rect(ctx, x + 2, y + 2, w - 4, h - 4, 'S4');
    rect(ctx, x + 2, y + h - 3, w - 4, 1, 'S2');
    return;
  }
  const rim = style === 'slot' ? SLOT_COLOR[((slot % 4) + 4) % 4] : 'K4';
  rect(ctx, x + 1, y, w - 2, h, 'K0'); rect(ctx, x, y + 1, w, h - 2, 'K0');
  rect(ctx, x + 1, y + 1, w - 2, h - 2, rim);
  rect(ctx, x + 2, y + 2, w - 4, h - 4, 'K1');
  rect(ctx, x + 2, y + 2, w - 4, 1, 'K2');
}

/** segmented bar: segments stack left → right; 'hatch' = diagonal stripes, 'lock' = notched */
export function drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, max: number, segs: { v: number; color: ColorKey; pattern?: 'solid' | 'hatch' | 'lock' }[]) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x - 1, y - 1, w + 2, h + 2, 'K0');
  rect(ctx, x, y, w, h, 'K2');
  let cx = 0;
  for (const s of segs) {
    if (s.v <= 0 || max <= 0) continue;
    const sw = Math.min(w - cx, Math.round((w * s.v) / max));
    if (sw <= 0) continue;
    const sx = x + cx;
    if (s.pattern === 'hatch') {
      for (let i = 0; i < sw; i++) for (let j = 0; j < h; j++) if (((i + j) & 3) < 2) rect(ctx, sx + i, y + j, 1, 1, s.color);
    } else {
      rect(ctx, sx, y, sw, h, s.color);
      if (h > 3) rect(ctx, sx, y, sw, 1, 'K10');
      if (s.pattern === 'lock') for (let i = 2; i < sw; i += 4) rect(ctx, sx + i, y + 1, 1, h - 1, 'K0');
    }
    cx += sw;
  }
}

// ───────────────────────── tags ─────────────────────────
export type TagId = 'burn' | 'rust' | 'res' | 'stasis' | 'gear' | 'echo' | 'paradox' | 'rewind' | 'dash' | 'crit' | 'tempo' | 'bond' | 'heal';
export const TAG_COLOR: Record<TagId, ColorKey> = {
  burn: 'O3', rust: 'T4', res: 'U4', stasis: 'V4', gear: 'G4', echo: 'C3', heal: 'G3',
  paradox: 'C4', rewind: 'C2', dash: 'K9', crit: 'R3', tempo: 'B5', bond: 'R4',
};
export const TAG_NAME: Record<TagId, L10n> = {
  burn: L('灼烧', 'Burn'), rust: L('锈蚀', 'Rust'), res: L('共鸣', 'Resonance'), stasis: L('定格', 'Stasis'),
  gear: L('机巧', 'Gear'), echo: L('残响', 'Echo'), heal: L('治疗', 'Heal'), paradox: L('悖论', 'Paradox'),
  rewind: L('回溯', 'Rewind'), dash: L('闪避', 'Dash'), crit: L('暴击', 'Crit'), tempo: L('节拍', 'Tempo'), bond: L('协作', 'Bond'),
};
/** 7×7 tag icons */
export const TAG_ICON: Record<TagId, string[]> = {
  burn: ['...#...', '..##...', '..###..', '.####..', '.##.##.', '##..##.', '.#####.'],
  rust: ['.#.#.#.', '#######', '.#.#.#.', '.......', '..#..#.', '..#....', '.....#.'],
  res: ['...#...', '..###..', '.#####.', '.#####.', '#######', '...#...', '..###..'],
  stasis: ['...#...', '..###..', '.##.##.', '##...##', '.##.##.', '..###..', '...#...'],
  gear: ['.#.#.#.', '#######', '.##.##.', '###.###', '.##.##.', '#######', '.#.#.#.'],
  echo: ['..###..', '.#...#.', '#..#..#', '#.#.#.#', '#..#..#', '.#...#.', '..###..'],
  paradox: ['.##.##.', '#..#..#', '#..#..#', '.##.##.', '#..#..#', '#..#..#', '.##.##.'],
  rewind: ['..####.', '.#....#', '#.....#', '###...#', '.#....#', '.....#.', '..###..'],
  dash: ['#..#...', '.#..#..', '..#..#.', '...#..#', '..#..#.', '.#..#..', '#..#...'],
  crit: ['...#...', '#..#..#', '.#####.', '###.###', '.#####.', '#..#..#', '...#...'],
  tempo: ['...###.', '...#.#.', '...#.#.', '...#.#.', '.###.#.', '####...', '.##....'],
  bond: ['.###...', '#...#..', '#..###.', '#.#.#.#', '.###..#', '..#...#', '...###.'],
  heal: ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
};

/** 13 px tall chip: icon + FP10 name in the tag colour on a dark plate. Returns its width. */
export function drawTagChip(ctx: CanvasRenderingContext2D, tag: TagId, x: number, y: number): number {
  x = Math.round(x); y = Math.round(y);
  const name = tr(TAG_NAME[tag]);
  const tw = Math.ceil(Text.measure(name, 'small').w);
  const w = tw + 15;
  const c = TAG_COLOR[tag];
  rect(ctx, x + 1, y, w - 2, 13, 'K0'); rect(ctx, x, y + 1, w, 11, 'K0');
  rect(ctx, x + 1, y + 1, w - 2, 11, 'K1');
  rect(ctx, x + 1, y + 1, 1, 11, c);
  drawBits(ctx, TAG_ICON[tag], x + 4, y + 3, c);
  Text.draw(ctx, name, x + 12, y - 2, { size: 'small', color: c, shadow: false });
  return w;
}

// ───────────────────────── tooltip & stamp ─────────────────────────
export function drawTooltip(ctx: CanvasRenderingContext2D, x: number, y: number, title: L10n, lines: L10n[]) {
  const maxW = 200;
  const tW = Text.measure(title, 'body').w;
  const ls = lines.map((l) => Text.measureWrapped(l, 'small', maxW));
  const w = Math.ceil(Math.min(maxW, Math.max(tW, ...ls.map((m) => m.w)))) + 14;
  const h = Math.ceil(Text.lineH('body') + ls.reduce((s, m) => s + m.h, 0)) + 10;
  x = Math.round(Math.max(4, Math.min(636 - w, x)));
  y = Math.round(Math.max(4, Math.min(356 - h, y)));
  drawPanel(ctx, x, y, w, h, 'dark');
  Text.draw(ctx, title, x + 7, y + 2, { color: 'K10' });
  let yy = y + 2 + Text.lineH('body');
  lines.forEach((l, i) => { Text.draw(ctx, l, x + 7, yy, { size: 'small', color: 'K8', maxW }); yy += ls[i].h; });
}

/** "TICK!" / "PERFECT" style stamp that slams in, holds and fades. t = seconds since it appeared. */
export function drawStamp(ctx: CanvasRenderingContext2D, text: L10n, x: number, y: number, color: ColorKey, t: number) {
  if (t < 0 || t > 1.2) return;
  const big = t < 0.07;
  const a = t > 0.9 ? 1 - (t - 0.9) / 0.3 : 1;
  const size: TextSize = big ? 'title' : 'body';
  const s = tr(text);
  const m = Text.measure(s, size);
  const w = Math.ceil(m.w) + 10, h = Math.ceil(m.h) + 4;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.max(0, a);
  const x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
  rect(ctx, x0, y0, w, h, 'K0');
  rect(ctx, x0 + 1, y0 + 1, w - 2, h - 2, color);
  rect(ctx, x0 + 2, y0 + 2, w - 4, h - 4, 'K0');
  Text.draw(ctx, s, x, y0 + 1 - (big ? 4 : 1), { size, color, align: 'center', shadow: false });
  ctx.globalAlpha = prev;
}

// ───────────────────────── term labels (GDD2 §9.8) ─────────────────────────
export interface TermLabelOpts {
  size?: TextSize; color?: ColorKey; align?: 'left' | 'center' | 'right';
  /** true: always show the plain line · false: never · omitted: registry Terms.showPlain(id) */
  forcePlain?: boolean;
  /** 'below' (default): plain line under the name · 'inline': "name  plain" on one line */
  layout?: 'below' | 'inline';
}

/**
 * Stylised name, with its plain-language line (small, K7) while the player is still learning it.
 * Does not count a sighting: call Terms.seen(id) once when the screen showing it opens.
 */
export function drawTermLabel(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, o: TermLabelOpts = {}): { w: number; h: number } {
  const t = term(id);
  const size = o.size ?? 'body';
  const name = t ? t.name : L(id, id);
  const color = o.color ?? 'K10';
  const plain = t && (o.forcePlain ?? Terms.showPlain(id)) ? t.plain : null;
  if (!plain) return Text.draw(ctx, name, x, y, { size, color, align: o.align });
  if (o.layout === 'inline') {
    const nw = Text.measure(name, size).w, pw = Text.measure(plain, 'small').w, gap = 14;
    const total = nw + gap + pw;
    const x0 = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    const a = Text.draw(ctx, name, x0, y, { size, color });
    const lh = Text.lineH(size), sh = Text.lineH('small');
    // a short dash between name and meaning: "回忆 – 本局强化 · 死后消失"
    rect(ctx, Math.round(x0 + nw + 4), Math.round(y + lh / 2), 6, 1, 'K6');
    Text.draw(ctx, plain, x0 + nw + gap, y + Math.round((lh - sh) / 2) + 1, { size: 'small', color: 'K7' });
    return { w: total, h: a.h };
  }
  const a = Text.draw(ctx, name, x, y, { size, color, align: o.align });
  const b = Text.draw(ctx, plain, x, y + Text.lineH(size), { size: 'small', color: 'K7', align: o.align });
  return { w: Math.max(a.w, b.w), h: Text.lineH(size) + b.h };
}
