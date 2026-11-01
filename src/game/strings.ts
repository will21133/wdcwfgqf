// String tables and the term glossary (PLAN2 §1.2 / §1.2b, GDD2 §9.8).
//
// · Every package keeps its player-facing text in src/game/strings/<pkg>.ts and calls
//   registerStrings('<pkg>', {...}); code reads it back with S('<pkg>', 'key').
// · TERMS holds every stylised game term with a plain-language line (≤ 14 Han characters) that
//   the UI shows under the name until the player has seen it a few times (see registry Terms).
//
// This module only imports types from i18n.ts, so i18n.ts can re-export it without a cycle.
import type { L10n } from './i18n';

const l = (zh: string, en: string): L10n => ({ zh, en });
const isDev = (() => { try { return !!(import.meta as any).env?.DEV; } catch { return false; } })();
const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (!isDev || warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

// ───────────────────────── string tables ─────────────────────────
const tables = new Map<string, Record<string, L10n>>();

/** add (or extend) a namespace of bilingual strings */
export function registerStrings(ns: string, table: Record<string, L10n>): void {
  const t = tables.get(ns) ?? {};
  for (const [k, v] of Object.entries(table)) {
    if (isDev && (!v || typeof v.zh !== 'string' || typeof v.en !== 'string')) warnOnce(`${ns}.${k}:shape`, `[strings] ${ns}.${k} is not {zh, en}`);
    t[k] = v;
  }
  tables.set(ns, t);
}

/** look a string up; a missing key returns the key itself (and warns once in dev builds) */
export function S(ns: string, key: string): L10n {
  const v = tables.get(ns)?.[key];
  if (v) return v;
  warnOnce(`${ns}.${key}`, `[strings] missing ${ns}.${key}`);
  return { zh: key, en: key };
}

/** namespace → number of keys (debug route) */
export function stringCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [ns, t] of tables) out[ns] = Object.keys(t).length;
  return out;
}

// ───────────────────────── terms (GDD2 §9.8) ─────────────────────────
export interface TermDef {
  id: string;
  /** the stylised name, as it appears on cards, doors and the HUD */
  name: L10n;
  /** plain-language line: what it is and what it is for (≤ 14 Han characters) */
  plain: L10n;
  /** full explanation with numbers, for the Horologium and hint glossary links */
  detail?: L10n;
  icon?: string;
  /** listed in the Horologium (default true) */
  glossary?: boolean;
}

export const TERMS: Record<string, TermDef> = {};

const HAN = /[一-鿿]/g;

export function defineTerm(d: TermDef): void {
  if (isDev) {
    const n = (d.plain.zh.match(HAN) ?? []).length;
    if (n > 14) warnOnce(`term:${d.id}`, `[strings] term "${d.id}" plain line has ${n} Han characters (max 14)`);
    if (TERMS[d.id]) warnOnce(`term-dup:${d.id}`, `[strings] term "${d.id}" defined twice; the later one wins`);
  }
  TERMS[d.id] = { glossary: true, ...d };
}

export function term(id: string): TermDef | null {
  return TERMS[id] ?? null;
}

// Every row of GDD2 §9.8's table. Details follow GDD2 §3, §4, §5.5, §6, §10 (2.0 numbers).
const T = (id: string, name: L10n, plain: L10n, detail?: L10n, icon?: string) => defineTerm({ id, name, plain, detail, icon });

T('memory', l('回忆', 'Memory'), l('本局强化 · 死后消失', 'Run upgrade · lost on death'),
  l('守护者赐予的强化，装在攻击、特技、冲刺、回溯、残响等槽位上；每个槽位只能装一个，新的会替换旧的。本局结束（死亡或通关）后全部消失。',
    'A boon from a Patron, fitted to a slot (attack, special, dash, rewind, echo...). One per slot: a new one replaces the old. All Memories are lost when the run ends.'), 'memory');
T('duo', l('双人回忆', 'Duo Memory'), l('两位守护者合力的强化', 'Two Patrons combined'),
  l('同时拥有两位守护者的特定回忆后才会出现，效果更强。卡面会显示两位守护者的徽记。',
    'Appears only once you hold the right Memories from two Patrons. Stronger than either alone; the card shows both sigils.'), 'duo');
T('hourglass', l('沙漏强化', 'Hourglass'), l('强化回溯能力', 'Upgrades your rewind'),
  l('改变回溯、分岔与时砂的规则，例如更长的磁带、更便宜的回溯。本局有效。',
    'Changes how rewinding, forking and {c:Sand} work: a longer tape, cheaper rewinds and so on. Lasts for this run.'), 'hourglass');
T('part', l('零件', 'Part'), l('被动道具 · 本局有效', 'Passive item · this run'),
  l('拿到就生效的被动道具，没有槽位限制，可以同时带很多个。本局结束后消失。',
    'A passive item that works as soon as you pick it up. No slots: carry as many as you find. Lost when the run ends.'), 'part');
T('cracked', l('裂纹零件', 'Cracked Part'), l('有代价的强力道具', 'Strong item with a cost'),
  l('比普通零件更强，但附带一个负面效果。卡面上用红字写明代价。',
    'Stronger than a normal Part, but with a drawback written in {r:red} on the card.'), 'part');
T('calibration', l('校准', 'Calibration'), l('改造当前武器', 'Modifies your weapon'),
  l('只对你当前装备的武器生效的改造，同一项可以叠加几次。',
    'An upgrade for the weapon you are holding. Some can be stacked a few times.'), 'whetstone');
T('escapement', l('擒纵器', 'Escapement'), l('本局核心规则（只能带一个）', 'Core rule for the run (one only)'),
  l('改写回溯或残响基本规则的装置。第 1 层首领后三选一，每局只能有一个。',
    'A device that rewrites a core rule of rewinding or echoes. Pick one of three after the floor 1 boss; one per run.'), 'keystone');
T('brass', l('黄铜', 'Brass'), l('局内金币 · 商店用', 'Run money · spend in shops'),
  l('打倒敌人和清理房间获得，在慢慢的店里买东西、重抽奖励。本局结束时清零。',
    'Earned from enemies and rooms. Spend it in Manman\'s shop or on rerolls. It does not carry over between runs.'), 'brass');
T('shard', l('时之碎片', 'Time Shard'), l('局外货币 · 带回工坊升级', 'Kept after runs · upgrades'),
  l('清理房间、击败精英与首领获得，死亡也不会丢失。带回工坊，在主发条大钟上购买永久升级，或在武器架解锁武器。',
    'Earned from rooms, elites and bosses, and kept even when you die. Spend them in the workshop on the Mainspring (permanent upgrades) or the Armory.'), 'shard');
T('sand', l('时砂', 'Sand'), l('回溯/分岔要消耗的能量', 'Energy for rewind & Fork'),
  l('造成伤害、击杀、清场都会积攒时砂。回溯花 {g:25}–{g:100}（退得越远越贵），分岔花 {g:50}。上限 = 100 × 沙漏数，开局满，每层开始补满。',
    'Dealing damage, kills and clears fill it. A rewind costs {g:25}–{g:100} (further back costs more); a Fork costs {g:50}. Cap = 100 per hourglass; full at the start of each floor.'), 'sand');
T('tape', l('磁带', 'Tape'), l('能倒回的最近几秒', 'The seconds you can rewind'),
  l('血条下方的长条，记录你最近 {g:3} 秒。红刻痕是受伤的时刻，退过它就撤销那次伤害；紫刻痕是定格伤害，退过也拿不回。',
    'The strip under your health bar: your last {g:3} seconds. {r:Red} notches are hits; rewinding past one undoes it. {v:Violet} notches are fixed damage and stay.'), 'tape');
T('shadow', l('旧影', 'Shadow'), l('3 秒前的你 · 回溯会回到这里', 'You 3s ago · rewind lands here'),
  l('跟在你身后的空心轮廓。轻按回溯就回到它的位置；它头顶的 {c:+数字} 是现在回溯能拿回的生命。',
    'The hollow outline trailing you. Tap rewind to jump back to it; the {c:+number} above it is the health a rewind gives back right now.'), 'shadow');
T('echo', l('残响', 'Echo'), l('过去的你 · 会重复你做过的动作', 'Past you · repeats your moves'),
  l('回溯或分岔时留下的青色分身，会把你刚才的移动和攻击重演一遍，造成 {g:60%} 伤害。头顶出现 ◆ 时表示已就绪。',
    'The cyan double left by a rewind or Fork. It replays your recent moves and attacks for {g:60%} damage. A ◆ above it means it is armed.'), 'echo');
T('paradox', l('悖论', 'Paradox'), l('碰到自己的残响 → 爆炸', 'Touch your echo → explosion'),
  l('走进已就绪（◆）的残响会引发爆炸；冲刺穿过它会打出一道直线冲击并返还一次冲刺。爆炸碰到其他残响会连锁引爆。每次 +{c:20} 时砂。',
    'Walk into an armed (◆) echo to make it explode; dash through it for a line blast that refunds a dash. Blasts that reach other echoes chain. Each gives +{c:20} Sand.'), 'paradox');
T('fork', l('分岔', 'Fork'), l('原地留下一个残响', 'Leave an echo here'),
  l('花 {g:50} 时砂生成一个残响：它从你 2 秒前的位置出发，沿你的路线走到你按下分岔的地方并停留。不会移动你，也不回血。',
    'Spend {g:50} Sand to make an echo that walks your last 2 seconds of path and waits where you pressed Fork. It does not move or heal you.'), 'fork');
T('sync', l('同步', 'Sync'), l('两次攻击同时命中 → +50%', 'Two hits at once → +50%'),
  l('两个不同来源（你、你的残响、队友）在 {g:0.25} 秒内命中同一个敌人，第二击 +{g:50%}；三个及以上来源叫"和弦"，+{g:100%}。',
    'Two different sources (you, your echo, a friend) hitting one enemy within {g:0.25}s: the second hit deals +{g:50%}. Three or more sources make a Chord: +{g:100%}.'), 'sync');
T('culprit', l('元凶', 'Culprit'), l('打伤你的敌人 · 残响打它 +50%', 'Hit you · your echoes deal +50%'),
  l('回溯后，在你退过的那段时间里打伤你的敌人会被红色钟针标记 {g:4} 秒。你的残响打它 +{g:50%}；用悖论击杀它返还 {c:100} 时砂。',
    'After a rewind, enemies that hurt you during the undone seconds are marked for {g:4}s. Your echoes deal +{g:50%} to them; a Paradox kill refunds {c:100} Sand.'), 'culprit');
T('fixed', l('定格伤害', 'Fixed Damage'), l('回溯也拿不回的伤害', 'Damage rewind cannot undo'),
  l('紫色的伤害。受到时血条上会出现紫色锁定段，磁带上留下紫刻痕；回溯越过它也拿不回这部分生命。',
    '{v:Violet} damage. It locks part of your health bar and leaves a violet notch on the tape; rewinding past it does not give that health back.'), 'lock');
T('mainspring', l('主发条', 'Mainspring'), l('永久升级', 'Permanent upgrades'),
  l('工坊墙上的大钟。用时之碎片购买节点，效果在之后每一局都生效；每买一个节点，大钟前进 20 分钟。',
    'The great clock on the workshop wall. Buy nodes with Time Shards; they apply to every future run. Each node moves the clock 20 minutes forward.'), 'mainspring');
T('patron', l('守护者', 'Patron'), l('赐予你回忆的五位神祇', 'The five who grant Memories'),
  l('奥伦、皮普、玛尔塔、芬、阿苏。门上的徽记表示打完那间房能拿到哪位守护者的回忆；救出他们后会回到工坊。',
    'Oren, Pip, Marta, Fen and Asu. A sigil on a door tells you whose Memory waits behind it. Rescued Patrons return to the workshop.'), 'patron');
T('stopped', l('停摆', 'Stopped'), l('倒地 · 队友可以救你', 'Down · a friend can revive you'),
  l('生命归零。单人时还有一瞬间可以回溯自救；多人时 {g:15} 秒内队友可以拉回或上弦救你，否则变成幽灵指针，下个房间复活。',
    'Out of health. Alone, you get one last moment to rewind. With friends, they have {g:15}s to pull you back or wind you up; after that you become a ghost until the next room.'), 'stopped');
T('tempo', l('节拍', 'Tempo'), l('连招评分 · 越高伤害越高', 'Combo rating · more damage'),
  l('换着花样打会升阶（嘀 → 嗒 → 钟鸣 → 鸣钟 → 午夜），每阶提升伤害与黄铜。受到没被撤销的伤害会掉一阶；回溯会把节拍还给你。',
    'Mixing up your moves raises your rank (Tick → Tock → Chime → Toll → Midnight) for more damage and Brass. Taking damage you do not undo drops a rank; rewinding restores it.'), 'tempo');
T('break', l('破绽', 'Break'), l('打满后敌人僵直受重伤', 'Fill it to stagger the enemy'),
  l('精英与首领血条下的黄铜色条。打满后敌人僵直 {g:2.5} 秒（首领 {g:3} 秒）并取消当前攻击，期间受到伤害 +{g:50%}。悖论填得最快。',
    'The brass bar under elite and boss health. Fill it to stagger them for {g:2.5}s ({g:3}s for bosses), cancelling their attack; they take +{g:50%} damage meanwhile. Paradoxes fill it fastest.'), 'break');
T('chime', l('钟响', 'Chime'), l('收集品 · 集齐 11 个看真结局', 'Collect all 11 for the true end'),
  l('钟楼上的 11 口铃，各由一个里程碑或秘密敲响。不会被消耗；集齐全部 11 响才能看到真结局。',
    'Eleven bells in the belfry, each rung by a milestone or a secret. They are never spent; ring all 11 to reach the true ending.'), 'chime');
