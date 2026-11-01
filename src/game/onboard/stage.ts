// The Stage (ONBOARD2 §4): the one scheduler of teaching text on screen. Lesson steps, the coach,
// fail and success beats, Ines's prologue lines, co-op's shared plain lines and Caption.say all go
// through Stage.say; nothing teaching draws a box in the world.
//
//   · Docks only: the top rail (solo: right of the HUD term plates; co-op: the shared rail under the
//     purse), the bottom rail, a co-op seat's corner, the pod chip. One line per rail (solo: one in
//     total; co-op: one per seat + one shared), by tier S > A > B > C, first come first served; the
//     same key replaces.
//   · Never over the action: every frame the Stage lists what must stay clear (Stage.obstacles():
//     every hand + 8 px, echoes, the Shadow's labels, paradox previews, enemy warnings, an enemy
//     winding up + 48 px, bullets near a hand, stamps, the HUD, Ines's note, the Last Second panel,
//     the floor card, text already placed) and puts a line where it covers none of it — sticking to
//     its spot while that stays clear, moving at once when a hand walks under it. Nowhere free: a
//     critical line shrinks to a chip in the pod (the HUD is always drawable), others wait with
//     their timers paused. Stage.audit() counts frames where placed text met an obstacle (CI: 0).
//   · Spotlights: a thin dotted ring round what a line names (the Shadow, the stripes on the bar, the
//     tape, an echo's ◆ …) and a dashed leader to it — never a box in the world.
//   · Tier S on screen quiets the world term callouts and makes Stage.busy() true (Ines's notes wait).
//
// Interface day (F4a day 1): docks, obstacles, placement, audit, line / card / success / chip forms,
// spotlights and Caption.say forwarding work; the polish (card drop-in, stamp slam, model-strip
// light-up, seat badges, pressed-token sync with the demo puppet) lands with the lessons.
import type { Action } from '../../engine/input';
import type { Player } from '../entities/player';
import type { World } from '../world/world';
import type { Entity } from '../entities/entity';
import type { PromptDevice } from '../ui/widgets';
import { G } from '../G';
import { tr, type L10n } from '../i18n';
import { Text, type ColorKey } from '../ui/text';
import { rect } from '../ui/draw';
import { col } from '../../art/palette';
import { Hud } from '../ui/hud';
import { SLOT_COLOR } from '../ui/widgets';
import { Callouts, CaptionHooks, captionLayout, drawCaptionLine, Caption, type CaptionLine, type CaptionOpts } from '../ui/callouts';
import { RewindHudHooks, HudChain, type HudPart } from '../ui/rewindHud';
import { Hints, hintsHooks } from '../ui/hints';
import { Paradox } from '../systems/paradox';
import { Bullet } from '../entities/projectile';
import { Terms } from '../meta/registry';
import { term } from '../strings';
import { GameHooks } from '../hooks';
import { Rich } from './rich';
import { ModelStrip, modelStripSize } from './modelStrip';
import { Gates } from './gates';
import { Tut } from './core';

export type Tier = 'S' | 'A' | 'B' | 'C';
export type DockId = 'top' | 'bottom' | 'seat' | 'pod';
export interface Box { x0: number; y0: number; x1: number; y1: number }
/**
 * What a line points at: the hand's Shadow (r12), the +N over it, the cyan stripes on the bar, the
 * tape or its newest red notch, the Sand number, the hand's newest armed echo's ◆, the paradox
 * preview ring, or any entity (its box + 6 px).
 */
export type SpotRef = 'shadow' | 'shadowGain' | 'hpStripe' | 'tape' | 'tapeNotch' | 'sand' | 'armed' | 'preview' | Entity;

export interface SayOpts {
  /** a later say with the same key (on the same seat) replaces this one */
  key: string;
  /** may hold {@action} tokens, {name} placeholders (vars) and colour markup */
  text: L10n | string | (() => string);
  vars?: Record<string, string | number> | (() => Record<string, string | number>);
  tier: Tier;
  /** line (default) · card (big: title + sub + sub2 + timer) · success (stamp + why + strip) · chip (in the pod) */
  form?: 'card' | 'line' | 'success' | 'chip';
  /** co-op: this seat's corner; omitted = the solo rail / co-op's shared rail. Solo ignores it. */
  slot?: number;
  /** whose buttons the tokens show (default: the slot's PlayerInput) */
  who?: PromptDevice | null;
  /** card rows 2 and 3 */
  sub?: L10n; sub2?: L10n;
  /** success card: the stamp word, the "why" line, the model-strip cells to show lit */
  stamp?: L10n; why?: L10n; strip?: number;
  /** 0..1: the countdown bar under a card / line */
  timer?: () => number;
  /** seconds on screen (real time, paused while hidden or queued); default by length, 2.5–6 s */
  dur?: number;
  /** shown until this is true (and dur, if given, has not run out) */
  until?: () => boolean;
  spot?: SpotRef | SpotRef[];
  /** a small grey line under the text ("{@info} Watch again") */
  footer?: L10n;
  /** the demo puppet's buttons: a token whose action is in the set sinks and rings */
  pressed?: () => ReadonlySet<Action>;
  /** 'ines' (her portrait), 'sys' (ⓘ) or a slot number (its badge) in front of the line */
  speaker?: 'ines' | 'sys' | number;
  /** time-critical (the coach's D1, the Last Second note, a pull-back): nowhere free → a pod chip */
  critical?: boolean;
  /** text colour (line / chip; default K10) */
  color?: ColorKey;
  /** drop it unshown after waiting this long in the queue (s; default never) */
  maxWait?: number;
}
export interface SayHandle { close(): void; update(o: Partial<SayOpts>): void }
export interface StageCurrent { key: string; text: string; dock: DockId; rect: [number, number, number, number]; alpha: number; tier: string }
export interface StageAudit { frames: number; overlapFrames: number; worst: { key: string; with: string } | null }

const RANK: Record<Tier, number> = { S: 3, A: 2, B: 1, C: 0 };
/** fade in / out (s); a line with nowhere to go keeps its spot this long before it gives way (not for a hand) */
const FADE_IN = 0.12, FADE_OUT = 0.2, HYSTERESIS = 0.15;
const PADX = 8, PADY = 4, CARD_PADX = 10, CARD_PADY = 5, MAX_W = 360, SEAT_W = 220;
/** Ines's note card is about this tall above hintsHooks.bottom() */
const HINT_H = 100;

interface Entry {
  o: SayOpts;
  key: string;
  seq: number;
  /** seconds shown (counts only while placed and not paused) */
  t: number;
  waited: number;
  dur: number;
  /** > 0: fading out (s) */
  out: number;
  /** seconds since first placed (fade-in) */
  inT: number;
  memo: { idx: number; blockedT: number; since: number } | null;
  placed: { x: number; y: number; w: number; h: number; dock: DockId; alpha: number } | null;
  /** a Caption.say line (drawn exactly like the F3 rail) */
  legacy: CaptionLine | null;
  press: Map<string, number>;
  prevPressed: Set<string>;
  /** its first frame on screen was logged ('shown': __tut.wait('caption') resolves on it) */
  logged: boolean;
}

const entries: Entry[] = [];
let seq = 0;
/** frame audit (ONBOARD2 §4.10) */
const audit: StageAudit = { frames: 0, overlapFrames: 0, worst: null };
const updateHooks: ((dtReal: number) => void)[] = [];

// ───────────────────────── helpers ─────────────────────────
const hit = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const sceneOf = () => G.scenes.current as unknown as { world?: World; overlays?: { blocks: boolean }[]; titleCard?: { t: number } | null; hud?: { boss: unknown } } | null;
const worldOf = (): World | null => sceneOf()?.world ?? null;
function playerFor(w: World | null, slot: number | undefined): Player | null {
  if (!w) return null;
  return (slot !== undefined ? w.players.find((p) => p.slot === slot) : null) ?? w.player ?? null;
}
/** which rail an entry uses this frame: −1 = the solo / shared rail, n = co-op seat n */
const channelOf = (e: Entry) => (Hud.multi && e.o.slot !== undefined ? e.o.slot : -1);
function textOf(e: Entry): string {
  const t = e.o.text;
  const s = typeof t === 'function' ? t() : typeof t === 'string' ? t : tr(t);
  const v = typeof e.o.vars === 'function' ? e.o.vars() : e.o.vars;
  return Rich.fill(s, v ?? null);
}
function whoOf(e: Entry): PromptDevice | null {
  if (e.o.who !== undefined) return e.o.who;
  return playerFor(worldOf(), e.o.slot)?.input ?? null;
}
function defaultDur(o: SayOpts, text: string): number {
  if (o.dur !== undefined) return o.dur;
  if (o.until) return Infinity;
  const chars = Rich.plain(text).length + (o.sub ? tr(o.sub).length : 0) + (o.why ? tr(o.why).length : 0);
  return Math.max(2.5, Math.min(6, 1.2 + 0.09 * chars));
}
/** the line showing on each rail: highest tier, then the oldest */
function currents(): Map<number, Entry> {
  const m = new Map<number, Entry>();
  for (const e of entries) {
    if (e.out > 0) continue;
    const ch = channelOf(e);
    const c = m.get(ch);
    if (!c || RANK[e.o.tier] > RANK[c.o.tier] || (RANK[e.o.tier] === RANK[c.o.tier] && e.seq < c.seq)) m.set(ch, e);
  }
  return m;
}
function close(e: Entry) { if (e.out <= 0) e.out = 1e-4; }
function remove(e: Entry) { const i = entries.indexOf(e); if (i >= 0) entries.splice(i, 1); }

// ───────────────────────── obstacles (ONBOARD2 §4.4) ─────────────────────────
interface Obs { hard: Box[]; soft: Box[]; players: Box[]; why: string[] }
let obsCache: Obs | null = null, obsFrame = -1;
function buildObstacles(): Obs {
  if (obsCache && obsFrame === G.frame) return obsCache;
  const o: Obs = { hard: [], soft: [], players: [], why: [] };
  const H = (b: Box, why: string) => { o.hard.push(b); o.why.push(why); };
  const w = worldOf();
  const r = G.r;
  const cx = r ? r.camX : 0, cy = r ? r.camY : 0;
  const ui = (b: Box): Box => ({ x0: b.x0 - cx, y0: b.y0 - cy, x1: b.x1 - cx, y1: b.y1 - cy });
  if (w) {
    const c = Callouts.obstacles(w);
    for (const b of c.hard) H(ui(b), 'world');
    for (const b of c.players) o.players.push(ui(b));
    for (const b of c.soft) o.soft.push(ui(b));
    for (const b of c.ui) H(b, 'plates');
    for (const b of c.placed) o.soft.push(b);
    // an enemy winding up: its box + 48 px (the hit is about to land there)
    for (const e of w.enemies) {
      if (e.dead || !(e as unknown as { wind?: unknown }).wind) continue;
      H(ui({ x0: e.x - e.r - 48, y0: e.y - e.height - 48, x1: e.x + e.r + 48, y1: e.y + 48 }), 'windup');
    }
    // enemy bullets near a hand are hard, the rest soft
    for (const b of w.entities) {
      if (!(b instanceof Bullet) || b.dead || b.team !== 'enemy') continue;
      const box = ui({ x0: b.x - 6, y0: b.y - 10, x1: b.x + 6, y1: b.y + 6 });
      const near = w.players.some((p) => Math.hypot(p.x - b.x, p.y - b.y) <= 96);
      if (near) H(box, 'bullet'); else o.soft.push(box);
    }
    for (const b of w.fx.stampBoxes()) H({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, 'stamp');
    // each hand's Shadow and the +N / cost labels over it (the callout plates already keep off the labels)
    for (const p of w.players) {
      if (p.state !== 'alive' || p.rec.length < 2) continue;
      const f = p.rec.at(p.rewindPreview().frame);
      if (Math.hypot(f.x - p.x, f.y - p.y) < 6) continue;
      H(ui({ x0: f.x - 9, y0: f.y - 56, x1: f.x + 9, y1: f.y + 5 }), 'shadow');
    }
    // HUD: every pod, the purse, the bottom band; the top band while the chain counter shows
    for (const p of w.players) { const pr = Hud.podRect(p.slot); H({ x0: pr.x, y0: pr.y, x1: pr.x + pr.w, y1: pr.y + pr.h }, 'pod'); }
    const corner = Hud.areaRect('corner');
    H({ x0: corner.x, y0: corner.y, x1: corner.x + corner.w, y1: corner.y + corner.h }, 'purse');
    H({ x0: 0, y0: 322, x1: 640, y1: 360 }, 'bottomHud');
    if (HudChain.t > 0 && HudChain.n >= 2) { const t = Hud.areaRect('top'); H({ x0: t.x, y0: t.y, x1: t.x + t.w, y1: t.y + t.h }, 'chain'); }
    // the solo Last Second panel
    const lp = w.players[0];
    if (lp && w.playerCount <= 1 && lp.state === 'stopped' && !lp.down.final && lp.down.lastSecond > 0) H({ x0: 210, y0: 100, x1: 430, y1: 164 }, 'lastSecond');
  }
  // Ines's note (bottom-left)
  if (Hints.active) { const b = hintsHooks.bottom(); H({ x0: 4, y0: b - HINT_H, x1: 244, y1: b + 2 }, 'note'); }
  // the floor card (its dark band across the screen)
  const sc = sceneOf();
  const tc = sc?.titleCard;
  if (tc && tc.t < 3.2 && !sc?.overlays?.some((x) => x.blocks)) {
    const ls = Text.lineH('small'), lt = Text.lineH('title');
    const h = Math.max(54, Math.ceil(4 + ls + lt + 6)), top = Math.round(123 - h / 2);
    H({ x0: 0, y0: top - 2, x1: 640, y1: top + h + 2 }, 'floorCard');
  }
  obsCache = o; obsFrame = G.frame;
  return o;
}

// ───────────────────────── measuring a line ─────────────────────────
interface Measured { w: number; h: number; text: string; who: PromptDevice | null; maxW: number }
function measure(e: Entry, ch: number): Measured {
  const who = whoOf(e);
  if (e.legacy) {
    const L = captionLayout(e.legacy, Caption.platesRight());
    return { w: L.w, h: L.h, text: '', who, maxW: 0 };
  }
  const text = textOf(e);
  const form = e.o.form ?? 'line';
  const cap = ch >= 0 ? SEAT_W : MAX_W;
  if (form === 'chip') {
    const m = Rich.measure(text, 'small', who);
    return { w: m.w + 8, h: Math.max(m.h, Math.ceil(Text.lineH('small'))) + 2, text, who, maxW: 0 };
  }
  if (form === 'card') {
    const maxW = cap - CARD_PADX * 2;
    const t = Rich.measureWrapped(text, ch >= 0 ? 'body' : 'title', maxW, who, 2);
    let w = t.w, h = CARD_PADY * 2 + t.h;
    if (e.o.sub) { const m = Rich.measureWrapped(tr(e.o.sub), 'body', maxW, who); w = Math.max(w, m.w); h += 2 + m.h; }
    if (e.o.sub2) { const m = Rich.measureWrapped(tr(e.o.sub2), 'small', maxW, who); w = Math.max(w, m.w); h += 2 + m.h; }
    if (e.o.footer) { const m = Rich.measureWrapped(tr(e.o.footer), 'small', maxW, who); w = Math.max(w, m.w); h += 2 + m.h; }
    if (e.o.timer) h += 4;
    return { w: Math.min(cap, w + CARD_PADX * 2), h, text, who, maxW };
  }
  if (form === 'success') {
    const maxW = cap - CARD_PADX * 2 - 20;
    const stamp = e.o.stamp ? tr(e.o.stamp) : text;
    const big = ch < 0 && Text.measure(stamp, 'title').w <= maxW;
    const sw = Text.measure(stamp, big ? 'title' : 'body').w;
    const why = e.o.why ? Rich.measureWrapped(tr(e.o.why), 'body', maxW, who) : { w: 0, h: 0 };
    let w = 20 + Math.max(sw, why.w), h = CARD_PADY * 2 + Math.ceil(Text.lineH(big ? 'title' : 'body')) + (why.h ? 2 + why.h : 0);
    if (e.o.strip !== undefined) { const s = modelStripSize(); w = Math.max(w, s.w); h += 4 + s.h; }
    return { w: Math.min(cap, Math.ceil(w) + CARD_PADX * 2), h, text: stamp, who, maxW };
  }
  const icon = e.o.speaker !== undefined ? 16 : 0, bar = ch >= 0 ? 3 : 0;
  const maxW = cap - PADX * 2 - icon - bar;
  const t = Rich.measureWrapped(text, 'body', maxW, who);
  let w = t.w, h = PADY * 2 + t.h;
  if (e.o.footer) { const m = Rich.measureWrapped(tr(e.o.footer), 'small', maxW, who); w = Math.max(w, m.w); h += 2 + m.h; }
  if (e.o.timer) h += 3;
  return { w: Math.ceil(w) + PADX * 2 + icon + bar, h: Math.ceil(h), text, who, maxW };
}

// ───────────────────────── docks (ONBOARD2 §4.2) ─────────────────────────
interface Cand { b: Box; dock: DockId; cx: number }
function candidates(e: Entry, ch: number, m: Measured): Cand[] {
  const out: Cand[] = [];
  const box = (x0: number, y0: number, dock: DockId): Cand => ({ b: { x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x0) + m.w, y1: Math.round(y0) + m.h }, dock, cx: Math.round(x0) + m.w / 2 });
  if (ch < 0) {
    const multi = Hud.multi;
    const ar = Hud.areaRect('top');
    let y0 = ar.y + ar.h + 4;
    let cx: number;
    if (e.legacy) { const L = captionLayout(e.legacy, multi ? 0 : Caption.platesRight()); cx = L.cx; y0 += L.dy; }
    else cx = multi ? 320 : Math.max(320, Caption.platesRight() + 8 + m.w / 2);
    let topOk = true;
    if (cx + m.w / 2 > 632) {
      // no room right of the term plates: hide them (next frame) and centre; this frame the top waits
      if (!multi && Caption.platesRight() > 0) { RewindHudHooks.hidePlates(); topOk = false; }
      cx = 320;
    }
    if (topOk) out.push(box(cx - m.w / 2, y0, 'top'));
    // the bottom rail (not over a boss bar); right of Ines's note while it shows
    if (!sceneOf()?.hud?.boss) {
      let bx = 320;
      if (Hints.active) bx = Math.max(bx, 248 + m.w / 2);
      bx = Math.min(bx, 632 - m.w / 2);
      out.push(box(bx - m.w / 2, 318 - m.h, 'bottom'));
    }
    return out;
  }
  const s = ((ch % 4) + 4) % 4;
  const left = s % 2 === 0, upper = s < 2;
  let y0 = upper ? 42 : 318 - m.h;
  if (s === 2 && Hints.active) y0 = Math.min(y0, hintsHooks.bottom() - HINT_H - 4 - m.h);
  for (const d of [0, 40, 80, 120]) out.push(box(left ? 6 + d : 634 - m.w - d, y0, 'seat'));
  return out;
}
/** the pod chip's spot (ONBOARD2 §4.2 'pod') */
function chipBox(ch: number, m: Measured): Box {
  if (ch < 0 || !Hud.multi) return { x0: 150, y0: 8, x1: 150 + m.w, y1: 8 + m.h };
  const s = ((ch % 4) + 4) % 4, pr = Hud.podRect(s);
  const y0 = s < 2 ? 10 : 326;
  return s % 2 === 0 ? { x0: pr.x + pr.w + 4, y0, x1: pr.x + pr.w + 4 + m.w, y1: y0 + m.h } : { x0: pr.x - 4 - m.w, y0, x1: pr.x - 4, y1: y0 + m.h };
}

// ───────────────────────── drawing ─────────────────────────
function drawSpeaker(ctx: CanvasRenderingContext2D, sp: 'ines' | 'sys' | number, x: number, cy: number) {
  x = Math.round(x); cy = Math.round(cy);
  if (sp === 'ines') {
    // a small brass-framed portrait placeholder: her hair and the lamp-lit face
    rect(ctx, x, cy - 6, 12, 12, 'B3'); rect(ctx, x + 1, cy - 5, 10, 10, 'K1');
    rect(ctx, x + 3, cy - 4, 6, 3, 'O1'); rect(ctx, x + 4, cy - 1, 4, 4, 'O3'); rect(ctx, x + 3, cy + 3, 6, 2, 'R2');
  } else if (sp === 'sys') {
    ctx.fillStyle = col('K8');
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillRect(Math.round(x + 6 + Math.cos(a) * 5), Math.round(cy + Math.sin(a) * 5), 1, 1); }
    rect(ctx, x + 6, cy - 3, 1, 1, 'K8'); rect(ctx, x + 6, cy - 1, 1, 4, 'K8');
  } else {
    rect(ctx, x + 2, cy - 4, 8, 8, SLOT_COLOR[((sp % 4) + 4) % 4]);
    rect(ctx, x + 4, cy - 2, 4, 4, 'K0');
  }
}
function pressAgeFn(e: Entry): ((a: string) => number) | undefined {
  if (!e.o.pressed) return undefined;
  return (a) => { const t0 = e.press.get(a); return t0 === undefined ? -1 : G.time - t0; };
}
function timerBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number) {
  rect(ctx, x, y, w, 2, 'K2');
  rect(ctx, x, y, Math.round(w * Math.max(0, Math.min(1, k))), 2, 'C3');
}
function drawEntry(ctx: CanvasRenderingContext2D, e: Entry, b: Box, ch: number, m: Measured, alpha: number) {
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * alpha;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  if (e.legacy) {
    const L = captionLayout(e.legacy, 0);
    drawCaptionLine(ctx, e.legacy, b.x0 + w / 2, b.y0 - L.dy);
    ctx.globalAlpha = a0;
    return;
  }
  const form = e.o.form ?? 'line';
  const pressAge = pressAgeFn(e);
  // backing: 88% K0, a 1 px rule on top (cyan for teaching, brass for success), co-op: the seat's colour bar
  ctx.globalAlpha = a0 * alpha * (form === 'chip' ? 0.85 : 0.88);
  rect(ctx, b.x0, b.y0, w, h, 'K0');
  ctx.globalAlpha = a0 * alpha;
  if (form !== 'chip') rect(ctx, b.x0, b.y0, w, 1, form === 'success' ? 'G4' : 'C3');
  if (ch >= 0 && form !== 'chip') rect(ctx, b.x0, b.y0 + 1, 3, h - 1, SLOT_COLOR[((ch % 4) + 4) % 4]);
  if (form === 'chip') {
    const blink = 0.6 + 0.4 * (Math.floor(G.time * 6) % 2);
    ctx.globalAlpha = a0 * alpha * (e.t < 1.2 ? blink : 1);
    Rich.draw(ctx, m.text, b.x0 + 4, b.y0 + h / 2, { size: 'small', who: m.who, color: e.o.color ?? 'C3', valign: 'middle', pressAge });
  } else if (form === 'card') {
    const x = b.x0 + w / 2;
    let y = b.y0 + CARD_PADY;
    const tsz = ch >= 0 ? 'body' : 'title';
    y += Rich.draw(ctx, m.text, x, y, { size: tsz, color: 'C4', align: 'center', who: m.who, maxW: m.maxW, glyph: 2, pressAge }).h;
    if (e.o.sub) y += 2 + Rich.draw(ctx, tr(e.o.sub), x, y + 2, { size: 'body', color: 'K9', align: 'center', who: m.who, maxW: m.maxW, pressAge }).h;
    if (e.o.sub2) y += 2 + Rich.draw(ctx, tr(e.o.sub2), x, y + 2, { size: 'small', color: 'K8', align: 'center', who: m.who, maxW: m.maxW }).h;
    if (e.o.footer) y += 2 + Rich.draw(ctx, tr(e.o.footer), x, y + 2, { size: 'small', color: 'K8', align: 'center', who: m.who, maxW: m.maxW }).h;
    if (e.o.timer) timerBar(ctx, b.x0 + 10, b.y1 - 4, w - 20, e.o.timer());
  } else if (form === 'success') {
    const x0 = b.x0 + CARD_PADX;
    let y = b.y0 + CARD_PADY;
    const big = ch < 0 && Text.measure(m.text, 'title').w <= m.maxW;
    const lt = Math.ceil(Text.lineH(big ? 'title' : 'body'));
    // a ✓ in a green ring, then the stamp word
    const cy = y + lt / 2;
    ctx.fillStyle = col('G4');
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ctx.fillRect(Math.round(x0 + 7 + Math.cos(a) * 6), Math.round(cy + Math.sin(a) * 6), 1, 1); }
    rect(ctx, x0 + 4, cy, 1, 1, 'G4'); rect(ctx, x0 + 5, cy + 1, 1, 1, 'G4'); rect(ctx, x0 + 6, cy + 2, 1, 1, 'G4');
    rect(ctx, x0 + 7, cy + 1, 1, 1, 'G4'); rect(ctx, x0 + 8, cy, 1, 1, 'G4'); rect(ctx, x0 + 9, cy - 1, 1, 1, 'G4'); rect(ctx, x0 + 10, cy - 2, 1, 1, 'G4');
    Text.draw(ctx, m.text, x0 + 20, cy, { size: big ? 'title' : 'body', color: 'C4', valign: 'middle', outline: big ? false : 'C1' });
    y += lt;
    if (e.o.why) y += 2 + Rich.draw(ctx, tr(e.o.why), x0 + 20, y + 2, { size: 'body', color: 'K10', who: m.who, maxW: m.maxW }).h;
    if (e.o.strip !== undefined) ModelStrip.draw(ctx, b.x0 + w / 2, y + 4, e.o.strip);
  } else {
    let x = b.x0 + PADX + (ch >= 0 ? 3 : 0);
    const lineTop = b.y0 + PADY;
    if (e.o.speaker !== undefined) { drawSpeaker(ctx, e.o.speaker, x, lineTop + Math.ceil(Text.lineH('body')) / 2); x += 16; }
    const r = Rich.draw(ctx, m.text, x, lineTop, { size: 'body', color: e.o.color ?? 'K10', who: m.who, maxW: m.maxW, pressAge });
    let y = lineTop + r.h;
    if (e.o.footer) y += 2 + Rich.draw(ctx, tr(e.o.footer), x, y + 2, { size: 'small', color: 'K8', who: m.who, maxW: m.maxW }).h;
    if (e.o.timer) timerBar(ctx, b.x0 + PADX, b.y1 - 3, w - PADX * 2, e.o.timer());
  }
  ctx.globalAlpha = a0;
}

// ───────────────────────── spotlights (ONBOARD2 §4.7) ─────────────────────────
type Spot = { kind: 'ring'; x: number; y: number; r: number } | { kind: 'rect'; x: number; y: number; w: number; h: number };
const SPOT_PART: Partial<Record<string, HudPart>> = { hpStripe: 'hpStripe', tape: 'tape', tapeNotch: 'notch', sand: 'sand' };
const SPOT_TERM: Partial<Record<string, string>> = { shadow: 'shadow', shadowGain: 'shadow', hpStripe: 'hpPromise', tape: 'tape', tapeNotch: 'tape', sand: 'sand', armed: 'armed', preview: 'paradox' };
function resolveSpot(ref: SpotRef, p: Player | null): Spot | null {
  const r = G.r;
  const cx = r ? r.camX : 0, cy = r ? r.camY : 0;
  if (typeof ref !== 'string') {
    const e = ref as Entity & { height?: number };
    if (e.dead) return null;
    const hh = (e.height ?? 12) / 2;
    return { kind: 'ring', x: e.x - cx, y: e.y - hh - cy, r: Math.max(e.r, hh) + 6 };
  }
  const part = SPOT_PART[ref];
  if (part) {
    const rr = RewindHudHooks.rect(part, p?.slot ?? 0);
    return rr ? { kind: 'rect', x: rr[0] - 2, y: rr[1] - 2, w: rr[2] + 4, h: rr[3] + 4 } : null;
  }
  if (!p || !p.world) return null;
  if (ref === 'shadow' || ref === 'shadowGain') {
    if (p.rec.length < 2) return null;
    const f = p.rec.at(p.rewindPreview().frame);
    return ref === 'shadow' ? { kind: 'ring', x: f.x - cx, y: f.y - 11 - cy, r: 12 } : { kind: 'ring', x: f.x - cx, y: f.y - 36 - cy, r: 11 };
  }
  if (ref === 'armed') {
    for (let i = p.echoes.length - 1; i >= 0; i--) { const e = p.echoes[i]; if (!e.dead && e.armed) return { kind: 'ring', x: e.x - cx, y: e.y - 30 - cy, r: 7 }; }
    return null;
  }
  if (ref === 'preview') {
    const pv = Paradox.preview(p);
    return pv ? { kind: 'ring', x: pv.x - cx, y: pv.y - cy, r: (pv.r ?? 48) + 2 } : null;
  }
  return null;
}
function drawSpots(ctx: CanvasRenderingContext2D, e: Entry, b: Box, alpha: number) {
  const refs = e.o.spot === undefined ? [] : Array.isArray(e.o.spot) ? e.o.spot.slice(0, 2) : [e.o.spot];
  if (!refs.length) return;
  const p = playerFor(worldOf(), e.o.slot);
  const a0 = ctx.globalAlpha;
  const pulse = 0.65 + 0.35 * (Math.floor(G.time * 4) % 2);
  for (const ref of refs) {
    const s = resolveSpot(ref, p);
    if (!s) continue;
    if (typeof ref === 'string' && SPOT_TERM[ref]) Terms.seen(SPOT_TERM[ref]!);
    // the leader: a dashed C2 line (60%) with a dark under-pixel, from the card's nearest edge
    const tx = s.kind === 'ring' ? s.x : s.x + s.w / 2, ty = s.kind === 'ring' ? s.y : s.y + s.h / 2;
    const ax = Math.max(b.x0 + 2, Math.min(b.x1 - 2, tx)), ay = ty > b.y1 ? b.y1 : ty < b.y0 ? b.y0 : b.y1;
    let ex = tx, ey = ty;
    if (s.kind === 'ring') { const d = Math.hypot(tx - ax, ty - ay) || 1; ex = tx - ((tx - ax) / d) * (s.r + 1); ey = ty - ((ty - ay) / d) * (s.r + 1); }
    else { ex = Math.max(s.x, Math.min(s.x + s.w, ax)); ey = ay < s.y ? s.y : ay > s.y + s.h ? s.y + s.h : ey; }
    const d = Math.hypot(ex - ax, ey - ay);
    if (d > 4) {
      ctx.globalAlpha = a0 * alpha * 0.6;
      for (let k = 0; k <= d; k += 3) {
        const x = Math.round(ax + ((ex - ax) * k) / d), y = Math.round(ay + ((ey - ay) * k) / d);
        ctx.fillStyle = col('K0'); ctx.fillRect(x, y + 1, 1, 1);
        ctx.fillStyle = col('C2'); ctx.fillRect(x, y, 2, 1);
      }
    }
    ctx.globalAlpha = a0 * alpha * pulse;
    ctx.fillStyle = col('C3');
    if (s.kind === 'ring') {
      const n = Math.max(16, Math.round(s.r * 2.2));
      for (let i = 0; i < n; i += 1) { if (i % 2) continue; const a = (i / n) * Math.PI * 2; ctx.fillRect(Math.round(s.x + Math.cos(a) * s.r), Math.round(s.y + Math.sin(a) * s.r), 1, 1); }
    } else {
      // a rounded frame round the HUD part
      const x0 = Math.round(s.x), y0 = Math.round(s.y), x1 = Math.round(s.x + s.w), y1 = Math.round(s.y + s.h);
      rect(ctx, x0 + 1, y0, x1 - x0 - 2, 1, 'C3'); rect(ctx, x0 + 1, y1, x1 - x0 - 2, 1, 'C3');
      rect(ctx, x0, y0 + 1, 1, y1 - y0 - 1, 'C3'); rect(ctx, x1 - 1, y0 + 1, 1, y1 - y0 - 1, 'C3');
    }
  }
  ctx.globalAlpha = a0;
}

// ───────────────────────── placement (ONBOARD2 §4.5) ─────────────────────────
let lastDrawT = 0;
function place(e: Entry, cands: Cand[], ob: Obs, placedNow: Box[], dt: number): { i: number; dim: boolean } {
  const freeHard = (b: Box) => !ob.hard.some((o) => hit(b, o)) && !placedNow.some((o) => hit(b, o));
  const freeSoft = (b: Box) => !ob.soft.some((o) => hit(b, o));
  const m = e.memo;
  // 1 stick: last frame's spot is still clear
  if (m && m.idx < cands.length && freeHard(cands[m.idx].b)) { m.blockedT = 0; return { i: m.idx, dim: false }; }
  // 2 hysteresis: something other than a hand covers it for under 0.15 s → stay, dimmed below the audit line
  if (m && m.idx < cands.length) {
    m.blockedT += dt;
    if (m.blockedT < HYSTERESIS && !ob.players.some((o) => hit(cands[m.idx].b, o)) && !placedNow.some((o) => hit(cands[m.idx].b, o))) return { i: m.idx, dim: true };
  }
  // 3 move: clear of hard and soft, else clear of hard
  let i = cands.findIndex((c) => freeHard(c.b) && freeSoft(c.b));
  if (i < 0) i = cands.findIndex((c) => freeHard(c.b));
  if (i >= 0) { e.memo = { idx: i, blockedT: 0, since: G.time }; return { i, dim: false }; }
  return { i: -1, dim: false };
}

function render(ctx: CanvasRenderingContext2D) {
  const dt = Math.max(0, Math.min(0.1, G.time - lastDrawT));
  lastDrawT = G.time;
  // nothing to say: no obstacle survey (the common case in a fight costs nothing)
  if (!entries.length) { if (G.debug.has('stagedebug')) drawDebug(ctx, buildObstacles()); return; }
  const ob = buildObstacles();
  const cur = currents();
  const placedNow: Box[] = [];
  const order = [...cur.entries()].sort((a, b) => RANK[b[1].o.tier] - RANK[a[1].o.tier]);
  const audited: { key: string; b: Box }[] = [];
  for (const e of entries) if (![...cur.values()].includes(e) && e.out <= 0) e.placed = null;
  for (const [ch, e] of order) {
    const m = measure(e, ch);
    if (m.w <= 0 || m.h <= 0) { e.placed = null; continue; }
    let b: Box | null = null, dock: DockId = 'top', dim = false;
    if ((e.o.form ?? 'line') === 'chip') { b = chipBox(ch, m); dock = 'pod'; }
    else {
      const cands = candidates(e, ch, m);
      const pk = place(e, cands, ob, placedNow, dt);
      if (pk.i >= 0) { b = cands[pk.i].b; dock = cands[pk.i].dock; dim = pk.dim; }
      else if (e.o.critical) {
        // nowhere free: a critical line becomes a chip in its pod (the HUD is always drawable)
        const cm = { ...m, w: Rich.measure(m.text, 'small', m.who).w + 8, h: Math.ceil(Text.lineH('small')) + 2 };
        b = chipBox(ch, cm); dock = 'pod';
        const a = alphaOf(e);
        e.placed = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, dock, alpha: a };
        drawEntry(ctx, { ...e, o: { ...e.o, form: 'chip' } }, b, ch, cm, a);
        continue;
      }
    }
    if (!b) { e.placed = null; continue; }
    const a = alphaOf(e) * (dim ? 0.45 : 1);
    e.placed = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0, dock, alpha: a };
    placedNow.push(b);
    Callouts.avoidStage(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    if (a > 0) { drawEntry(ctx, e, b, ch, m, a); drawSpots(ctx, e, b, a); }
    if (!e.logged) { e.logged = true; Tut.log('shown', { key: e.key, dock, tier: e.o.tier }); }
    if (dock !== 'pod' && a > 0.5) audited.push({ key: e.key, b });
  }
  // lines on their way out fade where they were
  for (const e of entries) {
    if (e.out <= 0 || !e.placed) continue;
    const b = { x0: e.placed.x, y0: e.placed.y, x1: e.placed.x + e.placed.w, y1: e.placed.y + e.placed.h };
    const a = e.placed.alpha * Math.max(0, 1 - e.out / FADE_OUT);
    if (a > 0) drawEntry(ctx, e, b, channelOf(e), measure(e, channelOf(e)), a);
  }
  // audit: placed text against every hard obstacle (ONBOARD2 §4.10)
  if (audited.length) {
    audit.frames++;
    let bad: { key: string; with: string } | null = null;
    for (const { key, b } of audited) {
      const j = ob.hard.findIndex((o) => hit(b, o));
      if (j >= 0) { bad = { key, with: ob.why[j] }; break; }
    }
    if (bad) { audit.overlapFrames++; audit.worst = bad; Tut.log('overlap', bad); }
  }
  if (G.debug.has('stagedebug')) drawDebug(ctx, ob);
}
function alphaOf(e: Entry): number {
  if (e.legacy) return Math.max(0, Math.min(1, e.inT / 0.15, e.dur === Infinity ? 1 : (e.dur - e.t) / 0.3));
  return Math.max(0, Math.min(1, e.inT / FADE_IN));
}
function drawDebug(ctx: CanvasRenderingContext2D, ob: Obs) {
  const frame = (b: Box, c: string) => { rect(ctx, b.x0, b.y0, b.x1 - b.x0, 1, c); rect(ctx, b.x0, b.y1 - 1, b.x1 - b.x0, 1, c); rect(ctx, b.x0, b.y0, 1, b.y1 - b.y0, c); rect(ctx, b.x1 - 1, b.y0, 1, b.y1 - b.y0, c); };
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = 0.8;
  for (const b of ob.hard) frame(b, 'R4');
  for (const b of ob.soft) frame(b, 'B5');
  const probe: Measured = { w: 200, h: 24, text: '', who: null, maxW: 0 };
  const fake = { o: { key: '', text: '', tier: 'C' }, legacy: null } as unknown as Entry;
  for (const c of candidates(fake, -1, probe)) frame(c.b, 'C3');
  ctx.globalAlpha = a0;
}

// ───────────────────────── the API (ONBOARD2 §4.8) ─────────────────────────
function find(key: string, slot?: number): Entry | undefined {
  return entries.find((e) => e.key === key && e.out <= 0 && (slot === undefined || e.o.slot === slot));
}
export const Stage = {
  /** show a line (or card / success / chip); same key (and seat) replaces the text and keeps its spot */
  say(o: SayOpts): SayHandle {
    let e = find(o.key, o.slot);
    if (e) {
      e.o = { ...o };
      e.dur = defaultDur(o, textOf(e));
      e.legacy = null;
    } else {
      e = { o: { ...o }, key: o.key, seq: seq++, t: 0, waited: 0, dur: 0, out: 0, inT: 0, memo: null, placed: null, legacy: null, press: new Map(), prevPressed: new Set(), logged: false };
      e.dur = defaultDur(o, textOf(e));
      entries.push(e);
      Tut.log('caption', { key: o.key, tier: o.tier, form: o.form ?? 'line', text: Rich.plain(textOf(e), whoOf(e)) });
    }
    const ent = e;
    return {
      close: () => close(ent),
      update: (u: Partial<SayOpts>) => { Object.assign(ent.o, u); if (u.dur !== undefined || u.text !== undefined) ent.dur = defaultDur(ent.o, textOf(ent)); },
    };
  },
  /** close the line with this key (on this seat, or every seat) */
  clear(key: string, slot?: number): void {
    for (const e of entries) if (e.key === key && (slot === undefined || e.o.slot === slot)) close(e);
  },
  /**
   * is a teaching line of at least `tier` (default A) showing — on this seat's rail (or the shared
   * one), or anywhere? F3 Caption.say lines do not count (they never held Ines's notes back).
   */
  busy(slot?: number, tier: 'S' | 'A' = 'A'): boolean {
    const need = RANK[tier];
    for (const [ch, e] of currents()) {
      if (!e.placed || e.legacy || RANK[e.o.tier] < need) continue;
      if (slot === undefined || ch === slot || ch === -1) return true;
    }
    return false;
  },
  /** what the rail shows now (tests; slot = a co-op seat, omitted = the solo / shared rail) */
  current(slot?: number): StageCurrent | null {
    const ch = slot === undefined || !Hud.multi ? -1 : slot;
    const e = currents().get(ch);
    if (!e || !e.placed) return null;
    const text = e.legacy ? (e.legacy.term ? tr(term(e.legacy.term)?.name ?? e.legacy.term) : tr(e.legacy.text ?? '')) : Rich.plain(textOf(e), whoOf(e));
    const p = e.placed;
    return { key: e.key, text, dock: p.dock, rect: [p.x, p.y, p.w, p.h], alpha: p.alpha, tier: e.o.tier };
  },
  /** this frame's obstacles in UI px (hard / soft / the hands alone) */
  obstacles(): { hard: Box[]; soft: Box[]; players: Box[] } { const o = buildObstacles(); return { hard: o.hard, soft: o.soft, players: o.players }; },
  /** frames audited, frames where placed text met a hard obstacle, and the last such pair */
  audit(): StageAudit { return { frames: audit.frames, overlapFrames: audit.overlapFrames, worst: audit.worst }; },
  resetAudit(): void { audit.frames = 0; audit.overlapFrames = 0; audit.worst = null; },
  /** the HUD 'caption' widget calls this once per tick (real time; runs through hit-stop) */
  update(dtReal: number): void { update(dtReal); },
  /** run fn on every Stage update (the lesson runner's tick) */
  onUpdate(fn: (dtReal: number) => void): void { updateHooks.push(fn); },
  /** drop everything (a new room, the workshop) */
  reset(): void { entries.length = 0; Callouts.mute('stageS', false); },
  /** every line queued or showing (debug) */
  list(): { key: string; tier: Tier; slot?: number; placed: boolean }[] { return entries.filter((e) => e.out <= 0).map((e) => ({ key: e.key, tier: e.o.tier, slot: e.o.slot, placed: !!e.placed })); },
};

function update(dt: number) {
  const sc = sceneOf();
  const w = sc?.world ?? null;
  Gates.update(w);
  for (const fn of updateHooks) { try { fn(dt); } catch (err) { console.error('[stage]', err); } }
  // a menu over the game pauses every timer
  if (sc?.overlays?.some((o) => o.blocks)) return;
  const cur = currents();
  let sOn = false;
  for (const e of cur.values()) if (e.o.tier === 'S' && e.placed) sOn = true;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.out > 0) { e.out += dt; if (e.out >= FADE_OUT) entries.splice(i, 1); continue; }
    if (e.o.until?.()) { close(e); continue; }
    // the demo puppet's buttons: remember when each went down
    if (e.o.pressed) {
      const now = e.o.pressed();
      for (const a of now) if (!e.prevPressed.has(a)) e.press.set(a, G.time);
      for (const a of e.prevPressed) if (!now.has(a as Action)) e.press.delete(a);
      e.prevPressed = new Set(now);
    }
    const showing = [...cur.values()].includes(e) && !!e.placed;
    if (showing) {
      e.inT += dt;
      // a tier-S card on screen pauses the B / C lines' clocks
      if (!(sOn && (e.o.tier === 'B' || e.o.tier === 'C'))) e.t += dt;
      if (e.t >= e.dur) { if (e.legacy) entries.splice(i, 1); else close(e); }
    } else if (!e.placed) {
      e.waited += dt;
      if (e.o.maxWait !== undefined && e.waited > e.o.maxWait && e.t === 0) entries.splice(i, 1);
    }
  }
  Callouts.mute('stageS', sOn);
}

// ───────────────────────── Caption.say → Stage.say ─────────────────────────
let capSeq = 0;
CaptionHooks.forward = {
  say(text: L10n | string | null, o: CaptionOpts) {
    const key = o.key ?? `caption#${capSeq++}`;
    const prio = o.prio ?? 0;
    const tier: Tier = prio >= 2 ? 'A' : prio >= 1 ? 'B' : 'C';
    const old = entries.find((e) => e.key === key && e.legacy && e.out <= 0);
    if (old && old.legacy) {
      // F3 semantics: same key → new text, the clock keeps running
      old.legacy = { text, term: o.term, action: o.action, who: o.who, color: o.color ?? old.legacy.color };
      if (o.dur !== undefined) old.dur = o.dur;
      return;
    }
    entries.push({
      o: { key, text: typeof text === 'string' || !text ? (text ?? '') : text, tier }, key, seq: seq++, t: 0, waited: 0, dur: o.dur ?? 2.6, out: 0, inT: 0,
      memo: null, placed: null, legacy: { text, term: o.term, action: o.action, who: o.who, color: o.color ?? 'C3' }, press: new Map(), prevPressed: new Set(), logged: false,
    });
    Tut.log('caption', { key, tier, form: 'line', text: o.term ? o.term : typeof text === 'string' ? text : text ? tr(text) : '' });
  },
  clear(key: string) { for (let i = entries.length - 1; i >= 0; i--) if (entries[i].key === key && entries[i].legacy) entries.splice(i, 1); },
  has(key: string) { return entries.some((e) => e.key === key && e.out <= 0); },
  current() { const c = Stage.current(); return c ? { key: c.key, text: c.text } : null; },
  reset() { Stage.reset(); },
};
// a new room and the workshop start with an empty rail (nothing outlives the room that said it)
GameHooks.onRoomStart(() => Stage.reset());
GameHooks.onHub(() => Stage.reset());

// the caption rail is the Stage's now (same id: replaces the F3 widget)
Hud.register({
  id: 'caption', area: 'top', order: 90,
  update(dt) { Stage.update(dt); },
  draw(ctx) { render(ctx); },
});
