// Floor 2 — 铜绿温室 The Verdigris Conservatory: enemy roster.
//   孢子囊 Spore Pod · 咬藤 Snapvine · 铜蛾 Brass Moth · 修剪者 Pruner · elite 荆棘母 Thornmother
import { Enemy } from '../enemy';
import { Entity } from '../entity';
import type { Renderer } from '../../../engine/gfx/renderer';
import { drawSprite, RotCache, Sprite } from '../../../engine/gfx/sprite';
import { buildSporePod, buildSnapvine, buildMoth, buildPruner, buildThornmother, paintShears } from '../../../art/sprites/conservatory';
import { Bullet } from '../projectile';
import { frand, fpick } from '../../../engine/rng';
import { angleTo, angleDiff, TAU, clamp } from '../../../engine/math';
import { col } from '../../../art/palette';
import { sfx } from '../../G';
import type { DamageInfo } from '../../systems/combat';
import type { EnemyDef } from '../../world/enemyDef';

function lazy<T>(f: () => T): () => T { let v: T | null = null; return () => (v ??= f()); }
const POD = lazy(buildSporePod), VINE = lazy(buildSnapvine), MOTH = lazy(buildMoth), PRUNE = lazy(buildPruner), MOTHER = lazy(buildThornmother);
const SHEARS = lazy(() => [new RotCache(paintShears(0.04), 32), new RotCache(paintShears(0.2), 32), new RotCache(paintShears(0.42), 32)]);

const SPORE_PAL = ['O4', 'O3', 'O1'];
const ease = (k: number) => k * k * (3 - 2 * k);

/** short red ticks marking where a ring of bullets will fly */
function laneTicks(e: Enemy, r: Renderer, x: number, y: number, angs: number[], r0: number, len: number, k: number) {
  const ctx = r.u;
  ctx.fillStyle = col('R3');
  for (const a of angs) {
    const c = Math.cos(a), s = Math.sin(a) * 0.72;
    const n = Math.max(1, Math.round(len * k));
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = (0.35 + 0.5 * k) * (1 - i / (len + 2));
      ctx.fillRect(Math.round(x + c * (r0 + i)), Math.round(y + s * (r0 + i)), 1, 1);
    }
  }
  if (k > 0.85 && Math.floor(e.world.time * 30) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.5;
    for (const a of angs) ctx.fillRect(Math.round(x + Math.cos(a) * r0), Math.round(y + Math.sin(a) * 0.72 * r0), 1, 1);
  }
  ctx.globalAlpha = 1;
}

function leafBurst(e: Enemy, n: number, ramp = ['G2', 'G3', 'T2', 'B2']) {
  for (let i = 0; i < n; i++) {
    const a = frand(0, TAU), s = frand(30, 110);
    e.world.particles.spawn({ kind: 'debris', x: e.x, y: e.y - 2, z: frand(4, e.height * 0.8), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: frand(40, 120), grav: 260, life: frand(0.7, 1.3), ramp: [fpick(ramp)], size: frand(1, 2), vrot: frand(-12, 12), bounce: 0.2, drag: 1.5 });
  }
}

// ───────────────────────────── 孢子囊 Spore Pod ─────────────────────────────
// Rooted. Swells (copper ribs glow, red lanes mark the spore paths), then puffs a slow ring of
// pollen spores. Rings alternate between aiming a spore at you and aiming a gap at you.
export class SporePod extends Enemy {
  fireT = frand(0.9, 1.8);
  ring = Math.random() < 0.5 ? 0 : 1;
  wob = 0; wobV = 0;
  lanes: number[] = [];
  static readonly N = 8;
  constructor(x: number, y: number) {
    super(x, y, 30);
    this.r = 6; this.height = 16; this.mass = 99; this.flinch = 14; this.speed = 0;
    this.kind = 'sporepod'; this.codexId = 'sporepod';
    this.debris = ['T2', 'T3', 'G2', 'B2', 'T1'];
    this.brass = [1, 2];
    this.canFall = false;
  }
  update(dt: number) {
    super.update(dt);
    // spring-damper wobble of the bulb
    this.wobV += (-this.wob * 180 - this.wobV * 9) * dt;
    this.wob += this.wobV * dt;
  }
  onHurt(info: DamageInfo) {
    const dir = info.x !== undefined ? Math.sign(this.x - info.x) || 1 : 1;
    this.wobV += dir * (40 + info.amount * 3);
    sfx('podWobble', { vol: 0.5, pan: this.world.pan(this.x) });
  }
  think(dt: number) {
    const t = this.target;
    if (!t) return;
    switch (this.state) {
      case 'idle':
        this.fireT -= dt;
        if (this.fireT <= 0 && this.distT() < 210 && this.world.map.los(this.x, this.y - 10, t.x, t.y - 8)) {
          const base = this.angT() + (this.ring % 2 ? Math.PI / SporePod.N : 0);
          this.lanes = [];
          for (let i = 0; i < SporePod.N; i++) this.lanes.push(base + (i / SporePod.N) * TAU);
          this.setState('swell');
          sfx('podSwell', { vol: 0.7, pan: this.world.pan(this.x) });
        }
        break;
      case 'swell':
        if (this.stateT > 0.8) {
          this.setState('puff');
          this.attacking = true;
          this.ring++;
          for (const a of this.lanes)
            this.world.add(new Bullet({ team: 'enemy', x: this.x + Math.cos(a) * 10, y: this.y - 11 + Math.sin(a) * 7, ang: a, speed: 60, accel: -8, dmg: 7, style: 'spore', r: 3, life: 3.6, owner: this, pal: SPORE_PAL }));
          for (let i = 0; i < 12; i++) {
            const a = frand(0, TAU), s = frand(10, 40);
            this.world.particles.spawn({ kind: 'smoke', x: this.x, y: this.y - 14, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 10, life: frand(0.4, 0.8), ramp: ['K9', 'S4', 'S3'], size: 1.5, size2: 4, drag: 3, alpha: 0.5 });
          }
          this.world.fx.ring(this.x, this.y - 10, 4, 22, 0.3, 'O3', 1);
          this.squash = 0.7;
          this.wobV += frand(-30, 30);
          sfx('podPuff', { pan: this.world.pan(this.x) });
        }
        break;
      case 'puff':
        if (this.stateT > 0.35) this.setState('limp');
        break;
      case 'limp':
        if (this.stateT > 0.6) { this.setState('idle'); this.fireT = frand(1.5, 2.3); }
        break;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'swell') laneTicks(this, r, this.x, this.y - 2, this.lanes, 9, 14, Math.min(1, this.stateT / 0.8));
  }
  render(r: Renderer) {
    const A = POD();
    this.drawBody(r, A.base);
    let s: Sprite;
    if (this.state === 'swell') s = A.swell[Math.min(2, Math.floor((this.stateT / 0.8) * 3))];
    else if (this.state === 'puff') s = A.puff;
    else if (this.state === 'limp') s = this.stateT < 0.3 ? A.limp : A.idle[0];
    else s = A.idle[[0, 1, 2, 1][Math.floor(this.age * 2.2) % 4]];
    // swell shiver
    const shiver = this.state === 'swell' && this.stateT > 0.5 ? (Math.floor(this.age * 40) % 2 ? 1 : -1) * 0.5 : 0;
    const x0 = this.x, y0 = this.y;
    this.x += Math.round(this.wob + shiver);
    this.y -= 3;
    this.drawBody(r, s);
    this.x = x0; this.y = y0;
    if (this.spawnT <= 0 && this.state === 'swell') {
      const k = this.stateT / 0.8;
      r.glowAt(this.x, this.y - 12, 4 + k * 5, 'O3', 0.12 + k * 0.3);
      r.lightAt(this.x, this.y - 10, 40, 'O2', 0.35 * k);
    }
  }
  onDeath(info: DamageInfo) {
    super.onDeath(info);
    if (info.kind === 'fall') return;
    sfx('plantDeath', { pan: this.world.pan(this.x) });
    for (let i = 0; i < 14; i++) {
      const a = frand(0, TAU), s = frand(10, 50);
      this.world.particles.spawn({ kind: 'smoke', x: this.x, y: this.y - 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 - 8, life: frand(0.5, 1), ramp: ['S4', 'K9', 'S3'], size: 2, size2: 5, drag: 2.5, alpha: 0.45 });
    }
  }
}

// ───────────────────────────── 咬藤 Snapvine ─────────────────────────────
// Travels under the tiles as a rustling mound (untouchable), bursts up beside you, gapes wide
// (red cone), snaps, lingers vulnerable, then digs back down.
export class Snapvine extends Enemy {
  biteA = 0;
  rise = 0;
  bites = 0;
  rustleT = 0;
  face = 1;
  constructor(x: number, y: number) {
    super(x, y, 40);
    this.r = 6; this.height = 18; this.speed = 64; this.flinch = 14;
    this.kind = 'snapvine'; this.codexId = 'snapvine';
    this.debris = ['G2', 'G3', 'B2', 'B3', 'R2'];
    this.brass = [2, 3];
  }
  get under() { return this.state === 'burrow' || this.state === 'idle'; }
  think(dt: number) {
    const t = this.target;
    if (!t) return;
    const d = this.distT();
    if (this.under) {
      this.invuln = 0.05;
      this.solid = false;
      this.canFall = false;
    } else { this.solid = true; this.canFall = true; }
    switch (this.state) {
      case 'idle':
        this.setState('burrow');
        break;
      case 'burrow': {
        this.rise = 0;
        this.moveTo(t.x, t.y, this.speed, dt);
        this.rustleT -= dt;
        if (this.rustleT <= 0) {
          this.rustleT = 0.1;
          this.world.fx.dust(this.x, this.y, 1);
          for (let i = 0; i < 2; i++) this.world.particles.spawn({ kind: 'debris', x: this.x + frand(-5, 5), y: this.y, z: 1, vx: frand(-24, 24), vy: frand(-8, 8), vz: frand(30, 70), grav: 300, life: 0.55, ramp: [fpick(['S1', 'S2', 'G3', 'B1'])], size: 1 });
          // the tiles it passes under are left lifted and cracked
          const dc = this.world.dctx;
          dc.fillStyle = 'rgba(11,10,20,0.22)';
          dc.fillRect(Math.round(this.x + frand(-4, 3)), Math.round(this.y + frand(-2, 1)), 2, 1);
          dc.fillStyle = 'rgba(90,68,48,0.35)';
          dc.fillRect(Math.round(this.x + frand(-4, 3)), Math.round(this.y + frand(-2, 1)), 1, 1);
          sfx('vineRustle', { vol: 0.45, pan: this.world.pan(this.x) });
        }
        if (((d < 30 && this.stateT > 0.7) || this.stateT > 3.4) && !this.world.map.pitAt(this.x, this.y) && !this.world.map.pitAt(this.x, this.y - 6)) {
          this.setState('emerge');
          this.world.fx.dust(this.x, this.y, 8);
          this.leafBits(6);
          this.world.shake(0.08);
          this.squash = 0.6;
          sfx('vineErupt', { pan: this.world.pan(this.x) });
          this.face = t.x < this.x ? -1 : 1;
        }
        break;
      }
      case 'emerge':
        this.rise = ease(Math.min(1, this.stateT / 0.42));
        this.face = t.x < this.x ? -1 : 1;
        if (this.stateT > 0.45) { this.setState('windup'); this.biteA = this.angT(); sfx('vineWind', { pan: this.world.pan(this.x) }); }
        break;
      case 'windup':
        this.rise = 1;
        if (this.stateT < 0.36) { this.biteA = this.angT(); this.face = Math.cos(this.biteA) < 0 ? -1 : 1; }
        if (this.stateT > 0.58) {
          this.setState('bite');
          this.attacking = true;
          this.world.combat.add({
            shape: { t: 'arc', x: this.x, y: this.y - 4, r: 38, a: this.biteA, w: 0.72 },
            team: 'enemy', life: 4,
            info: { amount: 10, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 150 },
          });
          this.world.shake(0.12);
          sfx('vineSnap', { pan: this.world.pan(this.x) });
          const hx = this.x + Math.cos(this.biteA) * 22, hy = this.y - 8 + Math.sin(this.biteA) * 14;
          for (let i = 0; i < 5; i++) this.world.particles.spawn({ kind: 'spark', x: hx, y: hy, vx: Math.cos(this.biteA + frand(-1, 1)) * frand(60, 140), vy: Math.sin(this.biteA + frand(-1, 1)) * frand(60, 140), life: frand(0.1, 0.2), ramp: ['W', 'K9', 'R3'], drag: 7, layer: 'glow' });
        }
        break;
      case 'bite':
        this.attacking = this.stateT < 0.08;
        if (this.stateT > 0.14) this.setState('recover');
        break;
      case 'recover':
        if (this.stateT > 0.8) {
          if (this.bites < 1 && d < 44 && Math.random() < 0.55) { this.bites++; this.setState('windup'); sfx('vineWind', { pan: this.world.pan(this.x) }); }
          else { this.bites = 0; this.setState('submerge'); sfx('vineDig', { pan: this.world.pan(this.x) }); }
        }
        break;
      case 'submerge':
        this.rise = 1 - ease(Math.min(1, this.stateT / 0.4));
        if (this.stateT > 0.22) this.invuln = 0.05;
        if (this.stateT > 0.42) { this.setState('burrow'); this.world.fx.dust(this.x, this.y, 5); }
        break;
    }
  }
  leafBits(n: number) { leafBurst(this, n, ['G2', 'G3', 'B0', 'S0']); }
  renderUnlit(r: Renderer) { if (!this.under) super.renderUnlit(r); }
  renderTelegraph(r: Renderer) {
    if (this.state === 'windup') this.teleCone(r, this.x, this.y - 2, this.biteA, 38, 0.72, Math.min(1, this.stateT / 0.58));
  }
  renderGround(r: Renderer) {
    if (this.under && this.spawnT <= 0) { this.renderTelegraph(r); return; }
    super.renderGround(r);
  }
  /** head hinge position relative to the root */
  headPos(): [number, number, number] {
    const up = 15 * this.rise;
    let hx = this.x - this.face * 2, hy = this.y - 3 - up;
    let jaw = 1;
    const sway = Math.sin(this.age * 2.3) * 1.5;
    switch (this.state) {
      case 'windup': {
        const k = Math.min(1, this.stateT / 0.4);
        hx -= Math.cos(this.biteA) * 5 * k; hy -= 3 * k + Math.sin(this.biteA) * 2 * k;
        jaw = k > 0.4 ? 3 : 2;
        break;
      }
      case 'bite':
        hx += Math.cos(this.biteA) * 13; hy += Math.sin(this.biteA) * 9 + 4;
        jaw = 0;
        break;
      case 'recover':
        hx += sway; jaw = this.stateT < 0.2 ? 0 : 1;
        break;
      case 'emerge':
        jaw = this.stateT > 0.3 ? 2 : 0;
        break;
      default:
        hx += sway;
        jaw = Math.floor(this.age * 1.5) % 4 === 0 ? 0 : 1;
    }
    return [hx, hy, jaw];
  }
  render(r: Renderer) {
    const A = VINE();
    if (this.spawnT > 0 || this.under) {
      // rustling mound pushing up the tiles
      const s = A.mound[Math.floor(this.age * 9) % 2];
      const jx = this.state === 'burrow' ? (Math.floor(this.age * 20) % 2 ? 1 : 0) : 0;
      const x0 = this.x;
      this.x += jx;
      this.drawBody(r, s, { flip: false });
      this.x = x0;
      return;
    }
    if (this.falling > 0) { this.drawBody(r, A.heads[0]); return; }
    const [hx, hy, jaw] = this.headPos();
    const tint = this.flash > 0 ? '#ffffff' : undefined;
    drawSprite(r.w, A.root, this.x, this.y, { tint });
    // beaded neck along a curve from the root to the hinge
    const rx = this.x, ry = this.y - 2;
    const cx = this.x - this.face * 7, cy = (ry + hy) / 2 - 2;
    const len = Math.hypot(hx - rx, hy - ry);
    const n = Math.max(2, Math.round(len / 3.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (1 - t) * (1 - t) * rx + 2 * (1 - t) * t * cx + t * t * hx;
      const y = (1 - t) * (1 - t) * ry + 2 * (1 - t) * t * cy + t * t * hy;
      drawSprite(r.w, i % 3 === 1 ? A.beadThorn : A.bead, x, y, { tint, flip: this.face < 0 });
    }
    const flip = this.state === 'windup' || this.state === 'bite' ? Math.cos(this.biteA) < 0 : this.face < 0;
    const opts = { flip, tint } as { flip: boolean; tint?: string; sx?: number; sy?: number };
    if (this.squash > 0.02) { opts.sx = 1 + this.squash * 0.2; opts.sy = 1 - this.squash * 0.15; }
    let head = A.heads[jaw];
    if (this.st.stasis > 0) head = head.recolor(['V0', 'V1', 'V2', 'V3', 'V4']);
    drawSprite(r.w, head, hx, hy, opts);
    if (this.state === 'windup') r.lightAt(hx + (flip ? -8 : 8), hy, 26, 'R3', 0.45 * Math.min(1, this.stateT / 0.5));
  }
  onDeath(info: DamageInfo) {
    super.onDeath(info);
    if (info.kind !== 'fall') { sfx('plantDeath', { pan: this.world.pan(this.x) }); leafBurst(this, 10); }
  }
}

// ───────────────────────────── 铜蛾 Brass Moth ─────────────────────────────
// Flutters on an erratic sine path around you. Hovering with fast wingbeats = a dive along the red line;
// folding the wings with a glowing abdomen = a slow dust bolt.
export class BrassMoth extends Enemy {
  orbitA = frand(0, TAU);
  orbitDir = Math.random() < 0.5 ? 1 : -1;
  orbitR = frand(55, 85);
  atkT = frand(1.4, 3.0);
  diveA = 0;
  t = frand(0, 10);
  hitDone = false;
  flapT = 0;
  constructor(x: number, y: number) {
    super(x, y, 20);
    this.r = 5; this.height = 24; this.speed = 74; this.mass = 0.6; this.flinch = 8;
    this.kind = 'brassmoth'; this.codexId = 'brassmoth';
    this.debris = ['B3', 'B4', 'B2', 'T3', 'K8'];
    this.brass = [0, 1];
    this.canFall = false;
    this.z = 14;
    this.spawnT = frand(0.55, 0.9);
  }
  private fly(tx: number, ty: number, sp: number, dt: number) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
    // erratic: a perpendicular sine flutter on top of the steering
    const w = Math.sin(this.t * 7.3) * 0.9 + Math.sin(this.t * 3.1) * 0.5;
    const nx = dx / d, ny = dy / d;
    const vx = (nx - ny * w) * sp, vy = (ny + nx * w) * sp;
    this.vx += (vx - this.vx) * Math.min(1, dt * 5);
    this.vy += (vy - this.vy) * Math.min(1, dt * 5);
    this.world.move(this, this.vx * dt, this.vy * dt);
    if (Math.abs(this.vx) > 6) this.flip = this.vx < 0;
  }
  think(dt: number) {
    this.t += dt;
    const t = this.target;
    if (!t) return;
    const d = this.distT();
    switch (this.state) {
      case 'idle':
      case 'flutter': {
        this.orbitA += dt * 0.8 * this.orbitDir;
        const tx = t.x + Math.cos(this.orbitA) * this.orbitR, ty = t.y + Math.sin(this.orbitA) * this.orbitR * 0.6;
        this.fly(tx, ty, d > 160 ? this.speed * 1.3 : this.speed, dt);
        this.z += (14 + Math.sin(this.t * 3) * 3 - this.z) * Math.min(1, dt * 4);
        this.flapT -= dt;
        if (this.flapT <= 0) { this.flapT = 0.35; sfx('mothFlap', { vol: 0.35, pan: this.world.pan(this.x) }); }
        this.atkT -= dt;
        if (this.atkT <= 0 && d < 160 && this.world.map.los(this.x, this.y - 6, t.x, t.y - 6)) {
          if (d < 105 && Math.random() < 0.55) { this.setState('diveWind'); this.diveA = this.angT(); sfx('mothDiveWind', { pan: this.world.pan(this.x) }); }
          else { this.setState('dustWind'); sfx('mothDust', { vol: 0.4, pan: this.world.pan(this.x) }); }
        }
        break;
      }
      case 'diveWind':
        this.vx *= 0.85; this.vy *= 0.85;
        this.z += (20 - this.z) * Math.min(1, dt * 6);
        if (this.stateT < 0.36) { this.diveA = this.angT(); this.flip = Math.cos(this.diveA) < 0; }
        if (this.stateT > 0.52) { this.setState('dive'); this.hitDone = false; sfx('mothDive', { pan: this.world.pan(this.x) }); }
        break;
      case 'dive': {
        this.attacking = true;
        const sp = 210;
        this.vx = Math.cos(this.diveA) * sp; this.vy = Math.sin(this.diveA) * sp;
        const blocked = this.world.move(this, this.vx * dt, this.vy * dt);
        this.z += (5 - this.z) * Math.min(1, dt * 10);
        if (!this.hitDone) this.hitDone = this.world.hurtPlayers({ t: 'circle', x: this.x, y: this.y, r: this.r + 3 }, { amount: 7, kind: 'contact', owner: this, x: this.x, y: this.y, knock: 120 }) > 0;
        if (Math.floor(this.stateT * 40) % 2 === 0) this.world.particles.spawn({ kind: 'px', x: this.x + frand(-3, 3), y: this.y - this.z, vx: frand(-10, 10), vy: frand(-5, 5), life: 0.4, ramp: ['B5', 'B3', 'B1'], layer: 'world', size: 1 });
        if (blocked || this.stateT > 0.38) { this.setState('recover'); if (blocked) { this.world.fx.hitSparks(this.x, this.y - this.z, this.diveA + Math.PI, 'normal', 4); this.squash = 0.5; } }
        break;
      }
      case 'recover':
        this.vx *= 0.9; this.vy *= 0.9;
        this.world.move(this, this.vx * dt, this.vy * dt);
        this.z += (14 - this.z) * Math.min(1, dt * 4);
        if (this.stateT > 0.55) { this.setState('flutter'); this.atkT = frand(2.2, 3.6); this.orbitDir *= -1; }
        break;
      case 'dustWind':
        this.vx *= 0.9; this.vy *= 0.9;
        this.world.move(this, this.vx * dt, this.vy * dt);
        this.flip = t.x < this.x;
        if (this.stateT > 0.45) {
          this.setState('dust');
          const a = angleTo(this.x, this.y, t.x, t.y);
          this.world.add(new Bullet({ team: 'enemy', x: this.x, y: this.y - this.z + 4, ang: a, speed: 88, dmg: 6, style: 'orb', r: 2.5, owner: this, life: 3 }));
          for (let i = 0; i < 6; i++) this.world.particles.spawn({ kind: 'px', x: this.x + frand(-4, 4), y: this.y - this.z + 3, vx: frand(-15, 15), vy: frand(5, 25), life: frand(0.4, 0.8), ramp: ['B6', 'B5', 'B3'], layer: 'glow', size: 1, alpha: 0.7 });
        }
        break;
      case 'dust':
        if (this.stateT > 0.3) { this.setState('flutter'); this.atkT = frand(2.0, 3.4); }
        break;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'diveWind') this.teleLine(r, this.x, this.y, this.diveA, 80, 10, Math.min(1, this.stateT / 0.52));
  }
  render(r: Renderer) {
    const A = MOTH();
    let s: Sprite;
    let glint = false;
    if (this.state === 'dive') s = A.dive;
    else if (this.state === 'dustWind' || this.state === 'dust') s = A.flap[2];
    else {
      const rate = this.state === 'diveWind' ? 28 : 15;
      const f = Math.floor(this.t * rate) % 4;
      s = A.flap[f];
      glint = f === 0;
    }
    const y0 = this.y;
    this.y -= Math.round(this.z);
    this.drawBody(r, s);
    this.y = y0;
    if (this.spawnT > 0 || this.falling > 0) return;
    const by = this.y - this.z;
    // brass wings catch the light at the top of each beat
    if (glint) { r.glowAt(this.x - 6, by - 3, 4, 'B6', 0.3); r.glowAt(this.x + 6, by - 3, 4, 'B6', 0.22); }
    if (this.state === 'dustWind') {
      const k = this.stateT / 0.45;
      r.glowAt(this.x, by + 3, 3 + k * 5, 'M2', 0.3 + k * 0.6);
      r.lightAt(this.x, by + 3, 26, 'M2', 0.4 * k);
    }
    if (this.state === 'diveWind') r.lightAt(this.x, by, 24, 'R3', 0.4 * Math.min(1, this.stateT / 0.5));
  }
}

// ───────────────────────────── 修剪者 Pruner ─────────────────────────────
// A bell-jar gardener with great shears. Crouches and opens the blades (red cut line), dashes and snips,
// turns and cuts again along a second line, then stands slumped and vulnerable.
export class Pruner extends Enemy {
  cutA = 0;
  cutN = 0;
  blade = 0.3;
  stepT = 0;
  constructor(x: number, y: number) {
    super(x, y, 55);
    this.r = 6; this.height = 24; this.speed = 36; this.flinch = 16; this.mass = 1.4;
    this.kind = 'pruner'; this.codexId = 'pruner';
    this.debris = ['B3', 'K8', 'G1', 'U3', 'B2'];
    this.brass = [2, 4];
  }
  static readonly DASH = 86;
  think(dt: number) {
    const t = this.target;
    if (!t) return;
    const d = this.distT();
    switch (this.state) {
      case 'idle':
      case 'approach':
        this.moveTo(t.x, t.y, this.speed, dt);
        this.blade = 0.25 + Math.max(0, Math.sin(this.age * 5)) * 0.35;
        this.cutA = this.angT();
        this.stepT -= dt;
        if (this.stepT <= 0 && Math.hypot(this.vx, this.vy) > 4) { this.stepT = 0.32; sfx('prunerStep', { vol: 0.5, pan: this.world.pan(this.x) }); }
        if (d < 92 && this.stateT > 0.7 && this.world.map.los(this.x, this.y - 6, t.x, t.y - 6)) {
          this.cutN = 0;
          this.setState('aim');
          sfx('prunerWind', { pan: this.world.pan(this.x) });
        }
        break;
      case 'aim': {
        const dur = this.cutN === 0 ? 0.62 : 0.44;
        const track = this.cutN === 0 ? 0.42 : 0.26;
        if (this.stateT < track) { this.cutA = this.angT(); this.faceTarget(); }
        this.blade = Math.min(1, this.stateT / (dur * 0.6));
        if (this.stateT > dur) {
          this.setState('dash');
          this.attacking = true;
          this.world.combat.add({
            shape: { t: 'circle', x: this.x + Math.cos(this.cutA) * 9, y: this.y - 6 + Math.sin(this.cutA) * 6, r: 10 },
            team: 'enemy', life: 16, follow: this,
            info: { amount: 10, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 160 },
          });
          sfx('prunerDash', { pan: this.world.pan(this.x) });
        }
        break;
      }
      case 'dash': {
        this.attacking = true;
        const sp = Pruner.DASH / 0.24;
        // stop at a pond's edge rather than shearing straight into the water
        const edge = this.world.map.pitAt(this.x + Math.cos(this.cutA) * 9, this.y + Math.sin(this.cutA) * 9);
        const blocked = edge || this.world.move(this, Math.cos(this.cutA) * sp * dt, Math.sin(this.cutA) * sp * dt);
        this.vx = Math.cos(this.cutA) * sp; this.vy = Math.sin(this.cutA) * sp;
        this.blade = Math.max(0, 1 - this.stateT / 0.2);
        if (Math.floor(this.stateT * 60) % 2 === 0) this.world.fx.dust(this.x, this.y, 1, this.cutA);
        if (blocked || this.stateT > 0.24) {
          this.vx = this.vy = 0;
          sfx('prunerSnip', { pan: this.world.pan(this.x) });
          const sx = this.x + Math.cos(this.cutA) * 16, sy = this.y - 8 + Math.sin(this.cutA) * 10;
          for (let i = 0; i < 6; i++) this.world.particles.spawn({ kind: 'spark', x: sx, y: sy, vx: Math.cos(this.cutA + frand(-1.2, 1.2)) * frand(60, 160), vy: Math.sin(this.cutA + frand(-1.2, 1.2)) * frand(60, 160), life: frand(0.1, 0.22), ramp: ['W', 'K10', 'K8'], drag: 7, layer: 'glow' });
          leafBurst(this, 3, ['G2', 'G3', 'K9']);
          if (blocked) { this.world.shake(0.1); this.squash = 0.5; }
          this.cutN++;
          if (this.cutN < 2) { this.setState('aim'); sfx('prunerWind', { vol: 0.7, pan: this.world.pan(this.x) }); }
          else this.setState('recover');
        }
        break;
      }
      case 'recover':
        this.blade = 0.42;
        if (this.stateT < 0.05) this.world.fx.smoke(this.x, this.y - 24, 3, ['K9', 'K8', 'K7']);
        if (this.stateT > 0.95) this.setState('approach');
        break;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'aim') {
      const dur = this.cutN === 0 ? 0.62 : 0.44;
      this.teleLine(r, this.x, this.y - 2, this.cutA, Pruner.DASH + 10, 16, Math.min(1, this.stateT / dur));
    }
  }
  render(r: Renderer) {
    const A = PRUNE();
    let s = A.idle[Math.floor(this.age * 2.5) % 2];
    if ((this.state === 'approach' || this.state === 'idle') && Math.hypot(this.vx, this.vy) > 4) s = A.walk[Math.floor(this.age * 7) % 4];
    if (this.state === 'aim') s = A.crouch;
    if (this.state === 'dash') s = A.lunge;
    if (this.state === 'recover') s = A.slump;
    const walking = this.state === 'approach' || this.state === 'idle';
    const a = walking ? (this.flip ? Math.PI - 0.5 : 0.5) : this.cutA;
    const hx = this.x + Math.cos(a) * 4, hy = this.y - 11 + (this.state === 'aim' ? 2 : 0) + Math.sin(a) * 2;
    const S = SHEARS();
    const sh = S[this.blade > 0.66 ? 2 : this.blade > 0.25 ? 1 : 0].get(a);
    const behind = Math.sin(a) < -0.35;
    const tint = this.flash > 0 ? '#ffffff' : undefined;
    const drawArms = () => {
      if (this.spawnT > 0 || this.falling > 0) return;
      const ctx = r.w;
      for (const sx of [-3, 3]) {
        const x0 = this.x + sx, y0 = this.y - 15 + (this.state === 'aim' ? 2 : 0);
        const n = Math.max(1, Math.round(Math.hypot(hx - x0, hy - y0)));
        for (let i = 0; i <= n; i++) {
          ctx.fillStyle = col(tint ?? (i < n / 2 ? 'B3' : 'B2'));
          ctx.fillRect(Math.round(x0 + ((hx - x0) * i) / n), Math.round(y0 + ((hy - y0) * i) / n), 1, 1);
        }
      }
    };
    if (behind && this.spawnT <= 0 && this.falling <= 0) { drawSprite(r.w, sh, hx, hy, { tint }); drawArms(); }
    this.drawBody(r, s);
    if (!behind && this.spawnT <= 0 && this.falling <= 0) { drawArms(); drawSprite(r.w, sh, hx, hy, { tint }); }
    if (this.spawnT <= 0 && this.falling <= 0) {
      const eye = this.state === 'aim' || this.state === 'dash';
      r.lightAt(this.x, this.y - 18, eye ? 34 : 22, eye ? 'R3' : 'O3', eye ? 0.55 : 0.35);
      r.glowAt(this.x - 1, this.y - 19, 3, eye ? 'R4' : 'O3', eye ? 0.5 : 0.25);
    }
  }
}

// ───────────────────────────── 荆棘母 Thornmother (elite) ─────────────────────────────

/** thorny root bursting through the tiles along a telegraphed line */
class RootSpike extends Entity {
  t = 0;
  constructor(x: number, y: number, private owner: Enemy, private dmg: number) {
    super();
    this.x = x; this.y = y;
  }
  added() {
    const w = this.world;
    w.combat.add({ shape: { t: 'circle', x: this.x, y: this.y - 4, r: 8 }, team: 'enemy', life: 7, info: { amount: this.dmg, kind: 'aoe', owner: this.owner, x: this.x, y: this.y + 6, knock: 120 } });
    w.fx.dust(this.x, this.y, 3);
    for (let i = 0; i < 4; i++) w.particles.spawn({ kind: 'debris', x: this.x + frand(-4, 4), y: this.y, z: 2, vx: frand(-40, 40), vy: frand(-20, 20), vz: frand(60, 130), grav: 380, life: frand(0.4, 0.8), ramp: [fpick(['B0', 'S0', 'T1', 'K5'])], size: 1 });
    w.dctx.fillStyle = 'rgba(11,10,20,0.28)';
    w.dctx.fillRect(Math.round(this.x) - 3, Math.round(this.y) - 1, 7, 2);
  }
  update(dt: number) { this.t += dt; if (this.t > 0.75) this.kill(); }
  render(r: Renderer) {
    const A = MOTHER();
    const f = this.t < 0.06 ? 0 : this.t < 0.5 ? 1 : 2;
    const sy = this.t > 0.6 ? Math.max(0.2, 1 - (this.t - 0.6) / 0.15) : 1;
    drawSprite(r.w, A.spike[f], this.x, this.y + 1, sy < 1 ? { sy } : undefined);
  }
}

export class Thornmother extends Enemy {
  next: 'volley' | 'roots' = Math.random() < 0.5 ? 'volley' : 'roots';
  cdT = 1.2;
  rings = 0;
  gapA = 0;
  gapDir = 1;
  lines: { a: number; len: number }[] = [];
  spikesDone = 0;
  wailed = false;
  static readonly RING = 22;
  constructor(x: number, y: number) {
    super(x, y, 360);
    this.r = 12; this.height = 44; this.speed = 20; this.mass = 6; this.flinch = 60;
    this.kind = 'thornmother'; this.codexId = 'thornmother';
    this.isElite = true;
    this.debris = ['G2', 'G3', 'T2', 'B2', 'K9', 'G1'];
    this.brass = [8, 12];
    this.sandDrop = 3;
    this.spawnT = 1.1;
    this.canFall = false; // rooted: her skirt of roots holds her at the pond's edge
  }
  get enraged() { return this.hp < this.maxHp * 0.5; }
  private ringAngles(gapA: number): number[] {
    const out: number[] = [];
    const n = Thornmother.RING, step = TAU / n;
    for (let i = 0; i < n; i++) {
      const a = i * step + gapA;
      // a gap of four thorns centred on gapA
      const dg = Math.abs(angleDiff(a, gapA));
      if (dg < step * 1.6) continue;
      out.push(a);
    }
    return out;
  }
  think(dt: number) {
    const t = this.target;
    if (!t) return;
    const d = this.distT();
    if (this.enraged && !this.wailed) { this.wailed = true; sfx('motherWail', { pan: this.world.pan(this.x) }); this.world.fx.ring(this.x, this.y - 20, 6, 60, 0.6, 'O2', 2); }
    switch (this.state) {
      case 'idle':
      case 'approach':
        if (d > 125) this.moveTo(t.x, t.y, this.speed, dt);
        else if (d < 64) this.moveDir(this.angT() + Math.PI, this.speed * 0.8, dt);
        else { this.vx *= 0.9; this.vy *= 0.9; }
        this.faceTarget();
        this.cdT -= dt;
        if (this.cdT <= 0) {
          if (this.next === 'volley') {
            this.setState('volleyWind');
            this.rings = 0;
            this.gapDir = Math.random() < 0.5 ? 1 : -1;
            // first gap opens a little to one side of you — step into it
            this.gapA = this.angT() + this.gapDir * frand(0.7, 1.1);
            sfx('motherVolleyWind', { pan: this.world.pan(this.x) });
          } else {
            this.setState('rootWind');
            const n = this.enraged ? 5 : 3, spread = this.enraged ? 0.32 : 0.42;
            const a0 = this.angT();
            this.lines = [];
            for (let i = 0; i < n; i++) {
              const a = a0 + (i - (n - 1) / 2) * spread;
              // stop each line at the first wall
              let len = 0;
              while (len < 190 && !this.world.map.solidAt(this.x + Math.cos(a) * (len + 8), this.y + Math.sin(a) * (len + 8))) len += 8;
              this.lines.push({ a, len: Math.max(24, len) });
            }
            this.spikesDone = 0;
            sfx('motherRootWind', { pan: this.world.pan(this.x) });
          }
        }
        break;
      case 'volleyWind':
        this.faceTarget();
        if (this.stateT > 0.8) { this.setState('volley'); this.fireRing(); }
        break;
      case 'volley': {
        const nRings = this.enraged ? 4 : 3;
        if (this.rings < nRings && this.stateT > this.rings * 0.42) this.fireRing();
        if (this.rings >= nRings && this.stateT > nRings * 0.42 + 0.45) { this.setState('approach'); this.next = 'roots'; this.cdT = frand(1.2, 1.8); }
        break;
      }
      case 'rootWind':
        if (this.stateT > 0.72) { this.setState('roots'); this.world.shake(0.15); }
        break;
      case 'roots': {
        // eruptions travel outward along every line
        const spacing = 13, tick = 0.045;
        const maxN = Math.max(...this.lines.map((l) => Math.floor((l.len - 14) / spacing) + 1));
        while (this.spikesDone < maxN && this.stateT >= this.spikesDone * tick) {
          const i = this.spikesDone++;
          for (const l of this.lines) {
            const dist = 16 + i * spacing;
            if (dist > l.len) continue;
            const x = this.x + Math.cos(l.a) * dist, y = this.y + Math.sin(l.a) * dist;
            if (this.world.map.pitAt(x, y)) continue;
            this.world.add(new RootSpike(x, y, this, 12));
          }
          if (i % 2 === 0) sfx('rootErupt', { pan: this.world.pan(this.x + Math.cos(this.lines[0].a) * (16 + i * spacing)) });
        }
        this.attacking = this.spikesDone < maxN;
        if (this.spikesDone >= maxN && this.stateT > maxN * tick + 0.7) { this.setState('approach'); this.next = 'volley'; this.cdT = frand(1.3, 2.0); }
        break;
      }
    }
  }
  private fireRing() {
    this.rings++;
    const sy = this.y - 22;
    for (const a of this.ringAngles(this.gapA))
      this.world.add(new Bullet({ team: 'enemy', x: this.x + Math.cos(a) * 15, y: sy + Math.sin(a) * 10, ang: a, speed: 74, dmg: 8, style: 'shard', r: 2.5, life: 4.2, owner: this }));
    this.gapA += this.gapDir * (this.enraged ? 0.75 : 0.6);
    this.world.fx.ring(this.x, sy, 6, 30, 0.3, 'M2', 2);
    this.world.shake(0.08);
    sfx('motherVolley', { pan: this.world.pan(this.x) });
    for (let i = 0; i < 6; i++) this.world.particles.spawn({ kind: 'debris', x: this.x + frand(-8, 8), y: this.y - 30, z: 4, vx: frand(-50, 50), vy: frand(-30, 10), vz: frand(30, 80), grav: 200, life: frand(0.6, 1.1), ramp: [fpick(['K9', 'K10', 'G3'])], size: 1, vrot: frand(-8, 8), drag: 1.5 });
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'volleyWind') {
      const k = Math.min(1, this.stateT / 0.8);
      laneTicks(this, r, this.x, this.y - 4, this.ringAngles(this.gapA), 16, 12, k);
    }
    if (this.state === 'rootWind' || this.state === 'roots') {
      const k = this.state === 'rootWind' ? Math.min(1, this.stateT / 0.72) : 0.84;
      const spacing = 13;
      for (const l of this.lines) {
        // fade each line out behind the travelling eruption
        const done = this.state === 'roots' ? Math.min(l.len, 16 + this.spikesDone * spacing) : 0;
        if (done >= l.len) continue;
        this.teleLine(r, this.x + Math.cos(l.a) * Math.max(10, done), this.y + Math.sin(l.a) * Math.max(10, done), l.a, l.len - Math.max(10, done), 14, k);
      }
    }
  }
  render(r: Renderer) {
    const A = MOTHER();
    let s = A.idle[Math.floor(this.age * (Math.hypot(this.vx, this.vy) > 3 ? 5 : 2.5)) % 4];
    if (this.state === 'volleyWind') s = A.raise[this.stateT > 0.4 ? 1 : 0];
    else if (this.state === 'volley') s = this.stateT % 0.42 < 0.18 ? A.cast : A.raise[1];
    else if (this.state === 'rootWind' || this.state === 'roots') s = A.plunge[Math.floor(this.age * 6) % 2];
    // a gentle sway: she is never quite still
    const x0 = this.x;
    if (this.state === 'approach' || this.state === 'idle') this.x += Math.round(Math.sin(this.age * 1.3) * 0.6);
    this.drawBody(r, s, { flip: false });
    this.x = x0;
    if (this.spawnT > 0 || this.falling > 0) return;
    const hx = this.x, hy = this.y - 39;
    if (this.state === 'volleyWind' || this.state === 'volley') {
      const k = this.state === 'volleyWind' ? this.stateT / 0.8 : 1;
      r.glowAt(hx + 1, hy - 10, 4 + k * 4, 'O3', 0.2 + k * 0.25);
      r.lightAt(hx, hy - 6, 60, 'O2', 0.45 * k);
      r.glowAt(hx - 2, hy, 2, 'O3', 0.6); r.glowAt(hx + 2, hy, 2, 'O3', 0.6);
    } else if (this.state === 'rootWind' || this.state === 'roots') {
      r.lightAt(this.x, this.y, 50, 'R2', 0.35);
    }
    r.lightAt(hx, hy, 34, 'K9', 0.18);
  }
  onDeath(info: DamageInfo) {
    super.onDeath(info);
    if (info.kind === 'fall') return;
    sfx('plantDeath', { pan: this.world.pan(this.x) });
    leafBurst(this, 26);
    for (let i = 0; i < 18; i++) {
      const a = frand(0, TAU), s = frand(10, 60);
      this.world.particles.spawn({ kind: 'debris', x: this.x, y: this.y - 40, z: 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5, vz: frand(20, 70), grav: 60, life: frand(1.4, 2.4), ramp: [fpick(['K10', 'K9', 'K8'])], size: 1, vrot: frand(-6, 6), drag: 1.2 });
    }
  }
}

// ───────────────────────────── roster ─────────────────────────────
export const ROSTER: EnemyDef[] = [
  {
    id: 'sporepod', cost: 2, make: (x, y) => new SporePod(x, y), weight: 2.5,
    name: { zh: '孢子囊', en: 'Spore Pod' },
    desc: {
      zh: '温室里最安静的住客，铜脉球茎终夜缓慢呼吸。鼓胀发亮后会喷出一圈缓慢的花粉孢子——每一轮的空隙都会错开。',
      en: 'The quietest tenant of the glasshouse: a copper-veined bulb that breathes all night. When it swells and glows it puffs a slow ring of pollen spores — and each ring leaves its gaps somewhere new.',
    },
  },
  {
    id: 'brassmoth', cost: 1, group: 2, make: (x, y) => new BrassMoth(x, y), weight: 2.5,
    name: { zh: '铜蛾', en: 'Brass Moth' },
    desc: {
      zh: '翅膀镀着黄铜的夜蛾，被月光与灯笼引来，总是成对出没。悬停急振翅是俯冲的前兆；收拢双翅、腹部发亮时，会抖落一团鳞粉。',
      en: 'Night moths with brass-plated wings, drawn by moonlight and lanterns; they always come in pairs. A hovering, frantic flutter means a dive. Folded wings and a glowing abdomen mean a bolt of scale-dust.',
    },
  },
  {
    id: 'snapvine', cost: 3, make: (x, y) => new Snapvine(x, y), weight: 2.5,
    name: { zh: '咬藤', en: 'Snapvine' },
    desc: {
      zh: '在地砖下穿行的捕蝇藤。留意那团朝你挪动的翻土——它会破土而出、张开大口，片刻后才合拢咬下，然后再钻回地下。',
      en: 'A flytrap vine that travels beneath the tiles. Watch for the rustling mound creeping closer: it bursts up, gapes wide, and only then snaps shut — before digging back down.',
    },
  },
  {
    id: 'pruner', cost: 3, make: (x, y) => new Pruner(x, y), weight: 2.5, minRoom: 1,
    name: { zh: '修剪者', en: 'Pruner' },
    desc: {
      zh: '钟罩为首的园丁自动机，仍在修剪一座早已停止生长的花园。巨剪张开时地上会出现剪线：剪一刀，转身再剪一刀，然后会喘口气。',
      en: 'A bell-jar gardener automaton, still pruning a garden that stopped growing long ago. Opened shears mark a cutting line: one snip, a turn, a second snip — then it has to catch its breath.',
    },
  },
  {
    id: 'thornmother', cost: 14, make: (x, y) => new Thornmother(x, y), elite: true,
    name: { zh: '荆棘母', en: 'Thornmother' },
    desc: {
      zh: '温室的女主人，玫瑰为冠，荆棘为臂。双臂高举时放出一圈圈留有缺口的荆刺；双手没入泥土时，根须会沿着红线破土而出。',
      en: 'Matron of the conservatory, crowned with a rose and armed with thorns. Raised arms loose ring after ring of thorns — find the gap. Hands sunk into the soil send roots erupting along the red lines.',
    },
  },
];
