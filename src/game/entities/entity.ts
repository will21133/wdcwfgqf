import type { Renderer } from '../../engine/gfx/renderer';
import type { World } from '../world/world';
import type { DamageInfo } from '../systems/combat';

export type Team = 'player' | 'enemy' | 'neutral';

let NEXT_ID = 1;

export abstract class Entity {
  id = NEXT_ID++;
  x = 0; y = 0; z = 0;
  vx = 0; vy = 0;
  /** collision radius (feet circle) */
  r = 4;
  dead = false;
  world!: World;
  team: Team = 'neutral';
  /** pushes / is pushed by other solid actors */
  solid = false;
  /** collides with walls */
  collides = true;
  /** sort bias for y-sorting */
  sortBias = 0;
  /** render on top of everything in world (e.g. flying) */
  layerTop = false;
  age = 0;

  get sortY() { return this.y + this.sortBias; }

  added() {}
  removed() {}
  update(_dt: number) {}
  render(_r: Renderer) {}
  /** drawn before all sorted entities (ground shadows, telegraphs) */
  renderGround?(_r: Renderer): void;
  /** drawn after lighting, unlit (bullets, markers) */
  renderUnlit?(_r: Renderer): void;
  kill() { this.dead = true; }
}

export interface StatusState {
  burn: number; burnT: number; burnTick: number;
  rust: number;
  stasis: number; stasisStored: number;
  resonance: number;
  slow: number; slowAmt: number;
  stun: number;
  /** who applied each status (its damage and sand go to that hand; F2b) */
  burnBy?: Actor | null; rustBy?: Actor | null; stasisBy?: Actor | null; resonanceBy?: Actor | null;
}

export const newStatus = (): StatusState => ({ burn: 0, burnT: 0, burnTick: 0, rust: 0, stasis: 0, stasisStored: 0, resonance: 0, slow: 0, slowAmt: 0, stun: 0 });

export abstract class Actor extends Entity {
  hp = 10;
  maxHp = 10;
  flash = 0;
  invuln = 0;
  /** knockback velocity (decays) */
  kx = 0; ky = 0;
  mass = 1;
  /** hits >= poise interrupt the actor */
  poise = 0;
  hitstun = 0;
  st: StatusState = newStatus();
  /** shown on death / codex */
  kind = 'actor';
  /** contact damage to the opposing team */
  contactDamage = 0;
  isBoss = false;
  isElite = false;
  /** can fall into pits */
  canFall = true;
  falling = 0;
  /** height of sprite for hit-number placement */
  height = 16;
  /** last hit info (for death effects) */
  lastHit: DamageInfo | null = null;
  /** set by world while frozen by time-stop/stasis */
  get frozen() { return this.st.stasis > 0; }

  /** returns damage actually dealt */
  hurt(info: DamageInfo): number {
    return this.world.combat.applyDamage(this, info);
  }

  /** called by combat when hp <= 0 */
  die(info: DamageInfo) {
    this.dead = true;
    this.onDeath(info);
  }
  onDeath(_info: DamageInfo) {}
  /** called on every damaging hit after hp change */
  onHurt(_info: DamageInfo, _dealt: number) {}

  get speedMul() {
    let m = 1;
    if (this.st.slow > 0) m *= 1 - this.st.slowAmt;
    return m;
  }
}
