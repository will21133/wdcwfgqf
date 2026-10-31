// Story beats: Ines's conversations in the workshop, delivered between runs.
import { L, L10n } from './i18n';
import { profile } from './save';

export interface Line { who: 'ines' | 'tick'; text: L10n }

/** main conversations, played in order (one per visit when the condition is met) */
export const INES_STORY: { cond: () => boolean; lines: Line[] }[] = [
  {
    cond: () => true,
    lines: [
      { who: 'ines', text: L('……动了。真的动了。醒了吗，小家伙？', '...It moved. It really moved. Are you awake, little one?') },
      { who: 'ines', text: L('我是伊妮丝，这间工坊的钟匠。你是大钟上的秒针——钟停摆的那一刻，你掉了下来。', "I'm Ines, the clockmaker of this workshop. You're the second hand from the Great Clock — you fell the moment it stopped.") },
      { who: 'ines', text: L('整座城都停在了 11:59:59。所有人，所有东西。只有你，还有我这间小屋子，还在走。', 'The whole city stopped at 11:59:59. Everyone, everything. Only you — and this little room — still move.') },
      { who: 'ines', text: L('去塔顶吧。让钟走完最后这一秒。', 'Go to the top of the tower. Let the clock finish its last second.') },
      { who: 'ines', text: L('如果你……停摆了，别怕。时间会把你送回我这里。就像你倒回三秒那样，只是更远一些。', "And if you stop... don't be afraid. Time will bring you back to me. Like rewinding three seconds — just further.") },
    ],
  },
  {
    cond: () => profile.deaths >= 1,
    lines: [
      { who: 'ines', text: L('回来了？……别垂着指针。停下来不丢人。', "Back already? Don't droop your hands. There's no shame in stopping.") },
      { who: 'ines', text: L('塔里那些凝固的人……你碰到他们的回忆了吧？他们借给你的力量，会随着时间一起倒流回去。', "The frozen people in the tower... you touched their memories, didn't you? What they lent you flows back with time.") },
      { who: 'ines', text: L('下次再借就是了。他们都是好人。', "You'll just borrow it again. They're good people.") },
    ],
  },
  {
    cond: () => profile.bestFloor >= 1,
    lines: [
      { who: 'ines', text: L('你见到皮普了？那孩子是我的学徒。总是把螺丝拧得太紧。', "You met Pip? That boy is my apprentice. Always turns the screws too tight.") },
      { who: 'ines', text: L('他停在温室的入口，手里还拿着给我修的扳手。', "He's frozen at the Conservatory entrance, still holding the wrench he was fixing for me.") },
      { who: 'tick', text: L('……（滴答）', '...(tick)') },
      { who: 'ines', text: L('嗯？你想知道我为什么没被冻住？……这间工坊在钟楼底下，离大钟最远。大概是运气吧。', "Hm? You want to know why I'm not frozen? ...This workshop is at the tower's base, farthest from the Great Clock. Luck, I suppose.") },
    ],
  },
  {
    cond: () => profile.seen.bosses.length >= 1,
    lines: [
      { who: 'ines', text: L('工头被你打倒了？那个老锅炉，脾气比蒸汽还冲。', 'You beat the Foreman? That old boiler had a temper hotter than its steam.') },
      { who: 'ines', text: L('他是我丈夫的朋友。以前每晚都和奥伦一起去点灯。', 'He was my husband\'s friend. Every night he and Oren went out to light the lamps together.') },
      { who: 'ines', text: L('奥伦……是城里的点灯人。他点的灯，从来没有一盏熄过。', "Oren... was the city's lamplighter. Not one of his lamps ever went out.") },
    ],
  },
  {
    cond: () => profile.bestFloor >= 2,
    lines: [
      { who: 'ines', text: L('档案馆里的沙……你看见了吗，它们是从钟里漏出来的。时间被堵住了，总得有地方流。', "The sand in the Archive... you saw it? It's leaking out of the clock. Time's been dammed up. It has to go somewhere.") },
      { who: 'ines', text: L('那里存着全城的记录。出生，婚礼，还有……', 'Every record of the city is kept there. Births, weddings, and...') },
      { who: 'ines', text: L('……算了。去吧，别让我耽误你。', '...Never mind. Go on, don\'t let me hold you up.') },
    ],
  },
  {
    cond: () => profile.lore.includes('letter1'),
    lines: [
      { who: 'ines', text: L('你在塔里……读到了一封信，是吗。', 'You found... a letter in the tower, didn\'t you.') },
      { who: 'ines', text: L('那天晚上，奥伦病得很重。医生说他撑不过午夜。', 'That night, Oren was very ill. The doctor said he would not live past midnight.') },
      { who: 'ines', text: L('我是钟匠。我这辈子都在和时间打交道。我以为……我可以让它等一等。', "I'm a clockmaker. I've spent my whole life working with time. I thought... I could ask it to wait.") },
      { who: 'ines', text: L('对不起，小家伙。让你替我收拾这个烂摊子。', "I'm sorry, little one. For making you clean up my mess.") },
    ],
  },
  {
    cond: () => profile.bestFloor >= 3,
    lines: [
      { who: 'ines', text: L('钟面上……那个东西，你见到了吧。', "On the clockface... you saw it, didn't you.") },
      { who: 'ines', text: L('那是"静止"。是我不肯放手的那一秒，长成了一只怪物。', '"The Stillness." It\'s the second I refused to let go of, grown into a monster.') },
      { who: 'ines', text: L('如果你赢了，钟会敲响，奥伦会……', 'If you win, the clock will strike, and Oren will...') },
      { who: 'ines', text: L('……去吧。这次，我不会再让它停下了。', '...Go. This time, I won\'t make it stop.') },
    ],
  },
  {
    cond: () => profile.wins >= 1,
    lines: [
      { who: 'ines', text: L('钟声……我听见了。午夜的钟声。', 'The bells... I heard them. The midnight bells.') },
      { who: 'ines', text: L('他走的时候在笑。他说，灯都点好了。', 'He was smiling when he went. He said the lamps were all lit.') },
      { who: 'ines', text: L('谢谢你，滴答。你可以休息了……可你还想继续走，对不对？', 'Thank you, Tick. You can rest now... but you want to keep going, don\'t you?') },
      { who: 'ines', text: L('那就把发条拧得再紧一点吧。塔里还有很多被困住的回忆——"超频"能让你听见它们。', 'Then let\'s wind your spring a little tighter. There are more trapped memories in the tower — "Overwind" will let you hear them.') },
    ],
  },
];

/** short ambient lines after the story is exhausted */
export const INES_IDLE: L10n[] = [
  L('上好发条了吗？出门前记得检查一下。', 'Spring wound? Check before you go.'),
  L('奥伦以前也像你一样，一出门就不回头。', 'Oren was like you. Out the door without looking back.'),
  L('那只猫？是我给奥伦做的生日礼物。它只会睡觉。', "The cat? I made it for Oren's birthday. It only knows how to sleep."),
  L('残响不是幻影，小家伙。那就是你，只是早了三秒。', "Your echo isn't a ghost, little one. It's you — just three seconds earlier."),
  L('碰一碰过去的自己，会发生奇妙的事。我们钟匠管那叫"悖论"。', 'Touch your past self and strange things happen. We clockmakers call it a "paradox".'),
  L('时之碎片就交给我吧，我会把它们拧进你的发条里。', "Leave the time shards to me. I'll wind them into your spring."),
];

export const DEATH_LINES: L10n[] = [
  L('欢迎回来。时间是很有耐心的。', 'Welcome back. Time is very patient.'),
  L('又停摆了？来，我给你上点油。', 'Stopped again? Here, let me oil you up.'),
  L('你每次回来，指针都更稳了一点。', 'Every time you come back, your hands are a little steadier.'),
];
