// 时间气泡 Time bubbles (GDD2 §3.2 / §5.6, PLAN2 §2 F3 item 3).
//
// While a hand rewinds (holding, scrubbing or travelling back), time around it crawls:
//   solo   the whole world runs at 0.15× (a bubble of infinite radius)
//   co-op  only a circle of radius 72 around the rewinding hand runs at 0.15× (enemies, bullets,
//          echoes); teammates and everything outside keep their own time.
// The rewinding hand itself always runs on real time (it is the one scrubbing the tape).
//
// World.update asks `scaleAt(x, y)` for every non-player entity and hands it its own dt; other
// systems may push short-lived bubbles of their own (tick-dodge slow, Asu's Still Frame) with
// `TimeBubbles.push`. world.timeScaleAt(x, y) = the world's time scale × this.
import type { Player } from '../entities/player';

/** GDD2 §3.12 */
export const BUBBLE_R = 72;
export const BUBBLE_SCALE = 0.15;
/** solo: the ripple circle drawn around the rewinding hand (GDD2 §3.2) */
export const SOLO_RIPPLE_R = 120;

export interface Bubble {
  x: number; y: number;
  /** radius in px; Infinity = the whole room */
  r: number;
  /** time multiplier inside (0..1) */
  scale: number;
  /** seconds left (real); < 0 = rebuilt every tick (a rewinding hand's) */
  t: number;
  owner: Player | null;
}

export class TimeBubbles {
  /** this tick's bubbles (rewinders first, then timed ones) */
  list: Bubble[] = [];
  private timed: Bubble[] = [];
  /** slowest whole-room multiplier this tick (1 = none) */
  global = 1;

  /**
   * Rebuild from the players (call once per tick before entities update). `solo`: one hand in the
   * room, so a rewind slows the whole world.
   */
  collect(players: Player[], solo: boolean, realDt: number) {
    this.list.length = 0;
    this.global = 1;
    for (const p of players) {
      if (p.dead || !p.rewinding) continue;
      const r = solo ? Infinity : BUBBLE_R;
      this.list.push({ x: p.x, y: p.y, r, scale: BUBBLE_SCALE, t: -1, owner: p });
    }
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const b = this.timed[i];
      b.t -= realDt;
      if (b.t <= 0) { this.timed.splice(i, 1); continue; }
      if (b.owner && !b.owner.dead) { b.x = b.owner.x; b.y = b.owner.y; }
      this.list.push(b);
    }
    for (const b of this.list) if (b.r === Infinity) this.global = Math.min(this.global, b.scale);
  }

  /** a timed bubble (follows `owner` if given); solo callers pass r = Infinity for a world slow */
  push(b: { x: number; y: number; r: number; scale: number; dur: number; owner?: Player | null }) {
    this.timed.push({ x: b.x, y: b.y, r: b.r, scale: b.scale, t: b.dur, owner: b.owner ?? null });
  }

  /** local multiplier from bubbles with a finite radius (the global one is applied separately) */
  localAt(x: number, y: number): number {
    let s = 1;
    for (const b of this.list) {
      if (b.r === Infinity) continue;
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) s = Math.min(s, b.scale);
    }
    return s;
  }

  /** full multiplier at a point (global × local) */
  scaleAt(x: number, y: number): number { return this.global * this.localAt(x, y); }

  /** the bubble a hand is rewinding inside (for rendering its rim) */
  of(p: Player): Bubble | null {
    for (const b of this.list) if (b.owner === p && b.t < 0) return b;
    return null;
  }

  clear() { this.list.length = 0; this.timed.length = 0; this.global = 1; }
}
