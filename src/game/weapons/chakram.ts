// 齿轮回旋镖 Gear Chakram — a returning sawtooth gear; hold to hover it; echo throws split in two.
import { Weapon, Wielder, Step, Pose, WeaponInput, Hooks, wielderPlayer } from './weapon';
import type { Renderer } from '../../engine/gfx/renderer';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { Entity } from '../entities/entity';
import { gearFrames, BRASS_GEAR } from '../../art/gear';
import { sfx } from '../G';
import { frand } from '../../engine/rng';

let FR: Sprite[] | null = null;
let FR_SMALL: Sprite[] | null = null;
const frames = () => (FR ??= gearFrames(6, 9, BRASS_GEAR, 4, 2));
const small = () => (FR_SMALL ??= gearFrames(4, 7, BRASS_GEAR, 3, 1.5));

class GearProj extends Entity {
  state: 'out' | 'hover' | 'back' = 'out';
  dist = 0;
  hitOut = new Set<number>();
  hitBack = new Set<number>();
  hoverTick = 0;
  constructor(public owner: Wielder, public ang: number, public dmg: number, public crit: boolean, public range: number, public weapon: Chakram | null, public tint?: string) {
    super();
    this.x = owner.x; this.y = owner.y - 8;
    this.collides = false;
  }
  update(dt: number) {
    const w = this.world;
    const holdHover = this.weapon && this.weapon.held && !this.owner.isEcho;
    if (this.state === 'out') {
      const sp = 300;
      this.x += Math.cos(this.ang) * sp * dt;
      this.y += Math.sin(this.ang) * sp * dt;
      this.dist += sp * dt;
      if (this.dist >= this.range || w.map.shotBlockedAt(this.x, this.y + 8)) {
        this.state = holdHover ? 'hover' : 'back';
        if (w.map.shotBlockedAt(this.x, this.y + 8)) { w.fx.hitSparks(this.x, this.y, this.ang + Math.PI, 'normal', 6); sfx('clank', { vol: 0.4, pan: w.pan(this.x) }); }
      }
      this.hit(this.hitOut, 1);
    } else if (this.state === 'hover') {
      this.hoverTick -= dt;
      if (this.hoverTick <= 0) { this.hoverTick = 0.15; this.hitOut.clear(); this.hit(this.hitOut, 0.4); }
      if (!holdHover) this.state = 'back';
    } else {
      const gone = !!(this.owner as any).dead;
      const tx = gone ? this.x : this.owner.x, ty = gone ? this.y : this.owner.y - 8;
      const a = Math.atan2(ty - this.y, tx - this.x);
      const sp = 330;
      this.x += Math.cos(a) * sp * dt;
      this.y += Math.sin(a) * sp * dt;
      this.hit(this.hitBack, 1);
      if (Math.hypot(tx - this.x, ty - this.y) < 10 || (this.owner as any).dead) {
        this.kill();
        if (this.weapon && !this.owner.isEcho) { this.weapon.inFlight--; sfx('step', { vol: 0.5 }); }
      }
    }
    if (frand() < 0.4) w.particles.spawn({ kind: 'spark', x: this.x, y: this.y, vx: frand(-40, 40), vy: frand(-40, 40), life: 0.12, ramp: this.tint ? ['C4', 'C3'] : ['B6', 'B5'], layer: 'glow' });
  }
  private hit(set: Set<number>, mul: number) {
    const w = this.world;
    for (const e of [...w.enemies, ...w.breakables]) {
      if (e.dead || set.has(e.id)) continue;
      if (Math.hypot(e.x - this.x, e.y - 8 - this.y) > e.r + 8) continue;
      set.add(e.id);
      e.hurt({ amount: Math.max(1, Math.round(this.dmg * mul)), crit: this.crit, kind: 'proj', owner: this.owner as any, echo: this.owner.isEcho, x: this.x, y: this.y, knock: 90, src: 'attack' });
    }
  }
  renderUnlit(r: Renderer) {
    const fr = this.tint ? small() : frames();
    const s = fr[Math.floor(this.age * 30) % fr.length];
    drawSprite(r.u, this.tint ? s.recolor(['C0', 'C1', 'C2', 'C3', 'C4']) : s, this.x, this.y);
    r.lightAt(this.x, this.y, 30, this.tint ? 'C2' : 'B5', 0.4);
  }
}

class Saw extends Entity {
  t = 0; tick = 0;
  constructor(x: number, y: number, public dmg: number, public owner: Wielder, public dur = 4) { super(); this.x = x; this.y = y; }
  added() { this.world.fx.dust(this.x, this.y, 8); sfx('clank', { pan: this.world.pan(this.x) }); this.world.shake(0.1); }
  update(dt: number) {
    this.t += dt; this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.2;
      for (const e of this.world.enemiesNear(this.x, this.y, 22)) e.hurt({ amount: this.dmg, kind: 'aoe', owner: this.owner as any, echo: this.owner.isEcho, x: this.x, y: this.y, knock: 60, src: 'special', quiet: true });
    }
    if (frand() < 0.5) this.world.particles.spawn({ kind: 'spark', x: this.x + frand(-6, 6), y: this.y - 2, vx: frand(-90, 90), vy: frand(-80, -20), life: 0.2, ramp: ['W', 'B6', 'O3'], layer: 'glow' });
    if (this.t > this.dur) this.kill();
  }
  render(r: Renderer) {
    const s = frames()[Math.floor(this.t * 40) % 4];
    drawSprite(r.w, this.owner.isEcho ? s.recolor(['C0', 'C1', 'C2', 'C3', 'C4']) : s, this.x, this.y - 4, { sy: 0.6 });
    r.lightAt(this.x, this.y, 36, 'B5', 0.4);
  }
}

export class Chakram extends Weapon {
  id = 'chakram';
  steps: Step[] = [{ windup: 0.06, active: 0.05, recover: 0.12, dmg: 16, knock: 90, kind: 'throw', lunge: 0, move: 0.8 }];
  specialCooldown = 3;
  inFlight = 0;
  held = false;

  update(dt: number, inp: WeaponInput, aim: number, atkSpeed: number, specialCdMul: number, hooks: Hooks) {
    this.held = inp.attackHeld;
    if (inp.attackPressed && this.inFlight > 0) inp.attackPressed = false;
    super.update(dt, inp, aim, atkSpeed, specialCdMul, hooks);
  }

  perform(w: Wielder, combo: number, angle: number) {
    const world = w.world;
    const { amount, crit } = this.roll(w, 16);
    if (w.isEcho) {
      for (const da of [-0.25, 0.25]) world.add(new GearProj(w, angle + da, amount, crit, 110, null, 'echo'));
    } else {
      this.inFlight++;
      world.add(new GearProj(w, angle, amount, crit, 120, this));
    }
    sfx(w.isEcho ? 'swingEcho' : 'cogCharge', { pan: world.pan(w.x), vol: 0.6 });
    world.bus.emit('attack', { owner: w as any, combo, angle, echo: w.isEcho, player: wielderPlayer(w) });
  }

  performSpecial(w: Wielder, angle: number) {
    const world = w.world;
    const tx = w.x + Math.cos(angle) * 60, ty = w.y + Math.sin(angle) * 60;
    const x = world.map.solidAt(tx, ty) ? w.x : tx, y = world.map.solidAt(tx, ty) ? w.y : ty;
    const { amount } = this.roll(w, 8, true);
    world.add(new Saw(x, y, amount, w, w.isEcho ? 2.5 : 4));
    world.bus.emit('special', { owner: w as any, angle, echo: w.isEcho, player: wielderPlayer(w) });
  }

  pose(facing: number): Pose { return { angle: Math.cos(facing) >= 0 ? 0.3 : Math.PI - 0.3, ext: 0, vis: this.inFlight > 0 ? 0 : 1 }; }

  drawHeld(r: Renderer, x: number, y: number, p: Pose, tint?: string, alpha = 1) {
    if (p.vis <= 0) return;
    drawSprite(r.w, small()[0], x + Math.cos(p.angle) * 3, y + 1, { tint, alpha });
  }
}
