// F3 (Rewind 2.0) player-facing strings (PLAN2 §0.2 rule 3). {n} {m} {s} are filled in by code.
import { registerStrings } from '../strings';
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
});
