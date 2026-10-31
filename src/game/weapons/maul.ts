// 钟摆巨锤 Pendulum Maul — slow, heavy, wide; echoes send out shockwaves.
import { Weapon, Wielder, Step, Pose, wielderPlayer, wielderLo } from './weapon';
import type { Renderer } from '../../engine/gfx/renderer';
import { maulRot } from '../../art/sprites/weapons';
import { drawSprite } from '../../engine/gfx/sprite';
import { Smear } from '../entities/fxents';
import { Shockwave } from '../progression/effectEnts';
import { sfx } from '../G';
import { ease } from '../../engine/math';

export class Maul extends Weapon {
  id = 'maul';
  steps: Step[] = [
    { windup: 0.17, active: 0.12, recover: 0.3, dmg: 30, knock: 260, kind: 'swing', lunge: 6, move: 0.25 },
    { windup: 0.24, active: 0.1, recover: 0.45, dmg: 48, knock: 330, kind: 'slam', lunge: 12, move: 0.1 },
  ];
  specialCooldown = 2.2;

  perform(w: Wielder, combo: number, angle: number) {
    const s = this.steps[combo];
    const world = w.world;
    const c = Math.cos(angle), sn = Math.sin(angle);
    const ox = w.x, oy = w.y - 7;
    w.lunge(c * s.lunge, sn * s.lunge, 0.08);
    const { amount, crit } = this.roll(w, s.dmg);
    const pal = w.isEcho ? 'echo' : 'ember';
    if (s.kind === 'swing') {
      world.combat.add({ shape: { t: 'arc', x: ox, y: oy, r: 40, a: angle, w: 1.45 }, team: 'player', life: 5, follow: w as any, info: { amount, crit, kind: 'melee', knock: s.knock, owner: w as any, echo: w.isEcho, x: ox, y: oy, src: 'attack', hitstop: 0.07 } });
      world.add(new Smear(w, 0, -7, 'arc', angle, { R: 38, thick: 12, sweep: 3.0, cw: true }, pal, 0.16));
      sfx(w.isEcho ? 'swingEcho' : 'swingHeavy', { pan: world.pan(w.x) });
    } else {
      const sx = ox + c * 22, sy = oy + sn * 22;
      world.combat.add({ shape: { t: 'circle', x: sx, y: sy, r: 26 }, team: 'player', life: 3, info: { amount, crit, kind: 'melee', knock: s.knock, owner: w as any, echo: w.isEcho, x: ox, y: oy, src: 'attack', hitstop: 0.09 } });
      world.fx.ring(sx, sy + 7, 4, 34, 0.3, w.isEcho ? 'C3' : 'O3', 3);
      world.fx.dust(sx, sy + 7, 10);
      world.fx.scorch(sx, sy + 7, 12);
      world.shake(0.25);
      sfx('slam', { vol: w.isEcho ? 0.4 : 0.8, pan: world.pan(w.x) });
    }
    // echo trait: every echo swing releases a shockwave
    if (w.isEcho) world.add(new Shockwave(w.x, w.y - 4, 46, { amount: 14 * wielderLo(w).mods.dmg, kind: 'aoe', owner: w as any, knock: 140, echo: true, src: 'attack' }, 'C3', 0.25));
    world.bus.emit('attack', { owner: w as any, combo, angle, echo: w.isEcho, player: wielderPlayer(w) });
  }

  specialDuration() { return 0.65; }
  performSpecial(w: Wielder, angle: number) {
    const world = w.world;
    const { amount, crit } = this.roll(w, 12, true);
    world.combat.add({ shape: { t: 'circle', x: w.x, y: w.y - 7, r: 36 }, team: 'player', life: 39, follow: w as any, rehit: 0.13, info: { amount, crit, kind: 'melee', knock: 120, owner: w as any, echo: w.isEcho, src: 'special', hitstop: 0.02 } });
    for (let i = 0; i < 4; i++) world.after(i * 0.15, () => world.add(new Smear(w, 0, -7, 'arc', angle + i * 1.6, { R: 36, thick: 10, sweep: 3.4 }, w.isEcho ? 'echo' : 'ember', 0.16)), w);
    sfx(w.isEcho ? 'swingEcho' : 'lunge', { pan: world.pan(w.x) });
    world.bus.emit('special', { owner: w as any, angle, echo: w.isEcho, player: wielderPlayer(w) });
  }

  moveMul() { return this.phase === 'special' ? 0.55 : super.moveMul(); }

  pose(facing: number): Pose {
    const st = this.step;
    if (this.phase === 'special') return { angle: this.angle + (0.65 - this.specialT) * 16, ext: 4, vis: 1 };
    if (st && this.phase === 'windup') {
      const k = ease.outCubic(this.t / st.windup);
      return st.kind === 'swing' ? { angle: this.angle - 1.6 * k, ext: 0, vis: 1 } : { angle: -Math.PI / 2 + (Math.cos(this.angle) >= 0 ? 0.4 : -0.4) * (1 - k), ext: -2, vis: 1 };
    }
    if (st && this.phase === 'active') {
      const k = Math.min(1, this.t / st.active);
      return st.kind === 'swing' ? { angle: this.angle - 1.6 + 3.2 * ease.outCubic(k), ext: 4, vis: 1 } : { angle: -Math.PI / 2 + (this.angle + Math.PI / 2) * ease.outExpo(k), ext: 6, vis: 1 };
    }
    if (st && this.phase === 'recover') {
      const k = Math.min(1, this.t / st.recover);
      return st.kind === 'swing' ? { angle: this.angle + 1.6 - 0.6 * k, ext: 3 * (1 - k), vis: 1 } : { angle: this.angle, ext: 6 * (1 - k), vis: 1 };
    }
    return { angle: Math.cos(facing) >= 0 ? 1.9 : Math.PI - 1.9, ext: -2, vis: 1 };
  }

  drawHeld(r: Renderer, x: number, y: number, p: Pose, tint?: string, alpha = 1) {
    drawSprite(r.w, maulRot.get(p.angle), x + Math.cos(p.angle) * (p.ext + 6), y + Math.sin(p.angle) * (p.ext + 6), { tint, alpha });
  }
}
