// Persistent profile (save v2, PLAN2 §1.11): meta currency, mainspring, unlocks, ledger, story
// progress, and the shared registries (achievements, chimes, flags, stats, secrets, terms, notes).
// A 1.0 profile is migrated on first load: spent Mainspring shards are refunded, everything the
// player earned is kept, and the v1 key is left untouched as a backup.
import type { Mods } from './run';
import type { Patron } from './progression/memories';
import { L, L10n } from './i18n';
import { RealClock } from './clock';

const KEY = 'secondhand.profile.v2';
const KEY_V1 = 'secondhand.profile.v1';

export interface Profile {
  version: 2;
  shards: number;
  totalShards: number;
  /** mainspring node levels (1.0 tree until P6 replaces it with the 36-node dial) */
  nodes: Record<string, number>;
  weapons: string[];
  weapon: string;
  seen: { enemies: string[]; memories: string[]; parts: string[]; events: string[]; bosses: string[] };
  lore: string[];
  runs: number;
  wins: number;
  deaths: number;
  bestFloor: number;
  bestTime: number;
  /** dialogue progress with Ines */
  ines: number;
  introSeen: boolean;
  tutorialDone: boolean;
  /** 1.0 overwind lever (replaced by contracts in 2.0) */
  overwind: number;
  maxOverwind: number;
  // ── v2 ──
  achievements: string[];
  secrets: string[];
  flags: Record<string, number>;
  unlocks: string[];
  chimes: string[];
  cosmetics: { owned: string[]; equipped: Record<string, string> };
  /** Ines's notes already shown */
  hints: string[];
  /** lifetime counters: rewindFrames, damage, deaths, catPets, tickDodges ... */
  stats: Record<string, number>;
  mastery: Record<string, { xp: number; lv: number }>;
  affinity: Partial<Record<Patron, number>>;
  rescued: Patron[];
  contracts: Record<string, number>;
  /** 2.0 mainspring dial nodes */
  clockNodes: string[];
  /** Date.now() of the last session (egg #10 "long absence") */
  lastSeen: number;
  deathTapes: { floor: number; frames: string }[];
  prologueDone: boolean;
  daily: Record<string, number>;
  /** how many times each term's plain line has been shown (GDD2 §9.8) */
  termSeen: Record<string, number>;
  /** progressive disclosure: concepts the player has been taught */
  taught: string[];
  /** set once when a 1.0 profile was migrated, so the workshop can mention the refund */
  migration: { from: 1; refund: number; nodes: Record<string, number> } | null;
}

export const fresh = (): Profile => ({
  version: 2,
  shards: 0, totalShards: 0, nodes: {}, weapons: ['rapier'], weapon: 'rapier',
  seen: { enemies: [], memories: [], parts: [], events: [], bosses: [] }, lore: [],
  runs: 0, wins: 0, deaths: 0, bestFloor: 0, bestTime: 0, ines: 0, introSeen: false, tutorialDone: false,
  overwind: 0, maxOverwind: 0,
  achievements: [], secrets: [], flags: {}, unlocks: [], chimes: [], cosmetics: { owned: [], equipped: {} },
  hints: [], stats: {}, mastery: {}, affinity: {}, rescued: [], contracts: {}, clockNodes: [],
  lastSeen: 0, deathTapes: [], prologueDone: false, daily: {}, termSeen: {}, taught: [], migration: null,
});

export let profile: Profile = fresh();
/** this session: lastSeen from the previous session (0 on a new profile) */
export const session = { prevLastSeen: 0 };

/** 1.0 Mainspring costs per level, frozen here so migration keeps working after P6 rebuilds NODES */
export const V1_NODE_COSTS: Record<string, number[]> = {
  hp: [12, 25, 45], dmg: [20, 40, 70], brass: [10, 25], sand: [20], charge: [60], dash: [35],
  echo: [30, 60], window: [45], reroll: [40, 80], choice: [90], revive: [100], luck: [50],
  w_maul: [30], w_bow: [50], w_chakram: [70],
};
/** 1.0 weapon-unlock nodes: the weapons are kept, so these are not refunded */
const V1_WEAPON_NODES = new Set(['w_maul', 'w_bow', 'w_chakram']);

const arr = <T>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d);
const obj = <T extends object>(v: unknown, d: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : d);

/** fill any missing / malformed v2 fields from fresh() */
function normalize(raw: any): Profile {
  const f = fresh();
  const p = { ...f, ...obj(raw, {}) } as Profile;
  p.version = 2;
  p.seen = { ...f.seen, ...obj(raw?.seen, {}) };
  for (const k of Object.keys(f.seen) as (keyof Profile['seen'])[]) p.seen[k] = arr(p.seen[k], []);
  p.nodes = obj(p.nodes, {});
  p.weapons = arr(p.weapons, f.weapons);
  if (!p.weapons.includes('rapier')) p.weapons.unshift('rapier');
  for (const k of ['lore', 'achievements', 'secrets', 'unlocks', 'chimes', 'hints', 'rescued', 'clockNodes', 'deathTapes', 'taught'] as const) (p as any)[k] = arr((p as any)[k], []);
  for (const k of ['flags', 'stats', 'mastery', 'affinity', 'contracts', 'daily', 'termSeen'] as const) (p as any)[k] = obj((p as any)[k], {});
  p.cosmetics = { owned: arr(p.cosmetics?.owned, []), equipped: obj(p.cosmetics?.equipped, {}) };
  if (p.deathTapes.length > 5) p.deathTapes = p.deathTapes.slice(-5);
  return p;
}

/** sum of shards spent on 1.0 Mainspring nodes (weapon unlocks excluded) */
export function v1Refund(nodes: Record<string, number>): number {
  let n = 0;
  for (const [id, lv] of Object.entries(nodes ?? {})) {
    if (V1_WEAPON_NODES.has(id)) continue;
    const c = V1_NODE_COSTS[id];
    if (!c) continue;
    for (let i = 0; i < Math.min(lv, c.length); i++) n += c[i];
  }
  return n;
}

/** 1.0 → 2.0: refund spent shards, keep weapons, counters, ledger, lore and story progress */
export function migrateV1(v1: any): Profile {
  const old = obj(v1, {} as any);
  const p = normalize({});
  const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const oldNodes: Record<string, number> = obj(old.nodes, {});
  const refund = v1Refund(oldNodes);
  p.shards = num(old.shards) + refund;
  p.totalShards = num(old.totalShards);
  // weapon unlock nodes stay bought (their weapons are kept); every other node is refunded
  p.nodes = {};
  for (const id of V1_WEAPON_NODES) if (oldNodes[id]) p.nodes[id] = oldNodes[id];
  p.weapons = arr(old.weapons, ['rapier']).filter((w) => typeof w === 'string');
  if (!p.weapons.includes('rapier')) p.weapons.unshift('rapier');
  p.weapon = typeof old.weapon === 'string' && p.weapons.includes(old.weapon) ? old.weapon : 'rapier';
  const seen = obj(old.seen, {} as any);
  for (const k of Object.keys(p.seen) as (keyof Profile['seen'])[]) p.seen[k] = arr(seen[k], []);
  p.lore = arr(old.lore, []);
  for (const k of ['runs', 'wins', 'deaths', 'bestFloor', 'bestTime', 'ines', 'overwind', 'maxOverwind'] as const) (p as any)[k] = num(old[k]);
  p.introSeen = !!old.introSeen;
  p.tutorialDone = !!old.tutorialDone;
  p.stats = { deaths: p.deaths, runs: p.runs, wins: p.wins };
  if (p.wins >= 1) p.unlocks.push('contracts');
  p.migration = { from: 1, refund, nodes: oldNodes };
  return p;
}

export function loadProfile() {
  readProfile();
  session.prevLastSeen = profile.lastSeen;
}
function readProfile() {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (raw) {
    try { profile = normalize(JSON.parse(raw)); return; } catch {
      // keep the unreadable save aside instead of silently overwriting it
      try { localStorage.setItem(KEY + '.corrupt', raw); } catch { /* ignore */ }
      profile = fresh();
      return;
    }
  }
  let v1: string | null = null;
  try { v1 = localStorage.getItem(KEY_V1); } catch { /* ignore */ }
  if (v1) {
    try { profile = migrateV1(JSON.parse(v1)); saveProfile(); return; } catch { /* fall through */ }
  }
  profile = fresh();
}
export function saveProfile() {
  profile.lastSeen = RealClock.now().getTime();
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}
export function resetProfile() { profile = fresh(); saveProfile(); }

export function markSeen(kind: keyof Profile['seen'], id: string) {
  const l = profile.seen[kind];
  if (!l.includes(id)) l.push(id);
}

// ───────────────────────── Mainspring (meta upgrades) ─────────────────────────
export interface NodeDef {
  id: string;
  name: L10n;
  desc: (lv: number) => L10n;
  costs: number[];
  apply?: (m: Mods, lv: number) => void;
  /** grid position in the workbench UI */
  col: number; row: number;
  requires?: string;
  unlockWeapon?: string;
}

export const NODES: NodeDef[] = [
  { id: 'hp', col: 0, row: 0, name: L('坚韧发条', 'Sturdy Spring'), costs: [12, 25, 45], desc: (lv) => L(`最大生命 +{y:${10 * lv}}。`, `Max HP +{y:${10 * lv}}.`), apply: (m, lv) => { m.maxHp += 10 * lv; } },
  { id: 'dmg', col: 1, row: 0, name: L('磨利秒针', 'Honed Hand'), costs: [20, 40, 70], desc: (lv) => L(`伤害 +{g:${8 * lv}%}。`, `Damage +{g:${8 * lv}%}.`), apply: (m, lv) => { m.dmg += 0.08 * lv; } },
  { id: 'brass', col: 2, row: 0, name: L('黄铜钱袋', 'Brass Purse'), costs: [10, 25], desc: (lv) => L(`开局获得 {g:${40 * lv}} 黄铜。`, `Start each run with {g:${40 * lv}} Brass.`) },
  { id: 'sand', col: 0, row: 1, requires: 'hp', name: L('满沙出发', 'Full Hourglass'), costs: [20], desc: () => L('每局开始时回溯充能全满。', 'Start each run with full rewind charges.') },
  { id: 'charge', col: 1, row: 1, requires: 'dmg', name: L('第三粒沙', 'A Third Grain'), costs: [60], desc: (lv) => L(`回溯充能上限 +{c:${lv}}。`, `Rewind charges +{c:${lv}}.`), apply: (m, lv) => { m.rewindCharges += lv; } },
  { id: 'dash', col: 2, row: 1, requires: 'brass', name: L('轻盈的脚步', 'Light Feet'), costs: [35], desc: () => L('冲刺次数 +{g:1}。', '+{g:1} dash charge.'), apply: (m, lv) => { m.dashCharges += lv; } },
  { id: 'echo', col: 0, row: 2, requires: 'sand', name: L('清晰的过去', 'A Clearer Past'), costs: [30, 60], desc: (lv) => L(`{c:残响}伤害 +{g:${15 * lv}%}。`, `{c:Echo} damage +{g:${15 * lv}%}.`), apply: (m, lv) => { m.echoDmg += 0.15 * lv; } },
  { id: 'window', col: 1, row: 2, requires: 'charge', name: L('更长的三秒', 'A Longer Three Seconds'), costs: [45], desc: () => L('回溯窗口 +{g:0.5} 秒。', 'Rewind window +{g:0.5}s.'), apply: (m) => { m.rewindWindow += 0.5; } },
  { id: 'reroll', col: 2, row: 2, requires: 'dash', name: L('再想想', 'Second Thoughts'), costs: [40, 80], desc: (lv) => L(`每局可重新抽取选项 {g:${lv}} 次。`, `Reroll reward choices {g:${lv}} time(s) per run.`) },
  { id: 'choice', col: 1, row: 3, requires: 'window', name: L('回忆之光', 'Light of Memory'), costs: [90], desc: () => L('选择回忆时多一个选项。', 'One extra option when choosing Memories.'), apply: (m) => { m.extraChoice += 1; } },
  { id: 'revive', col: 0, row: 3, requires: 'echo', name: L('第二根发条', 'Second Mainspring'), costs: [100], desc: () => L('每局一次：停摆时以 40% 生命重新启动。', 'Once per run: when you stop, restart with 40% HP.'), apply: (m) => { m.revives += 1; } },
  { id: 'luck', col: 2, row: 3, requires: 'reroll', name: L('幸运齿轮', 'Lucky Cog'), costs: [50], desc: () => L('回忆的稀有度更高。', 'Memories roll higher rarities.') },
  // weapons
  { id: 'w_maul', col: 4, row: 0, name: L('钟摆巨锤', 'Pendulum Maul'), costs: [30], unlockWeapon: 'maul', desc: () => L('解锁武器：沉重的摆锤，大范围击退。', 'Unlock weapon: a heavy pendulum with wide knockback.') },
  { id: 'w_bow', col: 4, row: 1, requires: 'w_maul', name: L('报时长弓', 'Chime Bow'), costs: [50], unlockWeapon: 'bow', desc: () => L('解锁武器：远程连射与蓄力穿透。', 'Unlock weapon: rapid shots and charged piercing arrows.') },
  { id: 'w_chakram', col: 4, row: 2, requires: 'w_bow', name: L('齿轮回旋镖', 'Gear Chakram'), costs: [70], unlockWeapon: 'chakram', desc: () => L('解锁武器：往返飞行的锯齿齿轮。', 'Unlock weapon: a returning sawtooth gear.') },
];
export const NODE_BY_ID: Record<string, NodeDef> = Object.fromEntries(NODES.map((n) => [n.id, n]));

export function nodeLevel(id: string) { return profile.nodes[id] ?? 0; }

export function metaBonus() {
  return { apply: (m: Mods) => { for (const n of NODES) { const lv = nodeLevel(n.id); if (lv && n.apply) n.apply(m, lv); } } };
}
