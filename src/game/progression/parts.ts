// 零件 Parts — passive relics. Some are "cracked" (cursed): strong with a drawback.
import type { Mods } from '../run';
import type { HookCtx } from './memories';
import { L, L10n } from '../i18n';
import { sfx } from '../G';

export interface PartDef {
  id: string;
  name: L10n;
  desc: L10n;
  flavor: L10n;
  rarity: 0 | 1 | 2;
  cursed?: boolean;
  shopOnly?: boolean;
  mods?: (m: Mods) => void;
  hook?: (c: HookCtx) => void;
  /** icon recipe key (see art/sprites/icons.ts) */
  icon: string;
}

export const PARTS: PartDef[] = [
  { id: 'spare_key', icon: 'key', rarity: 2, name: L('备用钥匙', 'Spare Key'), desc: L('多一个沙漏：{c:时砂}上限 +{g:100}。', 'One more hourglass: {c:Sand} cap +{g:100}.'), flavor: L('伊妮丝总说：总要留一把备用的。', 'Ines always said: keep a spare.'), mods: (m) => { m.rewindCharges += 1; } },
  { id: 'brass_heart', icon: 'heart', rarity: 0, name: L('黄铜心脏', 'Brass Heart'), desc: L('最大生命 +{y:20}。', 'Max HP +{y:20}.'), flavor: L('滴答、滴答，比你的那颗跳得更稳。', 'Tick, tick — steadier than yours.'), mods: (m) => { m.maxHp += 20; } },
  { id: 'oil_can', icon: 'oil', rarity: 0, name: L('润滑油', 'Oil Can'), desc: L('冲刺冷却 -{g:30%}。', 'Dash cooldown -{g:30%}.'), flavor: L('关节不再嘎吱作响。', 'No more creaking joints.'), mods: (m) => { m.dashCd *= 0.7; } },
  { id: 'cracked_lens', icon: 'lens', rarity: 0, name: L('裂纹镜片', 'Cracked Lens'), desc: L('暴击率 +{g:10%}。', 'Critical chance +{g:10%}.'), flavor: L('透过裂缝，弱点一清二楚。', 'Through the crack, every weakness shows.'), mods: (m) => { m.critChance += 0.1; } },
  { id: 'plumb_bob', icon: 'plumb', rarity: 0, name: L('铅锤', 'Plumb Bob'), desc: L('对生命高于 80% 的敌人伤害 +{g:35%}。', '+{g:35%} damage to enemies above 80% HP.'), flavor: L('先落下的那一下最重。', 'The first drop falls hardest.'), mods: (m) => { m.freshDmg += 0.35; } },
  { id: 'old_watch', icon: 'watch', rarity: 2, name: L('老怀表', 'Old Pocket Watch'), desc: L('每层一次：受到致命伤害时自动回溯。', 'Once per floor: automatically rewind when you would die.'), flavor: L('表盖内刻着一行字："给O，愿你永远准时。"', 'Engraved inside: "For O — may you always be on time."'), mods: (m) => { m.autoRewindPerFloor += 1; } },
  { id: 'hourglass_shard', icon: 'shard', rarity: 1, name: L('沙漏碎片', 'Hourglass Shard'), desc: L('回溯窗口 +{g:0.5} 秒。', 'Rewind window +{g:0.5}s.'), flavor: L('里面的沙还在流，哪怕整座城都停了。', 'The sand inside still runs, though the city stands still.'), mods: (m) => { m.rewindWindow += 0.5; } },
  { id: 'echo_shell', icon: 'shell', rarity: 1, name: L('回音贝壳', 'Echo Shell'), desc: L('{c:残响}伤害 +{g:20%}，{c:残响}上限 +{g:1}。', '{c:Echo} damage +{g:20%}, max {c:Echoes} +{g:1}.'), flavor: L('贴在耳边，能听见三秒前的自己。', 'Hold it to your ear: you hear yourself, three seconds ago.'), mods: (m) => { m.echoDmg += 0.2; m.maxEchoes += 1; } },
  { id: 'nightingale', icon: 'bird', rarity: 1, name: L('夜莺音盒', 'Nightingale Box'), desc: L('{c:残响}每击杀一名敌人，恢复 {y:3} 点生命。', 'Heal {y:3} whenever an {c:Echo} kills an enemy.'), flavor: L('它唱的是一首没有结尾的歌。', 'It sings a song with no ending.'), hook: (c) => c.onMine('kill', (e) => { if (e.info.echo && c.p.state === 'alive') { c.p.hp = Math.min(c.p.maxHp, c.p.hp + 3); c.w.fx.number(c.p.x, c.p.y - 26, 3, 'G4', false); } }) },
  { id: 'lodestone', icon: 'magnet', rarity: 0, name: L('磁石', 'Lodestone'), desc: L('黄铜掉落 +{g:30%}。', 'Brass drops +{g:30%}.'), flavor: L('黄铜总是被它吸引，像是有了心事。', 'Brass is drawn to it, as if it longed for something.'), mods: (m) => { m.brassMul += 0.3; } },
  { id: 'windup_rabbit', icon: 'rabbit', rarity: 0, name: L('发条兔', 'Wind-up Rabbit'), desc: L('移动速度 +{g:12%}。', 'Move speed +{g:12%}.'), flavor: L('拧三圈，跑一整天。', 'Three turns of the key, a whole day of running.'), mods: (m) => { m.moveSpeed *= 1.12; } },
  { id: 'old_photo', icon: 'photo', rarity: 2, name: L('旧照片', 'Old Photograph'), desc: L('选择回忆时多出 {g:1} 个选项。', 'One extra option when choosing Memories.'), flavor: L('照片上的两个人在点灯下笑着。', 'Two people laughing beneath a streetlamp.'), mods: (m) => { m.extraChoice += 1; } },
  { id: 'copper_bell', icon: 'bell', rarity: 1, name: L('铜铃', 'Copper Bell'), desc: L('{c:悖论}会使敌人眩晕 {g:1.2} 秒。', '{c:Paradox} stuns enemies for {g:1.2}s.'), flavor: L('小小的铃，大大的回响。', 'A small bell, a big echo.'), hook: (c) => c.onMine('paradox', (e) => { for (const t of c.w.enemiesNear(e.x, e.y, c.lo.mods.paradoxRadius)) t.st.stun = Math.max(t.st.stun, 1.2); }) },
  { id: 'whetstone', icon: 'whetstone', rarity: 0, name: L('磨刀石', 'Whetstone'), desc: L('伤害 +{g:12%}。', 'Damage +{g:12%}.'), flavor: L('秒针要够尖，才能刺穿停滞。', 'A second hand must be sharp to pierce the stillness.'), mods: (m) => { m.dmg += 0.12; } },
  { id: 'inkwell', icon: 'ink', rarity: 0, name: L('墨水瓶', 'Inkwell'), desc: L('特技冷却 -{g:30%}。', 'Special cooldown -{g:30%}.'), flavor: L('写下的东西，时间也带不走。', 'What is written, time cannot take.'), mods: (m) => { m.specialCd *= 0.7; } },
  { id: 'glass_eye', icon: 'eye', rarity: 1, name: L('玻璃眼珠', 'Glass Eye'), desc: L('暴击率 +{g:6%}；暴击时获得 {c:8} 点{c:时砂}。', 'Crit chance +{g:6%}; crits grant {c:8} {c:Sand}.'), flavor: L('它从不眨眼。', 'It never blinks.'), mods: (m) => { m.critChance += 0.06; }, hook: (c) => c.onMine('hit', (e) => { if (e.info.crit) c.lo.addSand(8); }) },
  { id: 'tiny_gear', icon: 'gear', rarity: 0, name: L('小号齿轮', 'Tiny Gear'), desc: L('攻击速度 +{g:12%}。', 'Attack speed +{g:12%}.'), flavor: L('小齿轮转得最快。', 'The smallest gear turns fastest.'), mods: (m) => { m.atkSpeed *= 1.12; } },
  { id: 'star_chart', icon: 'star', rarity: 1, name: L('星图残页', 'Star Chart Page'), desc: L('{c:悖论}伤害 +{g:50%}。', '{c:Paradox} damage +{g:50%}.'), flavor: L('阿苏在边角写着："这一秒，星星排成了你的名字。"', 'Asu wrote in the margin: "In this second, the stars spell your name."'), mods: (m) => { m.paradoxDmg *= 1.5; } },
  { id: 'snail_shell', icon: 'snail', rarity: 1, shopOnly: true, name: L('蜗牛壳', 'Snail Shell'), desc: L('受到的伤害 -{g:12%}。', 'Damage taken -{g:12%}.'), flavor: L('慢慢："慢一点，就不容易受伤。"', 'Manman: "Slow down. Less gets broken."'), mods: (m) => { m.armor = 1 - (1 - m.armor) * 0.88; } },
  { id: 'manman_card', icon: 'card', rarity: 0, shopOnly: true, name: L('慢慢的名片', "Manman's Card"), desc: L('商店价格 -{g:20%}。', 'Shop prices -{g:20%}.'), flavor: L('名片上只有一个字：慢。', 'The card bears a single word: Slow.'), mods: (m) => { m.shopMul *= 0.8; } },
  { id: 'hour_hand', icon: 'hourhand', rarity: 1, name: L('时针', 'Hour Hand'), desc: L('特技伤害 +{g:40%}。', 'Special damage +{g:40%}.'), flavor: L('慢，但从不缺席。', 'Slow, but never absent.'), mods: (m) => { m.specialDmg += 0.4; } },
  { id: 'torn_score', icon: 'score', rarity: 1, name: L('残缺的乐谱', 'Torn Score'), desc: L('本房间内每次回溯，伤害 +{g:6%}（最多 5 层）。', 'Each rewind this room grants +{g:6%} damage (max 5).'), flavor: L('一首华尔兹，停在了最后一个小节。', 'A waltz, stopped on its final bar.'), hook: (c) => { let n = 0; c.onMine('rewind', () => { if (n < 5) { n++; c.lo.mods.dmg += 0.06; } }); } },
  { id: 'sealing_wax', icon: 'wax', rarity: 1, name: L('封蜡', 'Sealing Wax'), desc: L('每个房间受到的第一次伤害无效。', 'The first hit you take in each room is ignored.'), flavor: L('还没拆开的信，不算坏消息。', 'An unopened letter is not yet bad news.'), mods: (m) => { m.firstHitShield = 1; } },
  { id: 'twin_mirror', icon: 'mirror', rarity: 2, name: L('双生镜', 'Twin Mirror'), desc: L('回溯时额外生成一个镜像{c:残响}（50% 伤害）。', 'Rewinding also spawns a mirrored {c:Echo} (50% damage).'), flavor: L('镜子里的你，左右颠倒，却同样勇敢。', 'Your reflection is reversed — and just as brave.'), mods: (m) => { m.mirrorEcho = 1; } },
  { id: 'hearth_ember', icon: 'ember', rarity: 0, name: L('炉火余温', 'Hearth Ember'), desc: L('每次清场恢复 {y:5} 点生命。', 'Heal {y:5} after each room.'), flavor: L('奥伦的灯里取出的一点火。', 'A spark from Oren\'s lamp.'), hook: (c) => c.on('roomClear', () => { if (c.p.state !== 'alive') return; c.p.hp = Math.min(c.p.maxHp, c.p.hp + 5); c.w.fx.number(c.p.x, c.p.y - 26, 5, 'G4', false); }) },
  { id: 'anvil', icon: 'anvil', rarity: 0, name: L('铁砧', 'Anvil'), desc: L('击退 +{g:50%}；被撞上墙的敌人受到 {g:12} 点伤害。', 'Knockback +{g:50%}; enemies slammed into walls take {g:12} damage.'), flavor: L('锤，锤，锤。', 'Hammer, hammer, hammer.'), mods: (m) => { m.knockMul += 0.5; m.wallSlam += 12; } },
  { id: 'pendulum', icon: 'pendulum', rarity: 1, name: L('小摆锤', 'Little Pendulum'), desc: L('冲刺后 1 秒内，下一次攻击伤害 +{g:50%}。', 'Within 1s after a dash, your next attack deals +{g:50%}.'), flavor: L('往左，往右，然后——', 'Left, right, and then—'), hook: (c) => { let t = -9; c.onMine('dash', (e) => { if (!e.echo) t = c.w.time; }); c.onMine('attack', (e) => { if (!e.echo && c.w.time - t < 1) { c.p.dmgScale = 1.5; c.w.after(0.12, () => (c.p.dmgScale = 1), c.p); t = -9; } }); } },
  { id: 'lantern', icon: 'lantern', rarity: 0, name: L('提灯', 'Lantern'), desc: L('开局时最大生命 +{y:10}，并恢复 {y:10}。', 'Max HP +{y:10}.'), flavor: L('点灯人的灯从不熄灭。', "The lamplighter's lamp never goes out."), mods: (m) => { m.maxHp += 10; } },
  // cracked (cursed)
  { id: 'rusted_crown', icon: 'crown', rarity: 2, cursed: true, name: L('锈蚀王冠', 'Rusted Crown'), desc: L('伤害 +{g:40%}；最大生命 -{r:15}。', 'Damage +{g:40%}; max HP -{r:15}.'), flavor: L('戴上它，你会变成另一个人。', 'Wear it, and you become someone else.'), mods: (m) => { m.dmg += 0.4; m.maxHp -= 15; } },
  { id: 'snapped_spring', icon: 'spring', rarity: 1, cursed: true, name: L('断裂发条', 'Snapped Spring'), desc: L('冲刺次数 +{g:1}；冲刺无敌时间 -{r:50%}。', '+{g:1} dash; dash invulnerability -{r:50%}.'), flavor: L('它会突然弹开，没人知道什么时候。', 'It snaps loose without warning.'), mods: (m) => { m.dashCharges += 1; m.dashInvuln *= 0.5; } },
  { id: 'black_sand', icon: 'blacksand', rarity: 2, cursed: true, name: L('黑沙', 'Black Sand'), desc: L('{c:时砂}获取 +{g:60%}；回溯不再恢复生命。', '{c:Sand} gain +{g:60%}; rewinding no longer restores health.'), flavor: L('这些沙子流向的不是过去。', 'This sand does not flow toward the past.'), mods: (m) => { m.sandGain *= 1.6; m.noRewindHeal = 1; } },
];
export const PARTS_BY_ID: Record<string, PartDef> = Object.fromEntries(PARTS.map((p) => [p.id, p]));
void sfx;
