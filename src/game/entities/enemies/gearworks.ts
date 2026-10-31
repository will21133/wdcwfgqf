// Floor 1 — The Sunken Gearworks.
import { Enemy } from '../enemy';
import type { Renderer } from '../../../engine/gfx/renderer';
import { drawSprite } from '../../../engine/gfx/sprite';
import { buildCogling, buildSentry, buildSpitter, buildMite, buildBrute, spearRot, spitBarrelRot } from '../../../art/sprites/gearworks';
import { Bullet } from '../projectile';
import { frand } from '../../../engine/rng';
import { angleTo, angleDiff, TAU, clamp } from '../../../engine/math';
import { sfx } from '../../G';

type Art<T> = () => T;
function lazy<T>(f: () => T): Art<T> { let v: T | null = null; return () => (v ??= f()); }
const COG = lazy(buildCogling), SEN = lazy(buildSentry), SPI = lazy(buildSpitter), MIT = lazy(buildMite), BRU = lazy(buildBrute);

// ───────────────────────────── Cogling ─────────────────────────────
export class Cogling extends Enemy {
  rollA = 0; chargeA = 0; spin = 0;
  constructor(x: number, y: number) {
    super(x, y, 24);
    this.r = 6; this.height = 14; this.speed = 46; this.kind = 'cogling'; this.codexId = 'cogling';
    this.debris = ['B2', 'B3', 'B1', 'K4'];
    this.brass = [1, 2];
  }
  think(dt: number) {
    const d = this.distT();
    switch (this.state) {
      case 'idle':
      case 'approach':
        this.spin += dt * 6;
        this.moveTo(this.target!.x, this.target!.y, this.speed, dt);
        if (d < 100 && this.stateT > 0.6 && this.world.map.los(this.x, this.y, this.target!.x, this.target!.y)) this.setState('windup');
        break;
      case 'windup':
        this.spin += dt * (10 + this.stateT * 50);
        if (this.stateT < 0.38) this.chargeA = this.angT();
        if (this.stateT === dt || this.stateT < dt * 1.5) sfx('cogWind', { vol: 0.5, pan: this.world.pan(this.x) });
        if (this.stateT > 0.55) { this.setState('charge'); this.attacking = true; sfx('cogCharge', { pan: this.world.pan(this.x) }); }
        break;
      case 'charge': {
        this.attacking = true;
        this.spin += dt * 40;
        const hit = this.moveDir(this.chargeA, 215, dt);
        if (Math.floor(this.stateT * 30) % 2 === 0) this.world.fx.dust(this.x, this.y, 1, this.chargeA);
        this.world.hurtPlayers({ t: 'circle', x: this.x, y: this.y, r: this.r + 2 }, { amount: 9, kind: 'contact', owner: this, x: this.x, y: this.y, knock: 160 });
        if (hit) { this.setState('dizzy'); this.world.shake(0.1); sfx('clank', { pan: this.world.pan(this.x) }); this.squash = 0.6; this.world.fx.hitSparks(this.x, this.y - 6, this.chargeA + Math.PI, 'normal', 8); }
        else if (this.stateT > 0.55) this.setState('recover');
        break;
      }
      case 'recover':
        this.spin += dt * 4;
        if (this.stateT > 0.55) this.setState('approach');
        break;
      case 'dizzy':
        if (this.stateT > 1.1) this.setState('approach');
        break;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'windup') this.teleLine(r, this.x, this.y - 2, this.chargeA, 110, 12, this.stateT / 0.55);
  }
  render(r: Renderer) {
    const A = COG();
    const f = A.roll[Math.floor(this.spin) % 4];
    const shake = this.state === 'windup' ? (Math.floor(this.age * 40) % 2 ? 1 : -1) : 0;
    // little legs (hidden while charging)
    if (this.state !== 'charge') {
      const ph = Math.floor(this.age * 10) % 2;
      const ctx = r.w;
      ctx.fillStyle = '#2c2440';
      ctx.fillRect(Math.round(this.x) - 4, Math.round(this.y) - 2 + ph, 2, 2 - ph);
      ctx.fillRect(Math.round(this.x) + 2, Math.round(this.y) - 2 + (1 - ph), 2, 1 + ph);
    }
    const bob = this.state === 'charge' ? 0 : -2;
    const x0 = this.x + shake;
    this.drawBody(r, f, {});
    void x0;
    if (this.spawnT <= 0 && this.falling <= 0) {
      const ey = this.y - 9 + bob + 2;
      drawSprite(r.w, A.eye, this.x, ey);
      const t = this.target;
      const a = t ? angleTo(this.x, ey, t.x, t.y - 8) : 0;
      const dizzy = this.state === 'dizzy';
      const px = dizzy ? Math.round(Math.cos(this.age * 12)) : Math.round(Math.cos(a));
      const py = dizzy ? Math.round(Math.sin(this.age * 12)) : Math.round(Math.sin(a));
      drawSprite(r.w, A.pupil, this.x + px, ey + py + 1);
      if (this.state === 'windup') r.lightAt(this.x, this.y - 6, 30, 'R3', 0.6);
    }
  }
}

// ───────────────────────────── Tin Sentry ─────────────────────────────
export class Sentry extends Enemy {
  thrustA = 0; spearExt = 0;
  constructor(x: number, y: number) {
    super(x, y, 42);
    this.r = 5; this.height = 22; this.speed = 34; this.poise = 14; this.kind = 'sentry'; this.codexId = 'sentry';
    this.debris = ['R2', 'U2', 'K8', 'B4'];
    this.brass = [2, 3];
  }
  think(dt: number) {
    const d = this.distT();
    switch (this.state) {
      case 'idle':
      case 'approach':
        this.spearExt = 0;
        this.moveTo(this.target!.x, this.target!.y, this.speed, dt);
        this.thrustA = this.angT();
        if (d < 50 && this.stateT > 0.4) { this.setState('windup'); sfx('sentryWind', { vol: 0.6, pan: this.world.pan(this.x) }); }
        break;
      case 'windup':
        if (this.stateT < 0.32) { this.thrustA = this.angT(); this.faceTarget(); }
        this.spearExt = -5 * Math.min(1, this.stateT / 0.3);
        if (this.stateT > 0.5) {
          this.setState('thrust');
          this.attacking = true;
          const c = Math.cos(this.thrustA), s = Math.sin(this.thrustA);
          this.world.combat.add({
            shape: { t: 'line', x0: this.x, y0: this.y - 8, x1: this.x + c * 44, y1: this.y - 8 + s * 44, r: 5 },
            team: 'enemy', life: 6, follow: this,
            info: { amount: 11, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 140 },
          });
          sfx('sentryThrust', { pan: this.world.pan(this.x) });
        }
        break;
      case 'thrust':
        this.attacking = true;
        this.spearExt = Math.min(14, this.stateT * 140);
        if (this.stateT < 0.12) this.moveDir(this.thrustA, 160, dt);
        if (this.stateT > 0.18) this.setState('recover');
        break;
      case 'recover':
        this.spearExt = Math.max(0, 14 - this.stateT * 40);
        if (this.stateT > 0.6) this.setState('approach');
        break;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'windup') this.teleLine(r, this.x, this.y - 2, this.thrustA, 50, 10, this.stateT / 0.5);
  }
  render(r: Renderer) {
    const A = SEN();
    let s = A.idle[Math.floor(this.age * 2.5) % 2];
    if (this.state === 'approach' && Math.hypot(this.vx, this.vy) > 5) s = A.walk[Math.floor(this.age * 8) % 4];
    if (this.state === 'windup') s = A.windup;
    if (this.state === 'thrust') s = A.thrust;
    const a = this.state === 'approach' || this.state === 'idle' ? (this.flip ? Math.PI - 1.2 : 1.2) - 0.0 : this.thrustA;
    const hand = { x: this.x + (this.flip ? -5 : 5), y: this.y - 10 };
    const sp = spearRot.get(a);
    const ext = this.spearExt;
    const behind = Math.sin(a) < -0.3;
    if (behind && this.spawnT <= 0) drawSprite(r.w, sp, hand.x + Math.cos(a) * ext, hand.y + Math.sin(a) * ext, { tint: this.flash > 0 ? '#ffffff' : undefined });
    this.drawBody(r, s);
    if (!behind && this.spawnT <= 0) drawSprite(r.w, sp, hand.x + Math.cos(a) * ext, hand.y + Math.sin(a) * ext, { tint: this.flash > 0 ? '#ffffff' : undefined });
  }
}

// ───────────────────────────── Bolt Spitter ─────────────────────────────
export class Spitter extends Enemy {
  aimA = 0; fireT = frand(1.2, 2.2); shots = 0; recoil = 0; strafe = frand() < 0.5 ? 1 : -1;
  constructor(x: number, y: number) {
    super(x, y, 30);
    this.r = 6; this.height = 14; this.speed = 32; this.kind = 'spitter'; this.codexId = 'spitter';
    this.debris = ['K5', 'K4', 'B3', 'M2'];
    this.brass = [2, 3];
  }
  think(dt: number) {
    const d = this.distT();
    const t = this.target!;
    const want = angleTo(this.x, this.y - 8, t.x, t.y - 8);
    this.aimA += clamp(angleDiff(this.aimA, want), -4 * dt, 4 * dt);
    if (this.recoil > 0) this.recoil -= dt * 20;
    switch (this.state) {
      case 'idle':
      case 'move': {
        if (d < 90) this.moveDir(want + Math.PI, this.speed * 1.3, dt);
        else if (d > 170) this.moveTo(t.x, t.y, this.speed, dt);
        else if (this.moveDir(want + (Math.PI / 2) * this.strafe, this.speed * 0.6, dt)) this.strafe *= -1;
        this.faceTarget();
        this.fireT -= dt;
        if (this.fireT <= 0 && this.world.map.los(this.x, this.y - 8, t.x, t.y - 8)) { this.setState('charge'); sfx('spitCharge', { vol: 0.5, pan: this.world.pan(this.x) }); }
        break;
      }
      case 'charge':
        if (this.stateT > 0.5) { this.setState('fire'); this.shots = 0; }
        break;
      case 'fire':
        this.attacking = true;
        if (this.stateT >= this.shots * 0.13) {
          const a = this.aimA + frand(-0.06, 0.06);
          const mx = this.x + Math.cos(a) * 8, my = this.y - 9 + Math.sin(a) * 8;
          this.world.add(new Bullet({ team: 'enemy', x: mx, y: my, ang: a, speed: 125, dmg: 7, style: 'bolt', r: 2.5, owner: this, life: 3 }));
          this.recoil = 3;
          this.shots++;
          sfx('spit', { vol: 0.7, pan: this.world.pan(this.x) });
          this.world.particles.spawn({ kind: 'smoke', x: mx, y: my, life: 0.1, ramp: ['W', 'M3'], size: 4, size2: 1, layer: 'glow' });
        }
        if (this.shots >= 3) { this.setState('move'); this.fireT = frand(1.8, 2.6); }
        break;
    }
  }
  render(r: Renderer) {
    const A = SPI();
    const s = this.state === 'charge' ? A.charge : A.idle[Math.floor(this.age * 4) % 2];
    this.drawBody(r, s);
    if (this.spawnT > 0 || this.falling > 0) return;
    const b = spitBarrelRot.get(this.aimA);
    const rc = this.recoil;
    drawSprite(r.w, b, this.x - Math.cos(this.aimA) * rc, this.y - 10 - Math.sin(this.aimA) * rc, { tint: this.flash > 0 ? '#ffffff' : undefined });
    if (this.state === 'charge') {
      const k = this.stateT / 0.5;
      const mx = this.x + Math.cos(this.aimA) * 8, my = this.y - 10 + Math.sin(this.aimA) * 8;
      r.glowAt(mx, my, 4 + k * 8, 'M2', 0.6 + k * 0.4);
      r.lightAt(mx, my, 30, 'M2', 0.5 * k);
    }
  }
}

// ───────────────────────────── Rust Mite ─────────────────────────────
export class Mite extends Enemy {
  hopA = 0; jitter = frand(0, TAU);
  constructor(x: number, y: number) {
    super(x, y, 9);
    this.r = 3.5; this.height = 7; this.speed = 74; this.kind = 'mite'; this.codexId = 'mite';
    this.debris = ['R2', 'R1', 'R3'];
    this.brass = [0, 1];
    this.spawnT = frand(0.5, 0.9);
  }
  think(dt: number) {
    const d = this.distT();
    const t = this.target!;
    switch (this.state) {
      case 'idle':
      case 'run': {
        this.jitter += dt * 5;
        const tx = t.x + Math.cos(this.jitter) * 18, ty = t.y + Math.sin(this.jitter * 1.3) * 12;
        this.moveTo(tx, ty, this.speed, dt);
        if (d < 40 && this.stateT > 0.5) { this.setState('crouch'); this.hopA = this.angT(); }
        break;
      }
      case 'crouch':
        this.squash = 0.4;
        if (this.stateT > 0.28) { this.setState('hop'); sfx('miteHop', { vol: 0.4, pan: this.world.pan(this.x) }); }
        break;
      case 'hop': {
        this.attacking = true;
        this.z = Math.sin((this.stateT / 0.3) * Math.PI) * 8;
        this.moveDir(this.hopA, 150, dt);
        this.world.hurtPlayers((p) => Math.hypot(p.x - this.x, p.y - this.y) < 7, { amount: 5, kind: 'contact', owner: this, x: this.x, y: this.y, knock: 80 });
        if (this.stateT > 0.3) { this.z = 0; this.setState('run'); this.squash = 0.5; }
        break;
      }
    }
  }
  render(r: Renderer) {
    const A = MIT();
    const s = this.state === 'hop' ? A.hop : A.walk[Math.floor(this.age * 14) % 2];
    const y0 = this.y;
    this.y -= this.z;
    this.drawBody(r, s);
    this.y = y0;
  }
}

// ───────────────────────────── Steam Brute (elite) ─────────────────────────────
export class Brute extends Enemy {
  atkA = 0; next = 'slam'; steamT = 0; ventT = 2;
  constructor(x: number, y: number) {
    super(x, y, 260);
    this.r = 11; this.height = 30; this.speed = 24; this.mass = 4; this.poise = 45; this.kind = 'brute'; this.codexId = 'brute';
    this.isElite = true;
    this.debris = ['B2', 'B3', 'B1', 'K5', 'O2'];
    this.brass = [8, 12];
    this.sandDrop = 3;
  }
  think(dt: number) {
    const d = this.distT();
    const t = this.target!;
    this.ventT -= dt;
    if (this.ventT <= 0) { this.ventT = frand(1.5, 3); this.world.fx.smoke(this.x + (this.flip ? 5 : -5), this.y - 34, 3, ['K9', 'K8', 'K7']); }
    switch (this.state) {
      case 'idle':
      case 'approach':
        this.moveTo(t.x, t.y, this.speed, dt);
        if (this.stateT > 0.8) {
          if (this.next === 'slam' && d < 56) { this.setState('slamWind'); this.atkA = this.angT(); sfx('bruteWind', { pan: this.world.pan(this.x) }); }
          else if (this.next === 'steam' && d < 110) { this.setState('steamWind'); this.atkA = this.angT(); sfx('steamWind', { pan: this.world.pan(this.x) }); }
          else if (this.stateT > 3) this.next = this.next === 'slam' ? 'steam' : 'slam';
        }
        break;
      case 'slamWind':
        this.faceTarget();
        if (this.stateT > 0.75) {
          this.setState('slam');
          const sx = this.x + Math.cos(this.atkA) * 20, sy = this.y + Math.sin(this.atkA) * 14;
          this.world.combat.add({ shape: { t: 'circle', x: sx, y: sy - 4, r: 40 }, team: 'enemy', life: 3, info: { amount: 16, kind: 'aoe', owner: this, x: sx, y: sy, knock: 260 } });
          this.world.fx.ring(sx, sy, 6, 50, 0.4, 'B5', 3, 'unlit');
          this.world.fx.dust(sx, sy, 14);
          this.world.fx.scorch(sx, sy, 18);
          this.world.shake(0.5);
          sfx('slam', { pan: this.world.pan(this.x) });
          this.next = 'steam';
        }
        break;
      case 'slam':
        this.attacking = this.stateT < 0.1;
        if (this.stateT > 0.8) this.setState('approach');
        break;
      case 'steamWind':
        this.faceTarget();
        this.atkA = this.atkA + clamp(angleDiff(this.atkA, this.angT()), -1.5 * dt, 1.5 * dt);
        if (this.stateT > 0.6) { this.setState('steam'); sfx('steam', { pan: this.world.pan(this.x) }); }
        break;
      case 'steam': {
        this.attacking = true;
        this.atkA = this.atkA + clamp(angleDiff(this.atkA, this.angT()), -0.8 * dt, 0.8 * dt);
        const mx = this.x + Math.cos(this.atkA) * 10, my = this.y - 14 + Math.sin(this.atkA) * 6;
        for (let i = 0; i < 3; i++) {
          const a = this.atkA + frand(-0.45, 0.45), s = frand(80, 150);
          this.world.particles.spawn({ kind: 'smoke', x: mx, y: my, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: frand(0.4, 0.7), ramp: ['K10', 'K9', 'K8', 'K7'], size: 2, size2: 7, drag: 3, alpha: 0.7 });
        }
        this.steamT -= dt;
        if (this.steamT <= 0) {
          this.steamT = 0.25;
          this.world.combat.add({ shape: { t: 'arc', x: this.x, y: this.y - 8, r: 74, a: this.atkA, w: 0.42 }, team: 'enemy', life: 2, info: { amount: 6, kind: 'aoe', owner: this, x: this.x, y: this.y, knock: 60 } });
        }
        if (this.stateT > 1.3) { this.setState('approach'); this.next = 'slam'; }
        break;
      }
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'slamWind') {
      const sx = this.x + Math.cos(this.atkA) * 20, sy = this.y + Math.sin(this.atkA) * 14;
      this.teleCircle(r, sx, sy, 40, this.stateT / 0.75);
    }
    if (this.state === 'steamWind') this.teleCone(r, this.x, this.y, this.atkA, 74, 0.42, this.stateT / 0.6);
  }
  render(r: Renderer) {
    const A = BRU();
    let s = A.idle[Math.floor(this.age * 2) % 2];
    if (this.state === 'approach' && Math.hypot(this.vx, this.vy) > 4) s = A.walk[Math.floor(this.age * 5) % 4];
    if (this.state === 'slamWind') s = A.windup;
    if (this.state === 'slam') s = this.stateT < 0.4 ? A.slam : A.idle[0];
    this.drawBody(r, s);
    // furnace glow
    r.lightAt(this.x, this.y - 18, 44, 'O2', 0.55);
    r.glowAt(this.x, this.y - 19, 10, 'O2', 0.25);
  }
}

// ───────────────────────────── Training automaton (tutorial) ─────────────────────────────
export class Dummy extends Enemy {
  punchT = 2;
  constructor(x: number, y: number) {
    super(x, y, 400);
    this.r = 6; this.height = 22; this.mass = 99; this.kind = 'dummy';
    this.brass = [0, 0];
    (this as any).ignoreClear = true;
    this.debris = ['B3', 'K6'];
  }
  think(dt: number) {
    this.hp = Math.min(this.maxHp, this.hp + dt * 40);
    const d = this.distT();
    this.faceTarget();
    switch (this.state) {
      case 'idle':
        if (d < 36) { this.punchT -= dt; if (this.punchT <= 0) { this.setState('wind'); this.punchT = 2.5; } }
        break;
      case 'wind':
        if (this.stateT > 0.6) {
          this.setState('punch');
          const a = this.angT();
          this.world.combat.add({ shape: { t: 'arc', x: this.x, y: this.y - 8, r: 34, a, w: 0.9 }, team: 'enemy', life: 3, info: { amount: 8, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 120 } });
          sfx('sentryThrust', { pan: this.world.pan(this.x) });
        }
        break;
      case 'punch':
        if (this.stateT > 0.5) this.setState('idle');
        break;
    }
  }
  renderTelegraph(r: Renderer) {
    if (this.state === 'wind') this.teleCone(r, this.x, this.y, this.angT(), 34, 0.9, this.stateT / 0.6);
  }
  render(r: Renderer) {
    const A = SEN();
    this.drawBody(r, this.state === 'wind' ? A.windup : A.idle[0], {});
  }
}

import type { EnemyDef } from '../../world/enemyDef';
export const ROSTER: EnemyDef[] = [
  {
    id: 'cogling', cost: 2, make: (x, y) => new Cogling(x, y), weight: 3,
    name: { zh: '齿轮仔', en: 'Cogling' },
    desc: { zh: '一枚长了腿的齿轮，对一切会动的东西都很好奇。蓄力后会直线滚撞，撞墙会晕。', en: 'A gear that grew legs and curiosity. Winds up, then rolls in a straight line — and gets dizzy when it hits a wall.' },
  },
  {
    id: 'mite', cost: 1, group: 3, make: (x, y) => new Mite(x, y), weight: 2,
    name: { zh: '锈螨', en: 'Rust Mite' },
    desc: { zh: '以铁锈为食的小甲虫，成群出没，会扑跳咬人。', en: 'Tiny beetles that feed on rust. They come in swarms and leap to bite.' },
  },
  {
    id: 'sentry', cost: 3, make: (x, y) => new Sentry(x, y), weight: 3, minRoom: 1,
    name: { zh: '锡兵哨卫', en: 'Tin Sentry' },
    desc: { zh: '玩具兵模样的守卫，背后的发条早已锈死，却仍在执勤。长枪突刺前会后拉蓄力。', en: 'A toy-soldier guard whose key rusted long ago. It still stands its post. Pulls the spear back before each thrust.' },
  },
  {
    id: 'spitter', cost: 3, make: (x, y) => new Spitter(x, y), weight: 2.5, minRoom: 1,
    name: { zh: '螺栓炮台', en: 'Bolt Spitter' },
    desc: { zh: '蟹形自动炮台，保持距离，炮口发光后连射三发螺栓。', en: 'A crab-legged turret that keeps its distance. The muzzle glows before a three-bolt burst.' },
  },
  {
    id: 'brute', cost: 14, make: (x, y) => new Brute(x, y), elite: true,
    name: { zh: '蒸汽蛮兵', en: 'Steam Brute' },
    desc: { zh: '锅炉改造的重型劳工。双拳砸地前会高举，喷吐蒸汽时会缓慢转向。', en: 'A boiler turned heavy labourer. Raises both fists before a slam; turns slowly while venting steam.' },
  },
];
