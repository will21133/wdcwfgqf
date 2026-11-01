// Stage hosts (ONBOARD2 §3.7): how a lesson winds its stage back to the start of a step. Never with
// the game's rewind ripple — a reset is not a rewind (players would think rewind rewinds the world).
// Both show the same film wipe: a dark band with sprocket holes sweeping up the screen with
// "⏪ Back to the start", the reset at 0.2 s, the band leaving by 0.4 s (sfx filmWipe).
//
//   RebuildHost (prologue)        refills hp / Sand, clears the tape, sets run.flags.pl / pp / ps and
//                                 goes to a brand-new GameScene of kind 'prologue' — a fresh World,
//                                 so timers, bus listeners, bubbles, echoes and marks are all gone
//   SoftHost (after-fight, Hall)  cannot rebuild a real room: cancels the lesson's timers, removes its
//                                 props and this hand's echoes and bubbles (no effects, no paradox),
//                                 restores hp / Sand to the step's snapshot, re-prefills the tape at
//                                 the hand's feet, re-places the props from where the hand stands now
//
// Interface day: the interface (frozen). The two hosts land F4a days 2–4.
import type { World } from '../world/world';
import type { Player } from '../entities/player';
import type { Entity } from '../entities/entity';

export type HostKind = 'rebuild' | 'soft';

export interface StageHost {
  readonly kind: HostKind;
  /** the world the lesson plays in right now (a RebuildHost's changes with every reset) */
  world(): World;
  /** the hand taking the lesson */
  readonly p: Player;
  /** owner token for the lesson's world.after timers and bus listeners (cancelled on reset) */
  readonly owner: object;
  /** a prop the lesson spawned (removed without effects on reset / end) */
  track<T extends Entity>(e: T): T;
  /** wind the stage back to the current step's start under the film wipe; then() once the new stage stands */
  reset(then: () => void): void;
  /** the lesson is over: remove its props and listeners (the world stays) */
  dispose(): void;
  /** the film wipe is on screen (0..1 progress), or null */
  wipe(): number | null;
}

/** seconds of the film wipe, and when inside it the stage is reset */
export const WIPE_T = 0.4, WIPE_RESET_AT = 0.2;
