// 回忆 Memories — the five frozen patrons lend you their knack. Data-driven boons.
import type { Mods, Run, Loadout } from '../run';
import type { World } from '../world/world';
import type { Player } from '../entities/player';
import type { BusEvents } from '../systems/bus';
import type { DamageInfo } from '../systems/combat';
import { L, L10n } from '../i18n';
import { FireZone, Shockwave, Turret, GearMine, HealFlower, VineZone } from './effectEnts';
import { Bullet } from '../entities/projectile';
import { sfx } from '../G';

export type Patron = 'oren' | 'pip' | 'marta' | 'fen' | 'asu';
export type Slot = 'attack' | 'special' | 'dash' | 'rewind' | 'echo' | 'passive' | 'legendary' | 'duo';
export const EXCLUSIVE_SLOTS: Slot[] = ['attack', 'special', 'dash', 'rewind', 'echo'];

export interface PatronDef {
  id: Patron;
  name: L10n;
  title: L10n;
  color: string;
  dark: string;
  status: L10n;
  /** spoken when offering memories */
  lines: L10n[];
}

export const PATRONS: Record<Patron, PatronDef> = {
  oren: {
    id: 'oren', name: L('奥伦', 'Oren'), title: L('点灯人', 'the Lamplighter'), color: 'O3', dark: 'O1', status: L('灼烧', 'Burn'),
    lines: [L('每盏灯都要有人去点亮。拿去吧，孩子。', 'Every lamp needs someone to light it. Take this, little one.'), L('她还在等我回家……告诉她，我不冷。', "She's still waiting for me to come home... tell her I'm not cold."), L('火光会记得你走过的路。', 'Firelight remembers the path you walked.')],
  },
  pip: {
    id: 'pip', name: L('皮普', 'Pip'), title: L('钟匠学徒', "the Apprentice"), color: 'G4', dark: 'G2', status: L('齿轮', 'Gearwork'),
    lines: [L('伊妮丝师傅教过我：齿轮从不孤单。', 'Master Ines taught me: a gear is never alone.'), L('嘿！我做的小玩意儿终于派上用场啦！', "Hey! My little gadgets are finally useful!"), L('拧紧一点……再紧一点……好了！', 'A bit tighter... tighter... there!')],
  },
  marta: {
    id: 'marta', name: L('玛尔塔', 'Marta'), title: L('敲钟人', 'the Bellringer'), color: 'U4', dark: 'U2', status: L('共鸣', 'Resonance'),
    lines: [L('钟声只差最后一下。替我敲响它。', 'The bell is one stroke from midnight. Ring it for me.'), L('听——你的心跳和钟摆是同一个节拍。', 'Listen — your heart and the pendulum keep the same beat.'), L('回声会回来的，它总会回来。', 'An echo always returns. Always.')],
  },
  fen: {
    id: 'fen', name: L('芬', 'Fen'), title: L('温室园丁', 'the Gardener'), color: 'T4', dark: 'T2', status: L('锈蚀', 'Rust'),
    lines: [L('锈也是一种生长，只是慢一点。', 'Rust is growth too — just slower.'), L('花不需要时间也能开吗？……我想试试看。', 'Can a flower bloom without time? I want to find out.'), L('别怕伤口，它会长出新芽。', "Don't fear the wound. Something grows there.")],
  },
  asu: {
    id: 'asu', name: L('阿苏', 'Asu'), title: L('观星者', 'the Stargazer'), color: 'V4', dark: 'V2', status: L('定格', 'Stasis'),
    lines: [L('星星也停住了。真安静啊。', 'Even the stars have stopped. How quiet.'), L('定格不是终结，是一次深呼吸。', 'Stillness is not an ending. It is a held breath.'), L('我数过了，这一秒有无穷多个瞬间。', 'I counted. This one second holds infinite moments.')],
  },
};

/** what an item's hook sees (PLAN2 §1.5): the room, the shared run, its own hand and loadout */
export interface HookCtx {
  w: World;
  run: Run;
  lo: Loadout;
  p: Player;
  /** every event of this kind */
  on<K extends keyof BusEvents>(k: K, fn: (e: BusEvents[K]) => void): void;
  /** only events that belong to this hand (e.player === p) */
  onMine<K extends keyof BusEvents>(k: K, fn: (e: BusEvents[K]) => void): void;
}

export interface MemoryDef {
  id: string;
  patron: Patron;
  slot: Slot;
  name: L10n;
  desc: (v: number) => L10n;
  /** value by rarity: common, rare, epic, heroic */
  v: [number, number, number, number];
  mods?: (m: Mods, v: number) => void;
  hook?: (c: HookCtx, v: number) => void;
  /** availability (legendary / duo requirements), for the hand being offered */
  requires?: (lo: Loadout) => boolean;
  duo?: [Patron, Patron];
}

const isAtk = (i: DamageInfo) => i.via === 'attack';
const isSpc = (i: DamageInfo) => i.via === 'special';
const R = (a: number, b: number, c: number, d: number): [number, number, number, number] => [a, b, c, d];
const hasPatron = (lo: Loadout, p: Patron, n = 1) => lo.memories.filter((m) => MEMORIES[m.id]?.patron === p && MEMORIES[m.id]?.slot !== 'duo').length >= n;

const list: MemoryDef[] = [
  // ───────────────────────── OREN · fire ─────────────────────────
  {
    id: 'oren_attack', patron: 'oren', slot: 'attack', name: L('引燃之刃', 'Kindling Blade'), v: R(2, 3, 4, 5),
    desc: (v) => L(`攻击施加 {o:${v}} 层{o:灼烧}。`, `Attacks apply {o:${v}} {o:Burn}.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (isAtk(e.info)) c.w.combat.addStatus(e.target, 'burn', v, c.p); }),
  },
  {
    id: 'oren_special', patron: 'oren', slot: 'special', name: L('余烬突刺', 'Ember Lunge'), v: R(4, 6, 8, 10),
    desc: (v) => L(`特技施加 {o:${v}} 层{o:灼烧}，并在路径上留下火焰。`, `Special applies {o:${v}} {o:Burn} and leaves fire along its path.`),
    hook: (c, v) => {
      c.onMine('hit', (e) => { if (isSpc(e.info)) c.w.combat.addStatus(e.target, 'burn', v, c.p); });
      c.onMine('special', (e) => { for (let i = 0; i < 4; i++) c.w.add(new FireZone(e.owner.x + Math.cos(e.angle) * i * 18, e.owner.y + Math.sin(e.angle) * i * 18, 12, 2, 1, c.p)); });
    },
  },
  {
    id: 'oren_dash', patron: 'oren', slot: 'dash', name: L('火线', 'Trail of Flame'), v: R(1, 2, 2, 3),
    desc: (v) => L(`冲刺留下燃烧的足迹，每 0.4 秒施加 {o:${v}} 层{o:灼烧}。`, `Dashing leaves burning footprints applying {o:${v}} {o:Burn} every 0.4s.`),
    hook: (c, v) => c.onMine('dash', (e) => {
      const o = e.owner;
      for (let i = 0; i < 3; i++) c.w.after(i * 0.045, () => c.w.add(new FireZone(o.x, o.y, 11, 1.8, v, c.p)), c.p);
    }),
  },
  {
    id: 'oren_rewind', patron: 'oren', slot: 'rewind', name: L('灯芯回溯', 'Wick Rewind'), v: R(20, 28, 36, 45),
    desc: (v) => L(`回溯时，你倒流经过的路径燃起火焰，造成 {g:${v}} 点伤害并施加{o:灼烧}。`, `When you rewind, the path you flow back along ignites for {g:${v}} damage and {o:Burn}.`),
    hook: (c, v) => c.onMine('rewind', (e) => {
      const n = 6;
      for (let i = 0; i <= n; i++) {
        const x = e.fromX + ((e.toX - e.fromX) * i) / n, y = e.fromY + ((e.toY - e.fromY) * i) / n;
        c.w.add(new FireZone(x, y, 14, 2.5, 2, c.p));
        for (const t of c.w.enemiesNear(x, y, 18)) t.hurt({ amount: v / 2, kind: 'aoe', owner: c.p, x, y, via: 'memory', burn: 2 });
      }
      sfx('corrode', { vol: 0.5 });
    }),
  },
  {
    id: 'oren_echo', patron: 'oren', slot: 'echo', name: L('回响余烬', 'Echoing Embers'), v: R(2, 3, 4, 5),
    desc: (v) => L(`{c:残响}的攻击施加 {o:${v}} 层{o:灼烧}。`, `{c:Echo} attacks apply {o:${v}} {o:Burn}.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.echo) c.w.combat.addStatus(e.target, 'burn', v, c.p); }),
  },
  {
    id: 'oren_hearth', patron: 'oren', slot: 'passive', name: L('炉火', 'Hearth'), v: R(40, 55, 70, 90),
    desc: (v) => L(`{o:灼烧}伤害 +{g:${v}%}。`, `{o:Burn} damage +{g:${v}%}.`),
    mods: (m, v) => { m.burnMul += v / 100; },
  },
  {
    id: 'oren_ashes', patron: 'oren', slot: 'passive', name: L('灰烬', 'Ashes'), v: R(18, 24, 30, 38),
    desc: (v) => L(`{o:灼烧}中的敌人死亡时爆炸，造成 {g:${v}} 点伤害。`, `{o:Burning} enemies explode on death for {g:${v}} damage.`),
    hook: (c, v) => c.onMine('kill', (e) => {
      if (e.target.st.burn <= 0) return;
      const { x, y } = e.target;
      for (const t of c.w.enemiesNear(x, y, 34)) if (t !== e.target) t.hurt({ amount: v, kind: 'aoe', owner: c.p, x, y, via: 'memory', burn: 2, knock: 80 });
      c.w.fx.burst(x, y - 6, 18, ['O4', 'O3', 'O2', 'O1'], 150, 0.4);
      c.w.fx.ring(x, y, 3, 34, 0.3, 'O3', 2);
    }),
  },
  {
    id: 'oren_stoke', patron: 'oren', slot: 'passive', name: L('添柴', 'Stoke'), v: R(4, 6, 8, 10),
    desc: (v) => L(`{o:灼烧}层数上限 +{g:${v}}。`, `{o:Burn} stack limit +{g:${v}}.`),
    mods: (m, v) => { m.burnMax += v; },
  },
  {
    id: 'oren_legend', patron: 'oren', slot: 'legendary', name: L('长明灯', 'Everlamp'), v: R(1, 1, 1, 1),
    desc: () => L('{o:灼烧}不再熄灭，且每秒结算两次。', '{o:Burn} never goes out and ticks twice as fast.'),
    requires: (r) => hasPatron(r, 'oren', 3),
    hook: (c) => c.on('tick', () => { for (const e of c.w.enemies) if (e.st.burn > 0 && (e.st.burnBy ?? c.p) === c.p) { e.st.burnT = 4; e.st.burnTick = Math.min(e.st.burnTick, 0.25); } }),
  },

  // ───────────────────────── PIP · gears ─────────────────────────
  {
    id: 'pip_attack', patron: 'pip', slot: 'attack', name: L('齿刃', 'Cog Blade'), v: R(10, 13, 16, 20),
    desc: (v) => L(`每第 3 次攻击掷出一枚穿透齿轮，造成 {g:${v}} 点伤害。`, `Every 3rd attack flings a piercing gear for {g:${v}} damage.`),
    hook: (c, v) => {
      let n = 0;
      c.onMine('attack', (e) => {
        if (e.echo) return;
        if (++n % 3) return;
        c.w.add(new Bullet({ team: 'player', x: e.owner.x, y: e.owner.y - 8, ang: e.angle, speed: 280, dmg: v * c.lo.mods.dmg, style: 'orb', r: 3, owner: c.p, pierce: 3, pal: ['W', 'G4', 'B4'], info: { via: 'construct' } }));
        sfx('spit', { vol: 0.4 });
      });
    },
  },
  {
    id: 'pip_special', patron: 'pip', slot: 'special', name: L('袖珍炮台', 'Pocket Turret'), v: R(5, 6, 7, 9),
    desc: (v) => L(`使用特技时，在原地部署一座炮台，持续 5 秒，每发 {g:${v}} 点伤害。`, `Your Special deploys a turret for 5s that fires {g:${v}}-damage bolts.`),
    hook: (c, v) => c.onMine('special', (e) => { if (!e.echo) c.w.add(new Turret(e.owner.x, e.owner.y, 5 * c.lo.mods.constructDur, v * c.lo.mods.constructDmg, 0.5 / c.lo.mods.constructRate, {}, c.p)); }),
  },
  {
    id: 'pip_dash', patron: 'pip', slot: 'dash', name: L('弹簧地雷', 'Spring Mine'), v: R(18, 24, 30, 38),
    desc: (v) => L(`冲刺时留下一枚齿轮地雷，1 秒后爆炸造成 {g:${v}} 点伤害。`, `Dashing drops a gear mine that explodes after 1s for {g:${v}} damage.`),
    hook: (c, v) => c.onMine('dash', (e) => { if (!e.echo) c.w.add(new GearMine(e.owner.x, e.owner.y, v * c.lo.mods.constructDmg, 1, {}, undefined, c.p)); }),
  },
  {
    id: 'pip_rewind', patron: 'pip', slot: 'rewind', name: L('机械记忆', 'Mechanical Memory'), v: R(4, 5, 6, 8),
    desc: (v) => L(`回溯时，在你离开的位置留下一座炮台，持续 {g:${v}} 秒。`, `When you rewind, leave a turret where you were for {g:${v}}s.`),
    hook: (c, v) => c.onMine('rewind', (e) => { c.w.add(new Turret(e.fromX, e.fromY, v * c.lo.mods.constructDur, 6 * c.lo.mods.constructDmg, 0.45 / c.lo.mods.constructRate, {}, c.p)); }),
  },
  {
    id: 'pip_echo', patron: 'pip', slot: 'echo', name: L('残响机关', 'Echo Clockwork'), v: R(14, 18, 22, 28),
    desc: (v) => L(`{c:残响}每秒沿途放下一枚齿轮地雷（{g:${v}} 点伤害）。`, `{c:Echoes} drop a gear mine every second ({g:${v}} damage).`),
    hook: (c, v) => {
      const timers = new Map<number, number>();
      c.on('tick', (e) => {
        for (const ec of c.p.echoes) {
          if (ec.dead) continue;
          const t = (timers.get(ec.id) ?? 0.4) - e.dt;
          if (t <= 0) { c.w.add(new GearMine(ec.x, ec.y, v * c.lo.mods.constructDmg, 0.9, {}, undefined, c.p)); timers.set(ec.id, 1); }
          else timers.set(ec.id, t);
        }
      });
    },
  },
  {
    id: 'pip_precision', patron: 'pip', slot: 'passive', name: L('精密', 'Precision'), v: R(8, 11, 14, 18),
    desc: (v) => L(`暴击率 +{g:${v}%}。`, `Critical chance +{g:${v}%}.`),
    mods: (m, v) => { m.critChance += v / 100; },
  },
  {
    id: 'pip_tuning', patron: 'pip', slot: 'passive', name: L('微调', 'Fine-Tuning'), v: R(35, 50, 65, 80),
    desc: (v) => L(`炮台、地雷与齿轮造成的伤害 +{g:${v}%}。`, `Turrets, mines and gears deal +{g:${v}%} damage.`),
    mods: (m, v) => { m.constructDmg += v / 100; },
  },
  {
    id: 'pip_spring', patron: 'pip', slot: 'passive', name: L('双发条', 'Twin Springs'), v: R(1, 1, 1, 2),
    desc: (v) => L(`冲刺次数 +{g:${v}}，冲刺冷却 -15%。`, `+{g:${v}} dash charge, dash cooldown -15%.`),
    mods: (m, v) => { m.dashCharges += v; m.dashCd *= 0.85; },
  },
  {
    id: 'pip_legend', patron: 'pip', slot: 'legendary', name: L('永动机', 'Perpetual Engine'), v: R(1, 1, 1, 1),
    desc: () => L('所有造物持续时间翻倍，射速翻倍。', 'All constructs last twice as long and fire twice as fast.'),
    requires: (r) => hasPatron(r, 'pip', 3),
    mods: (m) => { m.constructDur *= 2; m.constructRate *= 2; },
  },

  // ───────────────────────── MARTA · resonance ─────────────────────────
  {
    id: 'marta_attack', patron: 'marta', slot: 'attack', name: L('鸣刃', 'Ringing Blade'), v: R(1, 1, 2, 2),
    desc: (v) => L(`攻击施加 {b:${v}} 层{b:共鸣}。被{c:残响}或{c:悖论}命中时，{b:共鸣}会被敲响，造成范围伤害。`, `Attacks apply {b:${v}} {b:Resonance}. When an {c:Echo} or {c:Paradox} hits a resonant enemy, it rings for area damage.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (isAtk(e.info) && !e.info.echo) c.w.combat.addStatus(e.target, 'resonance', v, c.p); }),
  },
  {
    id: 'marta_special', patron: 'marta', slot: 'special', name: L('钟鸣', 'Toll'), v: R(20, 26, 32, 40),
    desc: (v) => L(`特技结束时发出冲击波，造成 {g:${v}} 点伤害并施加 1 层{b:共鸣}。`, `Your Special ends with a shockwave dealing {g:${v}} damage and 1 {b:Resonance}.`),
    hook: (c, v) => c.onMine('special', (e) => {
      const o = e.owner;
      c.w.after(0.16, () => c.w.add(new Shockwave(o.x, o.y - 4, 50, { amount: v * c.lo.mods.dmg, kind: 'aoe', owner: c.p, knock: 160, via: 'memory', resonance: 1, echo: e.echo })), c.p);
      sfx('wave', { vol: 0.5 });
    }),
  },
  {
    id: 'marta_dash', patron: 'marta', slot: 'dash', name: L('回声步', 'Echo Step'), v: R(10, 14, 18, 22),
    desc: (v) => L(`冲刺结束时发出小型冲击波（{g:${v}} 点伤害），施加{b:共鸣}。`, `Dashes end with a small shockwave ({g:${v}} damage) that applies {b:Resonance}.`),
    hook: (c, v) => c.onMine('dashEnd', (e) => { c.w.add(new Shockwave(e.owner.x, e.owner.y - 4, 34, { amount: v, kind: 'aoe', owner: c.p, knock: 100, via: 'memory', resonance: 1 })); }),
  },
  {
    id: 'marta_rewind', patron: 'marta', slot: 'rewind', name: L('晚钟', 'Vesper'), v: R(28, 36, 45, 56),
    desc: (v) => L(`回溯时敲响一记大钟：在你周围造成 {g:${v}} 点伤害并眩晕敌人 1 秒。`, `Rewinding tolls a great bell: {g:${v}} damage around you and stuns enemies for 1s.`),
    hook: (c, v) => c.onMine('rewind', (e) => {
      c.w.add(new Shockwave(e.toX, e.toY - 4, 90, { amount: v * c.lo.mods.dmg, kind: 'aoe', owner: c.p, knock: 220, via: 'memory', stun: 1 }, 'U4', 0.4));
      sfx('waveStart', { vol: 0.6 });
      c.w.shake(0.3);
    }),
  },
  {
    id: 'marta_echo', patron: 'marta', slot: 'echo', name: L('共振体', 'Resonant Body'), v: R(1, 1, 2, 2),
    desc: (v) => L(`{c:残响}的攻击施加 {b:${v}} 层{b:共鸣}。`, `{c:Echo} attacks apply {b:${v}} {b:Resonance}.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.echo && e.info.via !== 'resonance') c.w.combat.addStatus(e.target, 'resonance', v, c.p); }),
  },
  {
    id: 'marta_greatbell', patron: 'marta', slot: 'passive', name: L('洪钟', 'Great Bell'), v: R(50, 70, 90, 120),
    desc: (v) => L(`{b:共鸣}敲响的伤害 +{g:${v}%}。`, `{b:Resonance} ring damage +{g:${v}%}.`),
    mods: (m, v) => { m.resonanceDmg += v / 100; },
  },
  {
    id: 'marta_linger', patron: 'marta', slot: 'passive', name: L('余音', 'Lingering Note'), v: R(2, 2, 3, 4),
    desc: (v) => L(`{b:共鸣}层数上限 +{g:${v}}。`, `{b:Resonance} stack limit +{g:${v}}.`),
    mods: (m, v) => { m.resonanceMax += v; },
  },
  {
    id: 'marta_chorus', patron: 'marta', slot: 'passive', name: L('合唱', 'Chorus'), v: R(30, 40, 55, 70),
    desc: (v) => L(`{c:悖论}范围 +{g:${v}%}，伤害 +{g:${v}%}。`, `{c:Paradox} radius and damage +{g:${v}%}.`),
    mods: (m, v) => { m.paradoxRadius *= 1 + v / 100; m.paradoxDmg *= 1 + v / 100; },
  },
  {
    id: 'marta_legend', patron: 'marta', slot: 'legendary', name: L('午夜钟声', 'Midnight Peal'), v: R(1, 1, 1, 1),
    desc: () => L('每命中 12 次，自动敲响一次大钟（50 点范围伤害并施加{b:共鸣}）。', 'Every 12 hits automatically tolls a great bell (50 area damage and {b:Resonance}).'),
    requires: (r) => hasPatron(r, 'marta', 3),
    hook: (c) => {
      let n = 0;
      c.onMine('hit', (e) => {
        if (e.info.via === 'memory' || e.info.via === 'resonance') return;
        if (++n % 12) return;
        c.w.add(new Shockwave(c.p.x, c.p.y - 4, 80, { amount: 50 * c.lo.mods.dmg, kind: 'aoe', owner: c.p, knock: 180, via: 'memory', resonance: 1 }, 'U4', 0.35));
        sfx('wave', { vol: 0.6 });
      });
    },
  },

  // ───────────────────────── FEN · rust & growth ─────────────────────────
  {
    id: 'fen_attack', patron: 'fen', slot: 'attack', name: L('锈刃', 'Rusting Blade'), v: R(1, 1, 2, 2),
    desc: (v) => L(`攻击施加 {t:${v}} 层{t:锈蚀}（每层使敌人受到伤害 +4%，满 10 层腐蚀爆发）。`, `Attacks apply {t:${v}} {t:Rust} (+4% damage taken per stack; at 10 stacks it corrodes).`),
    hook: (c, v) => c.onMine('hit', (e) => { if (isAtk(e.info)) c.w.combat.addStatus(e.target, 'rust', v, c.p); }),
  },
  {
    id: 'fen_special', patron: 'fen', slot: 'special', name: L('荆棘冲刺', 'Thorn Lunge'), v: R(3, 4, 5, 6),
    desc: (v) => L(`特技施加 {t:${v}} 层{t:锈蚀}并使敌人减速。`, `Special applies {t:${v}} {t:Rust} and slows enemies.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (isSpc(e.info)) { c.w.combat.addStatus(e.target, 'rust', v, c.p); e.target.st.slow = 2; e.target.st.slowAmt = 0.5; } }),
  },
  {
    id: 'fen_dash', patron: 'fen', slot: 'dash', name: L('藤蔓', 'Creeping Vines'), v: R(2, 2.5, 3, 4),
    desc: (v) => L(`冲刺留下藤蔓 {g:${v}} 秒，减速并施加{t:锈蚀}。`, `Dashing leaves vines for {g:${v}}s that slow and {t:Rust} enemies.`),
    hook: (c, v) => c.onMine('dash', (e) => {
      const o = e.owner;
      for (let i = 0; i < 3; i++) c.w.after(i * 0.045, () => c.w.add(new VineZone(o.x, o.y, v, c.p)), c.p);
    }),
  },
  {
    id: 'fen_rewind', patron: 'fen', slot: 'rewind', name: L('新芽', 'Sprout'), v: R(4, 6, 8, 10),
    desc: (v) => L(`回溯时，在你倒流的路径上长出花朵，每朵恢复 {y:${v}} 点生命。`, `Rewinding grows flowers along your path; each heals {y:${v}}.`),
    hook: (c, v) => c.onMine('rewind', (e) => {
      for (let i = 1; i <= 3; i++) c.w.add(new HealFlower(e.fromX + ((e.toX - e.fromX) * i) / 4, e.fromY + ((e.toY - e.fromY) * i) / 4, v, 10, c.p));
    }),
  },
  {
    id: 'fen_echo', patron: 'fen', slot: 'echo', name: L('孢子残响', 'Spore Echo'), v: R(1, 1, 2, 2),
    desc: (v) => L(`{c:残响}的攻击施加 {t:${v}} 层{t:锈蚀}。`, `{c:Echo} attacks apply {t:${v}} {t:Rust}.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.echo) c.w.combat.addStatus(e.target, 'rust', v, c.p); }),
  },
  {
    id: 'fen_corrosion', patron: 'fen', slot: 'passive', name: L('腐蚀', 'Corrosion'), v: R(60, 80, 100, 130),
    desc: (v) => L(`{t:锈蚀}爆发伤害 +{g:${v}%}，且{t:锈蚀}的增伤效果 +25%。`, `{t:Corrode} bursts deal +{g:${v}%} and {t:Rust} amplification is 25% stronger.`),
    mods: (m, v) => { m.corrodeMul += v / 100; m.rustPower += 0.25; },
  },
  {
    id: 'fen_bloom', patron: 'fen', slot: 'passive', name: L('繁茂', 'Bloom'), v: R(6, 8, 10, 13),
    desc: (v) => L(`每次清场恢复 {y:${v}} 点生命。`, `Heal {y:${v}} after clearing each room.`),
    hook: (c, v) => c.on('roomClear', () => {
      if (c.p.state !== 'alive') return;
      const h = Math.round(v * c.lo.mods.healMul);
      c.p.hp = Math.min(c.p.maxHp, c.p.hp + h);
      c.w.fx.number(c.p.x, c.p.y - 26, h, 'G4', true);
      sfx('heal', { vol: 0.6 });
    }),
  },
  {
    id: 'fen_roots', patron: 'fen', slot: 'passive', name: L('深根', 'Deep Roots'), v: R(12, 16, 20, 26),
    desc: (v) => L(`最大生命 +{y:${v}}。`, `Max HP +{y:${v}}.`),
    mods: (m, v) => { m.maxHp += v; },
  },
  {
    id: 'fen_legend', patron: 'fen', slot: 'legendary', name: L('永春', 'Evergreen'), v: R(1, 1, 1, 1),
    desc: () => L('每个房间一次：生命将降至 25% 以下时，立即恢复至 50%。', 'Once per room: when you would fall below 25% HP, heal to 50%.'),
    requires: (r) => hasPatron(r, 'fen', 3),
    hook: (c) => {
      let used = false;
      c.onMine('damaged', () => {
        if (used || c.p.hp <= 0 || c.p.hp > c.p.maxHp * 0.25) return;
        used = true;
        c.p.hp = Math.round(c.p.maxHp * 0.5);
        c.w.fx.banner(c.p.x, c.p.y - 34, '永春', 'T5', 1.2);
        c.w.fx.burst(c.p.x, c.p.y - 8, 24, ['G4', 'T5', 'G3'], 120, 0.6);
        sfx('heal');
      });
    },
  },

  // ───────────────────────── ASU · stasis ─────────────────────────
  {
    id: 'asu_attack', patron: 'asu', slot: 'attack', name: L('定格之刃', 'Still Blade'), v: R(1, 1.2, 1.4, 1.7),
    desc: (v) => L(`每第 4 次攻击命中使敌人{v:定格} {g:${v}} 秒（期间受到的伤害被储存，结束时 150% 释放）。`, `Every 4th attack hit puts the enemy in {v:Stasis} for {g:${v}}s (damage taken is stored and released at 150%).`),
    hook: (c, v) => { let n = 0; c.onMine('hit', (e) => { if (isAtk(e.info) && !e.info.echo && ++n % 4 === 0) c.w.combat.addStatus(e.target, 'stasis', v, c.p); }); },
  },
  {
    id: 'asu_special', patron: 'asu', slot: 'special', name: L('星轨', 'Star Lunge'), v: R(1.2, 1.4, 1.7, 2),
    desc: (v) => L(`特技命中的敌人被{v:定格} {g:${v}} 秒。`, `Enemies hit by your Special enter {v:Stasis} for {g:${v}}s.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (isSpc(e.info)) c.w.combat.addStatus(e.target, 'stasis', v, c.p); }),
  },
  {
    id: 'asu_dash', patron: 'asu', slot: 'dash', name: L('刹那', 'Instant'), v: R(0.5, 0.6, 0.75, 0.9),
    desc: (v) => L(`在敌人攻击时冲刺（完美闪避）会让时间变慢 {g:${v}} 秒。`, `Dashing through an enemy attack (perfect dodge) slows time for {g:${v}}s.`),
    hook: (c, v) => c.onMine('perfectDodge', (e) => { c.w.slowmo(0.35, v); c.w.fx.ring(e.x, e.y - 6, 4, 40, 0.4, 'V4', 2); sfx('stasis'); }),
  },
  {
    id: 'asu_rewind', patron: 'asu', slot: 'rewind', name: L('时之锚', 'Time Anchor'), v: R(1.2, 1.5, 1.8, 2.2),
    desc: (v) => L(`回溯时，120 像素内的敌人被{v:定格} {g:${v}} 秒。`, `When you rewind, enemies within 120px enter {v:Stasis} for {g:${v}}s.`),
    hook: (c, v) => c.onMine('rewind', (e) => {
      for (const t of c.w.enemiesNear(e.toX, e.toY, 120)) c.w.combat.addStatus(t, 'stasis', v, c.p);
      c.w.fx.ring(e.toX, e.toY - 4, 6, 120, 0.5, 'V4', 2);
    }),
  },
  {
    id: 'asu_echo', patron: 'asu', slot: 'echo', name: L('星之残响', 'Starlit Echo'), v: R(0.4, 0.5, 0.6, 0.8),
    desc: (v) => L(`{c:残响}的攻击使敌人{v:定格} {g:${v}} 秒。`, `{c:Echo} attacks put enemies in {v:Stasis} for {g:${v}}s.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.echo && e.info.via === 'attack' && e.target.st.stasis <= 0) c.w.combat.addStatus(e.target, 'stasis', v, c.p); }),
  },
  {
    id: 'asu_eternity', patron: 'asu', slot: 'passive', name: L('永恒', 'Eternity'), v: R(40, 55, 70, 90),
    desc: (v) => L(`{v:定格}释放的伤害 +{g:${v}%}。`, `{v:Stasis} release damage +{g:${v}%}.`),
    mods: (m, v) => { m.stasisMul += v / 100; },
  },
  {
    id: 'asu_observe', patron: 'asu', slot: 'passive', name: L('观测', 'Observation'), v: R(20, 28, 36, 45),
    desc: (v) => L(`{c:残响}伤害 +{g:${v}%}。`, `{c:Echo} damage +{g:${v}%}.`),
    mods: (m, v) => { m.echoDmg += v / 100 * 0.6; },
  },
  {
    id: 'asu_starmap', patron: 'asu', slot: 'passive', name: L('星图', 'Star Chart'), v: R(0.5, 0.6, 0.75, 1),
    desc: (v) => L(`回溯窗口 +{g:${v}} 秒（记录更久的过去）。`, `Rewind window +{g:${v}}s (you remember further back).`),
    mods: (m, v) => { m.rewindWindow += v; },
  },
  {
    id: 'asu_legend', patron: 'asu', slot: 'legendary', name: L('时停', 'Time Stop'), v: R(1.6, 1.6, 1.6, 1.6),
    desc: (v) => L(`回溯时，所有敌人被{v:定格} {g:${v}} 秒。`, `When you rewind, ALL enemies enter {v:Stasis} for {g:${v}}s.`),
    requires: (r) => hasPatron(r, 'asu', 3),
    hook: (c, v) => c.onMine('rewind', () => { for (const t of c.w.enemies) c.w.combat.addStatus(t, 'stasis', v, c.p); G_flash(); }),
  },

  // ───────────────────────── DUO memories ─────────────────────────
  {
    id: 'duo_firebell', patron: 'oren', duo: ['oren', 'marta'], slot: 'duo', name: L('炽钟', 'Firebell'), v: R(3, 3, 4, 5),
    desc: (v) => L(`{b:共鸣}敲响时施加 {o:${v}} 层{o:灼烧}。`, `{b:Resonance} rings apply {o:${v}} {o:Burn}.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.via === 'resonance') c.w.combat.addStatus(e.target, 'burn', v, c.p); }),
  },
  {
    id: 'duo_frozenflame', patron: 'oren', duo: ['oren', 'asu'], slot: 'duo', name: L('冻焰', 'Frozen Flame'), v: R(2, 2, 2.5, 3),
    desc: (v) => L(`{v:定格}中的敌人身上的{o:灼烧}伤害按 {g:${v}} 倍储存。`, `{o:Burn} damage on enemies in {v:Stasis} is stored at {g:${v}}x.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.via === 'burn' && e.target.st.stasis > 0) e.target.st.stasisStored += e.dealt * (v - 1); }),
  },
  {
    id: 'duo_wildfire', patron: 'oren', duo: ['oren', 'fen'], slot: 'duo', name: L('野火', 'Wildfire'), v: R(4, 5, 6, 8),
    desc: (v) => L(`{t:锈蚀}腐蚀爆发会点燃周围敌人（{o:${v}} 层{o:灼烧}）。`, `{t:Corrode} bursts ignite nearby enemies ({o:${v}} {o:Burn}).`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.via === 'corrode') for (const t of c.w.enemiesNear(e.target.x, e.target.y, 44)) c.w.combat.addStatus(t, 'burn', v, c.p); }),
  },
  {
    id: 'duo_forge', patron: 'pip', duo: ['pip', 'oren'], slot: 'duo', name: L('熔炉', 'Forge'), v: R(1, 2, 2, 3),
    desc: (v) => L(`炮台、地雷与齿轮施加 {o:${v}} 层{o:灼烧}。`, `Turrets, mines and gears apply {o:${v}} {o:Burn}.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.via === 'construct') c.w.combat.addStatus(e.target, 'burn', v, c.p); }),
  },
  {
    id: 'duo_clocktower', patron: 'pip', duo: ['pip', 'marta'], slot: 'duo', name: L('钟楼', 'Clocktower'), v: R(12, 15, 18, 24),
    desc: (v) => L(`炮台每 2 秒发出一圈冲击波（{g:${v}} 点伤害，施加{b:共鸣}）。`, `Turrets emit a shockwave every 2s ({g:${v}} damage, applies {b:Resonance}).`),
    hook: (c, v) => {
      const timers = new Map<number, number>();
      c.on('tick', (e) => {
        for (const t of c.w.entities) {
          if (!(t instanceof Turret) || t.dead || t.owner !== c.p) continue;
          const tt = (timers.get(t.id) ?? 1) - e.dt;
          if (tt <= 0) { c.w.add(new Shockwave(t.x, t.y - 4, 40, { amount: v, kind: 'aoe', owner: c.p, knock: 80, via: 'memory', resonance: 1 })); timers.set(t.id, 2); }
          else timers.set(t.id, tt);
        }
      });
    },
  },
  {
    id: 'duo_orrery', patron: 'pip', duo: ['pip', 'asu'], slot: 'duo', name: L('天文钟', 'Orrery'), v: R(0.3, 0.4, 0.5, 0.6),
    desc: (v) => L(`造物的攻击使敌人{v:定格} {g:${v}} 秒。`, `Construct hits put enemies in {v:Stasis} for {g:${v}}s.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.via === 'construct' && e.target.st.stasis <= 0) c.w.combat.addStatus(e.target, 'stasis', v, c.p); }),
  },
  {
    id: 'duo_garden', patron: 'pip', duo: ['pip', 'fen'], slot: 'duo', name: L('发条花园', 'Clockwork Garden'), v: R(2, 3, 3, 4),
    desc: (v) => L(`地雷爆炸后长出一朵花，恢复 {y:${v}} 点生命。`, `Exploding mines leave a flower that heals {y:${v}}.`),
    hook: (c, v) => c.on('tick', () => {
      for (const t of c.w.entities) if (t instanceof GearMine && !t.onBoom && t.owner === c.p) t.onBoom = (x, y) => c.w.add(new HealFlower(x, y, v, 6, c.p));
    }),
  },
  {
    id: 'duo_silentbell', patron: 'marta', duo: ['marta', 'asu'], slot: 'duo', name: L('寂静之钟', 'Silent Bell'), v: R(0.6, 0.7, 0.85, 1),
    desc: (v) => L(`{b:共鸣}敲响时使敌人{v:定格} {g:${v}} 秒。`, `{b:Resonance} rings put enemies in {v:Stasis} for {g:${v}}s.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.via === 'resonance' && e.target.st.stasis <= 0) c.w.combat.addStatus(e.target, 'stasis', v, c.p); }),
  },
  {
    id: 'duo_rustbell', patron: 'marta', duo: ['marta', 'fen'], slot: 'duo', name: L('锈钟', 'Rusted Bell'), v: R(2, 2, 3, 4),
    desc: (v) => L(`{b:共鸣}敲响时施加 {t:${v}} 层{t:锈蚀}。`, `{b:Resonance} rings apply {t:${v}} {t:Rust}.`),
    hook: (c, v) => c.onMine('hit', (e) => { if (e.info.via === 'resonance') c.w.combat.addStatus(e.target, 'rust', v, c.p); }),
  },
  {
    id: 'duo_spring', patron: 'fen', duo: ['fen', 'asu'], slot: 'duo', name: L('永恒之春', 'Eternal Spring'), v: R(1, 1, 2, 2),
    desc: (v) => L(`{v:定格}中的敌人每 0.25 秒获得 {t:${v}} 层{t:锈蚀}。`, `Enemies in {v:Stasis} gain {t:${v}} {t:Rust} every 0.25s.`),
    hook: (c, v) => { let t = 0; c.on('tick', (e) => { t -= e.dt; if (t > 0) return; t = 0.25; for (const en of c.w.enemies) if (en.st.stasis > 0 && (en.st.stasisBy ?? c.p) === c.p) c.w.combat.addStatus(en, 'rust', v, c.p); }); },
  },
];

function G_flash() { import('../G').then(({ G }) => (G.r.params.flash = 0.25)); }

export const MEMORIES: Record<string, MemoryDef> = Object.fromEntries(list.map((m) => [m.id, m]));
export const MEMORY_LIST = list;

/** memories of a patron that may currently be offered */
export function offerable(lo: Loadout, patron: Patron): MemoryDef[] {
  const owned = new Set(lo.memories.map((m) => m.id));
  return list.filter((m) => {
    if (owned.has(m.id)) return false;
    if (m.duo) {
      // duo offered by either patron if you own memories from both
      if (!m.duo.includes(patron)) return false;
      return hasPatron(lo, m.duo[0]) && hasPatron(lo, m.duo[1]);
    }
    if (m.patron !== patron) return false;
    if (m.requires && !m.requires(lo)) return false;
    return true;
  });
}
