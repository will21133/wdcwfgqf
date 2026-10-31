// Boss base: intro card, phases, health bar data, dramatic death.
import { Enemy } from './enemy';
import type { Renderer } from '../../engine/gfx/renderer';
import type { DamageInfo } from '../systems/combat';
import type { L10n } from '../i18n';
import { sfx } from '../G';
import { frand } from '../../engine/rng';
import { TAU } from '../../engine/math';
import { rumble } from '../../engine/rumble';

export abstract class Boss extends Enemy {
  abstract bossName: L10n;
  abstract bossTitle: L10n;
  /** hp fractions where phases change, descending (e.g. [0.6]) */
  phases: number[] = [0.6];
  phase = 0;
  introT = 2.6;
  dyingT = -1;
  /** display hp for the bar (smoothed) */
  shownHp = 0;
  ignoreDeathClear = false;

  constructor(x: number, y: number, hp: number) {
    super(x, y, hp);
    this.isBoss = true;
    this.spawnT = 0;
    this.mass = 20;
    this.poise = 9999;
    this.canFall = false;
    this.shownHp = hp;
    this.brass = [30, 40];
  }

  get inIntro() { return this.introT > 0; }

  update(dt: number) {
    this.shownHp += (this.hp - this.shownHp) * Math.min(1, dt * 6);
    if (this.dyingT >= 0) { this.updateDying(dt); return; }
    if (this.introT > 0) { this.introT -= dt; this.invuln = 0.1; this.updateIntro(dt); return; }
    // phase transitions
    while (this.phase < this.phases.length && this.hp / this.maxHp <= this.phases[this.phase]) {
      this.phase++;
      this.onPhase(this.phase);
    }
    super.update(dt);
  }

  updateIntro(_dt: number) {}
  onPhase(_p: number) {}

  /** override hurt to keep the boss alive through its death animation */
  die(info: DamageInfo) {
    if (this.dyingT >= 0) return;
    this.dyingT = 0;
    this.hp = 0;
    this.invuln = 99;
    this.attacking = false;
    this.lastHit = info;
    const w = this.world;
    w.slowmo(0.2, 1.6);
    w.shake(0.6);
    sfx('deathBig');
    rumble(1, 1, 900);
    // remove enemy hitboxes and bullets
    w.combat.hitboxes = w.combat.hitboxes.filter((h) => h.team !== 'enemy');
    for (const e of w.entities) if ((e as any).team === 'enemy' && e !== this && !(e as any).isBoss) { if ((e as any).hp !== undefined) (e as any).hurt?.({ amount: 9999, kind: 'aoe', pierceInvuln: true }); else if ((e as any).pop) (e as any).pop(false); }
  }

  updateDying(dt: number) {
    this.dyingT += dt;
    const w = this.world;
    // chain of small explosions, then a big one
    if (this.dyingT < 2.2 && Math.floor(this.dyingT * 12) !== Math.floor((this.dyingT - dt) * 12)) {
      const x = this.x + frand(-this.r * 1.5, this.r * 1.5), y = this.y - frand(4, this.height);
      w.fx.burst(x, y, 10, ['W', 'O4', 'O3', 'O2'], 120, 0.4);
      w.fx.smoke(x, y, 2);
      sfx('hitCrit', { vol: 0.6, pan: w.pan(x) });
      w.shake(0.15);
    }
    this.flash = Math.floor(this.dyingT * 16) % 2 ? 0.05 : 0;
    if (this.dyingT >= 2.4) {
      this.dead = true;
      w.fx.shatter(this, this.debris, 4);
      w.fx.ring(this.x, this.y - 10, 6, 140, 0.8, 'W', 4);
      w.fx.ring(this.x, this.y - 10, 4, 100, 0.6, 'B5', 3);
      w.shake(1);
      w.hitstop(0.18);
      sfx('paradox');
      rumble(1, 1, 600);
      this.onDeath(this.lastHit ?? { amount: 0, kind: 'aoe' });
    }
  }

  renderUnlit(_r: Renderer) {}

  /** expanding shockwave ring along the ground — dodge by dashing through it */
  shockRing(x: number, y: number, maxR: number, dmg: number, speed = 150, color = 'O3') {
    this.world.add(new GroundRing(x, y, maxR, dmg, speed, color, this));
  }
}

import { Entity } from './entity';
import { col } from '../../art/palette';

/** Expanding ring hazard: hurts the player when the band passes over their feet. */
export class GroundRing extends Entity {
  rad = 4;
  hitDone = false;
  constructor(x: number, y: number, public maxR: number, public dmg: number, public speed: number, public color: string, public owner: Enemy, public fixed = false) {
    super();
    this.x = x; this.y = y;
  }
  update(dt: number) {
    const prev = this.rad;
    this.rad += this.speed * dt;
    const p = this.world.player;
    if (p && !this.hitDone) {
      const d = Math.hypot(p.x - this.x, (p.y - this.y) * 1.5);
      if (d >= prev - 4 && d <= this.rad + 2) {
        const dealt = p.hurt({ amount: this.dmg, kind: 'aoe', owner: this.owner, x: this.x, y: this.y, knock: 160, fixed: this.fixed });
        if (dealt > 0) this.hitDone = true;
      }
    }
    if (Math.floor(this.rad / 6) !== Math.floor(prev / 6)) {
      const a = frand(0, TAU);
      this.world.particles.spawn({ kind: 'smoke', x: this.x + Math.cos(a) * this.rad, y: this.y + Math.sin(a) * this.rad / 1.5, vy: -10, life: 0.4, ramp: ['K8', 'K7', 'K6'], size: 2, size2: 4, alpha: 0.5 });
    }
    if (this.rad >= this.maxR) this.kill();
  }
  renderUnlit(r: Renderer) {
    const ctx = r.u;
    const k = this.rad / this.maxR;
    ctx.strokeStyle = col(this.color);
    ctx.globalAlpha = 0.9 * (1 - k * 0.6);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), this.rad, this.rad / 1.5, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = col('W');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), this.rad, this.rad / 1.5, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    r.glowAt(this.x, this.y, this.rad * 0.4 + 10, this.color, 0.15);
  }
}
