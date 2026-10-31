// Typed event bus — every memory (boon), part (relic) and calibration hooks in here.
import type { Actor, Entity } from '../entities/entity';
import type { DamageInfo } from './combat';
import type { Echo } from '../entities/echo';

export interface BusEvents {
  /** player/echo dealt damage */
  hit: { target: Actor; info: DamageInfo; dealt: number };
  /** enemy died */
  kill: { target: Actor; info: DamageInfo };
  /** player took damage (after mitigation) */
  damaged: { info: DamageInfo; dealt: number };
  /** an attack swing started (also from echoes) */
  attack: { owner: Actor; combo: number; angle: number; echo: boolean };
  special: { owner: Actor; angle: number; echo: boolean };
  dash: { owner: Actor; dx: number; dy: number; echo: boolean };
  dashEnd: { owner: Actor; echo: boolean };
  rewind: { fromX: number; fromY: number; toX: number; toY: number; restored: number };
  echoSpawn: { echo: Echo };
  echoEnd: { echo: Echo; paradox: boolean };
  paradox: { x: number; y: number; echo: Echo };
  roomStart: {};
  roomClear: {};
  waveStart: { wave: number };
  pickup: { kind: string; amount: number };
  /** every fixed tick while in combat room */
  tick: { dt: number };
  statusApplied: { target: Actor; status: string; stacks: number };
  perfectDodge: { x: number; y: number };
  spawn: { e: Entity };
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
