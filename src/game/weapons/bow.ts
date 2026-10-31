// 报时长弓 Chime Bow — tap for quick arrows, hold to charge a piercing chime; echo arrows home in.
import { Weapon, Wielder, Step, Pose, WeaponInput, Hooks } from './weapon';
import type { Renderer } from '../../engine/gfx/renderer';
import { bowRot } from '../../art/sprites/weapons';
import { drawSprite } from '../../engine/gfx/sprite';
import { Bullet } from '../entities/projectile';
import { sfx } from '../G';
import { col } from '../../art/palette';

export class Bow extends Weapon {
  id = 'bow';
  steps: Step[] = [{ windup: 0, active: 0.05, recover: 0.12, dmg: 9, knock: 40, kind: 'shot', lunge: 0, move: 0.7 }];
  specialCooldown = 1.8;
  holding = false;
  holdT = 0;
  cool = 0;

  update(dt: number, inp: WeaponInput, aim: number, atkSpeed: number, specialCdMul: number, hooks: Hooks) {
    if (this.specialCd > 0) this.specialCd -= dt;
    if (this.cool > 0) this.cool -= dt * atkSpeed;
    if (this.phase === 'special') {
      this.specialT -= dt;
      if (this.specialT <= 0) this.phase = 'idle';
      return;
    }
    this.angle = aim;
    if (inp.specialPressed && this.specialCd <= 0) { this.holding = false; this.startSpecial(aim, hooks, specialCdMul); return; }
    if (inp.attackPressed && this.cool <= 0) { this.holding = true; this.holdT = 0; }
    if (this.holding) {
      this.holdT += dt * atkSpeed;
      this.phase = 'windup';
      if (!inp.attackHeld) {
        // release: quick shot or charged chime
        const charge = Math.min(1, Math.max(0, (this.holdT - 0.18) / 0.55));
        hooks.onAttack(Math.round(charge * 100), aim);
        this.holding = false;
        this.phase = 'recover';
        this.t = 0;
        this.cool = charge > 0.05 ? 0.3 : 0.16;
      }
    } else if (this.phase === 'recover') {
      this.t += dt;
      if (this.t > 0.12) this.phase = 'idle';
    }
  }

  get chargeK() { return this.holding ? Math.min(1, Math.max(0, (this.holdT - 0.18) / 0.55)) : 0; }
  moveMul() { return this.holding ? 0.55 : this.phase === 'special' ? 0.4 : 1; }
  cancel() { this.holding = false; this.phase = 'idle'; }

  perform(w: Wielder, combo: number, angle: number) {
    const world = w.world;
    const charge = combo / 100;
    const full = charge >= 0.99;
    const base = 9 + charge * 29;
    const { amount, crit } = this.roll(w, base);
    const pal = w.isEcho ? ['W', 'C4', 'C2'] : full ? ['W', 'B6', 'O2'] : ['W', 'K10', 'B4'];
    world.add(new Bullet({
      team: 'player', x: w.x + Math.cos(angle) * 8, y: w.y - 8 + Math.sin(angle) * 8, ang: angle, speed: 330 + charge * 140, dmg: amount, style: 'arrow', r: full ? 3 : 2,
      owner: w as any, pierce: full ? 5 : charge > 0.4 ? 1 : 0, homing: w.isEcho ? 3.2 : 0, echo: w.isEcho, pal, knock: 40 + charge * 180, life: 1.6,
      info: { crit, src: 'attack' },
    }));
    if (full && !w.isEcho) { world.shake(0.12); world.fx.ring(w.x + Math.cos(angle) * 10, w.y - 8 + Math.sin(angle) * 10, 2, 16, 0.2, 'B6', 2); }
    sfx(w.isEcho ? 'swingEcho' : full ? 'lunge' : 'thrust', { pan: world.pan(w.x), vol: w.isEcho ? 0.4 : 0.8 });
    if (full) sfx('charge', { vol: 0.4 });
    world.bus.emit('attack', { owner: w as any, combo: full ? 2 : 0, angle, echo: w.isEcho });
  }

  specialDuration() { return 0.25; }
  performSpecial(w: Wielder, angle: number) {
    const world = w.world;
    for (let i = -2; i <= 2; i++) {
      const { amount, crit } = this.roll(w, 14, true);
      world.add(new Bullet({ team: 'player', x: w.x, y: w.y - 8, ang: angle + i * 0.17, speed: 340, dmg: amount, style: 'arrow', r: 2, owner: w as any, homing: w.isEcho ? 3 : 0, echo: w.isEcho, pal: w.isEcho ? ['W', 'C4', 'C2'] : ['W', 'B6', 'B4'], life: 1.2, knock: 90, info: { crit, src: 'special' } }));
    }
    sfx(w.isEcho ? 'swingEcho' : 'lunge', { pan: world.pan(w.x) });
    world.bus.emit('special', { owner: w as any, angle, echo: w.isEcho });
  }

  pose(facing: number): Pose {
    if (this.phase === 'idle' && !this.holding) return { angle: Math.cos(facing) >= 0 ? 0.6 : Math.PI - 0.6, ext: 0, vis: 1 };
    return { angle: this.angle, ext: this.holding ? -this.chargeK * 2 : 1, vis: 1 + this.chargeK };
  }

  drawHeld(r: Renderer, x: number, y: number, p: Pose, tint?: string, alpha = 1) {
    const hx = x + Math.cos(p.angle) * (3 + p.ext), hy = y + Math.sin(p.angle) * (3 + p.ext);
    drawSprite(r.w, bowRot.get(p.angle), hx, hy, { tint, alpha });
    const charge = Math.max(0, p.vis - 1);
    if (charge > 0 && !tint) {
      // nocked arrow + glow
      const c = Math.cos(p.angle), s = Math.sin(p.angle);
      r.u.strokeStyle = col('K10');
      r.u.lineWidth = 1;
      r.u.beginPath(); r.u.moveTo(hx - c * (2 + charge * 4) + 0.5, hy - s * (2 + charge * 4) + 0.5); r.u.lineTo(hx + c * 9 + 0.5, hy + s * 9 + 0.5); r.u.stroke();
      r.glowAt(hx + c * 9, hy + s * 9, 4 + charge * 8, charge >= 0.99 ? 'O3' : 'B5', 0.3 + charge * 0.5);
    }
  }
}
