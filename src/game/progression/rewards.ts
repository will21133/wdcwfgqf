// Floor plan (door options) and reward generation / granting.
import type { Run, OwnedMemory } from '../run';
import type { RoomKind } from '../world/roomgen';
import type { Sprite } from '../../engine/gfx/sprite';
import { MEMORIES, MEMORY_LIST, PATRONS, Patron, offerable, EXCLUSIVE_SLOTS, MemoryDef } from './memories';
import { HOURGLASS, HOURGLASS_BY_ID } from './hourglass';
import { PARTS, PARTS_BY_ID, PartDef } from './parts';
import { CALIBRATIONS, CAL_BY_ID } from './calibrations';
import { ICONS, patronSigil, partIcon } from '../../art/sprites/icons';
import { L, L10n, UI } from '../i18n';
import type { RNG } from '../../engine/rng';

export const ROOMS_PER_FLOOR = 9; // rooms 0..8, boss at 9
export const FLOORS = 4;

export type RewardKind = 'memory' | 'hourglass' | 'part' | 'brass' | 'heal' | 'calibration' | 'shards';
export interface RoomOption { kind: RoomKind; reward: RewardKind | null; patron?: Patron }

const PATRON_IDS: Patron[] = ['oren', 'pip', 'marta', 'fen', 'asu'];

export function pickPatron(run: Run, rng: RNG): Patron {
  // weight patrons you already have a bit higher (builds cohere), but keep variety
  return rng.weighted(PATRON_IDS, (p) => {
    const owned = run.memories.filter((m) => MEMORIES[m.id]?.patron === p).length;
    const avail = offerable(run, p).length;
    if (avail === 0) return 0;
    return 1 + Math.min(owned, 3) * 0.35;
  }) ?? 'oren';
}

export function nextOptions(run: Run, rng: RNG, floorState: { shop: boolean; elites: number; vault: boolean }): RoomOption[] {
  const next = run.roomIndex + 1;
  if (next >= ROOMS_PER_FLOOR) return [{ kind: 'boss', reward: null }];
  if (next === ROOMS_PER_FLOOR - 1) {
    return floorState.shop ? [{ kind: 'rest', reward: null }, { kind: 'combat', reward: 'heal' }] : [{ kind: 'rest', reward: null }, { kind: 'shop', reward: null }];
  }
  const n = rng.chance(0.35) && next > 1 ? 3 : 2;
  const opts: RoomOption[] = [];
  const key = (o: RoomOption) => `${o.kind}|${o.reward}|${o.patron ?? ''}`;
  const table: [() => RoomOption, number][] = [
    [() => ({ kind: 'combat', reward: 'memory', patron: pickPatron(run, rng) }), 46],
    [() => ({ kind: 'combat', reward: 'hourglass' }), next > 1 ? 9 : 0],
    [() => ({ kind: 'combat', reward: 'brass' }), 9],
    [() => ({ kind: 'combat', reward: 'heal' }), run.hp < run.mods.maxHp * 0.6 ? 12 : 5],
    [() => ({ kind: 'combat', reward: 'calibration' }), next > 1 ? 9 : 0],
    [() => ({ kind: 'combat', reward: 'part' }), 6],
    [() => ({ kind: 'elite', reward: rng.chance(0.5) ? 'part' : 'memory', patron: pickPatron(run, rng) }), next >= 3 && floorState.elites < 2 ? 11 : 0],
    [() => ({ kind: 'shop', reward: null }), !floorState.shop && next >= 3 ? 14 : 0],
    [() => ({ kind: 'event', reward: null }), next >= 1 ? 11 : 0],
    [() => ({ kind: 'vault', reward: 'part' }), !floorState.vault && next >= 2 ? 6 : 0],
  ];
  // guarantee a shop opportunity mid-floor
  if (!floorState.shop && next >= 5) opts.push({ kind: 'shop', reward: null });
  let guard = 0;
  while (opts.length < n && guard++ < 50) {
    const f = rng.weighted(table, (t) => t[1]);
    if (!f) break;
    const o = f[0]();
    if (o.kind === 'elite' && o.reward === 'part') delete o.patron;
    if (!opts.some((x) => key(x) === key(o) || (x.kind !== 'combat' && x.kind === o.kind))) opts.push(o);
  }
  return rng.shuffle(opts);
}

export interface RewardLook { icon: Sprite; color: string; label: L10n }

export function rewardLook(o: RoomOption): RewardLook {
  switch (o.kind) {
    case 'boss': return { icon: ICONS.boss, color: 'R3', label: UI.boss };
    case 'shop': return { icon: ICONS.snail, color: 'B4', label: UI.shop };
    case 'event': return { icon: ICONS.event, color: 'K9', label: UI.event };
    case 'rest': return { icon: ICONS.rest, color: 'G3', label: UI.rest };
    case 'vault': return { icon: ICONS.vault, color: 'B5', label: UI.vault };
  }
  const base = rewardKindLook(o.reward, o.patron);
  if (o.kind === 'elite') return { ...base, label: L(`${UI.elite.zh} · ${base.label.zh}`, `${UI.elite.en} · ${base.label.en}`) };
  return base;
}

export function rewardKindLook(r: RewardKind | null, patron?: Patron): RewardLook {
  switch (r) {
    case 'memory': {
      const p = PATRONS[patron ?? 'oren'];
      return { icon: patronSigil(p.id), color: p.color, label: L(`${p.name.zh}的回忆`, `${p.name.en}'s Memory`) };
    }
    case 'hourglass': return { icon: ICONS.hourglass, color: 'C3', label: UI.hourglass };
    case 'part': return { icon: ICONS.chest, color: 'B5', label: UI.part };
    case 'brass': return { icon: ICONS.coins, color: 'B5', label: UI.brass };
    case 'heal': return { icon: ICONS.oil, color: 'G3', label: UI.heal };
    case 'calibration': return { icon: ICONS.whetstone, color: 'K9', label: UI.calibration };
    case 'shards': return { icon: ICONS.shards, color: 'V3', label: UI.shards };
    default: return { icon: ICONS.coins, color: 'B4', label: UI.brass };
  }
}

// ───────────────────────── choices ─────────────────────────

export interface Choice {
  id: string;
  title: L10n;
  desc: L10n;
  icon: Sprite;
  /** 0..3 */
  rarity: number;
  tag: L10n;
  color: string;
  replaces?: L10n;
  flavor?: L10n;
  isNew?: boolean;
  apply(): void;
}

export function rollRarity(rng: RNG, floor: number, boost = 0): number {
  const r = rng.next() - floor * 0.03 - boost;
  if (r < 0.03) return 3;
  if (r < 0.14) return 2;
  if (r < 0.42) return 1;
  return 0;
}

export function memoryChoices(run: Run, rng: RNG, patron: Patron, onApplied: (om: OwnedMemory, replaced: OwnedMemory | null) => void, boost = 0): Choice[] {
  const pool = offerable(run, patron);
  const n = 3 + run.mods.extraChoice;
  // prefer slot variety; legendaries/duos are rarer
  const picks: MemoryDef[] = [];
  const bag = rng.shuffle(pool.slice());
  bag.sort((a, b) => weightOf(b) - weightOf(a) + (rng.next() - 0.5) * 1.6);
  for (const m of bag) {
    if (picks.length >= n) break;
    if (picks.some((p) => p.slot === m.slot && EXCLUSIVE_SLOTS.includes(m.slot)) && bag.length > n + 1) continue;
    picks.push(m);
  }
  return picks.map((m) => {
    const b = boost + run.luck;
    const rarity = m.slot === 'legendary' || m.slot === 'duo' ? Math.max(2, rollRarity(rng, run.floor, b)) : rollRarity(rng, run.floor, b);
    const existing = EXCLUSIVE_SLOTS.includes(m.slot) ? run.memories.find((o) => MEMORIES[o.id]?.slot === m.slot) : undefined;
    const p = PATRONS[m.patron];
    return {
      id: m.id,
      title: m.name,
      desc: m.desc(m.v[rarity]),
      icon: patronSigil(m.duo ? m.duo[1] : m.patron),
      rarity,
      tag: L(`${UI.slots[m.slot].zh} · ${UI.rarity[rarity].zh}`, `${UI.slots[m.slot].en} · ${UI.rarity[rarity].en}`),
      color: p.color,
      replaces: existing ? MEMORIES[existing.id].name : undefined,
      flavor: m.duo ? L(`${PATRONS[m.duo[0]].name.zh} × ${PATRONS[m.duo[1]].name.zh}`, `${PATRONS[m.duo[0]].name.en} × ${PATRONS[m.duo[1]].name.en}`) : L(`${p.name.zh}，${p.title.zh}`, `${p.name.en}, ${p.title.en}`),
      apply: () => {
        const om: OwnedMemory = { id: m.id, rarity };
        let replaced: OwnedMemory | null = null;
        if (existing) { replaced = existing; run.memories = run.memories.filter((o) => o !== existing); }
        run.memories.push(om);
        run.recompute();
        onApplied(om, replaced);
      },
    };
  });
}

function weightOf(m: MemoryDef) {
  if (m.slot === 'duo') return 0.6;
  if (m.slot === 'legendary') return 0.5;
  return 1;
}

export function hourglassChoices(run: Run, rng: RNG, onApplied: (id: string) => void): Choice[] {
  const pool = HOURGLASS.filter((h) => run.hourglass.filter((x) => x === h.id).length < (h.max ?? 1));
  return rng.shuffle(pool.slice()).slice(0, 3).map((h) => ({
    id: h.id, title: h.name, desc: h.desc, icon: ICONS.hourglass, rarity: 1,
    tag: L('沙漏 · 回溯强化', 'Hourglass · Rewind'), color: 'C3',
    apply: () => { run.hourglass.push(h.id); run.recompute(); onApplied(h.id); },
  }));
}

export function calibrationChoices(run: Run, rng: RNG, onApplied: (id: string) => void): Choice[] {
  const pool = CALIBRATIONS.filter((c) => c.weapon === run.weapon && run.calibrations.filter((x) => x === c.id).length < (c.max ?? 1));
  return rng.shuffle(pool.slice()).slice(0, 3).map((c) => ({
    id: c.id, title: c.name, desc: c.desc, icon: ICONS.whetstone, rarity: 0,
    tag: L('校准 · 武器强化', 'Calibration · Weapon'), color: 'K9',
    apply: () => { run.calibrations.push(c.id); run.recompute(); onApplied(c.id); },
  }));
}

export function rollPart(run: Run, rng: RNG, opts: { shop?: boolean; allowCursed?: boolean } = {}): PartDef | null {
  const pool = PARTS.filter((p) => !run.parts.includes(p.id) && (opts.shop || !p.shopOnly) && (opts.allowCursed !== false || !p.cursed));
  return rng.weighted(pool, (p) => [6, 3, 1.2][p.rarity] * (p.cursed ? 0.5 : 1)) ?? null;
}

export function partLook(p: PartDef) { return { icon: partIcon(p.icon, p.cursed), color: p.cursed ? 'R3' : ['K9', 'U4', 'B5'][p.rarity] }; }

export { MEMORIES, MEMORY_LIST, HOURGLASS_BY_ID, PARTS_BY_ID, CAL_BY_ID };
