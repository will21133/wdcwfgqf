// In-run HUD (PLAN2 §1.6, GDD2 §12.2): one pod per hand plus shared areas, built from registered widgets.
//
//   Hud.register({ id, area, order, draw(ctx, p, rect) })   register / replace a widget by id
//   Hud.podRect(slot)                                       where a hand's pod sits this frame
//
// Areas
//   pod     one per hand. Solo: 176×44 top-left, frameless, exactly where 1.0's HUD was.
//           Co-op: 132×32 in the corners (I top-left, II top-right, III bottom-left, IV bottom-right)
//           with a slot-coloured frame, the roman numeral and the shape badge.
//           Pod widgets sit in rows (row 0 hp / tape, row 1 sand, row 2 dash · special · tempo …);
//           the compact pod folds row 2 into row 1. Within a row widgets flow left → right by order,
//           each taking width(p, compact) px (default: the rest of the row) plus a 4 px gap.
//   corner  the shared purse: top-right in solo (1.0), top-centre in co-op
//   top     objectives, chains: the top-centre band (below the purse in co-op)
//   bottom  build slots, boss bar: the bottom band (compact = co-op)
//
// Widget ids / orders (PLAN2 §1.6): hp 10 (F3) · tape 20 (F3) · sand 30 (F3) · dash 40 · special 50 ·
// tempo 60 (P1) · keystone 70 (P4) · objective (top, P2) · chain (top, F3) · brass (corner) ·
// slots (bottom, P4) · metaKey (pod, P6). F2 registers hp / sand as wrappers of 1.0's bar and
// hourglasses until F3 replaces them, plus dash, special, brass, slots and the boss bar.
import { devices } from '../../engine/devices';
import type { Renderer } from '../../engine/gfx/renderer';
import type { World } from '../world/world';
import type { Player } from '../entities/player';
import { G } from '../G';
import { rect, hourglass, gearIcon, coinIcon, shardIcon } from './draw';
import { damp, ease } from '../../engine/math';
import { col } from '../../art/palette';
import { Text } from './text';
import { drawPanel, SLOT_COLOR } from './widgets';
import { MEMORIES } from '../progression/memories';
import { patronSigil, partIcon, SLOT_GLYPH } from '../../art/sprites/icons';
import { drawSlotBadge, drawSlotPlate, ROMAN_LATIN } from '../players';
import { S } from '../strings';
import '../strings/f2';

export interface HudRect { x: number; y: number; w: number; h: number; compact: boolean }
export type HudArea = 'pod' | 'top' | 'bottom' | 'corner';

export interface HudWidget {
  id: string;
  area: HudArea;
  order: number;
  draw(ctx: CanvasRenderingContext2D, p: Player | null, rect: HudRect): void;
  /** pod widgets: row (default by order: < 20 → 0, < 40 → 1, else 2; the compact pod folds 2 into 1) */
  row?: number;
  /** pod widgets: width in its row this frame (default: the rest of the row) */
  width?(p: Player | null, compact: boolean): number;
  /** once per frame per hand (pod) or once (other areas), before drawing; animate here */
  update?(dt: number, p: Player | null, w: World): void;
  /** skip this widget when false (e.g. only in solo) */
  visible?(p: Player | null, compact: boolean): boolean;
}

const WIDGETS: HudWidget[] = [];
/** per-area widget lists in draw order, rebuilt only when a widget is (un)registered */
const SORTED = new Map<HudArea, HudWidget[]>();
const sorted = (a: HudArea): HudWidget[] => {
  let l = SORTED.get(a);
  if (!l) SORTED.set(a, (l = WIDGETS.filter((w) => w.area === a).sort((x, y) => x.order - y.order)));
  return l;
};

/** pod geometry */
const SOLO = { x: 8, y: 6, w: 176, h: 44 };
const PODW = 132, PODH = 32, EDGE = 6;
/** solo rows: 1.0's HP bar, hourglass row and pip row (content starts after the 14 px gear column) */
const SOLO_ROWS = [{ y: 6, h: 7 }, { y: 18, h: 13 }, { y: 34, h: 4 }];
const SOLO_X = 14;
/** compact rows: HP bar, then sand + dash + special on one line (content after the 16 px badge column) */
const COMPACT_ROWS = [{ y: 5, h: 5 }, { y: 15, h: 13 }];
const COMPACT_X = 21;

let multiNow = false;

export const Hud = {
  /** add a widget, or replace the one with the same id */
  register(w: HudWidget): void {
    const i = WIDGETS.findIndex((x) => x.id === w.id);
    if (i >= 0) WIDGETS[i] = w; else WIDGETS.push(w);
    SORTED.clear();
  },
  unregister(id: string): void { const i = WIDGETS.findIndex((x) => x.id === id); if (i >= 0) WIDGETS.splice(i, 1); SORTED.clear(); },
  get(id: string): HudWidget | undefined { return WIDGETS.find((x) => x.id === id); },
  ids(): string[] { return WIDGETS.map((w) => w.id); },
  /** co-op layout this frame (more than one hand on screen) */
  get multi(): boolean { return multiNow; },
  /** a hand's pod: solo 176×44 top-left; co-op 132×32 in the slot's corner */
  podRect(slot: number): HudRect {
    if (!multiNow) return { ...SOLO, compact: false };
    const s = ((slot % 4) + 4) % 4;
    return { x: s % 2 ? 640 - EDGE - PODW : EDGE, y: s >= 2 ? 360 - EDGE - PODH : EDGE, w: PODW, h: PODH, compact: true };
  },
  /** the shared-area rects */
  areaRect(a: Exclude<HudArea, 'pod'>): HudRect {
    const m = multiNow;
    if (a === 'corner') return m ? { x: 270, y: EDGE, w: 100, h: 14, compact: true } : { x: 532, y: 6, w: 100, h: 30, compact: false };
    if (a === 'top') return m ? { x: 170, y: EDGE + 18, w: 300, h: 40, compact: true } : { x: 170, y: 6, w: 300, h: 40, compact: false };
    return { x: 0, y: 322, w: 640, h: 38, compact: m };
  },
};

/** pod rows for a hand: the rect each pod widget gets */
function podLayout(p: Player | null, pod: HudRect): { w: HudWidget; r: HudRect }[] {
  const rows = pod.compact ? COMPACT_ROWS : SOLO_ROWS;
  const x0 = pod.x + (pod.compact ? COMPACT_X : SOLO_X);
  const right = pod.x + pod.w - (pod.compact ? 5 : 0);
  const cursor = rows.map(() => x0);
  const out: { w: HudWidget; r: HudRect }[] = [];
  for (const w of sorted('pod')) {
    if (w.visible && !w.visible(p, pod.compact)) continue;
    let row = w.row ?? (w.order < 20 ? 0 : w.order < 40 ? 1 : 2);
    row = Math.min(row, rows.length - 1);
    const R = rows[row];
    const x = cursor[row];
    const width = Math.max(0, Math.min(right - x, w.width ? w.width(p, pod.compact) : right - x));
    out.push({ w, r: { x, y: pod.y + R.y, w: width, h: R.h, compact: pod.compact } });
    cursor[row] = x + width + (pod.compact && row === 1 ? 6 : 4);
  }
  return out;
}

// ───────────────────────── per-hand animation state ─────────────────────────
interface HandAnim { hpShown: number; hpTrail: number; chargeFlash: number[]; lastCharges: number; flash: number }
const anim = new Map<Player, HandAnim>();
function A(p: Player): HandAnim {
  let a = anim.get(p);
  if (!a) anim.set(p, (a = { hpShown: p.hp, hpTrail: p.hp, chargeFlash: [], lastCharges: 0, flash: 0 }));
  return a;
}

// ───────────────────────── F2 widgets ─────────────────────────
/** hp (temporary: 1.0's brass-capped bar; F3 replaces it with the three-colour bar) */
Hud.register({
  id: 'hp', area: 'pod', order: 10,
  update(dt, p) {
    if (!p) return;
    const a = A(p);
    a.hpShown = damp(a.hpShown, p.hp, 25, dt);
    if (p.hp >= a.hpTrail) a.hpTrail = p.hp;
    else a.hpTrail = Math.max(p.hp, a.hpTrail - dt * 30);
  },
  draw(ctx, p, r) {
    if (!p) return;
    const a = A(p);
    const m = p.lo.mods;
    const low = p.hp / p.maxHp < 0.3 && Math.floor(G.time * 4) % 2;
    if (!r.compact) {
      // 1.0, pixel for pixel: gear, bar 70 + maxHp × 0.3 wide (≤ 150), digits after it
      gearIcon(ctx, r.x - 12, r.y - 1, 'B4', 'B2', low ? 'R4' : 'R3');
      const bw = Math.min(150, Math.round(70 + m.maxHp * 0.3));
      bar(ctx, r.x, r.y, bw, 7, p, a);
      G.digits.draw(ctx, `${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`, r.x + bw + 5, r.y + 3.5 - 4.5 * Text.k, { fill: 'K10' });
      return;
    }
    // compact: the bar takes the row, the digits (sized for full health so the bar never jumps) sit right
    const dw = Math.ceil(G.digits.measure(`${p.maxHp}/${p.maxHp}`));
    const bw = Math.max(24, r.w - dw - 6);
    bar(ctx, r.x, r.y, bw, r.h, p, a);
    G.digits.draw(ctx, `${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`, r.x + r.w, r.y + r.h / 2 - 4.5 * Text.k, { fill: low ? 'R4' : 'K10', align: 'right' });
  },
});

function bar(ctx: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number, p: Player, a: HandAnim) {
  rect(ctx, bx - 1, by - 1, bw + 2, bh + 2, 'K0');
  rect(ctx, bx, by, bw, bh, 'K2');
  const tw = Math.round((bw * a.hpTrail) / p.maxHp);
  const fw = Math.round((bw * Math.max(0, a.hpShown)) / p.maxHp);
  rect(ctx, bx, by, tw, bh, 'K9');
  rect(ctx, bx, by, fw, bh, 'R2');
  rect(ctx, bx, by, fw, 2, 'R3');
  rect(ctx, bx, by, Math.min(fw, 2), 1, 'R4');
  // brass tube ticks every 10 hp
  for (let i = 10; i < p.maxHp && p.maxHp < 400; i += 10) rect(ctx, bx + Math.round((bw * i) / p.maxHp), by + bh - 2, 1, 2, 'K1');
  // brass caps
  rect(ctx, bx - 2, by - 2, 2, bh + 4, 'B3');
  rect(ctx, bx + bw, by - 2, 2, bh + 4, 'B3');
}

/** sand (temporary: 1.0's hourglass charges; F3 replaces it with the sand pool) */
Hud.register({
  id: 'sand', area: 'pod', order: 30,
  width: (p) => (p ? p.lo.mods.rewindCharges * 12 - 3 : 0),
  update(dt, p) {
    if (!p) return;
    const a = A(p), lo = p.lo;
    if (lo.charges > a.lastCharges) a.chargeFlash[lo.charges - 1] = 0.5;
    a.lastCharges = lo.charges;
    for (let i = 0; i < a.chargeFlash.length; i++) if (a.chargeFlash[i] > 0) a.chargeFlash[i] -= dt;
  },
  draw(ctx, p, r) {
    if (!p) return;
    const a = A(p), lo = p.lo, m = lo.mods;
    const alpha = ctx.globalAlpha;
    for (let i = 0; i < m.rewindCharges; i++) {
      const hx = r.x + i * 12;
      const full = i < lo.charges;
      const filling = i === lo.charges;
      hourglass(ctx, hx, r.y, filling ? lo.sandFrac : 0, full, G.time, !full && !filling);
      if (full) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = col('C1');
        ctx.globalAlpha = alpha * (0.25 + Math.sin(G.time * 4 + i) * 0.1 + Math.max(0, a.chargeFlash[i] ?? 0) * 1.4);
        ctx.fillRect(hx - 2, r.y - 2, 13, 17);
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  },
});

/** dash pips (one per charge) */
Hud.register({
  id: 'dash', area: 'pod', order: 40,
  width: (p) => (p ? p.lo.mods.dashCharges * 6 : 0),
  draw(ctx, p, r) {
    if (!p) return;
    const y = r.y + Math.round((r.h - 4) / 2);
    for (let i = 0; i < p.lo.mods.dashCharges; i++) {
      const on = i < p.dashCharges;
      rect(ctx, r.x + i * 6, y, 4, 3, 'K0');
      rect(ctx, r.x + i * 6 + 1, y, 2, 2, on ? 'K9' : 'K3');
    }
  },
});

/** special cooldown dial */
Hud.register({
  id: 'special', area: 'pod', order: 50,
  width: () => 13,
  draw(ctx, p, r) {
    if (!p) return;
    const wpn = p.weapon, m = p.lo.mods;
    const y = r.y + Math.round((r.h - 4) / 2);
    const cdFrac = wpn.specialCd > 0 ? wpn.specialCd / (wpn.specialCooldown * m.specialCd) : 0;
    rect(ctx, r.x, y - 1, 13, 5, 'K0');
    rect(ctx, r.x + 1, y, 11, 3, 'K3');
    rect(ctx, r.x + 1, y, Math.round(11 * (1 - cdFrac)), 3, cdFrac > 0 ? 'B2' : 'B5');
  },
});

/** the shared purse (+ time shards): top-right in solo, top-centre in co-op */
let brassShown = 0;
let brassRun: { brass: number; shards: number } | null = null;
Hud.register({
  id: 'brass', area: 'corner', order: 10,
  update(dt, _p, w) { brassRun = w.run ?? null; brassShown = damp(brassShown, w.run?.brass ?? 0, 12, dt); },
  draw(ctx, _p, r) {
    const run = brassRun;
    if (!run) return;
    const brass = String(Math.round(brassShown));
    if (!r.compact) {
      // 1.0: coin at the right edge, digits to its left; shards below
      coinIcon(ctx, r.x + r.w - 8, r.y + 5);
      G.digits.draw(ctx, brass, r.x + r.w - 11, r.y + 8.5 - 4.5 * Text.k, { fill: 'B5', align: 'right' });
      if (run.shards > 0) {
        shardIcon(ctx, r.x + r.w - 8, r.y + 17);
        G.digits.draw(ctx, String(run.shards), r.x + r.w - 11, r.y + 21 - 4.5 * Text.k, { fill: 'V4', align: 'right' });
      }
      return;
    }
    // co-op: one plate centred on the screen's top edge: coin brass · shard shards
    const bw = Math.ceil(G.digits.measure(brass));
    const sh = run.shards > 0 ? String(run.shards) : '';
    const sw = sh ? Math.ceil(G.digits.measure(sh)) : 0;
    const total = 7 + 3 + bw + (sh ? 8 + 7 + 3 + sw : 0);
    const x0 = Math.round(r.x + r.w / 2 - total / 2), cy = r.y + Math.round(r.h / 2);
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.85;
    rect(ctx, x0 - 5, r.y, total + 10, r.h, 'K0');
    ctx.globalAlpha = a;
    rect(ctx, x0 - 5, r.y + r.h, total + 10, 1, 'B2');
    coinIcon(ctx, x0, cy - 3);
    G.digits.draw(ctx, brass, x0 + 10, cy - 4.5 * Text.k, { fill: 'B5' });
    if (sh) {
      const sx = x0 + 10 + bw + 8;
      shardIcon(ctx, sx, cy - 4);
      G.digits.draw(ctx, sh, sx + 10, cy - 4.5 * Text.k, { fill: 'V4' });
    }
  },
});

/** build slots (bottom-left, solo only; in co-op they live in the pocket watch). P4 replaces this. */
Hud.register({
  id: 'slots', area: 'bottom', order: 10,
  visible: (_p, compact) => !compact,
  draw(ctx, p, r) {
    if (!p) return;
    const lo = p.lo;
    const slots = ['attack', 'special', 'dash', 'rewind', 'echo'];
    const y0 = r.y + 12;
    slots.forEach((sl, i) => {
      const x = r.x + 10 + i * 22;
      const om = lo.memories.find((m) => MEMORIES[m.id]?.slot === sl);
      rect(ctx, x - 1, y0 - 1, 20, 20, 'K0');
      rect(ctx, x, y0, 18, 18, om ? 'K2' : 'K1');
      if (om) {
        const d = MEMORIES[om.id];
        ctx.drawImage(patronSigil(d.patron).img, x, y0);
        rect(ctx, x, y0 + 17, 18, 1, ['B3', 'U3', 'V3', 'O2'][om.rarity]);
      } else {
        const g = SLOT_GLYPH[sl];
        ctx.fillStyle = col('K3');
        g.forEach((row, j) => { for (let k = 0; k < row.length; k++) if (row[k] !== '.') ctx.fillRect(x + 5 + k, y0 + 5 + j, 1, 1); });
      }
    });
    const extra = lo.memories.filter((m) => !slots.includes(MEMORIES[m.id]?.slot)).length;
    if (extra) G.digits.draw(ctx, '+' + extra, r.x + 10 + 5 * 22, y0 + 9 - 4.5 * Text.k, { fill: 'K8' });
    if (lo.parts.length) {
      const px = r.x + 10 + 5 * 22 + (extra ? 4 + Math.ceil(G.digits.measure('+' + extra)) : 2);
      ctx.drawImage(partIcon('gear').img, px, y0 + 1);
      G.digits.draw(ctx, String(lo.parts.length), px + 17, y0 + 9 - 4.5 * Text.k, { fill: 'B5' });
    }
  },
});

// ───────────────────────── pod frame (co-op) ─────────────────────────
function drawPodFrame(ctx: CanvasRenderingContext2D, slot: number, r: HudRect, p: Player | null, dim: boolean) {
  const s = ((slot % 4) + 4) % 4;
  const cw = COMPACT_X - 7;
  drawSlotPlate(ctx, s, r.x, r.y, r.w, r.h, { dim, column: cw });
  // stopped: the rim flashes so teammates notice from across the room
  if (p?.state === 'stopped' && Math.floor(G.time * 3) % 2 === 0) { rect(ctx, r.x + 2, r.y + 1, r.w - 4, 1, 'K10'); rect(ctx, r.x + 2, r.y + r.h - 2, r.w - 4, 1, 'K10'); }
  // badge column: shape on top, roman numeral under it
  const cx = r.x + 2 + cw / 2;
  drawSlotBadge(ctx, s, cx, r.y + 10, dim ? 'K6' : SLOT_COLOR[s]);
  Text.draw(ctx, ROMAN_LATIN[s], cx, r.y + 22, { size: 'tiny', align: 'center', valign: 'middle', color: dim ? 'K7' : 'K10', shadow: false });
}

/** a co-op pod's state line in place of the bars (stopped / ghost / joining next room) */
function podStatus(ctx: CanvasRenderingContext2D, r: HudRect, text: import('../i18n').L10n, color: string, sub?: string) {
  const x = r.x + COMPACT_X, w = r.w - COMPACT_X - 5;
  const cy = r.y + r.h / 2;
  Text.draw(ctx, text, x, cy, { size: 'small', color, valign: 'middle', maxW: w });
  if (sub) G.digits.draw(ctx, sub, r.x + r.w - 5, cy - 4.5 * Text.k, { fill: 'K9', align: 'right' });
}

// ───────────────────────── HUD (one per scene) ─────────────────────────
export class HUD {
  alpha = 1;
  boss: import('../entities/boss').Boss | null = null;
  /** co-op: slots that joined mid-run and walk in at the next room (their pod says so) */
  pending: number[] = [];
  /** when each slot's pod first showed (G.time; -99 = there from the start) */
  private seen = new Map<number, number>();
  private primed = false;

  /** a newly joined pod slides in from its screen edge */
  private slide(r: HudRect, slot: number): HudRect {
    const t0 = this.seen.get(slot) ?? -99;
    const k = Math.min(1, (G.time - t0) / 0.4);
    if (k >= 1 || !r.compact) return r;
    const off = Math.round((1 - ease.outBack(k)) * (r.h + 10));
    return { ...r, y: r.y < 180 ? r.y - off : r.y + off };
  }

  update(dt: number, w: World) {
    multiNow = w.playerCount > 1 || this.pending.length > 0;
    for (const p of w.players) for (const wd of sorted('pod')) wd.update?.(dt, p, w);
    const lead = w.player;
    for (const a of ['corner', 'top', 'bottom'] as const) for (const wd of sorted(a)) wd.update?.(dt, lead, w);
    // forget hands that left
    for (const p of anim.keys()) if (!w.players.includes(p)) anim.delete(p);
  }

  /** draw the HUD; `only` limits it to some areas (the workshop shows co-op pods only) */
  render(r: Renderer, w: World, only?: HudArea[]) {
    const ctx = r.ui2;
    multiNow = w.playerCount > 1 || this.pending.length > 0;
    const lead = w.player;
    if (!lead) return;
    ctx.globalAlpha = this.alpha;
    const want = (a: HudArea) => !only || only.includes(a);
    // ── pods ──
    if (want('pod')) {
      // a hand that joins while the scene runs: its pod drops into its corner (the hands that were
      // there when the scene began just sit in place)
      const slotsNow = [...w.players.map((p) => p.slot), ...this.pending];
      const lost = devices.lostSlots();
      for (const s of slotsNow) if (!this.seen.has(s)) this.seen.set(s, this.primed ? G.time : -99);
      this.primed = true;
      for (const p of w.players) {
        const pod = this.slide(Hud.podRect(p.slot), p.slot);
        if (pod.compact) {
          // a hand whose pad went away: the pod greys out and says so until it is back
          if (lost.includes(p.slot)) {
            drawPodFrame(ctx, p.slot, pod, p, true);
            podStatus(ctx, pod, S('f2', 'podLost'), Math.floor(G.time * 2) % 2 ? 'K10' : 'K8');
            continue;
          }
          drawPodFrame(ctx, p.slot, pod, p, p.state === 'ghost');
          if (p.state === 'ghost') { podStatus(ctx, pod, S('f2', 'ghost'), 'K8'); continue; }
          if (p.state === 'stopped') {
            const left = Math.max(0, Math.ceil(15 - p.down.t));
            podStatus(ctx, pod, S('f2', 'stopped'), Math.floor(G.time * 3) % 2 ? 'K10' : p.color, String(left));
            continue;
          }
        }
        for (const { w: wd, r: rr } of podLayout(p, pod)) wd.draw(ctx, p, rr);
      }
      for (const slot of this.pending) {
        if (w.players.some((p) => p.slot === slot)) continue;
        const pod = this.slide(Hud.podRect(slot), slot);
        drawPodFrame(ctx, slot, pod, null, true);
        podStatus(ctx, pod, S('f2', 'joinNext'), 'K9');
      }
    }
    // ── shared areas ──
    for (const a of ['corner', 'top', 'bottom'] as const) {
      if (!want(a)) continue;
      const ar = Hud.areaRect(a);
      for (const wd of sorted(a)) if (!wd.visible || wd.visible(lead, ar.compact)) wd.draw(ctx, lead, ar);
    }
    ctx.globalAlpha = 1;

    // ── boss bar ──
    if (this.boss && want('bottom')) {
      const b = this.boss;
      const bw = 300, x = 320 - bw / 2, y = 336;
      // name sits just above the bar (letters end 5 px above it at any text scale)
      Text.draw(ctx, b.bossName, 320, y - 5 - Text.inkH('body') / 2, { align: 'center', color: 'K10', outline: 'K0', valign: 'middle' });
      rect(ctx, x - 2, y - 2, bw + 4, 9, 'K0');
      rect(ctx, x - 1, y - 1, bw + 2, 7, 'B2');
      rect(ctx, x, y, bw, 5, 'K2');
      const fw = Math.round((bw * b.shownHp) / b.maxHp), hw = Math.round((bw * b.hp) / b.maxHp);
      rect(ctx, x, y, fw, 5, 'K9');
      rect(ctx, x, y, hw, 5, b.phase ? 'O1' : 'R2');
      rect(ctx, x, y, hw, 2, b.phase ? 'O2' : 'R3');
      for (const ph of b.phases) { rect(ctx, x + Math.round(bw * ph), y - 2, 1, 9, 'B5'); }
      // brass end caps with gears
      rect(ctx, x - 6, y - 3, 4, 11, 'B3'); rect(ctx, x + bw + 2, y - 3, 4, 11, 'B3');
    }

    // ── crosshair for whoever aims with the mouse (co-op: its centre is their colour) ──
    if (!only || only.includes('pod')) {
      const mp = w.players.find((p) => p.input.usesMouse) ?? null;
      if (mp && mp.input.mouseAim && G.input.mouseInside && mp.hp > 0 && (mp.state === 'alive' || mp.state === 'ghost')) {
        const mx = Math.round(G.input.mx), my = Math.round(G.input.my);
        const c = 'K10';
        rect(ctx, mx - 4, my, 3, 1, c); rect(ctx, mx + 2, my, 3, 1, c);
        rect(ctx, mx, my - 4, 1, 3, c); rect(ctx, mx, my + 2, 1, 3, c);
        rect(ctx, mx, my, 1, 1, multiNow ? mp.color : 'R4');
      }
    }
  }
}
