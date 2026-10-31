// One run (a climb of the tower), split for co-op (PLAN2 §1.5, GDD2 §5.8):
//   Run      — shared: floor progress, the brass purse, shards, stats, history, lore, flags
//   Loadout  — one per player: hp, sand, mods, memories, hourglass, parts, calibrations, weapon …
// Solo play has exactly one Loadout (slot I), so 1.0 behaves as before.
import { RNG } from '../engine/rng';
import type { World } from './world/world';
import type { Player } from './entities/player';
import type { BusEvents } from './systems/bus';
import type { DeviceId } from '../engine/input';
import type { Recording } from './systems/rewind';
import { MEMORIES, type HookCtx, type Patron } from './progression/memories';
import { HOURGLASS_BY_ID } from './progression/hourglass';
import { PARTS_BY_ID } from './progression/parts';
import { CAL_BY_ID } from './progression/calibrations';
import { handDef, type HandDef } from './progression/hands';
import { coopScale } from './world/coopScale';

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

export type RunMode = 'standard' | 'daily' | 'rush' | 'practice' | 'custom';
export interface RunPlayerConfig { slot: number; device: DeviceId; hand: string; weapon: string; aspect?: string; pact?: Patron[]; keystonePin?: string }
export interface RunConfig {
  mode: RunMode;
  seed: number;
  players: RunPlayerConfig[];
  contracts: Record<string, number>;
  seedText?: string;
}

/** a solo standard run on slot I (the 1.0 shape) */
export function defaultRunConfig(seed: number, weapon = 'rapier'): RunConfig {
  return { mode: 'standard', seed, players: [{ slot: 0, device: 'kbm', hand: 'tick', weapon }], contracts: {} };
}

// ───────────────────────── Loadout (one per player) ─────────────────────────
export class Loadout {
  slot: number;
  hand: HandDef;
  weapon: string;
  aspect: string | null = null;
  hp: number;
  /** sand toward the next rewind charge (1.0 economy; F3 moves to a single sand pool) */
  sand = 0;
  /** 1.0 rewind charges (F3 replaces with sand costs) */
  charges = 1;
  mods: Mods = { ...BASE_MODS };
  memories: OwnedMemory[] = [];
  hourglass: string[] = [];
  parts: string[] = [];
  calibrations: string[] = [];
  keystone: string | null = null;
  pact: Patron[] = [];
  rerolls = 0;
  banishes = 0;
  locks = 0;
  /** the rewind tape, kept across rooms (F3) */
  tape: Recording | null = null;
  tempo = 0;
  /** this player's own permanent bonuses (events: "drink the rain") on top of the run's meta bonuses */
  bonuses: MetaBonus[] = [];
  /** rarity boost for this player's memory rolls */
  luck = 0;
  /** per-floor counter (1.0 hg_lastsecond / old watch) */
  autoRewindLeft = 0;
  /** per-room: the wax seal is up */
  shieldReady = false;
  revivesUsed = 0;
  /** fired when a rewind charge fills */
  onCharge?: () => void;
  /** live hook context of the current room (set by registerHooks) */
  hookCtx: HookCtx | null = null;

  constructor(public run: Run, slot: number, cfg?: Partial<RunPlayerConfig>) {
    this.slot = slot;
    this.hand = handDef(cfg?.hand);
    this.weapon = cfg?.weapon ?? 'rapier';
    this.aspect = cfg?.aspect ?? null;
    this.pact = cfg?.pact?.slice() ?? [];
    this.recompute();
    this.hp = this.mods.maxHp;
  }

  /** rebuild Mods from base + hand + run meta + own bonuses + memories + hourglass + parts + calibrations */
  recompute() {
    const prevMax = this.mods.maxHp;
    const m: Mods = { ...BASE_MODS };
    this.hand.mods?.(m);
    for (const b of this.run.bonuses) b.apply(m);
    for (const b of this.bonuses) b.apply(m);
    for (const om of this.memories) { const d = MEMORIES[om.id]; d?.mods?.(m, d.v[om.rarity]); }
    for (const id of this.hourglass) HOURGLASS_BY_ID[id]?.mods?.(m);
    for (const id of this.parts) PARTS_BY_ID[id]?.mods?.(m);
    for (const id of this.calibrations) CAL_BY_ID[id]?.mods?.(m);
    m.maxHp = Math.max(10, Math.round(m.maxHp));
    m.armor = Math.min(0.6, m.armor);
    // GDD2 §5.8: three or four hands keep one echo fewer each (3 / 3 / 2 / 2)
    m.maxEchoes = Math.max(1, m.maxEchoes - (3 - coopScale(this.run.playerCount).echoCap));
    this.mods = m;
    // gaining max HP also heals that amount
    if (this.hp !== undefined && m.maxHp > prevMax && prevMax > 0) this.hp += m.maxHp - prevMax;
    if (this.hp > m.maxHp) this.hp = m.maxHp;
    if (this.charges > m.rewindCharges) this.charges = m.rewindCharges;
  }

  /** a hook context bound to this player in world w; bus handlers are owned by `owner` (for bus.off) */
  ctx(w: World, p: Player, owner: unknown): HookCtx {
    return {
      w, run: this.run, lo: this, p,
      on: (k, fn) => w.bus.on(k, fn, owner),
      onMine: (k, fn) => w.bus.on(k, (e) => { if ((e as { player?: Player }).player === p) fn(e); }, owner),
    };
  }
  /** hook context for content granted mid-room (memory picked, part bought …) */
  liveCtx(owner: unknown): HookCtx | null {
    const c = this.hookCtx;
    return c ? this.ctx(c.w, c.p, owner) : null;
  }
  /** bus owner key for a string-id item (two players may own the same part) */
  key(id: string) { return `lo${this.slot}:${id}`; }

  /** register all of this player's inventory hooks on a world's event bus (called per room) */
  registerHooks(w: World, p: Player) {
    this.hookCtx = this.ctx(w, p, this);
    for (const om of this.memories) { const d = MEMORIES[om.id]; d?.hook?.(this.ctx(w, p, om), d.v[om.rarity]); }
    for (const id of this.hourglass) HOURGLASS_BY_ID[id]?.hook?.(this.ctx(w, p, this.key(id)));
    for (const id of this.parts) PARTS_BY_ID[id]?.hook?.(this.ctx(w, p, this.key(id)));
    for (const id of this.calibrations) CAL_BY_ID[id]?.hook?.(this.ctx(w, p, this.key(id)));
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

  /** total sand held (charges count as full measures) */
  get sandTotal() { return this.charges * this.mods.sandPerCharge + this.sand; }
  get sandMax() { return this.mods.rewindCharges * this.mods.sandPerCharge; }
  /** pay n sand from charges + the filling measure; false (and nothing paid) if short */
  spendSand(n: number): boolean {
    const per = this.mods.sandPerCharge;
    let total = this.sandTotal;
    if (total < n) return false;
    total -= n;
    this.charges = Math.floor(total / per);
    this.sand = total - this.charges * per;
    return true;
  }

  get sandFrac() { return this.charges >= this.mods.rewindCharges ? 1 : this.sand / this.mods.sandPerCharge; }

  has(id: string) { return this.memories.some((m) => m.id === id) || this.parts.includes(id) || this.hourglass.includes(id) || this.calibrations.includes(id); }
}

// ───────────────────────── Run (shared) ─────────────────────────
export class Run {
  config: RunConfig;
  rng: RNG;
  seed: number;
  floor = 0;
  roomIndex = 0;
  /** shared purse (GDD2 §5.8) */
  brass = 0;
  shards = 0;
  time = 0;
  /** meta (mainspring) bonuses — they apply to every hand */
  bonuses: MetaBonus[] = [];
  /** one per seated player, indexed by slot (created on demand) */
  loadouts: Loadout[] = [];
  /** run statistics for the end screen */
  stats = { kills: 0, damage: 0, rewinds: 0, paradoxes: 0, rooms: 0, time: 0, hitsTaken: 0 };
  /** room history for floor plan */
  history: string[] = [];
  /** lore entries found this run (saved to the ledger) */
  lore: string[] = [];
  eventsSeen: string[] = [];
  /** per-floor flags for the floor plan */
  floorState = { shop: false, elites: 0, vault: false };
  /** this run's scratch flags (eggs, multi-floor events) */
  flags: Record<string, number> = {};
  overwind = 0;
  /** meta rarity boost for memory rolls (copied into each new loadout) */
  luck = 0;
  /** meta: rerolls each new loadout starts with */
  startRerolls = 0;
  /** meta: new loadouts start with full rewind charges */
  startFullSand = false;

  constructor(seedOrConfig: number | RunConfig = (Math.random() * 2 ** 31) | 0) {
    this.config = typeof seedOrConfig === 'number' ? defaultRunConfig(seedOrConfig) : seedOrConfig;
    this.seed = this.config.seed;
    this.rng = new RNG(this.seed);
    for (const pc of this.config.players) this.lo(pc.slot);
  }

  /** seated hands in this run */
  get playerCount() { return Math.max(1, this.loadouts.filter(Boolean).length); }
  /** every loadout in slot order */
  get all(): Loadout[] { return this.loadouts.filter(Boolean); }

  /** this slot's loadout; a hand that joins mid-run starts with a fresh one */
  lo(slot: number): Loadout {
    let l = this.loadouts[slot];
    if (!l) {
      const cfg = this.config.players.find((p) => p.slot === slot);
      const base = this.config.players[0];
      l = this.loadouts[slot] = new Loadout(this, slot, cfg ?? { slot, hand: 'tick', weapon: base?.weapon ?? 'rapier' });
      l.luck = this.luck;
      l.rerolls = this.startRerolls;
      l.autoRewindLeft = l.mods.autoRewindPerFloor;
      if (this.startFullSand) l.charges = l.mods.rewindCharges;
      // the echo cap depends on how many hands there are
      for (const o of this.all) o.recompute();
    }
    return l;
  }

  /** rebuild every hand's Mods (after a run-wide bonus changes) */
  recompute() { for (const l of this.all) l.recompute(); }

  addBrass(n: number) { this.brass += n; }
  spendBrass(n: number): boolean {
    if (this.brass < n) return false;
    this.brass -= n;
    return true;
  }

  /** register every seated player's hooks for a room */
  registerHooks(w: World) {
    for (const p of w.players) this.lo(p.slot).registerHooks(w, p);
  }
}

export type { HookCtx, BusEvents };
