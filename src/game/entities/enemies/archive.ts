// Floor 3 — The Sand Archive (流沙档案馆).
// Page Swarm (chaff, flying), Ink Hound (dash + slowing ink), Sand Wraith (teleporting caster),
// Tome Mimic (ambusher), Hourglass Golem (elite; its hourglass is its attack timer, fixed violet damage).
import { Enemy } from '../enemy';
import { Entity } from '../entity';
import type { Renderer } from '../../../engine/gfx/renderer';
import { drawSprite, RotCache, Sprite } from '../../../engine/gfx/sprite';
import { buildPage, houndFrame, buildWraith, buildTome, golemFrame, hourglassGlass, GLASS_DX, GLASS_DY } from '../../../art/sprites/archive';
import { Bullet } from '../projectile';
import { frand, fpick } from '../../../engine/rng';
import { angleTo, angleDiff, TAU, clamp } from '../../../engine/math';
import { col } from '../../../art/palette';
import { sfx } from '../../G';
import type { DamageInfo } from '../../systems/combat';
import type { EnemyDef } from '../../world/enemyDef';
import { TS } from '../../world/room';

function lazy<T>(f: () => T): () => T { let v: T | null = null; return () => (v ??= f()); }

const PAGE = lazy(() => { const p = buildPage(); return { ...p, dartRot: new RotCache(p.dart, 32) }; });
const HOUND = lazy(() => ({
  walk: [0, 1, 2, 3, 4, 5].map((i) => houndFrame({ phase: i / 6, moving: true, crouch: 0, stretch: 0, open: 0 })),
  idle: [0, 1].map((i) => houndFrame({ phase: 0, moving: false, crouch: i, stretch: 0, open: 0 })),
  crouch: [houndFrame({ phase: 0, moving: false, crouch: 2, stretch: -1, open: 1 }), houndFrame({ phase: 0, moving: false, crouch: 3, stretch: -1, open: 1 })],
  dash: [houndFrame({ phase: 0.25, moving: true, crouch: 0, stretch: 2, open: 1 }), houndFrame({ phase: 0.75, moving: true, crouch: 0, stretch: 2, open: 1 })],
  skid: houndFrame({ phase: 0.5, moving: false, crouch: 1, stretch: 1, open: 0 }),
}));
const WRA = lazy(buildWraith);
const TOM = lazy(buildTome);
const GOL = lazy(() => ({
  idle: [golemFrame({ bob: 0, legA: 0, legB: 0, arm: 'idle', armBob: 0 }), golemFrame({ bob: 1, legA: 0, legB: 0, arm: 'idle', armBob: 1 })],
  walk: [
    golemFrame({ bob: -1, legA: 3, legB: 0, arm: 'idle', armBob: -1 }), golemFrame({ bob: 0, legA: 0, legB: 0, arm: 'idle', armBob: 0 }),
    golemFrame({ bob: -1, legA: 0, legB: 3, arm: 'idle', armBob: 1 }), golemFrame({ bob: 0, legA: 0, legB: 0, arm: 'idle', armBob: 0 }),
  ],
  raise: golemFrame({ bob: -2, legA: 0, legB: 0, arm: 'raise', armBob: 0 }),
  slam: golemFrame({ bob: 2, legA: 0, legB: 0, arm: 'slam', armBob: 0 }),
  stomp: golemFrame({ bob: -1, legA: 4, legB: 0, arm: 'stomp', armBob: 0, charged: true }),
  stompDown: golemFrame({ bob: 1, legA: 0, legB: 0, arm: 'stomp', armBob: 2 }),
  raiseC: golemFrame({ bob: -2, legA: 0, legB: 0, arm: 'raise', armBob: 0, charged: true }),
  glass: Array.from({ length: 13 }, (_, i) => [hourglassGlass(i / 12, false), hourglassGlass(i / 12, true)]),
  flip: new RotCache(hourglassGlass(0, false), 24),
}));
const BOB = { idle: [0, 1], walk: [-1, 0, -1, 0], raise: -2, slam: 2, stomp: -1, stompDown: 1 };

/** draw an enemy lifted off the ground by z (flying / hopping) */
function drawLifted(e: Enemy, r: Renderer, s: Sprite, z: number, o: Parameters<Enemy['drawBody']>[2] = {}) {
  const y0 = e.y;
  e.y -= z;
  e.drawBody(r, s, o);
  e.y = y0;
}

// ───────────────────────────── 书页群 Page Swarm ─────────────────────────────
export class PageSwarm extends Enemy {
  orbitA = frand(0, TAU);
  orbitR = frand(38, 62);
  orbitDir = frand() < 0.5 ? -1 : 1;
  diveT = frand(1.4, 3.6);
  diveA = 0;
  flapT = frand(0, 4);
  hitDone = false;
  constructor(x: number, y: number) {
    super(x, y, 10);
    this.r = 4; this.height = 14; this.speed = 66; this.mass = 0.5;
    this.kind = 'pageswarm'; this.codexId = 'pageswarm';
    this.canFall = false;
    this.debris = ['K10', 'K9', 'K8', 'R2'];
    this.brass = [0, 1];
    this.spawnT = frand(0.5, 0.9);
  }
  get hover() { return this.state === 'dive' ? 4 : 11 + Math.sin(this.age * 5 + this.orbitA) * 2; }
  /** only one or two pages commit to a dive at a time, so the flock reads as a sequence */
  private diversActive() {
    let n = 0;
    for (const e of this.world.enemies) if (e instanceof PageSwarm && e !== this && !e.dead && (e.state === 'aim' || e.state === 'dive')) n++;
    return n;
  }
  think(dt: number) {
    const t = this.target!;
    const d = this.distT();
    this.flapT += dt * (this.state === 'recover' ? 16 : 11);
    switch (this.state) {
      case 'idle':
      case 'flock': {
        this.orbitA += dt * (0.9 + 18 / Math.max(20, d)) * this.orbitDir;
        const gx = t.x + Math.cos(this.orbitA) * this.orbitR, gy = t.y - 4 + Math.sin(this.orbitA) * this.orbitR * 0.7;
        let vx = gx - this.x, vy = gy - this.y;
        const l = Math.hypot(vx, vy) || 1;
        vx = (vx / l) * this.speed; vy = (vy / l) * this.speed;
        // separation from flock-mates + flutter
        for (const e of this.world.enemies) {
          if (e === this || !(e instanceof PageSwarm)) continue;
          const dx = this.x - e.x, dy = this.y - e.y, dd = Math.hypot(dx, dy);
          if (dd < 14 && dd > 0.01) { vx += (dx / dd) * 40; vy += (dy / dd) * 40; }
        }
        vx += Math.sin(this.age * 7 + this.orbitR) * 22; vy += Math.cos(this.age * 6 + this.orbitR) * 16;
        this.vx += (vx - this.vx) * Math.min(1, dt * 4);
        this.vy += (vy - this.vy) * Math.min(1, dt * 4);
        if (this.world.move(this, this.vx * this.speedMul * dt, this.vy * this.speedMul * dt)) this.orbitDir *= -1;
        this.flip = this.vx < 0;
        this.diveT -= dt;
        if (this.diveT <= 0 && d < 140 && this.diversActive() < (this.world.enemies.length > 6 ? 2 : 1) && this.world.map.los(this.x, this.y - 8, t.x, t.y - 8)) {
          this.setState('aim');
          this.diveA = this.angT();
          sfx('pageAim', { pan: this.world.pan(this.x) });
        } else if (this.diveT <= 0) this.diveT = frand(0.3, 0.8);
        break;
      }
      case 'aim':
        // folds into a dart and backs off a little: tell ≥ 0.45 s
        if (this.stateT < 0.32) this.diveA = this.angT();
        this.world.move(this, -Math.cos(this.diveA) * 14 * dt, -Math.sin(this.diveA) * 14 * dt);
        this.vx = this.vy = 0;
        if (this.stateT > 0.5) {
          this.setState('dive');
          this.hitDone = false;
          sfx('pageDive', { pan: this.world.pan(this.x) });
        }
        break;
      case 'dive': {
        this.attacking = true;
        const sp = 235 * this.speedMul;
        const hit = this.world.move(this, Math.cos(this.diveA) * sp * dt, Math.sin(this.diveA) * sp * dt);
        if (Math.floor(this.stateT * 40) % 2 === 0) this.world.particles.spawn({ kind: 'px', x: this.x, y: this.y - this.hover, vx: frand(-8, 8), vy: frand(-8, 8), life: 0.25, ramp: ['K9', 'K7'], size: 1 });
        const p = this.world.player;
        if (!this.hitDone && p && Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r + 3) {
          this.hitDone = true;
          p.hurt({ amount: 6, kind: 'contact', owner: this, x: this.x, y: this.y, knock: 90 });
        }
        if (hit) { this.setState('crumple'); this.squash = 0.6; sfx('paperHit', { vol: 0.5, pan: this.world.pan(this.x) }); this.world.fx.burst(this.x, this.y - 6, 4, ['K9', 'K8'], 60, 0.3, 'world', 'px'); }
        else if (this.stateT > 0.4) this.setState('recover');
        break;
      }
      case 'crumple':
        if (this.stateT > 0.6) this.setState('recover');
        break;
      case 'recover':
        this.world.move(this, -Math.cos(this.diveA) * 30 * dt, -Math.sin(this.diveA) * 30 * dt - 6 * dt);
        if (this.stateT > 0.55) { this.setState('flock'); this.diveT = frand(2.4, 4.4); this.orbitA = angleTo(this.target!.x, this.target!.y, this.x, this.y); }
        break;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'aim') this.teleLine(r, this.x, this.y, this.diveA, 84, 6, this.stateT / 0.5);
  }
  renderGround(r: Renderer) {
    if (this.spawnT > 0) { super.renderGround(r); return; }
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.3)';
    ctx.fillRect(Math.round(this.x) - 3, Math.round(this.y), 6, 1);
    ctx.fillRect(Math.round(this.x) - 2, Math.round(this.y) + 1, 4, 1);
    this.renderTelegraph(r);
  }
  render(r: Renderer) {
    const A = PAGE();
    let s: Sprite;
    if (this.state === 'aim') s = A.fold;
    else if (this.state === 'dive') s = A.dartRot.get(this.diveA);
    else if (this.state === 'crumple') s = A.flap[1];
    else s = A.flap[Math.floor(this.flapT) % 4];
    const shake = this.state === 'aim' && this.stateT > 0.3 ? (Math.floor(this.age * 40) % 2 ? 1 : 0) : 0;
    const x0 = this.x;
    this.x += shake;
    drawLifted(this, r, s, this.hover, this.state === 'dive' ? { flip: false } : {});
    this.x = x0;
    if (this.state === 'aim' && this.spawnT <= 0) r.glowAt(this.x, this.y - this.hover - 1, 5, 'R3', 0.35 + this.stateT);
  }
}

// ───────────────────────────── 墨犬 Ink Hound ─────────────────────────────
/** puddle of ink: slows the player while they wade through it, then dries up */
export class InkPuddle extends Entity {
  life: number;
  max: number;
  dripT = 0;
  /** organic outline: a few overlapping lobes + flecks */
  lobes: { dx: number; dy: number; rx: number; ry: number }[] = [];
  flecks: { dx: number; dy: number }[] = [];
  constructor(x: number, y: number, public rx: number, public ry: number, dur = 4.5, ang?: number) {
    super();
    this.x = x; this.y = y;
    this.life = this.max = dur;
    this.collides = false;
    this.lobes.push({ dx: 0, dy: 0, rx, ry });
    if (ang !== undefined) {
      // smeared along the dash so consecutive puddles join into one streak
      const c = Math.cos(ang), s = Math.sin(ang);
      for (const k of [-1, 1]) this.lobes.push({ dx: c * rx * 0.75 * k + frand(-1, 1), dy: s * ry * 1.2 * k + frand(-1, 1), rx: rx * frand(0.55, 0.75), ry: ry * frand(0.6, 0.85) });
    } else for (let i = 0; i < 2; i++) this.lobes.push({ dx: frand(-rx * 0.6, rx * 0.6), dy: frand(-ry * 0.5, ry * 0.5), rx: rx * frand(0.4, 0.7), ry: ry * frand(0.5, 0.9) });
    for (let i = 0; i < 4; i++) { const a = frand(0, TAU); this.flecks.push({ dx: Math.cos(a) * (rx + frand(2, 5)), dy: Math.sin(a) * (ry + frand(1, 3)) }); }
  }
  get k() { return clamp(this.life / 1.4, 0, 1); }
  update(dt: number) {
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    const p = this.world.player;
    if (!p || p.hp <= 0 || p.falling > 0 || (p as any).airborne) return;
    const rx = this.rx * (0.5 + this.k * 0.5), ry = this.ry * (0.5 + this.k * 0.5);
    const dx = (p.x - this.x) / rx, dy = (p.y - this.y) / ry;
    if (dx * dx + dy * dy < 1) {
      if (p.st.slow <= 0) sfx('inkStep', { vol: 0.5, pan: this.world.pan(p.x) });
      p.st.slow = Math.max(p.st.slow, 0.6);
      p.st.slowAmt = 0.35;
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = 0.12;
        this.world.particles.spawn({ kind: 'px', x: p.x + frand(-3, 3), y: p.y, z: frand(0, 4), vz: frand(20, 45), grav: 260, vx: frand(-12, 12), vy: frand(-4, 4), life: 0.4, ramp: ['K1', 'U1'], size: 1, bounce: 0 });
      }
    }
  }
  renderGround(r: Renderer) {
    const ctx = r.w;
    const k = this.k;
    const rx = this.rx * (0.5 + k * 0.5), ry = this.ry * (0.5 + k * 0.5);
    const x = Math.round(this.x), y = Math.round(this.y);
    const fresh = clamp((this.max - this.life) / 0.25, 0, 1);
    const sc = 0.5 + k * 0.5;
    ctx.globalAlpha = 0.85 * fresh;
    ctx.fillStyle = col('K0');
    for (const l of this.lobes) { ctx.beginPath(); ctx.ellipse(x + Math.round(l.dx * sc), y + Math.round(l.dy * sc), l.rx * sc + 1, l.ry * sc + 1, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = col('K1');
    for (const l of this.lobes) { ctx.beginPath(); ctx.ellipse(x + Math.round(l.dx * sc), y + Math.round(l.dy * sc), l.rx * sc, l.ry * sc, 0, 0, TAU); ctx.fill(); }
    if (k > 0.5) { ctx.fillStyle = col('K1'); for (const f of this.flecks) ctx.fillRect(x + Math.round(f.dx), y + Math.round(f.dy), 1, 1); }
    // wet sheen catches the light on the upper-left
    ctx.fillStyle = col(k > 0.6 ? 'U2' : 'U1');
    ctx.fillRect(x - Math.round(rx * 0.5), y - Math.round(ry * 0.5), Math.max(1, Math.round(rx * 0.5)), 1);
    ctx.fillStyle = col('U1');
    ctx.fillRect(x - Math.round(rx * 0.2), y - Math.round(ry * 0.5) + 1, 1, 1);
    ctx.globalAlpha = 1;
  }
}

export class InkHound extends Enemy {
  dashA = 0; dashDist = 0; puddleAcc = 0; hitDone = false; strafe = frand() < 0.5 ? 1 : -1; growled = false;
  constructor(x: number, y: number) {
    super(x, y, 60);
    this.r = 7; this.height = 14; this.speed = 50; this.mass = 2; this.poise = 22;
    this.kind = 'inkhound'; this.codexId = 'inkhound';
    this.debris = ['K1', 'K2', 'U1', 'K3'];
    this.brass = [2, 4];
  }
  think(dt: number) {
    const t = this.target!;
    const d = this.distT();
    switch (this.state) {
      case 'idle':
      case 'stalk': {
        // close in, then circle at mid range looking for a clean line
        if (d > 110) this.moveTo(t.x, t.y, this.speed, dt);
        else {
          const a = this.angT() + (Math.PI / 2) * this.strafe * (d < 60 ? 1.4 : 1);
          if (this.moveDir(a, this.speed * 0.8, dt)) this.strafe *= -1;
          this.vx = Math.cos(a) * this.speed; this.vy = Math.sin(a) * this.speed;
        }
        this.faceTarget();
        if (this.stateT > 1.1 && d < 140 && this.world.map.los(this.x, this.y - 4, t.x, t.y - 4)) {
          this.setState('crouch');
          this.dashA = this.angT();
          sfx('houndGrowl', { pan: this.world.pan(this.x) });
        }
        break;
      }
      case 'crouch':
        this.vx = this.vy = 0;
        if (this.stateT < 0.42) { this.dashA = this.angT(); this.flip = Math.cos(this.dashA) < 0; }
        if (this.stateT > 0.62) {
          this.setState('dash');
          this.dashDist = 0; this.puddleAcc = 99; this.hitDone = false;
          sfx('houndDash', { pan: this.world.pan(this.x) });
          this.world.fx.dust(this.x, this.y, 4, this.dashA);
        }
        break;
      case 'dash': {
        this.attacking = true;
        const sp = 280;
        const px = this.x, py = this.y;
        const hit = this.moveDir(this.dashA, sp, dt);
        const moved = Math.hypot(this.x - px, this.y - py);
        this.dashDist += moved;
        this.puddleAcc += moved;
        if (this.puddleAcc > 12) {
          this.puddleAcc = 0;
          this.world.add(new InkPuddle(this.x + frand(-1, 1), this.y + frand(-1, 1), frand(5.5, 7), frand(3, 3.5), frand(3.2, 3.8), this.dashA));
        }
        if (Math.floor(this.stateT * 30) % 2 === 0)
          this.world.particles.spawn({ kind: 'px', x: this.x - Math.cos(this.dashA) * 8, y: this.y - 6, z: 4, vz: frand(20, 50), grav: 280, vx: -Math.cos(this.dashA) * frand(20, 60), vy: frand(-10, 10), life: 0.45, ramp: ['K1', 'U1'], size: 2, bounce: 0 });
        const p = this.world.player;
        if (!this.hitDone && p && Math.hypot(p.x - this.x, p.y - this.y) < this.r + p.r + 3) {
          this.hitDone = true;
          p.hurt({ amount: 12, kind: 'contact', owner: this, x: this.x, y: this.y, knock: 180 });
        }
        if (hit || moved < 0.5) {
          this.setState('skid');
          this.squash = 0.5;
          this.world.shake(0.12);
          sfx('inkSplat', { pan: this.world.pan(this.x) });
          this.world.add(new InkPuddle(this.x, this.y, 11, 5, 4));
        } else if (this.dashDist > 160) {
          this.setState('skid');
          this.world.add(new InkPuddle(this.x + Math.cos(this.dashA) * 6, this.y, 10, 5, 3.8));
          sfx('inkSplat', { vol: 0.6, pan: this.world.pan(this.x) });
        }
        break;
      }
      case 'skid': {
        const k = Math.max(0, 1 - this.stateT / 0.35);
        this.moveDir(this.dashA, 120 * k, dt);
        if (this.stateT > 0.75) { this.setState('stalk'); this.strafe = frand() < 0.5 ? 1 : -1; }
        break;
      }
    }
  }
  onDeath(info: DamageInfo) {
    super.onDeath(info);
    if (info.kind !== 'fall') { this.world.add(new InkPuddle(this.x, this.y, 12, 6, 3)); sfx('inkSplat', { pan: this.world.pan(this.x) }); }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'crouch') this.teleLine(r, this.x, this.y - 2, this.dashA, 160, 14, this.stateT / 0.62);
  }
  render(r: Renderer) {
    const A = HOUND();
    let s = A.idle[Math.floor(this.age * 2) % 2];
    const moving = Math.hypot(this.vx, this.vy) > 5;
    if ((this.state === 'stalk' || this.state === 'idle') && moving) s = A.walk[Math.floor(this.age * 11) % 6];
    if (this.state === 'crouch') s = A.crouch[this.stateT > 0.35 ? 1 : 0];
    if (this.state === 'dash') s = A.dash[Math.floor(this.age * 16) % 2];
    if (this.state === 'skid') s = A.skid;
    const shake = this.state === 'crouch' && this.stateT > 0.3 ? (Math.floor(this.age * 40) % 2 ? 1 : -1) : 0;
    const x0 = this.x;
    this.x += shake;
    this.drawBody(r, s);
    this.x = x0;
    if (this.spawnT <= 0) {
      // ember-red eye, brighter while it lines up the dash
      const ex = this.x + (this.flip ? -9 : 9), ey = this.y - 12 + (this.state === 'crouch' ? 3 : 0);
      r.glowAt(ex, ey, this.state === 'crouch' ? 7 : 4, 'R3', this.state === 'crouch' ? 0.7 : 0.3);
    }
  }
}

// ───────────────────────────── 沙之怨灵 Sand Wraith ─────────────────────────────
export class SandWraith extends Enemy {
  castT = frand(1.4, 2.4); aimA = 0; strafe = frand() < 0.5 ? 1 : -1; blinkCd = 1.5;
  destX = 0; destY = 0;
  constructor(x: number, y: number) {
    super(x, y, 50);
    this.r = 6; this.height = 26; this.speed = 30; this.poise = 14;
    this.kind = 'sandwraith'; this.codexId = 'sandwraith';
    this.canFall = false;
    this.debris = ['S1', 'S2', 'S3', 'S0'];
    this.brass = [2, 4];
  }
  get fz() { return this.state === 'hidden' ? 0 : 5 + Math.sin(this.age * 2.3) * 2; }
  get hidden() { return this.state === 'hidden' || (this.state === 'vanish' && this.stateT > 0.3); }
  think(dt: number) {
    const t = this.target!;
    const d = this.distT();
    this.blinkCd -= dt;
    const veiled = this.state === 'vanish' || this.state === 'hidden' || (this.state === 'appear' && this.stateT < 0.35);
    if (veiled) { this.invuln = Math.max(this.invuln, 0.1); this.solid = false; } else this.solid = true;
    // sand trickles from the hem
    if (!this.hidden && Math.random() < dt * 14) this.world.particles.spawn({ kind: 'px', x: this.x + frand(-3, 3), y: this.y - 2, z: frand(2, 6), vz: -frand(5, 15), grav: 60, vx: frand(-5, 5), life: frand(0.4, 0.8), ramp: ['S3', 'S2', 'S1'], size: 1, bounce: 0 });
    switch (this.state) {
      case 'idle':
      case 'drift': {
        if (d < 80) this.moveDir(this.angT() + Math.PI, this.speed * 1.2, dt);
        else if (d > 150) this.moveTo(t.x, t.y, this.speed, dt);
        else if (this.moveDir(this.angT() + (Math.PI / 2) * this.strafe, this.speed * 0.7, dt)) this.strafe *= -1;
        this.faceTarget();
        this.castT -= dt;
        if (d < 46 && this.blinkCd <= 0) { this.startVanish(); break; }
        if (this.castT <= 0 && this.world.map.los(this.x, this.y - 10, t.x, t.y - 8)) {
          this.setState('cast');
          this.aimA = angleTo(this.x, this.y - 12, t.x, t.y - 8);
          sfx('wraithCast', { pan: this.world.pan(this.x) });
        }
        break;
      }
      case 'cast': {
        this.faceTarget();
        if (this.stateT < 0.55) this.aimA = this.aimA + clamp(angleDiff(this.aimA, angleTo(this.x, this.y - 12, t.x, t.y - 8)), -3 * dt, 3 * dt);
        // sand gathers between the hands
        if (Math.random() < dt * 40) {
          const a = frand(0, TAU), rr = frand(10, 18);
          this.world.particles.spawn({ kind: 'px', x: this.x + Math.cos(a) * rr, y: this.y - this.fz - 18 + Math.sin(a) * rr, vx: -Math.cos(a) * rr * 3, vy: -Math.sin(a) * rr * 3, life: 0.3, ramp: ['S4', 'S3'], layer: 'glow', size: 1 });
        }
        if (this.stateT > 0.78) {
          this.setState('after');
          this.attacking = true;
          const ox = this.x + Math.cos(this.aimA) * 6, oy = this.y - this.fz - 16;
          for (let i = -2; i <= 2; i++) {
            const a = this.aimA + i * 0.24;
            this.world.add(new Bullet({ team: 'enemy', x: ox, y: oy, ang: a, speed: 108, dmg: 8, style: 'orb', r: 2.5, owner: this, life: 3 }));
          }
          sfx('wraithFire', { pan: this.world.pan(this.x) });
          this.world.fx.burst(ox, oy, 10, ['S4', 'S3', 'S2'], 90, 0.35);
        }
        break;
      }
      case 'after':
        if (this.stateT > 0.45) {
          this.castT = frand(2.2, 3.4);
          if (this.blinkCd <= 0 && frand() < 0.55) this.startVanish();
          else this.setState('drift');
        }
        break;
      case 'vanish':
        if (this.stateT > 0.4) {
          this.pickDest();
          this.x = this.destX; this.y = this.destY;
          this.setState('hidden');
        }
        break;
      case 'hidden':
        if (this.stateT > 0.3) { this.setState('appear'); sfx('wraithAppear', { pan: this.world.pan(this.x) }); }
        break;
      case 'appear':
        if (Math.random() < dt * 50) {
          const a = frand(0, TAU), rr = frand(6, 14);
          this.world.particles.spawn({ kind: 'px', x: this.x + Math.cos(a) * rr, y: this.y - frand(0, 26), vx: -Math.cos(a) * 20, vy: frand(-20, 5), life: 0.35, ramp: ['S4', 'S3'], layer: 'glow', size: 1 });
        }
        if (this.stateT > 0.55) { this.setState('drift'); this.castT = Math.min(this.castT, frand(0.6, 1.2)); }
        break;
    }
  }
  private startVanish() {
    this.setState('vanish');
    this.blinkCd = 3.5;
    sfx('wraithVanish', { pan: this.world.pan(this.x) });
    for (let i = 0; i < 18; i++) {
      const a = frand(0, TAU), s = frand(20, 70);
      this.world.particles.spawn({ kind: 'debris', x: this.x + frand(-4, 4), y: this.y - 2, z: frand(4, 24), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: frand(10, 50), grav: 200, life: frand(0.5, 0.9), ramp: [fpick(['S3', 'S2', 'S1'])], size: 1, bounce: 0.2 });
    }
  }
  private pickDest() {
    const t = this.target;
    const m = this.world.map;
    this.destX = this.x; this.destY = this.y;
    if (!t) return;
    for (let i = 0; i < 24; i++) {
      const a = frand(0, TAU), rr = frand(75, 135);
      const x = t.x + Math.cos(a) * rr, y = t.y + Math.sin(a) * rr * 0.8;
      const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
      let ok = m.isFloor(tx, ty);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!m.isFloor(tx + dx, ty + dy)) ok = false;
      if (!ok || Math.hypot(x - this.x, y - this.y) < 50 || !m.los(x, y - 10, t.x, t.y - 8)) continue;
      this.destX = x; this.destY = y;
      return;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'cast') {
      const k = this.stateT / 0.78;
      for (let i = -2; i <= 2; i++) this.teleLine(r, this.x, this.y, this.aimA + i * 0.24, 70, 4, k);
    }
    if (this.state === 'hidden' || this.state === 'appear') {
      // shimmer marks where it will reform
      const k = this.state === 'hidden' ? this.stateT / 0.3 * 0.5 : 0.5 + this.stateT;
      const ctx = r.u;
      ctx.strokeStyle = col('S3');
      ctx.globalAlpha = 0.5 * Math.min(1, k);
      ctx.beginPath();
      ctx.ellipse(Math.round(this.x), Math.round(this.y), 10 * (1.4 - Math.min(1, k) * 0.4), 5 * (1.4 - Math.min(1, k) * 0.4), 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  renderGround(r: Renderer) {
    if (this.hidden) { this.renderTelegraph(r); return; }
    super.renderGround(r);
  }
  render(r: Renderer) {
    const A = WRA();
    if (this.hidden || this.state === 'hidden') return;
    let s = A.idle[Math.floor(this.age * 6) % 4];
    let o: Parameters<Enemy['drawBody']>[2] = {};
    if (this.state === 'cast') s = this.stateT < 0.25 ? A.cast[0] : A.cast[1 + (Math.floor(this.age * 12) % 2)];
    if (this.state === 'after') s = A.cast[0];
    if (this.state === 'vanish') s = A.fade[Math.min(2, Math.floor(this.stateT / 0.1))];
    if (this.state === 'appear') {
      const k = this.stateT / 0.55;
      s = k < 0.33 ? A.fade[2] : k < 0.6 ? A.fade[1] : k < 0.85 ? A.fade[0] : s;
      o = { alpha: Math.min(1, 0.3 + k) };
    }
    drawLifted(this, r, s, this.fz, o);
    if (this.spawnT > 0) return;
    // ember eyes
    const ey = this.y - this.fz - 21;
    const ex = this.x + (this.flip ? -1 : 0);
    r.glowAt(ex, ey, 4, 'O3', this.state === 'cast' ? 0.45 : 0.3);
    if (this.state === 'cast') {
      const k = this.stateT / 0.78;
      const ox = this.x + Math.cos(this.aimA) * 6, oy = this.y - this.fz - 16;
      r.glowAt(ox, oy, 3 + k * 5, 'M2', 0.25 + k * 0.35);
      r.lightAt(ox, oy, 30, 'O3', 0.22 * k);
      const ctx = r.u;
      ctx.fillStyle = col(k > 0.7 && Math.floor(this.age * 30) % 2 ? 'W' : 'M3');
      const sz = Math.round(1 + k * 2);
      ctx.fillRect(Math.round(ox - sz / 2), Math.round(oy - sz / 2), sz, sz);
    }
  }
}

// ───────────────────────────── 书本拟态 Tome Mimic ─────────────────────────────
export class TomeMimic extends Enemy {
  hopA = 0; hops = 0; spitCd = 1.2; awake = false; atkA = 0; jz = 0;
  constructor(x: number, y: number) {
    super(x, y, 65);
    this.r = 7; this.height = 14; this.speed = 0; this.mass = 2; this.poise = 20;
    this.kind = 'tomemimic'; this.codexId = 'tomemimic';
    this.debris = ['U1', 'U2', 'K9', 'B4', 'K10'];
    this.brass = [2, 4];
    this.state = 'dormant';
  }
  onHurt(_info: DamageInfo) {
    if (!this.awake && this.state === 'dormant') this.wake();
  }
  private wake() {
    this.setState('reveal');
    sfx('mimicReveal', { pan: this.world.pan(this.x) });
  }
  think(dt: number) {
    const t = this.target!;
    const d = this.distT();
    this.spitCd -= dt;
    switch (this.state) {
      case 'idle':
      case 'dormant':
        // pretends to be a book; wakes when you come close (or loses patience)
        if (d < 62 || (this.stateT > 6 && d < 170) || this.stateT > 10) this.wake();
        break;
      case 'reveal':
        this.faceTarget();
        if (this.stateT > 0.55) { this.awake = true; this.setState('ready'); }
        break;
      case 'ready':
        this.faceTarget();
        if (this.stateT > 0.35) {
          if (d < 36) this.startBite();
          else if (this.spitCd <= 0 && d < 150 && this.hops >= 2 && this.world.map.los(this.x, this.y - 6, t.x, t.y - 6)) {
            this.setState('spitWind');
            this.atkA = angleTo(this.x, this.y - 8, t.x, t.y - 8);
            sfx('mimicRustle', { pan: this.world.pan(this.x) });
          } else {
            this.setState('hop');
            this.hopA = this.angT() + frand(-0.35, 0.35);
            this.hops++;
          }
        }
        break;
      case 'hop': {
        const T = 0.42;
        const k = this.stateT / T;
        this.jz = Math.sin(Math.min(1, k) * Math.PI) * 11;
        this.moveDir(this.hopA, 105, dt);
        this.flip = Math.cos(this.hopA) < 0;
        if (k >= 1) {
          this.jz = 0;
          this.squash = 0.55;
          this.world.fx.dust(this.x, this.y, 4);
          sfx('mimicHop', { pan: this.world.pan(this.x) });
          this.setState('ready');
          if (this.distT() < 36) this.startBite();
        }
        break;
      }
      case 'biteWind':
        if (this.stateT < 0.25) { this.atkA = this.angT(); this.faceTarget(); }
        if (this.stateT > 0.45) {
          this.setState('bite');
          this.attacking = true;
          this.world.combat.add({ shape: { t: 'arc', x: this.x, y: this.y - 6, r: 34, a: this.atkA, w: 0.75 }, team: 'enemy', life: 4, info: { amount: 13, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 160 } });
          sfx('mimicBite', { pan: this.world.pan(this.x) });
          this.world.shake(0.12);
        }
        break;
      case 'bite':
        if (this.stateT < 0.12) this.moveDir(this.atkA, 140, dt);
        if (this.stateT > 0.55) { this.setState('ready'); this.hops = 0; }
        break;
      case 'spitWind':
        this.faceTarget();
        if (this.stateT < 0.4) this.atkA = this.atkA + clamp(angleDiff(this.atkA, angleTo(this.x, this.y - 8, t.x, t.y - 8)), -3 * dt, 3 * dt);
        if (Math.random() < dt * 30) this.world.particles.spawn({ kind: 'px', x: this.x + frand(-6, 6), y: this.y - 10, vx: frand(-10, 10), vy: frand(-30, -10), life: 0.3, ramp: ['K10', 'K9'], size: 1 });
        if (this.stateT > 0.62) {
          this.setState('spit');
          this.attacking = true;
          const ox = this.x + Math.cos(this.atkA) * 8, oy = this.y - 9;
          for (let i = -2; i <= 2; i++) this.world.add(new Bullet({ team: 'enemy', x: ox, y: oy, ang: this.atkA + i * 0.21 + frand(-0.03, 0.03), speed: 125 + Math.abs(i) * 8, dmg: 7, style: 'shard', r: 2, owner: this, life: 2.4 }));
          this.world.fx.burst(ox, oy, 8, ['K10', 'K9', 'K8'], 80, 0.4, 'world', 'px');
          sfx('mimicSpit', { pan: this.world.pan(this.x) });
          this.spitCd = frand(2.4, 3.2);
          this.squash = 0.3;
        }
        break;
      case 'spit':
        if (this.stateT > 0.6) { this.setState('ready'); this.hops = 0; }
        break;
    }
  }
  private startBite() {
    this.setState('biteWind');
    this.atkA = this.angT();
    this.faceTarget();
    sfx('mimicGrowl', { pan: this.world.pan(this.x) });
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'biteWind') this.teleCone(r, this.x, this.y, this.atkA, 34, 0.75, this.stateT / 0.45);
    if (this.state === 'spitWind') {
      const k = this.stateT / 0.62;
      for (let i = -2; i <= 2; i++) this.teleLine(r, this.x, this.y, this.atkA + i * 0.21, 64, 4, k);
    }
  }
  render(r: Renderer) {
    const A = TOM();
    let s: Sprite;
    let jx = 0;
    switch (this.state) {
      case 'dormant':
      case 'idle':
        s = A.closed[Math.floor(this.age * 1.1) % 2];
        break;
      case 'reveal':
        s = this.stateT < 0.2 ? A.closed[0] : A.peek;
        jx = Math.floor(this.age * 30) % 2 ? 1 : -1;
        break;
      case 'hop': s = A.hop; break;
      case 'biteWind': s = A.bite; jx = this.stateT > 0.25 ? (Math.floor(this.age * 40) % 2 ? 1 : -1) : 0; break;
      case 'bite': s = this.stateT < 0.2 ? A.hop : A.open[0]; break;
      case 'spitWind': s = A.bite; break;
      case 'spit': s = A.open[1]; break;
      default: s = A.open[Math.floor(this.age * 3) % 2];
    }
    const x0 = this.x;
    this.x += jx;
    drawLifted(this, r, s, this.jz);
    this.x = x0;
    if (this.spawnT <= 0 && (this.state === 'reveal' || this.awake)) {
      const ex = this.x + (this.flip ? 3 : -3), ey = this.y - this.jz - (this.awake ? 13 : 7);
      r.glowAt(ex, ey, this.state === 'reveal' ? 8 : 4, 'O3', this.state === 'reveal' ? 0.8 : 0.35);
    }
  }
}

// ───────────────────────────── 沙漏魔像 Hourglass Golem (elite) ─────────────────────────────
/** a rolling crest of stopped-time sand; deals fixed (violet) damage */
export class SandWave extends Entity {
  travelled = 0;
  constructor(x: number, y: number, public ang: number, private owner: Enemy, private range = 190, private half = 13) {
    super();
    this.x = x; this.y = y;
    this.collides = false;
  }
  added() {
    const nx = -Math.sin(this.ang), ny = Math.cos(this.ang);
    this.world.combat.add({
      shape: { t: 'line', x0: this.x - nx * this.half, y0: this.y - ny * this.half, x1: this.x + nx * this.half, y1: this.y + ny * this.half, r: 5 },
      team: 'enemy', life: Math.ceil((this.range / 120) * 60) + 2, follow: this,
      info: { amount: 10, kind: 'aoe', owner: this.owner, fixed: true, knock: 140, x: this.x - Math.cos(this.ang) * 20, y: this.y - Math.sin(this.ang) * 20 },
    });
  }
  update(dt: number) {
    const sp = 120;
    this.x += Math.cos(this.ang) * sp * dt;
    this.y += Math.sin(this.ang) * sp * dt;
    this.travelled += sp * dt;
    const P = this.world.particles;
    const nx = -Math.sin(this.ang), ny = Math.cos(this.ang);
    for (let i = 0; i < 2; i++) {
      const o = frand(-this.half, this.half);
      P.spawn({ kind: 'px', x: this.x + nx * o, y: this.y + ny * o, z: frand(2, 6), vz: frand(20, 50), grav: 240, vx: Math.cos(this.ang) * frand(20, 60), vy: Math.sin(this.ang) * frand(20, 60), life: frand(0.25, 0.45), ramp: ['S4', 'S3', 'S2'], size: 1, bounce: 0 });
    }
    if (Math.random() < dt * 20) P.spawn({ kind: 'spark', x: this.x + nx * frand(-this.half, this.half), y: this.y - 4, vx: Math.cos(this.ang) * 60, vy: -30, life: 0.25, ramp: ['V4', 'V3'], layer: 'glow', drag: 4 });
    if (this.travelled > this.range || this.world.map.solidAt(this.x, this.y)) {
      this.world.fx.burst(this.x, this.y - 4, 10, ['S4', 'S3', 'V3'], 90, 0.4);
      this.kill();
    }
  }
  renderGround(r: Renderer) {
    // shadow under the crest
    const ctx = r.w;
    const nx = -Math.sin(this.ang), ny = Math.cos(this.ang);
    ctx.fillStyle = 'rgba(11,10,20,0.35)';
    for (let o = -this.half; o <= this.half; o++) ctx.fillRect(Math.round(this.x + nx * o), Math.round(this.y + ny * o + 1), 2, 1);
  }
  render(r: Renderer) {
    const ctx = r.w;
    const nx = -Math.sin(this.ang), ny = Math.cos(this.ang);
    const cx = Math.cos(this.ang), cy = Math.sin(this.ang);
    const fade = Math.min(1, (this.range - this.travelled) / 30, this.age / 0.12);
    ctx.globalAlpha = fade;
    const roll = Math.floor(this.age * 18);
    for (let o = -this.half; o <= this.half; o++) {
      const e = 1 - (o * o) / (this.half * this.half); // 0 at the horns, 1 in the middle
      const bend = e * 5; // the crescent bulges forward
      const x = Math.round(this.x + nx * o + cx * bend), y = Math.round(this.y + ny * o + cy * bend);
      const h = Math.round(2 + e * 6 + ((roll + o) % 4 === 0 ? 1 : 0));
      // wake of loose sand behind the crest
      ctx.fillStyle = col('S1');
      ctx.fillRect(Math.round(x - cx * 3), Math.round(y - cy * 3), 1, 1);
      if (e > 0.4) { ctx.fillStyle = col('S0'); ctx.fillRect(Math.round(x - cx * 5), Math.round(y - cy * 5), 1, 1); }
      for (let j = 0; j < h; j++) {
        let k = j === h - 1 ? (e > 0.35 ? 'V4' : 'S4') : j === h - 2 ? 'S4' : j >= h - 4 ? 'S3' : j >= 1 ? 'S2' : 'S1';
        if (j === h - 2 && e > 0.6 && (roll + o) % 3 === 0) k = 'V3';
        ctx.fillStyle = col(k);
        ctx.fillRect(x, y - j, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
    r.glowAt(this.x + cx * 4, this.y - 5, this.half + 2, 'V2', 0.3 * fade);
    r.lightAt(this.x, this.y - 4, 44, 'S3', 0.3 * fade);
  }
}

export class HourglassGolem extends Enemy {
  fill = 1;
  next: 'slam' | 'waves' = 'slam';
  atkA = 0;
  stepT = 0;
  static CYCLE = 2.5;
  constructor(x: number, y: number) {
    super(x, y, 420);
    this.r = 12; this.height = 42; this.speed = 21; this.mass = 6; this.poise = 60;
    this.kind = 'hourglassgolem'; this.codexId = 'hourglassgolem';
    this.isElite = true;
    this.debris = ['S1', 'S2', 'S3', 'B3', 'V3'];
    this.brass = [10, 14];
    this.sandDrop = 4;
    this.state = 'walk';
  }
  /** fixed damage: the rewind cannot undo it */
  private hit(shape: { t: 'circle'; x: number; y: number; r: number }, amount: number, knock: number) {
    this.world.combat.add({ shape, team: 'enemy', life: 3, info: { amount, kind: 'aoe', owner: this, x: shape.x, y: shape.y, knock, fixed: true } });
  }
  think(dt: number) {
    const t = this.target!;
    const d = this.distT();
    switch (this.state) {
      case 'idle':
      case 'walk': {
        // the hourglass drains while it walks: when the top bulb runs dry, it strikes
        this.fill = clamp(1 - (this.stateT / HourglassGolem.CYCLE) * 0.82, 0.18, 1);
        if (d > 40) this.moveTo(t.x, t.y, this.speed, dt);
        else { this.vx = this.vy = 0; this.faceTarget(); }
        this.stepT -= dt;
        if (Math.hypot(this.vx, this.vy) > 4 && this.stepT <= 0) {
          this.stepT = 0.5;
          sfx('golemStep', { vol: 0.6, pan: this.world.pan(this.x) });
          this.world.fx.dust(this.x + frand(-6, 6), this.y, 2);
        }
        if (this.stateT > HourglassGolem.CYCLE) {
          const useSlam = d < 64 || (this.next === 'slam' && d < 90);
          this.atkA = this.angT();
          if (useSlam) { this.setState('slamWind'); sfx('golemWind', { pan: this.world.pan(this.x) }); }
          else { this.setState('waveWind'); sfx('golemStomp', { pan: this.world.pan(this.x) }); }
        }
        break;
      }
      case 'slamWind': {
        this.fill = 0.18 * (1 - this.stateT / 0.85);
        if (this.stateT < 0.5) this.atkA = this.angT();
        this.faceTarget();
        if (this.stateT > 0.85) {
          this.setState('slam');
          this.fill = 0;
          const sx = this.x + Math.cos(this.atkA) * 24, sy = this.y + Math.sin(this.atkA) * 16;
          this.hit({ t: 'circle', x: sx, y: sy - 4, r: 42 }, 16, 240);
          this.world.fx.ring(sx, sy, 6, 54, 0.45, 'V4', 3, 'unlit');
          this.world.fx.ring(sx, sy, 4, 40, 0.35, 'S4', 2, 'glow');
          this.world.fx.burst(sx, sy - 2, 18, ['V4', 'V3', 'S4', 'S3'], 160, 0.5);
          this.world.fx.dust(sx, sy, 16);
          this.world.fx.scorch(sx, sy, 20);
          this.world.shake(0.55);
          this.world.hitstop(0.05);
          sfx('golemSlam', { pan: this.world.pan(this.x) });
          this.next = 'waves';
        }
        break;
      }
      case 'slam':
        this.attacking = this.stateT < 0.1;
        if (this.stateT > 0.75) { this.setState('flip'); sfx('golemFlip', { pan: this.world.pan(this.x) }); }
        break;
      case 'waveWind':
        this.fill = 0.18 * (1 - this.stateT / 0.8);
        if (this.stateT < 0.45) this.atkA = this.angT();
        this.faceTarget();
        if (this.stateT > 0.8) {
          this.setState('waves');
          this.fill = 0;
          for (const da of [-0.42, 0, 0.42]) {
            const a = this.atkA + da;
            this.world.add(new SandWave(this.x + Math.cos(a) * 16, this.y + Math.sin(a) * 10, a, this));
          }
          this.world.fx.ring(this.x, this.y, 8, 34, 0.35, 'V4', 2, 'unlit');
          this.world.fx.dust(this.x, this.y, 12);
          this.world.shake(0.4);
          sfx('golemWave', { pan: this.world.pan(this.x) });
          this.next = 'slam';
        }
        break;
      case 'waves':
        this.attacking = this.stateT < 0.1;
        if (this.stateT > 0.8) { this.setState('flip'); sfx('golemFlip', { pan: this.world.pan(this.x) }); }
        break;
      case 'flip':
        // turns its hourglass over — a breather window for the player
        if (this.stateT > 0.7) { this.fill = 1; this.setState('walk'); }
        break;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'slamWind') {
      const sx = this.x + Math.cos(this.atkA) * 24, sy = this.y + Math.sin(this.atkA) * 16;
      this.teleCircle(r, sx, sy, 42, this.stateT / 0.85, 'V3');
    }
    if (this.state === 'waveWind') {
      const k = this.stateT / 0.8;
      for (const da of [-0.42, 0, 0.42]) this.teleLine(r, this.x, this.y, this.atkA + da, 190, 26, k, 'V3');
    }
  }
  render(r: Renderer) {
    const A = GOL();
    let s = A.idle[Math.floor(this.age * 2) % 2];
    let bob = BOB.idle[Math.floor(this.age * 2) % 2];
    if ((this.state === 'walk' || this.state === 'idle') && Math.hypot(this.vx, this.vy) > 4) {
      const i = Math.floor(this.age * 4) % 4;
      s = A.walk[i]; bob = BOB.walk[i];
    }
    if (this.state === 'slamWind') { s = this.stateT > 0.3 ? A.raiseC : A.raise; bob = BOB.raise; }
    if (this.state === 'slam') { s = this.stateT < 0.45 ? A.slam : A.idle[0]; bob = this.stateT < 0.45 ? BOB.slam : 0; }
    if (this.state === 'waveWind') { s = A.stomp; bob = BOB.stomp; }
    if (this.state === 'waves') { s = this.stateT < 0.45 ? A.stompDown : A.idle[0]; bob = this.stateT < 0.45 ? BOB.stompDown : 0; }
    const shake = (this.state === 'slamWind' || this.state === 'waveWind') && this.stateT > 0.45 ? (Math.floor(this.age * 40) % 2 ? 1 : -1) : 0;
    const x0 = this.x;
    this.x += shake;
    this.drawBody(r, s, { flip: false });
    // the hourglass: its sand level is the attack timer
    if (this.spawnT <= 0 && this.falling <= 0) {
      const gx = this.x + GLASS_DX, gy = this.y + GLASS_DY + bob;
      const tint = this.flash > 0 ? '#ffffff' : undefined;
      if (this.state === 'flip') {
        const k = Math.min(1, this.stateT / 0.55);
        drawSprite(r.w, A.flip.get(Math.PI * (1 - Math.pow(1 - k, 2))), gx, gy, { tint });
      } else {
        const lv = clamp(Math.round(this.fill * 12), 0, 12);
        drawSprite(r.w, A.glass[lv][this.state === 'walk' || this.state.endsWith('Wind') ? 1 : 0], gx, gy, { tint });
      }
      // violet charge: builds as the top bulb empties
      const charge = this.state === 'slamWind' || this.state === 'waveWind' ? 1 : this.state === 'walk' ? clamp((0.5 - this.fill) / 0.32, 0, 1) : 0;
      // violet eyes; the runes on its fists kindle as the attack comes due
      const eu = r.u;
      eu.fillStyle = col(charge > 0.5 && Math.floor(this.age * 12) % 2 ? 'W' : 'V4');
      eu.fillRect(Math.round(this.x) - 1, Math.round(this.y - 41 + bob), 1, 1);
      eu.fillRect(Math.round(this.x) + 1, Math.round(this.y - 41 + bob), 1, 1);
      r.glowAt(this.x, this.y - 41 + bob, 4, 'V3', 0.35 + charge * 0.35);
      if (charge > 0) {
        r.glowAt(gx, gy + 6, 9, 'V2', charge * 0.25);
        if (this.state === 'slamWind') for (const sd of [-1, 1]) r.glowAt(this.x + sd * 15, this.y - 42, 6, 'V2', 0.5);
      }
    }
    this.x = x0;
  }
}

export const ROSTER: EnemyDef[] = [
  {
    id: 'pageswarm', cost: 1, group: 4, make: (x, y) => new PageSwarm(x, y), weight: 2.2,
    name: { zh: '书页群', en: 'Page Swarm' },
    desc: {
      zh: '从停摆的书里挣脱出来的散页，像一群纸鸟绕着你盘旋。某一页会突然折成纸镖、对准你俯冲——折页的那一下就是预警。',
      en: 'Loose leaves torn free of stopped books, circling like paper birds. One at a time a page folds itself into a dart and dives — the fold is your warning.',
    },
  },
  {
    id: 'inkhound', cost: 3, make: (x, y) => new InkHound(x, y), weight: 3,
    name: { zh: '墨犬', en: 'Ink Hound' },
    desc: {
      zh: '打翻的墨水瓶里爬出的猎犬。伏低身子、眼睛发红时会直线猛冲，沿途留下黏稠的墨渍——踩进去会被拖慢好几秒。',
      en: 'A hound that crawled out of a spilled inkwell. When it crouches and its eye flares, it bolts in a straight line, leaving sticky ink that slows you for seconds.',
    },
  },
  {
    id: 'sandwraith', cost: 3, make: (x, y) => new SandWraith(x, y), weight: 2.5, minRoom: 1,
    name: { zh: '沙之怨灵', en: 'Sand Wraith' },
    desc: {
      zh: '停滞时间的沙粒聚成的兜帽人影，是档案馆里迷失的读者。举起双手时会扇形抛出沙弹；被逼近便散成沙尘，在别处的闪光中重新凝聚。',
      en: 'A hooded shape of stopped-time sand — a reader who never left. Raises both hands to fling a fan of sand bolts; crowd it and it bursts apart, reforming where the sand shimmers.',
    },
  },
  {
    id: 'tomemimic', cost: 3, make: (x, y) => new TomeMimic(x, y), weight: 2.2, minRoom: 1,
    name: { zh: '书本拟态', en: 'Tome Mimic' },
    desc: {
      zh: '一本装作普通书籍躺在地上的厚重魔典。靠近时封面上的金眼会睁开；近身会张口撕咬，远处则吐出一扇锋利的纸片，然后一蹦一蹦地追来。',
      en: 'A fat grimoire lying on the floor, pretending to be a book. Come close and the gilt eye on its cover opens. It bites up close, spits a spread of paper shards from afar, and hops after you.',
    },
  },
  {
    id: 'hourglassgolem', cost: 14, make: (x, y) => new HourglassGolem(x, y), elite: true,
    name: { zh: '沙漏魔像', en: 'Hourglass Golem' },
    desc: {
      zh: '档案馆的守卫，胸腔是一只巨大的沙漏——上层的沙流尽之时，便是它出手之刻。重拳砸地与滚动的沙浪都带着紫色的定格之力：这种伤害，回溯也无法撤销。',
      en: 'Warden of the Archive, its chest a great hourglass — when the top bulb runs dry, it strikes. Its slams and rolling sand waves carry violet stasis: damage that even a rewind cannot undo.',
    },
  },
];
