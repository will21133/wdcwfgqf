// One run (a climb of the tower): inventory, stats, currencies, floor progress.
import { RNG } from '../engine/rng';
import type { World } from './world/world';
import type { Player } from './entities/player';
import { MEMORIES, type HookCtx } from './progression/memories';
import { HOURGLASS_BY_ID } from './progression/hourglass';
import { PARTS_BY_ID } from './progression/parts';
import { CAL_BY_ID } from './progression/calibrations';

export interface Mods {
  maxHp: number;
  moveSpeed: number;
  dashCharges: number;
  dashCd: number;
  dashDist: number;
  dashInvuln: number;
  rewindCharges: number;
  sandPerCharge: number;
  sandGain: number;
  rewindWindow: number;
  echoDmg: number;
  maxEchoes: number;
  echoSpeed: number;
  echoSand: number;
  paradoxDmg: number;
  paradoxRadius: number;
  paradoxKeepsEcho: number;
  rewindInvuln: number;
  noRewindHeal: number;
  mirrorEcho: number;
  dmg: number;
  freshDmg: number;
  atkSpeed: number;
  critChance: number;
  critMult: number;
  specialDmg: number;
  specialCd: number;
  knockMul: number;
  wallSlam: number;
  burnMul: number;
  burnMax: number;
  rustPower: number;
  corrodeMul: number;
  stasisMul: number;
  resonanceMax: number;
  resonanceDmg: number;
  constructDmg: number;
  constructDur: number;
  constructRate: number;
  healMul: number;
  brassMul: number;
  shopMul: number;
  extraChoice: number;
  /** fraction of damage prevented */
  armor: number;
  autoRewindPerFloor: number;
  firstHitShield: number;
  revives: number;
}

export const BASE_MODS: Mods = {
  maxHp: 50, moveSpeed: 96, dashCharges: 2, dashCd: 0.55, dashDist: 58, dashInvuln: 0.22,
  rewindCharges: 2, sandPerCharge: 100, sandGain: 1, rewindWindow: 3, echoDmg: 0.6, maxEchoes: 3, echoSpeed: 1, echoSand: 0,
  paradoxDmg: 40, paradoxRadius: 44, paradoxKeepsEcho: 0, rewindInvuln: 0.4, noRewindHeal: 0, mirrorEcho: 0,
  dmg: 1, freshDmg: 0, atkSpeed: 1, critChance: 0.05, critMult: 2, specialDmg: 1, specialCd: 1, knockMul: 1, wallSlam: 0,
  burnMul: 1, burnMax: 10, rustPower: 1, corrodeMul: 1, stasisMul: 1, resonanceMax: 3, resonanceDmg: 1,
  constructDmg: 1, constructDur: 1, constructRate: 1,
  healMul: 1, brassMul: 1, shopMul: 1, extraChoice: 0, armor: 0, autoRewindPerFloor: 0, firstHitShield: 0, revives: 0,
};

export interface OwnedMemory { id: string; rarity: number }
export type RunEndKind = 'death' | 'quit' | 'victory';

/** Meta (between-runs) bonuses applied at run start — filled by the save/meta system */
export interface MetaBonus { apply(m: Mods): void }

export class Run {
  rng: RNG;
  seed: number;
  floor = 0;
  roomIndex = 0;
  hp: number;
  brass = 0;
  shards = 0;
  sand = 0;
  charges: number;
  weapon = 'rapier';
  mods: Mods = { ...BASE_MODS };
  time = 0;
  memories: OwnedMemory[] = [];
  hourglass: string[] = [];
  parts: string[] = [];
  calibrations: string[] = [];
  /** per-floor counters */
  autoRewindLeft = 0;
  /** per-room counters */
  shieldReady = false;
  bonuses: MetaBonus[] = [];
  /** run statistics for the end screen */
  stats = { kills: 0, damage: 0, rewinds: 0, paradoxes: 0, rooms: 0, time: 0, hitsTaken: 0 };
  /** room history for floor plan */
  history: string[] = [];
  /** lore entries found this run (saved to the ledger) */
  lore: string[] = [];
  eventsSeen: string[] = [];
  /** per-floor flags for the floor plan */
  floorState = { shop: false, elites: 0, vault: false };
  overwind = 0;
  revivesUsed = 0;
  rerolls = 0;
  /** rarity boost for memory rolls */
  luck = 0;
  onCharge?: () => void;
  /** live hook context of the current room (set by GameScene) */
  hookCtx: HookCtx | null = null;

  constructor(seed = (Math.random() * 2 ** 31) | 0) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.recompute();
    this.hp = this.mods.maxHp;
    this.charges = 1;
  }

  /** rebuild Mods from base + meta + memories + hourglass + parts + calibrations */
  recompute() {
    const prevMax = this.mods.maxHp;
    const m: Mods = { ...BASE_MODS };
    for (const b of this.bonuses) b.apply(m);
    for (const om of this.memories) { const d = MEMORIES[om.id]; d?.mods?.(m, d.v[om.rarity]); }
    for (const id of this.hourglass) HOURGLASS_BY_ID[id]?.mods?.(m);
    for (const id of this.parts) PARTS_BY_ID[id]?.mods?.(m);
    for (const id of this.calibrations) CAL_BY_ID[id]?.mods?.(m);
    m.maxHp = Math.max(10, Math.round(m.maxHp));
    m.armor = Math.min(0.6, m.armor);
    this.mods = m;
    // gaining max HP also heals that amount
    if (this.hp !== undefined && m.maxHp > prevMax && prevMax > 0) this.hp += m.maxHp - prevMax;
    if (this.hp > m.maxHp) this.hp = m.maxHp;
    if (this.charges > m.rewindCharges) this.charges = m.rewindCharges;
  }

  /** register all inventory hooks on a world's event bus (called per room) */
  registerHooks(w: World, p: Player) {
    const mk = (owner: unknown): HookCtx => ({ w, run: this, p, on: (k, fn) => w.bus.on(k, fn, owner) });
    this.hookCtx = mk(this);
    for (const om of this.memories) { const d = MEMORIES[om.id]; d?.hook?.(mk(om), d.v[om.rarity]); }
    for (const id of this.hourglass) HOURGLASS_BY_ID[id]?.hook?.(mk(id));
    for (const id of this.parts) PARTS_BY_ID[id]?.hook?.(mk(id));
    for (const id of this.calibrations) CAL_BY_ID[id]?.hook?.(mk(id));
  }

  addSand(n: number) {
    const m = this.mods;
    if (this.charges >= m.rewindCharges) { this.sand = 0; return; }
    this.sand += n * m.sandGain;
    while (this.sand >= m.sandPerCharge && this.charges < m.rewindCharges) {
      this.sand -= m.sandPerCharge;
      this.charges++;
      this.onCharge?.();
    }
    if (this.charges >= m.rewindCharges) this.sand = 0;
  }

  get sandFrac() { return this.charges >= this.mods.rewindCharges ? 1 : this.sand / this.mods.sandPerCharge; }

  has(id: string) { return this.memories.some((m) => m.id === id) || this.parts.includes(id) || this.hourglass.includes(id) || this.calibrations.includes(id); }
}

