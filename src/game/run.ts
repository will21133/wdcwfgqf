// One run (a climb of the tower): inventory, stats, currencies.
import { RNG } from '../engine/rng';

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
  paradoxDmg: number;
  paradoxRadius: number;
  paradoxKeepsEcho: number;
  rewindInvuln: number;
  dmg: number;
  atkSpeed: number;
  critChance: number;
  critMult: number;
  specialDmg: number;
  specialCd: number;
  burnMul: number;
  burnMax: number;
  rustPower: number;
  corrodeMul: number;
  stasisMul: number;
  resonanceMax: number;
  resonanceDmg: number;
  healMul: number;
  brassMul: number;
  /** % damage reduction */
  armor: number;
  /** last-second rewind on lethal damage (charges per floor) */
  autoRewind: number;
  revives: number;
}

export const BASE_MODS: Mods = {
  maxHp: 50, moveSpeed: 96, dashCharges: 2, dashCd: 0.55, dashDist: 58, dashInvuln: 0.22,
  rewindCharges: 2, sandPerCharge: 100, sandGain: 1, rewindWindow: 3, echoDmg: 0.6, maxEchoes: 3, echoSpeed: 1,
  paradoxDmg: 40, paradoxRadius: 44, paradoxKeepsEcho: 0, rewindInvuln: 0.4,
  dmg: 1, atkSpeed: 1, critChance: 0.05, critMult: 2, specialDmg: 1, specialCd: 1,
  burnMul: 1, burnMax: 10, rustPower: 1, corrodeMul: 1, stasisMul: 1, resonanceMax: 3, resonanceDmg: 1,
  healMul: 1, brassMul: 1, armor: 0, autoRewind: 0, revives: 0,
};

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
  /** memories / parts / calibrations owned (ids with levels) */
  memories: { id: string; level: number; rarity: number }[] = [];
  parts: string[] = [];
  calibrations: string[] = [];
  onChange?: () => void;

  constructor(seed = (Math.random() * 2 ** 31) | 0) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.recompute();
    this.hp = this.mods.maxHp;
    this.charges = 1;
  }

  recompute() {
    const m: Mods = { ...BASE_MODS };
    // later: meta upgrades, memories, parts, calibrations apply here
    this.mods = m;
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
  onCharge?: () => void;

  get sandFrac() { return this.charges >= this.mods.rewindCharges ? 1 : this.sand / this.mods.sandPerCharge; }
}
