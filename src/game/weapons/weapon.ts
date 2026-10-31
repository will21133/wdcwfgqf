import type { World } from '../world/world';
import type { Renderer } from '../../engine/gfx/renderer';
import { frand } from '../../engine/rng';
import { loOf, ownerPlayer } from '../players';
import type { Loadout } from '../run';
import type { Player } from '../entities/player';

/** the loadout behind a wielder (a player, or the hand an echo belongs to); slot I as a fallback */
export function wielderLo(w: Wielder): Loadout {
  return loOf(w) ?? w.world.run!.lo(w.world.player?.slot ?? 0);
}
/** the hand behind a wielder, for bus events */
export function wielderPlayer(w: Wielder): Player | undefined { return ownerPlayer(w) ?? undefined; }

/** Anything that can swing a weapon: the player or one of its echoes. */
export interface Wielder {
  x: number; y: number;
  world: World;
  isEcho: boolean;
  /** multiplier from echo damage etc. */
  dmgScale: number;
  /** 'last second' bonus for the final attack in an echo's replay */
  lastSecond?: boolean;
  lunge(dx: number, dy: number, dur: number): void;
  /** current facing flip for held weapon */
  flip: boolean;
}

export interface Step {
  windup: number; active: number; recover: number;
  dmg: number; knock: number;
  kind: string;
  lunge: number;
  move: number; // move speed multiplier during the step
}

export interface Pose { angle: number; ext: number; vis: number }

export interface WeaponInput { attackPressed: boolean; attackHeld: boolean; specialPressed: boolean; specialHeld: boolean; specialReleased: boolean }

export interface Hooks {
  /** called when an attack should be recorded / announced */
  onAttack(combo: number, angle: number): void;
  onSpecial(angle: number, charge?: number): void;
}

export abstract class Weapon {
  abstract id: string;
  abstract steps: Step[];
  specialCooldown = 1.6;

  phase: 'idle' | 'windup' | 'active' | 'recover' | 'special' = 'idle';
  t = 0;
  combo = -1;
  comboWindow = 0;
  buffer = 0;
  angle = 0;
  specialCd = 0;
  specialT = 0;
  /** extra state for charge weapons */
  charge = 0;

  get busy() { return this.phase !== 'idle'; }
  get step(): Step | null { return this.combo >= 0 ? this.steps[this.combo] : null; }

  /** player-side state machine (input buffering, combos, cancels) */
  update(dt: number, inp: WeaponInput, aim: number, atkSpeed: number, specialCdMul: number, hooks: Hooks) {
    if (this.specialCd > 0) this.specialCd -= dt;
    if (inp.attackPressed) this.buffer = 0.18;
    else if (this.buffer > 0) this.buffer -= dt;
    if (this.comboWindow > 0) { this.comboWindow -= dt; if (this.comboWindow <= 0 && this.phase === 'idle') this.combo = -1; }
    const sp = atkSpeed;
    switch (this.phase) {
      case 'idle':
        if (inp.specialPressed && this.specialCd <= 0) { this.startSpecial(aim, hooks, specialCdMul); break; }
        if (this.buffer > 0) this.startStep(aim);
        break;
      case 'windup':
        this.t += dt * sp;
        if (this.t >= this.step!.windup) {
          this.phase = 'active';
          this.t = 0;
          hooks.onAttack(this.combo, this.angle);
        }
        break;
      case 'active':
        this.t += dt * sp;
        if (this.t >= this.step!.active) { this.phase = 'recover'; this.t = 0; }
        break;
      case 'recover': {
        this.t += dt * sp;
        // allow chaining after half the recovery
        const s = this.step!;
        if (this.buffer > 0 && this.t >= s.recover * 0.45 && this.combo < this.steps.length - 1) { this.startStep(aim); break; }
        if (inp.specialPressed && this.specialCd <= 0 && this.t >= s.recover * 0.3) { this.startSpecial(aim, hooks, specialCdMul); break; }
        if (this.t >= s.recover) {
          this.phase = 'idle';
          this.t = 0;
          this.comboWindow = this.combo >= this.steps.length - 1 ? 0.0001 : 0.3;
        }
        break;
      }
      case 'special':
        this.specialT -= dt;
        this.updateSpecial(dt, inp, aim, hooks);
        if (this.specialT <= 0) { this.phase = 'idle'; this.combo = -1; }
        break;
    }
  }

  private startStep(aim: number) {
    this.buffer = 0;
    if (this.phase === 'idle' && this.comboWindow <= 0) this.combo = 0;
    else this.combo = (this.combo + 1) % this.steps.length;
    this.phase = 'windup';
    this.t = 0;
    this.angle = aim;
  }

  protected startSpecial(aim: number, hooks: Hooks, cdMul: number) {
    this.phase = 'special';
    this.angle = aim;
    this.specialCd = this.specialCooldown * cdMul;
    this.specialT = this.specialDuration();
    this.combo = -1;
    hooks.onSpecial(aim);
  }

  /** cancel (dash, hurt) */
  cancel() {
    if (this.phase === 'special' && !this.cancelableSpecial()) return;
    this.phase = 'idle';
    this.t = 0;
    this.comboWindow = 0.25;
  }
  cancelableSpecial() { return false; }

  moveMul(): number {
    if (this.phase === 'idle') return 1;
    if (this.phase === 'special') return 0.2;
    return this.step?.move ?? 0.4;
  }

  specialDuration() { return 0.2; }
  updateSpecial(_dt: number, _inp: WeaponInput, _aim: number, _hooks: Hooks) {}

  /** perform an attack swing (player OR echo) */
  abstract perform(w: Wielder, combo: number, angle: number): void;
  abstract performSpecial(w: Wielder, angle: number, charge?: number): void;
  /** held pose for rendering (player side) */
  abstract pose(facingAngle: number): Pose;
  abstract drawHeld(r: Renderer, x: number, y: number, pose: Pose, tint?: string, alpha?: number): void;

  /** damage helper */
  protected roll(w: Wielder, base: number, special = false): { amount: number; crit: boolean } {
    const m = wielderLo(w).mods;
    let a = base * m.dmg * (special ? m.specialDmg : 1) * w.dmgScale;
    if (w.lastSecond) a *= 2;
    const crit = frand() < m.critChance;
    if (crit) a *= m.critMult;
    return { amount: Math.round(a), crit };
  }
}
