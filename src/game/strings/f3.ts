// F3 (Rewind 2.0) player-facing strings (PLAN2 §0.2 rule 3). {n} {m} {s} are filled in by code.
import { registerStrings, defineTerm } from '../strings';
import { L } from '../i18n';

registerStrings('f3', {
  // why a rewind did not happen (GDD2 §3.1: a reason, never "……")
  noSand: L('时砂不足 {n}/{m}', 'Not enough Sand {n}/{m}'),
  tapeShort: L('磁带太短 {s}s', 'Tape too short {s}s'),
  anchored: L('被时间锚锁住', 'Held by a time anchor'),
  burnt: L('磁带烧毁 {s}s', 'Tape burnt {s}s'),
  cantNow: L('现在不能回溯', "Can't rewind now"),
  // Perfect Rewind stamp (GDD2 §3.9)
  perfect: L('完美回溯', 'PERFECT'),
  // Culprit mark over an enemy (GDD2 §3.8)
  culprit: L('元凶', 'Culprit'),
  // Pull Back a stopped teammate (GDD2 §5.5); {n} = their numeral
  pullBack: L('按住：拉回 {n}', 'Hold: pull back {n}'),
  pulled: L('拉回来了', 'Pulled back'),
  // HUD: the pool is full, extra Sand is lost (GDD2 §3.3)
  full: L('满', 'FULL'),
  // HUD: violet locked part of the health bar (GDD2 §3.1, first runs)
  locked: L('锁定', 'LOCKED'),
  // top-centre paradox chain counter (F3b feeds it; GDD2 §3.6)
  chain: L('连锁 ×{n}', 'CHAIN ×{n}'),
  // Old Watch: rewound automatically at 0 HP
  autoRewind: L('最后一秒！', 'Last Second!'),
  // the self-rescue / Last Second rewind burns the tape (GDD2 §3.10)
  tapeBurnt: L('磁带烧毁了', 'The tape burnt out'),
  // tutorial room inscriptions (rooms/tutorial.ts)
  tutTap: L('轻按：回到旧影，撤销刚才的伤害', 'Tap: back to your Shadow, undoing the damage'),
  tutHold: L('按住：拖动磁带，选择退多远', 'Hold: scrub the tape, pick how far back'),
  tutSand: L('造成伤害积攒{c:时砂}，回溯要花时砂', 'Dealing damage fills {c:Sand}; rewinding spends it'),
  tutCoach: L('受伤了？轻按回溯，回到旧影！', 'Hurt? Tap rewind to jump back to your Shadow!'),
  tutShadow: L('那是三秒前的你。', 'That is you, three seconds ago.'),
  tutParadox: L('触碰它，引发{c:悖论}。', 'Touch it to cause a {c:Paradox}.'),
  // ── F3b ──
  // Fork refusals (GDD2 §3.4); {s} = seconds left
  forkCd: L('分岔冷却 {s}s', 'Fork recharging {s}s'),
  noArmed: L('没有就绪的残响', 'No armed echo'),
  // stamps over the action (GDD2 §4.1, §3.6, §3.7, §3.8)
  tick: L('TICK!', 'TICK!'),
  counter: L('反击！', 'COUNTER!'),
  interrupt: L('打断！', 'INTERRUPT!'),
  sync: L('同步', 'SYNC'),
  chord: L('和弦 ×{n}', 'CHORD ×{n}'),
  paradox: L('悖论！', 'PARADOX!'),
  pierce: L('穿越悖论！', 'PIERCE!'),
  duet: L('二重奏！', 'DUET!'),
  recallParadox: L('召回悖论！', 'RECALL!'),
  grandfather: L('祖父悖论', 'GRANDFATHER PARADOX'),
  // tutorial room: Fork (rooms/tutorial.ts)
  tutFork: L('按分岔：留下一个残响，它会走到你脚下', 'Fork: leave an echo that walks to your feet'),
});

// Terms the player meets in F3b's verbs (GDD2 §9.8: a plain line on first sight, ≤ 14 Han characters)
defineTerm({ id: 'armed', name: L('就绪 ◆', 'Armed ◆'), plain: L('◆ 出现后碰它 → 悖论', '◆ = touch it for a Paradox'),
  detail: L('残响出现 {g:0.4} 秒后头顶亮起 ◆，描边变成实线：这时走进它会引发悖论，冲刺穿过它会打出一道直线冲击。',
    'An echo arms {g:0.4}s after it appears: a ◆ lights over it and its outline turns solid. Walk into it for a Paradox, or dash through it for a line blast.'), icon: 'echo' });
defineTerm({ id: 'tickDodge', name: L('卡秒', 'Tick-Dodge'), plain: L('攻击命中前一刻冲刺 → 反击', 'Dash just before a hit → counter'),
  detail: L('冲刺开始后 {g:0.16} 秒内躲过的攻击算卡秒：时间短暂变慢，+{c:25} 时砂，{g:1.2} 秒内的下一击必定暴击 ×2（反击）。',
    'A blow your dash dodges within {g:0.16}s of starting it: time slows for a moment, +{c:25} Sand, and your next hit within {g:1.2}s is a guaranteed ×2 crit (Counter).'), icon: 'sync' });
defineTerm({ id: 'chain', name: L('连锁', 'Chain'), plain: L('爆炸引爆其他残响 · 越连越痛', 'Blasts set off other echoes'),
  detail: L('悖论的爆炸碰到另一个已就绪的残响（谁的都行），下一刻它也会爆炸；每多一环伤害 +{g:25%}。',
    'A Paradox blast that reaches another armed echo (anyone\'s) sets it off a moment later; each ring deals +{g:25%}.'), icon: 'paradox' });
defineTerm({ id: 'duet', name: L('二重奏', 'Duet'), plain: L('碰队友的残响 · 更大的爆炸', "Touch a friend's echo: bigger blast"),
  detail: L('碰到队友已就绪的残响：爆炸半径 ×{g:1.25}，你们俩各得 {c:25} 时砂。', "Touching a teammate's armed echo: blast radius ×{g:1.25} and {c:25} Sand for each of you."), icon: 'paradox' });
defineTerm({ id: 'recall', name: L('召回', 'Recall'), plain: L('按住分岔：残响飞回你身边', 'Hold Fork: echoes fly back to you'),
  detail: L('按住分岔 {g:0.4} 秒：所有已就绪的残响直线飞回你身边，一路切开敌人，到达时引发召回悖论（{g:75%} 伤害）。',
    'Hold Fork {g:0.4}s: every armed echo flies straight back to you, cutting through enemies, and sets off a Recall Paradox ({g:75%} damage) when it arrives.'), icon: 'fork' });
defineTerm({ id: 'counter', name: L('反击', 'Counter'), plain: L('卡秒后的下一击必定暴击', 'Next hit after a Tick-Dodge crits'),
  detail: L('卡秒后 {g:1.2} 秒内你的下一次命中：必定暴击 ×2，并伴随白闪。', 'Your next hit within {g:1.2}s of a Tick-Dodge: a guaranteed ×2 crit with a white flash.'), icon: 'sync' });
