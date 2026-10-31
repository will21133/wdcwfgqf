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
  { id: 'rp_wave', weapon: 'rapier', name: L('剑气', 'Second Wind'), desc: L('第三段横扫释放一道月牙剑气，造成 {g:16} 点伤害。', 'The third hit releases a crescent wave dealing {g:16}.'), max: 1, hook: (c) => c.on('attack', (e) => {
    if (e.combo !== 2) return;
    c.w.add(new Bullet({ team: 'player', x: e.owner.x, y: e.owner.y - 8, ang: e.angle, speed: 240, dmg: 16 * c.run.mods.dmg * (e.echo ? c.run.mods.echoDmg : 1), style: 'big', r: 5, owner: c.p, pierce: 6, life: 0.5, pal: e.echo ? ['W', 'C4', 'C2'] : ['W', 'B6', 'B4'], echo: e.echo, info: { src: 'attack' } }));
  }) },
  { id: 'rp_flurry', weapon: 'rapier', name: L('连刺', 'Flurry'), desc: L('特技沿路径连刺 {g:3} 次。', 'Special strikes {g:3} times along its path.'), max: 1, flag: 'flurry' },
  { id: 'rp_cd', weapon: 'rapier', name: L('轻巧', 'Featherweight'), desc: L('特技冷却 -{g:35%}，冲刺后可立即使用特技。', 'Special cooldown -{g:35%}.'), max: 1, mods: (m) => { m.specialCd *= 0.65; } },
  { id: 'rp_crit', weapon: 'rapier', name: L('精准', 'Pinpoint'), desc: L('刺击暴击率 +{g:15%}，暴击伤害 +{g:50%}。', 'Thrust crit chance +{g:15%}, crit damage +{g:50%}.'), max: 1, mods: (m) => { m.critChance += 0.15; m.critMult += 0.5; } },
];
export const CAL_BY_ID: Record<string, CalibrationDef> = Object.fromEntries(CALIBRATIONS.map((c) => [c.id, c]));
