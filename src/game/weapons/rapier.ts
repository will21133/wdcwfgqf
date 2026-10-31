// 秒针细剑 Second-Hand Rapier — fast thrusts, a wide third sweep, and a piercing lunge.
import { Weapon, Wielder, Step, Pose, WeaponInput, Hooks, wielderPlayer, wielderLo } from './weapon';
import type { Renderer } from '../../engine/gfx/renderer';
import { rapierRot } from '../../art/sprites/weapons';
import { drawSprite } from '../../engine/gfx/sprite';
import { Smear } from '../entities/fxents';
import { sfx } from '../G';
import { ease } from '../../engine/math';

export class Rapier extends Weapon {
  id = 'rapier';
  steps: Step[] = [
    { windup: 0.05, active: 0.07, recover: 0.17, dmg: 12, knock: 80, kind: 'thrust', lunge: 9, move: 0.35 },
    { windup: 0.045, active: 0.07, recover: 0.17, dmg: 12, knock: 80, kind: 'thrust', lunge: 9, move: 0.35 },
    { windup: 0.1, active: 0.1, recover: 0.3, dmg: 22, knock: 220, kind: 'sweep', lunge: 14, move: 0.25 },
  ];
  specialCooldown = 1.5;
  private lungeHit = false;

  perform(w: Wielder, combo: number, angle: number) {
    const s = this.steps[combo];
    const c = Math.cos(angle), sn = Math.sin(angle);
    const ox = w.x, oy = w.y - 7;
    w.lunge(c * s.lunge, sn * s.lunge, 0.07);
    const world = w.world;
    const cal = wielderLo(w).calibrations;
    const reach = cal.includes('rp_reach') ? 1.4 : 1;
    const wide = cal.includes('rp_arc');
    const { amount, crit } = this.roll(w, s.dmg * (s.kind === 'sweep' && wide ? 1.4 : 1));
    const pal = w.isEcho ? 'echo' : 'brass';
    if (s.kind === 'thrust') {
      world.combat.add({
        shape: { t: 'line', x0: ox + c * 4, y0: oy + sn * 4, x1: ox + c * 32 * reach, y1: oy + sn * 32 * reach, r: 6 },
        team: 'player', life: 3, follow: w as any,
        info: { amount, crit, kind: 'melee', knock: s.knock, owner: w as any, echo: w.isEcho, x: ox, y: oy, src: 'attack' },
      });
      world.add(new Smear(w, c * 6, -7 + sn * 6, 'thrust', angle, { len: Math.round(28 * reach), width: 7 }, pal, 0.11));
      sfx(w.isEcho ? 'swingEcho' : 'thrust', { pan: world.pan(w.x), vol: w.isEcho ? 0.5 : 1 });
    } else {
      world.combat.add({
        shape: { t: 'arc', x: ox, y: oy, r: wide ? 42 : 34, a: angle, w: wide ? 1.6 : 1.25 },
        team: 'player', life: 4, follow: w as any,
        info: { amount, crit, kind: 'melee', knock: s.knock, owner: w as any, echo: w.isEcho, x: ox, y: oy, src: 'attack' },
      });
      world.add(new Smear(w, 0, -7, 'arc', angle, { R: wide ? 38 : 30, thick: wide ? 11 : 9, sweep: wide ? 3.2 : 2.6, cw: true }, pal, 0.14));
      sfx(w.isEcho ? 'swingEcho' : 'swingHeavy', { pan: world.pan(w.x), vol: w.isEcho ? 0.5 : 1 });
    }
    world.bus.emit('attack', { owner: w as any, combo, angle, echo: w.isEcho, player: wielderPlayer(w) });
  }

  specialDuration() { return 0.2; }

  protected startSpecial(aim: number, hooks: Hooks, cdMul: number) {
    super.startSpecial(aim, hooks, cdMul);
    this.lungeHit = false;
  }

  updateSpecial(_dt: number, _inp: WeaponInput, _aim: number, _hooks: Hooks) {}

  performSpecial(w: Wielder, angle: number) {
    const c = Math.cos(angle), sn = Math.sin(angle);
    const dist = 78;
    const world = w.world;
    const { amount, crit } = this.roll(w, 26, true);
    w.lunge(c * dist, sn * dist, 0.14);
    const flurry = wielderLo(w).calibrations.includes('rp_flurry');
    world.combat.add({
      shape: { t: 'line', x0: w.x, y0: w.y - 7, x1: w.x + c * 18, y1: w.y - 7 + sn * 18, r: 9 },
      team: 'player', life: 10, follow: w as any, rehit: flurry ? 0.05 : undefined,
      info: { amount, crit, kind: 'melee', knock: 160, owner: w as any, echo: w.isEcho, src: 'special' },
    });
    world.add(new Smear(w, c * 4, -7 + sn * 4, 'thrust', angle, { len: 34, width: 10 }, w.isEcho ? 'echo' : 'brass', 0.2));
    sfx(w.isEcho ? 'swingEcho' : 'lunge', { pan: world.pan(w.x) });
    world.bus.emit('special', { owner: w as any, angle, echo: w.isEcho, player: wielderPlayer(w) });
  }

  pose(facing: number): Pose {
    const st = this.step;
    if (this.phase === 'special') return { angle: this.angle, ext: 10, vis: 1 };
    if (this.phase === 'windup' && st) {
      const k = this.t / st.windup;
      if (st.kind === 'sweep') return { angle: this.angle - 1.4 * ease.outCubic(k), ext: 2, vis: 1 };
      return { angle: this.angle, ext: -3 * ease.outCubic(k), vis: 1 };
    }
    if (this.phase === 'active' && st) {
      const k = Math.min(1, this.t / st.active);
      if (st.kind === 'sweep') return { angle: this.angle - 1.4 + 2.8 * ease.outCubic(k), ext: 6, vis: 1 };
      return { angle: this.angle, ext: 12 * ease.outExpo(k), vis: 1 };
    }
    if (this.phase === 'recover' && st) {
      const k = Math.min(1, this.t / st.recover);
      if (st.kind === 'sweep') return { angle: this.angle + 1.4 - 0.4 * k, ext: 6 * (1 - k), vis: 1 };
      return { angle: this.angle, ext: 12 * (1 - ease.outCubic(k)), vis: 1 };
    }
    // resting: blade angled down and slightly forward of the facing
    const rest = Math.cos(facing) >= 0 ? 1.15 : Math.PI - 1.15;
    return { angle: rest, ext: 0, vis: 1 };
  }

  drawHeld(r: Renderer, x: number, y: number, p: Pose, tint?: string, alpha = 1) {
    const s = rapierRot.get(p.angle);
    const hx = x + Math.cos(p.angle) * p.ext, hy = y + Math.sin(p.angle) * p.ext;
    drawSprite(r.w, s, hx, hy, { tint, alpha });
  }
}
