// Term callouts and the caption rail: first-sight explanations that never cover the action
// (GDD2 §9.8 rules 1–2; first-play clarity report S1.1 / S1.2; PLAN2 §1.2b).
//
// Callouts — "旧影 – 3 秒前的你 · 回溯会回到这里" next to the Shadow, "就绪 ◆ – …" next to an
// echo, "悖论 – …" by a paradox preview …
//   · requested every frame while their object is on screen: termCallout(r, w, id, x, y, o)
//     (x, y = the object's centre, o.hw / o.hh its half size)
//   · one at a time (two in co-op), by priority; each holds the stage for at least DWELL seconds
//     (a much more important one may cut in after 0.8 s), at most MAX_SHOW, then it is done for
//     this room. Each counts as one sighting (Terms.seen) per room.
//   · placed beside its object — on the side away from the nearest hand — wherever it covers no
//     hand, echo, paradox preview, enemy warning or other plate; a dotted leader line ties it to
//     what it names. Nothing free → it waits (it is never drawn on top of the action).
//   Callouts.avoid(x, y, w, h) (world px, this frame) keeps them off anything else: enemy windups
//   (Enemy.teleLine / teleCircle / teleCone call it), hazards (P2) …
// Caption — one line at a time on a fixed rail at the top centre, under the purse:
//   Caption.say(text | term, { key, dur, prio, action, who }) / Caption.clear(key). The tutorial's
//   coach and banners and co-op's plain lines (compact pods have no room for them) go here.
import type { Renderer } from '../../engine/gfx/renderer';
import type { World } from '../world/world';
import type { Action } from '../../engine/input';
import type { PromptDevice } from './widgets';
import { drawTermLabel, drawPromptLabel, promptH } from './widgets';
import { Text, type ColorKey } from './text';
import { rect } from './draw';
import { col } from '../../art/palette';
import { Terms } from '../meta/registry';
import { term } from '../strings';
import { tr, type L10n } from '../i18n';
import { G } from '../G';
import { Hud } from './hud';
import { GameHooks } from '../hooks';
import { VIEW_W, VIEW_H } from '../../engine/gfx/post';

export interface CalloutOpts {
  /** higher goes first (paradox preview 6 · armed 5 · echo / fork 4 · culprit 3 · shadow 1) */
  prio?: number;
  /** name colour (default C3) */
  color?: string;
  /** prefer the side above the object */
  above?: boolean;
  /** ids this one makes redundant while it shows (the paradox line covers "armed") */
  supersedes?: string[];
  /** the object's half width / height around (x, y) in world px (default 7 × 12: a hand) */
  hw?: number; hh?: number;
  /** a plain line to show instead of the glossary's (e.g. the Shadow's live "You 1.4s ago …") */
  plain?: L10n | string;
}

/** seconds a callout keeps the stage before a waiting one may take it, and the most it shows */
export const DWELL = 2.5, MAX_SHOW = 4;
/** a callout this much more important may cut in after PREEMPT_T */
const PREEMPT_PRIO = 2, PREEMPT_T = 0.8;
/** gap between a plate and its object (UI px), clearance kept round each hand */
const GAP = 5, HAND_PAD = 8;
/** plates stay below the top pods and above the bottom band */
const TOP = 48, BOTTOM = VIEW_H - 4;

interface Req { id: string; x: number; y: number; hw: number; hh: number; prio: number; color: string; above: boolean; supersedes?: string[]; plain?: L10n | string }
interface Active { id: string; since: number; prio: number; cand: number }
interface Box { x0: number; y0: number; x1: number; y1: number }
interface RoomState { active: Active[]; done: Set<string>; seen: Set<string> }

const reqs: Req[] = [];
let reqFrame = -1;
/** world-px obstacles registered this frame: hard ones always, soft ones when there is room */
const hard: Box[] = [];
const soft: Box[] = [];
let obsFrame = -1;
/** UI-px rects other HUD parts drew last frame (the solo term plates); kept off as well */
const uiRects: Box[] = [];
let uiFrame = -1;
const rooms = new WeakMap<object, RoomState>();
function room(w: object): RoomState {
  let s = rooms.get(w);
  if (!s) rooms.set(w, (s = { active: [], done: new Set(), seen: new Set() }));
  return s;
}
function freshReqs() { if (reqFrame !== G.frame) { reqFrame = G.frame; reqs.length = 0; } }
function freshObs() { if (obsFrame !== G.frame) { obsFrame = G.frame; hard.length = 0; soft.length = 0; } }

/** ask for a term's plain-language callout beside an object this frame (render code only) */
export function termCallout(_r: Renderer, _w: object, id: string, x: number, y: number, o: CalloutOpts = {}): void {
  if (!Terms.showPlain(id)) return;
  freshReqs();
  const prio = o.prio ?? 0;
  const i = reqs.findIndex((q) => q.id === id);
  if (i >= 0 && reqs[i].prio >= prio) return;
  const q: Req = { id, x, y, hw: o.hw ?? 7, hh: o.hh ?? 12, prio, color: o.color ?? 'C3', above: !!o.above, supersedes: o.supersedes, plain: o.plain };
  if (i >= 0) reqs[i] = q; else reqs.push(q);
}

export const Callouts = {
  /** keep plates off this world-px rect this frame (enemy warnings, hazards, previews …) */
  avoid(x: number, y: number, w: number, h: number, isSoft = false): void {
    freshObs();
    (isSoft ? soft : hard).push({ x0: x, y0: y, x1: x + w, y1: y + h });
  },
  /** keep plates off this UI-px rect (HUD parts drawn after the world: used on the next frame) */
  avoidUi(x: number, y: number, w: number, h: number): void {
    if (uiFrame !== G.frame) { uiFrame = G.frame; uiRects.length = 0; }
    uiRects.push({ x0: x, y0: y, x1: x + w, y1: y + h });
  },
  /** the ids showing now in this world (tests, tutorial) */
  showing(w: object): string[] { return room(w).active.map((a) => a.id); },
  /** decide what shows and queue the drawing (World.render, after everything else in the world) */
  flush(r: Renderer, w: World): void {
    const S = room(w);
    const list = reqFrame === G.frame ? reqs.slice() : [];
    reqs.length = 0;
    const now = G.time;
    const byId = new Map<string, Req>();
    for (const q of list) byId.set(q.id, q);
    const gone = new Set<string>();
    for (const q of list) if (q.supersedes) for (const id of q.supersedes) gone.add(id);
    // what showed and is no longer asked for (its object left, its moment passed) steps down
    for (let i = S.active.length - 1; i >= 0; i--) {
      const a = S.active[i];
      const shown = now - a.since;
      if (!byId.has(a.id) || gone.has(a.id) || shown >= MAX_SHOW) { if (shown >= 1) S.done.add(a.id); S.active.splice(i, 1); }
    }
    const waiting = list.filter((q) => !gone.has(q.id) && !S.done.has(q.id) && !S.active.some((a) => a.id === q.id)).sort((a, b) => b.prio - a.prio);
    const maxN = w.playerCount > 1 ? 2 : 1;
    // one thing at a time: a callout that has had its say yields to the next; a far more
    // important one cuts in early (it comes back later if it had little time)
    for (let i = S.active.length - 1; i >= 0 && waiting.length; i--) {
      const a = S.active[i], shown = now - a.since;
      if (shown >= DWELL) { S.done.add(a.id); S.active.splice(i, 1); }
      else if (waiting[0].prio >= a.prio + PREEMPT_PRIO && shown >= PREEMPT_T && S.active.length >= maxN) { if (shown >= DWELL * 0.6) S.done.add(a.id); S.active.splice(i, 1); }
    }
    while (S.active.length < maxN && waiting.length) {
      const q = waiting.shift()!;
      S.active.push({ id: q.id, since: now, prio: q.prio, cand: -1 });
      if (!S.seen.has(q.id)) { S.seen.add(q.id); Terms.seen(q.id); }
    }
    if (!S.active.length) return;
    // obstacles: every hand standing (and a clearance round it), echoes; enemies are soft
    freshObs();
    const H = hard.slice(), Sf = soft.slice();
    for (const p of w.players) {
      if (p.dead || p.state === 'ghost') continue;
      H.push({ x0: p.x - 8 - HAND_PAD, y0: p.y - 26 - HAND_PAD, x1: p.x + 8 + HAND_PAD, y1: p.y + 4 + HAND_PAD });
      for (const e of p.echoes) if (!e.dead) H.push({ x0: e.x - 9, y0: e.y - 30, x1: e.x + 9, y1: e.y + 4 });
    }
    for (const e of w.enemies) if (!e.dead) Sf.push({ x0: e.x - e.r - 3, y0: e.y - e.height - 6, x1: e.x + e.r + 3, y1: e.y + 3 });
    const shows = S.active.map((a) => ({ a, q: byId.get(a.id)! })).filter((s) => !!s.q);
    const ui = uiRects.slice();
    r.worldUi((ctx, toUi) => drawCallouts(ctx, toUi, w, shows, H, Sf, ui));
  },
};

type ToUi = (x: number, y: number) => { x: number; y: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

function drawCallouts(ctx: CanvasRenderingContext2D, toUi: ToUi, w: World, shows: { a: Active; q: Req }[], H: Box[], Sf: Box[], ui: Box[]) {
  const lh = Math.ceil(Text.lineH('small'));
  const conv = (b: Box): Box => { const p = toUi(b.x0, b.y0); return { x0: p.x, y0: p.y, x1: p.x + (b.x1 - b.x0), y1: p.y + (b.y1 - b.y0) }; };
  const hardUi = H.map(conv).concat(ui);
  // the stamps already drawn this frame (FX draws before us) are kept clear too
  for (const b of w.fx.stampBoxes()) hardUi.push(b);
  const softUi = Sf.map(conv);
  const placedNow: Box[] = [];
  for (const { a, q } of shows) {
    const t = term(q.id);
    if (!t) continue;
    const plain = q.plain ?? t.plain;
    const tw = Math.ceil(Math.max(Text.measure(t.name, 'small').w, Text.measure(plain, 'small').w));
    const bw = tw + 8, bh = lh * 2 + 3;
    const c = toUi(q.x, q.y);
    const ob: Box = { x0: c.x - q.hw, y0: c.y - q.hh, x1: c.x + q.hw, y1: c.y + q.hh };
    // candidate spots round the object; the side facing away from the nearest hand first
    const cx = c.x, cy = c.y;
    const cands: { x: number; y: number; dx: number; dy: number }[] = [
      { x: cx - bw / 2, y: ob.y1 + GAP, dx: 0, dy: 1 },
      { x: cx - bw / 2, y: ob.y0 - GAP - bh, dx: 0, dy: -1 },
      { x: ob.x1 + GAP, y: cy - bh / 2, dx: 1, dy: 0 },
      { x: ob.x0 - GAP - bw, y: cy - bh / 2, dx: -1, dy: 0 },
      { x: ob.x1 + GAP, y: ob.y1 + GAP, dx: 0.7, dy: 0.7 },
      { x: ob.x0 - GAP - bw, y: ob.y1 + GAP, dx: -0.7, dy: 0.7 },
      { x: ob.x1 + GAP, y: ob.y0 - GAP - bh, dx: 0.7, dy: -0.7 },
      { x: ob.x0 - GAP - bw, y: ob.y0 - GAP - bh, dx: -0.7, dy: -0.7 },
      { x: cx - bw / 2, y: ob.y1 + GAP + 26, dx: 0, dy: 1.2 },
      { x: cx - bw / 2, y: ob.y0 - GAP - bh - 26, dx: 0, dy: -1.2 },
    ];
    let away = { x: 0, y: 1 };
    const np = w.nearestPlayer(q.x, q.y, { alive: true });
    if (np) { const vx = q.x - np.x, vy = q.y - 10 - (np.y - 10), d = Math.hypot(vx, vy); if (d > 2) away = { x: vx / d, y: vy / d }; }
    const score = (k: number) => cands[k].dx * away.x + cands[k].dy * away.y + (q.above && cands[k].dy < 0 ? 0.6 : 0) + (k < 4 ? 0.15 : 0);
    const order = cands.map((_, k) => k).sort((i, j) => score(j) - score(i));
    const boxAt = (k: number): Box => {
      const x0 = Math.round(Math.max(4, Math.min(VIEW_W - 4 - bw, cands[k].x)));
      const y0 = Math.round(Math.max(TOP, Math.min(BOTTOM - bh, cands[k].y)));
      return { x0, y0, x1: x0 + bw, y1: y0 + bh };
    };
    const free = (b: Box, withSoft: boolean) => !overlaps(b, ob) && !hardUi.some((o) => overlaps(b, o)) && !placedNow.some((o) => overlaps(b, o)) && (!withSoft || !softUi.some((o) => overlaps(b, o)));
    let pick = -1;
    // stay put while the spot is still clear (no plate hopping about)
    if (a.cand >= 0 && free(boxAt(a.cand), false)) pick = a.cand;
    if (pick < 0) for (const k of order) if (free(boxAt(k), true)) { pick = k; break; }
    if (pick < 0) for (const k of order) if (free(boxAt(k), false)) { pick = k; break; }
    if (pick < 0) continue;
    a.cand = pick;
    const b = boxAt(pick);
    placedNow.push(b);
    const a0 = ctx.globalAlpha;
    // the leader: a dotted line from the plate's nearest edge to the object's
    leader(ctx, b, ob, q.color);
    ctx.globalAlpha = a0 * 0.88;
    rect(ctx, b.x0, b.y0, bw, bh, 'K0');
    ctx.globalAlpha = a0;
    rect(ctx, b.x0, b.y0, bw, 1, q.color);
    if (q.plain) {
      Text.draw(ctx, t.name, b.x0 + bw / 2, b.y0 + 2, { size: 'small', color: q.color as ColorKey, align: 'center' });
      Text.draw(ctx, plain, b.x0 + bw / 2, b.y0 + 2 + lh, { size: 'small', color: 'K7', align: 'center' });
    } else drawTermLabel(ctx, q.id, Math.round(b.x0 + bw / 2), b.y0 + 2, { size: 'small', color: q.color as ColorKey, align: 'center', layout: 'below', forcePlain: true });
  }
}

/** 1 px dotted line (with a dark under-pixel) between the nearest points of two boxes */
function leader(ctx: CanvasRenderingContext2D, b: Box, o: Box, c: string) {
  const ax = Math.max(b.x0, Math.min(b.x1 - 1, (o.x0 + o.x1) / 2)), ay = Math.max(b.y0, Math.min(b.y1 - 1, (o.y0 + o.y1) / 2));
  const bx = Math.max(o.x0, Math.min(o.x1, ax)), by = Math.max(o.y0, Math.min(o.y1, ay));
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d < 3) return;
  for (let k = 0; k <= d; k += 2) {
    const x = Math.round(ax + (dx * k) / d), y = Math.round(ay + (dy * k) / d);
    ctx.fillStyle = col('K0'); ctx.fillRect(x, y + 1, 1, 1);
    ctx.fillStyle = col(c); ctx.fillRect(x, y, 1, 1);
  }
}

// ───────────────────────── caption rail ─────────────────────────
export interface CaptionOpts {
  /** a later caption with the same key replaces it; Caption.clear(key) removes it */
  key?: string;
  /** seconds (Infinity = until cleared) */
  dur?: number;
  prio?: number;
  /** show a term's name and plain line instead of `text` */
  term?: string;
  /** a button glyph in front (in `who`'s own bindings) */
  action?: Action;
  who?: PromptDevice | null;
  color?: ColorKey;
}
interface Cap { text: L10n | string | null; key: string | null; t: number; dur: number; prio: number; term?: string; action?: Action; who?: PromptDevice | null; color: ColorKey; seq: number }
const caps: Cap[] = [];
let capSeq = 0;
/** the solo term plates' right edge this frame (the caption steps right of them) */
let platesRight = 0, platesFrame = -1;

export const Caption = {
  say(text: L10n | string | null, o: CaptionOpts = {}): void {
    if (o.key) { const old = caps.find((c) => c.key === o.key); if (old) { old.text = text; old.dur = o.dur ?? old.dur; old.term = o.term; old.action = o.action; old.who = o.who; old.color = o.color ?? old.color; return; } }
    caps.push({ text, key: o.key ?? null, t: 0, dur: o.dur ?? 2.6, prio: o.prio ?? 0, term: o.term, action: o.action, who: o.who, color: o.color ?? 'C3', seq: capSeq++ });
  },
  clear(key: string): void { for (let i = caps.length - 1; i >= 0; i--) if (caps[i].key === key) caps.splice(i, 1); },
  has(key: string): boolean { return caps.some((c) => c.key === key); },
  /** the caption showing now (tests) */
  current(): { key: string | null; text: string } | null { const c = top(); return c ? { key: c.key, text: c.term ? tr(term(c.term)?.name) : tr(c.text ?? '') } : null; },
  /** the HUD's term plates end at this x this frame (so the rail never runs under them) */
  notePlates(right: number): void { if (platesFrame !== G.frame) { platesFrame = G.frame; platesRight = 0; } platesRight = Math.max(platesRight, right); },
  reset(): void { caps.length = 0; },
};
// a new room starts with an empty rail (a caption never outlives the room that said it)
GameHooks.onRoomStart(() => Caption.reset());
GameHooks.onHub(() => Caption.reset());
function top(): Cap | null {
  let best: Cap | null = null;
  for (const c of caps) if (!best || c.prio > best.prio || (c.prio === best.prio && c.seq < best.seq)) best = c;
  return best;
}

Hud.register({
  id: 'caption', area: 'top', order: 90,
  update(dt) {
    const c = top();
    if (!c) return;
    c.t += dt;
    if (c.t >= c.dur) caps.splice(caps.indexOf(c), 1);
  },
  draw(ctx, _p, r) {
    const c = top();
    if (!c) return;
    const a = Math.min(1, c.t / 0.15, c.dur === Infinity ? 1 : (c.dur - c.t) / 0.3);
    if (a <= 0) return;
    const y = r.y + r.h + 4;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * Math.max(0, a);
    const right = platesFrame === G.frame - 1 || platesFrame === G.frame ? platesRight : 0;
    if (c.term) {
      const t = term(c.term);
      if (t) {
        const lh = Math.ceil(Text.lineH('small'));
        const w = Math.ceil(Text.measure(t.name, 'small').w + 14 + Text.measure(t.plain, 'small').w) + 10;
        const cx = Math.max(320, right + 8 + w / 2);
        ctx.globalAlpha = a0 * a * 0.88;
        rect(ctx, Math.round(cx - w / 2), y, w, lh + 3, 'K0');
        ctx.globalAlpha = a0 * a;
        rect(ctx, Math.round(cx - w / 2), y, w, 1, c.color);
        drawTermLabel(ctx, c.term, Math.round(cx), y + 2, { size: 'small', color: c.color, align: 'center', layout: 'inline', forcePlain: true });
      }
    } else {
      const text = tr(c.text ?? '');
      const w = Math.ceil(Text.measure(text, 'body').w) + (c.action ? 30 : 0);
      const cx = Math.max(320, right + 12 + w / 2);
      drawPromptLabel(ctx, c.action ?? null, text, cx, y + 2 + Math.round((promptH() - 13) / 2), { color: c.color, who: c.who });
    }
    ctx.globalAlpha = a0;
  },
});
