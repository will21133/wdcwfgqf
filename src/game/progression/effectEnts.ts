// World entities spawned by memories / parts: fire patches, shockwaves, turrets, gear mines, flowers.
import { Entity, Actor } from '../entities/entity';
import type { Renderer } from '../../engine/gfx/renderer';
import type { DamageInfo } from '../systems/combat';
import { Bullet } from '../entities/projectile';
import { frand } from '../../engine/rng';
import { TAU } from '../../engine/math';
import { col } from '../../art/palette';
import { drawSprite, spriteFromDef, RotCache } from '../../engine/gfx/sprite';
import { sfx } from '../G';
import { ownerPlayer } from '../players';

/** Ground fire patch: burns enemies standing in it. */
export class FireZone extends Entity {
  t = 0; tick = 0;
  constructor(x: number, y: number, public rad: number, public dur: number, public stacks: number, public owner: Actor | null) {
    super();
    this.x = x; this.y = y;
  }
  update(dt: number) {
    this.t += dt;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.4;
      for (const e of this.world.enemiesNear(this.x, this.y, this.rad)) this.world.combat.addStatus(e, 'burn', this.stacks, this.owner);
    }
    if (frand() < 0.5) this.world.particles.spawn({ kind: 'px', x: this.x + frand(-this.rad, this.rad), y: this.y + frand(-this.rad * 0.5, this.rad * 0.5), vy: frand(-30, -12), life: frand(0.3, 0.6), ramp: ['O4', 'O3', 'O2', 'O1'], layer: 'glow', size: 1.5 });
    if (this.t >= this.dur) this.kill();
  }
  renderGround(r: Renderer) {
    const k = 1 - this.t / this.dur;
    r.w.fillStyle = col('O0');
    r.w.globalAlpha = 0.35 * k;
    r.w.beginPath(); r.w.ellipse(Math.round(this.x), Math.round(this.y), this.rad, this.rad * 0.55, 0, 0, TAU); r.w.fill();
    r.w.globalAlpha = 1;
    r.lightAt(this.x, this.y, this.rad * 2.5, 'O2', 0.35 * k);
  }
}

/** Expanding ring that damages enemies once as it passes. */
export class Shockwave extends Entity {
  t = 0;
  hit = new Set<number>();
  constructor(x: number, y: number, public r1: number, public info: DamageInfo, public color = 'U4', public dur = 0.3, public onHitFn?: (a: Actor) => void) {
    super();
    this.x = x; this.y = y;
  }
  added() { this.world.fx.ring(this.x, this.y, 4, this.r1, this.dur + 0.1, this.color, 3); }
  update(dt: number) {
    this.t += dt;
    const rad = (this.t / this.dur) * this.r1;
    for (const e of this.world.enemies) {
      if (e.dead || this.hit.has(e.id)) continue;
      if (Math.hypot(e.x - this.x, (e.y - this.y) * 1.3) <= rad + e.r) {
        this.hit.add(e.id);
        const d = e.hurt({ ...this.info, x: this.x, y: this.y });
        if (d > 0) this.onHitFn?.(e);
      }
    }
    if (this.t >= this.dur) this.kill();
  }
}

const TURRET = spriteFromDef({
  rows: ['..nnnn..', '.nBYBbn.', 'nBbkkbbn', 'nbkkkkbn', '.nbbbbn.', 'ddmmmmdd', 'd.mmmm.d'],
  pal: { n: 'B1', B: 'B4', Y: 'B6', b: 'B3', k: 'K1', m: 'K4', d: 'K3' },
  ox: 4, oy: 6,
});
const BARREL = spriteFromDef({ rows: ['nnnnn', 'BBBBn', 'nnnnn'], pal: { n: 'B1', B: 'B5' }, ox: 0, oy: 1 });
const barrelRot = new RotCache(BARREL, 24);

/** Pip's little gear turret. */
export class Turret extends Entity {
  t = 0; fire = 0.3; aim = 0;
  constructor(x: number, y: number, public dur: number, public dmg: number, public rate: number, public extra: Partial<DamageInfo> = {}, public owner: Actor | null = null) {
    super();
    this.x = x; this.y = y;
  }
  added() { this.owner ??= this.world.player; this.world.fx.dust(this.x, this.y, 5); sfx('doorOpen', { vol: 0.25 }); }
  update(dt: number) {
    this.t += dt;
    this.fire -= dt;
    const tgt = this.world.nearestEnemy(this.x, this.y, 170);
    if (tgt) this.aim = Math.atan2(tgt.y - 8 - (this.y - 7), tgt.x - this.x);
    if (tgt && this.fire <= 0) {
      this.fire = this.rate;
      this.world.add(new Bullet({ team: 'player', x: this.x + Math.cos(this.aim) * 6, y: this.y - 7 + Math.sin(this.aim) * 6, ang: this.aim, speed: 260, dmg: this.dmg, style: 'bolt', r: 2, owner: this.owner, pal: ['W', 'B6', 'B4'], info: { via: 'construct', ...this.extra } }));
      sfx('spit', { vol: 0.3, pan: this.world.pan(this.x) });
    }
    if (this.t >= this.dur) {
      this.kill();
      this.world.fx.burst(this.x, this.y - 4, 10, ['B6', 'B4', 'B2'], 80, 0.4);
    }
  }
  renderGround(r: Renderer) { r.w.fillStyle = 'rgba(11,10,20,0.4)'; r.w.fillRect(Math.round(this.x) - 4, Math.round(this.y), 9, 2); }
  render(r: Renderer) {
    const blink = this.dur - this.t < 1 && Math.floor(this.t * 10) % 2 === 0;
    drawSprite(r.w, TURRET, this.x, this.y, { alpha: blink ? 0.5 : 1 });
    drawSprite(r.w, barrelRot.get(this.aim), this.x, this.y - 7);
    r.lightAt(this.x, this.y - 6, 26, 'B4', 0.3);
  }
}

/** Spinning gear mine: arms, then explodes. */
export class GearMine extends Entity {
  t = 0;
  constructor(x: number, y: number, public dmg: number, public fuse = 1.0, public extra: Partial<DamageInfo> = {}, public onBoom?: (x: number, y: number) => void, public owner: Actor | null = null) {
    super();
    this.x = x; this.y = y;
  }
  added() { this.owner ??= this.world.player; }
  update(dt: number) {
    this.t += dt;
    if (this.t >= this.fuse) {
      this.kill();
      const w = this.world;
      for (const e of w.enemiesNear(this.x, this.y, 30)) e.hurt({ amount: this.dmg, kind: 'aoe', owner: this.owner, x: this.x, y: this.y, knock: 120, via: 'construct', ...this.extra });
      w.fx.burst(this.x, this.y - 2, 16, ['W', 'B6', 'B4', 'O2'], 140, 0.35);
      w.fx.ring(this.x, this.y, 3, 30, 0.3, 'B5', 2);
      w.shake(0.1);
      sfx('clank', { vol: 0.6, pan: w.pan(this.x) });
      this.onBoom?.(this.x, this.y);
    }
  }
  renderUnlit(r: Renderer) {
    const ctx = r.u;
    const a = this.t * 14;
    const x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = col('K0'); ctx.fillRect(x - 3, y - 3, 7, 6);
    ctx.fillStyle = col('B3'); ctx.fillRect(x - 2, y - 2, 5, 4);
    ctx.fillStyle = col(Math.floor(a) % 2 ? 'B6' : 'B4');
    ctx.fillRect(x + Math.round(Math.cos(a) * 2), y + Math.round(Math.sin(a) * 1.5), 1, 1);
    if (this.fuse - this.t < 0.3 && Math.floor(this.t * 20) % 2) { ctx.fillStyle = col('O3'); ctx.fillRect(x - 1, y - 1, 3, 2); }
    r.glowAt(this.x, this.y, 6, 'B4', 0.3);
  }
}

/** Healing flower left by Fen's memories. Only the hand who grew it can pick it (heals go to the owner). */
export class HealFlower extends Entity {
  t = 0;
  constructor(x: number, y: number, public amount: number, public life = 8, public owner: Actor | null = null) {
    super();
    this.x = x; this.y = y;
  }
  update(dt: number) {
    this.t += dt;
    const p = ownerPlayer(this.owner) ?? this.world.player;
    if (p && p.state === 'alive' && Math.hypot(p.x - this.x, p.y - this.y) < 9 && this.t > 0.3) {
      const h = Math.round(this.amount * (this.world.run ? this.world.run.lo(p.slot).mods.healMul : 1));
      p.hp = Math.min(p.maxHp, p.hp + h);
      this.world.fx.number(p.x, p.y - 26, h, 'G4', false);
      this.world.fx.burst(this.x, this.y - 3, 8, ['G4', 'G3', 'T5'], 50, 0.5);
      sfx('heal', { vol: 0.5 });
      this.kill();
    }
    if (this.t > this.life) this.kill();
  }
  render(r: Renderer) {
    const ctx = r.w;
    const x = Math.round(this.x), y = Math.round(this.y);
    const g = Math.min(1, this.t * 3);
    ctx.fillStyle = col('G1'); ctx.fillRect(x, y - Math.round(4 * g), 1, Math.round(4 * g));
    if (g >= 1) {
      ctx.fillStyle = col('K0'); ctx.fillRect(x - 2, y - 7, 5, 4);
      ctx.fillStyle = col('T5'); ctx.fillRect(x - 1, y - 6, 3, 2);
      ctx.fillStyle = col('K10'); ctx.fillRect(x, y - 6, 1, 1);
    }
    r.lightAt(this.x, this.y - 4, 18, 'G3', 0.3);
  }
}

/** Fen's vines: slow + rust enemies passing through. */
export class VineZone extends Entity {
  t = 0; tick = 0;
  constructor(x: number, y: number, public dur = 2.5, public owner: Actor | null = null) { super(); this.x = x; this.y = y; }
  update(dt: number) {
    this.t += dt;
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.5;
      for (const e of this.world.enemiesNear(this.x, this.y, 12)) {
        e.st.slow = Math.max(e.st.slow, 1); e.st.slowAmt = 0.5;
        this.world.combat.addStatus(e, 'rust', 1, this.owner);
      }
    }
    if (this.t > this.dur) this.kill();
  }
  renderGround(r: Renderer) {
    const ctx = r.w;
    const k = Math.min(1, this.t * 4) * Math.min(1, (this.dur - this.t) * 2);
    ctx.globalAlpha = k;
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + this.x;
      ctx.fillStyle = col(i % 2 ? 'G2' : 'T3');
      ctx.fillRect(Math.round(this.x + Math.cos(a) * 6), Math.round(this.y + Math.sin(a) * 3), 2, 1);
    }
    ctx.globalAlpha = 1;
  }
}
