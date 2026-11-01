// One run (a climb of the tower), split for co-op (PLAN2 §1.5, GDD2 §5.8):
//   Run      — shared: floor progress, the brass purse, shards, stats, history, lore, flags
//   Loadout  — one per player: hp, sand, mods, memories, hourglass, parts, calibrations, weapon …
// Solo play has exactly one Loadout (slot I), so 1.0 behaves as before.
import { RNG } from '../engine/rng';
import type { World } from './world/world';
import type { Player } from './entities/player';
import type { BusEvents } from './systems/bus';
import type { DeviceId } from '../engine/input';
import { Recorder } from './systems/rewind';
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
  // ── Rewind 2.0 (PLAN2 §1.10, GDD2 §3.12) ──
  /** tape length, s (hands: second 3, minute 5, alarm 2.5); 1.0's rewindWindow bonuses add to it */
  tapeLen: number;
  /** rewind cost = clamp(round(rewindCostPerSec × seconds), rewindMinCost, 100) × sandPerCharge / 100 */
  rewindCostPerSec: number;
  rewindMinCost: number;
  /** a press released sooner than this is a tap (s) */
  rewindTapThreshold: number;
  /** the first scrub each room that goes back at most this many seconds is free (0 = none) */
  scrubFreeFirst: number;
  /** the longest a scrub can be held before it confirms itself (real s) */
  scrubMax: number;
  /** Perfect Rewind: an attack that would have hit within this long after the press (s) */
  perfectWindow: number;
  /** Culprit mark: seconds / echo damage bonus against it */
  culpritT: number;
  culpritBonus: number;
  /** invulnerability after a rewind lands (s; 1.0's rewindInvuln still counts if longer) */
  landInvuln: number;
  /** Sand cap on top of 100 per hourglass */
  sandMaxBonus: number;
  /** catch-all switches for escapements and new parts (e.g. flags.transposition = 1) */
  flags: Record<string, number>;
}

export const BASE_MODS: Mods = {
  maxHp: 50, moveSpeed: 96, dashCharges: 2, dashCd: 0.55, dashDist: 58, dashInvuln: 0.22,
  rewindCharges: 2, sandPerCharge: 100, sandGain: 1, rewindWindow: 3, echoDmg: 0.6, maxEchoes: 3, echoSpeed: 1, echoSand: 0,
  paradoxDmg: 40, paradoxRadius: 44, paradoxKeepsEcho: 0, rewindInvuln: 0.4, noRewindHeal: 0, mirrorEcho: 0,
  dmg: 1, freshDmg: 0, atkSpeed: 1, critChance: 0.05, critMult: 2, specialDmg: 1, specialCd: 1, knockMul: 1, wallSlam: 0,
  burnMul: 1, burnMax: 10, rustPower: 1, corrodeMul: 1, stasisMul: 1, resonanceMax: 3, resonanceDmg: 1,
  constructDmg: 1, constructDur: 1, constructRate: 1,
  healMul: 1, brassMul: 1, shopMul: 1, extraChoice: 0, armor: 0, autoRewindPerFloor: 0, firstHitShield: 0, revives: 0,
  tapeLen: 3, rewindCostPerSec: 33.4, rewindMinCost: 25, rewindTapThreshold: 0.18, scrubFreeFirst: 0, scrubMax: 1.2,
  perfectWindow: 0.2, culpritT: 4, culpritBonus: 0.5, landInvuln: 0.5, sandMaxBonus: 0, flags: {},
};

/** Sand per hourglass (GDD2 §3.3: the cap is 100 × hourglasses) */
export const SAND_PER_GLASS = 100;

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
  /**
   * the Sand pool (GDD2 §3.3): 0..sandMax (100 × hourglasses + bonus). Full at the start of a run
   * and of every floor; rewinds cost 25–100, a Fork 50.
   */
  sand = 0;
  /** the floor this pool was last refilled on (Player.added refills it on a new floor) */
  sandFloor = -1;
  /** counts gains thrown away at a full pool (the HUD flashes "full" when it changes) */
  sandOverflow = 0;
  mods: Mods = { ...BASE_MODS, flags: {} };
  memories: OwnedMemory[] = [];
  hourglass: string[] = [];
  parts: string[] = [];
  calibrations: string[] = [];
  keystone: string | null = null;
  pact: Patron[] = [];
  rerolls = 0;
  banishes = 0;
  locks = 0;
  /** the rewind tape (systems/rewind.ts), kept across rooms; Player.rec */
  tape: Recorder | null = null;
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
  /** joined mid-run: memory picks still owed (one per floor already climbed, GDD2 §5.1) */
  catchup = 0;
  /** fired when the pool fills another hourglass (every 100 Sand) */
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
    this.sand = this.sandMax;
    this.sandFloor = run.floor;
  }

  /** rebuild Mods from base + hand + run meta + own bonuses + memories + hourglass + parts + calibrations */
  recompute() {
    const prevMax = this.mods.maxHp;
    const prevSand = this.sandMax;
    const m: Mods = { ...BASE_MODS, flags: {} };
    m.tapeLen = this.hand.tape ?? BASE_MODS.tapeLen;
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
    // 1.0's "rewind window +x s" items lengthen the tape; rewindWindow stays readable as its length
    m.tapeLen = Math.max(0.5, m.tapeLen + (m.rewindWindow - BASE_MODS.rewindWindow));
    m.rewindWindow = m.tapeLen;
    this.mods = m;
    // gaining max HP also heals that amount
    if (this.hp !== undefined && m.maxHp > prevMax && prevMax > 0) this.hp += m.maxHp - prevMax;
    if (this.hp > m.maxHp) this.hp = m.maxHp;
    // a new hourglass arrives full; a smaller cap spills the excess
    const max = this.sandMax;
    if (prevSand > 0 && max > prevSand) this.sand += max - prevSand;
    if (this.sand > max) this.sand = max;
    this.tape?.setWindow(m.tapeLen);
  }

  /** a hook context bound to this player in world w; bus handlers are owned by `owner` (for bus.off) */
  ctx(w: World, p: Player, owner: unknown): HookCtx {
    return {
      w, run: this.run, lo: this, p,
      on: (k, fn) => w.bus.on(k, fn, owner),
      // a ghost hand's 1-damage taps are not its build's hits / kills (no bell every 12 taps)
      onMine: (k, fn) => w.bus.on(k, (e) => { if ((e as { player?: Player }).player === p && p.state !== 'ghost') fn(e); }, owner),
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

  /** gain Sand (scaled by sandGain); what does not fit is thrown away (the HUD flashes "full") */
  addSand(n: number) {
    if (!(n > 0)) return;
    const max = this.sandMax;
    const before = this.sand;
    const want = before + n * this.mods.sandGain;
    if (want > max && before >= max - 0.001) this.sandOverflow++;
    this.sand = Math.min(max, want);
    if (Math.floor(this.sand / SAND_PER_GLASS) > Math.floor(before / SAND_PER_GLASS)) this.onCharge?.();
  }

  /** Sand cap: 100 per hourglass (mods.rewindCharges, base 2) + bonus */
  get sandMax() { return Math.max(SAND_PER_GLASS, Math.round(this.mods.rewindCharges * SAND_PER_GLASS + this.mods.sandMaxBonus)); }
  /** 1.0 name of the pool */
  get sandTotal() { return this.sand; }
  /** pay n Sand; false (and nothing paid) if short */
  spendSand(n: number): boolean {
    if (this.sand + 1e-6 < n) return false;
    this.sand = Math.max(0, this.sand - n);
    return true;
  }
  get sandFrac() { return this.sand / this.sandMax; }
  /**
   * 1.0 compatibility: "rewind charges" are full hourglasses. Reading gives the full ones; setting
   * n fills the pool to n hourglasses (events and the workshop use it to top the pool up).
   */
  get charges() { return Math.floor(this.sand / SAND_PER_GLASS); }
  set charges(n: number) { this.sand = Math.max(0, Math.min(this.sandMax, n * SAND_PER_GLASS)); }

  has(id: string) { return this.memories.some((m) => m.id === id) || this.parts.includes(id) || this.hourglass.includes(id) || this.calibrations.includes(id); }
}

/** per-floor state of the floor plan (kinds = rooms of each type entered this floor) */
export interface FloorState { shop: boolean; elites: number; vault: boolean; kinds: Record<string, number> }

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
  floorState: FloorState = { shop: false, elites: 0, vault: false, kinds: {} };
  /** this run's scratch flags (eggs, multi-floor events) */
  flags: Record<string, number> = {};
  /** GameHooks.onRunStart has fired for this run */
  started = false;
  overwind = 0;
  /** meta rarity boost for memory rolls (copied into each new loadout) */
  luck = 0;
  /** meta: rerolls each new loadout starts with */
  startRerolls = 0;
  /** meta (1.0 mainspring node): new loadouts start with full rewind charges — every pool starts full in 2.0 */
  startFullSand = false;

  constructor(seedOrConfig: number | RunConfig = (Math.random() * 2 ** 31) | 0) {
    this.config = typeof seedOrConfig === 'number' ? defaultRunConfig(seedOrConfig) : seedOrConfig;
    this.seed = this.config.seed;
    this.rng = new RNG(this.seed);
    for (const pc of this.config.players) this.lo(pc.slot);
  }

  /** slots whose hand left mid-run (their build is kept for a rejoin, but they do not count) */
  away = new Set<number>();
  /** seated hands in this run (a hand that left does not count: echo cap, offers, door weights) */
  get playerCount() { let n = 0; for (const l of this.loadouts) if (l && !this.away.has(l.slot)) n++; return Math.max(1, n); }
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
      l.sand = l.sandMax;
      // a hand joining a run already under way catches up with a memory pick per floor climbed
      if (this.started) l.catchup = this.floor;
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
