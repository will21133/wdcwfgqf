// Rewind 2.0, made readable (GDD2 §3.1, §12.2; PLAN2 §2 F3 item 4).
//
// World (drawn by each hand in Player.renderUnlit):
//   · the Shadow 旧影 — a hollow outline of the hand where a rewind would land (the tap target: the
//     oldest frame the Sand pays for; while scrubbing, the cursor), joined to the hand by a 2 px
//     hairspring along the taped path. Above it: +HP (what a rewind gives back, cyan) and −N🔒
//     (fixed damage it cannot, violet). Grey and dotted when no rewind is possible.
//   · while scrubbing: a bright preview of the hand at the cursor with +HP and −Sand, and the part
//     of the path that will become the echo highlighted with its action beads.
//   · Culprit marks over enemies, the landing ring of clock ticks and '+N', the Pull Back prompt.
// HUD (Hud.register, replacing F2's wrappers):
//   hp    the three-colour bar: red = HP now · cyan stripes = what a rewind gives back · violet
//         cracked glass = locked by fixed damage
//   tape  the strip under it: the last seconds, red / violet notches for hits, a white diamond
//         where a hit will mark (or has marked) a Culprit, grey with an anchor in a time anchor
//   sand  ⌛⌛ 142/200 — one small hourglass per 100, the number, the cost while scrubbing
//   chain the top-centre "CHAIN ×N" slot (F3b's paradox chains call HudChain.show)
// First sight of 旧影 / 磁带 / 时砂 puts the plain-language line next to it (Terms, GDD2 §9.8).
import type { Renderer } from '../../engine/gfx/renderer';
import type { Player } from '../entities/player';
import type { Frame } from '../systems/rewind';
import { Sprite, drawSprite } from '../../engine/gfx/sprite';
import { makeCanvas } from '../../engine/gfx/canvas';
import { col } from '../../art/palette';
import { G } from '../G';
import { Hud, type HudRect } from './hud';
import { rect, gearIcon } from './draw';
import { Text } from './text';
import { drawTermLabel, drawPromptLabel, promptH } from './widgets';
import { Terms } from '../meta/registry';
import { damp, TAU } from '../../engine/math';
import { tr } from '../i18n';
import { S, term } from '../strings';
import { ROMAN, SLOT_COLOR } from '../players';
/** Sand per hourglass icon (run.ts SAND_PER_GLASS; not imported to keep this module off run.ts's import graph) */
const SAND_PER_GLASS = 100;
import '../strings/f3';

// ───────────────────────── outline sprites ─────────────────────────
const OUTLINES = new WeakMap<Sprite, Map<string, Sprite>>();
/**
 * A sprite's silhouette edge (the pixels with a transparent neighbour) in one colour: the hollow
 * Shadow. `dash` keeps 2 of every 3 edge pixels (dashed) or 1 of 2 (dotted).
 */
function outlineOf(s: Sprite, color: string, dash: 'solid' | 'dash' | 'dot'): Sprite {
  let m = OUTLINES.get(s);
  if (!m) OUTLINES.set(s, (m = new Map()));
  const key = color + dash;
  let o = m.get(key);
  if (o) return o;
  const w = s.w, h = s.h;
  const src = s.img.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [cv, ctx] = makeCanvas(w, h);
  ctx.fillStyle = col(color);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    if (on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)) continue;
    if (dash === 'dash' && (x + y) % 3 === 2) continue;
    if (dash === 'dot' && (x + y) % 2 === 1) continue;
    ctx.fillRect(x, y, 1, 1);
  }
  o = new Sprite(cv, s.ox, s.oy);
  m.set(key, o);
  return o;
}

// ───────────────────────── small pixel icons ─────────────────────────
/** 5×6 padlock (violet = locked HP) */
function lockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, c = 'V3') {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x, y - 1, 7, 8, 'K0');
  rect(ctx, x + 2, y, 3, 1, c); rect(ctx, x + 1, y + 1, 1, 2, c); rect(ctx, x + 5, y + 1, 1, 2, c);
  rect(ctx, x + 1, y + 3, 5, 3, c); rect(ctx, x + 3, y + 4, 1, 1, 'K0');
}
/**
 * 7×7 hourglass (brass caps, glass edge, cyan sand), filled bottom-up by `f` (0..1):
 *   bbbbbbb / .g...g. / ..g.g.. / ...g... / ..g.g.. / .g...g. / bbbbbbb  (sand fills the inside)
 */
const GLASS_CELLS: [number, number, number][] = [[5, 2, 3], [4, 3, 1], [3, 3, 1], [2, 3, 1], [1, 2, 3]]; // bottom-up: row, x, width
function miniGlass(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, glow: boolean, dim: boolean) {
  x = Math.round(x); y = Math.round(y);
  const cap = dim ? 'K5' : 'B4', capD = dim ? 'K4' : 'B2', edge = dim ? 'K4' : 'K6';
  rect(ctx, x - 1, y - 1, 9, 9, 'K0');
  rect(ctx, x, y, 7, 1, cap); rect(ctx, x, y + 6, 7, 1, capD);
  rect(ctx, x + 1, y + 1, 1, 1, edge); rect(ctx, x + 5, y + 1, 1, 1, edge);
  rect(ctx, x + 2, y + 2, 1, 1, edge); rect(ctx, x + 4, y + 2, 1, 1, edge);
  rect(ctx, x + 2, y + 4, 1, 1, edge); rect(ctx, x + 4, y + 4, 1, 1, edge);
  rect(ctx, x + 1, y + 5, 1, 1, edge); rect(ctx, x + 5, y + 5, 1, 1, edge);
  const lit = Math.round(Math.max(0, Math.min(1, f)) * GLASS_CELLS.length);
  for (let i = 0; i < GLASS_CELLS.length; i++) {
    const [row, cx, w] = GLASS_CELLS[i];
    rect(ctx, x + cx, y + row, w, 1, i < lit ? (glow && i === lit - 1 ? 'C4' : i === lit - 1 ? 'C3' : 'C2') : 'K1');
  }
}
/** 5×5 anchor (time anchor: no rewinds) */
function anchorIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x - 1, y - 1, 7, 7, 'K0');
  rect(ctx, x + 2, y, 1, 4, 'K9'); rect(ctx, x + 1, y + 1, 3, 1, 'K9');
  rect(ctx, x, y + 3, 1, 1, 'K9'); rect(ctx, x + 4, y + 3, 1, 1, 'K9'); rect(ctx, x + 1, y + 4, 3, 1, 'K9');
}

// ───────────────────────── the Shadow (world) ─────────────────────────
/** per-hand: which room the term labels were counted in */
const termRoom = new WeakMap<object, Set<string>>();
function seenThisRoom(world: object, id: string) {
  let s = termRoom.get(world);
  if (!s) termRoom.set(world, (s = new Set()));
  if (s.has(id)) return;
  s.add(id);
  Terms.seen(id);
}
/** first sight: plain-language lines show for this long at the start of each room (while Terms says so) */
const TERM_SECONDS = 12;
const termOn = (p: Player, id: string) => p.world.time < TERM_SECONDS && Terms.showPlain(id);

export function renderShadow(r: Renderer, p: Player) {
  const w = p.world;
  const rec = p.rec;
  if (rec.length < 2 || p.falling > 0) return;
  const solo = w.playerCount <= 1;
  // a stopped hand shows where a rewind out of the stop would take it (solo Last Second), or where
  // a teammate's Pull Back will (co-op)
  if (p.state === 'stopped') {
    const pulled = w.players.some((q) => q.pull?.target === p && q.pull.t >= 0);
    if (!(solo ? !p.down.final && p.down.lastSecond > 0 : pulled)) return;
  } else if (p.state !== 'alive') return;
  const R = p.rw;
  if (R && R.phase === 'travel') return;
  const scrub = !!R && R.scrub;
  const pv = p.state === 'stopped' && !solo ? { ...p.rewindPreview(), frame: 0, ok: true } : p.rewindPreview();
  const f = rec.at(pv.frame);
  const near = Math.hypot(f.x - p.x, f.y - p.y) < 6;
  const alpha = solo ? 1 : 0.85;
  const u = r.u;
  // hairspring: the taped path from the hand back to the Shadow (2 px, cyan 40%)
  const n = rec.length;
  if (!near || scrub) {
    // older than the target: faint; target → now: the hairspring proper
    u.fillStyle = col(pv.ok ? 'C2' : 'K5');
    if (scrub) {
      u.globalAlpha = 0.25;
      for (let i = 0; i < pv.frame; i += 3) { const q = rec.at(i); u.fillRect(Math.round(q.x), Math.round(q.y) - 1, 1, 1); }
    }
    u.globalAlpha = (pv.ok ? 0.5 : 0.35) * alpha;
    for (let i = pv.frame; i < n; i++) { const q = rec.at(i); u.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2); }
    if (scrub) {
      // the part that will become the echo, bright, with its action beads
      u.fillStyle = col('C3');
      u.globalAlpha = 0.85;
      for (let i = pv.frame; i < n; i++) { const q = rec.at(i); u.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2); }
      u.globalAlpha = 1;
      for (const e of rec.eventsFrom(pv.frame)) {
        const q = rec.at(rec.frameOfEvent(e));
        bead(u, q.x, q.y - 4, e.type);
      }
    }
    u.globalAlpha = 1;
  }
  const spr = p.spriteFor(f);
  if (near && !scrub) {
    // standing on its own Shadow: no outline, but the promise still shows (a tap heals in place)
  } else if (scrub) {
    // the preview hand: bright, pulsing — exactly where the release will land
    const pulse = 0.75 + Math.sin(w.time * 18 + R!.t * 10) * 0.1;
    drawSprite(u, spr, f.x, f.y, { flip: f.flip, tint: 'C3', alpha: 0.35 });
    drawSprite(u, outlineOf(spr, 'C4', 'solid'), f.x, f.y, { flip: f.flip, alpha: pulse });
  } else if (!pv.ok) {
    drawSprite(u, outlineOf(spr, 'K6', 'dot'), f.x, f.y, { flip: f.flip, alpha: 0.55 * alpha });
  } else {
    // a soft landing mark on the floor under it, then the hollow, dashed outline (cyan; co-op: the
    // hand's own colour so four Shadows stay apart)
    const c = solo ? 'C3' : SLOT_COLOR[p.slot % 4];
    u.globalAlpha = 0.5 * alpha;
    u.strokeStyle = col(c);
    u.lineWidth = 1;
    u.beginPath(); u.ellipse(Math.round(f.x) + 0.5, Math.round(f.y) + 0.5, 6, 2.5, 0, 0, TAU); u.stroke();
    u.globalAlpha = 1;
    r.glowAt(f.x, f.y - 8, 14, 'C2', 0.18 * alpha);
    drawSprite(u, spr, f.x, f.y, { flip: f.flip, tint: 'C1', alpha: 0.22 });
    drawSprite(u, outlineOf(spr, c, 'dash'), f.x, f.y, { flip: f.flip, alpha: (p.state === 'stopped' ? 1 : 0.85) * alpha });
  }
  // labels over its head: +HP / −N🔒 / (scrub) −Sand
  const hpGain = p.state === 'stopped' && !solo ? Math.max(0, Math.round(Math.max(p.maxHp * 0.3, f.hp - Math.max(0, p.fixedTaken - f.fixed)))) : pv.hpGain;
  const locked = pv.locked, cost = pv.cost;
  const show = scrub || hpGain > 0 || locked > 0;
  if (show && pv.ok) {
    const lx = f.x, ly = f.y - 30, slot = solo ? -1 : p.slot;
    r.worldUi((ctx, toUi) => {
      const q = toUi(lx, ly);
      let y = Math.round(q.y);
      const lh = Math.ceil(Text.lineH('body'));
      if (scrub) {
        const t = `-${cost}`;
        const tw = Math.ceil(Text.measure(t, 'body').w);
        const x0 = Math.round(q.x - (tw + 10) / 2);
        Text.draw(ctx, t, x0, y, { color: cost === 0 ? 'G4' : 'C4', outline: 'K0' });
        miniGlass(ctx, x0 + tw + 3, y + Math.round(lh / 2) - 3, 1, false, false);
        y -= lh;
      }
      if (locked > 0) {
        const t = `-${locked}`;
        const tw = Math.ceil(Text.measure(t, 'body').w);
        const x0 = Math.round(q.x - (tw + 9) / 2);
        Text.draw(ctx, t, x0, y, { color: 'V3', outline: 'K0' });
        lockIcon(ctx, x0 + tw + 2, y + Math.round(lh / 2) - 3);
        y -= lh;
      }
      if (hpGain > 0) Text.draw(ctx, `+${hpGain}`, q.x, y, { color: 'C3', outline: 'K0', align: 'center' });
      if (slot >= 0) rect(ctx, Math.round(q.x) - 1, Math.round(q.y) + lh + 1, 3, 1, SLOT_COLOR[slot]);
    });
  }
  shadowTerm(r, p, f, scrub);
}

/** the first few rooms: "旧影 – 3 秒前的你 · 回溯会回到这里" under the Shadow (one hand's at a time) */
let shadowTermFrame = -1;
function shadowTerm(r: Renderer, p: Player, f: Frame, scrub: boolean) {
  if (scrub || p.state !== 'alive' || !termOn(p, 'shadow')) return;
  if (Math.hypot(f.x - p.x, f.y - p.y) < 20) return;
  if (shadowTermFrame === G.frame) return;
  shadowTermFrame = G.frame;
  seenThisRoom(p.world, 'shadow');
  const x = f.x, y = f.y + 5;
  r.worldUi((ctx, toUi) => {
    const q = toUi(x, y);
    const t = term('shadow');
    if (!t) return;
    // an 85% plate behind both lines so they read over any floor
    const lh = Text.lineH('small');
    const tw = Math.ceil(Math.max(Text.measure(t.name, 'small').w, Text.measure(t.plain, 'small').w));
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.8;
    rect(ctx, Math.round(q.x - tw / 2) - 3, Math.round(q.y), tw + 6, Math.ceil(lh * 2) + 2, 'K0');
    ctx.globalAlpha = a;
    drawTermLabel(ctx, 'shadow', Math.round(q.x), Math.round(q.y) + 1, { size: 'small', color: 'C3', align: 'center', layout: 'below', forcePlain: true });
  });
}

/** an action bead on the future echo's path: a blade for attacks, » for dashes, a star for specials */
function bead(u: CanvasRenderingContext2D, x: number, y: number, type: string) {
  x = Math.round(x); y = Math.round(y);
  u.fillStyle = col('K0');
  u.fillRect(x - 3, y - 3, 7, 7);
  u.fillStyle = col(type === 'special' ? 'B5' : 'C4');
  if (type === 'dash') {
    for (const ox of [-2, 1]) { u.fillRect(x + ox, y - 2, 1, 1); u.fillRect(x + ox + 1, y - 1, 1, 1); u.fillRect(x + ox + 2, y, 1, 1); u.fillRect(x + ox + 1, y + 1, 1, 1); u.fillRect(x + ox, y + 2, 1, 1); }
  } else if (type === 'special') {
    u.fillRect(x, y - 2, 1, 5); u.fillRect(x - 2, y, 5, 1); u.fillRect(x - 1, y - 1, 3, 3);
  } else {
    // a little blade, tip up-right
    u.fillRect(x + 2, y - 2, 1, 1); u.fillRect(x + 1, y - 1, 1, 1); u.fillRect(x, y, 1, 1); u.fillRect(x - 1, y + 1, 1, 1);
    u.fillRect(x - 2, y, 1, 1); u.fillRect(x, y + 2, 1, 1);
  }
}

// ───────────────────────── marks: culprits, landing, Pull Back ─────────────────────────
export function renderRewindMarks(r: Renderer, p: Player) {
  const w = p.world;
  const u = r.u;
  // Culprit: a red clock hand over every enemy this hand marked (GDD2 §3.8)
  for (const e of w.enemies) {
    const t = e.culpritOf.get(p.slot);
    if (!t || e.dead) continue;
    const blink = t < 1 && Math.floor(w.time * 8) % 2 === 0;
    if (blink) continue;
    const x = Math.round(e.x), y = Math.round(e.y - e.height - 12 + Math.sin(w.time * 5 + e.id) * 1.5);
    culpritMark(u, x, y, w.playerCount > 1 ? SLOT_COLOR[p.slot % 4] : null);
    // the word follows the mark once the landing's '+N' has faded (they would sit on each other)
    const age = p.mods.culpritT - t;
    if (age > 0.6 && (termOn(p, 'culprit') || age < 3)) {
      seenThisRoom(w, 'culprit');
      const lx = x, ly = y - 18;
      const plain = Terms.showPlain('culprit');
      r.worldUi((ctx, toUi) => {
        const q = toUi(lx, ly);
        if (!plain) { Text.draw(ctx, S('f3', 'culprit'), q.x, q.y, { size: 'small', color: 'R4', align: 'center', outline: 'K0' }); return; }
        const t = term('culprit');
        if (!t) return;
        const lh = Text.lineH('small');
        const y0 = Math.round(q.y) - Math.ceil(lh);
        const tw = Math.ceil(Math.max(Text.measure(t.name, 'small').w, Text.measure(t.plain, 'small').w));
        const a = ctx.globalAlpha;
        ctx.globalAlpha = a * 0.8;
        rect(ctx, Math.round(q.x - tw / 2) - 3, y0, tw + 6, Math.ceil(lh * 2) + 2, 'K0');
        ctx.globalAlpha = a;
        drawTermLabel(ctx, 'culprit', Math.round(q.x), y0 + 1, { size: 'small', color: 'R4', align: 'center', forcePlain: true });
      });
    }
  }
  // landing: a ring of twelve clock ticks closing in over the invulnerability, and '+N'
  if (p.landT > 0 && p.state === 'alive') {
    const k = p.landT / Math.max(0.01, p.landDur);
    const rad = 8 + 12 * k, cx = p.x, cy = p.y - 8;
    u.globalAlpha = Math.min(1, k * 1.6);
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * TAU;
      const x = Math.round(cx + Math.cos(a) * rad), y = Math.round(cy + Math.sin(a) * rad * 0.8);
      u.fillStyle = col(i % 3 === 0 ? 'C4' : 'C2');
      u.fillRect(x, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }
    u.globalAlpha = 1;
  }
  const since = p.landDur - p.landT;
  if (p.landGain > 0 && p.landT > 0 && since < 0.9) {
    const a = since > 0.6 ? 1 - (since - 0.6) / 0.3 : 1;
    const x = p.x, y = p.y - 30 - since * 18, str = `+${p.landGain}`, pop = since < 0.08 ? 2 : 1;
    r.worldUi((ctx, toUi) => { const q = toUi(x, y); G.digits.draw(ctx, str, q.x, q.y - 4.5 * pop * Text.k, { fill: 'C3', align: 'center', alpha: a, pop }); });
  }
  // Perfect Rewind (GDD2 §3.9): a cyan-and-gold stamp that slams down over the hand
  if (p.perfectStampT > 0) {
    const k = 1 - p.perfectStampT / 1.1;
    const a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    const x = p.x, y = p.y - 48 - k * 6;
    const big = k < 0.08;
    r.worldUi((ctx, toUi) => {
      const q = toUi(x, y);
      const text = S('f3', 'perfect');
      const size = big ? 'title' : 'body';
      const tw = Math.ceil(Text.measure(text, size).w), lh = Math.ceil(Text.lineH(size));
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * a * 0.85;
      rect(ctx, Math.round(q.x - tw / 2) - 6, Math.round(q.y) - 2, tw + 12, lh + 3, 'K0');
      ctx.globalAlpha = a0 * a;
      rect(ctx, Math.round(q.x - tw / 2) - 6, Math.round(q.y) - 2, tw + 12, 1, 'C3');
      rect(ctx, Math.round(q.x - tw / 2) - 6, Math.round(q.y) + lh, tw + 12, 1, 'C3');
      rect(ctx, Math.round(q.x - tw / 2) - 6, Math.round(q.y) - 1, 1, lh + 1, 'B5');
      rect(ctx, Math.round(q.x + tw / 2) + 5, Math.round(q.y) - 1, 1, lh + 1, 'B5');
      Text.draw(ctx, text, q.x, q.y, { size, align: 'center', color: Math.floor(k * 20) % 2 ? 'B6' : 'B5', outline: 'K0', alpha: a });
      ctx.globalAlpha = a0;
    });
  }
  // Pull Back: "hold [Rewind] pull back II" over a teammate who just stopped, in this hand's glyphs
  const tgt = p.pullTarget();
  if (tgt) {
    const P = p.pull && p.pull.target === tgt ? p.pull : null;
    const can = p.lo.sand >= 100;
    const text = tr(S('f3', 'pullBack')).replace('{n}', ROMAN[tgt.slot % 4]);
    const x = tgt.x, y = tgt.y + 28, k = P && P.t > 0 ? Math.min(1, P.t / 0.4) : 0, who = p.input, color = p.color;
    const left = Math.max(0, 1 - tgt.down.t / 3);
    r.worldUi((ctx, toUi) => {
      const q = toUi(x, y);
      ctx.globalAlpha = can ? 1 : 0.7;
      const pw = drawPromptLabel(ctx, 'rewind', text, q.x, q.y, { who, color: can ? 'C3' : 'K7' });
      ctx.globalAlpha = 1;
      const bw = Math.max(24, pw - 8), bx = Math.round(q.x - bw / 2), by = Math.round(q.y + Math.max(promptH(), Math.ceil(Text.inkH('body')) + 2) + 3);
      // the 3 s window draining (grey) and the hold filling (the rescuer's colour)
      rect(ctx, bx - 1, by - 1, bw + 2, 4, 'K0');
      rect(ctx, bx, by, Math.round(bw * left), 2, 'K4');
      if (k > 0) rect(ctx, bx, by, Math.round(bw * k), 2, color);
    });
  }
}

/** a red clock hand pointing down at the culprit, on a little dial */
function culpritMark(u: CanvasRenderingContext2D, x: number, y: number, slotC: string | null) {
  u.fillStyle = col('K0');
  u.fillRect(x - 3, y - 4, 7, 7); u.fillRect(x - 1, y + 3, 3, 4);
  u.fillStyle = col('K10');
  u.fillRect(x - 2, y - 3, 5, 5);
  u.fillStyle = col('R3');
  u.fillRect(x, y - 3, 1, 3); u.fillRect(x, y + 1, 1, 5); u.fillRect(x - 1, y + 3, 3, 1);
  u.fillStyle = col('R2');
  u.fillRect(x - 1, y - 1, 3, 1);
  if (slotC) { u.fillStyle = col(slotC); u.fillRect(x + 3, y - 4, 2, 2); }
}

// ───────────────────────── HUD widgets ─────────────────────────
interface HandHud { hpShown: number; gainShown: number; lockShown: number; lastHp: number; hitFlash: number; overflow: number; fullT: number; fullArmed: boolean; lastSand: number; sandFlash: number }
const hud = new Map<Player, HandHud>();
function H(p: Player): HandHud {
  let a = hud.get(p);
  if (!a) hud.set(p, (a = { hpShown: p.hp, gainShown: 0, lockShown: 0, lastHp: p.hp, hitFlash: 0, overflow: p.lo.sandOverflow, fullT: 0, fullArmed: true, lastSand: p.lo.sand, sandFlash: 0 }));
  return a;
}
const lowHp = (p: Player) => p.hp / p.maxHp < 0.3 && Math.floor(G.time * 4) % 2 === 1;

/** hp (order 10): the three-colour bar */
Hud.register({
  id: 'hp', area: 'pod', order: 10,
  update(dt, p) {
    if (!p) return;
    const a = H(p);
    const pv = p.rewindPreview();
    a.hpShown = damp(a.hpShown, Math.max(0, p.hp), 25, dt);
    a.gainShown = damp(a.gainShown, pv.hpGain, 18, dt);
    a.lockShown = damp(a.lockShown, pv.locked, 18, dt);
    if (p.hp < a.lastHp - 0.5) a.hitFlash = 0.18;
    a.lastHp = p.hp;
    if (a.hitFlash > 0) a.hitFlash -= dt;
    // forget hands that left
    if (hud.size > 8) for (const k of hud.keys()) if (k.dead) hud.delete(k);
  },
  draw(ctx, p, r) {
    if (!p) return;
    const a = H(p);
    const m = p.lo.mods;
    if (!r.compact) {
      // 1.0's place: gear, bar 70 + maxHp × 0.3 wide (≤ 150), digits after it
      gearIcon(ctx, r.x - 12, r.y - 1, 'B4', 'B2', lowHp(p) ? 'R4' : 'R3');
      const bw = Math.min(150, Math.round(70 + m.maxHp * 0.3));
      bar3(ctx, r.x, r.y, bw, 7, p, a);
      const dx = r.x + bw + 5;
      const dw = G.digits.draw(ctx, `${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`, dx, r.y + 3.5 - 4.5 * Text.k, { fill: 'K10' });
      // first runs: name the violet part (GDD2 §3.1)
      if (a.lockShown >= 0.5 && Terms.showPlain('fixed')) Text.draw(ctx, S('f3', 'locked'), dx + dw + 4, r.y + 3.5, { size: 'small', color: 'V4', valign: 'middle' });
      return;
    }
    const dw = Math.ceil(G.digits.measure(`${p.maxHp}/${p.maxHp}`));
    const bw = Math.max(24, r.w - dw - 6);
    bar3(ctx, r.x, r.y, bw, r.h, p, a);
    G.digits.draw(ctx, `${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`, r.x + r.w, r.y + r.h / 2 - 4.5 * Text.k, { fill: lowHp(p) ? 'R4' : 'K10', align: 'right' });
  },
});

/** the bar: red now · cyan stripes = a rewind gives this back · violet cracked glass = locked */
function bar3(ctx: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number, p: Player, a: HandHud) {
  const max = Math.max(1, p.maxHp);
  rect(ctx, bx - 1, by - 1, bw + 2, bh + 2, 'K0');
  rect(ctx, bx, by, bw, bh, 'K2');
  const fw = Math.round((bw * Math.max(0, a.hpShown)) / max);
  const gw = Math.max(0, Math.min(bw - fw, Math.round((bw * (a.hpShown + a.gainShown)) / max) - fw));
  const lw = Math.max(0, Math.min(bw - fw - gw, Math.round((bw * (a.hpShown + a.gainShown + a.lockShown)) / max) - fw - gw));
  // recoverable: cyan diagonal stripes drifting backwards (time running back)
  if (gw > 0) {
    rect(ctx, bx + fw, by, gw, bh, 'C1');
    const ph = Math.floor(G.time * 10);
    ctx.fillStyle = col('C3');
    for (let j = 0; j < bh; j++) for (let i = 0; i < gw; i++) if (((i + j + ph) & 3) < 2) ctx.fillRect(Math.round(bx + fw + i), Math.round(by + j), 1, 1);
    rect(ctx, bx + fw, by, gw, 1, 'C4');
  }
  // locked: violet glass with a crack, and a padlock when there is room
  if (lw > 0) {
    const x0 = bx + fw + gw;
    rect(ctx, x0, by, lw, bh, 'V1');
    rect(ctx, x0, by, lw, 1, 'V3');
    ctx.fillStyle = col('V3');
    for (let i = 0; i < lw; i++) { const j = (i * 3 + 1) % Math.max(1, bh); ctx.fillRect(Math.round(x0 + i), Math.round(by + j), 1, 1); }
    if (lw >= 7 && bh >= 5) { rect(ctx, x0 + Math.round(lw / 2) - 1, by + 1, 3, bh - 2, 'K0'); rect(ctx, x0 + Math.round(lw / 2), by + 2, 1, bh - 4, 'V4'); }
  }
  // now: solid red
  rect(ctx, bx, by, fw, bh, 'R2');
  rect(ctx, bx, by, fw, Math.min(2, bh), 'R3');
  rect(ctx, bx, by, Math.min(fw, 2), 1, 'R4');
  // the chunk just lost flashes white before it settles into stripes
  if (a.hitFlash > 0 && gw > 0) {
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * Math.min(1, a.hitFlash / 0.12);
    rect(ctx, bx + fw, by, gw, bh, 'K10');
    ctx.globalAlpha = a0;
  }
  // brass tube ticks every 10 hp
  for (let i = 10; i < max && max < 400; i += 10) rect(ctx, bx + Math.round((bw * i) / max), by + bh - 2, 1, 2, 'K1');
  rect(ctx, bx - 2, by - 2, 2, bh + 4, 'B3');
  rect(ctx, bx + bw, by - 2, 2, bh + 4, 'B3');
}

/** tape (order 20): the last seconds; solo 90×5 in row 1, co-op a 2 px strip under the HP bar */
const TAPE_W = 90;
Hud.register({
  id: 'tape', area: 'pod', order: 20,
  row: (compact) => (compact ? 2 : 1),
  width: (p, compact) => (compact ? 999 : TAPE_W),
  draw(ctx, p, r) {
    if (!p) return;
    if (r.compact) {
      // span the HP bar (its digits sit to the right)
      const dw = Math.ceil(G.digits.measure(`${p.maxHp}/${p.maxHp}`));
      drawTape(ctx, p, r.x, r.y, Math.max(24, r.w - dw - 6), r.h, true);
      return;
    }
    drawTape(ctx, p, r.x, r.y + Math.round((r.h - 5) / 2), TAPE_W, 5, false);
    tapeTerm(ctx, p, r.x, r.y);
  },
});

function drawTape(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number, w: number, h: number, compact: boolean) {
  const rec = p.rec, m = p.lo.mods;
  const L = Math.max(0.5, m.tapeLen);
  const n = rec.length;
  const anchored = p.anchorT > 0, burnt = rec.burnT > 0;
  rect(ctx, x - 1, y - 1, w + 2, h + 2, 'K0');
  rect(ctx, x, y, w, h, 'K1');
  const right = x + w;
  const xAt = (i: number) => right - Math.min(w, ((n - i) / 60 / L) * w);
  // recorded length
  const len = Math.min(w, Math.round((n / 60 / L) * w));
  const base = anchored ? 'K4' : burnt ? 'R1' : 'C1';
  rect(ctx, right - len, y, len, h, base);
  if (!anchored && !burnt && len > 0) rect(ctx, right - len, y, len, 1, 'C2');
  // while scrubbing: the part after the cursor (it will become the echo) bright, the cursor a tall line
  const R = p.rw;
  const scrubbing = !!R && R.phase === 'hold' && R.scrub;
  const cut = scrubbing ? R!.cursor : -1;
  if (scrubbing) {
    const cx = Math.round(xAt(cut));
    rect(ctx, cx, y, right - cx, h, 'C3');
    rect(ctx, cx, y, right - cx, 1, 'C4');
  }
  // cell marks every 0.1 s (compact: every 0.5 s) and taller ticks at each second
  const cell = compact ? 0.5 : 0.1;
  for (let s = cell; s < L - 1e-6; s += cell) {
    const tx = Math.round(right - (s / L) * w);
    const sec = Math.abs(s - Math.round(s)) < 1e-6;
    if (sec) rect(ctx, tx, y - (compact ? 0 : 2), 1, h + (compact ? 0 : 3), 'K0');
    else if (!compact) rect(ctx, tx, y + h - 1, 1, 1, 'K0');
  }
  // notches: red = a hit a rewind would undo, violet = fixed damage; white diamond = Culprit
  const culpritIds = new Set<number>();
  if (!compact) for (const e of p.world.enemies) if (e.culpritOf.has(p.slot)) culpritIds.add(e.id);
  for (let i = 0; i < n; i++) {
    const f = rec.at(i);
    if (!f.hit && !f.fixedHit) continue;
    const nx = Math.round(xAt(i));
    // a notch pokes out above the strip, taller for a bigger hit (1–3 px)
    if (f.fixedHit) {
      const hh = compact ? h : h + Math.min(3, 1 + Math.floor(f.fixedHit / 6));
      rect(ctx, nx - 1, y + h - hh - 1, 3, hh + 1, 'K0');
      rect(ctx, nx, y + h - hh, 1, hh, 'V4');
    }
    if (f.hit) {
      const hh = compact ? h : h + Math.min(3, 1 + Math.floor(f.hit / 6));
      rect(ctx, nx - 1, y + h - hh - 1, 3, hh + 1, 'K0');
      rect(ctx, nx, y + h - hh, 1, hh, 'R4');
      // a hit whose dealer is marked, or will be marked by the scrub in progress
      const willMark = scrubbing && i >= cut && !!f.culprits;
      const marked = !!f.culprits && f.culprits.some((id) => culpritIds.has(id));
      if (!compact && (willMark || marked)) diamond(ctx, nx, y - 5);
    }
  }
  if (scrubbing) {
    const cx = Math.round(xAt(cut));
    rect(ctx, cx - 1, y - (compact ? 2 : 4), 3, h + (compact ? 4 : 7), 'K0');
    rect(ctx, cx, y - (compact ? 1 : 3), 1, h + (compact ? 2 : 5), 'W');
  }
  if (anchored && !compact) anchorIcon(ctx, right + 3, y - 1);
  if (burnt && !compact) G.digits.draw(ctx, `${Math.ceil(rec.burnT)}s`, right - 2, y + h / 2 - 4.5 * Text.k, { fill: 'O3', align: 'right' });
}

/** 3×3 white diamond (Culprit hit) */
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x - 2, y - 1, 5, 3, 'K0'); rect(ctx, x - 1, y - 2, 3, 5, 'K0');
  rect(ctx, x, y - 1, 1, 3, 'W'); rect(ctx, x - 1, y, 3, 1, 'W');
}

/** sand (order 30): ⌛⌛ 142/200 — one hourglass per 100, the number; the cost while scrubbing */
const GLASS_W = 9;
function sandText(p: Player, compact: boolean, room: number): { cur: string; rest: string } {
  const lo = p.lo;
  const cur = String(Math.floor(lo.sand));
  const R = p.rw;
  if (R && R.phase === 'hold' && R.scrub) return { cur, rest: ` -${p.rewindPreview().cost}` };
  const rest = `/${lo.sandMax}`;
  if (compact && Math.ceil(G.digits.measure(cur + rest)) > room) return { cur, rest: '' };
  return { cur, rest };
}
Hud.register({
  id: 'sand', area: 'pod', order: 30,
  width: (p, compact) => {
    if (!p) return 0;
    const glasses = Math.max(1, Math.round(p.lo.sandMax / SAND_PER_GLASS));
    const shown = Math.min(glasses, compact ? 2 : 4);
    const t = sandText(p, compact, compact ? 46 : 999);
    return shown * GLASS_W + 2 + Math.ceil(G.digits.measure(t.cur + t.rest));
  },
  update(dt, p) {
    if (!p) return;
    const a = H(p), lo = p.lo;
    // "FULL" once each time the pool fills up and Sand starts spilling (not on every hit after)
    if (lo.sand < lo.sandMax - 0.5) a.fullArmed = true;
    if (lo.sandOverflow !== a.overflow) { a.overflow = lo.sandOverflow; if (a.fullArmed) { a.fullArmed = false; a.fullT = 0.9; } }
    if (a.fullT > 0) a.fullT -= dt;
    if (lo.sand > a.lastSand + 0.5 && Math.floor(lo.sand / SAND_PER_GLASS) > Math.floor(a.lastSand / SAND_PER_GLASS)) a.sandFlash = 0.5;
    a.lastSand = lo.sand;
    if (a.sandFlash > 0) a.sandFlash -= dt;
  },
  draw(ctx, p, r) {
    if (!p) return;
    const a = H(p), lo = p.lo;
    const glasses = Math.max(1, Math.round(lo.sandMax / SAND_PER_GLASS));
    const shown = Math.min(glasses, r.compact ? 2 : 4);
    const per = lo.sandMax / glasses;
    const cy = r.y + Math.round(r.h / 2);
    const can = p.canRewind().ok || !!p.rw || p.state !== 'alive';
    let x = r.x;
    for (let i = 0; i < shown; i++) {
      // with more glasses than shown, the last icon stands for the rest
      const lo0 = i * per, span = i < shown - 1 ? per : (glasses - i) * per;
      const f = Math.max(0, Math.min(1, (lo.sand - lo0) / span));
      miniGlass(ctx, x, cy - 3, f, f >= 1 && a.sandFlash > 0, false);
      x += GLASS_W;
    }
    const t = sandText(p, r.compact, Math.max(0, r.w - shown * GLASS_W - 2));
    const scrub = t.rest.startsWith(' -');
    const fullFlash = a.fullT > 0 && Math.floor(a.fullT * 10) % 2 === 0;
    const cw = G.digits.draw(ctx, t.cur, x + 2, cy - 4.5 * Text.k, { fill: fullFlash ? 'K10' : can ? 'C3' : 'K7' });
    if (t.rest) G.digits.draw(ctx, t.rest, x + 2 + cw, cy - 4.5 * Text.k, { fill: scrub ? (Math.floor(G.time * 8) % 2 ? 'C4' : 'K10') : 'K7' });
    if (a.fullT > 0 && !r.compact) Text.draw(ctx, S('f3', 'full'), x + 4 + cw + Math.ceil(G.digits.measure(t.rest)), cy, { size: 'small', color: 'C4', valign: 'middle' });
    if (!r.compact) sandTerm(ctx, p, r.x, r.y);
  },
});

/**
 * Term plates under the solo pod (first sight, GDD2 §9.8): one line each, stacked at the pod's left
 * edge, led by the element's own little icon so it is clear what each line names:
 *   [tape] 磁带 – 能倒回的最近几秒
 *   [⌛]   时砂 – 回溯/分岔要消耗的能量
 */
const TERM_X = 22, TERM_Y = 52;
function tapeTerm(ctx: CanvasRenderingContext2D, p: Player, _x: number, _rowY: number) {
  if (!termOn(p, 'tape')) return;
  seenThisRoom(p.world, 'tape');
  termPlate(ctx, 'tape', TERM_X, TERM_Y, (x, y) => {
    rect(ctx, x - 1, y - 1, 12, 5, 'K0'); rect(ctx, x, y, 10, 3, 'C1'); rect(ctx, x, y, 10, 1, 'C2'); rect(ctx, x + 6, y - 1, 1, 5, 'R3');
  }, 3);
}
function sandTerm(ctx: CanvasRenderingContext2D, p: Player, _x: number, _rowY: number) {
  if (!termOn(p, 'sand')) return;
  seenThisRoom(p.world, 'sand');
  const y = TERM_Y + (termOn(p, 'tape') ? Math.ceil(Text.lineH('small')) + 4 : 0);
  termPlate(ctx, 'sand', TERM_X, y, (x, yy) => miniGlass(ctx, x + 1, yy, 1, false, false), 7);
}
function termPlate(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, icon: (x: number, y: number) => void, iconH: number) {
  const t = term(id);
  if (!t) return;
  const lh = Math.ceil(Text.lineH('small'));
  const w = Math.ceil(Text.measure(t.name, 'small').w + 14 + Text.measure(t.plain, 'small').w) + 14;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.85;
  rect(ctx, x - 3, y, w + 6, lh + 2, 'K0');
  ctx.globalAlpha = a;
  icon(x, y + 1 + Math.round((lh - iconH) / 2));
  drawTermLabel(ctx, id, x + 14, y + 1, { size: 'small', color: 'C3', layout: 'inline', forcePlain: true });
}

// ───────────────────────── chain (top centre) ─────────────────────────
/** the top-centre "CHAIN ×N" slot (F3b's paradox chains call show) */
export const HudChain = {
  n: 0, t: 0, color: 'C3' as string,
  show(n: number, color = 'C3') { this.n = n; this.t = 1.6; this.color = color; },
};
Hud.register({
  id: 'chain', area: 'top', order: 20,
  update(dt) { if (HudChain.t > 0) HudChain.t -= dt; },
  draw(ctx, _p, r) {
    if (HudChain.t <= 0 || HudChain.n < 2) return;
    const k = HudChain.t;
    const a = k > 1.3 ? (1.6 - k) / 0.3 : k < 0.4 ? k / 0.4 : 1;
    const text = tr(S('f3', 'chain')).replace('{n}', String(HudChain.n));
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * Math.max(0, Math.min(1, a));
    Text.draw(ctx, text, r.x + r.w / 2, r.y + 10, { size: 'title', align: 'center', color: HudChain.color, outline: 'K0', valign: 'middle' });
    ctx.globalAlpha = a0;
  },
});

export type { HudRect };
