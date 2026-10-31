// Typed event bus — every memory (boon), part (relic) and calibration hooks in here.
// PLAN2 §1.7: the full 2.0 event list (frozen after F2). Every player-related event carries
// `player` (the hand it belongs to: the attacker, the echo's owner, the one who was hit …), so a
// hand's hooks can listen to their own events only (HookCtx.onMine). New events go through `custom`.
import type { Actor, Entity } from '../entities/entity';
import type { DamageInfo } from './combat';
import type { Echo } from '../entities/echo';
import type { Player } from '../entities/player';

export type ParadoxKind = 'overlap' | 'pierce' | 'chain' | 'recall' | 'quartet';
export type ReviveSource = 'windup' | 'pullback' | 'echo' | 'room' | 'self';

export interface BusEvents {
  /** player/echo dealt damage */
  hit: { target: Actor; info: DamageInfo; dealt: number; player?: Player };
  /** enemy died */
  kill: { target: Actor; info: DamageInfo; player?: Player };
  /** player took damage (after mitigation) */
  damaged: { info: DamageInfo; dealt: number; player?: Player; undoable?: boolean };
  /** an attack swing started (also from echoes) */
  attack: { owner: Actor; combo: number; angle: number; echo: boolean; player?: Player; heavy?: boolean };
  special: { owner: Actor; angle: number; echo: boolean; player?: Player; heavy?: boolean };
  dash: { owner: Actor; dx: number; dy: number; echo: boolean; player?: Player };
  dashEnd: { owner: Actor; echo: boolean; player?: Player; dx?: number; dy?: number };
  rewind: {
    fromX: number; fromY: number; toX: number; toY: number; restored: number; player?: Player;
    seconds?: number; cost?: number; perfect?: boolean; scrub?: boolean;
  };
  fork: { player?: Player; echo: Echo };
  echoSpawn: { echo: Echo; player?: Player };
  echoArmed: { echo: Echo; player?: Player };
  echoEnd: { echo: Echo; paradox: boolean; player?: Player };
  paradox: { x: number; y: number; echo: Echo; player?: Player; kind?: ParadoxKind; chain?: number; duet?: boolean };
  sync: { player?: Player; target: Actor; sources: number };
  culprit: { player?: Player; target: Actor };
  perfectRewind: { player?: Player };
  tickDodge: { player?: Player; x: number; y: number };
  interrupt: { player?: Player; target: Actor };
  poiseBreak: { player?: Player; target: Actor };
  deflect: { player?: Player; bullet: Entity };
  tempoRank: { player?: Player; rank: number; prev: number };
  /** a hand stopped (GDD2 §5.5) / was wound up again / ran out of time and became a ghost */
  downed: { player: Player };
  revived: { player: Player; by: Player | null; source: ReviveSource };
  ghost: { player: Player };
  playerJoin: { slot: number };
  playerLeave: { slot: number };
  roomStart: { kind?: string };
  roomClear: { grade?: 'S' | 'A' | 'B' };
  waveStart: { wave: number };
  objective: { id: string; state: 'start' | 'done' | 'fail' };
  hazardHit: { hazard: Entity; target: Actor };
  pickup: { kind: string; amount: number; player?: Player };
  /** every fixed tick while in combat room */
  tick: { dt: number };
  statusApplied: { target: Actor; status: string; stacks: number; player?: Player };
  /** 1.0 name of tickDodge (both are emitted) */
  perfectDodge: { x: number; y: number; player?: Player };
  spawn: { e: Entity };
  /** meta registry (F1): emitted on the current world's bus when the player earns one */
  secret: { id: string };
  achievement: { id: string };
  chime: { id: string };
  hint: { id: string };
  /** anything else (eggs, package-private signals) */
  custom: { id: string; player?: Player; data?: any };
}

type Handler<K extends keyof BusEvents> = (e: BusEvents[K]) => void;

export class Bus {
  private h = new Map<keyof BusEvents, { fn: Handler<any>; owner: unknown }[]>();

  on<K extends keyof BusEvents>(k: K, fn: Handler<K>, owner: unknown = null) {
    let l = this.h.get(k);
    if (!l) this.h.set(k, (l = []));
    l.push({ fn, owner });
  }
  off(owner: unknown) {
    for (const [k, l] of this.h) this.h.set(k, l.filter((x) => x.owner !== owner));
  }
  emit<K extends keyof BusEvents>(k: K, e: BusEvents[K]) {
    const l = this.h.get(k);
    if (!l) return;
    for (let i = 0; i < l.length; i++) l[i].fn(e);
  }
  clear() { this.h.clear(); }
}
