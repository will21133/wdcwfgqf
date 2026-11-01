// Rewind 2.0, made readable (GDD2 §3.1, §12.2; PLAN2 §2 F3 item 4).
//
// World (drawn by each hand in Player.renderUnlit):
//   · the Shadow 旧影 — a hollow outline of the hand where a rewind would land (the tap target: the
//     oldest frame the Sand pays for; while scrubbing, the cursor), joined to the hand by a 2 px
//     hairspring along the taped path. Above it: +HP (what a rewind gives back, cyan) with the
//     locked part beside it (padlock + violet number), and under that the Sand it costs (always
//     while scrubbing; in the first rooms for a tap too). Grey, dotted and with the reason written
//     on it when no rewind is possible.
//   · while scrubbing: a bright preview of the hand at the cursor with +HP (+0 in grey when it gives
//     nothing back) and −Sand, the part of the path that will become the echo highlighted with its
//     action beads; under its feet "Further back → +9" when the cursor has not reached a hit yet,
//     and (first scrubs) "Release = land here · Dash cancels".
//   · Culprit marks over enemies, the landing ring of clock ticks and '+N', the Pull Back prompt.
// HUD (Hud.register, replacing F2's wrappers):
//   hp    the three-colour bar: red = HP now · cyan stripes = what a rewind gives back (a grey
//         outline when no rewind is possible; a dotted outline for what a longer scrub would
//         reach) · violet cracked glass = locked by fixed damage
//   tape  the strip under it: the last seconds, red / violet notches for hits, a white diamond
//         where a hit will mark (or has marked) a Culprit, grey with an anchor in a time anchor
//   sand  ⌛⌛ 142/200 — one small hourglass per 100, the number; what a tap / the scrub costs
//   chain the top-centre "CHAIN ×N" slot (paradox chains call HudChain.show)
// First sight of a term puts its plain-language line next to it (Terms, GDD2 §9.8): solo HUD
// plates under the pod, co-op on the caption rail, world callouts through ui/callouts.ts.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Player, RewindRefusal } from '../entities/player';
import type { Frame } from '../systems/rewind';
import { drawSprite } from '../../engine/gfx/sprite';
import { outlineOf } from '../../engine/gfx/outline';
import { col } from '../../art/palette';
import { G } from '../G';
import { Hud, type HudRect } from './hud';
import { rect, gearIcon } from './draw';
import { Text } from './text';
import { drawTermLabel, drawPromptLabel, promptH } from './widgets';
import { Terms } from '../meta/registry';
import { damp, TAU } from '../../engine/math';
import { tr, type L10n } from '../i18n';
import { S, term } from '../strings';
import { ROMAN, SLOT_COLOR } from '../players';
import { termCallout, Callouts, Caption } from './callouts';
/** Sand per hourglass icon (run.ts SAND_PER_GLASS; not imported to keep this module off run.ts's import graph) */
const SAND_PER_GLASS = 100;
import '../strings/f3';

// world term callouts live in ui/callouts.ts (one at a time, never over the action); re-exported for callers
export { termCallout };

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
/** 5×5 anchor (time anchor: no rewinds) on a 7×7 dark tile */
function anchorIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  x = Math.round(x); y = Math.round(y);
  rect(ctx, x - 1, y - 1, 7, 7, 'K0');
  rect(ctx, x + 2, y, 1, 4, 'K10'); rect(ctx, x + 1, y + 1, 3, 1, 'K10');
  rect(ctx, x, y + 3, 1, 1, 'K10'); rect(ctx, x + 4, y + 3, 1, 1, 'K10'); rect(ctx, x + 1, y + 4, 3, 1, 'K10');
}
/** 10×3 striped swatch (the HP bar's cyan promise) for its HUD plate */
function stripeIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  rect(ctx, x - 1, y - 1, 12, 7, 'K0');
  rect(ctx, x, y, 10, 5, 'C1');
  ctx.fillStyle = col('C3');
  for (let j = 0; j < 5; j++) for (let i = 0; i < 10; i++) if (((i + j) & 3) < 2) ctx.fillRect(x + i, y + j, 1, 1);
}

// ───────────────────────── first sight (GDD2 §9.8) ─────────────────────────
/** per world: which terms were counted (Terms.seen) or captioned in this room */
const termRoom = new WeakMap<object, Set<string>>();
function onceThisRoom(world: object, key: string): boolean {
  let s = termRoom.get(world);
  if (!s) termRoom.set(world, (s = new Set()));
  if (s.has(key)) return false;
  s.add(key);
  return true;
}
function seenThisRoom(world: object, id: string) { if (onceThisRoom(world, 'seen:' + id)) Terms.seen(id); }
/** first sight: plain-language lines show for this long at the start of each room (while Terms says so) */
const TERM_SECONDS = 12;
const termOn = (p: Player, id: string) => p.world.time < TERM_SECONDS && Terms.showPlain(id);
/** "3" / "1.4": seconds of tape, as the Shadow's line says them */
const secs = (s: number) => String(Math.round(s * 10) / 10);
function fill(l: L10n, k: string, v: string): L10n { return { zh: l.zh.replace(k, v), en: l.en.replace(k, v) }; }
/** "+N" first-scrub help: shown for the first few scrubs of a session */
let scrubHowCount = 0;
const countedScrubs = new WeakSet<object>();

// ───────────────────────── the Shadow (world) ─────────────────────────
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
  const pulledCoop = p.state === 'stopped' && !solo;
  const pv = pulledCoop ? { ...p.rewindPreview(), frame: 0, ok: true } : p.rewindPreview();
  const f = rec.at(pv.frame);
  const dist = Math.hypot(f.x - p.x, f.y - p.y);
  const near = dist < 6;
  // co-op: four Shadows share one screen, so each is quieter and in its hand's colour (D7)
  const alpha = solo ? 1 : 0.6;
  const u = r.u;
  // hairspring: the taped path from the hand back to the Shadow (2 px, cyan 40%; co-op: slot colour
  // 30%, and only its last second when the Shadow is far away)
  const n = rec.length;
  if (!near || scrub) {
    u.fillStyle = col(pv.ok ? (solo ? 'C2' : SLOT_COLOR[p.slot % 4]) : 'K5');
    if (scrub) {
      u.globalAlpha = 0.25;
      for (let i = 0; i < pv.frame; i += 3) { const q = rec.at(i); u.fillRect(Math.round(q.x), Math.round(q.y) - 1, 1, 1); }
    }
    const from = !solo && !scrub && dist > 120 ? Math.max(pv.frame, n - 60) : pv.frame;
    u.globalAlpha = pv.ok ? (solo ? 0.5 : 0.3) : 0.35;
    for (let i = from; i < n; i++) { const q = rec.at(i); u.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 2, 2); }
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
    // no rewind possible: a grey silhouette with a dashed rim and a dark under-edge, so it still
    // reads on dark floors (the dotted rim alone vanished; D3) — and the reason is written on it
    u.globalAlpha = 0.45 * alpha;
    u.strokeStyle = col('K7');
    u.lineWidth = 1;
    u.beginPath(); u.ellipse(Math.round(f.x) + 0.5, Math.round(f.y) + 0.5, 6, 2.5, 0, 0, TAU); u.stroke();
    u.globalAlpha = 1;
    drawSprite(u, spr, f.x, f.y, { flip: f.flip, tint: 'K6', alpha: 0.3 * alpha });
    drawSprite(u, outlineOf(spr, 'K0', 'solid'), f.x + 1, f.y + 1, { flip: f.flip, alpha: 0.7 * alpha });
    drawSprite(u, outlineOf(spr, 'K9', 'dash'), f.x, f.y, { flip: f.flip, alpha: 0.9 * alpha });
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
    drawSprite(u, spr, f.x, f.y, { flip: f.flip, tint: 'C1', alpha: 0.22 * alpha });
    drawSprite(u, outlineOf(spr, c, 'dash'), f.x, f.y, { flip: f.flip, alpha: (p.state === 'stopped' ? 1 : 0.85) * alpha });
  }
  // a grey Shadow says why (the reason the press would give)
  if (!pv.ok && !near && p.state === 'alive') {
    const why = blockText(p);
    if (why) {
      const lx = f.x, ly = f.y - 30;
      r.worldUi((ctx, toUi) => { const q = toUi(lx, ly); Text.draw(ctx, why, q.x, q.y, { size: 'small', color: 'K8', align: 'center', outline: 'K0' }); });
    }
  }
  // labels over its head: +HP and 🔒N on one row, the Sand it costs under them
  const hpGain = pulledCoop ? Math.max(0, Math.round(Math.max(p.maxHp * 0.3, f.hp - Math.max(0, p.fixedTaken - f.fixed)))) : pv.hpGain;
  const locked = solo || scrub ? pv.locked : 0, cost = pv.cost;
  const show = scrub || hpGain > 0 || locked > 0;
  // the price of a tap is on the Shadow while the player is still learning what Sand is (clarity S1.5)
  const showCost = scrub || (solo && !pulledCoop && hpGain > 0 && Terms.showPlain('sand'));
  const pulse = hudOf(p)?.promiseT ?? 0;
  if (show && pv.ok) {
    // a preview right next to the hand: the labels go above both, never across the hand's sprite
    const crowd = Math.abs(f.x - p.x) < 22 && Math.abs(f.y - p.y) < 30;
    const lx = f.x, ly = (crowd ? Math.min(f.y, p.y) : f.y) - 30, slot = solo ? -1 : p.slot;
    // the labels are part of the Shadow: no term plate may sit on them
    { const lhw = Math.ceil(Text.lineH('body')), rows = showCost ? 2 : 1; Callouts.avoid(lx - 24, ly - (rows - 1) * lhw - 2, 48, rows * lhw + 4); }
    r.worldUi((ctx, toUi) => {
      const q = toUi(lx, ly);
      let y = Math.round(q.y);
      const lh = Math.ceil(Text.lineH('body'));
      // a dark backing while scrubbing: the ripple's colour fringing runs right behind these numbers
      if (scrub) {
        const a0 = ctx.globalAlpha;
        ctx.globalAlpha = a0 * 0.7;
        rect(ctx, Math.round(q.x) - 22, y - lh + 1, 44, lh * 2, 'K0');
        ctx.globalAlpha = a0;
      }
      if (showCost) {
        const t = `-${cost}`;
        const tw = Math.ceil(Text.measure(t, 'body').w);
        const x0 = Math.round(q.x - (tw + 10) / 2);
        const a0 = ctx.globalAlpha;
        if (!scrub) ctx.globalAlpha = a0 * 0.8;
        Text.draw(ctx, t, x0, y, { color: cost === 0 ? 'G4' : 'C4', outline: 'K0' });
        miniGlass(ctx, x0 + tw + 3, y + Math.round(lh / 2) - 3, 1, false, false);
        ctx.globalAlpha = a0;
        y -= lh;
      }
      // what comes back (+0 in grey while a scrub gives nothing), and beside it, without a minus so
      // it never reads as a cost, the padlocked violet part that will not
      const gs = `+${hpGain}`;
      const gw = hpGain > 0 || scrub ? Math.ceil(Text.measure(gs, 'body').w) : 0;
      const ls = String(locked), lw = locked > 0 ? 9 + Math.ceil(Text.measure(ls, 'body').w) : 0;
      const total = gw + (gw && lw ? 5 : 0) + lw;
      let x = Math.round(q.x - total / 2);
      const big = pulse > 0 && Math.floor(pulse * 10) % 2 === 0;
      if (gw) { Text.draw(ctx, gs, x, y, { color: hpGain > 0 ? (big ? 'K10' : 'C3') : 'K6', outline: 'K0' }); x += gw + 5; }
      if (lw) { lockIcon(ctx, x, y + Math.round(lh / 2) - 3); Text.draw(ctx, ls, x + 9, y, { color: 'V3', outline: 'K0' }); }
      if (slot >= 0) rect(ctx, Math.round(q.x) - 1, Math.round(q.y) + lh + 1, 3, 1, SLOT_COLOR[slot]);
    });
  }
  if (scrub) scrubHelp(r, p, f, pv.hpGain);
  shadowTerm(r, p, f, pv.ok, pv.hpGain, pv.seconds, scrub);
}

/** why the press would be refused, short (on the grey Shadow) */
function blockText(p: Player): string | null {
  const why: RewindRefusal | null = p.rewindBlock();
  if (why === 'sand') return tr(S('f3', 'shadowNoSand'));
  if (why === 'anchor') return tr(S('f3', 'shadowAnchor'));
  if (why === 'burnt') return `${tr(S('f3', 'shadowBurnt'))} ${Math.ceil(p.rec.burnT)}s`;
  return null;
}

/**
 * Under the scrub preview's feet: "Further back → +9" while the cursor has not reached a hit the
 * Shadow would undo (a short scrub silently gave nothing back; clarity S1.3), and for the first
 * scrubs of a session "Release = land here · Dash cancels".
 */
function scrubHelp(r: Renderer, p: Player, f: Frame, gain: number) {
  const R = p.rw!;
  if (!countedScrubs.has(R)) { countedScrubs.add(R); scrubHowCount++; }
  const more = p.tapGain();
  const lines: string[] = [];
  if (more > gain) lines.push(tr(fill(S('f3', 'further'), '{n}', String(more))));
  if (scrubHowCount <= 3) lines.push(tr(S('f3', 'scrubHow')));
  if (!lines.length) return;
  const lx = f.x, ly = f.y + 5;
  r.worldUi((ctx, toUi) => {
    const q = toUi(lx, ly);
    let y = Math.round(q.y);
    const lh = Math.ceil(Text.lineH('small'));
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i];
      const tw = Math.ceil(Text.measure(t, 'small').w);
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * 0.85;
      rect(ctx, Math.round(q.x - tw / 2) - 3, y, tw + 6, lh + 1, 'K0');
      ctx.globalAlpha = a0;
      Text.draw(ctx, t, q.x, y + 1, { size: 'small', color: i === 0 && more > gain ? 'C3' : 'K8', align: 'center' });
      y += lh + 2;
    }
  });
}

/**
 * The Shadow's callout ("旧影 – 1.4 秒前的你 · 回溯会回到这里", the real distance back): at the start
 * of the first rooms, and when it starts to promise something (+N after a hit).
 */
function shadowTerm(r: Renderer, p: Player, f: Frame, ok: boolean, gain: number, seconds: number, scrub: boolean) {
  if (scrub || !ok || p.state !== 'alive' || !Terms.showPlain('shadow')) return;
  if (Math.hypot(f.x - p.x, f.y - p.y) < 20) return;
  if (!(p.world.time < TERM_SECONDS || gain > 0)) return;
  termCallout(r, p.world, 'shadow', f.x, f.y - 11, { prio: 1, hw: 7, hh: 13, plain: fill(S('f3', 'shadowLive'), '{s}', secs(seconds)) });
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
      if (Terms.showPlain('culprit')) termCallout(r, w, 'culprit', e.x, (e.y - e.height - 12 + e.y) / 2, { prio: 3, color: 'R4', hw: e.r + 4, hh: (e.height + 16) / 2 });
      else {
        seenThisRoom(w, 'culprit');
        const lx = x, ly = y - 14;
        r.worldUi((ctx, toUi) => { const q = toUi(lx, ly); Text.draw(ctx, S('f3', 'culprit'), q.x, q.y, { size: 'small', color: 'R4', align: 'center', outline: 'K0' }); });
      }
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
  // (Perfect Rewind's stamp is an FX.stamp with its plain line: Player.perfectFx)
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

/** a dark tag with a red clock hand pointing down at the culprit (GDD2 §3.8; not a white first-aid card) */
function culpritMark(u: CanvasRenderingContext2D, x: number, y: number, slotC: string | null) {
  u.fillStyle = col('K0');
  u.fillRect(x - 3, y - 4, 7, 7); u.fillRect(x - 1, y + 3, 3, 4);
  u.fillStyle = col('R1');
  u.fillRect(x - 2, y - 3, 5, 5);
  u.fillStyle = col('R4');
  u.fillRect(x, y - 3, 1, 3); u.fillRect(x, y + 1, 1, 5); u.fillRect(x - 1, y + 3, 3, 1);
  u.fillStyle = col('R3');
  u.fillRect(x - 1, y - 1, 3, 1);
  u.fillStyle = col('K10');
  u.fillRect(x, y - 1, 1, 1);
  if (slotC) { u.fillStyle = col(slotC); u.fillRect(x + 3, y - 4, 2, 2); }
}

// ───────────────────────── HUD widgets ─────────────────────────
interface HandHud {
  hpShown: number; gainShown: number; potShown: number; lockShown: number; ok: boolean; lastHp: number; hitFlash: number;
  /** 0.6 s pulse that ties the stripes to the Shadow's +N the first times they appear */
  promiseT: number; lastGain: number;
  overflow: number; fullT: number; fullArmed: boolean; lastSand: number; sandFlash: number;
  /** a Perfect Rewind's refund flying from the hand to the Sand number */
  flyT: number; flyN: number; flyX: number; flyY: number;
}
// a WeakMap: a room's hands are forgotten with the room (a Map kept every old World alive; review F3 #1)
const hud = new WeakMap<Player, HandHud>();
function H(p: Player): HandHud {
  let a = hud.get(p);
  if (!a) hud.set(p, (a = { hpShown: p.hp, gainShown: 0, potShown: 0, lockShown: 0, ok: true, lastHp: p.hp, hitFlash: 0, promiseT: 0, lastGain: 0, overflow: p.lo.sandOverflow, fullT: 0, fullArmed: true, lastSand: p.lo.sand, sandFlash: 0, flyT: 0, flyN: 0, flyX: 0, flyY: 0 }));
  return a;
}
const hudOf = (p: Player): HandHud | undefined => hud.get(p);
const lowHp = (p: Player) => p.hp / p.maxHp < 0.3 && Math.floor(G.time * 4) % 2 === 1;
const scrubbing = (p: Player) => !!p.rw && p.rw.phase === 'hold' && p.rw.scrub;

/** hp (order 10): the three-colour bar */
Hud.register({
  id: 'hp', area: 'pod', order: 10,
  update(dt, p) {
    if (!p) return;
    const a = H(p);
    const pv = p.rewindPreview();
    a.hpShown = damp(a.hpShown, Math.max(0, p.hp), 25, dt);
    a.gainShown = damp(a.gainShown, pv.hpGain, 18, dt);
    a.potShown = damp(a.potShown, scrubbing(p) ? Math.max(0, p.tapGain() - pv.hpGain) : 0, 18, dt);
    a.lockShown = damp(a.lockShown, pv.locked, 18, dt);
    // the promise is only cyan when a rewind can actually happen (D2): otherwise a grey outline
    a.ok = pv.ok || p.state === 'stopped' && !p.down.final && p.world.playerCount > 1;
    if (p.hp < a.lastHp - 0.5) a.hitFlash = 0.18;
    a.lastHp = p.hp;
    if (a.hitFlash > 0) a.hitFlash -= dt;
    if (pv.hpGain > 0 && a.lastGain <= 0 && Terms.showPlain('hpPromise')) a.promiseT = 0.6;
    a.lastGain = pv.hpGain;
    if (a.promiseT > 0) a.promiseT -= dt;
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
      termPlates(ctx, p, a);
      return;
    }
    const dw = Math.ceil(G.digits.measure(`${p.maxHp}/${p.maxHp}`));
    const bw = Math.max(24, r.w - dw - 6);
    bar3(ctx, r.x, r.y, bw, r.h, p, a);
    G.digits.draw(ctx, `${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`, r.x + r.w, r.y + r.h / 2 - 4.5 * Text.k, { fill: lowHp(p) ? 'R4' : 'K10', align: 'right' });
    coopCaptions(p, a);
  },
});

/** the bar: red now · cyan stripes = a rewind gives this back · violet cracked glass = locked */
function bar3(ctx: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number, p: Player, a: HandHud) {
  const max = Math.max(1, p.maxHp);
  rect(ctx, bx - 1, by - 1, bw + 2, bh + 2, 'K0');
  rect(ctx, bx, by, bw, bh, 'K2');
  const fw = Math.round((bw * Math.max(0, a.hpShown)) / max);
  const gw = Math.max(0, Math.min(bw - fw, Math.round((bw * (a.hpShown + a.gainShown)) / max) - fw));
  const pw = Math.max(0, Math.min(bw - fw - gw, Math.round((bw * (a.hpShown + a.gainShown + a.potShown)) / max) - fw - gw));
  const lw = Math.max(0, Math.min(bw - fw - gw - pw, Math.round((bw * (a.hpShown + a.gainShown + a.potShown + a.lockShown)) / max) - fw - gw - pw));
  if (gw > 0 && a.ok) {
    // recoverable: cyan diagonal stripes drifting backwards (time running back); brighter while
    // they pulse with the Shadow's +N the first times they appear
    const bright = a.promiseT > 0 && Math.floor(a.promiseT * 10) % 2 === 0;
    rect(ctx, bx + fw, by, gw, bh, bright ? 'C2' : 'C1');
    const ph = Math.floor(G.time * 10);
    ctx.fillStyle = col(bright ? 'C4' : 'C3');
    for (let j = 0; j < bh; j++) for (let i = 0; i < gw; i++) if (((i + j + ph) & 3) < 2) ctx.fillRect(Math.round(bx + fw + i), Math.round(by + j), 1, 1);
    rect(ctx, bx + fw, by, gw, 1, 'C4');
  } else if (gw > 0) {
    // it would come back, but no rewind is possible right now: an empty grey frame, not a promise
    outlineBox(ctx, bx + fw, by, gw, bh, 'K6', false);
  }
  // what a longer scrub would still reach (the cursor has not got to that hit yet)
  if (pw > 0) outlineBox(ctx, bx + fw + gw, by, pw, bh, 'C3', true);
  // locked: violet glass with a crack, and a padlock when there is room
  if (lw > 0) {
    const x0 = bx + fw + gw + pw;
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
/** a 1 px frame inside (x, y, w, h); dotted = every other pixel */
function outlineBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string, dotted: boolean) {
  ctx.fillStyle = col(c);
  for (let i = 0; i < w; i++) {
    if (dotted && (i & 1)) continue;
    ctx.fillRect(Math.round(x + i), Math.round(y), 1, 1);
    ctx.fillRect(Math.round(x + i), Math.round(y + h - 1), 1, 1);
  }
  for (let j = 0; j < h; j++) {
    if (dotted && (j & 1)) continue;
    ctx.fillRect(Math.round(x), Math.round(y + j), 1, 1);
    ctx.fillRect(Math.round(x + w - 1), Math.round(y + j), 1, 1);
  }
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
  const scrub = !!R && R.phase === 'hold' && R.scrub;
  const cut = scrub ? R!.cursor : -1;
  if (scrub) {
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
  // a hit the scrub cursor has not reached blinks: that is the damage a longer scrub would undo
  const blinkOn = Math.floor(G.time * 6) % 2 === 0;
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
      rect(ctx, nx, y + h - hh, 1, hh, scrub && i < cut && blinkOn ? 'K10' : 'R4');
      // a hit whose dealer is marked, or will be marked by the scrub in progress
      const willMark = scrub && i >= cut && !!f.culprits;
      const marked = !!f.culprits && f.culprits.some((id) => culpritIds.has(id));
      if (!compact && (willMark || marked)) diamond(ctx, nx, y - 6);
    }
  }
  if (scrub) {
    const cx = Math.round(xAt(cut));
    rect(ctx, cx - 1, y - (compact ? 2 : 4), 3, h + (compact ? 4 : 7), 'K0');
    rect(ctx, cx, y - (compact ? 1 : 3), 1, h + (compact ? 2 : 5), 'W');
  }
  // a time anchor: the anchor sits on the greyed strip itself (it used to hide under the hourglasses; D4)
  if (anchored) {
    if (!compact) anchorIcon(ctx, x + 3, y + Math.round(h / 2) - 2);
    else anchorIcon(ctx, right + 3, y - 2);
  }
  if (burnt && !compact) G.digits.draw(ctx, `${Math.ceil(rec.burnT)}s`, right - 2, y + h / 2 - 4.5 * Text.k, { fill: 'O3', align: 'right' });
  else if (burnt && Math.floor(G.time * 3) % 2 === 0) rect(ctx, right - len, y, len, h, 'O2');
}

/** 5×5 white diamond on a dark edge (Culprit hit) */
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number) {
  for (let k = -3; k <= 3; k++) { const hw = 3 - Math.abs(k); rect(ctx, x - hw, y + k, hw * 2 + 1, 1, 'K0'); }
  for (let k = -2; k <= 2; k++) { const hw = 2 - Math.abs(k); rect(ctx, x - hw, y + k, hw * 2 + 1, 1, 'K10'); }
}

/** sand (order 30): ⌛⌛ 142/200 — one hourglass per 100, the number; what a tap / the scrub costs */
const GLASS_W = 9;
/** a tap's price is shown while the Shadow promises something (clarity S1.5) */
function tapPrice(p: Player): number {
  if (p.rw || p.state !== 'alive') return 0;
  const pv = p.rewindPreview();
  return pv.ok && pv.hpGain > 0 ? pv.cost : 0;
}
function sandText(p: Player, compact: boolean, room: number): { cur: string; rest: string; kind: 'max' | 'scrub' | 'tap' } {
  const lo = p.lo;
  const cur = String(Math.floor(lo.sand));
  if (scrubbing(p)) return { cur, rest: ` -${p.rewindPreview().cost}`, kind: 'scrub' };
  const price = tapPrice(p);
  if (price > 0) return { cur, rest: ` -${price}`, kind: 'tap' };
  const rest = `/${lo.sandMax}`;
  if (compact && Math.ceil(G.digits.measure(cur + rest)) > room) return { cur, rest: '', kind: 'max' };
  return { cur, rest, kind: 'max' };
}
Hud.register({
  id: 'sand', area: 'pod', order: 30,
  width: (p, compact) => {
    if (!p) return 0;
    const glasses = Math.max(1, Math.round(p.lo.sandMax / SAND_PER_GLASS));
    const shown = Math.min(glasses, compact ? 2 : 4);
    const t = sandText(p, compact, compact ? 46 : 999);
    return shown * GLASS_W + 2 + Math.ceil(G.digits.measure(t.cur + (t.kind === 'max' ? t.rest : `/${p.lo.sandMax}`)));
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
    // a Perfect Rewind's refund flies from the hand to the number (clarity S2.10)
    if (p.perfectRefund > 0) {
      const [vx, vy] = p.viewPos();
      // from beside the hand (the PERFECT stamp sits over it), after the stamp has landed
      a.flyT = 0.95; a.flyN = p.perfectRefund; a.flyX = vx + 18; a.flyY = vy - 16;
      p.perfectRefund = 0;
    }
    if (a.flyT > 0) a.flyT -= dt;
  },
  draw(ctx, p, r) {
    if (!p) return;
    const a = H(p), lo = p.lo;
    const glasses = Math.max(1, Math.round(lo.sandMax / SAND_PER_GLASS));
    const shown = Math.min(glasses, r.compact ? 2 : 4);
    const per = lo.sandMax / glasses;
    const cy = r.y + Math.round(r.h / 2);
    const can = p.canRewind().ok || !!p.rw || p.state !== 'alive';
    const t = sandText(p, r.compact, Math.max(0, r.w - shown * GLASS_W - 2));
    // the glass a tap or the scrub would empty blinks down to what would be left
    const cost = t.kind === 'max' ? 0 : t.kind === 'tap' ? tapPrice(p) : p.rewindPreview().cost;
    const after = lo.sand - cost;
    const blink = cost > 0 && Math.floor(G.time * 4) % 2 === 0;
    let x = r.x;
    for (let i = 0; i < shown; i++) {
      // with more glasses than shown, the last icon stands for the rest
      const lo0 = i * per, span = i < shown - 1 ? per : (glasses - i) * per;
      const f = Math.max(0, Math.min(1, ((blink ? after : lo.sand) - lo0) / span));
      miniGlass(ctx, x, cy - 3, f, f >= 1 && a.sandFlash > 0, false);
      x += GLASS_W;
    }
    const fullFlash = a.fullT > 0 && Math.floor(a.fullT * 10) % 2 === 0;
    const cw = G.digits.draw(ctx, t.cur, x + 2, cy - 4.5 * Text.k, { fill: fullFlash ? 'K10' : can ? 'C3' : 'K7' });
    if (t.rest) G.digits.draw(ctx, t.rest, x + 2 + cw, cy - 4.5 * Text.k, { fill: t.kind === 'scrub' ? (Math.floor(G.time * 8) % 2 ? 'C4' : 'K10') : t.kind === 'tap' ? 'C2' : 'K7' });
    if (a.fullT > 0 && !r.compact) Text.draw(ctx, S('f3', 'full'), x + 4 + cw + Math.ceil(G.digits.measure(t.rest)), cy, { size: 'small', color: 'C4', valign: 'middle' });
    if (a.flyT > 0 && a.flyT < 0.7) {
      const k = 1 - a.flyT / 0.7, e = k * k * (3 - 2 * k);
      const fx = a.flyX + (x + 2 + cw / 2 - a.flyX) * e, fy = a.flyY + (cy - a.flyY) * e - Math.sin(k * Math.PI) * 18;
      G.digits.draw(ctx, `+${a.flyN}`, fx, fy - 4.5 * Text.k, { fill: k > 0.85 && Math.floor(G.time * 20) % 2 ? 'K10' : 'C4', align: 'center', outline: 'K0' });
    }
  },
});

/**
 * Term plates under the solo pod (first sight, GDD2 §9.8): one line each, stacked at the pod's left
 * edge, led by the element's own little icon so it is clear what each line names:
 *   [stripes] 青色斜纹 – 回溯能拿回的生命      (while the bar shows them, first runs)
 *   [lock]    定格伤害 – 回溯也拿不回的伤害    (while there is a locked part, first runs)
 *   [tape]    磁带 – 能倒回的最近几秒          (first seconds of the first rooms)
 *   [⌛]      时砂 – 回溯/分岔要消耗的能量
 */
const TERM_X = 22, TERM_Y = 52;
function termPlates(ctx: CanvasRenderingContext2D, p: Player, a: HandHud) {
  const w = p.world;
  const rows: { id: string; icon: (x: number, y: number) => void; ih: number }[] = [];
  if (a.gainShown >= 0.5 && a.ok && Terms.showPlain('hpPromise')) rows.push({ id: 'hpPromise', icon: (x, y) => stripeIcon(ctx, x, y), ih: 5 });
  if (a.lockShown >= 0.5 && Terms.showPlain('fixed')) rows.push({ id: 'fixed', icon: (x, y) => lockIcon(ctx, x + 2, y + 1), ih: 7 });
  if (termOn(p, 'tape')) rows.push({ id: 'tape', icon: (x, y) => { rect(ctx, x - 1, y - 1, 12, 5, 'K0'); rect(ctx, x, y, 10, 3, 'C1'); rect(ctx, x, y, 10, 1, 'C2'); rect(ctx, x + 6, y - 1, 1, 5, 'R3'); }, ih: 3 });
  if (termOn(p, 'sand')) rows.push({ id: 'sand', icon: (x, y) => miniGlass(ctx, x + 1, y, 1, false, false), ih: 7 });
  const lh = Math.ceil(Text.lineH('small'));
  let y = TERM_Y;
  for (const row of rows) {
    seenThisRoom(w, row.id);
    const pw = termPlate(ctx, row.id, TERM_X, y, row.icon, row.ih);
    // nothing in the world is placed under a plate, and the caption rail steps right of them
    Callouts.avoidUi(TERM_X - 3, y, pw + 6, lh + 2);
    Caption.notePlates(TERM_X + pw + 3);
    y += lh + 4;
  }
}
function termPlate(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, icon: (x: number, y: number) => void, iconH: number): number {
  const t = term(id);
  if (!t) return 0;
  const lh = Math.ceil(Text.lineH('small'));
  const w = Math.ceil(Text.measure(t.name, 'small').w + 14 + Text.measure(t.plain, 'small').w) + 14;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * 0.85;
  rect(ctx, x - 3, y, w + 6, lh + 2, 'K0');
  ctx.globalAlpha = a;
  icon(x, y + 1 + Math.round((lh - iconH) / 2));
  drawTermLabel(ctx, id, x + 14, y + 1, { size: 'small', color: 'C3', layout: 'inline', forcePlain: true });
  return w;
}

/**
 * Co-op: the compact pods have no room for plates, so the same first-sight lines go to the caption
 * rail at the top centre, once a room each (clarity S2.9).
 */
function coopCaptions(p: Player, a: HandHud) {
  const w = p.world;
  const say = (id: string) => { if (onceThisRoom(w, 'cap:' + id)) { Terms.seen(id); Caption.say(null, { term: id, key: 'term:' + id, dur: 3.2 }); } };
  if (termOn(p, 'tape')) say('tape');
  if (termOn(p, 'sand')) say('sand');
  if (a.gainShown >= 0.5 && a.ok && Terms.showPlain('hpPromise')) say('hpPromise');
  if (a.lockShown >= 0.5 && Terms.showPlain('fixed')) say('fixed');
}

// ───────────────────────── chain (top centre) ─────────────────────────
/** the top-centre "CHAIN ×N" slot (paradox chains call show) */
export const HudChain = {
  n: 0, t: 0, color: 'C3' as string,
  /** first chains: "连锁 – 爆炸引爆其他残响" under the counter (GDD2 §9.8) */
  plain: false,
  show(n: number, color = 'C3') {
    if (this.t <= 0 || n < this.n) { this.plain = Terms.showPlain('chain'); if (this.plain && n >= 2) Terms.seen('chain'); }
    this.n = n; this.t = 1.6; this.color = color;
  },
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
    const t = HudChain.plain ? term('chain') : null;
    if (t) Text.draw(ctx, t.plain, r.x + r.w / 2, r.y + 10 + Math.ceil(Text.lineH('title') / 2) + 2, { size: 'small', align: 'center', color: 'K9', plate: true });
    ctx.globalAlpha = a0;
  },
});

export type { HudRect };
