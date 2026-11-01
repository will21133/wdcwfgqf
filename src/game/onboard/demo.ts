// The demo puppet (ONBOARD2 §3): the player's own hand, driven by a script, shows a move with the
// real rewind / echo / paradox code and the real HUD — then the stage is wound back to the start.
//
//   DemoClip      the script: steering steps (walk toward a point, wait for an event, tap / hold a
//                 button, aim, combo …), timed captions, a time-out, the segments help level 2 replays
//   DemoDirector  (F4a days 2–4) swaps p.input for a bot input, draws the chalk outline
//                 (Player.renderTint = PUPPET_TINT), floats the button bubble over the hand and hands
//                 control back after 0.2 s of neutral input
//
// Steering, not recorded stick values: P1 / P5 can retune speeds and combo timings and a demo still
// arrives. Every waitFor has a timeout and a force; a forced step logs 'demo-desync' (CI: 0).
//
// Interface day: the types (frozen) and the puppet's look. The director lands F4a days 2–4.
import type { Action } from '../../engine/input';
import type { Player, PlayerTint } from '../entities/player';
import type { SpotRef } from './stage';
import type { L10n } from '../i18n';

export type DemoEvent = 'hit' | 'rewindLand' | 'echoSpawn' | 'echoArmed' | 'paradox' | 'propBroken' | 'echoEnd' | 'fork' | `cue:${string}`;

export type DemoStep =
  /** steer toward (x, y) in stage coordinates (prologue: from the floor centre; in-run / Hall: from the start); stops within 3 px */
  | { k: 'walkTo'; x: number; y: number; speed?: number }
  | { k: 'wait'; s: number }
  /** wait for an event; past `timeout` call force() (if any), log demo-desync and go on */
  | { k: 'waitFor'; ev: DemoEvent; timeout: number; force?: () => void }
  /** down for 4 ticks then up (< 0.18 s: always a tap) */
  | { k: 'tap'; a: Action }
  /** held s seconds (the scrub demo; the puppet's own gates are opened for it) */
  | { k: 'hold'; a: Action; s: number }
  | { k: 'press'; a: Action } | { k: 'release'; a: Action }
  | { k: 'aimAt'; x: number; y: number } | { k: 'aimAtNearest' }
  /** n attack presses, spaced at 60% of the weapon's combo window */
  | { k: 'combo'; n: number }
  /** a stage script event (dropGearA, spawnJar …) */
  | { k: 'cue'; id: string };

export interface DemoCaption {
  /** when: sim seconds from the demo's start, an event, "event+seconds", or the moment a button goes down */
  at: number | DemoEvent | `${DemoEvent}+${number}` | `press:${Action}`;
  /** a string key in the 'onboard' table (or a literal L10n) */
  key: string | L10n;
  spot?: SpotRef | SpotRef[];
  dur?: number;
}

export interface DemoClip {
  id: string;
  /** where and how the puppet starts (stage coordinates; in-run / Hall: an offset from the player) */
  start: { x: number; y: number; face?: 'left' | 'right' | 'up' | 'down'; hp?: number; sand?: number };
  steps: DemoStep[];
  /** captions in sync with the steps (each lesson's timeline) */
  captions: DemoCaption[];
  /** safety stop (sim seconds) */
  maxDur: number;
  /** help level 2 replays only the segment of the failed step: name → [from, to] seconds */
  segments?: Record<string, [number, number]>;
}

/** what a running demo exposes (the lesson runner, __tut, the Stage's pressed-token sync) */
export interface DemoDirectorApi {
  readonly clip: DemoClip;
  readonly p: Player;
  /** sim seconds since the demo started */
  readonly t: number;
  /** buttons the puppet holds right now (Stage.say pressed: the caption's tokens sink with them) */
  pressed(): ReadonlySet<Action>;
  /** end now; skipped = the player held confirm 0.6 s */
  finish(skipped: boolean): void;
  readonly done: boolean;
}

/**
 * The puppet's chalk look (ONBOARD2 §3.4): the hand's own colours at 85%, greyed by half, with a
 * 1 px white dashed rim — warm and white, never cyan (cyan is the Shadow and the echoes).
 */
export const PUPPET_TINT: PlayerTint = { alpha: 0.85, desat: 0.5, outline: 'K10', dashed: true };
