// Floor 4 — 钟面 The Clockface. Knights of the Great Clock, its hands turned into weapons, the
// stars themselves, and the dark mirror of your own past.  (HP ≈ 2.2× floor 1.)
import { Enemy } from '../enemy';
import { Entity, Actor } from '../entity';
import type { Renderer } from '../../../engine/gfx/renderer';
import { drawSprite, Sprite } from '../../../engine/gfx/sprite';
import {
  buildMinuteKnight, minuteBladeRot, buildHourLancer, hourLanceRot, buildStarShard, buildExecutioner, pendulumRot,
  cfArcSmear, DIZZY_STAR,
} from '../../../art/sprites/clockface';
import { rapierRot } from '../../../art/sprites/weapons';
import { Bullet } from '../projectile';
import { Pickup } from '../pickup';
import { Afterimage, Smear } from '../fxents';
import { Scarf } from '../scarf';
import { tickFrames } from '../player';
import type { Dir } from '../../../art/sprites/tick';
import type { Pose } from '../../weapons/weapon';
import type { DamageInfo } from '../../systems/combat';
import type { EnemyDef } from '../../world/enemyDef';
import { frand } from '../../../engine/rng';
import { angleTo, angleDiff, TAU, clamp, ease } from '../../../engine/math';
import { col } from '../../../art/palette';
import { sfx } from '../../G';

type Art<T> = () => T;
function lazy<T>(f: () => T): Art<T> { let v: T | null = null; return () => (v ??= f()); }
const KNI = lazy(buildMinuteKnight), LAN = lazy(buildHourLancer), SHA = lazy(buildStarShard), EXE = lazy(buildExecutioner);

const lerpA = (a: number, b: number, k: number) => a + angleDiff(a, b) * clamp(k, 0, 1);

// ───────────────────────────── shared helpers ─────────────────────────────
/** short-lived crescent smear in the floor-4 palettes (steel / violet / dark) */
class CfSmear extends Entity {
  t = 0;
  constructor(private follow: Entity | null, private ox: number, private oy: number, private R: number, private thick: number,
    private sweep: number, private ang: number, private cw: boolean, private pal: 'steel' | 'violet' | 'dark', private dur = 0.14) {
    super();
    if (follow) { this.x = follow.x + ox; this.y = follow.y + oy; } else { this.x = ox; this.y = oy; }
  }
  update(dt: number) {
    this.t += dt;
    if (this.follow && !this.follow.dead) { this.x = this.follow.x + this.ox; this.y = this.follow.y + this.oy; }
    if (this.t >= this.dur) this.kill();
  }
  renderUnlit(r: Renderer) {
    const f = Math.min(3, Math.floor((this.t / this.dur) * 4));
    drawSprite(r.u, cfArcSmear(this.R, this.thick, this.sweep, this.ang, f, this.pal, this.cw), this.x, this.y);
    if (f < 2) r.glowAt(this.x + Math.cos(this.ang) * this.R * 0.6, this.y + Math.sin(this.ang) * this.R * 0.6, 18, this.pal === 'steel' ? 'U4' : 'V3', 0.3);
  }
}

/** true-scale danger disc (matches a circle hitbox exactly) */
function teleDisc(r: Renderer, x: number, y: number, rad: number, k: number, time: number, color = 'R3') {
  const ctx = r.u;
  ctx.globalAlpha = 0.2 + k * 0.22;
  ctx.fillStyle = col(color);
  ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), rad, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = col(color); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), Math.max(1, rad * k), 0, TAU); ctx.stroke();
  if (k > 0.85 && Math.floor(time * 30) % 2 === 0) {
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), rad, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function dropBrass(e: Enemy) {
  const w = e.world;
  const nb = Math.round(frand(e.brass[0], e.brass[1]) * (w.run?.mods.brassMul ?? 1));
  for (let i = 0; i < nb; i++) w.add(new Pickup(e.x, e.y - 4, 'brass', 1));
  for (let i = 0; i < e.sandDrop; i++) w.add(new Pickup(e.x, e.y - 4, 'sand', 10));
}

// ───────────────────────────── 分针骑士 Minute Knight ─────────────────────────────
// Three tracking cuts with the minute hand, each re-aimed and telegraphed, then it backs off
// behind its blade (frontal hits glance off) before pressing in again.
export class MinuteKnight extends Enemy {
  combo = 0; atkA = 0; swingDir = 1; bladeA = 1.1; guardDur = 1.2; glint = 0; strafe = frand() < 0.5 ? 1 : -1;
  constructor(x: number, y: number) {
    super(x, y, 120);
    this.r = 6; this.height = 26; this.speed = 40; this.poise = 20; this.mass = 1.6;
    this.kind = 'minuteknight'; this.codexId = 'minuteknight';
    this.debris = ['U2', 'U3', 'B3', 'K8', 'U1'];
    this.brass = [3, 5];
  }
  private windDur() { return this.combo === 0 ? 0.55 : this.combo === 1 ? 0.42 : 0.5; }
  private reach() { return this.combo === 2 ? 46 : 40; }
  private arcW() { return this.combo === 2 ? 1.25 : 1.0; }
  private rest() { return this.flip ? Math.PI - 1.15 : 1.15; }

  private startWindup() {
    this.setState('windup');
    sfx('cfKnightWind', { vol: 0.7, pan: this.world.pan(this.x) });
  }

  think(dt: number) {
    const t = this.target!;
    const d = this.distT();
    this.vx = this.vy = 0;
    if (this.glint > 0) this.glint -= dt;
    switch (this.state) {
      case 'idle':
      case 'approach':
        this.bladeA = lerpA(this.bladeA, this.rest(), dt * 8);
        if (d > 34) this.moveTo(t.x, t.y, this.speed, dt); else this.faceTarget();
        if (d < 54 && this.stateT > 0.35 && this.world.map.los(this.x, this.y - 8, t.x, t.y - 8)) {
          this.combo = 0;
          this.swingDir = this.flip ? -1 : 1;
          this.atkA = this.angT();
          this.startWindup();
        }
        break;
      case 'windup': {
        const W = this.windDur();
        if (this.stateT < W * 0.6) { this.atkA = this.angT(); this.faceTarget(); }
        if (this.combo > 0 && d > 38 && this.stateT < W * 0.6) this.moveTo(t.x, t.y, this.speed * 0.9, dt);
        this.bladeA = lerpA(this.bladeA, this.atkA - this.swingDir * 2.0, dt * 14);
        if (this.stateT >= W) this.doSwing();
        break;
      }
      case 'swing': {
        this.attacking = this.stateT < 0.1;
        const k = Math.min(1, this.stateT / 0.11);
        this.bladeA = this.atkA - this.swingDir * 2.0 + this.swingDir * 4.0 * ease.outCubic(k);
        if (this.stateT < 0.09) this.moveDir(this.atkA, this.combo === 2 ? 150 : 90, dt);
        if (this.stateT > 0.22) {
          if (this.combo < 2) { this.combo++; this.swingDir *= -1; this.startWindup(); }
          else this.setState('recover');
        }
        break;
      }
      case 'recover':
        this.bladeA = lerpA(this.bladeA, this.rest(), dt * 5);
        if (this.stateT > 0.5) { this.setState('guard'); this.guardDur = frand(1.0, 1.5); }
        break;
      case 'guard':
        this.faceTarget();
        this.bladeA = lerpA(this.bladeA, -Math.PI / 2 + (this.flip ? -0.32 : 0.32), dt * 16);
        if (d < 80) { if (this.moveDir(this.angT() + Math.PI + this.strafe * 0.5, 30, dt)) this.strafe *= -1; }
        if (this.stateT > this.guardDur) this.setState('approach');
        break;
    }
  }

  private doSwing() {
    this.setState('swing');
    this.attacking = true;
    const a = this.atkA, R = this.reach(), w = this.arcW();
    const last = this.combo === 2;
    this.world.combat.add({
      shape: { t: 'arc', x: this.x, y: this.y - 8, r: R, a, w }, team: 'enemy', life: 4,
      info: { amount: last ? 14 : 10, kind: 'melee', owner: this, x: this.x, y: this.y, knock: last ? 210 : 120 },
    });
    this.world.add(new CfSmear(this, 0, -9, R - 2, last ? 10 : 8, w * 2 + 0.3, a, this.swingDir > 0, 'steel', last ? 0.17 : 0.13));
    sfx('cfKnightSwing', { pan: this.world.pan(this.x), vol: last ? 1 : 0.8 });
    this.squash = 0.25;
  }

  private guarding() { return this.state === 'guard' || (this.state === 'recover' && this.stateT > 0.3); }

  hurt(info: DamageInfo): number {
    if (this.guarding() && this.spawnT <= 0 && info.x !== undefined && info.kind !== 'dot' && info.kind !== 'status' && info.kind !== 'fall' && info.kind !== 'paradox') {
      const from = Math.atan2((info.y ?? this.y) - this.y, info.x - this.x);
      const facing = this.flip ? Math.PI : 0;
      if (Math.abs(angleDiff(facing, from)) < 1.35) {
        info = { ...info, amount: Math.max(1, Math.round(info.amount * 0.3)), knock: (info.knock ?? 0) * 0.35 };
        this.glint = 0.18;
        const hx = this.x + (this.flip ? -6 : 6), hy = this.y - 16;
        for (let i = 0; i < 6; i++) {
          const ang = from + frand(-0.9, 0.9), s = frand(70, 160);
          this.world.particles.spawn({ kind: 'spark', x: hx, y: hy, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, life: frand(0.1, 0.22), ramp: ['W', 'K10', 'U4'], drag: 7, layer: 'glow' });
        }
        sfx('cfKnightGuard', { pan: this.world.pan(this.x) });
      }
    }
    return super.hurt(info);
  }

  renderTelegraph(r: Renderer) {
    if (this.state === 'windup') this.teleCone(r, this.x, this.y - 2, this.atkA, this.reach(), this.arcW(), this.stateT / this.windDur());
  }

  render(r: Renderer) {
    const A = KNI();
    let s: Sprite = A.idle[Math.floor(this.age * 2.5) % 2];
    const moving = Math.hypot(this.vx, this.vy) > 5;
    if ((this.state === 'approach' || this.state === 'guard') && moving) s = A.walk[Math.floor(this.age * (this.state === 'guard' ? 5 : 8)) % 4];
    if (this.state === 'windup') s = A.windup;
    if (this.state === 'swing' || (this.state === 'recover' && this.stateT < 0.2)) s = A.swing;
    if (this.state === 'guard' && !moving) s = A.guard;
    if (this.hitstun > 0) s = A.stagger;
    const show = this.spawnT <= 0 && this.falling <= 0;
    const fx = this.flip ? -1 : 1;
    const hx = this.x + fx * 5, hy = this.y - 13 + (this.state === 'windup' ? -2 : 0);
    const blade = minuteBladeRot().get(this.bladeA);
    const tint = this.flash > 0 ? '#ffffff' : undefined;
    const behind = this.state !== 'guard' && Math.sin(this.bladeA) < -0.3;
    if (show && behind) drawSprite(r.w, blade, hx, hy, { tint });
    this.drawBody(r, s);
    if (show && !behind) drawSprite(r.w, blade, hx, hy, { tint });
    if (!show) return;
    // gauntlet over the grip
    const ctx = r.w;
    ctx.fillStyle = col('K0'); ctx.fillRect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
    ctx.fillStyle = col('U2'); ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 2);
    ctx.fillStyle = col('U4'); ctx.fillRect(Math.round(hx) - 1, Math.round(hy) - 1, 1, 1);
    // the visor burns brighter during the tell; a steel glint runs the blade while guarding
    const ex = this.x + fx * 1, ey = this.y - 21;
    r.glowAt(ex, ey, this.state === 'windup' ? 7 : 4, 'V3', this.state === 'windup' ? 0.7 : 0.3);
    if (this.state === 'windup') r.lightAt(this.x, this.y - 12, 40, 'V3', 0.35 * Math.min(1, this.stateT / 0.2));
    if (this.state === 'guard' || this.glint > 0) {
      const g = ((this.age * 1.7) % 1) * 22;
      const gx = hx + Math.cos(this.bladeA) * g, gy = hy + Math.sin(this.bladeA) * g;
      r.glowAt(gx, gy, this.glint > 0 ? 10 : 4, 'K10', this.glint > 0 ? 0.8 : 0.45);
    }
  }
}

// ───────────────────────────── 时针枪兵 Hour Lancer ─────────────────────────────
// Slow and heavy. Plants its feet and lowers the hour hand along a long, thick line; locks on,
// then charges the whole length. Striking a wall stuns it — and leaves it open.
export class HourLancer extends Enemy {
  chargeA = 0; chargeLen = 0; chargeDist = 0; lanceA = 0.4; chargeV = 0;
  private chargeHb: { life: number } | null = null;
  private trailT = 0;
  constructor(x: number, y: number) {
    super(x, y, 110);
    this.r = 8; this.height = 30; this.speed = 22; this.mass = 3; this.poise = 30;
    this.kind = 'hourlancer'; this.codexId = 'hourlancer';
    this.debris = ['B3', 'B4', 'B2', 'U2', 'K9'];
    this.brass = [3, 6];
  }
  private rest() { return this.flip ? Math.PI - 0.3 : 0.3; }
  /** distance it can charge along a before meeting a wall or a hole */
  private castLen(a: number): number {
    const m = this.world.map;
    const c = Math.cos(a), s = Math.sin(a);
    let L = 0;
    for (; L < 360; L += 4) {
      const px = this.x + c * (L + this.r), py = this.y + s * (L + this.r);
      if (m.solidAt(px, py) || m.pitAt(px, py)) break;
    }
    return Math.max(12, L);
  }
  think(dt: number) {
    const t = this.target!;
    const d = this.distT();
    this.vx = this.vy = 0;
    switch (this.state) {
      case 'idle':
      case 'approach':
        this.lanceA = lerpA(this.lanceA, this.rest(), dt * 6);
        this.moveTo(t.x, t.y, this.speed, dt);
        if (this.stateT > 0.9 && d < 34) { this.setState('shoveWind'); this.chargeA = this.angT(); this.faceTarget(); }
        else if (this.stateT > 1.1 && d > 46 && d < 240 && this.world.map.los(this.x, this.y - 8, t.x, t.y - 8)) {
          this.setState('plant');
          this.chargeA = this.angT();
          this.faceTarget();
          this.squash = 0.45;
          this.world.fx.dust(this.x, this.y, 6);
          this.world.shake(0.08);
          sfx('cfLancerPlant', { pan: this.world.pan(this.x) });
        }
        break;
      case 'plant': {
        if (this.stateT < 0.38) { this.chargeA = this.angT(); this.faceTarget(); }
        this.chargeLen = this.castLen(this.chargeA);
        this.lanceA = lerpA(this.lanceA, this.chargeA, dt * 12);
        if (this.stateT >= 0.75) {
          this.setState('charge');
          this.chargeDist = 0;
          this.chargeV = 90;
          const c = Math.cos(this.chargeA), s = Math.sin(this.chargeA);
          this.chargeHb = this.world.combat.add({
            shape: { t: 'line', x0: this.x + c * 2, y0: this.y - 9 + s * 2, x1: this.x + c * 26, y1: this.y - 9 + s * 26, r: 8 },
            team: 'enemy', life: 120, follow: this,
            info: { amount: 16, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 280 },
          });
          sfx('cfLancerCharge', { pan: this.world.pan(this.x) });
          this.world.shake(0.12);
        }
        break;
      }
      case 'charge': {
        this.attacking = true;
        this.chargeV = Math.min(290, this.chargeV + dt * 1400);
        const c = Math.cos(this.chargeA), s = Math.sin(this.chargeA);
        const m = this.world.map;
        const step = this.chargeV * dt;
        if (m.pitAt(this.x + c * (this.r + 6), this.y + s * (this.r + 6))) { this.endCharge('skid'); break; }
        const bx = this.x, by = this.y;
        const blocked = this.world.move(this, c * step, s * step);
        this.chargeDist += Math.hypot(this.x - bx, this.y - by);
        this.trailT -= dt;
        if (this.trailT <= 0) {
          this.trailT = 0.04;
          this.world.add(new Afterimage(this.x, this.y, LAN().charge, this.flip, 'B3', 0.2, 0.35));
          this.world.fx.dust(this.x, this.y, 1, this.chargeA);
        }
        if (blocked && Math.hypot(this.x - bx, this.y - by) < step * 0.5) {
          this.endCharge('stunned');
          this.world.shake(0.4);
          this.world.hitstop(0.06);
          this.world.fx.hitSparks(this.x + c * 14, this.y - 12 + s * 14, this.chargeA + Math.PI, 'crit', 18);
          this.world.fx.dust(this.x + c * 10, this.y + s * 6, 10);
          this.world.fx.ring(this.x + c * 12, this.y - 10 + s * 12, 3, 26, 0.35, 'B5', 2);
          sfx('cfLancerWall', { pan: this.world.pan(this.x) });
          this.squash = 0.7;
          this.kx = -c * 120; this.ky = -s * 120;
        } else if (this.chargeDist >= this.chargeLen + 6 || this.stateT > 1.7) this.endCharge('skid');
        break;
      }
      case 'skid': {
        const k = 1 - this.stateT / 0.45;
        if (k > 0) this.moveDir(this.chargeA, 160 * k, dt);
        if (Math.floor(this.stateT * 30) % 3 === 0) this.world.fx.dust(this.x, this.y, 1, this.chargeA);
        if (this.stateT > 0.45) this.setState('recover');
        break;
      }
      case 'stunned':
        this.poise = 0;
        this.lanceA = lerpA(this.lanceA, this.flip ? Math.PI - 1.4 : 1.4, dt * 6);
        if (this.stateT > 1.6) { this.poise = 30; this.setState('recover'); }
        break;
      case 'shoveWind':
        this.lanceA = lerpA(this.lanceA, this.chargeA - (this.flip ? -0.9 : 0.9), dt * 10);
        if (this.stateT > 0.48) {
          this.setState('shove');
          this.attacking = true;
          this.world.combat.add({
            shape: { t: 'arc', x: this.x, y: this.y - 8, r: 34, a: this.chargeA, w: 0.8 }, team: 'enemy', life: 4,
            info: { amount: 11, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 240 },
          });
          this.world.add(new CfSmear(this, 0, -9, 32, 9, 1.9, this.chargeA, !this.flip, 'steel', 0.14));
          sfx('cfLancerShove', { pan: this.world.pan(this.x) });
          this.moveDir(this.chargeA, 200, dt);
        }
        break;
      case 'shove':
        this.lanceA = lerpA(this.lanceA, this.chargeA, dt * 20);
        if (this.stateT > 0.5) this.setState('recover');
        break;
      case 'recover':
        this.lanceA = lerpA(this.lanceA, this.rest(), dt * 4);
        if (this.stateT > 0.7) this.setState('approach');
        break;
    }
  }
  private endCharge(next: string) {
    if (this.chargeHb) { this.chargeHb.life = 0; this.chargeHb = null; }
    this.setState(next);
  }
  onDeath(info: DamageInfo) {
    if (this.chargeHb) { this.chargeHb.life = 0; this.chargeHb = null; }
    super.onDeath(info);
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'plant') {
      const k = this.stateT / 0.75;
      this.teleLine(r, this.x, this.y - 2, this.chargeA, this.chargeLen + this.r, 18, k);
      // locked: chevrons run along the line
      if (this.stateT >= 0.38) {
        const ctx = r.u;
        const c = Math.cos(this.chargeA), s = Math.sin(this.chargeA);
        ctx.fillStyle = col('R4');
        ctx.globalAlpha = 0.8;
        for (let dd = ((this.world.time * 140) % 24); dd < this.chargeLen; dd += 24) {
          for (let j = -3; j <= 3; j++) {
            const back = Math.abs(j) * 1.0;
            ctx.fillRect(Math.round(this.x + c * (dd - back) - s * j), Math.round(this.y - 2 + s * (dd - back) + c * j), 1, 1);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    if (this.state === 'shoveWind') this.teleCone(r, this.x, this.y - 2, this.chargeA, 34, 0.8, this.stateT / 0.48);
  }
  render(r: Renderer) {
    const A = LAN();
    let s: Sprite = A.idle[Math.floor(this.age * 2) % 2];
    if ((this.state === 'approach' || this.state === 'recover') && Math.hypot(this.vx, this.vy) > 4) s = A.walk[Math.floor(this.age * 5) % 4];
    if (this.state === 'plant' || this.state === 'shoveWind') s = A.plant;
    if (this.state === 'charge' || this.state === 'skid' || this.state === 'shove') s = A.charge;
    if (this.state === 'stunned') s = A.stun;
    const show = this.spawnT <= 0 && this.falling <= 0;
    const fx = this.flip ? -1 : 1;
    const shake = this.state === 'plant' && this.stateT > 0.38 ? (Math.floor(this.age * 40) % 2 ? 1 : -1) : 0;
    const hx = this.x + fx * 7 + shake, hy = this.y - 14 + (this.state === 'plant' ? 2 : 0);
    const lance = hourLanceRot().get(this.lanceA);
    const tint = this.flash > 0 ? '#ffffff' : undefined;
    const behind = Math.sin(this.lanceA) < -0.35;
    if (show && behind) drawSprite(r.w, lance, hx, hy, { tint });
    const x0 = this.x;
    this.x += shake;
    this.drawBody(r, s);
    this.x = x0;
    if (show && !behind) drawSprite(r.w, lance, hx, hy, { tint });
    if (!show) return;
    // visor and dial glow
    const ex = this.x + fx * 4, ey = this.y - 22;
    const hot = this.state === 'plant' || this.state === 'charge';
    r.glowAt(ex, ey, hot ? 8 : 4, 'V3', hot ? 0.75 : 0.3);
    if (this.state === 'plant') r.lightAt(this.x, this.y - 10, 50, 'R3', 0.35 * Math.min(1, this.stateT / 0.3));
    if (this.state === 'stunned') {
      for (let i = 0; i < 3; i++) {
        const a = this.age * 5 + (i * TAU) / 3;
        drawSprite(r.u, DIZZY_STAR, this.x + Math.cos(a) * 8, this.y - 32 + Math.sin(a) * 3);
      }
    }
  }
}

// ───────────────────────────── 星屑 Star Shard ─────────────────────────────
/** last time any shard in a room began to glow (shards take turns) */
const LAST_GLOW = new WeakMap<object, number>();
// Splinters of starlight that circle you at range. Each glows, draws a thin line, and fires a
// single star; destroyed, it bursts after a short, marked fuse.
export class StarShard extends Enemy {
  orbitA = frand(0, TAU); orbitR = frand(74, 100); orbitDir = frand() < 0.5 ? 1 : -1;
  fireT = frand(1.4, 3.2); aimA = 0; hover = 10; spin = frand(0, 6);
  constructor(x: number, y: number) {
    super(x, y, 28);
    this.r = 4; this.height = 18; this.speed = 66; this.mass = 0.6;
    this.canFall = false;
    this.kind = 'starshard'; this.codexId = 'starshard';
    this.debris = ['K10', 'U4', 'U3', 'V3'];
    this.brass = [0, 1];
    this.spawnT = frand(0.5, 0.9);
  }
  private fly(tx: number, ty: number, sp: number, dt: number) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return;
    const v = Math.min(sp * this.speedMul, d * 4);
    this.vx = (dx / d) * v; this.vy = (dy / d) * v;
    this.world.move(this, this.vx * dt, this.vy * dt);
  }
  think(dt: number) {
    const t = this.target!;
    this.hover = 10 + Math.sin(this.age * 2.6 + this.orbitR) * 2;
    this.spin += dt * (this.state === 'glow' ? 22 : 7);
    switch (this.state) {
      case 'idle':
      case 'drift': {
        this.orbitA += this.orbitDir * 0.55 * dt;
        const tx = t.x + Math.cos(this.orbitA) * this.orbitR, ty = t.y + Math.sin(this.orbitA) * this.orbitR * 0.75;
        this.fly(tx, ty, this.speed, dt);
        if (this.world.map.solidAt(tx, ty)) this.orbitDir *= -1;
        this.fireT -= dt;
        if (this.fireT <= 0 && this.distT() < 230 && this.world.time - (LAST_GLOW.get(this.world) ?? -9) > 0.45 && this.world.map.los(this.x, this.y - this.hover, t.x, t.y - 8)) {
          LAST_GLOW.set(this.world, this.world.time);
          this.setState('glow');
          this.aimA = angleTo(this.x, this.y - this.hover, t.x, t.y - 8);
          sfx('cfShardGlow', { vol: 0.7, pan: this.world.pan(this.x) });
        }
        break;
      }
      case 'glow':
        this.fly(this.x, this.y, 0, dt);
        if (this.stateT < 0.42) this.aimA = angleTo(this.x, this.y - this.hover, t.x, t.y - 8);
        if (this.stateT >= 0.62) {
          this.attacking = true;
          const mx = this.x + Math.cos(this.aimA) * 5, my = this.y - this.hover + Math.sin(this.aimA) * 5;
          this.world.add(new Bullet({ team: 'enemy', x: mx, y: my, ang: this.aimA, speed: 150, dmg: 8, style: 'star', r: 3, owner: this, life: 2.6 }));
          this.world.particles.spawn({ kind: 'smoke', x: mx, y: my, life: 0.12, ramp: ['W', 'U4'], size: 6, size2: 1, layer: 'glow' });
          sfx('cfShardShot', { pan: this.world.pan(this.x) });
          this.fireT = frand(2.4, 3.6);
          this.kx = -Math.cos(this.aimA) * 60; this.ky = -Math.sin(this.aimA) * 60;
          this.setState('drift');
        }
        break;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'glow') {
      const k = this.stateT / 0.62;
      const t = this.target;
      const len = t ? Math.min(240, Math.hypot(t.x - this.x, t.y - this.y) + 30) : 120;
      this.teleLine(r, this.x, this.y - this.hover, this.aimA, len, 4, k);
    }
  }
  renderGround(r: Renderer) {
    if (this.spawnT > 0) { this.renderSpawn(r); return; }
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.35)';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), 3.5, 1.5, 0, 0, TAU);
    ctx.fill();
    this.renderTelegraph(r);
  }
  onDeath(info: DamageInfo) {
    const w = this.world;
    const y = this.y - this.hover;
    sfx('cfShardCrack', { pan: w.pan(this.x) });
    w.hitstop(0.03);
    w.fx.burst(this.x, y, 12, ['W', 'K10', 'U4', 'U3'], 120, 0.35);
    for (let i = 0; i < 6; i++) {
      const a = frand(0, TAU);
      w.particles.spawn({ kind: 'debris', x: this.x, y: this.y, z: this.hover, vx: Math.cos(a) * frand(20, 70), vy: Math.sin(a) * frand(20, 70), vz: frand(30, 90), grav: 320, life: frand(0.4, 0.8), ramp: [i % 2 ? 'K10' : 'U4'], size: 1, bounce: 0.4 });
    }
    if (info.kind === 'fall') return;
    w.add(new ShardBurst(this.x, this.y, this));
    dropBrass(this);
  }
  render(r: Renderer) {
    const A = SHA();
    const hot = this.state === 'glow';
    const fr = (hot ? A.hot : A.spin)[Math.floor(this.spin) % 6];
    const y0 = this.y;
    this.y -= this.hover;
    this.drawBody(r, fr);
    this.y = y0;
    if (this.spawnT > 0) return;
    const k = hot ? Math.min(1, this.stateT / 0.62) : 0;
    r.glowAt(this.x, this.y - this.hover, 6 + k * 8, hot ? 'K10' : 'U4', 0.28 + k * 0.5);
    r.lightAt(this.x, this.y - this.hover, 30 + k * 20, 'U4', 0.16 + k * 0.24);
  }
}

/** the fuse a dying Star Shard leaves behind: a marked circle, then a burst of starlight */
class ShardBurst extends Entity {
  t = 0; dur = 0.55; R = 20;
  constructor(x: number, y: number, private owner: Actor) {
    super();
    this.x = x; this.y = y;
  }
  update(dt: number) {
    this.t += dt;
    if (this.t >= this.dur) {
      const w = this.world;
      w.combat.add({ shape: { t: 'circle', x: this.x, y: this.y - 4, r: this.R }, team: 'enemy', life: 2, info: { amount: 7, kind: 'aoe', owner: this.owner, x: this.x, y: this.y, knock: 140 } });
      w.fx.burst(this.x, this.y - 6, 18, ['W', 'K10', 'U4', 'V3'], 170, 0.4);
      w.fx.ring(this.x, this.y - 4, 3, this.R + 4, 0.3, 'K10', 2, 'unlit');
      w.shake(0.12);
      sfx('cfShardBurst', { pan: w.pan(this.x) });
      this.kill();
    }
  }
  renderGround(r: Renderer) {
    const k = this.t / this.dur;
    teleDisc(r, this.x, this.y, this.R, k, this.world.time);
  }
  render(r: Renderer) {
    // the remaining core trembles and brightens
    const j = Math.floor(this.t * 40) % 2 ? 1 : -1;
    const ctx = r.u;
    ctx.fillStyle = col('K0'); ctx.fillRect(Math.round(this.x) - 2 + j, Math.round(this.y) - 12, 5, 5);
    ctx.fillStyle = col(this.t / this.dur > 0.6 ? 'W' : 'U4'); ctx.fillRect(Math.round(this.x) - 1 + j, Math.round(this.y) - 11, 3, 3);
    r.glowAt(this.x, this.y - 10, 6 + (this.t / this.dur) * 10, 'K10', 0.4 + (this.t / this.dur) * 0.4);
  }
}

// ───────────────────────────── 残响幻影 Echo Phantom ─────────────────────────────
// The dark mirror of your Echo. It records YOUR movement and walks your path 2.75 s behind,
// cutting where you cut — violet, unrewindable cuts. Standing still means meeting your past.
interface PSnap { x: number; y: number; dir: Dir; flip: boolean; anim: number; animT: number; pose: Pose }
interface PEvent { tick: number; kind: 'thrust' | 'sweep' | 'lunge'; angle: number; x: number; y: number; tele: boolean }
const PH_DELAY = 165; // 2.75 s at 60 Hz
const PH_TELE = 27;   // 0.45 s warning
const PH_RAMP = ['K0', 'K0', 'K1', 'V0', 'V1', 'V2'];

export class EchoPhantom extends Enemy {
  private buf: PSnap[] = [];
  private events: PEvent[] = [];
  private tick = 0;
  private snap: PSnap | null = null;
  private onPath = false;
  private scarf = new Scarf(6, 2.2);
  private trailT = 0;
  private glitchT = 0;
  private glitchOff = 0;
  constructor(x: number, y: number) {
    super(x, y, 90);
    this.r = 4.5; this.height = 20; this.speed = 165; this.poise = 12; this.mass = 0.9;
    this.canFall = false;
    this.collides = false;
    this.solid = false;
    this.kind = 'echophantom'; this.codexId = 'echophantom';
    this.debris = ['V2', 'V1', 'K2', 'V3'];
    this.brass = [3, 4];
    this.spawnT = 1.1;
    this.scarf.reset(x, y - 10);
  }
  added() {
    super.added();
    sfx('cfPhantomSpawn', { pan: this.world.pan(this.x) });
    const bus = this.world.bus;
    bus.on('attack', (e) => {
      if (e.echo || e.owner !== this.world.player || this.dead) return;
      this.events.push({ tick: this.tick, kind: e.combo >= 2 ? 'sweep' : 'thrust', angle: e.angle, x: e.owner.x, y: e.owner.y, tele: false });
    }, this);
    bus.on('special', (e) => {
      if (e.echo || e.owner !== this.world.player || this.dead) return;
      this.events.push({ tick: this.tick, kind: 'lunge', angle: e.angle, x: e.owner.x, y: e.owner.y, tele: false });
    }, this);
  }
  removed() { this.world.bus.off(this); }

  update(dt: number) {
    // record the player every tick, even while staggered or spawning
    const p = this.world.player;
    if (p && p.hp > 0) {
      this.buf.push({ x: p.x, y: p.y, dir: p.dir, flip: p.flip, anim: p.anim as number, animT: p.animT, pose: p.weapon.pose(p.aim) });
      if (this.buf.length > PH_DELAY + 90) this.buf.shift();
    }
    this.tick++;
    if (this.spawnT <= 0) this.runEvents();
    super.update(dt);
    if (this.glitchT > 0) this.glitchT -= dt;
    else if (frand() < dt * 1.6) { this.glitchT = frand(0.05, 0.12); this.glitchOff = frand() < 0.5 ? -2 : 2; }
  }

  private runEvents() {
    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      if (!ev.tele && this.tick >= ev.tick + PH_DELAY - PH_TELE) {
        // off the path (still catching up, or knocked away): it blinks to where you cut
        if (Math.hypot(this.x - ev.x, this.y - ev.y) > 20) this.blink(ev.x, ev.y);
        ev.tele = true;
        sfx('cfPhantomTele', { vol: 0.6, pan: this.world.pan(ev.x) });
      }
      if (this.tick >= ev.tick + PH_DELAY) {
        this.events.splice(i--, 1);
        if (ev.tele) this.slash(ev);
      }
    }
  }

  private blink(x: number, y: number) {
    const w = this.world;
    w.add(new Afterimage(this.x, this.y, this.sprite(), this.flip, 'V2', 0.35, 0.6));
    w.fx.burst(this.x, this.y - 8, 8, ['V4', 'V3', 'V1'], 70, 0.3);
    this.x = x; this.y = y;
    w.fx.burst(x, y - 8, 8, ['V4', 'V3', 'V1'], 70, 0.3);
    this.glitchT = 0.15; this.glitchOff = frand() < 0.5 ? -3 : 3;
  }

  private slash(ev: PEvent) {
    const w = this.world;
    const c = Math.cos(ev.angle), s = Math.sin(ev.angle);
    const ox = ev.x, oy = ev.y - 7;
    this.attacking = true;
    if (ev.kind === 'sweep') {
      w.combat.add({ shape: { t: 'arc', x: ox, y: oy, r: 34, a: ev.angle, w: 1.25 }, team: 'enemy', life: 4, info: { amount: 9, kind: 'melee', owner: this, x: ox, y: oy, knock: 180, fixed: true } });
      w.add(new Smear(null, ox, oy, 'arc', ev.angle, { R: 30, thick: 9, sweep: 2.6, cw: true }, 'violet', 0.15));
    } else {
      const L = ev.kind === 'lunge' ? 40 : 32;
      w.combat.add({ shape: { t: 'line', x0: ox + c * 4, y0: oy + s * 4, x1: ox + c * L, y1: oy + s * L, r: ev.kind === 'lunge' ? 8 : 6 }, team: 'enemy', life: 4, info: { amount: ev.kind === 'lunge' ? 9 : 7, kind: 'melee', owner: this, x: ox, y: oy, knock: 110, fixed: true } });
      w.add(new Smear(null, ox + c * 6, oy + s * 6, 'thrust', ev.angle, { len: L - 2, width: ev.kind === 'lunge' ? 10 : 7 }, 'violet', 0.13));
    }
    sfx('cfPhantomSlash', { pan: w.pan(ox) });
  }

  think(dt: number) {
    const n = this.buf.length;
    if (!n) return;
    const f = this.buf[Math.max(0, n - 1 - PH_DELAY)];
    const dx = f.x - this.x, dy = f.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * this.speedMul * dt;
    if (d <= step) { this.x = f.x; this.y = f.y; this.onPath = true; }
    else { this.x += (dx / d) * step; this.y += (dy / d) * step; this.onPath = d < 6; }
    this.snap = f;
    this.flip = this.onPath ? f.flip : dx < 0;
    // touching your own past hurts
    const p = this.world.player;
    if (p && Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r + 2) p.hurt({ amount: 7, kind: 'contact', owner: this, x: this.x, y: this.y, knock: 130 });
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.07;
      this.world.add(new Afterimage(this.x + frand(-1.5, 1.5), this.y, this.sprite(), this.flip, frand() < 0.3 ? 'V2' : 'V1', 0.3, 0.38));
    }
    const F = tickFrames();
    const dir = this.snap.dir;
    const nk = F.neck[dir];
    this.scarf.update(this.x + nk.x * (this.flip ? -1 : 1), this.y + nk.y, -dx * 30, -20, dt);
  }

  private sprite(): Sprite {
    const F = tickFrames();
    const f = this.snap;
    const dir: Dir = f?.dir ?? 'down';
    let s: Sprite;
    if (!f) s = F.idle.down[0];
    else if (!this.onPath) s = F.run[dir][Math.floor(this.age * 12) % 6];
    else switch (f.anim) {
      case 1: s = F.run[dir][Math.floor(f.animT * 12) % 6]; break;
      case 2: s = F.dash[dir]; break;
      case 3: s = F.hurt[dir]; break;
      default: s = F.idle[dir][Math.floor(f.animT * 4) % 4];
    }
    return s.recolor(PH_RAMP);
  }

  renderSpawn(r: Renderer) {
    // a tear in the night: violet static gathering into your shape
    const k = this.spawnK;
    const ctx = r.u;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + k * 3;
      const rr = (1 - k) * 22 + 3;
      ctx.fillStyle = col(i % 2 ? 'V3' : 'V1');
      ctx.globalAlpha = 0.4 + k * 0.6;
      ctx.fillRect(Math.round(this.x + Math.cos(a) * rr), Math.round(this.y - 8 + Math.sin(a) * rr * 0.7), 2, 1);
    }
    ctx.globalAlpha = 1;
    r.glowAt(this.x, this.y - 8, 14, 'V2', 0.5 * k);
  }

  renderGround(r: Renderer) {
    if (this.spawnT > 0) { this.renderSpawn(r); return; }
    const ctx = r.w;
    ctx.fillStyle = 'rgba(42,18,64,0.45)';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), 6, 2.5, 0, 0, TAU);
    ctx.fill();
    this.renderTelegraph(r);
  }

  renderTelegraph(r: Renderer) {
    for (const ev of this.events) {
      if (!ev.tele) continue;
      const k = clamp(1 - (ev.tick + PH_DELAY - this.tick) / PH_TELE, 0, 1);
      if (ev.kind === 'sweep') this.teleCone(r, ev.x, ev.y - 3, ev.angle, 36, 1.25, k);
      else this.teleLine(r, ev.x, ev.y - 3, ev.angle, ev.kind === 'lunge' ? 42 : 34, ev.kind === 'lunge' ? 16 : 12, k);
      // a violet ghost of the blade where the cut will come from
      drawSprite(r.u, rapierRot.get(ev.angle), ev.x + Math.cos(ev.angle) * 6, ev.y - 4 + Math.sin(ev.angle) * 6, { tint: 'V3', alpha: 0.25 + k * 0.4 });
    }
  }

  onDeath(info: DamageInfo) {
    const w = this.world;
    w.fx.burst(this.x, this.y - 8, 20, ['V4', 'V3', 'V2', 'V1'], 130, 0.5);
    for (let k = 0; k < 10; k++) {
      const a = frand(0, TAU);
      w.particles.spawn({ kind: 'debris', x: this.x, y: this.y - 2, z: frand(4, 16), vx: Math.cos(a) * frand(20, 70), vy: Math.sin(a) * frand(20, 70), vz: frand(30, 90), grav: 300, life: frand(0.4, 0.9), ramp: ['V3', 'V1'], layer: 'glow', size: 1 });
    }
    w.fx.ring(this.x, this.y - 6, 2, 30, 0.35, 'V3', 2);
    sfx('death', { pan: w.pan(this.x) });
    sfx('echoEnd', { vol: 0.6, pan: w.pan(this.x) });
    w.hitstop(0.05);
    w.shake(0.15);
    this.events.length = 0;
    if (info.kind !== 'fall') dropBrass(this);
  }

  render(r: Renderer) {
    if (this.spawnT > 0) {
      const k = this.spawnK;
      drawSprite(r.w, this.sprite(), this.x + (Math.floor(this.age * 30) % 2 ? 1 : -1) * (1 - k) * 3, this.y, { flip: this.flip, alpha: k * 0.8 });
      return;
    }
    const spr = this.sprite();
    const ctx = r.w;
    const fx = this.flip ? -1 : 1;
    const F = tickFrames();
    const dir = this.snap?.dir ?? 'down';
    const pose = this.snap?.pose ?? { angle: 1.15, ext: 0, vis: 1 };
    const hand = F.hand[dir];
    const hx = this.x + hand.x * fx, hy = this.y + hand.y;
    const behind = Math.sin(pose.angle) < -0.35 || dir === 'up';
    const blade = rapierRot.get(pose.angle);
    const bx = hx + Math.cos(pose.angle) * pose.ext, by = hy + Math.sin(pose.angle) * pose.ext;
    // glitch: the silhouette tears sideways for a few frames
    const gx = this.glitchT > 0 ? this.glitchOff : 0;
    if (gx) drawSprite(ctx, spr, this.x - gx, this.y, { flip: this.flip, tint: 'V3', alpha: 0.35 });
    this.scarf.draw(ctx, 'V1', 0.9);
    if (behind) drawSprite(ctx, blade, bx, by, { tint: this.flash > 0 ? '#ffffff' : 'V1' });
    const x0 = this.x;
    this.x += gx;
    this.drawBody(r, spr, { tint: this.flash > 0 ? '#ffffff' : undefined });
    this.x = x0;
    if (!behind) drawSprite(ctx, blade, bx, by, { tint: this.flash > 0 ? '#ffffff' : 'V1' });
    // burning violet eyes
    if (dir !== 'up' && this.flash <= 0) {
      const ey = this.y - 14 + (Math.floor((this.snap?.animT ?? 0) * 4) % 4 >= 2 ? 1 : 0);
      const ex = dir === 'side' ? [3 * fx] : [-2, 2];
      for (const e of ex) {
        r.u.fillStyle = col('V4');
        r.u.fillRect(Math.round(this.x + e + gx), Math.round(ey), 1, 1);
        r.glowAt(this.x + e + gx, ey, 3, 'V3', 0.6);
      }
    }
    r.glowAt(this.x, this.y - 10, 14, 'V1', 0.35);
    r.lightAt(this.x, this.y - 8, 44, 'V2', 0.28);
  }
}

// ───────────────────────────── 钟摆刽子手 Pendulum Executioner (elite) ─────────────────────────────
// A longcase clock come to judgement. Its pendulum is a blade on a chain: two wide sweeps along
// a marked arc (stand inside the arc, not on it), then it lifts the bob overhead and slams the
// dial — a shockwave rolls outward (dash through it).
const EX_R = 62;
export class PendulumExecutioner extends Enemy {
  next: 'swing' | 'slam' = 'swing';
  atkA = 0; dir = 1; s0 = 0; s1 = 0; swings = 0; windDur = 0.85;
  bobX = 0; bobY = 0; bobZ = 0; bobVis = 0;
  slamX = 0; slamY = 0;
  private hitSet = new Set<number>();
  private trail: { x: number; y: number; z: number; t: number }[] = [];
  constructor(x: number, y: number) {
    super(x, y, 480);
    this.r = 11; this.height = 44; this.speed = 19; this.mass = 6; this.poise = 50;
    this.kind = 'pendulum'; this.codexId = 'pendulum';
    this.isElite = true;
    this.debris = ['K3', 'K2', 'B3', 'B4', 'K9', 'U2'];
    this.brass = [9, 13];
    this.sandDrop = 3;
  }
  private handPos(): { x: number; y: number } {
    const H = EXE().hands;
    const key = this.state === 'swingWind' ? 'back' : this.state === 'swinging' ? 'out' : this.state === 'slamWind' ? 'up' : this.state === 'slam' ? 'slam' : 'down';
    const h = H[key];
    return { x: this.x + h.x * (this.flip ? -1 : 1), y: this.y + h.y };
  }
  private aimSwing(first: boolean) {
    this.atkA = this.angT();
    if (first) this.dir = Math.cos(this.atkA) >= 0 ? -1 : 1;
    this.s0 = this.atkA - this.dir * 1.55;
    this.s1 = this.atkA + this.dir * 1.55;
  }
  private startSwing(first: boolean) {
    this.setState('swingWind');
    this.windDur = first ? 0.85 : 0.52;
    if (!first) this.dir *= -1;
    this.aimSwing(first);
    this.hitSet = new Set();
    sfx('cfPendWind', { pan: this.world.pan(this.x), vol: first ? 1 : 0.7 });
  }
  think(dt: number) {
    const t = this.target!;
    const d = this.distT();
    this.vx = this.vy = 0;
    switch (this.state) {
      case 'idle':
      case 'approach':
        if (d > 46) this.moveTo(t.x, t.y, this.speed, dt); else this.faceTarget();
        if (this.stateT > 0.9) {
          if (this.next === 'swing' && d < 86) { this.swings = 0; this.faceTarget(); this.startSwing(true); }
          else if (this.next === 'slam' && d < 120) {
            this.setState('slamWind');
            this.faceTarget();
            this.atkA = this.angT();
            sfx('cfPendLift', { pan: this.world.pan(this.x) });
          } else if (this.stateT > 3.2) this.next = this.next === 'swing' ? 'slam' : 'swing';
        }
        break;
      case 'swingWind':
        if (this.stateT < this.windDur * 0.55) { this.faceTarget(); this.aimSwing(false); this.s0 = this.atkA - this.dir * 1.55; this.s1 = this.atkA + this.dir * 1.55; }
        if (this.stateT >= this.windDur) {
          this.setState('swinging');
          this.attacking = true;
          sfx('cfPendSwing', { pan: this.world.pan(this.x) });
        }
        break;
      case 'swinging': {
        this.attacking = true;
        const k = Math.min(1, this.stateT / 0.44);
        const th = this.s0 + (this.s1 - this.s0) * ease.inOutQuad(k);
        const bx = this.x + Math.cos(th) * EX_R, by = this.y + Math.sin(th) * EX_R;
        this.world.combat.add({ shape: { t: 'circle', x: bx, y: by - 4, r: 13 }, team: 'enemy', life: 1, hit: this.hitSet, info: { amount: 18, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 260 } });
        if (Math.floor(this.stateT * 60) % 2 === 0) this.world.fx.dust(bx, by, 1, th + (Math.PI / 2) * this.dir);
        if (this.stateT >= 0.44) {
          this.swings++;
          if (this.swings < 2) this.startSwing(false);
          else { this.setState('recover'); this.next = 'slam'; }
        }
        break;
      }
      case 'slamWind': {
        this.faceTarget();
        if (this.stateT < 0.5) this.atkA = this.angT();
        this.slamX = this.x + Math.cos(this.atkA) * 38;
        this.slamY = this.y + Math.sin(this.atkA) * 30;
        if (this.stateT >= 0.8) {
          this.setState('slam');
          this.attacking = true;
          const w = this.world;
          w.combat.add({ shape: { t: 'circle', x: this.slamX, y: this.slamY - 4, r: 28 }, team: 'enemy', life: 3, info: { amount: 16, kind: 'aoe', owner: this, x: this.slamX, y: this.slamY, knock: 280 } });
          w.add(new Shockwave(this.slamX, this.slamY, this));
          w.fx.dust(this.slamX, this.slamY, 16);
          w.fx.scorch(this.slamX, this.slamY, 20);
          w.fx.ring(this.slamX, this.slamY, 6, 40, 0.35, 'K10', 3, 'unlit');
          w.fx.hitSparks(this.slamX, this.slamY - 6, -Math.PI / 2, 'crit', 20);
          w.shake(0.55);
          w.hitstop(0.08);
          sfx('cfPendSlam', { pan: w.pan(this.x) });
          sfx('cfPendWave', { pan: w.pan(this.x) });
          this.squash = 0.5;
        }
        break;
      }
      case 'slam':
        if (this.stateT > 0.95) { this.setState('approach'); this.next = 'swing'; }
        break;
      case 'recover':
        if (this.stateT > 0.95) this.setState('approach');
        break;
    }
  }

  private updateBob(dt: number) {
    const h = this.handPos();
    let tx: number, ty: number, tz: number;
    if (this.state === 'swinging') {
      const k = Math.min(1, this.stateT / 0.44);
      const th = this.s0 + (this.s1 - this.s0) * ease.inOutQuad(k);
      tx = this.x + Math.cos(th) * EX_R; ty = this.y + Math.sin(th) * EX_R; tz = 10;
      this.bobX = tx; this.bobY = ty; this.bobZ = tz;
      this.trail.push({ x: tx, y: ty, z: tz, t: 0 });
      return;
    }
    if (this.state === 'swingWind') {
      const k = Math.min(1, this.stateT / (this.windDur * 0.7));
      const R = EX_R * (0.45 + 0.25 * k);
      tx = this.x + Math.cos(this.s0) * R; ty = this.y + Math.sin(this.s0) * R; tz = 14 + Math.sin(this.age * 18) * 1.5;
    } else if (this.state === 'slamWind') {
      const a = this.age * 10;
      tx = this.x + Math.cos(a) * 12; ty = this.y - 4 + Math.sin(a) * 5; tz = 54 + Math.sin(this.age * 4) * 2;
    } else if (this.state === 'slam') {
      tx = this.slamX; ty = this.slamY; tz = Math.max(0, (this.stateT - 0.25) * 40);
    } else {
      // hanging from the hand, swaying with its gait
      const sway = Math.sin(this.age * 2.4) * 5 + (this.flip ? 2 : -2);
      tx = h.x + sway; ty = this.y + 6; tz = 6 + Math.abs(Math.sin(this.age * 2.4)) * 2;
    }
    const k = 1 - Math.exp(-dt * (this.state === 'slam' ? 40 : 14));
    this.bobX += (tx - this.bobX) * k; this.bobY += (ty - this.bobY) * k; this.bobZ += (tz - this.bobZ) * k;
  }

  update(dt: number) {
    super.update(dt);
    if (this.spawnT <= 0) this.updateBob(dt);
    for (const p of this.trail) p.t += dt;
    this.trail = this.trail.filter((p) => p.t < 0.18);
  }

  added() {
    super.added();
    const h = this.handPos();
    this.bobX = h.x; this.bobY = this.y + 6; this.bobZ = 6;
  }

  renderTelegraph(r: Renderer) {
    if (this.state === 'swingWind') {
      const k = this.stateT / this.windDur;
      this.teleArc(r, this.x, this.y, EX_R, 13, this.s0, this.s1, k);
    }
    if (this.state === 'slamWind') {
      const k = this.stateT / 0.8;
      teleDisc(r, this.slamX, this.slamY, 28, k, this.world.time);
      // reach of the shockwave
      const ctx = r.u;
      ctx.strokeStyle = col('R3');
      ctx.globalAlpha = 0.2 + k * 0.35;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(Math.round(this.slamX), Math.round(this.slamY), 96, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  /** the swing path: an annular band from a0 to a1 with chevrons showing the sweep direction */
  private teleArc(r: Renderer, x: number, y: number, R: number, hw: number, a0: number, a1: number, k: number) {
    const ctx = r.u;
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    ctx.globalAlpha = 0.18 + k * 0.22;
    ctx.fillStyle = col('R3');
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), R + hw, lo, hi);
    ctx.arc(Math.round(x), Math.round(y), R - hw, hi, lo, true);
    ctx.closePath();
    ctx.fill();
    // filling edge (thin → full), then flash white
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = col('R3');
    ctx.lineWidth = 1;
    const ak = a0 + (a1 - a0) * k;
    ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), R + hw, Math.min(a0, ak), Math.max(a0, ak)); ctx.stroke();
    ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), R - hw, Math.min(a0, ak), Math.max(a0, ak)); ctx.stroke();
    // chevrons marching in the swing direction
    ctx.fillStyle = col('R4');
    const sgn = Math.sign(a1 - a0);
    const step = 0.32;
    const off = ((this.world.time * 2.2) % 1) * step;
    for (let a = lo + off; a < hi; a += step) {
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let j = -4; j <= 4; j++) {
        const back = Math.abs(j) * 0.9;
        const rr = R + j;
        const aa = a - (sgn * back) / R;
        ctx.fillRect(Math.round(x + Math.cos(aa) * rr), Math.round(y + Math.sin(aa) * rr), 1, 1);
      }
      void ca; void sa;
    }
    if (k > 0.85 && Math.floor(this.world.time * 30) % 2 === 0) {
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(Math.round(x), Math.round(y), R + hw, lo, hi);
      ctx.arc(Math.round(x), Math.round(y), R - hw, hi, lo, true);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  renderGround(r: Renderer) {
    super.renderGround(r);
    if (this.spawnT > 0 || this.falling > 0) return;
    // the bob's shadow on the dial
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.35)';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.bobX), Math.round(this.bobY), 6, 2.5, 0, 0, TAU);
    ctx.fill();
  }

  render(r: Renderer) {
    const A = EXE();
    let s: Sprite = A.idle[Math.floor(this.age * 2) % 2];
    if (this.state === 'approach' && Math.hypot(this.vx, this.vy) > 3) s = A.walk[Math.floor(this.age * 4) % 4];
    if (this.state === 'swingWind') s = A.windup;
    if (this.state === 'swinging') s = A.swing;
    if (this.state === 'slamWind') s = A.lift;
    if (this.state === 'slam') s = this.stateT < 0.45 ? A.slam : A.idle[0];
    const show = this.spawnT <= 0 && this.falling <= 0;
    const bobBehind = this.bobY < this.y - 2;
    if (show && bobBehind) this.drawPendulum(r);
    this.drawBody(r, s);
    if (show && !bobBehind) this.drawPendulum(r);
    if (!show) return;
    // the dial-face eyes
    const fx = this.flip ? -1 : 1;
    const ey = this.y - 46 + 12 + 4;
    const hot = this.state === 'swingWind' || this.state === 'slamWind';
    r.glowAt(this.x + fx * 1, ey, hot ? 9 : 5, 'V3', hot ? 0.75 : 0.4);
    if (hot) r.lightAt(this.x, this.y - 20, 70, 'V3', 0.3);
  }

  private drawPendulum(r: Renderer) {
    const ctx = r.w;
    const h = this.handPos();
    const ex = this.bobX, ey = this.bobY - this.bobZ;
    const dx = ex - h.x, dy = ey - h.y;
    const L = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    // swing trail (moon-steel afterimage of the blade)
    for (const p of this.trail) {
      const a = 1 - p.t / 0.18;
      const pa = Math.atan2(p.y - p.z - h.y, p.x - h.x);
      drawSprite(r.u, pendulumRot().get(pa), p.x - Math.cos(pa) * 11, p.y - p.z - Math.sin(pa) * 11, { tint: 'U4', alpha: 0.35 * a });
    }
    // chain: dark backing then alternating brass links
    const cl = L - 11;
    for (let d = 0; d < cl; d += 1) {
      const x = Math.round(h.x + (dx / L) * d), y = Math.round(h.y + (dy / L) * d);
      ctx.fillStyle = col('K0'); ctx.fillRect(x - 1, y - 1, 3, 3);
    }
    for (let d = 0; d < cl; d += 3) {
      const x = Math.round(h.x + (dx / L) * d), y = Math.round(h.y + (dy / L) * d);
      const odd = Math.floor(d / 3) % 2;
      ctx.fillStyle = col(odd ? 'B2' : 'B4'); ctx.fillRect(x, y, odd ? 1 : 2, odd ? 2 : 1);
    }
    const tint = this.flash > 0 ? '#ffffff' : undefined;
    drawSprite(ctx, pendulumRot().get(ang), ex - Math.cos(ang) * 11, ey - Math.sin(ang) * 11, { tint });
    if (this.state === 'swinging' || this.state === 'slamWind') r.glowAt(ex, ey, 10, 'U4', 0.25);
  }
}

/** the slam's shockwave: a ring that rolls outward across the dial (dash through it) */
class Shockwave extends Entity {
  t = 0; dur = 0.6; r0 = 16; r1 = 96;
  private hit = new Set<number>();
  constructor(x: number, y: number, private owner: Actor) {
    super();
    this.x = x; this.y = y;
  }
  private R() { return this.r0 + (this.r1 - this.r0) * ease.outQuad(Math.min(1, this.t / this.dur)); }
  update(dt: number) {
    this.t += dt;
    const R = this.R();
    this.world.combat.add({
      shape: { t: 'arc', x: this.x, y: this.y - 4, r: R + 4, a: 0, w: Math.PI, r0: R - 5 }, team: 'enemy', life: 1, hit: this.hit,
      info: { amount: 10, kind: 'aoe', owner: this.owner, x: this.x, y: this.y, knock: 200 },
    });
    for (let i = 0; i < 3; i++) {
      const a = frand(0, TAU);
      const px = this.x + Math.cos(a) * R, py = this.y + Math.sin(a) * R;
      if (this.world.map.isFloor(Math.floor(px / 16), Math.floor(py / 16))) this.world.particles.spawn({ kind: 'smoke', x: px, y: py, vx: Math.cos(a) * 20, vy: Math.sin(a) * 10 - 6, life: frand(0.25, 0.4), ramp: ['K8', 'K7', 'K6'], size: 1.5, size2: 3.5, drag: 3, alpha: 0.5 });
    }
    if (this.t >= this.dur) this.kill();
  }
  renderGround(r: Renderer) {
    const R = this.R();
    const k = this.t / this.dur;
    const ctx = r.u;
    ctx.globalAlpha = 0.85 * (1 - k * 0.6);
    ctx.lineWidth = 3;
    ctx.strokeStyle = col('R3');
    ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = col('K10');
    ctx.beginPath(); ctx.arc(Math.round(this.x), Math.round(this.y), R - 1, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export const ROSTER: EnemyDef[] = [
  {
    id: 'minuteknight', cost: 4, make: (x, y) => new MinuteKnight(x, y), weight: 3,
    name: { zh: '分针骑士', en: 'Minute Knight' },
    desc: {
      zh: '以大钟的分针为剑的骑士，至今仍在为一个不会到来的整点守夜。三段追身斩，每一斩前都会把剑拉到身后；连斩之后举剑格挡，正面的攻击会被弹开——绕到它身侧。',
      en: 'A knight who wields the Great Clock\'s minute hand, still keeping vigil for an hour that never comes. Three tracking cuts, each drawn back first; afterwards it raises the blade to guard, deflecting blows from the front. Get round its side.',
    },
  },
  {
    id: 'starshard', cost: 1, group: 3, make: (x, y) => new StarShard(x, y), weight: 2.5,
    name: { zh: '星屑', en: 'Star Shard' },
    desc: {
      zh: '从凝固的夜空中剥落的星光碎片，三五成群地绕着你飞。发光并拉出细线后会射出一颗星；被击碎时残核会在标出的范围里炸开。',
      en: 'Splinters of starlight flaked from the frozen sky, circling you in small flocks. One glows and draws a thin line before it fires; shattered, its core bursts inside a marked circle.',
    },
  },
  {
    id: 'hourlancer', cost: 4, make: (x, y) => new HourLancer(x, y), weight: 2.5, minRoom: 1,
    name: { zh: '时针枪兵', en: 'Hour Lancer' },
    desc: {
      zh: '扛着时针的重装枪兵，走得和时针一样慢。站定之后会沿一条粗线锁定你，然后冲完整条线；撞墙会头晕好一阵子。',
      en: 'A heavy lancer bearing the hour hand, as slow as the hand it carries. It plants its feet, locks a thick line onto you, then charges the whole length — and is left reeling if it meets a wall.',
    },
  },
  {
    id: 'echophantom', cost: 4, make: (x, y) => new EchoPhantom(x, y), weight: 1.6, minRoom: 1,
    name: { zh: '残响幻影', en: 'Echo Phantom' },
    desc: {
      zh: '残响的暗面。它记下你的每一步，在你身后约三秒处走你走过的路，在你挥剑过的地方挥出紫色的、无法回溯的一剑。站着不动，就会撞上过去的自己。',
      en: 'The dark side of an Echo. It remembers your every step and walks your path about three seconds behind, cutting where you cut — violet blows that rewind cannot undo. Stand still and your past catches up with you.',
    },
  },
  {
    id: 'pendulum', cost: 14, make: (x, y) => new PendulumExecutioner(x, y), elite: true,
    name: { zh: '钟摆刽子手', en: 'Pendulum Executioner' },
    desc: {
      zh: '一座落地钟化作的行刑者，钟摆就是它的刀。它会沿标出的弧线左右各荡一次——站进弧线里面而不是线上；随后把钟摆举过头顶砸向表盘，冲击波会向外扩散，冲刺可以穿过。',
      en: 'A longcase clock turned executioner; its pendulum is the blade. It sweeps once each way along a marked arc — stand inside the arc, not on it — then lifts the bob overhead and slams the dial, sending out a shockwave you can dash through.',
    },
  },
];
