// LoopPlayer (ONBOARD2 §7.3): a small keyframe stage — the rewind guide's six loops, the Hall's
// curtain and lesson board — drawn with the game's own sprites and drawing code (the Tick's frames,
// drawEchoFrame from echo.ts, drawShadowOutline from rewindHud.ts, the cogling, the dummy, the 5×7
// digits, drawStamp, bigPrompt), so the page looks exactly like the game. No combat code runs.
//
// Two passes so it stays crisp at any size: the stage's pixel art (184×72, feet line y 56) is drawn
// into one shared off-screen canvas and blitted at an integer 1× or 2× with smoothing off; the
// words, digits, stamps and button icons are queued during the same pass and drawn afterwards on
// the UI layer at their scaled positions (CJK only in 'small' or larger; tiny digits are fine).
import type { Action } from '../../engine/input';
import type { PromptDevice } from '../ui/widgets';
import type { L10n } from '../i18n';
import type { Sprite } from '../../engine/gfx/sprite';
import { G } from '../G';
import { tr } from '../i18n';
import { makeCanvas } from '../../engine/gfx/canvas';
import { drawSprite } from '../../engine/gfx/sprite';
import { col } from '../../art/palette';
import { Text, type ColorKey } from '../ui/text';
import { rect } from '../ui/draw';
import { drawStamp } from '../ui/widgets';
import { tickFramesFor } from '../entities/player';
import { handDef } from '../progression/hands';
import { drawEchoFrame } from '../entities/echo';
import { drawShadowOutline } from '../ui/rewindHud';
import { buildCogling } from '../../art/sprites/gearworks';
import { dummySprite, bellJar, jarShards, jarBase, smallGear, brassCoin, drawCheck, type DummyPose } from '../../art/sprites/hall';
import { bigPrompt, type TokenAction } from './rich';

export const STAGE_W = 184, STAGE_H = 72, FEET = 56;

export interface LoopKey { a: TokenAction; word: L10n }
export interface LoopDef {
  id: string;
  /** the loop's name (zoom view title, Hall board) */
  name: L10n;
  /** seconds per cycle */
  period: number;
  caption: L10n;
  sub: L10n;
  /** the buttons it uses, each with its word (轻按 / 按住 / 分岔) */
  keys: LoopKey[];
  /** Teach id that makes it "learned" (the guide's "not yet" ribbon) and the Hall lesson it opens */
  teach: string;
  lesson: string;
  /** draw one moment (t in 0..period) */
  draw(L: LoopCtx, t: number): void;
}

type UiOp =
  | { k: 'num'; x: number; y: number; s: string; fill: string; outline: string; align: 'left' | 'center' | 'right'; a: number }
  | { k: 'text'; x: number; y: number; s: L10n | string; color: ColorKey; align: 'left' | 'center' | 'right'; a: number; size: 'small' | 'body' | 'title' }
  | { k: 'glyph'; x: number; y: number; a: TokenAction; state: 'up' | 'down' | 'hold'; fill: number; alpha: number }
  | { k: 'stamp'; x: number; y: number; s: L10n; color: ColorKey; t: number }
  | { k: 'check'; x: number; y: number; a: number };

let FR: ReturnType<typeof tickFramesFor> | null = null;
let COG: ReturnType<typeof buildCogling> | null = null;
const frames = () => (FR ??= tickFramesFor(0, handDef('tick')));
const cog = () => (COG ??= buildCogling());

/** what a loop's draw() paints with (stage coordinates, feet line y = 56) */
export class LoopCtx {
  /** the off-screen stage */
  c!: CanvasRenderingContext2D;
  ops: UiOp[] = [];
  /** the whole loop's alpha (fade in / out) */
  alpha = 1;
  who: PromptDevice | null = null;

  // ── the stage's own art ──
  /** the Tick: face right / left, pose idle / run / hurt / dash; flash = white (a hit) */
  tick(x: number, y: number, o: { face?: 'l' | 'r'; pose?: 'idle' | 'run' | 'hurt' | 'dash'; t?: number; alpha?: number; flash?: boolean } = {}) {
    drawSprite(this.c, this.tickSprite(o.pose ?? 'idle', o.t ?? 0), x, y, { flip: o.face === 'l', alpha: o.alpha ?? 1, tint: o.flash ? '#ffffff' : undefined });
  }
  tickSprite(pose: 'idle' | 'run' | 'hurt' | 'dash', t: number): Sprite {
    const F = frames();
    if (pose === 'run') return F.run.side[Math.floor(t * 12) % 6];
    if (pose === 'hurt') return F.hurt.side;
    if (pose === 'dash') return F.dash.side;
    return F.idle.side[Math.floor(t * 4) % 4];
  }
  /** the hand as its echo (cyan body, dashed rim until armed, a spinning ◆ once armed) */
  echo(x: number, y: number, o: { face?: 'l' | 'r'; pose?: 'idle' | 'run'; t?: number; alpha?: number; armed?: boolean; diamondT?: number } = {}) {
    drawEchoFrame(this.c, this.tickSprite(o.pose ?? 'idle', o.t ?? 0), x, y, (o.alpha ?? 0.8), 'R3', { flip: o.face === 'l', armed: o.armed, diamondT: o.armed ? o.diamondT ?? 0 : undefined });
  }
  /** the Shadow: the hollow dashed C3 outline (with its ground ring) */
  shadow(x: number, y: number, o: { face?: 'l' | 'r'; alpha?: number; t?: number } = {}) {
    drawShadowOutline(this.c, this.tickSprite('idle', o.t ?? 0), x, y, 'C3', { flip: o.face === 'l', alpha: o.alpha ?? 1 });
  }
  /** a bright scrub preview of the hand (cyan silhouette) */
  preview(x: number, y: number, o: { face?: 'l' | 'r'; alpha?: number } = {}) {
    drawSprite(this.c, this.tickSprite('idle', 0), x, y, { flip: o.face === 'l', alpha: (o.alpha ?? 1) * 0.6, tint: col('C3') });
  }
  /** a cogling rolling (its eye on the hand) */
  cog(x: number, y: number, o: { spin?: number; alpha?: number; flash?: boolean; look?: number } = {}) {
    const A = cog();
    const f = A.roll[Math.floor(o.spin ?? 0) % 4];
    const c = this.c;
    c.fillStyle = col('K3');
    c.fillRect(Math.round(x) - 4, Math.round(y) - 2, 2, 2); c.fillRect(Math.round(x) + 2, Math.round(y) - 2, 2, 2);
    drawSprite(c, f, x, y - 2, { alpha: o.alpha ?? 1, tint: o.flash ? '#ffffff' : undefined });
    drawSprite(c, A.eye, x, y - 9, { alpha: o.alpha ?? 1 });
    drawSprite(c, A.pupil, x + Math.round(o.look ?? -1), y - 8, { alpha: o.alpha ?? 1 });
  }
  dummy(x: number, y: number, pose: DummyPose = 'idle', o: { alpha?: number; flash?: boolean; flip?: boolean } = {}) {
    drawSprite(this.c, dummySprite(pose), x, y, { alpha: o.alpha ?? 1, tint: o.flash ? '#ffffff' : undefined, flip: o.flip });
  }
  jar(x: number, y: number, alpha = 1) { drawSprite(this.c, bellJar(), x, y, { alpha }); }
  jarBase(x: number, y: number) { drawSprite(this.c, jarBase(), x, y); }
  /** glass shards and a coin flying out (k 0..1 since the break) */
  shatter(x: number, y: number, k: number, coin = false) {
    const S = jarShards();
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * (0.15 + (i / 6) * 0.7);
      const d = 4 + k * (14 + (i % 3) * 5);
      const yy = y - 8 + Math.sin(a) * d + k * k * 22;
      if (yy > y + 2) continue;
      drawSprite(this.c, S[i % 3], x + Math.cos(a) * d, yy, { alpha: 1 - k * 0.6 });
    }
    if (coin) drawSprite(this.c, brassCoin(), x + k * 10, y - 6 - Math.sin(k * Math.PI) * 14);
  }
  gear(x: number, y: number, t: number) { drawSprite(this.c, smallGear()[Math.floor(t * 12) % 4], x, y); }
  /** an ellipse on the floor (shadows, rings) */
  ellipse(x: number, y: number, rx: number, ry: number, color: string, alpha: number, filled = false) {
    const c = this.c;
    c.globalAlpha = alpha * this.alpha;
    c.strokeStyle = c.fillStyle = col(color);
    c.lineWidth = 1;
    c.beginPath(); c.ellipse(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
    if (filled) c.fill(); else c.stroke();
    c.globalAlpha = 1;
  }
  /** a dotted circle (paradox preview: C2 dashed) */
  dotted(x: number, y: number, r: number, color: string, alpha = 1) {
    const c = this.c;
    c.fillStyle = col(color);
    c.globalAlpha = alpha;
    const n = Math.max(12, Math.round(r * 1.6));
    for (let i = 0; i < n; i += 1) { if (i % 3 === 2) continue; const a = (i / n) * Math.PI * 2; c.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.55), 1, 1); }
    c.globalAlpha = 1;
  }
  line(x0: number, y0: number, x1: number, y1: number, color: string, alpha = 1, dash = 0) {
    const c = this.c;
    c.fillStyle = col(color);
    c.globalAlpha = alpha;
    const d = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
    for (let k = 0; k <= d; k++) { if (dash && Math.floor(k / dash) % 2) continue; c.fillRect(Math.round(x0 + ((x1 - x0) * k) / d), Math.round(y0 + ((y1 - y0) * k) / d), 1, 1); }
    c.globalAlpha = 1;
  }
  /** a blade's arc in front of a hand (the weapon's swing), k 0..1 */
  slash(x: number, y: number, face: 'l' | 'r', k: number, color = 'K10') {
    if (k < 0 || k > 1) return;
    const c = this.c;
    const dir = face === 'l' ? -1 : 1;
    c.globalAlpha = 1 - k;
    c.fillStyle = col(color);
    for (let i = 0; i < 9; i++) {
      const a = -1.1 + (i / 8) * 2.2 * Math.min(1, k * 3);
      const r = 11 + (i % 2);
      c.fillRect(Math.round(x + dir * Math.cos(a) * r), Math.round(y - 9 + Math.sin(a) * r), 2, 1);
    }
    c.globalAlpha = 1;
  }
  /** the dummy's red warning fan (a windup) */
  fan(x: number, y: number, face: 'l' | 'r', k: number) {
    const c = this.c;
    c.fillStyle = col('R3');
    c.globalAlpha = 0.25 + 0.35 * k;
    const dir = face === 'l' ? -1 : 1;
    for (let r = 8; r < 8 + 26 * k; r += 3) for (let a = -0.45; a <= 0.45; a += 0.12) c.fillRect(Math.round(x + dir * Math.cos(a) * r), Math.round(y - 6 + Math.sin(a) * r * 0.6), 1, 1);
    c.globalAlpha = 1;
  }
  /** a ring of light (landing, blast) */
  ring(x: number, y: number, r: number, color: string, alpha = 1, thick = 1) {
    const c = this.c;
    c.globalAlpha = alpha;
    c.strokeStyle = col(color);
    c.lineWidth = thick;
    c.beginPath(); c.arc(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.max(0.5, r), 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  }
  /** the 12-tick landing clock ring (shrinking) */
  clockRing(x: number, y: number, r: number, alpha = 1) {
    const c = this.c;
    c.fillStyle = col('C4');
    c.globalAlpha = alpha;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * 0.6), 1, 1); }
    c.globalAlpha = 1;
  }
  /** the mini HP bar: red = now, cyan stripes = a rewind gives back */
  hp(x: number, y: number, w: number, h: number, hp: number, stripe: number, max = 50) {
    rect(this.c, x - 1, y - 1, w + 2, h + 2, 'K0');
    rect(this.c, x, y, w, h, 'K2');
    const rw = Math.round((w * hp) / max), sw = Math.round((w * stripe) / max);
    rect(this.c, x, y, rw, h, 'R3');
    rect(this.c, x, y, rw, 1, 'R4');
    for (let i = 0; i < sw; i++) for (let j = 0; j < h; j++) if (((i + j) & 3) < 2) rect(this.c, x + rw + i, y + j, 1, 1, 'C3');
  }
  /** the mini tape: cyan cells filled to `fill` (0..1), red notches at fractions, a cursor (or −1) */
  tape(x: number, y: number, w: number, h: number, fill: number, notches: number[], cursor = -1, cutFrom = -1) {
    rect(this.c, x - 1, y - 1, w + 2, h + 2, 'K0');
    rect(this.c, x, y, w, h, 'K2');
    const fw = Math.round(w * Math.max(0, Math.min(1, fill)));
    rect(this.c, x, y, fw, h, 'C1');
    rect(this.c, x, y, fw, 1, 'C2');
    if (cutFrom >= 0) { const cx = Math.round(x + w * cutFrom); rect(this.c, cx, y, x + fw - cx, h, 'C3'); }
    for (const n of notches) if (n >= 0 && n <= 1) rect(this.c, Math.round(x + w * n), y - 2, 1, h + 3, 'R3');
    if (cursor >= 0) { const cx = Math.round(x + w * cursor); rect(this.c, cx - 1, y - 2, 3, h + 4, 'K0'); rect(this.c, cx, y - 1, 1, h + 2, 'C4'); }
  }
  /** a little clock-face mark on the floor (where a Fork was pressed) */
  mark(x: number, y: number, alpha = 1) {
    this.ellipse(x, y, 5, 2.5, 'C3', alpha);
    this.c.globalAlpha = alpha;
    rect(this.c, Math.round(x), Math.round(y) - 1, 1, 2, 'C4');
    this.c.globalAlpha = 1;
  }
  hourglass(x: number, y: number, full: boolean) {
    // 7×9: a brass frame, cyan sand while full
    const c = this.c;
    rect(c, x, y, 7, 1, 'B4'); rect(c, x, y + 8, 7, 1, 'B4');
    for (const [j, w] of [[1, 5], [2, 3], [3, 1], [4, 1], [5, 3], [6, 5], [7, 5]] as const) { rect(c, x + (7 - w) / 2 - 1, y + j, w + 2, 1, 'K0'); rect(c, x + (7 - w) / 2, y + j, w, 1, j < 4 ? (full ? 'C3' : 'K1') : full ? 'K1' : 'C2'); }
  }

  // ── queued for the UI pass (crisp at any zoom) ──
  num(x: number, y: number, s: string, fill = 'K10', o: { outline?: string; align?: 'left' | 'center' | 'right'; alpha?: number } = {}) {
    this.ops.push({ k: 'num', x, y, s, fill, outline: o.outline ?? 'K0', align: o.align ?? 'center', a: o.alpha ?? 1 });
  }
  /** a rising damage number (k 0..1 of its 0.6 s) */
  rise(x: number, y: number, s: string, fill: string, k: number, outline = 'K0') {
    if (k < 0 || k > 1) return;
    this.num(x, y - 26 - k * 10, s, fill, { outline, alpha: k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1 });
  }
  text(x: number, y: number, s: L10n | string, color: ColorKey = 'K9', o: { align?: 'left' | 'center' | 'right'; alpha?: number; size?: 'small' | 'body' | 'title' } = {}) {
    this.ops.push({ k: 'text', x, y, s, color, align: o.align ?? 'center', a: o.alpha ?? 1, size: o.size ?? 'small' });
  }
  glyph(a: TokenAction, x: number, y: number, state: 'up' | 'down' | 'hold' = 'up', fill = 0, alpha = 1) { this.ops.push({ k: 'glyph', x, y, a, state, fill, alpha }); }
  stamp(s: L10n, x: number, y: number, t: number, color: ColorKey = 'C4') { this.ops.push({ k: 'stamp', x, y, s, color, t }); }
  check(x: number, y: number, a = 1) { this.ops.push({ k: 'check', x, y, a }); }
}

let OFF: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;
const L = new LoopCtx();

/** linear interpolation through keyframes [t, x, y] (held before the first and after the last) */
export function track(keys: [number, number, number][], t: number): { x: number; y: number; moving: boolean; face: 'l' | 'r' } {
  if (t <= keys[0][0]) return { x: keys[0][1], y: keys[0][2], moving: false, face: 'r' };
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1, y1] = keys[i], [t0, x0, y0] = keys[i - 1];
    if (t <= t1) {
      const k = (t - t0) / Math.max(1e-6, t1 - t0);
      const moving = Math.hypot(x1 - x0, y1 - y0) > 0.5;
      return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, moving, face: x1 < x0 - 0.5 ? 'l' : 'r' };
    }
  }
  const last = keys[keys.length - 1];
  return { x: last[1], y: last[2], moving: false, face: 'r' };
}

export const LoopPlayer = {
  /**
   * draw `def` at loop time `t` with the stage's top-left at (x, y) on the UI layer, at 1× or 2×.
   * who: whose buttons the icons show; bg: false = no floor (the Hall curtain shows through)
   */
  draw(ctx: CanvasRenderingContext2D, def: LoopDef, t: number, x: number, y: number, o: { scale: 1 | 2; who?: PromptDevice | null; bg?: boolean; alpha?: number } = { scale: 1 }) {
    if (!OFF) OFF = makeCanvas(STAGE_W, STAGE_H);
    const [cv, c] = OFF;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, STAGE_W, STAGE_H);
    c.imageSmoothingEnabled = false;
    const tt = ((t % def.period) + def.period) % def.period;
    // a soft fade at the loop's seam (0.2 s in, 0.4 s out)
    const fade = Math.min(1, tt / 0.2, (def.period - tt) / 0.4);
    if (o.bg !== false) {
      rect(c, 0, 0, STAGE_W, STAGE_H, 'K1');
      // three rows of floor tiles under the feet line
      for (let r = 0; r < 3; r++) for (let i = -1; i < STAGE_W / 16 + 1; i++) {
        const tx = i * 16 + (r % 2) * 8, ty = 40 + r * 11;
        rect(c, tx, ty, 15, 10, r === 1 ? 'K2' : 'K2');
        rect(c, tx, ty, 15, 1, 'K3');
      }
      rect(c, 0, 38, STAGE_W, 2, 'K0');
    }
    L.c = c; L.ops = []; L.alpha = 1; L.who = o.who ?? null;
    c.globalAlpha = 1;
    def.draw(L, tt);
    c.globalAlpha = 1;
    const s = o.scale, A = (o.alpha ?? 1) * Math.max(0, fade);
    const a0 = ctx.globalAlpha;
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (o.bg !== false) { ctx.globalAlpha = a0 * (o.alpha ?? 1); rect(ctx, x, y, STAGE_W * s, STAGE_H * s, 'K1'); }
    ctx.globalAlpha = a0 * A;
    ctx.drawImage(cv, Math.round(x), Math.round(y), STAGE_W * s, STAGE_H * s);
    ctx.imageSmoothingEnabled = sm;
    // the UI pass
    for (const op of L.ops) {
      const ux = x + op.x * s, uy = y + op.y * s;
      if (op.k === 'num') { ctx.globalAlpha = a0 * A * op.a; G.digits.draw(ctx, op.s, Math.round(ux), Math.round(uy - 3.5 * Text.k), { fill: op.fill, outline: op.outline, align: op.align }); }
      else if (op.k === 'text') { ctx.globalAlpha = a0 * A * op.a; Text.draw(ctx, typeof op.s === 'string' ? op.s : tr(op.s), ux, uy - Text.lineH(op.size) / 2, { size: op.size, color: op.color, align: op.align, outline: 'K0' }); }
      else if (op.k === 'glyph') { ctx.globalAlpha = a0 * A * op.alpha; bigPrompt(ctx, op.a, ux, uy, L.who, op.state, op.fill); }
      else if (op.k === 'stamp') { ctx.globalAlpha = a0 * A; drawStamp(ctx, op.s, ux, uy, op.color, op.t); }
      else if (op.k === 'check') { ctx.globalAlpha = a0 * A * op.a; drawCheck(ctx, ux, uy, col('G4')); }
    }
    ctx.globalAlpha = a0;
  },
};
