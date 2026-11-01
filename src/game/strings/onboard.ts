// F4 · rewind teaching and onboarding (F4a): every player-facing line of ONBOARD2 §1–§5.
// S('onboard', key). Rules (ONBOARD2 §1.5): situation → button → result; ≤ 18 Han characters a
// line (tokens and numbers not counted), ≤ 44 Latin characters; buttons only as {@action} tokens;
// only names already taught (plain words before that); never blame.
//
// Interface day: the one sentence (MODEL), the three whys, the model strip, the gate lines, the
// shared lesson chrome and the new terms. The prologue's and the in-run lessons' lines land with
// their lessons (F4a days 5–8).
import { registerStrings, defineTerm } from '../strings';
import type { L10n } from '../i18n';

const L = (zh: string, en: string): L10n => ({ zh, en });

registerStrings('onboard', {
  // ── §1.1 the one sentence (word for word wherever it appears) ──
  model: L('回溯 = 撤销刚才几秒（伤也撤销），刚才的你变成残响，把刚才的动作再做一遍',
    'Rewind = undo the last few seconds (damage too). The you from those seconds becomes an Echo and does it all again.'),
  model1: L('回溯 = 撤销刚才几秒（伤也撤销）', 'Rewind = undo the last few seconds (damage too)'),
  model2: L('刚才的你变成残响，把刚才的动作再做一遍', 'The you from then becomes an Echo and does it all again'),
  // ── §1.2 the three whys (every success line points back to one) ──
  why1: L('刚挨打？回溯就撤销', 'Just got hit? Rewind undoes it'),
  why2: L('残响再打一遍 · 伤害白赚', 'Your Echo hits again · free damage'),
  why3: L('碰到自己的残响 → 爆炸', 'Touch your own Echo → explosion'),
  // ── §1.3 the model strip's five cells ──
  strip1: L('撤销几秒', 'Undo seconds'),
  strip2: L('伤也撤销', 'Damage too'),
  strip3: L('刚才的你 = 残响', 'Past you = Echo'),
  strip4: L('再做一遍', 'Does it again'),
  strip5: L('碰 ◆ = 爆炸', 'Touch ◆ = boom'),
  // ── §5.3 the gates speak (a Fork press before the lesson; holding before Scrub is taught) ──
  forkExplain1: L('这是 {@fork} 分岔：原地留个残响（-{fork}）', "That's {@fork} Fork: leave an Echo here (-{fork})"),
  forkExplain2: L('再按一次就用 · 清场后详细教你', 'Press again to use it · lesson after this room'),
  holdIsTap: L('按住暂时等于轻按 · 擦带稍后教你', 'Holding is a tap for now · Scrub comes later'),
  lessonUses: L('这一课用 {@rewind}', 'This lesson uses {@rewind}'),
  // ── shared lesson chrome (§2.10, §3.4, §3.7, §3.8, §5.5) ──
  // the ▶ / ⏪ marks in front of these are drawn as icons (the pixel fonts have no such glyphs)
  demoBadge: L('演示 {s}', 'DEMO {s}'),
  demoSkip: L('按住 {@confirm} 跳过演示', 'Hold {@confirm} to skip the demo'),
  wipe: L('倒回开头', 'Back to the start'),
  yourTurn: L('现在你来。', 'Your turn.'),
  watchAgain: L('{@info} 再看一遍', '{@info} Watch again'),
  watchAsk: L('要不要再看一遍演示？{@confirm} 看 · 走开 = 不看', 'Watch the demo again? {@confirm} watch · walk away = no'),
  skipLesson: L('{@confirm} 先跳过这一课（排练厅可补）', '{@confirm} Skip this lesson (practise it in the Hall)'),
  laterDoor: L('走进门 = 稍后再学', 'Walk through a door = later'),
  rehearsing: L('排练中 · 走进门 = 稍后再学', 'Rehearsing · walk in = later'),
  sandRefill: L('排练中时砂会补满', 'Sand refills during rehearsal'),
  tap: L('轻按', 'Tap'),
  hold: L('按住', 'Hold'),
  holdFor: L('按住 {s}s', 'Hold {s}s'),
  // ── §6.12 settings rows (F4b adds them to the pause menu's settings panel) ──
  setGuidance: L('引导', 'Guidance'),
  setGuidanceFull: L('完整', 'Full'),
  setGuidanceLite: L('精简', 'Light'),
  setGuidanceOff: L('关闭', 'Off'),
  setGuidanceHint: L('完整：清场后教新技巧、挨打时提示按键。精简：只留便条与排练厅。',
    'Full: new moves after fights, button prompts when hit. Light: notes and the Hall only.'),
});

// ── §1.6 new terms (no existing name changes) ──
defineTerm({
  id: 'rewind', name: L('回溯', 'Rewind'), plain: L('撤销刚才几秒 · 伤也撤销', 'Undo the last seconds, damage too'),
  detail: L('轻按回到旧影（3 秒前的你），受的伤一起撤销，打出的伤害保留；被你丢下的那几秒变成残响。花 {c:25}–{c:100} 时砂。',
    'A tap takes you back to your Shadow (you 3s ago): the damage you took is undone, the damage you dealt stays, and the seconds you left behind become an Echo. Costs {c:25}–{c:100} Sand.'),
  icon: 'rewind',
});
defineTerm({
  id: 'scrub', name: L('擦带', 'Scrub'), plain: L('按住回溯 · 自己选退多远', 'Hold rewind · pick how far back'),
  detail: L('按住回溯，预览影沿磁带往回走；松开就落在那里，按冲刺取消（不花时砂）。退得越少越便宜（每秒约 33，最少 25）。',
    'Hold rewind and a preview walks back along the Tape; release to land there, or dash to cancel (no Sand spent). A shorter rewind costs less (about 33 a second, 25 at least).'),
  icon: 'rewind',
});
defineTerm({
  id: 'hall', name: L('排练厅', 'Rehearsal Hall'), plain: L('练习技巧 · 不会停摆', "Practise moves · you can't fall here"),
  detail: L('工坊里的练习场：示范 + 时砂补满的练习，学会打勾，掌握得奖励。',
    'The workshop\'s practice room: a demo, then practice with Sand always full. Learn a move for a tick, master it for a reward.'),
  icon: 'hall',
});
