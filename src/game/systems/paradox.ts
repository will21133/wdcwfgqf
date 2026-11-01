// 悖论 Paradox 2.0 (GDD2 §3.6, PLAN2 §1.8; P4 owns this file in production).
//
//   overlap  walk into an armed (◆) echo: a r48 burst at the midpoint, 50 × damage coefficient
//   pierce   dash through one: a 96 × 20 line along the dash, 70 ×, gives a dash back
//   chain    a burst that reaches another armed echo (anyone's) sets it off on the next tick: ring n
//            deals ×(1 + 0.25 (n − 1)); the HUD counts "CHAIN ×N"
//   duet     the echo is a teammate's: radius ×1.25, both hands +25 Sand, a two-colour ring
//   recall   a recalled echo reaches its hand: 75%, no Sand
//   quartet  reserved (four hands within 0.5 s: an achievement, P4/P7)
// Every paradox hits breakables (crates, glass cases, cracked walls) too, gives the hand 0.5 s of
// invulnerability and +20 Sand, deals heavy Break damage, pushes teammates without hurting them,
// and kills of a Culprit are a Grandfather Paradox (+100 Sand). hg_stable keeps the echo but it
// cannot go off again for 1 s.
//
// Paradox.touch(p) runs every tick from Player.update; Paradox.preview(p) is what the hand will set
// off if it touches the nearest armed echo now (the dashed ground circle / line, GDD2 §3.6).
import type { Player } from '../entities/player';
import type { Echo } from '../entities/echo';
import type { Actor } from '../entities/entity';
import type { World } from '../world/world';
import { circleHits, type Shape, type DamageInfo } from './combat';
import { G, sfx } from '../G';
import { settings } from '../settings';
import { slotColor } from '../players';
import { HudChain, termCallout } from '../ui/rewindHud';
import { S } from '../strings';
import '../strings/f3';
import type { ParadoxKind } from './bus';
import type { Renderer } from '../../engine/gfx/renderer';
import { col } from '../../art/palette';
import { TAU } from '../../engine/math';
import { rect } from '../ui/draw';

export type { ParadoxKind };
export interface ParadoxLine { ax: number; ay: number; bx: number; by: number; w: number }
export interface ParadoxOpts {
  x: number; y: number;
  /** the hand credited with it (damage, Sand, hooks) */
  owner: Player;
  echo?: Echo;
  kind: ParadoxKind;
  dmgMul?: number;
  /** burst radius (default: the owner's mods.paradoxRadius, ×1.25 for a duet) */
  radius?: number;
  /** a line burst (pierce) instead of a circle */
  line?: ParadoxLine;
  /** ring number in a chain (1 = the first blast) */
  chain?: number;
  /** a teammate's echo (set by touch) */
  duet?: Player;
}
export interface ParadoxPreview {
  kind: 'circle' | 'line';
  x: number; y: number;
  r?: number;
  line?: ParadoxLine;
  echo: Echo;
  duet: boolean;
  /** armed echoes the blast would chain into */
  chains: Echo[];
  /** enemies inside it */
  targets: Actor[];
}

/** GDD2 §3.6: preview range, pierce line (length / width / how far behind the echo it starts) */
export const PREVIEW_R = 56, PIERCE_LEN = 96, PIERCE_W = 20, PIERCE_BACK = 32;
/** duet: radius × and Sand each hand gets */
export const DUET_R = 1.25, DUET_SAND = 25;
/**
 * hg_stable (GDD2 §3.6): a kept echo can go off again only after this long — a hair over 1 s, so
 * standing in it for 2 s sets off at most two paradoxes (1.0 fired every 0.1 s)
 */
export const STABLE_CD = 1.1;
/** Grandfather Paradox: a paradox kills a Culprit (GDD2 §3.8) */
export const GRANDFATHER_SAND = 100;
/** how close the dash direction must point at an echo for the line preview (rad) */
const AIM_CONE = 0.45;
/** one hand sets off at most one paradox a tick by touch */
const lastTouch = new WeakMap<Player, number>();

function armedEchoes(w: World): Echo[] {
  const out: Echo[] = [];
  for (const p of w.players) for (const e of p.echoes) if (e.paradoxReady && !e.dead) out.push(e);
  return out;
}

function pierceLine(e: Echo, dx: number, dy: number): ParadoxLine {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  return { ax: e.x - ux * PIERCE_BACK, ay: e.y - uy * PIERCE_BACK, bx: e.x + ux * (PIERCE_LEN - PIERCE_BACK), by: e.y + uy * (PIERCE_LEN - PIERCE_BACK), w: PIERCE_W };
}
function shapeOf(o: { x: number; y: number; r?: number; line?: ParadoxLine }): Shape {
  if (o.line) return { t: 'line', x0: o.line.ax, y0: o.line.ay, x1: o.line.bx, y1: o.line.by, r: o.line.w / 2 };
  return { t: 'circle', x: o.x, y: o.y, r: o.r ?? 48 };
}

export const Paradox = {
  /**
   * A paradox goes off (PLAN2 §1.8). Damages enemies and breakables in the circle (or line), pays
   * the hand, chains into other armed echoes next tick, and announces itself.
   */
  trigger(o: ParadoxOpts): void {
    const p = o.owner;
    const w = p.world;
    if (!w) return;
    const m = p.mods;
    const chain = Math.max(1, o.chain ?? 1);
    const duet = !!o.duet;
    const R = o.radius ?? m.paradoxRadius * (duet ? DUET_R : 1);
    const base = o.kind === 'pierce' ? m.paradoxPierceDmg : m.paradoxDmg;
    const mul = (o.dmgMul ?? 1) * (1 + m.paradoxChainMul * (chain - 1));
    const dmg = base * m.dmg * mul;
    const shape = shapeOf({ x: o.x, y: o.y, r: R, line: o.line });
    const cx = o.line ? (o.line.ax + o.line.bx) / 2 : o.x, cy = o.line ? (o.line.ay + o.line.by) / 2 : o.y;
    let culpritKill = false;
    const hitOne = (t: Actor) => {
      if (t.dead || t.falling > 0) return;
      if (!circleHits(shape, t.x, t.y - 4, t.r + 2)) return;
      const culprit = (t.culpritOf.get(p.slot) ?? 0) > 0;
      const info: DamageInfo = { amount: dmg, kind: 'paradox', owner: p, x: cx, y: cy, knock: 260, via: 'paradox', hitstop: 0.02, heavy: true, echo: false };
      t.hurt(info);
      if (culprit && t.dead && t.team === 'enemy') culpritKill = true;
    };
    for (const t of w.enemies.slice()) hitOne(t);
    for (const t of w.breakables.slice()) hitOne(t);
    // teammates are shoved, never hurt (GDD2 §5.7)
    for (const q of w.players) {
      if (q === p || q.state !== 'alive' || q.rewinding) continue;
      if (!circleHits(shape, q.x, q.y - 4, q.r + 2)) continue;
      const a = Math.atan2(q.y - cy, q.x - cx);
      q.kx += Math.cos(a) * 160; q.ky += Math.sin(a) * 160;
    }
    // the hand: half a second safe, +20 Sand (a recall gives none; a duet +25 to both)
    p.invuln = Math.max(p.invuln, m.paradoxInvuln);
    if (o.kind !== 'recall') p.lo.addSand(m.paradoxSand);
    if (duet && o.duet) { p.lo.addSand(DUET_SAND); o.duet.lo.addSand(DUET_SAND); }
    if (o.kind === 'pierce' && p.dashCharges < m.dashCharges) p.dashCharges++;
    if (culpritKill) Paradox.grandfather(p, cx, cy);
    Paradox.fx(o, R, chain);
    w.stats.paradoxes++;
    w.bus.emit('paradox', { x: cx, y: cy, echo: o.echo as Echo, player: p, kind: o.kind, chain, duet });
    // the echo itself: gone, or (hg_stable) kept but quiet for 1 s
    const e = o.echo;
    if (e && !e.dead) {
      if (o.kind !== 'recall' && m.paradoxKeepsEcho) e.paradoxCd = STABLE_CD;
      else e.shatter(null, { paradox: true });
    }
    // Mainspring VI: the paradox leaves a short standing echo at its centre (it can chain again)
    if (m.paradoxLeavesEcho > 0 && !(e && e.fromParadox) && e) {
      const left = p.spawnEcho({ frames: [{ ...e.rec.frames[e.rec.frames.length - 1], x: cx, y: cy, anim: 0 }, { ...e.rec.frames[e.rec.frames.length - 1], x: cx, y: cy, anim: 0 }], events: [] }, { kind: 'statue', life: m.paradoxLeavesEcho, taunt: 0 });
      if (left) left.fromParadox = true;
    }
    // chain: every other armed echo the blast reaches goes off on the next tick
    const reach = Math.max(R, m.paradoxChainRange);
    const chained: Echo[] = [];
    for (const ec of armedEchoes(w)) {
      if (ec === e) continue;
      const hit = o.line ? circleHits(shape, ec.x, ec.y, reach - R + 4) : Math.hypot(ec.x - cx, ec.y - cy) <= reach;
      if (hit) chained.push(ec);
    }
    if (chained.length) {
      for (const ec of chained) ec.paradoxCd = Math.max(ec.paradoxCd, 0.05);
      w.after(1 / 60, () => {
        let n = chain;
        for (const ec of chained) {
          if (ec.dead || !ec.armed) continue;
          n++;
          // a chained echo goes off for its own hand; the count runs on through the chain
          Paradox.trigger({ x: ec.x, y: ec.y, owner: ec.owner, echo: ec, kind: 'chain', chain: n });
        }
      });
    }
  },

  /** the blast itself: rings (two-colour for a duet), sparks, the word, the shake, the sound */
  fx(o: ParadoxOpts, R: number, chain: number) {
    const p = o.owner, w = p.world;
    const cx = o.line ? (o.line.ax + o.line.bx) / 2 : o.x, cy = o.line ? (o.line.ay + o.line.by) / 2 : o.y;
    const c2 = o.duet ? slotColor(o.duet.slot) : 'W';
    if (o.line) {
      const L = o.line;
      const steps = 8;
      for (let k = 0; k <= steps; k++) {
        const x = L.ax + ((L.bx - L.ax) * k) / steps, y = L.ay + ((L.by - L.ay) * k) / steps;
        w.fx.ring(x, y - 4, 2, 12, 0.3, k % 2 ? 'C4' : c2, 2);
      }
      w.fx.burst(cx, cy - 6, 30, ['W', 'C4', 'C3', 'C2'], 260, 0.5);
    } else {
      w.fx.ring(o.x, o.y - 4, 4, R + 6, 0.45, 'C4', 3);
      w.fx.ring(o.x, o.y - 4, 2, R * 0.7, 0.3, c2, 2);
      if (o.duet) w.fx.ring(o.x, o.y - 4, 6, R + 12, 0.55, slotColor(p.slot), 2);
      w.fx.burst(o.x, o.y - 6, 30, ['W', 'C4', 'C3', 'C2'], 240, 0.55);
    }
    // one word per blast that starts a chain; the rings that follow are counted by "CHAIN ×N" up top
    const word = o.kind === 'pierce' ? 'pierce' : o.kind === 'recall' ? 'recallParadox' : o.duet ? 'duet' : 'paradox';
    if (o.kind !== 'chain') w.fx.stamp(cx, cy - 34, S('f3', word), 'C3', 0.9, { rule: o.duet ? slotColor(o.duet.slot) : 'C4', term: o.duet ? 'duet' : 'paradox' });
    if (chain >= 2) HudChain.show(chain, chain >= 4 ? 'B5' : 'C3');
    w.hitstop(chain >= 2 ? 0.06 : 0.1);
    w.shake(chain >= 2 ? 0.3 : 0.45);
    if (settings.flashes) G.r.params.flash = Math.max(G.r.params.flash ?? 0, chain >= 2 ? 0.2 : 0.35);
    if (chain >= 2) sfx('paradoxChain', { pitch: chain, pan: w.pan(cx) });
    else sfx('paradox');
    p.input.rumble(1, 0.8, 260);
    o.duet?.input.rumble(0.6, 0.6, 200);
    G.audio.duck(0.4, 0.7);
  },

  /** a paradox killed a Culprit: the Grandfather Paradox (GDD2 §3.8) */
  grandfather(p: Player, x: number, y: number) {
    const w = p.world;
    p.lo.addSand(GRANDFATHER_SAND);
    w.fx.stamp(x, y - 52, S('f3', 'grandfather'), 'B5', 1.4, { rule: 'R3' });
    sfx('perfectRewind', { vol: 0.8 });
    w.bus.emit('custom', { id: 'grandfatherParadox', player: p });
  },

  /**
   * Contact (every tick from Player.update): the hand touches an armed echo (anyone's) within its
   * contact radius — walking in = overlap, dashing through = pierce, a teammate's = duet.
   */
  touch(p: Player): boolean {
    const w = p.world;
    if (p.state !== 'alive' || p.rewinding || p.hp <= 0 || p.falling > 0) return false;
    if (lastTouch.get(p) === w.tickNo) return false;
    for (const q of w.players) for (const e of q.echoes) {
      if (!e.paradoxReady || Math.hypot(e.x - p.x, e.y - p.y) >= e.contactR) continue;
      lastTouch.set(p, w.tickNo);
      const duet = e.owner !== p ? e.owner : undefined;
      if (p.dashT > 0) {
        Paradox.trigger({ x: e.x, y: e.y, owner: p, echo: e, kind: 'pierce', line: pierceLine(e, p.dashVX, p.dashVY), duet });
      } else {
        Paradox.trigger({ x: (e.x + p.x) / 2, y: (e.y + p.y) / 2, owner: p, echo: e, kind: 'overlap', duet });
      }
      return true;
    }
    return false;
  },

  /** draw the preview for this hand (Player.renderUnlit) */
  render(r: Renderer, p: Player): void { renderPreview(r, p); },

  /** what touching the nearest armed echo within 56 px would do now (PLAN2 §1.8) */
  preview(p: Player): ParadoxPreview | null {
    const w = p.world;
    if (!w || p.state !== 'alive' || p.rewinding) return null;
    const m = p.mods;
    const range = PREVIEW_R + (m.flags.paradoxPreviewR ?? 0);
    let best: Echo | null = null, bd = range;
    for (const e of armedEchoes(w)) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return null;
    const e = best;
    const duet = e.owner !== p;
    // dashing at it (or about to: moving toward it with a dash left) previews the pierce line
    let mx = p.dashT > 0 ? p.dashVX : p.moveX, my = p.dashT > 0 ? p.dashVY : p.moveY;
    const toward = Math.atan2(e.y - p.y, e.x - p.x);
    const moving = Math.hypot(mx, my) > 0.1;
    const aimed = moving && Math.abs(angleBetween(Math.atan2(my, mx), toward)) < AIM_CONE && (p.dashT > 0 || p.dashCharges > 0) && bd > 8;
    let out: ParadoxPreview;
    if (aimed) {
      if (!moving) { mx = Math.cos(toward); my = Math.sin(toward); }
      const line = pierceLine(e, mx, my);
      out = { kind: 'line', x: e.x, y: e.y, line, echo: e, duet, chains: [], targets: [] };
    } else {
      const r = m.paradoxRadius * (duet ? DUET_R : 1);
      out = { kind: 'circle', x: e.x, y: e.y, r, echo: e, duet, chains: [], targets: [] };
    }
    const shape = shapeOf(out);
    const R = out.r ?? PIERCE_W / 2;
    const reach = Math.max(out.r ?? 48, m.paradoxChainRange);
    for (const t of w.enemies) if (!t.dead && circleHits(shape, t.x, t.y - 4, t.r + 2)) out.targets.push(t);
    for (const ec of armedEchoes(w)) {
      if (ec === e) continue;
      const hit = out.line ? circleHits(shape, ec.x, ec.y, reach - R + 4) : Math.hypot(ec.x - out.x, ec.y - out.y) <= reach;
      if (hit) out.chains.push(ec);
    }
    return out;
  },
};

/**
 * The preview on the ground (GDD2 §3.6): a C2 dashed circle (or the pierce line when the hand is
 * heading at the echo with a dash left), a ▾ over each enemy it would catch, a dashed tether to
 * each armed echo it would chain into. First sight: the plain-language line beside it.
 */
function renderPreview(r: Renderer, p: Player) {
  const pv = Paradox.preview(p);
  if (!pv) return;
  const w = p.world;
  const u = r.u;
  const t = w.time;
  const c1 = pv.duet ? slotColor(pv.echo.owner.slot) : 'C2';
  const march = Math.floor(t * 12);
  if (pv.kind === 'circle') {
    const R = pv.r!, cx = Math.round(pv.x), cy = Math.round(pv.y - 2);
    u.globalAlpha = 0.16;
    u.fillStyle = col('C1');
    u.beginPath(); u.ellipse(cx, cy, R, R * 0.72, 0, 0, TAU); u.fill();
    // marching dashes with a dark under-edge, so the ring reads on any floor
    const n = Math.max(32, Math.round(R * 1.7));
    u.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      if (((i + march) % 5) >= 3) continue;
      const a = (i / n) * TAU;
      const x = Math.round(cx + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R * 0.72);
      u.fillStyle = col('K0'); u.fillRect(x, y + 1, 1, 1);
      u.fillStyle = col(pv.duet && i % 10 < 5 ? c1 : 'C3'); u.fillRect(x, y, 1, 1);
    }
  } else {
    const L = pv.line!;
    const dx = L.bx - L.ax, dy = L.by - L.ay, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, hw = L.w / 2;
    u.globalAlpha = 0.16;
    u.fillStyle = col('C1');
    u.beginPath();
    u.moveTo(L.ax + nx * hw, L.ay + ny * hw - 2); u.lineTo(L.bx + nx * hw, L.by + ny * hw - 2);
    u.lineTo(L.bx - nx * hw, L.by - ny * hw - 2); u.lineTo(L.ax - nx * hw, L.ay - ny * hw - 2);
    u.closePath(); u.fill();
    u.globalAlpha = 1;
    for (let k = 0; k <= len; k += 1) {
      if (((k + march) % 5) >= 3) continue;
      const x = L.ax + (dx * k) / len, y = L.ay + (dy * k) / len;
      for (const sgn of [1, -1]) {
        const px = Math.round(x + nx * hw * sgn), py = Math.round(y + ny * hw * sgn - 2);
        u.fillStyle = col('K0'); u.fillRect(px, py + 1, 1, 1);
        u.fillStyle = col(c1 === 'C2' ? 'C3' : c1); u.fillRect(px, py, 1, 1);
      }
    }
    // an arrowhead at the far end: the dash goes this way
    const ax = Math.round(L.bx), ay = Math.round(L.by - 2), ux = dx / len, uy = dy / len;
    for (let k = 0; k < 4; k++) {
      u.fillStyle = col('C4');
      u.fillRect(Math.round(ax - ux * k + nx * k), Math.round(ay - uy * k + ny * k), 1, 1);
      u.fillRect(Math.round(ax - ux * k - nx * k), Math.round(ay - uy * k - ny * k), 1, 1);
    }
  }
  u.globalAlpha = 1;
  // who it would catch
  for (const e of pv.targets) {
    const x = Math.round(e.x), y = Math.round(e.y - e.height - 4 + Math.sin(t * 8 + e.id) * 1);
    rect(u, x - 3, y - 1, 7, 4, 'K0');
    rect(u, x - 2, y, 5, 1, 'C4'); rect(u, x - 1, y + 1, 3, 1, 'C4'); rect(u, x, y + 2, 1, 1, 'C4');
  }
  // which echoes it would chain into
  for (const ec of pv.chains) {
    const dx = ec.x - pv.x, dy = ec.y - pv.y, d = Math.hypot(dx, dy) || 1;
    for (let k = 6; k < d - 4; k += 3) {
      if (((k / 3 + march) | 0) % 2) continue;
      u.globalAlpha = 0.7;
      u.fillStyle = col('C3');
      u.fillRect(Math.round(pv.x + (dx * k) / d), Math.round(pv.y - 8 + (dy * k) / d), 1, 1);
    }
    u.globalAlpha = 1;
    // a chain link at the far end
    const lx = Math.round(ec.x), ly = Math.round(ec.y - 14);
    rect(u, lx - 3, ly - 2, 7, 5, 'K0');
    rect(u, lx - 2, ly - 1, 2, 1, 'C4'); rect(u, lx - 2, ly + 1, 2, 1, 'C4'); rect(u, lx - 3, ly, 1, 1, 'C4');
    rect(u, lx + 1, ly - 1, 2, 1, 'C3'); rect(u, lx + 1, ly + 1, 2, 1, 'C3'); rect(u, lx + 3, ly, 1, 1, 'C3');
    rect(u, lx, ly, 1, 1, 'K10');
  }
  // first sight: name + plain line by the circle (placed with the other callouts)
  termCallout(r, w, pv.duet ? 'duet' : 'paradox', pv.x, pv.y + (pv.r ?? 12) * 0.72 + 2, { prio: 6, supersedes: ['armed'] });
}

function angleBetween(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
