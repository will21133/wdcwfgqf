// Rich text with button tokens (ONBOARD2 §1.7): "刚挨打？按 {@rewind} 撤销" draws the rewind button
// of whoever the line is for — [Q] with keyboard + mouse, [L] for a keyboard-only player who rewinds
// with L, LB on a pad — between the words. Text colour markup ({c:…} {g:…} {r:…} {v:…} or a palette
// key) works as in the Text API; tokens use the '{@' prefix so they never clash with it.
//
//   Rich.draw(ctx, s, x, y, o)            draw (wraps at o.maxW; returns the block size)
//   Rich.measure(s, size, who)            one line, no wrapping
//   Rich.measureWrapped(s, size, maxW, who)
//   Rich.fill(s, vars)                    "{n}" / "{cost}" placeholders → values
//   Rich.plain(s, who)                    tokens as their key labels ("[Q]") — tests, logs
//   bigPrompt(ctx, action, cx, cy, who, state, fill)   a 2× button (demo bubbles, cards)
//
// Tokens: {@rewind} {@fork} {@attack} {@dash} {@special} {@interact} {@confirm} {@cancel} {@info}
// {@pause} {@tabL} {@tabR} {@move} ({@move}: W A S D, or the arrow keys if the player moves with
// them; LS on a pad). Unknown tokens stay as written. A token sits centred on the letters
// (y + Text.inkMid(size) − its height / 2) with 2 px either side.
import type { Action } from '../../engine/input';
import { keyLabel, padLayout } from '../../engine/input';
import { G } from '../G';
import { tr, type L10n } from '../i18n';
import { Text, type ColorKey, type TextSize } from '../ui/text';
import { rect } from '../ui/draw';
import { drawPrompt, promptW, promptH, drawKeycap, keycapW, drawPadGlyph, padGlyphW, type PromptDevice } from '../ui/widgets';
import { makeCanvas } from '../../engine/gfx/canvas';
import { textScale } from '../../engine/gfx/font';
import { col } from '../../art/palette';

export type RichSize = Exclude<TextSize, 'tiny'>;
export type TokenAction = Action | 'move';
export const TOKENS: readonly TokenAction[] = ['rewind', 'fork', 'attack', 'dash', 'special', 'interact', 'confirm', 'cancel', 'info', 'pause', 'tabL', 'tabR', 'move'];
const TOKEN_SET = new Set<string>(TOKENS);

export interface RichOpts {
  size?: RichSize;
  color?: ColorKey;
  align?: 'left' | 'center' | 'right';
  /** whose buttons the tokens show (a PlayerInput; default: the menu aggregate G.input) */
  who?: PromptDevice | null;
  /** wrap width (logical px); lines break between words / CJK characters, never inside a token */
  maxW?: number;
  alpha?: number;
  outline?: ColorKey | false;
  /** 2 = tokens drawn twice as large (card titles, ONBOARD2 §4.3) */
  glyph?: 1 | 2;
  /** seconds since a token's action was pressed (−1 = up): a pressed token sinks 1 px and rings (ONBOARD2 §1.7) */
  pressAge?: (a: TokenAction) => number;
  /** 'middle': y is the centre of the first line's letters (as Text valign 'middle') */
  valign?: 'top' | 'middle';
}

interface Atom { text: string; tag: string | null; key: TokenAction | null; w: number; space: boolean }
interface Line { atoms: Atom[]; w: number }
export interface RichLayout { lines: Line[]; w: number; h: number; lineH: number }

const RE = /\{@(\w+)\}|\{(\w+):([^{}]*)\}/g;
const ATOM_RE = /([　-鿿＀-￯])|(\s+)|([^\s　-鿿＀-￯]+)/g;
const NO_LEAD = '，。、；：？！）》」』,.;:?!)%·';

/** WASD / arrows / LS for {@move} */
function moveGlyph(who: PromptDevice | null | undefined): { pad: boolean; label: string } {
  const fam = who?.lastDevice ?? G.input.lastDevice;
  if (fam === 'pad') return { pad: true, label: 'LS' };
  const colFn = (who as { moveColumn?: () => 0 | 1 } | null | undefined)?.moveColumn;
  return { pad: false, label: colFn && colFn.call(who) === 1 ? '↕↔' : 'WASD' };
}
function tokenW1(a: TokenAction, who: PromptDevice | null | undefined): number {
  if (a !== 'move') return promptW(a, who);
  const m = moveGlyph(who);
  return m.pad ? padGlyphW('LS') : keycapW(m.label);
}
function drawToken1(ctx: CanvasRenderingContext2D, a: TokenAction, x: number, y: number, who: PromptDevice | null | undefined): number {
  if (a !== 'move') return drawPrompt(ctx, a, x, y, who);
  const m = moveGlyph(who);
  if (m.pad) return drawPadGlyph(ctx, 'LS', x, y + Math.round((promptH() - 13) / 2));
  return drawKeycap(ctx, m.label, x, y);
}
const PAD_LABEL: Partial<Record<Action, string>> = { confirm: 'A', dash: 'A', cancel: 'B', interact: 'B', attack: 'X', special: 'Y', rewind: 'LB', fork: 'RB', tabL: 'LB', tabR: 'RB', pause: 'MENU', info: 'VIEW' };
/** the label a token shows (tests: "[Q]", "[LB]", "[WASD]") */
export function tokenLabel(a: TokenAction, who?: PromptDevice | null): string {
  const fam = who?.lastDevice ?? G.input.lastDevice;
  if (a === 'move') return moveGlyph(who).label;
  if (fam === 'pad') {
    // the bumper swap follows the controls setting, exactly as the drawn glyph does (widgets.padFor)
    if (padLayout.swapBumpers && (a === 'rewind' || a === 'fork')) return a === 'rewind' ? 'RB' : 'LB';
    return PAD_LABEL[a] ?? 'A';
  }
  const table = who?.bindings ?? G.input.bindings;
  return keyLabel(who?.lastCodeFor?.(a) ?? table[a]?.[0] ?? '');
}

const cache = new Map<string, RichLayout>();
function layoutKey(s: string, size: RichSize, maxW: number, glyph: number, who: PromptDevice | null | undefined): string {
  // token widths depend on the device family and the key each token shows
  let sig = '';
  if (s.includes('{@')) { RE.lastIndex = 0; let m: RegExpExecArray | null; while ((m = RE.exec(s))) if (m[1] && TOKEN_SET.has(m[1])) sig += tokenW1(m[1] as TokenAction, who) + ','; }
  return `${s}\u0001${size}\u0001${maxW}\u0001${glyph}\u0001${textScale.k}\u0001${sig}`;
}

function atomize(s: string, size: RichSize, who: PromptDevice | null | undefined, glyph: number): Atom[] {
  const out: Atom[] = [];
  const pushText = (text: string, tag: string | null) => {
    if (text.includes('\n')) {
      // an explicit line break: its own atom (layout starts a new line there)
      text.split('\n').forEach((part, i) => { if (i) out.push({ text: '\n', tag: null, key: null, w: 0, space: false }); if (part) pushText(part, tag); });
      return;
    }
    // a short highlighted CJK keyword ({c:旧影}) stays on one line
    if (tag && /^[一-鿿]{2,4}$/.test(text)) { out.push({ text, tag, key: null, w: Text.measure(text, size).w, space: false }); return; }
    ATOM_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ATOM_RE.exec(text))) out.push({ text: m[0], tag, key: null, w: Text.measure(m[0], size).w, space: !!m[2] });
  };
  RE.lastIndex = 0;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(s))) {
    if (m.index > last) pushText(s.slice(last, m.index), null);
    if (m[1] !== undefined) {
      if (TOKEN_SET.has(m[1])) { const a = m[1] as TokenAction; out.push({ text: '', tag: null, key: a, w: tokenW1(a, who) * glyph + 4, space: false }); }
      else pushText(m[0], null);
    } else pushText(m[3], m[2]);
    last = m.index + m[0].length;
  }
  if (last < s.length) pushText(s.slice(last), null);
  return out;
}

function layout(s: string, o: RichOpts): RichLayout {
  const size = o.size ?? 'body', glyph = o.glyph ?? 1, maxW = o.maxW ?? 0;
  const key = layoutKey(s, size, maxW, glyph, o.who);
  const hit = cache.get(key);
  if (hit) return hit;
  const atoms = atomize(s, size, o.who, glyph);
  const lines: Line[] = [];
  let line: Atom[] = [], lw = 0;
  for (const a of atoms) {
    if (a.text === '\n') { lines.push({ atoms: line, w: lw }); line = []; lw = 0; continue; }
    const lead = !a.key && a.text.length === 1 && NO_LEAD.includes(a.text);
    if (maxW > 0 && lw + a.w > maxW && lw > 0 && !a.space && !lead) {
      while (line.length && line[line.length - 1].space) { lw -= line[line.length - 1].w; line.pop(); }
      lines.push({ atoms: line, w: lw });
      line = []; lw = 0;
    }
    if (a.space && lw === 0) continue;
    line.push(a);
    lw += a.w;
  }
  lines.push({ atoms: line, w: lw });
  const tokenH = promptH() * glyph + 2;
  const lineH = Math.max(Math.ceil(Text.lineH(size)), s.includes('{@') ? tokenH : 0);
  const out: RichLayout = { lines, w: Math.ceil(Math.max(0, ...lines.map((l) => l.w))), h: lineH * lines.length, lineH };
  if (cache.size > 400) cache.clear();
  cache.set(key, out);
  return out;
}

export const Rich = {
  /** split / measure a rich string (cached per string, size, width, text scale and device) */
  layout(s: string | L10n, o: RichOpts = {}): RichLayout { return layout(typeof s === 'string' ? s : tr(s), o); },
  measure(s: string | L10n, size: RichSize = 'body', who?: PromptDevice | null, glyph: 1 | 2 = 1): { w: number; h: number } {
    const L = layout(typeof s === 'string' ? s : tr(s), { size, who, glyph });
    return { w: L.w, h: L.h };
  },
  measureWrapped(s: string | L10n, size: RichSize, maxW: number, who?: PromptDevice | null, glyph: 1 | 2 = 1): { w: number; h: number } {
    const L = layout(typeof s === 'string' ? s : tr(s), { size, who, maxW, glyph });
    return { w: L.w, h: L.h };
  },
  /** replace {name} placeholders (not tokens or colour markup) */
  fill(s: string, vars?: Record<string, string | number> | null): string {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  },
  /** the string with tokens written as [KEY] and colour markup stripped (tests, __tut.caption) */
  plain(s: string | L10n, who?: PromptDevice | null): string {
    const t = typeof s === 'string' ? s : tr(s);
    return t.replace(RE, (m, a, _tag, inner) => (a !== undefined ? (TOKEN_SET.has(a) ? `[${tokenLabel(a as TokenAction, who)}]` : m) : inner));
  },
  /** draw at (x, y) (top of the first line, or its letters' centre with valign 'middle'); returns the block size */
  draw(ctx: CanvasRenderingContext2D, s: string | L10n, x: number, y: number, o: RichOpts = {}): { w: number; h: number } {
    const str = typeof s === 'string' ? s : tr(s);
    if (!str) return { w: 0, h: 0 };
    const size = o.size ?? 'body', glyph = o.glyph ?? 1;
    const L = layout(str, o);
    const color = o.color ?? 'K10';
    const a0 = ctx.globalAlpha;
    if (o.alpha !== undefined) ctx.globalAlpha = a0 * Math.max(0, Math.min(1, o.alpha));
    let ly = o.valign === 'middle' ? y - L.lineH / 2 : y;
    const textDy = Math.round((L.lineH - Math.ceil(Text.lineH(size))) / 2);
    for (const line of L.lines) {
      let lx = o.align === 'center' ? x - line.w / 2 : o.align === 'right' ? x - line.w : x;
      lx = Math.round(lx);
      let i = 0;
      while (i < line.atoms.length) {
        const at = line.atoms[i];
        if (at.key) {
          const tw = tokenW1(at.key, o.who) * glyph;
          const th = promptH() * glyph;
          const age = o.pressAge ? o.pressAge(at.key) : -1;
          const down = age >= 0;
          const ty = Math.round(ly + textDy + Text.inkMid(size) - th / 2) + (down ? 1 : 0);
          if (glyph === 2) bigPrompt(ctx, at.key, lx + 2 + tw / 2, ty + th / 2, o.who, down ? 'down' : 'up', 0);
          else drawToken1(ctx, at.key, lx + 2, ty, o.who);
          if (down && age < 0.25) pressRing(ctx, lx + 2, ty, tw, th, age / 0.25);
          lx += at.w;
          i++;
          continue;
        }
        // merge the run of text atoms that share a colour into one draw
        let txt = '', w = 0;
        const tag = at.tag;
        while (i < line.atoms.length && !line.atoms[i].key && line.atoms[i].tag === tag) { txt += line.atoms[i].text; w += line.atoms[i].w; i++; }
        Text.draw(ctx, tag ? `{${tag}:${txt}}` : txt, lx, ly + textDy, { size, color, outline: o.outline ?? false });
        lx += w;
      }
      ly += L.lineH;
    }
    ctx.globalAlpha = a0;
    return { w: L.w, h: L.h };
  },
};

/** the C3 rounded frame a pressed token throws out (k 0 → 1 over 0.25 s) */
function pressRing(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number) {
  const g = 1 + Math.round(3 * k);
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * (1 - k);
  const x0 = x - g, y0 = y - g, x1 = x + w + g, y1 = y + h + g;
  rect(ctx, x0 + 1, y0, x1 - x0 - 2, 1, 'C3');
  rect(ctx, x0 + 1, y1 - 1, x1 - x0 - 2, 1, 'C3');
  rect(ctx, x0, y0 + 1, 1, y1 - y0 - 2, 'C3');
  rect(ctx, x1 - 1, y0 + 1, 1, y1 - y0 - 2, 'C3');
  ctx.globalAlpha = a0;
}

// ───────────────────────── bigPrompt ─────────────────────────
/** 1× button images, cached per action, device family, key label and text scale */
const bigCache = new Map<string, HTMLCanvasElement>();
/**
 * A button icon at twice its size, as chunky pixels (ONBOARD2 §1.7): the 1× icon is drawn once into
 * a small canvas and blitted at an integer 2× with smoothing off. 'down' sinks it 2 px under a 30%
 * shade; 'hold' rings it with a C3 progress arc (fill 0..1). Centred on (cx, cy); returns its size.
 */
export function bigPrompt(ctx: CanvasRenderingContext2D, action: TokenAction, cx: number, cy: number, who: PromptDevice | null | undefined, state: 'up' | 'down' | 'hold' = 'up', fill = 0): { w: number; h: number } {
  const fam = who?.lastDevice ?? G.input.lastDevice;
  const w1 = tokenW1(action, who), h1 = promptH();
  const key = `${action}|${fam}|${tokenLabel(action, who)}|${w1}|${h1}`;
  let img = bigCache.get(key);
  if (!img) {
    const [c, cctx] = makeCanvas(w1, h1);
    drawToken1(cctx, action, 0, 0, who);
    img = c;
    if (bigCache.size > 64) bigCache.clear();
    bigCache.set(key, img);
  }
  const w = w1 * 2, h = h1 * 2;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2) + (state === 'down' ? 2 : 0);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x0, y0, w, h);
  ctx.imageSmoothingEnabled = smooth;
  if (state === 'down') {
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * 0.3;
    rect(ctx, x0, y0, w, h, 'K0');
    ctx.globalAlpha = a0;
  }
  if (state === 'hold' && fill > 0) {
    // a ring of dots round the button, lit clockwise from the top
    const r = Math.max(w, h) / 2 + 4, n = 28, lit = Math.round(Math.max(0, Math.min(1, fill)) * n);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      ctx.fillStyle = col(i < lit ? 'C3' : 'K3');
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * (h / w + 0.5) / 1.5), 1, 1);
    }
  }
  return { w, h };
}
