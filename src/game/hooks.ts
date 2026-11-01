// Global lifecycle hooks (PLAN2 §1.5): eggs, income, notes and achievements subscribe here instead
// of editing scene files. Scenes and the flow controller fire them; packages only listen.
//
//   GameHooks.onRunStart   a run's first room is entered (also debug runs)
//   GameHooks.onRoomStart  every room, after the bus is fresh and every hand's hooks are registered
//   GameHooks.onRoomClear  a room is cleared (grade S = no hits taken, A = ≤ 2, B = more)
//   GameHooks.onRunEnd     Flow.endRun (death / quit / victory)
//   GameHooks.onHub / onTitle  the workshop / title scene was entered
//   GameHooks.onPauseTick  every tick while the pause menu is open (seconds paused so far)
//
//   Cutscenes.register(id, factory)  P7 registers 'intro' 'ending' 'belfry' 'true' 'forever' 'credits'
//   Cutscenes.play(id, then)         plays one; an unregistered id just calls then()
//
// Listeners never throw into the game: an exception is logged and the next listener runs.
import type { Scene } from '../engine/scene';
import type { Run, RunEndKind } from './run';
import type { World } from './world/world';
import type { GameScene } from './scenes/game';
import type { HubScene } from './scenes/hub';
import type { TitleScene } from './scenes/title';
import type { RoomKind } from './rooms/registry';
import { G } from './G';

export type RoomGrade = 'S' | 'A' | 'B';
export interface RoomStartCtx { w: World; run: Run; scene: GameScene; kind: RoomKind }
export interface RoomClearCtx { w: World; run: Run; scene: GameScene; grade: RoomGrade }

type Fn<A extends unknown[]> = (...a: A) => void;

function list<A extends unknown[]>() {
  const fns: Fn<A>[] = [];
  return {
    add(fn: Fn<A>) { fns.push(fn); },
    fire(...a: A) {
      for (const fn of fns.slice()) {
        try { fn(...a); } catch (e) { console.error('[hooks]', e); }
      }
    },
    get size() { return fns.length; },
  };
}

const L = {
  runStart: list<[Run]>(),
  roomStart: list<[RoomStartCtx]>(),
  roomClear: list<[RoomClearCtx]>(),
  runEnd: list<[Run, RunEndKind]>(),
  hub: list<[HubScene]>(),
  title: list<[TitleScene]>(),
  pauseTick: list<[number]>(),
};

export const GameHooks = {
  onRunStart(fn: (run: Run) => void): void { L.runStart.add(fn); },
  onRoomStart(fn: (c: RoomStartCtx) => void): void { L.roomStart.add(fn); },
  onRoomClear(fn: (c: RoomClearCtx) => void): void { L.roomClear.add(fn); },
  onRunEnd(fn: (run: Run, kind: RunEndKind) => void): void { L.runEnd.add(fn); },
  onHub(fn: (scene: HubScene) => void): void { L.hub.add(fn); },
  onTitle(fn: (scene: TitleScene) => void): void { L.title.add(fn); },
  onPauseTick(fn: (pausedSec: number) => void): void { L.pauseTick.add(fn); },
  /** the scenes and Flow call these (packages only subscribe) */
  fire: {
    runStart: (run: Run) => L.runStart.fire(run),
    roomStart: (c: RoomStartCtx) => L.roomStart.fire(c),
    roomClear: (c: RoomClearCtx) => L.roomClear.fire(c),
    runEnd: (run: Run, kind: RunEndKind) => L.runEnd.fire(run, kind),
    hub: (s: HubScene) => L.hub.fire(s),
    title: (s: TitleScene) => L.title.fire(s),
    pauseTick: (sec: number) => L.pauseTick.fire(sec),
  },
  /** listener counts (?debug=registry) */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(L)) out[k] = v.size;
    return out;
  },
};

/** room grade from hits taken this room (S none, A up to 2, B more) */
export function roomGrade(hitsTaken: number): RoomGrade { return hitsTaken <= 0 ? 'S' : hitsTaken <= 2 ? 'A' : 'B'; }

// ───────────────────────── cutscenes ─────────────────────────
interface CutsceneDef { factory: (then: () => void) => Scene; fade: number }
const CUTS = new Map<string, CutsceneDef>();

export const Cutscenes = {
  /** register (or replace) a cutscene; `fade` is the cross-fade in seconds (default 0.8) */
  register(id: string, factory: (then: () => void) => Scene, o: { fade?: number } = {}): void {
    CUTS.set(id, { factory, fade: o.fade ?? 0.8 });
  },
  has(id: string): boolean { return CUTS.has(id); },
  ids(): string[] { return [...CUTS.keys()]; },
  /** play a cutscene, then call `then`; an id nobody registered calls `then` at once */
  play(id: string, then: () => void): void {
    const d = CUTS.get(id);
    if (!d) { then(); return; }
    G.scenes.go(() => d.factory(then), 'fade', d.fade);
  },
};
