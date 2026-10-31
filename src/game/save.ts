// Persistent profile: meta currency, mainspring upgrades, unlocks, ledger (codex), story progress.
import type { Mods } from './run';
import { L, L10n } from './i18n';

const KEY = 'secondhand.profile.v1';

export interface Profile {
  shards: number;
  totalShards: number;
  /** mainspring node levels */
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
  overwind: number;
  maxOverwind: number;
  version: number;
}

export const fresh = (): Profile => ({
  shards: 0, totalShards: 0, nodes: {}, weapons: ['rapier'], weapon: 'rapier',
  seen: { enemies: [], memories: [], parts: [], events: [], bosses: [] }, lore: [],
  runs: 0, wins: 0, deaths: 0, bestFloor: 0, bestTime: 0, ines: 0, introSeen: false, tutorialDone: false,
  overwind: 0, maxOverwind: 0, version: 1,
});

export let profile: Profile = fresh();

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) profile = { ...fresh(), ...JSON.parse(raw) };
    profile.seen = { ...fresh().seen, ...profile.seen };
  } catch { profile = fresh(); }
}
export function saveProfile() {
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
