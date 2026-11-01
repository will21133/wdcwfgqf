// Shared camera for 2–4 hands (GDD2 §5.3): follow the midpoint of everyone standing (no aim
// look-ahead), keep every hand inside a 600×340 tether box around the view centre (the edge
// glows in the colour of whoever pushes it), show arrows for anyone off screen, and pull a hand
// that has been off screen — or stuck (lodged in a wall, or boxed in on all four sides) — for 2 s
// back to the nearest teammate (catch-up rewind: free, no echo).
// Solo play never comes here — its camera is 1.0's.
import type { World } from './world';
import type { Player } from '../entities/player';
import { VIEW_W, VIEW_H } from '../../engine/gfx/post';
import { rect } from '../ui/draw';
import { drawSlotBadge } from '../players';
import { sfx } from '../G';
import { G } from '../G';

/** tether half-size: 600×340 */
export const TETHER_HW = 300, TETHER_HH = 170;
/** off screen this long → catch-up rewind */
export const CATCH_UP_AFTER = 2;

interface Glow { slot: number; side: 'l' | 'r' | 't' | 'b'; at: number; a: number }
export interface CoopCam { glow: Glow[]; away: number[]; stuck?: number[] }

/** a hand that cannot move: inside solid ground, or every 3 px step blocked */
function trapped(w: World, p: Player): boolean {
  if (!w.boxFree(p.x, p.y, p.r)) return true;
  return !w.boxFree(p.x + 3, p.y, p.r) && !w.boxFree(p.x - 3, p.y, p.r) && !w.boxFree(p.x, p.y + 3, p.r) && !w.boxFree(p.x, p.y - 3, p.r);
}

/** per-tick camera + tether (GameScene.update, co-op only) */
export function coopCamera(w: World, st: CoopCam, dt: number) {
  const standing = w.alive();
  const ls = standing.length ? standing : w.players;
  if (!ls.length) return;
  let mx = 0, my = 0;
  for (const p of ls) { mx += p.x; my += p.y; }
  w.cam.follow(mx / ls.length, my / ls.length - 10, dt, 7);
  for (const g of st.glow) g.a -= dt * 3;
  st.glow = st.glow.filter((g) => g.a > 0);
  // the tether is centred where the camera is heading (not where it lags), so a hand is never
  // pulled back just because the camera is still catching up
  const c = w.cam.centreOf(w.cam.tx, w.cam.ty);
  for (const p of w.players) {
    if (p.state === 'stopped' || p.dead || p.rewinding || p.falling > 0) continue;
    // the tether only binds once a hand has walked in (the entry walk starts outside the room)
    if (p.autoWalk > 0) continue;
    let dx = 0, dy = 0;
    if (p.x < c.x - TETHER_HW) dx = c.x - TETHER_HW - p.x;
    else if (p.x > c.x + TETHER_HW) dx = c.x + TETHER_HW - p.x;
    if (p.y < c.y - TETHER_HH) dy = c.y - TETHER_HH - p.y;
    else if (p.y > c.y + TETHER_HH) dy = c.y + TETHER_HH - p.y;
    if (dx || dy) {
      w.move(p, dx, dy);
      const v = w.cam.view();
      if (dx) glow(st, p.slot, dx > 0 ? 'l' : 'r', p.y - v.y);
      if (dy) glow(st, p.slot, dy > 0 ? 't' : 'b', p.x - v.x);
    }
    // catch-up: off screen for 2 s (walls, a teleport, the camera lagging behind), or stuck for 2 s
    // (GDD2 §5.3) — e.g. lodged in a wall, which would otherwise hold the whole team at the door
    const v = w.cam.view();
    const off = p.x < v.x - 4 || p.x > v.x + VIEW_W + 4 || p.y - 8 < v.y - 4 || p.y > v.y + VIEW_H + 12;
    st.away[p.slot] = off ? (st.away[p.slot] ?? 0) + dt : 0;
    const stuck = (st.stuck ??= []);
    stuck[p.slot] = !p.locked && p.dashT <= 0 && trapped(w, p) ? (stuck[p.slot] ?? 0) + dt : 0;
    if ((st.away[p.slot] >= CATCH_UP_AFTER || stuck[p.slot] >= CATCH_UP_AFTER) && standing.some((q) => q !== p)) {
      st.away[p.slot] = 0;
      stuck[p.slot] = 0;
      catchUp(w, p);
    }
  }
}

function glow(st: CoopCam, slot: number, side: Glow['side'], at: number) {
  const g = st.glow.find((x) => x.slot === slot && x.side === side);
  if (g) { g.a = 1; g.at = at; } else st.glow.push({ slot, side, at, a: 1 });
}

/** free rewind-style hop to the nearest standing teammate (no echo, no sand) */
function catchUp(w: World, p: Player) {
  let best: Player | null = null, bd = Infinity;
  for (const q of w.players) {
    if (q === p || q.state !== 'alive') continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  if (!best) return;
  w.fx.ring(p.x, p.y - 6, 2, 22, 0.3, 'C3', 2);
  p.x = best.x + (p.slot % 2 ? 8 : -8);
  p.y = best.y + 4;
  if (!w.boxFree(p.x, p.y, p.r)) { p.x = best.x; p.y = best.y; }
  p.vx = p.vy = 0;
  p.recorder.clear();
  p.scarfA.reset(p.x, p.y - 10);
  p.scarfB.reset(p.x, p.y - 10);
  p.invuln = Math.max(p.invuln, 0.5);
  w.fx.ring(p.x, p.y - 6, 2, 30, 0.35, 'C3', 2);
  w.fx.burst(p.x, p.y - 8, 12, ['C4', 'C3', 'C2'], 100, 0.35);
  sfx('rewindEnd', { vol: 0.5, pan: w.pan(p.x) });
}

// ───────────────────────── UI layer ─────────────────────────
// arrowheads are rasterised from a triangle at one of 16 headings, so every direction has the
// same weight; each lit logical pixel gets a 1 px K0 outline
const ARROW_CACHE = new Map<number, [number, number][]>();
function arrowPixels(dir16: number): [number, number][] {
  let px = ARROW_CACHE.get(dir16);
  if (px) return px;
  px = [];
  const a = (dir16 / 16) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
  // a dart: tip (8, 0), back corners (-5, ±5), notch (-1, 0) — the notch makes the heading
  // unmistakable at any of the 16 angles
  const R = (x: number, y: number): [number, number] => [x * c - y * s, x * s + y * c];
  const tip = R(8, 0), bl = R(-5, -5), br = R(-5, 5), notch = R(-1, 0);
  const sign = (p: [number, number], q: [number, number], r: [number, number]) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const inTri = (P: [number, number], A: [number, number], B: [number, number], C: [number, number]) => {
    const d1 = sign(P, A, B), d2 = sign(P, B, C), d3 = sign(P, C, A);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
    const P: [number, number] = [x + 0.5, y + 0.5];
    if (inTri(P, tip, bl, notch) || inTri(P, tip, notch, br)) px.push([x, y]);
  }
  ARROW_CACHE.set(dir16, px);
  return px;
}
function drawArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, ang: number, c: string) {
  const d = ((Math.round(ang / (Math.PI / 8)) % 16) + 16) % 16;
  const px = arrowPixels(d);
  const x0 = Math.round(cx), y0 = Math.round(cy);
  for (const [x, y] of px) rect(ctx, x0 + x - 1, y0 + y - 1, 3, 3, 'K0');
  for (const [x, y] of px) rect(ctx, x0 + x, y0 + y, 1, 1, c);
}

/** arrows keep clear of the HUD: the corner pods (132×32), the purse and the boss bar */
const INSET = { l: 16, r: 16, t: 46, b: 46 };
/** bottom inset while the boss bar (y 334) and its name above it are on screen */
const INSET_BOSS = 60;

/**
 * tether glow on the screen edges + arrows to hands off screen (UI layer, 640×360 logical);
 * `boss`: the boss bar and its name are up, so arrows stay above them
 */
export function renderCoopEdges(ctx: CanvasRenderingContext2D, w: World, st: CoopCam, o: { boss?: boolean } = {}) {
  // tether glow: a soft band in the pusher's colour where they meet the edge, brightest at the rim
  const A = [0.9, 0.6, 0.35, 0.15];
  for (const g of st.glow) {
    const p = w.players.find((q) => q.slot === g.slot);
    if (!p) continue;
    const L = 84, at = Math.round(g.at);
    for (let i = 0; i < A.length; i++) {
      ctx.globalAlpha = Math.max(0, g.a) * A[i];
      const o = i * 8, len = L - i * 16;
      if (g.side === 'l') rect(ctx, i, at - L / 2 + o, 1, len, p.color);
      if (g.side === 'r') rect(ctx, VIEW_W - 1 - i, at - L / 2 + o, 1, len, p.color);
      if (g.side === 't') rect(ctx, at - L / 2 + o, i, len, 1, p.color);
      if (g.side === 'b') rect(ctx, at - L / 2 + o, VIEW_H - 1 - i, len, 1, p.color);
    }
  }
  ctx.globalAlpha = 1;
  const v = w.cam.view();
  for (const p of w.players) {
    const sx = p.x - v.x, sy = p.y - 10 - v.y;
    const M = 6;
    if (sx >= -M && sx <= VIEW_W + M && sy >= -M && sy <= VIEW_H + M) continue;
    // clamp the arrow onto a frame inside the screen (clear of the HUD), on the line from the centre
    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    const dx = sx - cx, dy = sy - cy;
    const hx = dx < 0 ? cx - INSET.l : VIEW_W - INSET.r - cx;
    const hy = dy < 0 ? cy - INSET.t : VIEW_H - (o.boss ? INSET_BOSS : INSET.b) - cy;
    const k = Math.min(hx / Math.max(1e-3, Math.abs(dx)), hy / Math.max(1e-3, Math.abs(dy)));
    const ax = cx + dx * k, ay = cy + dy * k;
    const urgent = p.state === 'stopped';
    const blink = urgent && Math.floor(G.time * 4) % 2 === 0;
    drawArrow(ctx, ax, ay, Math.atan2(dy, dx), blink ? 'K10' : p.color);
    // the hand's shape sits just inside the arrow
    const l = Math.hypot(dx, dy) || 1;
    drawSlotBadge(ctx, p.slot, Math.round(ax - (dx / l) * 16), Math.round(ay - (dy / l) * 16), p.state === 'ghost' ? 'K8' : undefined);
  }
}
