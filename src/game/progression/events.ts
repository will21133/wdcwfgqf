// 凝固的瞬间 Frozen Moments — narrative events with choices.
import type { Run, Loadout } from '../run';
import type { RNG } from '../../engine/rng';
import type { Player } from '../entities/player';
import { L, L10n } from '../i18n';
import type { Patron } from './memories';

export interface EventCtx {
  run: Run;
  rng: RNG;
  /** the hand who walked up to the moment decides; gains and costs are theirs (GDD2 §5.8) */
  player: Player;
  lo: Loadout;
  /** open a memory choice for a patron (after the event closes) */
  memory(patron: Patron, boost?: number): void;
  hourglass(): void;
  calibration(): void;
  part(opts?: { allowCursed?: boolean; forceCursed?: boolean }): void;
  heal(frac: number): void;
  damage(amount: number): void;
  brass(n: number): void;
  shards(n: number): void;
  lore(id: string): void;
}

export interface EventOption {
  label: L10n;
  detail?: L10n;
  cond?: (run: Run, lo: Loadout) => boolean;
  act: (c: EventCtx) => L10n;
}

export interface EventDef {
  id: string;
  title: L10n;
  text: L10n;
  art: string;
  minFloor?: number;
  options: EventOption[];
}

const leave = (msg = L('你没有打扰这一刻。', 'You leave the moment undisturbed.')): EventOption => ({ label: L('离开', 'Leave'), act: () => msg });

export const EVENTS: EventDef[] = [
  {
    id: 'baker', art: 'baker',
    title: L('面包师', 'The Baker'),
    text: L('一位面包师凝固在半步之中，托盘里的面包悬在空中，还冒着永远散不尽的热气。她的背后，一把发条钥匙停在半圈。',
      'A baker frozen mid-stride, a tray of loaves floating above her hands, still steaming with heat that will never fade. A wind-up key on her back has stopped half-turned.'),
    options: [
      { label: L('拿一块面包', 'Take a loaf'), detail: L('{y:恢复 30% 生命}', '{y:Heal 30% HP}'), act: (c) => { c.heal(0.3); return L('面包是温的。奇怪，你明明没有胃。', "It's warm. Strange, since you have no stomach."); } },
      { label: L('替她拧紧发条', 'Wind her key'), detail: L('{g:+70 黄铜}，{r:失去 10 生命}', '{g:+70 Brass}, {r:lose 10 HP}'), act: (c) => { c.brass(70); c.damage(10); return L('她猛地动了一下，手肘撞在你脸上，口袋里的硬币撒了一地。然后，又停住了。', 'She jolts — her elbow catches your face, coins spill from her apron. Then she is still again.'); } },
      leave(),
    ],
  },
  {
    id: 'watches', art: 'watches',
    title: L('钟表店橱窗', "The Watchmaker's Window"),
    text: L('橱窗里挂着几十只怀表，全部停在 11:59:59。除了一只——它还在走。滴答，滴答。',
      'Dozens of pocket watches hang in the window, every one stopped at 11:59:59. Except one. It is still ticking.'),
    options: [
      { label: L('拿走那只还在走的表', 'Take the ticking watch'), detail: L('获得一个{g:零件}（{r:可能有裂纹}）', 'Gain a {g:Part} ({r:may be cracked})'), act: (c) => { c.part({ allowCursed: true, forceCursed: c.rng.chance(0.3) }); return L('它在你手心里跳动，像一颗小小的心。', 'It beats in your palm like a tiny heart.'); } },
      leave(),
    ],
  },
  {
    id: 'rain', art: 'hourglass',
    title: L('不落的雨', 'Rain That Never Falls'),
    text: L('穿过天窗的雨滴悬停在半空，像一串串玻璃珠。每一滴里都映着同一个瞬间。',
      'Raindrops from a broken skylight hang in the air like strings of glass beads. Each one holds the same reflected moment.'),
    options: [
      { label: L('饮下雨水', 'Drink the rain'), detail: L('{y:最大生命 +10}', '{y:Max HP +10}'), act: (c) => { c.lo.bonuses.push({ apply: (m) => { m.maxHp += 10; } }); c.lo.recompute(); return L('雨水尝起来像是很久以前的某个下午。', 'The rain tastes like an afternoon from long ago.'); } },
      { label: L('收集雨滴', 'Collect the drops'), detail: L('{c:回溯充能全满}，{g:+30 黄铜}', '{c:Fill all rewind charges}, {g:+30 Brass}'), act: (c) => { c.lo.charges = c.lo.mods.rewindCharges; c.brass(30); return L('雨滴在瓶中轻轻倒流。', 'In the bottle, the drops quietly flow backwards.'); } },
      leave(),
    ],
  },
  {
    id: 'mirror', art: 'mirror', minFloor: 1,
    title: L('迟到的镜子', 'The Late Mirror'),
    text: L('一面落地镜。镜中的你总是慢上三秒——它刚刚才走到你现在站的地方，然后对你眨了眨眼。',
      'A tall mirror. Your reflection runs three seconds late. It has only just arrived where you stand — and it winks at you.'),
    options: [
      { label: L('走进镜子', 'Step through'), detail: L('选择一项{c:沙漏}强化，{r:失去 15 生命}', 'Choose an {c:Hourglass} upgrade, {r:lose 15 HP}'), act: (c) => { c.damage(15); c.hourglass(); return L('镜子的另一边很冷，你回来时手里多了一捧沙。', 'It is cold on the other side. You return holding a handful of sand.'); } },
      { label: L('打碎镜子', 'Shatter it'), detail: L('{g:+90 黄铜}，{r:失去 8 生命}', '{g:+90 Brass}, {r:lose 8 HP}'), act: (c) => { c.brass(90); c.damage(8); return L('碎片里有无数个慢了三秒的你，它们都在对你笑。', 'In every shard, a version of you three seconds late. All of them smiling.'); } },
      leave(),
    ],
  },
  {
    id: 'gamblers', art: 'gambler',
    title: L('牌局', 'The Card Game'),
    text: L('两个赌徒僵在牌桌前，一个正要翻开最后一张牌。桌上堆着黄铜。没人知道那张牌是什么——连他自己也不知道。',
      'Two gamblers frozen over a table, one about to reveal his last card. The pot is piled with brass. No one knows what the card is — not even him.'),
    options: [
      { label: L('押上一半黄铜', 'Bet half your Brass'), detail: L('{g:50%} 翻倍，否则输光赌注', '{g:50%} to double it, else lose the bet'), cond: (r) => r.brass >= 10, act: (c) => {
        const bet = Math.floor(c.run.brass / 2);
        if (c.rng.chance(0.5)) { c.brass(bet); return L(`你翻开那张牌——是一张"午夜"。你赢了 ${bet} 黄铜。`, `You flip the card — it's "Midnight". You win ${bet} Brass.`); }
        c.run.spendBrass(bet); return L(`那张牌是空白的。你输掉了 ${bet} 黄铜。时间似乎在偷笑。`, `The card is blank. You lose ${bet} Brass. Time seems to snicker.`);
      } },
      { label: L('顺走赌注', 'Pocket the pot'), detail: L('{g:+50 黄铜}，{r:失去 12 生命}', '{g:+50 Brass}, {r:lose 12 HP}'), act: (c) => { c.brass(50); c.damage(12); return L('桌下藏着一只发条狗，它咬了你一口。', 'A clockwork dog under the table bites you on the way out.'); } },
      leave(),
    ],
  },
  {
    id: 'child', art: 'child',
    title: L('迷路的孩子', 'The Lost Child'),
    text: L('一个小女孩停在哭泣的那一刻，怀里抱着一个摔坏的锡兵玩具。玩具的发条断了。',
      'A little girl frozen mid-sob, clutching a broken tin soldier. Its spring has snapped.'),
    options: [
      { label: L('修好玩具', 'Mend the toy'), detail: L('{r:花费 40 黄铜}，选择一段{y:皮普}的回忆', '{r:Pay 40 Brass}, choose a Memory from {y:Pip}'), cond: (r) => r.brass >= 40, act: (c) => { c.run.spendBrass(40); c.memory('pip'); return L('你把锡兵放回她怀里。也许时间恢复的时候，她会先笑出来。', 'You tuck the soldier back into her arms. When time returns, perhaps she will laugh first.'); } },
      { label: L('轻轻摸摸她的头', 'Pat her head gently'), detail: L('{y:恢复 15% 生命}', '{y:Heal 15% HP}'), act: (c) => { c.heal(0.15); return L('你的手是冷的，但你觉得心里暖了一下。', 'Your hand is cold, but something in you feels warmer.'); } },
      leave(),
    ],
  },
  {
    id: 'bell', art: 'bell',
    title: L('还愿钟', 'The Offering Bell'),
    text: L('基座上有一只小铜铃，旁边的纸条写着："敲响它，得你所需；付出代价，偿你所欠。"',
      'A small bell on a pedestal. A note beside it: "Ring for what you need. Pay what you owe."'),
    options: [
      { label: L('敲响铃铛', 'Ring the bell'), detail: L('选择一段随机守护者的{g:回忆}（{g:更高稀有度}），{r:失去 20% 生命}', 'Choose a {g:Memory} from a random patron ({g:higher rarity}), {r:lose 20% HP}'), act: (c) => {
        c.damage(Math.round(c.player.maxHp * 0.2));
        const ps: Patron[] = ['oren', 'pip', 'marta', 'fen', 'asu'];
        c.memory(c.rng.pick(ps), 0.25);
        return L('铃声在停滞的城市里传得很远，很远。', 'The chime travels far, far across the frozen city.');
      } },
      leave(),
    ],
  },
  {
    id: 'letter', art: 'letter',
    title: L('桌上的信', 'A Letter on the Desk'),
    text: L('一封没寄出的信，收件人是"奥伦"。字迹在最后几行变得潦草："原谅我。我做不到让钟敲响。我宁愿……"',
      'An unsent letter, addressed to "Oren". The handwriting falters near the end: "Forgive me. I could not let the clock strike. I would rather..."'),
    options: [
      { label: L('读完它', 'Read it all'), detail: L('{v:+3 时之碎片}，解锁一段记录', '{v:+3 Time Shards}, unlock a record'), act: (c) => { c.shards(3); c.lore('letter1'); return L('"……我宁愿让整座城停在你还活着的这一秒。——伊"', '"...I would rather the whole city stand still in the one second you are still alive. — I."'); } },
      leave(L('你把信放回原处。有些话不该由你来读。', 'You set the letter back. Some words are not yours to read.')),
    ],
  },
  {
    id: 'spill', art: 'hourglass',
    title: L('倒流的沙', 'Sand Running Upward'),
    text: L('一只打翻的沙漏，沙子正从地上缓缓流回瓶中——这座城里唯一还在"倒流"的东西，除了你。',
      'A toppled hourglass. Its sand is slowly flowing back up into the glass — the only thing in the city running backwards, besides you.'),
    options: [
      { label: L('捧起沙子', 'Scoop up the sand'), detail: L('{c:回溯充能全满}，{c:回溯充能上限 +1}（本局）', '{c:Fill rewind charges}, {c:+1 max charge} (this run)'), act: (c) => { c.lo.bonuses.push({ apply: (m) => { m.rewindCharges += 1; } }); c.lo.recompute(); c.lo.charges = c.lo.mods.rewindCharges; return L('沙子在你掌心里发出细微的嗡鸣。', 'The sand hums faintly in your palms.'); } },
      { label: L('带走玻璃', 'Take the glass'), detail: L('获得零件{g:沙漏碎片}', 'Gain the Part {g:Hourglass Shard}'), cond: (_r, lo) => !lo.parts.includes('hourglass_shard'), act: (c) => { c.lo.parts.push('hourglass_shard'); c.lo.recompute(); return L('玻璃还是温的。', 'The glass is still warm.'); } },
      leave(),
    ],
  },
  {
    id: 'telescope', art: 'telescope', minFloor: 2,
    title: L('观星台', 'The Observatory'),
    text: L('一架黄铜望远镜对着停住的夜空。镜筒旁贴着阿苏的字条："第 86400 次观测：星星还在原地。我也是。"',
      'A brass telescope aimed at the frozen sky. A note from Asu on the tube: "Observation #86400: the stars have not moved. Neither have I."'),
    options: [
      { label: L('望向星空', 'Look through it'), detail: L('选择一段{v:阿苏}的回忆，{r:最大生命 -8}', 'Choose a Memory from {v:Asu}, {r:max HP -8}'), act: (c) => { c.lo.bonuses.push({ apply: (m) => { m.maxHp -= 8; } }); c.lo.recompute(); c.memory('asu', 0.15); return L('星光落进你的表盘里，再也没有离开。', 'Starlight falls into your dial and never leaves.'); } },
      leave(),
    ],
  },
  {
    id: 'notebook', art: 'elder', minFloor: 1,
    title: L('园丁的笔记', "The Gardener's Notebook"),
    text: L('芬的笔记本摊开在花架上，最后一页写着："如果时间停了，花会不会永远开着？我想看看。可是……不会凋谢的花，还算是花吗？"',
      'Fen\'s notebook lies open on a planter. The last page reads: "If time stops, will the flowers bloom forever? I want to see. But... is a flower that never wilts still a flower?"'),
    options: [
      { label: L('把一片花瓣夹进书里', 'Press a petal between the pages'), detail: L('选择一段{t:芬}的回忆', 'Choose a Memory from {t:Fen}'), act: (c) => { c.memory('fen'); return L('花瓣在书页间，替她继续生长。', 'Between the pages, the petal keeps growing for her.'); } },
      { label: L('带走笔记本', 'Take the notebook'), detail: L('{v:+2 时之碎片}，{y:恢复 10% 生命}', '{v:+2 Time Shards}, {y:heal 10%}'), act: (c) => { c.shards(2); c.heal(0.1); return L('笔记本里夹着一张种子清单，还有一个名字：奥伦。', 'Tucked inside: a list of seeds, and a name — Oren.'); } },
      leave(),
    ],
  },
  {
    id: 'bellrope', art: 'bell', minFloor: 1,
    title: L('钟楼的绳子', 'The Bell Rope'),
    text: L('一根粗麻绳从高处垂下，末端还握在玛尔塔僵住的手里。她正要拉下最后一下——午夜的钟声。',
      'A thick rope hangs from above, its end still gripped in Marta\'s frozen hands. She was about to pull the final stroke — the midnight bell.'),
    options: [
      { label: L('替她拉一下', 'Pull it for her'), detail: L('选择一段{b:玛尔塔}的回忆（{g:更高稀有度}），{r:失去 12 生命}', 'Choose a Memory from {b:Marta} ({g:higher rarity}), {r:lose 12 HP}'), act: (c) => { c.damage(12); c.memory('marta', 0.2); return L('绳子纹丝不动。但你听见了很远很远的一声嗡鸣。', 'The rope does not move. Yet somewhere, very far away, something hums.'); } },
      { label: L('松开她的手', 'Loosen her grip'), detail: L('{g:+60 黄铜}', '{g:+60 Brass}'), act: (c) => { c.brass(60); return L('她手心里攥着几枚硬币——敲钟的工钱。', 'Coins in her palm — a bellringer\'s wages.'); } },
      leave(),
    ],
  },
  {
    id: 'toolbox', art: 'child',
    title: L('学徒的工具箱', "The Apprentice's Toolbox"),
    text: L('皮普的工具箱翻倒在地，螺丝和齿轮撒了一地。一张纸条贴在盖子上："师傅说过：拧太紧，就会断。"',
      'Pip\'s toolbox lies overturned, screws and gears everywhere. A note on the lid: "Master says: turn it too tight and it snaps."'),
    options: [
      { label: L('收拾工具', 'Gather the tools'), detail: L('选择一项{g:武器校准}', 'Choose a weapon {g:Calibration}'), act: (c) => { c.calibration(); return L('你把每一样都擦干净，放回原处。', 'You wipe each one clean and put it back.'); } },
      { label: L('拿走最好的扳手', 'Take the best wrench'), detail: L('选择一段{y:皮普}的回忆', 'Choose a Memory from {y:Pip}'), act: (c) => { c.memory('pip'); return L('扳手的握柄上缠着胶布，磨得发亮。', 'The handle is wrapped in tape, worn shiny.'); } },
      leave(),
    ],
  },
];

/**
 * The frozen moment an event room shows (PLAN2 §1.5). Default = 1.0: uniformly among the events not
 * seen this run that are allowed on this floor (every event once they are all seen). P7 replaces it
 * with the weighted / conditional version. `rng` defaults to the run's; rooms pass their own.
 */
export function pickEvent(run: Run, rng: RNG = run.rng): EventDef {
  const seen = new Set(run.eventsSeen);
  const pool = EVENTS.filter((e) => !seen.has(e.id) && (e.minFloor ?? 0) <= run.floor);
  return pool.length ? rng.pick(pool) : rng.pick(EVENTS);
}
