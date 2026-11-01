// 校准 Calibrations — weapon-specific upgrades (from whetstone rewards).
import type { Mods } from '../run';
import type { HookCtx } from './memories';
import { L, L10n } from '../i18n';
import { Bullet } from '../entities/projectile';

export interface CalibrationDef {
  id: string;
  weapon: string;
  name: L10n;
  desc: L10n;
  max?: number;
  mods?: (m: Mods) => void;
  hook?: (c: HookCtx) => void;
  /** flags read by the weapon code */
  flag?: string;
}

export const CALIBRATIONS: CalibrationDef[] = [
  // ── Rapier ──
  { id: 'rp_swift', weapon: 'rapier', name: L('疾刺', 'Swift Point'), desc: L('攻击速度 +{g:20%}。', 'Attack speed +{g:20%}.'), max: 2, mods: (m) => { m.atkSpeed *= 1.2; } },
  { id: 'rp_reach', weapon: 'rapier', name: L('长针', 'Long Needle'), desc: L('刺击距离 +{g:40%}，伤害 +{g:10%}。', 'Thrust reach +{g:40%}, damage +{g:10%}.'), max: 1, flag: 'reach', mods: (m) => { m.dmg += 0.1; } },
  { id: 'rp_arc', weapon: 'rapier', name: L('满弧', 'Full Sweep'), desc: L('第三段横扫范围扩大，伤害 +{g:40%}。', 'Third-hit sweep is wider and deals +{g:40%}.'), max: 1, flag: 'arc' },
  { id: 'rp_wave', weapon: 'rapier', name: L('剑气', 'Second Wind'), desc: L('第三段横扫释放一道月牙剑气，造成 {g:16} 点伤害。', 'The third hit releases a crescent wave dealing {g:16}.'), max: 1, hook: (c) => c.onMine('attack', (e) => {
    if (e.combo !== 2) return;
    c.w.add(new Bullet({ team: 'player', x: e.owner.x, y: e.owner.y - 8, ang: e.angle, speed: 240, dmg: 16 * c.lo.mods.dmg * (e.echo ? c.lo.mods.echoDmg : 1), style: 'big', r: 5, owner: c.p, pierce: 6, life: 0.5, pal: e.echo ? ['W', 'C4', 'C2'] : ['W', 'B6', 'B4'], echo: e.echo, info: { via: 'attack' } }));
  }) },
  { id: 'rp_flurry', weapon: 'rapier', name: L('连刺', 'Flurry'), desc: L('特技沿路径连刺 {g:3} 次。', 'Special strikes {g:3} times along its path.'), max: 1, flag: 'flurry' },
  { id: 'rp_cd', weapon: 'rapier', name: L('轻巧', 'Featherweight'), desc: L('特技冷却 -{g:35%}，冲刺后可立即使用特技。', 'Special cooldown -{g:35%}.'), max: 1, mods: (m) => { m.specialCd *= 0.65; } },
  { id: 'rp_crit', weapon: 'rapier', name: L('精准', 'Pinpoint'), desc: L('刺击暴击率 +{g:15%}，暴击伤害 +{g:50%}。', 'Thrust crit chance +{g:15%}, crit damage +{g:50%}.'), max: 1, mods: (m) => { m.critChance += 0.15; m.critMult += 0.5; } },
  // ── Maul ──
  { id: 'ml_heavy', weapon: 'maul', name: L('加重', 'Lead Core'), desc: L('伤害 +{g:20%}，击退 +{g:30%}。', 'Damage +{g:20%}, knockback +{g:30%}.'), max: 2, mods: (m) => { m.dmg += 0.2; m.knockMul += 0.3; } },
  { id: 'ml_swift', weapon: 'maul', name: L('惯性', 'Momentum'), desc: L('攻击速度 +{g:18%}。', 'Attack speed +{g:18%}.'), max: 2, mods: (m) => { m.atkSpeed *= 1.18; } },
  { id: 'ml_quake', weapon: 'maul', name: L('震地', 'Quake'), desc: L('第二段砸地额外发出冲击波（{g:20} 点伤害）。', 'The overhead slam sends out a shockwave ({g:20} damage).'), max: 1, hook: (c) => c.onMine('attack', (e) => { if (e.combo === 1 && !e.echo) import('./effectEnts').then(({ Shockwave }) => c.w.add(new Shockwave(e.owner.x, e.owner.y - 4, 64, { amount: 20 * c.lo.mods.dmg, kind: 'aoe', owner: c.p, knock: 160, via: 'attack' }, 'O3', 0.3))); }) },
  { id: 'ml_spin', weapon: 'maul', name: L('陀螺', 'Whirligig'), desc: L('特技冷却 -{g:35%}，伤害 +{g:30%}。', 'Special cooldown -{g:35%}, damage +{g:30%}.'), max: 1, mods: (m) => { m.specialCd *= 0.65; m.specialDmg += 0.3; } },
  // ── Bow ──
  { id: 'bw_draw', weapon: 'bow', name: L('快拉', 'Quick Draw'), desc: L('攻击速度 +{g:25%}（蓄力也更快）。', 'Attack speed +{g:25%} (charges faster too).'), max: 2, mods: (m) => { m.atkSpeed *= 1.25; } },
  { id: 'bw_tip', weapon: 'bow', name: L('黄铜箭头', 'Brass Tips'), desc: L('伤害 +{g:15%}，暴击率 +{g:10%}。', 'Damage +{g:15%}, crit chance +{g:10%}.'), max: 2, mods: (m) => { m.dmg += 0.15; m.critChance += 0.1; } },
  { id: 'bw_volley', weapon: 'bow', name: L('齐鸣', 'Peal'), desc: L('特技冷却 -{g:40%}。', 'Special cooldown -{g:40%}.'), max: 1, mods: (m) => { m.specialCd *= 0.6; } },
  { id: 'bw_echo', weapon: 'bow', name: L('和声', 'Harmony'), desc: L('{c:残响}伤害 +{g:30%}。', '{c:Echo} damage +{g:30%}.'), max: 1, mods: (m) => { m.echoDmg += 0.3; } },
  // ── Chakram ──
  { id: 'ck_teeth', weapon: 'chakram', name: L('锐齿', 'Sharp Teeth'), desc: L('伤害 +{g:20%}。', 'Damage +{g:20%}.'), max: 2, mods: (m) => { m.dmg += 0.2; } },
  { id: 'ck_spin', weapon: 'chakram', name: L('高速轴承', 'Fast Bearings'), desc: L('攻击速度 +{g:20%}，暴击率 +{g:8%}。', 'Attack speed +{g:20%}, crit +{g:8%}.'), max: 2, mods: (m) => { m.atkSpeed *= 1.2; m.critChance += 0.08; } },
  { id: 'ck_saw', weapon: 'chakram', name: L('锯台', 'Sawmill'), desc: L('特技冷却 -{g:35%}，伤害 +{g:40%}。', 'Special cooldown -{g:35%}, damage +{g:40%}.'), max: 1, mods: (m) => { m.specialCd *= 0.65; m.specialDmg += 0.4; } },
  { id: 'ck_echo', weapon: 'chakram', name: L('分形', 'Fractal'), desc: L('{c:残响}伤害 +{g:30%}。', '{c:Echo} damage +{g:30%}.'), max: 1, mods: (m) => { m.echoDmg += 0.3; } },
];
export const CAL_BY_ID: Record<string, CalibrationDef> = Object.fromEntries(CALIBRATIONS.map((c) => [c.id, c]));
