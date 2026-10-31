// 残响 Echo — your past three seconds, replayed. Same weapon code, scaled damage.
import { Entity } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import type { Recording, Frame } from '../systems/rewind';
import type { Weapon, Wielder } from '../weapons/weapon';
import { tickFrames, keySprites } from './player';
import { Scarf } from './scarf';
import { Afterimage } from './fxents';
import { sfx } from '../G';
import type { Dir } from '../../art/sprites/tick';
import { frand } from '../../engine/rng';
import { TAU } from '../../engine/math';

const ECHO_RAMP = ['C0', 'C1', 'C2', 'C3', 'C4'];

export class Echo extends Entity implements Wielder {
  isEcho = true;
  dmgScale: number;
  lastSecond = false;
  flip = false;
  dir: Dir = 'down';
  i = 0;
  fired = 0;
  paradoxReady = false;
  startX: number; startY: number;
  private frame: Frame;
  private lastAttackTick: number;
  private scarf = new Scarf(6, 2.2);
  private trailT = 0;
  private endT = -1;

  constructor(public rec: Recording, public weapon: Weapon, dmg: number, public speed = 1) {
    super();
    this.team = 'player';
    this.dmgScale = dmg;
    this.frame = rec.frames[0];
    this.x = this.startX = this.frame.x;
    this.y = this.startY = this.frame.y;
    const attacks = rec.events.filter((e) => e.type === 'attack' || e.type === 'special');
    this.lastAttackTick = attacks.length ? attacks[attacks.length - 1].tick : -1;
    this.scarf.reset(this.x, this.y - 10);
    this.collides = false;
  }

  lunge() {}

  get progress() { return this.i / this.rec.frames.length; }

  update(dt: number) {
    if (this.endT >= 0) return;
    this.i += dt * 60 * this.speed;
    const n = this.rec.frames.length;
    const fi = Math.floor(this.i);
    if (fi >= n) { this.shatter(false); return; }
    this.frame = this.rec.frames[fi];
    this.x = this.frame.x; this.y = this.frame.y;
    this.dir = this.frame.dir === 0 ? 'down' : this.frame.dir === 1 ? 'up' : 'side';
    this.flip = this.frame.flip;
    // fire events that occurred up to this tick
    const evs = this.rec.events;
    while (this.fired < evs.length && evs[this.fired].tick <= fi) {
      const e = evs[this.fired++];
      const isLast = e.tick === this.lastAttackTick && this.weapon.id === 'rapier';
      this.lastSecond = isLast;
      if (e.type === 'attack') this.weapon.perform(this, e.combo!, e.angle!);
      else if (e.type === 'special') this.weapon.performSpecial(this, e.angle!, e.charge);
      else if (e.type === 'dash') {
        this.world.bus.emit('dash', { owner: this as any, dx: e.dx!, dy: e.dy!, echo: true });
        sfx('dashEcho', { vol: 0.4, pan: this.world.pan(this.x) });
      }
      this.lastSecond = false;
    }
    if (!this.paradoxReady && this.age > 0.45 && Math.hypot(this.x - this.startX, this.y - this.startY) > 18) this.paradoxReady = true;
    // trail
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = this.frame.air ? 0.02 : 0.08;
      this.world.add(new Afterimage(this.x, this.y, this.sprite().recolor(ECHO_RAMP), this.flip, 'C2', 0.22, 0.3));
    }
    const fx = this.flip ? -1 : 1;
    const n2 = tickFrames().neck[this.dir];
    this.scarf.update(this.x + n2.x * fx, this.y + n2.y, -(this.frame.x - (this.rec.frames[Math.max(0, fi - 1)].x)) * 80, -20, dt);
    if (frand() < 0.3) {
      this.world.particles.spawn({ kind: 'px', x: this.x + frand(-5, 5), y: this.y - frand(2, 18), vy: frand(-20, -6), life: frand(0.3, 0.6), ramp: ['C4', 'C3', 'C2'], layer: 'glow', size: 1 });
    }
  }

  sprite(): Sprite {
    const F = tickFrames();
    const f = this.frame;
    switch (f.anim) {
      case 1: return F.run[this.dir][Math.floor(f.animT * 12) % 6];
      case 2: return F.dash[this.dir];
      case 3: return F.hurt[this.dir];
      default: return F.idle[this.dir][Math.floor(f.animT * 4) % 4];
    }
  }

  shatter(paradox: boolean) {
    if (this.dead) return;
    const w = this.world;
    w.fx.burst(this.x, this.y - 8, paradox ? 6 : 14, ['C4', 'C3', 'C2', 'C1'], 90, 0.5);
    for (let k = 0; k < 8; k++) {
      const a = frand(0, TAU);
      w.particles.spawn({ kind: 'debris', x: this.x, y: this.y - 2, z: frand(4, 16), vx: Math.cos(a) * frand(20, 60), vy: Math.sin(a) * frand(20, 60), vz: frand(30, 80), grav: 300, life: frand(0.4, 0.8), ramp: ['C3', 'C2'], layer: 'glow', size: 1 });
    }
    if (!paradox) sfx('echoEnd', { vol: 0.5, pan: w.pan(this.x) });
    w.bus.emit('echoEnd', { echo: this, paradox });
    this.kill();
  }

  renderGround(r: Renderer) {
    const ctx = r.g;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(47,166,217,0.25)';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), 7, 3, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  render(r: Renderer) {
    const spr = this.sprite().recolor(ECHO_RAMP);
    const fade = this.progress > 0.85 ? (1 - this.progress) / 0.15 : 1;
    const a = (0.72 + Math.sin(this.age * 20) * 0.08) * fade;
    const f = this.frame;
    const F = tickFrames();
    const hand = F.hand[this.dir];
    const fx = this.flip ? -1 : 1;
    const pose = { angle: f.wa, ext: f.we, vis: f.wv };
    const behind = Math.sin(pose.angle) < -0.35 || this.dir === 'up';
    this.scarf.draw(r.w, 'C2', a * 0.8);
    if (behind) this.weapon.drawHeld(r, this.x + hand.x * fx, this.y + hand.y, pose, 'C3', a);
    drawSprite(r.w, spr, this.x, this.y, { flip: this.flip, alpha: a });
    if (!behind) this.weapon.drawHeld(r, this.x + hand.x * fx, this.y + hand.y, pose, 'C3', a);
    // additive ghost glow
    r.g.globalCompositeOperation = 'lighter';
    drawSprite(r.g, spr, this.x, this.y, { flip: this.flip, alpha: 0.28 * fade });
    r.g.globalCompositeOperation = 'source-over';
    r.lightAt(this.x, this.y - 8, 46, 'C2', 0.45 * fade);
    void keySprites;
  }

  /** dotted preview of where this echo will walk (so players can plan paradoxes) */
  renderPath(r: Renderer) {
    const fr = this.rec.frames;
    const start = Math.floor(this.i);
    const ctx = r.u;
    ctx.fillStyle = '#6be3f7';
    for (let k = start + 6; k < fr.length; k += 5) {
      const f = fr[k];
      const t = (k - start) / fr.length;
      ctx.globalAlpha = 0.55 * (1 - t);
      ctx.fillRect(Math.round(f.x), Math.round(f.y) - 1, 1, 1);
    }
    // end marker
    const last = fr[fr.length - 1];
    ctx.globalAlpha = 0.6;
    ctx.fillRect(Math.round(last.x) - 2, Math.round(last.y) - 1, 5, 1);
    ctx.fillRect(Math.round(last.x), Math.round(last.y) - 3, 1, 5);
    ctx.globalAlpha = 1;
  }
}
