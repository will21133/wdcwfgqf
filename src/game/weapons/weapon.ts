import type { World } from '../world/world';
import type { Renderer } from '../../engine/gfx/renderer';
import { frand } from '../../engine/rng';
import { loOf, ownerPlayer } from '../players';
import type { Loadout } from '../run';
import type { Player } from '../entities/player';
import { angleDiff, angleTo } from '../../engine/math';

/** how far each weapon reaches (px; echo intent correction looks this far + 16 px; GDD2 §3.5) */
const REACH: Record<string, number> = { rapier: 36, maul: 40, bow: 160, chakram: 110, hook: 56, twinhands: 28, tuningfork: 60 };
/** GDD2 §4.1: hold Attack this long for a heavy; attack this soon after a dash for a dash-attack */
export const HEAVY_HOLD = 0.4, DASH_ATTACK_WINDOW = 0.15;

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

export interface WeaponInput {
  attackPressed: boolean; attackHeld: boolean; specialPressed: boolean; specialHeld: boolean; specialReleased: boolean;
  /** seconds since the hand's last dash ended (dash-attack window; omitted = long ago) */
  sinceDash?: number;
}

export interface Hooks {
  /** called when an attack should be recorded / announced */
  onAttack(combo: number, angle: number): void;
  onSpecial(angle: number, charge?: number): void;
  /** a heavy (Attack held ≥ 0.4 s, released) on a weapon that has one (GDD2 §4.1; P1 fills the moves) */
  onHeavy?(angle: number, charge: number): void;
  /** an attack within 0.15 s after a dash ended, on a weapon that has a dash-attack */
  onDashAttack?(angle: number): void;
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
  /** seconds Attack has been held down (heavy) */
  holdT = 0;

  get busy() { return this.phase !== 'idle'; }
  get step(): Step | null { return this.combo >= 0 ? this.steps[this.combo] : null; }

  /** player-side state machine (input buffering, combos, cancels) */
  update(dt: number, inp: WeaponInput, aim: number, atkSpeed: number, specialCdMul: number, hooks: Hooks) {
    if (this.specialCd > 0) this.specialCd -= dt;
    // 2.0 verb hook points (GDD2 §4.1). Only weapons that declare a heavy / dash-attack get them, so
    // the 1.0 movesets play exactly as before until P1 adds the moves.
    if (this.hasHeavy() && hooks.onHeavy) {
      if (inp.attackHeld) this.holdT += dt;
      else {
        if (this.holdT >= HEAVY_HOLD && this.phase === 'idle') { const c = Math.min(1, this.holdT / 1.2); this.holdT = 0; this.angle = aim; hooks.onHeavy(aim, c); this.buffer = 0; return; }
        this.holdT = 0;
      }
      if (this.holdT >= HEAVY_HOLD) { this.buffer = 0; return; }
    }
    if (inp.attackPressed && this.hasDashAttack() && hooks.onDashAttack && (inp.sinceDash ?? 99) <= DASH_ATTACK_WINDOW && this.phase === 'idle') {
      this.angle = aim;
      hooks.onDashAttack(aim);
      return;
    }
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

  /** this weapon has a heavy / a dash-attack (P1 overrides; GDD2 §4.6) */
  hasHeavy(): boolean { return false; }
  hasDashAttack(): boolean { return false; }
  /** a heavy (player or echo). Default: the combo finisher, as a heavy hit */
  performHeavy(w: Wielder, angle: number, _charge: number): void { this.perform(w, this.steps.length - 1, angle); }
  /** a dash-attack (player or echo). Default: the opener */
  performDashAttack(w: Wielder, angle: number): void { this.perform(w, 0, angle); }

  /** px this weapon reaches (echo intent correction) */
  reach(): number { return REACH[this.id] ?? 40; }
  /**
   * Echo intent correction (GDD2 §3.5): an echo replaying a swing at angle `a` turns up to
   * mods.echoIntentDeg (30°) toward the nearest enemy within reach + 16 px.
   */
  intentAngle(w: Wielder, a: number): number {
    if (!w.isEcho) return a;
    const m = wielderLo(w).mods;
    const maxA = (m.echoIntentDeg * Math.PI) / 180;
    if (maxA <= 0) return a;
    const reach = this.reach() + 16;
    let best: number | null = null, bd = Infinity;
    for (const e of w.world.enemies) {
      if (e.dead || (e as { spawnT?: number }).spawnT! > 0) continue;
      const d = Math.hypot(e.x - w.x, e.y - w.y);
      if (d > reach + e.r || d >= bd) continue;
      const diff = angleDiff(a, angleTo(w.x, w.y - 7, e.x, e.y - 4));
      if (Math.abs(diff) > maxA) continue;
      bd = d; best = diff;
    }
    return best === null ? a : a + best;
  }

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
