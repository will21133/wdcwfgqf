// Lessons (ONBOARD2 §3.6): one runner for the prologue, the after-fight lessons and the Rehearsal
// Hall. A lesson = intro → demo → film wipe → try[step] ⇄ fail → success → end, with help levels
// (§2.10), "watch again" (§3.8) and a gate layer that opens its verbs for its player while it runs.
//
//   Lessons.define(def)                    F4a: core (prologue) + inrun (fork / scrub); F4b: advanced,
//                                          hall; P1: the combat group (heavy, interrupt, break, reverse)
//   Lessons.start(id, p, where, host)      run one (Calm, the Hall board, the prologue director)
//   Lessons.active(p?)                     the gates and the coach ask "is a lesson on for this hand?"
//   Lessons.state(id, p?)                  locked / eligible / queued / taught / mastered (the Hall board)
//   Lessons.complete(id, p, how)           Teach.mark + the Hall tick + the one-time reward
//   Lessons.onComplete(cb) · Lessons.tick(dtReal)
//
// Events: lessonStart demoStart demoEnd demo-desync fail success skip postpone → __tut.log.
//
// Interface day: the types (frozen), the registry, state(), complete() and active() work. start()
// records the run and opens its gate layer, but the step machine (demo, wipe, try, help levels)
// lands F4a days 2–4: until then a started lesson ends at once and marks nothing.
import type { Player } from '../entities/player';
import type { World } from '../world/world';
import type { Entity } from '../entities/entity';
import type { BusEvents } from '../systems/bus';
import type { L10n } from '../i18n';
import type { DemoClip } from './demo';
import type { StageHost } from './host';
import { Teach, Flags } from '../meta/registry';
import { Onboard, OnboardHooks, Tut, type TeachHow } from './core';
import { Gates } from './gates';

export type LessonId =
  | 'move' | 'strike' | 'undo' | 'echo' | 'paradox' | 'final'
  | 'fork' | 'scrub' | 'sync' | 'culprit' | 'grandfather' | 'tick' | 'chain' | 'perfect' | 'pierce' | 'recall'
  | 'fixed' | 'lastSecond' | 'duet' | 'pullBack' | 'tandem'
  | 'heavy' | 'interrupt' | 'break' | 'reverse'
  | (string & {});
export type Where = 'prologue' | 'calm' | 'hall' | 'seat';
export type LessonPhase = 'intro' | 'demo' | 'wipe' | 'try' | 'fail' | 'success' | 'end';
export type LessonState = 'locked' | 'eligible' | 'queued' | 'taught' | 'mastered';
export type CompleteHow = 'lesson' | 'recognised' | 'soft' | 'skip';

/** a bus event seen by a lesson step (only the lesson player's own: e.player === ctx.p), or the step's clock */
export type LessonEvent =
  | { [K in keyof BusEvents]: { type: K; e: BusEvents[K] } }[keyof BusEvents]
  | { type: 'time'; e: { dt: number } };

/** what a step's predicates see */
export interface LessonCtx {
  readonly p: Player;
  readonly run: LessonRun;
  readonly host: StageHost;
  readonly where: Where;
  /** the world the lesson plays in now */
  readonly w: World;
  /** current step index, attempt at it (1 = first), help level 0..3 */
  readonly step: number;
  readonly attempt: number;
  readonly help: 0 | 1 | 2 | 3;
  /** sim seconds since the step began */
  readonly t: number;
  /** the stage origin (prologue: the floor centre; in-run / Hall: where the hand stood) and facing (+1 right / −1 left) */
  readonly origin: { x: number; y: number; face: 1 | -1 };
  /** stage coordinates → world (mirrored with the facing in-run) */
  at(dx: number, dy: number): { x: number; y: number };
  /** add a prop the host removes on reset / end */
  spawn<T extends Entity>(e: T): T;
  /** free scratch space for a lesson's own state (counts, flags) — cleared on reset */
  vars: Record<string, unknown>;
}

export interface LessonStep {
  /** caption key in the 'onboard' table (the step's one instruction) */
  key: string;
  /** advance to the next step when true */
  until?: (e: LessonEvent, ctx: LessonCtx) => boolean;
  /** the lesson succeeds when true (last step) */
  done?: (e: LessonEvent, ctx: LessonCtx) => boolean;
  /** a specific failure → its fail beat line (then the wipe and a retry of this step) */
  fail?: (e: LessonEvent, ctx: LessonCtx) => L10n | null;
  /** a nudge that is not a failure (tier B), asked every tick */
  hint?: (ctx: LessonCtx, t: number) => L10n | null;
  /** the hit that lands freezes the world until rewind is pressed (ONBOARD2 §2.0 FreezeGuide) */
  freezeOnHit?: boolean;
  /** seconds before the step counts as idle-failed (default: none) */
  timeout?: number;
}

export interface LessonDef {
  id: LessonId;
  /** the Teach id marked on success */
  teach: string;
  /** TERMS id named on the intro card's first line */
  term?: string;
  where: Where[];
  intro?: { lines: L10n[]; dur: number };
  demo?: DemoClip;
  steps: LessonStep[];
  success: { stamp: L10n; why: L10n; sub?: L10n; strip?: number };
  /** refill = Sand full at every attempt and the lesson's spending refunded at the end */
  sand: 'refill' | 'keep';
  /** the gates this lesson opens for its player while it runs */
  verbs?: { scrub?: boolean; fork?: boolean };
  /** shards for the first ✓ (default 3; the prologue's lessons 0 — the prologue pays 15) */
  reward?: number;
  /** place the props (stage coordinates or relative to the hand) */
  props(ctx: LessonCtx): void;
}

export interface LessonRun {
  readonly id: LessonId;
  readonly def: LessonDef;
  readonly p: Player;
  readonly where: Where;
  readonly host: StageHost;
  phase: LessonPhase;
  /** index into def.steps and its key ("A0", "B" …) */
  step: number;
  readonly stepKey: string | null;
  /** attempts per step key, fail reasons (keys), help level now, demo plays */
  attempts: Record<string, number>;
  fails: string[];
  help: 0 | 1 | 2 | 3;
  demoPlays: number;
  /** sim seconds since start */
  t: number;
  readonly ended: boolean;
  /** "watch again" ({@info}, pause menu): wipe → demo → wipe → back to this step */
  replay(): void;
  /** skip this lesson: its verbs open anyway (how = 'skip' → id:soft), the Hall shows it hollow */
  skip(): void;
  /** walked through a door / "later" in the pause menu: counts a postponement, nothing is marked */
  postpone(): void;
}

const DEFS = new Map<string, LessonDef>();
const runs: LessonRun[] = [];
const doneListeners: ((id: LessonId, p: Player, how: string) => void)[] = [];

class StubRun implements LessonRun {
  phase: LessonPhase = 'intro';
  step = 0;
  attempts: Record<string, number> = {};
  fails: string[] = [];
  help: 0 | 1 | 2 | 3 = 0;
  demoPlays = 0;
  t = 0;
  ended = false;
  private ungate: (() => void) | null = null;
  constructor(readonly def: LessonDef, readonly p: Player, readonly where: Where, readonly host: StageHost) {
    const v = def.verbs;
    if (v) this.ungate = Gates.push({ name: 'lesson:' + def.id, p, tapOnly: v.scrub ? () => false : undefined, forkAllow: v.fork ? () => true : undefined });
  }
  get id(): LessonId { return this.def.id; }
  get stepKey(): string | null { return this.def.steps[this.step]?.key ?? null; }
  replay(): void { this.demoPlays++; Tut.log('demoStart', { lesson: this.id, replay: true }); }
  skip(): void { Tut.log('skip', { lesson: this.id }); Lessons.complete(this.id, this.p, 'skip'); this.end(); }
  postpone(): void { Flags.inc('onboard.postpone.' + this.id); Tut.log('postpone', { lesson: this.id }); this.end(); }
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'end';
    this.ungate?.();
    this.ungate = null;
    this.host.dispose();
    const i = runs.indexOf(this);
    if (i >= 0) runs.splice(i, 1);
  }
}

export const Lessons = {
  /** add (or replace) a lesson */
  define(d: LessonDef): void { DEFS.set(d.id, d); },
  get(id: LessonId): LessonDef | null { return DEFS.get(id) ?? null; },
  all(): LessonDef[] { return [...DEFS.values()]; },
  /**
   * run a lesson for a hand. Interface day: the run is recorded and its gate layer opened, then it
   * ends (the step machine lands F4a days 2–4); nothing is marked taught.
   */
  start(id: LessonId, p: Player, where: Where, host: StageHost): LessonRun {
    const def = DEFS.get(id);
    if (!def) throw new Error(`[lessons] no lesson "${id}"`);
    const run = new StubRun(def, p, where, host);
    runs.push(run);
    Tut.log('lessonStart', { lesson: id, where, slot: p.slot });
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) console.warn(`[lessons] "${id}": the lesson runner lands with F4a days 2–4; this start is a no-op`);
    run.end();
    return run;
  },
  /** the lesson this hand is taking (any hand when omitted), or null */
  active(p?: Player | null): LessonRun | null {
    for (const r of runs) if (!r.ended && (!p || r.p === p)) return r;
    return null;
  },
  /** where a lesson stands for a hand (the Hall board, Calm) */
  state(id: LessonId, p?: Player | null): LessonState {
    const def = DEFS.get(id);
    const teach = def?.teach ?? id;
    if (Teach.has('star.' + id)) return 'mastered';
    if (Onboard.taught(p ?? null, teach)) return 'taught';
    if (OnboardHooks.queued(teach)) return 'queued';
    return def ? 'eligible' : 'locked';
  },
  /** a lesson was learned (or let through): Teach.mark, the Hall's ✓ and its one-time shards */
  complete(id: LessonId, p: Player, how: CompleteHow): void {
    const def = DEFS.get(id);
    const teach = def?.teach ?? id;
    const th: TeachHow = how === 'skip' || how === 'soft' ? 'soft' : how;
    Onboard.mark(p, teach, th);
    if (th !== 'soft' && p.slot === 0 && !Teach.has('hall.' + id)) {
      Teach.mark('hall.' + id);
      // ✓ pays once wherever it was learned; in-run lessons bank it for the run's end (P6 pays it out)
      const reward = def?.reward ?? 3;
      if (reward > 0) Flags.inc('onboard.pendingShards', reward);
    }
    Tut.log('complete', { lesson: id, how, slot: p.slot });
    for (const cb of doneListeners) { try { cb(id, p, how); } catch (e) { console.error('[lessons]', e); } }
  },
  onComplete(cb: (id: LessonId, p: Player, how: string) => void): void { doneListeners.push(cb); },
  /** every Stage update (real time, runs through hit-stop) */
  tick(dtReal: number): void {
    for (const r of runs) if (!r.ended) r.t += dtReal;
  },
};
