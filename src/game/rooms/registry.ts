// Room types (PLAN2 §1.5). Every kind of room the tower can offer registers here: its door label and
// icon, whether it is a fight, its weight in the door table, and how to build it. The door table in
// progression/rewards.ts reads these weights; GameScene.enter calls build().
//
// F2 registers the 1.0 kinds with their 1.0 numbers (the order below is the 1.0 door table's order,
// so seeds roll the same doors). Production packages add theirs:
//   rescue (P6) · trial / treasure / secret / leap (P2) · miniboss / belfry / lostminute (P3) ·
//   wrongHour (P4) · prologue / rehearsal (P7)
import type { Run } from '../run';
import type { RNG } from '../../engine/rng';
import type { GameScene } from '../scenes/game';
import type { Patron } from '../progression/memories';
import type { RewardKind } from '../progression/rewards';
import { L, UI, tr, type L10n } from '../i18n';
import { planWaves, findEnemy } from '../world/director';
import { makeBoss, makeBossById } from '../world/bosses';
import { Routes } from '../routes';
import { coopScale } from '../world/coopScale';
import { setupShop, setupRest, setupEvent, setupVault } from './special';
import { setupTutorial } from './tutorial';
import { Dummy } from '../entities/enemies/gearworks';

export type RoomKind = 'combat' | 'elite' | 'boss' | 'shop' | 'event' | 'rest' | 'vault' | 'treasure' | 'start' | 'hub' | 'tutorial'
  | 'rescue' | 'trial' | 'secret' | 'miniboss' | 'wrongHour' | 'leap' | 'prologue' | 'rehearsal' | 'belfry' | 'lostminute';

export interface RoomTypeDef {
  kind: RoomKind;
  label: L10n;
  /** an ICONS key for the door medallion */
  icon: string;
  /** palette colour of the door medallion (default 'K9') */
  color?: string;
  /** a fight: the room is cleared by beating its waves / boss (otherwise it is safe from the start) */
  combat: boolean;
  /** door-table weight for the room after `roomIdx` on `floor` (0 = never offered) */
  weight(run: Run, floor: number, roomIdx: number): number;
  /** at most one per floor (counted in run.floorState.kinds) */
  oncePerFloor?: boolean;
  /** entering it moves the floor's room counter on (default true) */
  advancesRoom?: boolean;
  /** fill the room (waves, NPCs, props); called from GameScene.enter after the hands are in */
  build(scene: GameScene): void;
  /** extra line under the door label */
  doorInfo?(run: Run): L10n;
  /** the reward a door of this kind carries, rolled when the door is offered (default none) */
  door?(run: Run, rng: RNG): { reward: RewardKind | null; patron?: Patron };
}

const TYPES = new Map<RoomKind, RoomTypeDef>();

export const RoomTypes = {
  /** add or replace a room kind (re-registering keeps its place in the door table) */
  register(kind: RoomKind, d: Omit<RoomTypeDef, 'kind'>): void { TYPES.set(kind, { ...d, kind }); },
  get(kind: RoomKind | string): RoomTypeDef | undefined { return TYPES.get(kind as RoomKind); },
  /** every registered kind, in registration order (the door table's order) */
  all(): RoomTypeDef[] { return [...TYPES.values()]; },
  /** door label for a kind (falls back to the kind's id) */
  label(kind: RoomKind | string): string { const d = TYPES.get(kind as RoomKind); return d ? tr(d.label) : String(kind); },
};

// ───────────────────────── the 1.0 kinds ─────────────────────────
const fight = (elite: boolean) => (s: GameScene) => {
  const run = s.run;
  s.waves = planWaves(s.rng, run.floor, run.roomIndex, elite, run.overwind, coopScale(s.world.playerCount).budget);
  if (elite) run.floorState.elites++;
};

// door-table order = 1.0's: combat rewards (rewards.ts), elite, shop, event, vault
RoomTypes.register('combat', {
  label: L('战斗', 'Battle'), icon: 'boss', combat: true,
  // combat doors are split by reward in rewards.ts (COMBAT_REWARDS); this scales that whole table
  weight: () => 1,
  build: fight(false),
});
RoomTypes.register('elite', {
  label: UI.elite, icon: 'boss', color: 'R3', combat: true,
  weight: (run, _f, next) => (next >= 3 && run.floorState.elites < 2 ? 11 : 0),
  build: fight(true),
});
RoomTypes.register('shop', {
  label: UI.shop, icon: 'snail', color: 'B4', combat: false, oncePerFloor: true,
  weight: (run, _f, next) => (!run.floorState.shop && next >= 3 ? 14 : 0),
  build: (s) => { s.run.floorState.shop = true; setupShop(s); },
});
RoomTypes.register('event', {
  label: UI.event, icon: 'event', color: 'K9', combat: false,
  weight: (_r, _f, next) => (next >= 1 ? 11 : 0),
  build: (s) => setupEvent(s),
});
RoomTypes.register('vault', {
  label: UI.vault, icon: 'vault', color: 'B5', combat: false, oncePerFloor: true,
  weight: (run, _f, next) => (!run.floorState.vault && next >= 2 ? 6 : 0),
  build: (s) => { s.run.floorState.vault = true; setupVault(s); },
  door: () => ({ reward: 'part' }),
});
// fixed slots of the floor plan (room 8 rest/shop, room 9 boss): never rolled from the table
RoomTypes.register('rest', {
  label: UI.rest, icon: 'rest', color: 'G3', combat: false,
  weight: () => 0,
  build: (s) => setupRest(s),
});
RoomTypes.register('boss', {
  label: UI.boss, icon: 'boss', color: 'R3', combat: true,
  weight: () => 0,
  build: (s) => {
    const run = s.run, w = s.world;
    const c = s.center();
    // the route names the floor's boss (P3 branches add their own); default floors = 1.0's order
    const id = Routes.floor(run).boss;
    const b = (id ? makeBossById(id, c.x, c.y - 40) : null) ?? makeBoss(run.floor, c.x, c.y - 40);
    if (b) {
      s.boss = w.add(b);
      s.waves = [];
      s.cleared = false;
      for (const pl of w.players) pl.locked = true;
      s.titleCard = { title: tr(b.bossName), sub: tr(b.bossTitle), t: -0.2 };
    } else s.waves = planWaves(s.rng, run.floor, 8, true, run.overwind, coopScale(w.playerCount).budget);
  },
});
RoomTypes.register('tutorial', {
  label: L('排练', 'Practice'), icon: 'boss', combat: true,
  weight: () => 0,
  build: (s) => {
    const c = s.center();
    s.world.add(new Dummy(c.x, c.y - 30));
    setupTutorial(s.world);
    // a couple of coglings to practise on once you're ready
    s.waves = [{ defs: [findEnemy('cogling')!, findEnemy('cogling')!].filter(Boolean) }];
    s.waveDelay = 6;
  },
});
