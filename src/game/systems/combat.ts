import type { Actor, Entity, Team } from '../entities/entity';
import type { World } from '../world/world';
import { angleDiff, clamp, TAU } from '../../engine/math';
import { frand } from '../../engine/rng';
import { sfx } from '../G';

export type DmgKind = 'melee' | 'proj' | 'aoe' | 'dot' | 'paradox' | 'contact' | 'fall' | 'status';

export interface DamageInfo {
  amount: number;
  kind: DmgKind;
  /** attacker (player / echo / enemy) */
  owner?: Actor | null;
  /** origin for knockback */
  x?: number; y?: number;
  /** knockback impulse (px/s) */
  knock?: number;
  crit?: boolean;
  /** unrewindable (violet) damage */
  fixed?: boolean;
  /** dealt by an echo */
  echo?: boolean;
  /** statuses applied on hit */
  burn?: number; rust?: number; stasis?: number; resonance?: number; slow?: number; stun?: number;
  /** skip hitstop / shake */
  quiet?: boolean;
  /** hitstop override (seconds) */
  hitstop?: number;
  /** internal: released from stasis storage */
  fromStasis?: boolean;
  /** source identifier for stats / effects */
  src?: string;
  /** ignore invulnerability (e.g. falling) */
  pierceInvuln?: boolean;
}

export type Shape =
  | { t: 'circle'; x: number; y: number; r: number }
  | { t: 'arc'; x: number; y: number; r: number; a: number; w: number; r0?: number }
  | { t: 'line'; x0: number; y0: number; x1: number; y1: number; r: number };

export interface Hitbox {
  shape: Shape;
  team: Team;
  info: DamageInfo;
  /** ticks remaining */
  life: number;
  hit: Set<number>;
  /** repeat hit interval (seconds) — 0 = once per target */
  rehit?: number;
  rehitT?: Map<number, number>;
  /** follow an entity (offset kept) */
  follow?: Entity;
  fx?: number; fy?: number;
  onHit?: (target: Actor, dealt: number) => void;
  /** max targets */
  pierce?: number;
}

function circleHits(s: Shape, x: number, y: number, r: number): boolean {
  switch (s.t) {
    case 'circle': {
      const dx = x - s.x, dy = y - s.y, rr = s.r + r;
      return dx * dx + dy * dy <= rr * rr;
    }
    case 'arc': {
      const dx = x - s.x, dy = y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > s.r + r) return false;
      if (s.r0 && d < s.r0 - r) return false;
      if (d < r + 4) return true;
      const a = Math.atan2(dy, dx);
      // widen arc by target radius
      const extra = Math.atan2(r, Math.max(1, d));
      return Math.abs(angleDiff(s.a, a)) <= s.w + extra;
    }
    case 'line': {
      const vx = s.x1 - s.x0, vy = s.y1 - s.y0;
      const L2 = vx * vx + vy * vy || 1;
      let t = ((x - s.x0) * vx + (y - s.y0) * vy) / L2;
      t = clamp(t, 0, 1);
      const px = s.x0 + vx * t, py = s.y0 + vy * t;
      const dx = x - px, dy = y - py, rr = s.r + r;
      return dx * dx + dy * dy <= rr * rr;
    }
  }
}

export class Combat {
  hitboxes: Hitbox[] = [];
  constructor(private world: World) {}

  add(hb: Partial<Hitbox> & { shape: Shape; team: Team; info: DamageInfo }): Hitbox {
    const h: Hitbox = { life: 1, hit: new Set(), ...hb } as Hitbox;
    if (h.follow) {
      const c = shapeCenter(h.shape);
      h.fx = c.x - h.follow.x;
      h.fy = c.y - h.follow.y;
    }
    this.hitboxes.push(h);
    return h;
  }

  clear() { this.hitboxes.length = 0; }

  update(dt: number) {
    const w = this.world;
    for (let i = this.hitboxes.length - 1; i >= 0; i--) {
      const hb = this.hitboxes[i];
      if (hb.follow) {
        if (hb.follow.dead) { this.hitboxes.splice(i, 1); continue; }
        moveShape(hb.shape, hb.follow.x + hb.fx! - shapeCenter(hb.shape).x, hb.follow.y + hb.fy! - shapeCenter(hb.shape).y);
      }
      const targets = hb.team === 'player' ? (w.breakables.length ? [...w.enemies, ...w.breakables] : w.enemies) : hb.team === 'enemy' ? w.playerTeam : [];
      for (const t of targets) {
        if (t.dead || t.falling > 0) continue;
        if (!circleHits(hb.shape, t.x, t.y - 4, t.r + 2)) continue;
        if (hb.rehit) {
          hb.rehitT ??= new Map();
          const last = hb.rehitT.get(t.id) ?? -99;
          if (w.time - last < hb.rehit) continue;
          hb.rehitT.set(t.id, w.time);
        } else {
          if (hb.hit.has(t.id)) continue;
          hb.hit.add(t.id);
        }
        const info = { ...hb.info };
        if (info.x === undefined) { const c = shapeCenter(hb.shape); info.x = c.x; info.y = c.y; }
        const dealt = t.hurt(info);
        if (dealt > 0) hb.onHit?.(t, dealt);
        if (hb.pierce !== undefined && --hb.pierce <= 0) { hb.life = 0; break; }
      }
      hb.life--;
      if (hb.life <= 0) this.hitboxes.splice(i, 1);
    }
  }

  /** Central damage resolution. Returns damage dealt. */
  applyDamage(t: Actor, info: DamageInfo): number {
    const w = this.world;
    if (t.dead) return 0;
    if (t.invuln > 0 && !info.pierceInvuln) return 0;
    let amt = info.amount;
    // rust: +4% damage taken per stack
    if (t.st.rust > 0 && info.kind !== 'fall') amt *= 1 + t.st.rust * 0.04 * (w.run?.mods.rustPower ?? 1);
    // stasis: store instead of dealing
    if (t.st.stasis > 0 && !info.fromStasis && t.team === 'enemy') {
      t.st.stasisStored += amt;
      t.flash = 0.06;
      this.hitFx(t, info, amt, true);
      if (info.owner && info.owner.team === 'player') {
        w.run?.addSand(amt * (info.echo ? 0.5 : 1));
        w.bus.emit('hit', { target: t, info, dealt: amt });
      }
      return amt;
    }
    // player-side mitigation handled by player.hurt override before reaching here
    amt = Math.max(info.kind === 'dot' ? 0.5 : 1, amt);
    const before = t.hp;
    t.hp -= amt;
    const dealt = Math.min(before, amt);
    t.lastHit = info;
    t.flash = 0.1;
    // knockback
    if (info.knock && info.x !== undefined) {
      const dx = t.x - info.x, dy = t.y - (info.y ?? t.y);
      const d = Math.hypot(dx, dy) || 1;
      const k = info.knock / t.mass;
      t.kx += (dx / d) * k;
      t.ky += (dy / d) * k;
    }
    if (amt >= t.poise && info.kind !== 'dot' && info.kind !== 'status') t.hitstun = Math.max(t.hitstun, 0.18);
    // statuses
    if (info.burn) this.addStatus(t, 'burn', info.burn);
    if (info.rust) this.addStatus(t, 'rust', info.rust);
    if (info.resonance) this.addStatus(t, 'resonance', info.resonance);
    if (info.slow) { t.st.slow = Math.max(t.st.slow, info.slow); t.st.slowAmt = 0.4; }
    if (info.stun && !t.isBoss) t.st.stun = Math.max(t.st.stun, info.stun);
    if (info.stasis) this.addStatus(t, 'stasis', info.stasis);

    t.onHurt(info, dealt);
    this.hitFx(t, info, amt, false);

    if (info.owner && info.owner.team === 'player' && t.team === 'enemy') {
      w.run?.addSand(dealt * (info.echo ? 0.5 : 1));
      w.stats.damage += dealt;
      w.bus.emit('hit', { target: t, info, dealt });
    }
    if (t.hp <= 0) {
      t.hp = 0;
      t.die(info);
      if (t.team === 'enemy') {
        w.bus.emit('kill', { target: t, info });
        w.stats.kills++;
      }
    }
    return dealt;
  }

  addStatus(t: Actor, s: 'burn' | 'rust' | 'stasis' | 'resonance', n: number) {
    const st = t.st;
    const mods = this.world.run?.mods;
    switch (s) {
      case 'burn':
        st.burn = Math.min(mods?.burnMax ?? 10, st.burn + n);
        st.burnT = 4;
        break;
      case 'rust':
        st.rust += n;
        if (st.rust >= 10) {
          st.rust = 0;
          // corrode burst
          this.world.fx.corrode(t.x, t.y - 6);
          this.applyDamage(t, { amount: 30 * (mods?.corrodeMul ?? 1), kind: 'status', x: t.x, y: t.y, src: 'corrode', owner: this.world.player });
          for (const e of this.world.enemiesNear(t.x, t.y, 40)) if (e !== t) this.addStatus(e, 'rust', 3);
        }
        break;
      case 'stasis':
        if (t.isBoss) n *= 0.4;
        if (st.stasis <= 0) { st.stasisStored = 0; sfx('stasis', { vol: 0.6 }); }
        st.stasis = Math.max(st.stasis, n);
        break;
      case 'resonance':
        st.resonance = Math.min(mods?.resonanceMax ?? 3, st.resonance + n);
        break;
    }
    this.world.bus.emit('statusApplied', { target: t, status: s, stacks: n });
  }

  /** per-tick status processing for an actor; returns true if actor is frozen this tick */
  tickStatus(t: Actor, dt: number): boolean {
    const st = t.st;
    if (st.burn > 0) {
      st.burnT -= dt;
      st.burnTick -= dt;
      if (st.burnTick <= 0) {
        st.burnTick = 0.5;
        const dmg = st.burn * 1 * (this.world.run?.mods.burnMul ?? 1);
        this.applyDamage(t, { amount: dmg, kind: 'dot', src: 'burn', owner: t.team === 'enemy' ? this.world.player : null, quiet: true });
        this.world.fx.burnTick(t);
      }
      if (st.burnT <= 0) st.burn = 0;
    }
    if (st.slow > 0) st.slow -= dt;
    if (st.stun > 0) st.stun -= dt;
    if (st.stasis > 0) {
      st.stasis -= dt;
      if (st.stasis <= 0) {
        st.stasis = 0;
        const stored = st.stasisStored * 1.5 * (this.world.run?.mods.stasisMul ?? 1);
        st.stasisStored = 0;
        if (stored > 0) {
          this.world.fx.stasisRelease(t.x, t.y - t.height / 2, stored);
          this.applyDamage(t, { amount: stored, kind: 'status', fromStasis: true, x: t.x, y: t.y + 1, knock: 60, src: 'stasis', owner: this.world.player });
        }
      }
      return true;
    }
    return false;
  }

  private hitFx(t: Actor, info: DamageInfo, amt: number, stored: boolean) {
    const w = this.world;
    const big = info.crit || amt >= 30;
    const color = info.fixed ? 'V3' : info.crit ? 'B5' : t.team === 'player' ? 'R4' : stored ? 'V4' : info.echo ? 'C3' : info.kind === 'dot' ? (info.src === 'burn' ? 'O2' : 'T4') : 'K10';
    w.fx.number(t.x, t.y - t.height - 2, amt, color, big);
    if (info.quiet || info.kind === 'dot') return;
    const ang = info.x !== undefined ? Math.atan2(t.y - (info.y ?? t.y), t.x - info.x) : frand(0, TAU);
    w.fx.hitSparks(t.x, t.y - t.height * 0.5, ang, info.echo ? 'echo' : t.team === 'player' ? 'blood' : big ? 'crit' : 'normal', amt);
    if (t.team === 'enemy') {
      const hs = info.hitstop ?? (big ? 0.075 : info.echo ? 0.02 : 0.045);
      w.hitstop(hs);
      w.shake(big ? 0.28 : info.echo ? 0.06 : 0.12);
      sfx(big ? 'hitCrit' : info.echo ? 'hitEcho' : 'hit', { vol: 0.8, pan: w.pan(t.x) });
    }
  }
}

export function shapeCenter(s: Shape): { x: number; y: number } {
  if (s.t === 'line') return { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 };
  return { x: s.x, y: s.y };
}
function moveShape(s: Shape, dx: number, dy: number) {
  if (s.t === 'line') { s.x0 += dx; s.x1 += dx; s.y0 += dy; s.y1 += dy; }
  else { s.x += dx; s.y += dy; }
}
