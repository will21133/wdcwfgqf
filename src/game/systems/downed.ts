// 停摆与复活 Stopped & Revive (GDD2 §5.5) and the solo Last Second window (GDD2 §3.10).
//
// A hand whose HP reaches 0 (after the 1.0 saves: hg_lastsecond / old watch, the second spring):
//   · solo  — Last Second: the world runs at 0.2× for 1.5 s with a big "REWIND!" prompt. Rewinding
//             out of it works like a normal rewind (DownedHooks.rewindOut; F3 swaps in the sand cost
//             and the 6 s tape burn). Otherwise the clock stops and the run ends (1.0).
//   · co-op — the hand freezes into a cracked clock face ringed by 12 ticks, one going dark every
//             1.25 s (15 s). In that time it can be
//               wound up    a teammate within 20 px holds Interact 1.2 s → 35% HP, 1.5 s invulnerable
//               echo-saved  a teammate's armed echo walks over it → 20% HP ("Your past saved you")
//               self-saved  first 3 s, rewinding out on its own (F3: sand cost + tape burn)
//               pulled back first 3 s, a teammate holds Rewind 0.4 s within 48 px (F3: DownedHooks.pullBack)
//             After 15 s it becomes a ghost hand: it can move and tap for 1 damage (the sand goes
//             to the nearest standing teammate) and is wound up at 25% when the next room starts.
// The run ends when every hand is stopped or a ghost (GameScene asks isOut()).
import type { Player } from '../entities/player';
import type { Renderer } from '../../engine/gfx/renderer';
import type { World } from '../world/world';
import type { PlayerInput } from '../../engine/input';
import { G, sfx } from '../G';
import { tr } from '../i18n';
import { S } from '../strings';
import '../strings/f2';
import { col } from '../../art/palette';
import { rect } from '../ui/draw';
import { Text } from '../ui/text';
import { drawPrompt, drawPromptLabel, promptW, promptH } from '../ui/widgets';
import { ROMAN, slotColor } from '../players';
import { drawSprite } from '../../engine/gfx/sprite';
import { keySprites } from '../entities/player';
import { TAU } from '../../engine/math';

/** solo Last Second window (real seconds) and its world speed */
export const LAST_SECOND = 1.5;
export const LAST_SECOND_SCALE = 0.2;
/** co-op: 12 ticks × 1.25 s */
export const STOP_TIME = 15;
export const STOP_TICKS = 12;
/** co-op: self-rescue / pull back window */
export const SELF_RESCUE = 3;
export const WINDUP_RANGE = 20;
export const WINDUP_HP = 0.35;
export const ECHO_RESCUE_HP = 0.2;
export const ROOM_REVIVE_HP = 0.25;
export const REVIVE_INVULN = 1.5;
/** how near a teammate must be to see the wind-up prompt */
const PROMPT_RANGE = 44;

/**
 * Seams for F3 / P5. Each is safe to replace at module load.
 */
export const DownedHooks = {
  /**
   * F3: rewinding out of a stop (solo Last Second, co-op self-rescue). Return true if the hand
   * rewound. Default (F2): the 1.0 rewind, paying one charge.
   */
  rewindOut: (p: Player): boolean => p.rewindFromStop(),
  /** F3: can this hand rewind out right now (drives the prompt's colour) */
  canRewindOut: (p: Player): boolean => p.canRewindFromStop(),
  /**
   * F3: Pull Back — `rescuer` holds Rewind 0.4 s within 48 px of `target` during its first 3 s.
   * Return true when it happened (F3 revives the target with source 'pullback'). null = off (F2).
   */
  pullBack: null as null | ((rescuer: Player, target: Player) => boolean),
  /** P5: seconds a hand needs to wind a teammate up (Ling: 0.6) */
  windupTime: (_rescuer: Player): number => 1.2,
};

/** per-hand downed state (lives on Player.down) */
export interface DownState {
  /** seconds since the stop (sim time) */
  t: number;
  /** solo Last Second: real seconds left (0 = over) */
  lastSecond: number;
  /** solo: the clock has stopped for good (death screen) */
  final: boolean;
  /** wind-up progress 0..1 and who is winding */
  wind: number;
  windBy: Player | null;
}

export const newDownState = (): DownState => ({ t: 0, lastSecond: 0, final: false, wind: 0, windBy: null });

const solo = (w: World) => w.playerCount <= 1;
// F2a stopgap until F3 builds fork: a pad's fork button (RB) rewinds too (see Player.update)
const rewindPressed = (p: Player) => p.input.pressed('rewind') || p.input.pressedOnPad('fork');

/** HP reached 0 (after the 1.0 saves) */
export function stop(p: Player) {
  const w = p.world;
  p.hp = 0;
  p.state = 'stopped';
  p.down = newDownState();
  p.deadT = 0;
  p.solid = false;
  p.weapon.cancel();
  p.dashT = 0; p.lungeT = 0; p.vx = p.vy = 0;
  if (solo(w)) {
    p.down.lastSecond = LAST_SECOND;
    w.slowmo(LAST_SECOND_SCALE, LAST_SECOND);
    sfx('heartbeat', { vol: 0.9 });
    G.audio.duck(0.35, LAST_SECOND);
    return;
  }
  sfx('playerDeath');
  w.fx.ring(p.x, p.y - 8, 3, 30, 0.45, p.color, 2);
  // above where the killing blow's damage number peaks (it rises ~32 px from y − 26)
  w.fx.banner(p.x, p.y - 64, tr(S('f2', 'stopped')), p.color, 1.4);
  p.input.rumble(0.9, 1, 400);
  w.bus.emit('downed', { player: p });
}

/** a stopped hand's tick (called from Player.update) */
export function updateStopped(p: Player, dt: number) {
  const w = p.world;
  const d = p.down;
  if (solo(w)) {
    if (d.final) { p.deadT += dt; return; }
    // Last Second runs on real time while the world crawls
    const real = dt / Math.max(0.05, w.timeScale);
    d.lastSecond -= real;
    if (d.lastSecond > 0) {
      w.timeScale = LAST_SECOND_SCALE;
      w.slowT = Math.max(w.slowT, d.lastSecond);
      if (rewindPressed(p) && DownedHooks.rewindOut(p)) { w.timeScale = 1; w.slowT = 0; return; }
      return;
    }
    d.final = true;
    d.lastSecond = 0;
    p.deadT = 0;
    sfx('playerDeath');
    w.bus.emit('downed', { player: p });
    return;
  }
  d.t += dt;
  // self-rescue (first 3 s)
  if (d.t <= SELF_RESCUE && rewindPressed(p) && DownedHooks.rewindOut(p)) return;
  // wind-up: the nearest standing teammate holding Interact
  let winder: Player | null = null, wd = WINDUP_RANGE;
  for (const q of w.players) {
    if (q === p || q.state !== 'alive' || q.locked) continue;
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    if (dist <= wd && q.input.down('interact')) { wd = dist; winder = q; }
  }
  if (winder) {
    if (d.windBy !== winder) { d.windBy = winder; sfx('cogWind', { vol: 0.6, pan: w.pan(p.x) }); }
    const time = Math.max(0.1, DownedHooks.windupTime(winder));
    const prev = d.wind;
    d.wind += dt / time;
    // the key turns four full times over the wind-up, a click every half turn
    p.keyAngle += (dt / time) * 4 * TAU;
    if (Math.floor(d.wind * 8) !== Math.floor(prev * 8)) sfx('cogCharge', { vol: 0.35, pan: w.pan(p.x) });
    if (d.wind >= 1) { p.revive(WINDUP_HP, winder, 'windup'); return; }
  } else {
    d.windBy = null;
    d.wind = Math.max(0, d.wind - dt * 1.5);
  }
  // pull back (F3)
  if (DownedHooks.pullBack && d.t <= SELF_RESCUE) {
    for (const q of w.players) if (q !== p && q.state === 'alive' && DownedHooks.pullBack(q, p)) return;
  }
  // echo rescue: a teammate's armed echo walks over the body
  for (const q of w.players) {
    if (q === p) continue;
    for (const e of q.echoes) {
      if (e.dead || !e.paradoxReady) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 10) {
        p.revive(ECHO_RESCUE_HP, q, 'echo');
        w.fx.banner(p.x, p.y - 44, tr(S('f2', 'echoSaved')), 'C3', 1.8);
        return;
      }
    }
  }
  if (d.t >= STOP_TIME) toGhost(p);
}

/**
 * The team shrank to this one hand (its teammate left mid-run): a stopped hand gets the solo
 * Last Second instead of dying on the spot; a ghost is wound up at the room-start share.
 */
export function nowSolo(p: Player) {
  if (p.state === 'ghost') { p.revive(ROOM_REVIVE_HP, null, 'room'); return; }
  if (p.state !== 'stopped' || p.down.final) return;
  p.down = newDownState();
  p.down.lastSecond = LAST_SECOND;
  p.world.slowmo(LAST_SECOND_SCALE, LAST_SECOND);
  sfx('heartbeat', { vol: 0.9 });
}

/** the 15 s ran out */
export function toGhost(p: Player) {
  const w = p.world;
  p.state = 'ghost';
  p.hp = 0;
  p.solid = false;
  // ghosts float over pits
  p.airborne = true;
  p.invuln = 0;
  p.ghostCd = 0;
  p.flash = 0;
  sfx('echoEnd', { vol: 0.8, pan: w.pan(p.x) });
  w.fx.burst(p.x, p.y - 10, 16, ['K10', 'K8', slotColor(p.slot)], 70, 0.6);
  w.fx.banner(p.x, p.y - 38, tr(S('f2', 'ghost')), 'K9', 1.6);
  w.bus.emit('ghost', { player: p });
}

/**
 * Out of the fight for the all-down check: a ghost, a stopped co-op hand past its self-rescue
 * window (or without the means to rewind), or a solo hand whose Last Second has run out.
 */
export function isOut(p: Player): boolean {
  if (p.state === 'alive') return false;
  if (p.state === 'ghost') return true;
  if (solo(p.world)) return p.down.final;
  return !(p.down.t <= SELF_RESCUE && DownedHooks.canRewindOut(p));
}

// ───────────────────────── rendering ─────────────────────────
/** the ring of 12 ticks on the floor: wide enough that the body hides none of them */
const TICK_RX = 19, TICK_RY = 8;

/** ground: the ring of 12 ticks (co-op) */
export function renderStoppedGround(r: Renderer, p: Player) {
  if (solo(p.world)) return;
  const ctx = r.u;
  const d = p.down;
  const left = Math.max(0, STOP_TICKS - Math.floor(d.t / (STOP_TIME / STOP_TICKS)));
  const wound = Math.floor(d.wind * STOP_TICKS);
  const blink = Math.floor(p.world.time * 6) % 2 === 0;
  const cx = Math.round(p.x), cy = Math.round(p.y);
  // the dial: a dark face on the floor with a rim, so the ticks read as one clock face
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = col('K0');
  ctx.beginPath(); ctx.ellipse(cx + 0.5, cy + 0.5, TICK_RX, TICK_RY, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = col('K0');
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(cx + 0.5, cy + 0.5, TICK_RX, TICK_RY, 0, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = col(p.color);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx + 0.5, cy + 0.5, TICK_RX, TICK_RY, 0, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  for (let i = 0; i < STOP_TICKS; i++) {
    const a = -Math.PI / 2 + (i / STOP_TICKS) * TAU;
    const x = Math.round(cx + Math.cos(a) * TICK_RX), y = Math.round(cy + Math.sin(a) * TICK_RY);
    const big = i % 3 === 0;
    // ticks go dark clockwise from twelve; winding re-lights them in the winder's colour
    const lit = i < left;
    let c = lit ? p.color : 'K4';
    if (lit && i === left - 1 && left < STOP_TICKS + 1 && blink && d.t % (STOP_TIME / STOP_TICKS) > STOP_TIME / STOP_TICKS - 0.4) c = 'K6';
    if (i < wound && d.windBy) c = d.windBy.color;
    // quarter ticks 3×3, the others 2×2, each with a K0 outline
    const sz = big ? 3 : 2, o = big ? 1 : 0;
    rect(ctx, x - o - 1, y - o - 1, sz + 2, sz + 2, 'K0');
    rect(ctx, x - o, y - o, sz, sz, c);
  }
}

/** body: a frozen, greyed hand with its key; the wind-up key turns big on its back */
export function renderStoppedBody(r: Renderer, p: Player, sprite: import('../../engine/gfx/sprite').Sprite) {
  const ctx = r.w;
  const d = p.down;
  const shake = d.windBy ? (Math.floor(p.world.time * 30) % 2 ? 0.5 : -0.5) : 0;
  drawSprite(ctx, sprite, p.x + shake, p.y, { flip: p.flip });
  drawSprite(ctx, sprite, p.x + shake, p.y, { flip: p.flip, tint: 'K4', alpha: 0.55 });
  const keys = keySprites();
  const k = keys[Math.floor((((p.keyAngle % TAU) + TAU) % TAU) / (TAU / 4)) % 4];
  const big = d.windBy ? 2 : 1;
  drawSprite(ctx, k, p.x, p.y - (big > 1 ? 16 : 12), { sx: big, sy: big, flip: p.flip });
  r.lightAt(p.x, p.y - 8, 34, p.color, 0.3);
}

/** unlit: the cracked clock face over the head and the wind-up arc (co-op) */
export function renderStoppedUnlit(r: Renderer, p: Player) {
  if (solo(p.world)) return;
  const ctx = r.u;
  const cx = Math.round(p.x), cy = Math.round(p.y) - 31;
  // 9×9 dial: K0 rim, K10 face, stopped hands at 11:59, a crack across
  rect(ctx, cx - 3, cy - 5, 7, 1, 'K0'); rect(ctx, cx - 3, cy + 5, 7, 1, 'K0');
  rect(ctx, cx - 5, cy - 3, 1, 7, 'K0'); rect(ctx, cx + 5, cy - 3, 1, 7, 'K0');
  rect(ctx, cx - 4, cy - 4, 1, 1, 'K0'); rect(ctx, cx + 4, cy - 4, 1, 1, 'K0'); rect(ctx, cx - 4, cy + 4, 1, 1, 'K0'); rect(ctx, cx + 4, cy + 4, 1, 1, 'K0');
  rect(ctx, cx - 3, cy - 4, 7, 9, 'K10'); rect(ctx, cx - 4, cy - 3, 9, 7, 'K10');
  rect(ctx, cx - 3, cy + 3, 7, 1, 'K8'); rect(ctx, cx - 4, cy + 2, 1, 1, 'K8'); rect(ctx, cx + 4, cy + 2, 1, 1, 'K8');
  rect(ctx, cx, cy - 3, 1, 4, 'K1'); rect(ctx, cx - 2, cy - 1, 2, 1, 'K1');
  // the crack
  rect(ctx, cx + 1, cy - 4, 1, 2, 'K2'); rect(ctx, cx + 2, cy - 2, 1, 1, 'K2'); rect(ctx, cx + 1, cy - 1, 1, 2, 'K2'); rect(ctx, cx + 2, cy + 1, 1, 2, 'K2'); rect(ctx, cx + 3, cy + 3, 1, 1, 'K2');
  rect(ctx, cx - 6, cy - 6, 1, 1, p.color); rect(ctx, cx + 6, cy - 6, 1, 1, p.color);
}

/** world UI: "hold [Interact] to wind up II" over a stopped hand, in the nearest teammate's own glyphs */
export function renderStoppedLabel(r: Renderer, p: Player) {
  const w = p.world;
  if (solo(w) || p.state !== 'stopped') return;
  let near: Player | null = null, nd = PROMPT_RANGE;
  for (const q of w.players) {
    if (q === p || q.state !== 'alive') continue;
    const dd = Math.hypot(q.x - p.x, q.y - p.y);
    if (dd < nd) { nd = dd; near = q; }
  }
  if (!near) return;
  const who: PlayerInput = near.input;
  const text = tr(S('f2', 'windUp')).replace('{n}', ROMAN[p.slot % 4]);
  // under the dial, so it never fights the clock face, the banner or damage numbers above
  const x = p.x, y = p.y + 10;
  const k = p.down.wind;
  r.worldUi((ctx, toUi) => {
    const q = toUi(x, y);
    const wpl = drawPromptLabel(ctx, 'interact', text, q.x, q.y, { who, color: 'K10' });
    // wind-up progress under the plate
    if (k > 0) {
      const bw = Math.max(24, wpl - 8), bx = Math.round(q.x - bw / 2), by = Math.round(q.y + Math.max(promptH(), Math.ceil(Text.inkH('body')) + 2) + 3);
      rect(ctx, bx - 1, by - 1, bw + 2, 4, 'K0');
      rect(ctx, bx, by, bw, 2, 'K3');
      rect(ctx, bx, by, Math.round(bw * Math.min(1, k)), 2, near!.color);
    }
  });
}

/**
 * solo Last Second: centre-screen "REWIND!" in big letters, and under it the hand's own rewind
 * button with a 12px line (the key sits next to text of its own size, not dwarfed by the title).
 * Without sand only "No sand left" shows: no button that would do nothing. UI layer, 640×360.
 */
export function renderLastSecondUi(ctx: CanvasRenderingContext2D, p: Player) {
  if (!solo(p.world) || p.state !== 'stopped' || p.down.final || p.down.lastSecond <= 0) return;
  const can = DownedHooks.canRewindOut(p);
  const k = p.down.lastSecond / LAST_SECOND;
  const pulse = Math.floor(G.time * 8) % 2 === 0;
  const text = tr(S('f2', can ? 'lastSecond' : 'noSand'));
  const sub = tr(S('f2', 'lastSecondHint'));
  const lt = Math.ceil(Text.lineH('title')), ph = promptH();
  const tw = Math.ceil(Text.measure(text, 'title').w);
  const iw = promptW('rewind', p.input), sw = Math.ceil(Text.measure(sub, 'body').w);
  const row2 = can ? iw + 5 + sw : 0;
  const W = Math.max(tw, row2) + 28;
  const H = lt + (can ? 4 + Math.max(ph, Math.ceil(Text.lineH('body'))) : 0) + 14;
  const x0 = Math.round(320 - W / 2), y0 = Math.round(132 - H / 2);
  ctx.globalAlpha = 0.85;
  rect(ctx, x0, y0, W, H, 'K0');
  ctx.globalAlpha = 1;
  // the window running out: both rims shrink toward the centre
  const rw = Math.round(W * k), rx = Math.round(320 - rw / 2);
  rect(ctx, rx, y0, rw, 1, can ? 'C3' : 'K6');
  rect(ctx, rx, y0 + H - 1, rw, 1, can ? 'C3' : 'K6');
  Text.draw(ctx, text, 320, y0 + 7 + lt / 2, { size: 'title', align: 'center', color: can ? (pulse ? 'C4' : 'C3') : 'K7', outline: 'K0', valign: 'middle' });
  if (!can) return;
  const by = y0 + 7 + lt + 4, bx = Math.round(320 - row2 / 2);
  drawPrompt(ctx, 'rewind', bx, by, p.input);
  Text.draw(ctx, sub, bx + iw + 5, by + ph / 2, { color: 'K9', valign: 'middle' });
}

/** colour of a slot for UI that only has a slot number */
export const downColor = (p: Player) => col(p.color);
