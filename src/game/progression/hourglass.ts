// 沙漏 Hourglass — upgrades to the rewind itself (the game's core verb).
import type { Mods } from '../run';
import type { HookCtx } from './memories';
import { L, L10n } from '../i18n';

export interface HourglassDef {
  id: string;
  name: L10n;
  desc: L10n;
  max?: number;
  mods?: (m: Mods) => void;
  hook?: (c: HookCtx) => void;
}

export const HOURGLASS: HourglassDef[] = [
  { id: 'hg_charge', name: L('额外的沙', 'More Sand'), desc: L('回溯充能上限 +{g:1}。', 'Rewind charges +{g:1}.'), max: 2, mods: (m) => { m.rewindCharges += 1; } },
  { id: 'hg_window', name: L('漫长的三秒', 'A Longer Moment'), desc: L('回溯窗口 +{g:0.75} 秒。残响重演的内容更长。', 'Rewind window +{g:0.75}s. Echoes replay more of your past.'), max: 2, mods: (m) => { m.rewindWindow += 0.75; } },
  { id: 'hg_dense', name: L('浓缩时砂', 'Dense Sand'), desc: L('每格回溯所需{c:时砂} -{g:25%}。', '{c:Sand} needed per charge -{g:25%}.'), max: 2, mods: (m) => { m.sandPerCharge *= 0.75; } },
  { id: 'hg_echo', name: L('清晰的回响', 'Clear Echo'), desc: L('{c:残响}伤害 +{g:30%}（相对本体）。', '{c:Echo} damage +{g:30%} (of your own).'), max: 3, mods: (m) => { m.echoDmg += 0.3; } },
  { id: 'hg_paradox', name: L('悖论增幅', 'Paradox Amplifier'), desc: L('{c:悖论}伤害 +{g:60%}，范围 +{g:20%}。', '{c:Paradox} damage +{g:60%}, radius +{g:20%}.'), max: 2, mods: (m) => { m.paradoxDmg *= 1.6; m.paradoxRadius *= 1.2; } },
  { id: 'hg_multi', name: L('重叠的过去', 'Overlapping Pasts'), desc: L('同时存在的{c:残响}上限 +{g:1}。', 'Max simultaneous {c:Echoes} +{g:1}.'), max: 2, mods: (m) => { m.maxEchoes += 1; } },
  { id: 'hg_slow', name: L('慢放', 'Slow Replay'), desc: L('{c:残响}以 {g:0.8} 倍速重演（存在更久），伤害 +{g:10%}。', '{c:Echoes} replay at {g:0.8}x speed (lasting longer) and deal +{g:10%}.'), max: 1, mods: (m) => { m.echoSpeed *= 0.8; m.echoDmg += 0.1; } },
  { id: 'hg_stable', name: L('稳定悖论', 'Stable Paradox'), desc: L('触发{c:悖论}不再让{c:残响}消散。', 'Triggering a {c:Paradox} no longer shatters the {c:Echo}.'), max: 1, mods: (m) => { m.paradoxKeepsEcho = 1; } },
  { id: 'hg_ward', name: L('回溯庇护', 'Rewind Ward'), desc: L('回溯后的无敌时间延长至 {g:1.2} 秒。', 'Invulnerability after rewinding extended to {g:1.2}s.'), max: 1, mods: (m) => { m.rewindInvuln = Math.max(m.rewindInvuln, 1.2); } },
  { id: 'hg_siphon', name: L('时砂虹吸', 'Sand Siphon'), desc: L('{c:残响}造成的伤害获得完整的{c:时砂}，{c:时砂}获取 +{g:15%}。', '{c:Echo} damage grants full {c:Sand}; {c:Sand} gain +{g:15%}.'), max: 1, mods: (m) => { m.echoSand = 1; m.sandGain *= 1.15; } },
  { id: 'hg_lastsecond', name: L('最后一秒', 'The Last Second'), desc: L('每层一次：受到致命伤害时自动回溯。', 'Once per floor: automatically rewind when you would die.'), max: 1, mods: (m) => { m.autoRewindPerFloor += 1; } },
];
export const HOURGLASS_BY_ID: Record<string, HourglassDef> = Object.fromEntries(HOURGLASS.map((h) => [h.id, h]));
