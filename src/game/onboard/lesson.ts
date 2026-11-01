// Lessons (ONBOARD2 §3.6): one runner for the prologue, the after-fight lessons and the Rehearsal
// Hall. A lesson = intro → demo → film wipe → try[step] ⇄ fail → success → end, with help levels
// (§2.10), "watch again" (§3.8), the FreezeGuide (§2.0) and a gate layer that opens its verbs for its
// player while it runs.
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
// The step machine runs on the Stage's update (real time, through hit-stop and the FreezeGuide);
// step clocks count the world's own time. A step reads the lesson hand's bus events (until / done /
// fail) and its own clock (hint, tick, timeout); the F4a extensions (start, enter, tick, exit,
// caption, auto, resetTo) are all optional, so F4b's lessons written against the interface-day
// shape keep working.
import type { Player } from '../entities/player';
import type { World } from '../world/world';
import type { Entity } from '../entities/entity';
import type { BusEvents } from '../systems/bus';
import type { L10n } from '../i18n';
import type { DemoClip, DemoEvent, DemoStep } from './demo';
import type { StageHost, StageLayout } from './host';
import type { SayOpts } from './stage';
import { G } from '../G';
import { Teach, Flags } from '../meta/registry';
import { S } from '../strings';
import { T, TS } from '../world/room';
import { Onboard, OnboardHooks, Tut, type TeachHow } from './core';
import { Gates } from './gates';
import { Stage } from './stage';
import { Beat } from './beat';
import { Rich } from './rich';
import { sfx } from '../G';
import { DemoDirector } from './demo';
import { RebuildHost, SoftHost } from './host';
import { PlayerInput } from '../../engine/input';
import '../strings/onboard';

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
  // ── F4a additions (optional to use) ──
  /** world → stage coordinates */
  local(x: number, y: number): { x: number; y: number };
  /** the current step's key */
  readonly stepKey: string;
  /** the lesson is in its demo (the puppet is on stage) */
  readonly demo: boolean;
  /** show a line for this lesson (defaults: tier A, Ines speaking, this hand's seat and device) */
  say(o: Partial<SayOpts> & { key: string; text: SayOpts['text'] }): void;
  /** hold the world still (the FreezeGuide) until the hand presses rewind or `timeout` real seconds pass */
  freeze(timeout?: number, onTimeout?: () => void): void;
  readonly frozen: boolean;
  /** 1 → 0 over the FreezeGuide's time-out (1 when not frozen) */
  readonly freezeLeft: number;
  /** the next step / a named step / success / a failure now */
  next(): void;
  goto(key: string): void;
  succeed(): void;
  fail(text: L10n, o?: { wipe?: boolean; to?: string; vars?: Record<string, string | number> }): void;
  /** tell a running demo driver a stage event happened (DemoStep waitFor 'cue:<id>') */
  cue(id: string): void;
  /** true the first time it is asked for this key in this attempt */
  once(key: string): boolean;
  /** go to a step through the film wipe (the stage is laid out again for it) */
  wipeTo(key: string): void;
  /** play the lesson's demo now (help), then come back to this step */
  replayDemo(): void;
}

/** a step failure with options: no wipe (carry on in place), or back to another step */
export interface FailResult { text: L10n; wipe?: boolean; to?: string; vars?: Record<string, string | number> }

export interface LessonStep {
  /** caption key in the 'onboard' table (the step's one instruction) */
  key: string;
  /** advance to the next step when true */
  until?: (e: LessonEvent, ctx: LessonCtx) => boolean;
  /** the lesson succeeds when true (last step) */
  done?: (e: LessonEvent, ctx: LessonCtx) => boolean;
  /** a specific failure → its fail beat line (then the wipe and a retry of this step) */
  fail?: (e: LessonEvent, ctx: LessonCtx) => L10n | FailResult | null;
  /** a nudge that is not a failure (tier B), asked every tick */
  hint?: (ctx: LessonCtx, t: number) => L10n | null;
  /**
   * the hit that lands freezes the world until rewind is pressed (ONBOARD2 §2.0 FreezeGuide);
   * 'help' = only from help level 3 (§2.10: "freeze on the hit + the big button")
   */
  freezeOnHit?: boolean | 'help';
  /** seconds before the step counts as idle-failed (default: none) */
  timeout?: number;
  // ── F4a additions (all optional) ──
  /** where the hand stands when a reset lands on this step (stage coordinates; prologue) */
  start?: { x: number; y: number };
  enter?(ctx: LessonCtx): void;
  tick?(ctx: LessonCtx, dt: number): void;
  exit?(ctx: LessonCtx): void;
  /** extra options for the step's caption (spot, form, sub …); null = no caption */
  caption?: Partial<SayOpts> | null | ((ctx: LessonCtx) => Partial<SayOpts> | null);
  /** ?autoplay=onboard: what the driver does in this step */
  auto?: DemoStep[] | ((ctx: LessonCtx) => DemoStep[]);
  /** ?autoplay=onboard&fumble=1: what the driver does on the first attempts (a mistake on purpose) */
  fumble?: DemoStep[];
  /** how many attempts fumble (default 1) */
  fumbleN?: number;
  /** a failure here goes back to this step (default: this one) */
  resetTo?: string;
  /** the step's own timeout handler (default: fail with the step's line) */
  onTimeout?(ctx: LessonCtx): void;
  /** ?autoplay=onboard: the QA bot's brain fights this step (a real fight: L6) */
  autoBot?: boolean;
}

/** an intro beat: one of Ines's lines (or the model sentence as a small footer) */
export interface IntroBeat { text: L10n; dur: number; footer?: L10n; strip?: number; spot?: SayOpts['spot'] }

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
  success: { stamp: L10n; why: L10n; sub?: L10n; strip?: number; quiet?: boolean };
  /** refill = Sand full at every attempt and the lesson's spending refunded at the end */
  sand: 'refill' | 'keep';
  /** the gates this lesson opens for its player while it runs */
  verbs?: { scrub?: boolean; fork?: boolean };
  /** shards for the first ✓ (default 3; the prologue's lessons 0 — the prologue pays 15) */
  reward?: number;
  /** place the props (stage coordinates or relative to the hand) */
  props(ctx: LessonCtx): void;
  // ── F4a additions (all optional) ──
  /** intro beats with their own durations (replaces intro when given) */
  beats?: IntroBeat[];
  /** where the hand starts (stage coordinates; prologue) */
  start?: { x: number; y: number; face?: 1 | -1 };
  /** a demo cue (DemoStep 'cue') */
  cue?(ctx: LessonCtx, id: string): void;
  /** model-strip cells already lit before this lesson's success (the new ones light up) */
  stripPrev?: number;
  /** the "watch again" footer shows during the try (default: when there is a demo) */
  replayable?: boolean;
  /** called whenever a stage stands (after props): per-lesson setup on the fresh world */
  staged?(ctx: LessonCtx): void;
  /** the lesson ends (success, skip, postpone, abort) */
  ended?(ctx: LessonCtx, how: 'success' | 'skip' | 'postpone' | 'abort'): void;
  /** the success beat is followed by the lesson's end after this long (2.4) */
  successDur?: number;
  /** every update while the lesson runs (demo and try alike): stage triggers */
  tick?(ctx: LessonCtx, dt: number): void;
  /** the demo plays before the try (default true); false = only on request (help, watch again) */
  demoFirst?: boolean;
  /** vars for a success line ({c} {s} …) */
  successVars?(ctx: LessonCtx): Record<string, string | number>;
  /** every bus event of the lesson hand, in every phase (before the step sees it) */
  event?(ev: LessonEvent, ctx: LessonCtx): void;
}

/** where a lesson starts (debug routes: ?phase= ?step= ?help=) */
export interface StartOpts { phase?: 'intro' | 'demo' | 'try'; step?: string; help?: number }

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
const runs: Runner[] = [];
const doneListeners: ((id: LessonId, p: Player, how: string) => void)[] = [];
/** ?autoplay=onboard: the lesson drives the hand with each step's `auto` script (and the demo) */
export const LessonFlags = { autoplay: false, fumble: false };

/** attempt → help level (ONBOARD2 §2.10): 1 → 0, 2 → 1, 3 → 2, 4+ → 3 */
export const helpFor = (attempt: number): 0 | 1 | 2 | 3 => (attempt <= 1 ? 0 : attempt === 2 ? 1 : attempt === 3 ? 2 : 3);
/** idle nudges (real seconds without input in a try) */
const IDLE_SAY = 8, IDLE_HELP = 16;
const FAIL_T = 1.8, YOUR_TURN_T = 1.2, FREEZE_MAX = 6;

/** the floor centre of a world (the prologue's stage origin) */
export function floorCentre(w: World): { x: number; y: number } {
  const m = w.map;
  let sx = 0, sy = 0, n = 0;
  for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) if (m.get(tx, ty) === T.FLOOR) { sx += tx; sy += ty; n++; }
  if (!n) return { x: m.pw / 2, y: m.ph / 2 };
  return { x: Math.round((sx / n) * TS + 8), y: Math.round((sy / n) * TS + 8) };
}

/** the string for a step / beat key ('onboard' table) */
function line(key: string): L10n { return S('onboard', key); }

class Runner implements LessonRun, StageLayout {
  phase: LessonPhase = 'intro';
  step = 0;
  attempts: Record<string, number> = {};
  fails: string[] = [];
  help: 0 | 1 | 2 | 3 = 0;
  demoPlays = 0;
  t = 0;
  ended = false;
  /** sim seconds in this step, real seconds idle, real seconds in the current phase beat */
  private stepT = 0;
  private idleT = 0;
  private idleSaid = false;
  private phaseT = 0;
  private beatI = -1;
  private beatEnd = 0;
  private ungate: (() => void) | null = null;
  private demo: DemoDirector | null = null;
  private driver: DemoDirector | null = null;
  private driverDoneT = -1;
  private returnStep = -1;
  private subW: World | null = null;
  private lastWorldT = 0;
  private freezeState: { pending: number; frozen: boolean; t: number; max: number; onTimeout?: () => void } | null = null;
  private onceKeys = new Set<string>();
  private askedReplay = new Set<number>();
  private endCbs: ((how: string) => void)[] = [];
  private failNext: (() => void) | null = null;
  private failT = 0;
  private hintShown = new Set<string>();
  origin = { x: 0, y: 0, face: 1 as 1 | -1 };
  vars: Record<string, unknown> = {};
  readonly ctx: LessonCtx;

  constructor(readonly def: LessonDef, private hostP: Player, readonly where: Where, readonly host: StageHost) {
    const v = def.verbs;
    if (v) this.ungate = Gates.push({ name: 'lesson:' + def.id, p: null, tapOnly: v.scrub ? (q) => (q === this.p ? false : undefined) : undefined, forkAllow: v.fork ? (q) => (q === this.p ? true : undefined) : undefined });
    const self = this;
    this.ctx = {
      get p() { return self.p; },
      run: this,
      host,
      where,
      get w() { return self.host.world(); },
      get step() { return self.step; },
      get attempt() { return self.attempts[self.stepKey ?? ''] ?? 1; },
      get help() { return self.help; },
      get t() { return self.stepT; },
      get origin() { return self.origin; },
      at: (dx, dy) => ({ x: Math.round(self.origin.x + dx * self.origin.face), y: Math.round(self.origin.y + dy) }),
      local: (x, y) => ({ x: (x - self.origin.x) * self.origin.face, y: y - self.origin.y }),
      spawn: (e) => { const w = self.host.world(); w.add(e); self.host.track(e); return e; },
      get vars() { return self.vars; },
      get stepKey() { return self.stepKey ?? ''; },
      get demo() { return self.phase === 'demo' || self.pendingDemo; },
      say: (o) => { Stage.say({ tier: 'A', speaker: 'ines', slot: self.p.slot, who: self.p.input, ...o }); },
      freeze: (timeout = FREEZE_MAX, onTimeout) => self.freezeNow(timeout, onTimeout),
      get frozen() { return !!self.freezeState?.frozen; },
      get freezeLeft() { const f = self.freezeState; return f?.frozen ? Math.max(0, 1 - f.t / f.max) : 1; },
      next: () => self.advance(self.step + 1),
      goto: (key) => { const i = self.def.steps.findIndex((s) => s.key === key); if (i >= 0) self.advance(i); },
      succeed: () => self.succeed(),
      fail: (text, o = {}) => self.failWith({ text, ...o }),
      cue: (id) => { self.demo?.event(`cue:${id}` as DemoEvent); self.driver?.event(`cue:${id}` as DemoEvent); },
      once: (key) => { if (self.onceKeys.has(key)) return false; self.onceKeys.add(key); return true; },
      wipeTo: (key) => self.wipeTo(key),
      replayDemo: () => self.replay(),
    };
    if (host instanceof RebuildHost || host instanceof SoftHost) host.layout = this;
  }
  get p(): Player { return this.host instanceof SoftHost ? this.hostP : (this.host.p ?? this.hostP); }
  get id(): LessonId { return this.def.id; }
  get stepKey(): string | null { return this.def.steps[this.step]?.key ?? null; }
  get curStep(): LessonStep | undefined { return this.def.steps[this.step]; }
  /** the demo puppet's director while it plays (the Stage's pressed-token sync, __tut) */
  get demoDirector(): DemoDirector | null { return this.demo; }
  onEnd(cb: (how: string) => void): void { this.endCbs.push(cb); }

  // ───────────────────────── stage layout (hosts call this when a stage stands) ─────────────────────────
  layout(w: World, p: Player): void {
    this.vars = {};
    this.onceKeys.clear();
    this.freezeState = null;
    // the stage origin: the prologue's floor centre; in a real room, where the hand stands, facing its way
    if (this.host.kind === 'rebuild') {
      const c = floorCentre(w);
      this.origin = { x: c.x, y: c.y, face: 1 };
      const st = this.phase === 'demo' || this.pendingDemo ? this.def.demo?.start : (this.curStep?.start ?? this.def.start);
      const s0 = st ?? this.def.start ?? { x: 0, y: 0 };
      const q = this.ctx.at(s0.x, s0.y);
      placeHand(p, q.x, q.y, (this.def.start?.face ?? 1) > 0 ? 0 : Math.PI);
      if (this.pendingDemo && this.def.demo) {
        const d = this.def.demo.start;
        if (d.hp !== undefined) p.hp = d.hp;
        if (d.sand !== undefined) p.lo.sand = d.sand;
      }
    } else {
      this.origin = pickOrigin(w, p);
    }
    this.def.props(this.ctx);
    this.def.staged?.(this.ctx);
    if (this.host instanceof SoftHost) this.host.snapshot();
  }
  private pendingDemo = false;

  // ───────────────────────── flow ─────────────────────────
  /** G.time at the start (the lesson's length in simulated seconds, __tut.log) */
  private startG = 0;
  begin(o: StartOpts = {}): void {
    this.startG = G.time;
    Onboard.coach.quiet(this.p.slot, true);
    Tut.log('lessonStart', { lesson: this.id, where: this.where, slot: this.p.slot });
    if (o.help !== undefined) { for (const st of this.def.steps) this.attempts[st.key] = o.help >= 3 ? 4 : o.help + 1; }
    if (o.phase === 'try' || o.step) {
      const i = o.step ? Math.max(0, this.def.steps.findIndex((s) => s.key === o.step)) : 0;
      if (i !== this.step) { this.step = i; if (this.host.kind === 'rebuild') { this.wipeTo(this.def.steps[i].key, true); return; } }
      this.toTry(i, true);
      return;
    }
    if (o.phase === 'demo' && this.def.demo) { this.toDemo(0); return; }
    const beats = this.def.beats ?? (this.def.intro ? this.def.intro.lines.map((l) => ({ text: l, dur: this.def.intro!.dur / Math.max(1, this.def.intro!.lines.length) })) : []);
    if (beats.length) { this.phase = 'intro'; this.beatI = -1; this.phaseT = 0; this.beatEnd = 0; this.nextBeat(beats); }
    else this.afterIntro();
  }
  private beats(): IntroBeat[] { return this.def.beats ?? (this.def.intro ? this.def.intro.lines.map((l) => ({ text: l, dur: this.def.intro!.dur / Math.max(1, this.def.intro!.lines.length) })) : []); }
  private nextBeat(beats: IntroBeat[]) {
    this.beatI++;
    const b = beats[this.beatI];
    if (!b) { Stage.clear('lesson.intro', this.p.slot); this.afterIntro(); return; }
    this.beatEnd = this.phaseT + b.dur;
    this.ctx.say({ key: 'lesson.intro', text: b.text, footer: b.footer, strip: b.strip, dur: b.dur + 0.25, spot: b.spot });
  }
  private afterIntro(): void {
    if (this.def.demo && this.def.demoFirst !== false) this.toDemo(0);
    else this.toTry(0);
  }
  /** to a step through the film wipe (the stage is laid out for it) */
  wipeTo(key: string, first = false): void {
    const i = this.def.steps.findIndex((s) => s.key === key);
    if (i < 0 || this.ended) return;
    if (!first) this.curStep?.exit?.(this.ctx);
    this.driver?.abort(); this.driver = null;
    this.thaw();
    this.phase = 'wipe';
    this.step = i;
    this.host.reset(() => { if (!this.ended) { this.phase = 'try'; this.enterStep(i, true); } });
  }
  /** the demo (from the start of the stage); then a wipe and the try at `back` */
  private toDemo(back: number): void {
    this.phase = 'wipe';
    this.returnStep = back;
    this.pendingDemo = true;
    const go = () => { this.pendingDemo = false; this.startDemo(); };
    const p = this.p;
    const d = this.def.demo!;
    // already standing at the demo's start (the first demo of a prologue lesson): no wipe needed
    const q = this.ctx.at(d.start.x, d.start.y);
    if (this.host.kind === 'rebuild' && this.demoPlays === 0 && Math.hypot(p.x - q.x, p.y - q.y) < 6 && p.echoes.length === 0) {
      (this.host as RebuildHost).relayout();
      go();
    } else this.host.reset(go);
  }
  private startDemo(): void {
    this.phase = 'demo';
    this.phaseT = 0;
    this.demoPlays++;
    tutDemoPlays[this.id] = (tutDemoPlays[this.id] ?? 0) + 1;
    const self = this;
    this.demo = new DemoDirector({
      get ctx() { return self.ctx; },
      frozen: () => !!self.freezeState?.frozen,
      cue: (id) => self.def.cue?.(self.ctx, id),
      ended: () => self.demoEnded(),
    }, this.def.demo!, 'puppet');
    this.demo.start();
  }
  private demoEnded(): void {
    this.demo = null;
    if (this.ended) return;
    this.thaw();
    this.phase = 'wipe';
    this.host.reset(() => {
      if (this.ended) return;
      this.ctx.say({ key: 'lesson.turn', text: S('onboard', 'yourTurn'), dur: YOUR_TURN_T });
      this.toTry(this.returnStep < 0 ? 0 : this.returnStep, true);
    });
  }
  private toTry(i: number, replayReturn = false): void {
    this.phase = 'try';
    this.enterStep(i, replayReturn);
  }
  private enterStep(i: number, keepAttempt = false): void {
    const prev = this.curStep;
    if (prev && this.phase === 'try' && i !== this.step) prev.exit?.(this.ctx);
    this.stopBot();
    this.step = i;
    this.stepT = 0;
    this.idleT = 0;
    this.idleSaid = false;
    this.hintShown.clear();
    this.driverDoneT = -1;
    const st = this.curStep;
    if (!st) { this.succeed(); return; }
    const key = st.key;
    if (!keepAttempt || !this.attempts[key]) this.attempts[key] = Math.max(1, this.attempts[key] ?? 0);
    this.help = Math.max(this.help, helpFor(this.attempts[key])) as 0 | 1 | 2 | 3;
    if (!keepAttempt) this.help = helpFor(this.attempts[key]);
    this.showStepCaption();
    // help level 3: the world around the hand runs at 0.6× for this step (a time bubble; ONBOARD2 §2.10)
    if (this.help >= 3) { const p = this.p; this.host.world()?.bubbles.push({ x: p.x, y: p.y, r: 4000, scale: 0.6, dur: 25, owner: p }); }
    st.enter?.(this.ctx);
    if (this.host instanceof SoftHost) this.host.snapshot();
    Tut.log('step', { lesson: this.id, step: key, attempt: this.attempts[key], help: this.help });
    // help level 2: offer the demo once for this step (watching it does not count as a try)
    if (this.help === 2 && this.def.demo && !this.askedReplay.has(i)) {
      this.askedReplay.add(i);
      this.ctx.say({ key: 'lesson.ask', text: S('onboard', 'watchAsk'), tier: 'A', dur: 4, speaker: 'sys' });
      this.vars.askT = 4;
    }
    if (this.attempts[key] >= 6) this.ctx.say({ key: 'lesson.skipAsk', text: S('onboard', 'skipLesson'), tier: 'B', dur: 6, speaker: 'sys' });
    // autoplay: drive the hand with the step's script
    if (LessonFlags.autoplay) this.startDriver();
  }
  private botInput: PlayerInput | null = null;
  private realInput: PlayerInput | null = null;
  private stopBot(): void {
    if (!this.botInput) return;
    const p = this.p;
    if (p.input === this.botInput && this.realInput) p.input = this.realInput;
    this.botInput.dispose();
    this.botInput = null; this.realInput = null;
  }
  private noDriverT = 0;
  private driverStart = 0;
  private startDriver(): void {
    this.driver?.abort();
    this.driver = null;
    this.driverStart = this.stepT;
    this.stopBot();
    const st = this.curStep;
    if (st?.autoBot) {
      // the QA bot's brain plays this step (GameScene runs botStep for 'bot' inputs)
      const p = this.p;
      this.realInput = p.input;
      this.botInput = new PlayerInput(p.slot, `bot${12 + p.slot}`);
      p.input = this.botInput;
      return;
    }
    if (!st?.auto) return;
    const fumbling = LessonFlags.fumble && !!st.fumble && (this.attempts[st.key] ?? 1) <= (st.fumbleN ?? 1);
    const steps = fumbling ? st.fumble! : typeof st.auto === 'function' ? st.auto(this.ctx) : st.auto;
    if (!steps.length) return;
    const self = this;
    this.driver = new DemoDirector({
      get ctx() { return self.ctx; },
      frozen: () => !!self.freezeState?.frozen,
      cue: (id) => self.def.cue?.(self.ctx, id),
      ended: () => { self.driver = null; self.driverDoneT = 0; },
    }, { id: `${this.id}:${st.key}:auto`, start: { x: 0, y: 0 }, steps, captions: [], maxDur: 30 }, 'drive');
    this.driver.start();
  }
  showStepCaption(): void {
    const st = this.curStep;
    if (!st) return;
    const extra = typeof st.caption === 'function' ? st.caption(this.ctx) : st.caption;
    if (extra === null) return;
    const replay = (this.def.replayable ?? !!this.def.demo);
    const i = this.step;
    this.ctx.say({
      key: 'lesson.step', text: line(st.key), dur: Infinity,
      until: () => this.step !== i || this.phase !== 'try' || this.ended,
      footer: replay ? S('onboard', 'watchAgain') : undefined, footerBlink: this.help === 1,
      ...(extra ?? {}),
    });
  }
  private advance(i: number): void {
    if (this.phase !== 'try') return;
    if (i >= this.def.steps.length) { this.succeed(); return; }
    this.enterStep(i);
  }
  private failWith(f: FailResult): void {
    if (this.phase !== 'try' || this.ended) return;
    const st = this.curStep!;
    this.thaw();
    this.fails.push(st.key);
    tutFails[this.id] = [...(tutFails[this.id] ?? []), st.key];
    this.attempts[st.key] = (this.attempts[st.key] ?? 1) + 1;
    this.phase = 'fail';
    this.failT = 0;
    st.exit?.(this.ctx);
    this.stopBot();
    this.driver?.abort(); this.driver = null;
    Stage.clear('lesson.step', this.p.slot);
    Beat.fail({ p: this.p, id: this.id, text: f.text, vars: f.vars });
    const to = f.to ?? st.resetTo;
    const back = to ? Math.max(0, this.def.steps.findIndex((s) => s.key === to)) : this.step;
    this.failNext = () => {
      if (f.wipe === false) { this.phase = 'try'; this.enterStep(back, true); return; }
      this.phase = 'wipe';
      this.host.reset(() => { if (this.ended) return; this.phase = 'try'; this.enterStep(back, true); });
    };
  }
  succeed(): void {
    if (this.ended || this.phase === 'success') return;
    this.thaw();
    this.curStep?.exit?.(this.ctx);
    this.driver?.abort(); this.driver = null;
    this.stopBot();
    this.phase = 'success';
    this.phaseT = 0;
    Stage.clear('lesson.step', this.p.slot);
    Stage.clear('lesson.hint', this.p.slot);
    Lessons.complete(this.id, this.p, 'lesson');
    const sc = this.def.success;
    if (sc.quiet) { sfx('glyphPress'); this.host.world()?.bus.emit('custom', { id: 'onboard.success', player: this.p, data: { id: this.id } }); Tut.log('success', { id: this.id, slot: this.p.slot }); return; }
    const vars = this.def.successVars?.(this.ctx);
    const fill = (l?: L10n) => (l && vars ? { zh: Rich.fill(l.zh, vars), en: Rich.fill(l.en, vars) } : l);
    Beat.success({ p: this.p, id: this.id, stamp: sc.stamp, why: fill(sc.why)!, strip: sc.strip, stripPrev: this.def.stripPrev, sub: fill(sc.sub), dur: this.def.successDur ?? 2.4 });
  }
  replay(): void {
    if (!this.def.demo || this.phase !== 'try') return;
    this.thaw();
    this.curStep?.exit?.(this.ctx);
    this.driver?.abort(); this.driver = null;
    Stage.clear('lesson.step', this.p.slot);
    Tut.log('demoStart', { lesson: this.id, replay: true });
    this.toDemo(this.step);
  }
  skip(): void {
    if (this.ended) return;
    Tut.log('skip', { lesson: this.id });
    Lessons.complete(this.id, this.p, 'skip');
    this.end('skip');
  }
  postpone(): void {
    if (this.ended) return;
    Flags.inc('onboard.postpone.' + this.id);
    Tut.log('postpone', { lesson: this.id });
    this.end('postpone');
  }
  end(how: 'success' | 'skip' | 'postpone' | 'abort' = 'abort'): void {
    if (this.ended) return;
    this.thaw();
    this.ended = true;
    this.phase = 'end';
    this.demo?.abort(); this.demo = null;
    this.driver?.abort(); this.driver = null;
    this.stopBot();
    this.ungate?.();
    this.ungate = null;
    for (const k of ['lesson.step', 'lesson.intro', 'lesson.turn', 'lesson.ask', 'lesson.skipAsk', 'lesson.hint', 'demo.cap']) Stage.clear(k, this.p.slot);
    try { this.def.ended?.(this.ctx, how); } catch (e) { console.error('[lessons]', e); }
    // a lesson that used the refill gives its Sand back (it was practice)
    if (this.def.sand === 'refill' && this.host instanceof SoftHost) this.p.lo.sand = Math.max(this.p.lo.sand, this.host.startSand ?? this.p.lo.sand);
    this.host.dispose();
    Onboard.coach.quiet(this.p.slot, false);
    const i = runs.indexOf(this);
    if (i >= 0) runs.splice(i, 1);
    Tut.log('lessonEnd', { lesson: this.id, how, sim: +(G.time - this.startG).toFixed(2), attempts: { ...this.attempts } });
    for (const cb of this.endCbs) { try { cb(how); } catch (e) { console.error('[lessons]', e); } }
  }

  // ───────────────────────── the FreezeGuide ─────────────────────────
  private freezeNow(timeout: number, onTimeout?: () => void): void {
    // wait for the hand to tape the frame of the hit (the red notch and +N show), then hold the world
    this.freezeState = { pending: this.p.rec.tick, frozen: false, t: 0, max: timeout, onTimeout };
  }
  private thaw(): void {
    const f = this.freezeState;
    if (f?.frozen) { const w = this.host.world(); if (w && w.stop > 1e6) w.stop = 0; }
    this.freezeState = null;
  }
  private tickFreeze(dt: number): void {
    const f = this.freezeState;
    if (!f) return;
    const p = this.p, w = this.host.world();
    if (!f.frozen) {
      if (p.rec.tick > f.pending && w.stop <= 0) { f.frozen = true; w.stop = 1e9; Tut.log('freeze', { lesson: this.id }); }
      return;
    }
    if (p.input.pressed('rewind') && !p.rw && p.state === 'alive') {
      w.stop = 0;
      this.freezeState = null;
      p.tryRewind();
      Tut.log('thaw', { lesson: this.id, by: 'rewind' });
      return;
    }
    f.t += dt;
    if (f.t >= f.max) { const cb = f.onTimeout; this.thaw(); Tut.log('thaw', { lesson: this.id, by: 'timeout' }); cb?.(); }
  }

  // ───────────────────────── events ─────────────────────────
  private subscribe(w: World): void {
    this.subW = w;
    this.lastWorldT = w.time;
    const owner = this.host.owner;
    const mine = (pl?: Player) => !pl || pl === this.p;
    const fwd = <K extends keyof BusEvents>(type: K) => w.bus.on(type, (e) => {
      const pl = (e as { player?: Player }).player;
      if (!mine(pl)) return;
      this.onEvent({ type, e } as LessonEvent);
    }, owner);
    for (const k of ['damaged', 'hit', 'kill', 'rewind', 'fork', 'echoSpawn', 'echoArmed', 'echoEnd', 'paradox', 'custom', 'attack', 'dash', 'dashEnd', 'revived', 'downed', 'culprit'] as (keyof BusEvents)[]) fwd(k);
  }
  private onEvent(ev: LessonEvent): void {
    if (this.ended) return;
    if (this.phase !== 'end') { try { this.def.event?.(ev, this.ctx); } catch (e) { console.error('[lessons]', e); } }
    if (this.ended) return;
    // the demo / driver hear their events
    const dev = demoEventOf(ev, this.p);
    if (dev) { this.demo?.event(dev); this.driver?.event(dev); }
    // the FreezeGuide catches the hit
    if (ev.type === 'damaged' && ev.e.undoable !== false && ev.e.player === this.p) {
      const st = this.curStep;
      const want = this.phase === 'demo' ? !!this.def.demo?.freezeOnHit : this.phase === 'try' && !!st && (st.freezeOnHit === true || (st.freezeOnHit === 'help' && this.help >= 3));
      if (want && !this.freezeState) this.freezeNow(FREEZE_MAX, () => { this.curStep?.onTimeout?.(this.ctx); });
    }
    if (this.phase !== 'try') return;
    const st = this.curStep;
    if (!st) return;
    const i = this.step;
    const f = st.fail?.(ev, this.ctx);
    if (f) { this.failWith('text' in (f as FailResult) && (f as FailResult).text ? (f as FailResult) : { text: f as L10n }); return; }
    if (this.step !== i || this.phase !== 'try') return;
    if (st.done?.(ev, this.ctx)) { this.succeed(); return; }
    if (this.step !== i || this.phase !== 'try') return;
    if (st.until?.(ev, this.ctx)) this.advance(i + 1);
  }

  // ───────────────────────── the clock (Stage update, real time) ─────────────────────────
  update(dtReal: number): void {
    if (this.ended) return;
    const w = this.host.world();
    if (!w) return;
    if (w !== this.subW) this.subscribe(w);
    // a soft lesson whose hand left the room (walked out through a door): later
    if (this.host.kind === 'soft' && this.p.world !== w) { this.postpone(); return; }
    const dtSim = Math.max(0, w.time - this.lastWorldT);
    this.lastWorldT = w.time;
    this.t += dtSim;
    this.phaseT += dtReal;
    this.demo?.tick(dtReal);
    this.driver?.tick(dtReal);
    this.tickFreeze(dtReal);
    if (this.phase === 'demo' || this.phase === 'try' || this.phase === 'fail') { try { this.def.tick?.(this.ctx, dtSim); } catch (e) { console.error('[lessons]', e); } }
    if (this.ended) return;
    switch (this.phase) {
      case 'intro': {
        if (this.phaseT >= this.beatEnd) this.nextBeat(this.beats());
        return;
      }
      case 'fail':
        this.failT += dtReal;
        if (this.failT >= FAIL_T && this.failNext) { const f = this.failNext; this.failNext = null; f(); }
        return;
      case 'success':
        if (this.phaseT >= (this.def.successDur ?? 2.4)) this.end('success');
        return;
      case 'try': break;
      default: return;
    }
    const st = this.curStep;
    if (!st) return;
    this.stepT += dtSim;
    const p = this.p;
    // "watch again" ({@info}); help 2's offer ({@confirm}); 6+ attempts: skip ({@confirm})
    // the player's own device (under autoplay the driver's puppet input sits on the hand)
    const inp = this.driver?.realInput ?? p.input;
    if (this.def.demo && (this.def.replayable ?? true) && inp.pressed('info')) { inp.consume('info'); this.replay(); return; }
    if (typeof this.vars.askT === 'number') {
      this.vars.askT = (this.vars.askT as number) - dtReal;
      const mv = inp.move();
      if (inp.pressed('confirm') && !inp.pressed('dash')) { this.vars.askT = undefined; Stage.clear('lesson.ask', p.slot); this.replay(); return; }
      if (mv.x || mv.y || (this.vars.askT as number) <= 0) { this.vars.askT = undefined; Stage.clear('lesson.ask', p.slot); }
    }
    if ((this.attempts[st.key] ?? 1) >= 6 && inp.pressed('confirm') && Stage.current(Hud_multi() ? p.slot : undefined)?.key === 'lesson.skipAsk') { this.skip(); return; }
    // the step's own clock
    st.tick?.(this.ctx, dtSim);
    if (this.phase !== 'try' || this.curStep !== st) return;
    this.onEvent({ type: 'time', e: { dt: dtSim } });
    if (this.phase !== 'try' || this.curStep !== st) return;
    const h = st.hint?.(this.ctx, this.stepT);
    if (h) {
      const hk = typeof h === 'object' ? (h.en ?? '') : String(h);
      if (!this.hintShown.has(hk)) { this.hintShown.add(hk); this.ctx.say({ key: 'lesson.hint', text: h, tier: 'B', dur: 3, speaker: 'ines' }); }
    }
    if (st.timeout && this.stepT >= st.timeout) {
      if (st.onTimeout) { this.stepT = 0; st.onTimeout(this.ctx); }
      else this.failWith({ text: line(st.key) });
      return;
    }
    // idle: 8 s with no input → say the step again and pulse its buttons; 16 s → one help level up
    if (!this.freezeState?.frozen && !this.driver) {
      const mv = inp.move();
      const any = mv.x || mv.y || ['attack', 'dash', 'rewind', 'fork', 'special'].some((a) => inp.down(a as never));
      this.idleT = any ? 0 : this.idleT + dtReal;
      if (this.idleT >= IDLE_SAY && !this.idleSaid) { this.idleSaid = true; Stage.clear('lesson.step', p.slot); this.showStepCaption(); Stage.nudge('lesson.step', p.slot); }
      if (this.idleT >= IDLE_HELP) { this.idleT = IDLE_SAY; this.help = Math.min(3, this.help + 1) as 0 | 1 | 2 | 3; Tut.log('idleHelp', { lesson: this.id, help: this.help }); }
    }
    // autoplay: a script that ran out without the step moving on runs again after a pause; a step
    // left with no driver at all (or one stuck for 15 s) gets a fresh one — CI never waits forever
    if (LessonFlags.autoplay && st.auto && !st.autoBot) {
      if (this.driverDoneT >= 0) { this.driverDoneT += dtReal; if (this.driverDoneT > 3) { this.driverDoneT = -1; this.startDriver(); } }
      else if (!this.driver || this.stepT > this.driverStart + 15) {
        this.noDriverT += dtReal;
        if (this.noDriverT > 2 || (this.driver && this.stepT > this.driverStart + 15)) { this.noDriverT = 0; Tut.log('autoRestart', { lesson: this.id, step: st.key }); this.startDriver(); }
      } else this.noDriverT = 0;
    }
  }
}
const Hud_multi = () => (G.scenes.current as unknown as { world?: World } | null)?.world?.playerCount !== undefined && ((G.scenes.current as unknown as { world: World }).world.playerCount > 1);

/** what a bus event means to a demo script */
function demoEventOf(ev: LessonEvent, p: Player): DemoEvent | null {
  switch (ev.type) {
    case 'damaged': return ev.e.player === p ? 'hit' : null;
    case 'rewind': return 'rewindLand';
    case 'echoSpawn': return 'echoSpawn';
    case 'echoArmed': return 'echoArmed';
    case 'echoEnd': return 'echoEnd';
    case 'paradox': return 'paradox';
    case 'fork': return 'fork';
    case 'custom': return ev.e.id === 'propBroken' ? 'propBroken' : ev.e.id.startsWith('cue:') ? (ev.e.id as DemoEvent) : null;
  }
  return null;
}

/** put a hand somewhere as if it had always stood there: still, tape refilled at its feet */
export function placeHand(p: Player, x: number, y: number, face = 0): void {
  p.x = x; p.y = y;
  p.vx = p.vy = 0; p.kx = p.ky = 0;
  p.autoWalk = 0;
  p.collides = true;
  p.lastSafeX = x; p.lastSafeY = y;
  p.setFacing(face);
  p.aim = face;
  p.rec.clear();
  p.rec.prefill(x, y, p.rec.capacity, { hp: Math.max(1, p.hp), fixed: p.fixedTaken, tempo: p.lo.tempo, dir: 2, flip: Math.cos(face) < 0 });
  p.scarfA.reset(x, y - 10);
  p.scarfB.reset(x, y - 10);
}

/** in a real room: the hand's spot, facing the side with room for a 48 px stage (mirrored when the wall is close) */
function pickOrigin(w: World, p: Player): { x: number; y: number; face: 1 | -1 } {
  const m = w.map;
  const open = (x: number, y: number) => { const tx = Math.floor(x / TS), ty = Math.floor(y / TS); return m.get(tx, ty) === T.FLOOR; };
  const room = (dir: 1 | -1) => { let n = 0; for (let d = 8; d <= 96; d += 8) { if (!open(p.x + d * dir, p.y) || !open(p.x + d * dir, p.y - 24) || !open(p.x + d * dir, p.y + 16)) break; n = d; } return n; };
  const want: 1 | -1 = p.flip ? -1 : 1;
  const face: 1 | -1 = room(want) >= 72 ? want : room(-want as 1 | -1) > room(want) ? (-want as 1 | -1) : want;
  return { x: Math.round(p.x), y: Math.round(p.y), face };
}

/** __tut's per-lesson tallies (kept after a lesson ends) */
export const tutDemoPlays: Record<string, number> = {};
export const tutFails: Record<string, string[]> = {};
export const tutAttempts: Record<string, Record<string, number>> = {};

export const Lessons = {
  /** add (or replace) a lesson */
  define(d: LessonDef): void { DEFS.set(d.id, d); },
  get(id: LessonId): LessonDef | null { return DEFS.get(id) ?? null; },
  all(): LessonDef[] { return [...DEFS.values()]; },
  /** run a lesson for a hand on a stage host (intro → demo → wipe → try → success) */
  start(id: LessonId, p: Player, where: Where, host: StageHost, opts?: StartOpts): LessonRun {
    const def = DEFS.get(id);
    if (!def) throw new Error(`[lessons] no lesson "${id}"`);
    const run = new Runner(def, p, where, host);
    runs.push(run);
    tutAttempts[id] = run.attempts;
    // the stage stands already: lay it out (a soft host here; the prologue host lays out from build())
    if (host instanceof SoftHost) run.layout(host.world(), p);
    else if (host instanceof RebuildHost) host.relayout();
    run.begin(opts);
    return run;
  },
  /** the lesson this hand is taking (any hand when omitted), or null */
  active(p?: Player | null): LessonRun | null {
    for (const r of runs) if (!r.ended && (!p || r.p === p)) return r;
    return null;
  },
  /** the runner behind a run (the prologue director, debug) */
  runner(run: LessonRun | null): (LessonRun & { onEnd(cb: (how: string) => void): void; end(how?: 'success' | 'skip' | 'postpone' | 'abort'): void; succeed(): void; readonly ctx: LessonCtx; readonly demoDirector: DemoDirector | null; showStepCaption(): void }) | null {
    return run instanceof Runner ? run : null;
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
    for (const r of runs.slice()) { try { r.update(dtReal); } catch (e) { console.error('[lessons]', e); } }
  },
  /** end every lesson now (a scene the lessons do not belong to took over) */
  abortAll(): void { for (const r of runs.slice()) r.end('abort'); },
};
