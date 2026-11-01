// The demo puppet (ONBOARD2 §3): the player's own hand, driven by a script, shows a move with the
// real rewind / echo / paradox code and the real HUD — then the stage is wound back to the start.
//
//   DemoClip      the script: steering steps (walk toward a point, wait for an event, tap / hold a
//                 button, aim, combo …), timed captions, a time-out, the segments help level 2 replays
//   DemoDirector  swaps p.input for a puppet input, draws the chalk outline (Player.renderTint =
//                 PUPPET_TINT), floats the button bubble over the hand, keeps the demo frame and the
//                 "DEMO 0:04" badge on screen, and hands control back after 0.2 s of neutral input
//
// Steering, not recorded stick values: P1 / P5 can retune speeds and combo timings and a demo still
// arrives. Every waitFor has a timeout and a force; a forced step logs 'demo-desync' (CI: 0).
// The director ticks from the lesson runner (Stage update, real time), not as a world entity, so it
// keeps running while the FreezeGuide holds the world still: its waits count sim time, or real time
// while the world is held. The same director drives the real hand under ?autoplay=onboard (no chalk,
// no bubble, no captions: mode 'drive').
import type { Action, BotInput, DeviceKind } from '../../engine/input';
import type { Player, PlayerTint } from '../entities/player';
import type { SpotRef } from './stage';
import type { L10n } from '../i18n';
import type { LessonCtx } from './lesson';
import { PlayerInput } from '../../engine/input';
import { G, sfx } from '../G';
import { tr } from '../i18n';
import { S } from '../strings';
import { Text } from '../ui/text';
import { rect } from '../ui/draw';
import { col } from '../../art/palette';
import { Hud } from '../ui/hud';
import { Stage } from './stage';
import { bigPrompt, Rich, type TokenAction } from './rich';
import { Gates } from './gates';
import { Tut } from './core';
import '../strings/onboard';

export type DemoEvent = 'hit' | 'rewindLand' | 'echoSpawn' | 'echoArmed' | 'paradox' | 'propBroken' | 'echoEnd' | 'fork' | `cue:${string}`;

export type DemoStep =
  /** steer toward (x, y) in stage coordinates (prologue: from the floor centre; in-run / Hall: from the start); stops within 3 px */
  | { k: 'walkTo'; x: number; y: number; speed?: number }
  | { k: 'wait'; s: number }
  /** wait for an event; past `timeout` call force() (if any), log demo-desync and go on */
  | { k: 'waitFor'; ev: DemoEvent; timeout: number; force?: (ctx: LessonCtx) => void }
  /** down for 4 ticks then up (< 0.18 s: always a tap) */
  | { k: 'tap'; a: Action }
  /** held s seconds (the scrub demo; the puppet's own gates are opened for it) */
  | { k: 'hold'; a: Action; s: number }
  | { k: 'press'; a: Action } | { k: 'release'; a: Action }
  | { k: 'aimAt'; x: number; y: number } | { k: 'aimAtNearest' }
  /** n attack presses, spaced at 60% of the weapon's combo window */
  | { k: 'combo'; n: number }
  /** a stage script event (dropGearA, spawnJar …) */
  | { k: 'cue'; id: string }
  /** dash toward a stage point (the move direction is held through the press) */
  | { k: 'dashTo'; x: number; y: number }
  /** once the hand's newest echo stands armed at its end, walk into it (a paradox) */
  | { k: 'walkToEcho'; timeout?: number };

export interface DemoCaption {
  /** when: sim seconds from the demo's start, an event, "event+seconds", or the moment a button goes down */
  at: number | DemoEvent | `${DemoEvent}+${number}` | `press:${Action}`;
  /** a string key in the 'onboard' table (or a literal L10n) */
  key: string | L10n;
  spot?: SpotRef | SpotRef[] | ((ctx: LessonCtx) => SpotRef | SpotRef[] | undefined);
  dur?: number;
  /** placeholder values for the line ({c} {s} {n} …), read when it shows */
  vars?: (ctx: LessonCtx) => Record<string, string | number>;
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
  /** about how long it runs (the badge's countdown; default maxDur − 1) */
  dur?: number;
  /** the first hit freezes the world until the puppet presses rewind (the FreezeGuide, as in the try) */
  freezeOnHit?: boolean;
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

/** hold confirm this long to skip a demo (ONBOARD2 §3.8) */
export const SKIP_HOLD = 0.6;
/** the bubble shows this long before a press (ONBOARD2 §3.5) */
const BUBBLE_LEAD = 0.6;
const NEUTRAL_T = 0.2;

/**
 * A puppet input: a PlayerInput that reads only what the director writes (kind 'demo', so the QA
 * bot never takes it over), aiming where the director says.
 */
const IDLE_BOT: BotInput = { move: { x: 0, y: 0 }, aimX: 0, aimY: 0, held: new Set(), pressed: new Set() };
export class PuppetInput extends PlayerInput {
  /** the device the player really holds (a puppet started over another puppet keeps the true one) */
  real: PlayerInput | null = null;
  constructor(slot: number) {
    super(slot, `bot${8 + slot}`);
    this.kind = 'demo' as DeviceKind;
    this.bot = { move: { x: 0, y: 0 }, aimX: 0, aimY: 0, held: new Set(), pressed: new Set() };
  }
  /** (a disposed puppet left on a hand by mistake reads as an idle stick, never a crash) */
  get b(): BotInput { return this.bot ?? IDLE_BOT; }
  aim(): { x: number; y: number; kind: 'mouse' | 'stick' | 'assist' | 'none' } {
    const b = this.b;
    if (b.aimX || b.aimY) return { x: b.aimX, y: b.aimY, kind: 'stick' };
    if (b.move.x || b.move.y) return { x: b.move.x, y: b.move.y, kind: 'assist' };
    return { x: 0, y: 0, kind: 'none' };
  }
  facesAim(): boolean { return !!(this.b.aimX || this.b.aimY); }
  aiming(): boolean { return false; }
  rumble(): void {}
}

export type DemoMode = 'puppet' | 'drive';

export interface DemoHost {
  readonly ctx: LessonCtx;
  /** the world is held still by the FreezeGuide (waits count real time then) */
  frozen(): boolean;
  cue(id: string): void;
  /** the demo ended (skipped: the player held confirm) */
  ended(skipped: boolean): void;
}

let active: DemoDirector[] = [];

export class DemoDirector implements DemoDirectorApi {
  t = 0;
  done = false;
  private i = -1;
  private stepT = 0;
  private stepState: Record<string, number> = {};
  private real: PlayerInput;
  private puppet: PuppetInput;
  private seen = new Map<string, number>();
  private capsDone = new Set<number>();
  private skipT = 0;
  private handback = -1;
  private holdTicks = new Map<Action, number>();
  private holdUntil = new Map<Action, number>();
  private pressAt = new Map<Action, number>();
  private aim: { x: number; y: number } | null = null;
  private ungate: (() => void) | null = null;
  private lastWorldT = 0;
  private skipped = false;
  /** the action the bubble shows (and when it went down / how long it is held) */
  bubble: { a: Action; down: number; holdS: number; shown: number; up: number } | null = null;

  constructor(private host: DemoHost, readonly clip: DemoClip, readonly mode: DemoMode = 'puppet') {
    const p = host.ctx.p;
    this.real = p.input;
    this.puppet = new PuppetInput(p.slot);
  }
  get p(): Player { return this.host.ctx.p; }
  /** the device the player really holds (the puppet's input replaces it on the hand while this runs) */
  get realInput(): PlayerInput { return this.real; }

  start(): void {
    const p = this.p;
    // the true device, even when another script's puppet still sits on the hand
    this.real = p.input instanceof PuppetInput ? (p.input.real ?? p.input) : p.input;
    this.puppet.real = this.real;
    p.input = this.puppet;
    if (this.mode === 'puppet') p.renderTint = PUPPET_TINT;
    this.lastWorldT = p.world.time;
    active.push(this);
    if (this.mode === 'puppet') { sfx('demoStart'); Tut.log('demoStart', { clip: this.clip.id }); }
    this.next();
  }

  /** buttons the puppet holds now (the caption tokens sink with them) */
  pressed(): ReadonlySet<Action> { return this.puppet.b.held; }

  /** a bus event the runner saw for this hand */
  event(ev: DemoEvent): void {
    this.seen.set(ev, this.t);
    if (this.done) return;
    const s = this.clip.steps[this.i];
    if (s && s.k === 'waitFor' && s.ev === ev) this.next();
    else if (s && s.k === 'walkToEcho' && ev === 'paradox') { this.puppet.b.move = { x: 0, y: 0 }; this.next(); }
  }

  private say(c: DemoCaption) {
    if (this.mode !== 'puppet') return;
    const text = typeof c.key === 'string' ? S('onboard', c.key) : c.key;
    const vars = c.vars?.(this.host.ctx);
    const spot = typeof c.spot === 'function' ? c.spot(this.host.ctx) : c.spot;
    Stage.say({ key: 'demo.cap', tier: 'A', text, vars, speaker: 'ines', spot, dur: c.dur ?? 3, who: this.real, pressed: () => this.pressed() });
  }

  private next(): void {
    this.i++;
    this.stepT = 0;
    this.stepState = {};
    const s = this.clip.steps[this.i];
    if (!s) { this.finish(false); return; }
    const b = this.puppet.b;
    // a waitFor counts what happened since the last thing the puppet did (an event may come
    // before its waitFor starts: the fork lands while the tap is still held)
    if (s.k !== 'wait' && s.k !== 'waitFor' && s.k !== 'aimAt' && s.k !== 'aimAtNearest') this.actionT = this.t;
    switch (s.k) {
      case 'cue': this.host.cue(s.id); this.seen.set(`cue:${s.id}`, this.t); this.next(); return;
      case 'aimAt': { const q = this.host.ctx.at(s.x, s.y); this.aim = { x: q.x, y: q.y }; this.next(); return; }
      case 'aimAtNearest': {
        const p = this.p;
        let best: { x: number; y: number } | null = null, bd = Infinity;
        for (const e of p.world.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = { x: e.x, y: e.y }; } }
        this.aim = best; this.next(); return;
      }
      case 'press': this.down(s.a); this.next(); return;
      case 'release': this.up(s.a); this.next(); return;
      case 'tap': this.down(s.a, 4); return;
      case 'dashTo': {
        const p = this.p, q = this.host.ctx.at(s.x, s.y);
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
        b.move = { x: dx / d, y: dy / d };
        this.down('dash', 4);
        return;
      }
      case 'hold':
        // a held rewind scrubs, even before Scrub is taught: the puppet's gates are open for it
        if (s.a === 'rewind' && !this.ungate) this.ungate = Gates.push({ name: 'demo:hold', p: this.p, tapOnly: () => false });
        this.down(s.a, -1);
        this.holdUntil.set(s.a, s.s);
        return;
      case 'walkTo': case 'wait': case 'waitFor': case 'combo': case 'walkToEcho':
        b.move = { x: 0, y: 0 };
        return;
    }
  }
  private pressWorldT = -1;
  /** sim time of the last step that made the puppet do something */
  private actionT = 0;
  private down(a: Action, ticks = -1) {
    const b = this.puppet.b;
    this.pressWorldT = this.p.world?.time ?? 0;
    b.pressed.add(a);
    b.held.add(a);
    this.holdTicks.set(a, ticks);
    this.pressAt.set(a, this.t);
    if (this.mode === 'puppet') {
      const held = this.clip.steps[this.i];
      this.bubble = { a, down: this.t, holdS: held && held.k === 'hold' ? held.s : 0, shown: this.bubble?.a === a ? this.bubble.shown : this.t, up: -1 };
      sfx('glyphPress', { vol: 0.8 });
    }
    // captions that wait for this press
    this.fireCaptions();
  }
  private up(a: Action) {
    const b = this.puppet.b;
    b.held.delete(a);
    this.holdTicks.delete(a);
    this.holdUntil.delete(a);
    if (this.bubble && this.bubble.a === a) this.bubble.up = this.t;
  }

  /** the next press coming without a walk in between (the bubble's preview) */
  private upcoming(): { a: Action; hold: boolean; inS: number } | null {
    let inS = 0;
    for (let j = this.i; j < this.clip.steps.length; j++) {
      const s = this.clip.steps[j];
      if (s.k === 'walkTo' || s.k === 'walkToEcho') return null;
      if (s.k === 'tap' || s.k === 'press') return { a: s.a, hold: false, inS };
      if (s.k === 'dashTo') return { a: 'dash', hold: false, inS };
      if (s.k === 'hold') return { a: s.a, hold: true, inS };
      if (s.k === 'combo') return { a: 'attack', hold: false, inS };
      if (s.k === 'wait') inS += j === this.i ? Math.max(0, s.s - this.stepT) : s.s;
      if (s.k === 'waitFor') inS += 0.5;
    }
    return null;
  }

  private fireCaptions() {
    const caps = this.clip.captions;
    for (let k = 0; k < caps.length; k++) {
      if (this.capsDone.has(k)) continue;
      const c = caps[k];
      let ok = false;
      if (typeof c.at === 'number') ok = this.t >= c.at;
      else if (c.at.startsWith('press:')) ok = this.pressAt.has(c.at.slice(6) as Action);
      else {
        const m = /^(.*?)(?:\+([\d.]+))?$/.exec(c.at)!;
        const t0 = this.seen.get(m[1]);
        ok = t0 !== undefined && this.t >= t0 + Number(m[2] ?? 0);
      }
      if (ok) { this.capsDone.add(k); this.say(c); }
    }
  }

  /** one Stage update (real dt); the world's own clock decides how far the script moves */
  tick(dtReal: number): void {
    if (this.handback >= 0) { this.tickHandback(dtReal); return; }
    if (this.done) return;
    const p = this.p;
    const w = p.world;
    const frozen = this.host.frozen();
    const dtSim = frozen ? dtReal : Math.max(0, w.time - this.lastWorldT);
    this.lastWorldT = w.time;
    this.t += dtSim;
    this.stepT += dtSim;
    const b = this.puppet.b;
    // a press lasts until the hand has had an update to see it (the world moved on: a hit-stop or the
    // FreezeGuide hold it), a tap's key stays down 4 ticks
    if (w.time > this.pressWorldT) b.pressed.clear();
    for (const [a, n] of [...this.holdTicks]) {
      if (n < 0) continue;
      if (n <= 1) this.up(a); else this.holdTicks.set(a, n - 1);
    }
    for (const [a, s] of [...this.holdUntil]) {
      const t0 = this.pressAt.get(a) ?? this.t;
      if (this.t - t0 >= s) { this.up(a); if (a === 'rewind') { this.ungate?.(); this.ungate = null; } }
    }
    // skip: hold confirm 0.6 s (the real device; never in drive mode)
    if (this.mode === 'puppet') {
      if (this.real.down('confirm')) { this.skipT += dtReal; if (this.skipT >= SKIP_HOLD) { this.finish(true); return; } }
      else this.skipT = Math.max(0, this.skipT - dtReal * 2);
    }
    if (this.t >= this.clip.maxDur) { Tut.log('demo-desync', { clip: this.clip.id, step: this.i, why: 'maxDur' }); this.finish(false); return; }
    this.fireCaptions();
    // the bubble preview
    if (this.mode === 'puppet' && (!this.bubble || this.bubble.up >= 0 && this.t - this.bubble.up > 0.3)) {
      const u = this.upcoming();
      if (u && u.inS <= BUBBLE_LEAD + 0.05) { if (!this.bubble || this.bubble.a !== u.a || this.bubble.up >= 0) this.bubble = { a: u.a, down: -1, holdS: 0, shown: this.t, up: -1 }; }
      else if (this.bubble && this.bubble.up >= 0 && this.t - this.bubble.up > 0.3) this.bubble = null;
    }
    const s = this.clip.steps[this.i];
    if (!s) return;
    // aim: an explicit target, else along the walk
    const aimAt = (x: number, y: number) => { const dx = x - p.x, dy = y - (p.y - 6), l = Math.hypot(dx, dy) || 1; b.aimX = dx / l; b.aimY = dy / l; };
    if (this.aim) aimAt(this.aim.x, this.aim.y); else { b.aimX = 0; b.aimY = 0; }
    switch (s.k) {
      case 'walkTo': {
        const q = this.host.ctx.at(s.x, s.y);
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
        if (d <= 3) { b.move = { x: 0, y: 0 }; this.next(); return; }
        const sp = Math.min(1, s.speed ?? 1) * Math.min(1, d / 10 + 0.35);
        b.move = { x: (dx / d) * sp, y: (dy / d) * sp };
        if (!this.aim) { b.aimX = 0; b.aimY = 0; }
        if (this.stepT > Math.max(1.5, (d / Math.max(20, p.mods.moveSpeed)) * 3 + 2)) { Tut.log('demo-desync', { clip: this.clip.id, step: this.i, why: 'walk' }); b.move = { x: 0, y: 0 }; this.next(); }
        return;
      }
      case 'wait': if (this.stepT >= s.s) this.next(); return;
      case 'walkToEcho': {
        let e = null as null | { x: number; y: number; armed: boolean; phase: string; dead: boolean };
        for (let k = p.echoes.length - 1; k >= 0 && !e; k--) if (!p.echoes[k].dead) e = p.echoes[k];
        if (!e || e.dead) { if (this.stepT > 0.5) this.next(); return; }
        if (e.phase === 'stand' && e.armed) {
          const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
          b.move = { x: dx / d, y: dy / d };
          if (!this.aim) { b.aimX = 0; b.aimY = 0; }
        } else b.move = { x: 0, y: 0 };
        if (this.stepT > (s.timeout ?? 6)) { Tut.log('demo-desync', { clip: this.clip.id, step: this.i, why: 'walkToEcho' }); b.move = { x: 0, y: 0 }; this.next(); }
        return;
      }
      case 'waitFor':
        if (this.seen.has(s.ev) && this.seen.get(s.ev)! >= this.actionT - 1e-6) { this.next(); return; }
        if (this.stepT >= s.timeout) {
          s.force?.(this.host.ctx);
          Tut.log('demo-desync', { clip: this.clip.id, step: this.i, ev: s.ev });
          if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) console.warn(`[demo] ${this.clip.id}: forced "${s.ev}" at step ${this.i}`);
          this.next();
        }
        return;
      case 'tap': if (!b.held.has(s.a)) this.next(); return;
      case 'dashTo': if (!b.held.has('dash')) { b.move = { x: 0, y: 0 }; this.next(); } return;
      case 'hold': if (!b.held.has(s.a)) this.next(); return;
      case 'combo': {
        // n attack presses, each once the swing before it may chain
        const n = this.stepState.n ?? 0;
        const steps = p.weapon.steps;
        const st = steps[Math.min(n, steps.length) - 1] ?? steps[0];
        const gap = n === 0 ? 0 : (st.windup + st.active + st.recover * 0.6) / Math.max(0.2, p.mods.atkSpeed);
        if (n < s.n && this.stepT >= (this.stepState.at ?? 0) + gap) {
          this.down('attack', 3);
          this.stepState.n = n + 1;
          this.stepState.at = this.stepT;
        } else if (n >= s.n && this.stepT >= (this.stepState.at ?? 0) + 0.3) this.next();
        return;
      }
    }
  }

  /** after the script: 0.2 s of neutral input on the real device before it gets the hand back */
  private tickHandback(dt: number) {
    const r = this.real;
    const any = r.down('attack') || r.down('dash') || r.down('rewind') || r.down('fork') || r.down('special') || r.down('confirm');
    const mv = r.move();
    if (any || mv.x || mv.y) this.handback = Math.max(0, this.handback - dt * 0.5);
    this.handback += dt;
    if (this.handback >= NEUTRAL_T || this.handbackT > 1.0) this.release();
    this.handbackT += dt;
  }
  private handbackT = 0;

  finish(skipped: boolean): void {
    if (this.done) return;
    this.done = true;
    this.skipped = skipped;
    const b = this.puppet.b;
    b.held.clear(); b.pressed.clear(); b.move = { x: 0, y: 0 }; b.aimX = 0; b.aimY = 0;
    this.ungate?.(); this.ungate = null;
    this.bubble = null;
    if (this.mode === 'puppet') Stage.clear('demo.cap');
    this.handback = 0;
    this.handbackT = 0;
    this.tickHandback(0);
  }
  private release() {
    if (this.handback < 0) return;
    this.handback = -1;
    const p = this.p;
    if (p.input === this.puppet || (p.input instanceof PuppetInput && !p.input.bot)) p.input = this.real;
    p.renderTint = null;
    // every press made during the demo is spent
    for (const a of ['attack', 'dash', 'rewind', 'fork', 'special', 'confirm', 'info', 'interact'] as Action[]) this.real.consume(a);
    this.puppet.dispose();
    active = active.filter((d) => d !== this);
    if (this.mode === 'puppet') {
      p.world?.bus.emit('custom', { id: 'demoEnd', player: p, data: { clip: this.clip.id, skipped: this.skipped } });
      Tut.log('demoEnd', { clip: this.clip.id, skipped: this.skipped, t: +this.t.toFixed(2) });
    }
    this.host.ended(this.skipped);
  }
  /** drop at once (the lesson ended under it) */
  abort(): void { if (!this.done) this.finish(true); this.release(); }

  // ───────────────────────── drawing (UI layer) ─────────────────────────
  /** the bubble's box in UI px (a Stage obstacle while it shows) */
  bubbleBox(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (!this.bubble || this.mode !== 'puppet') return null;
    const p = this.p, r = G.r;
    const cx = p.x - r.camX, cy = p.y - 34 - r.camY;
    return { x0: cx - 20, y0: cy - 18, x1: cx + 20, y1: cy + 22 };
  }
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.mode !== 'puppet') return;
    const r = G.r;
    // the demo frame: four K9 corner marks, no black bars (the HUD must stay in view)
    const L = 10, E = 4;
    for (const [x, y, sx, sy] of [[E, E, 1, 1], [640 - E, E, -1, 1], [E, 360 - E, 1, -1], [640 - E, 360 - E, -1, -1]] as const) {
      rect(ctx, sx > 0 ? x : x - L, sy > 0 ? y : y - 1, L, 1, 'K9');
      rect(ctx, sx > 0 ? x : x - 1, sy > 0 ? y : y - L, 1, L, 'K9');
    }
    // the badge above the top rail: ▶ DEMO 0:04 (seconds left)
    const left = Math.max(0, Math.ceil((this.clip.dur ?? this.clip.maxDur - 1) - this.t));
    const label = tr(S('onboard', 'demoBadge')).replace('{s}', `0:${String(left).padStart(2, '0')}`);
    const tw = Text.measure(label, 'small').w;
    const bw = Math.ceil(tw) + 20, bh = Math.ceil(Text.lineH('small')) + 2;
    const bx = Math.round(320 - bw / 2), by = 36 - bh;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * 0.85; rect(ctx, bx, by, bw, bh, 'K0'); ctx.globalAlpha = a0;
    // ▶ (drawn)
    for (let j = 0; j < 4; j++) rect(ctx, bx + 6 + j, by + bh / 2 - 3 + j, 1, 7 - j * 2, 'R3');
    Text.draw(ctx, label, bx + 14, by + bh / 2, { size: 'small', color: 'K9', valign: 'middle', shadow: false });
    // skip: hold confirm (bottom right, out of the action; a line fills as it is held)
    if (this.t > 1 || this.skipT > 0) {
      const sk = S('onboard', 'demoSkip');
      const m = Rich.measure(sk, 'small', this.real);
      const sx = Math.round(626 - m.w), sy = Math.round(346 - m.h);
      ctx.globalAlpha = a0 * (this.skipT > 0 ? 1 : 0.7);
      Rich.draw(ctx, sk, sx, sy, { size: 'small', color: 'K8', who: this.real });
      if (this.skipT > 0) {
        const k = Math.min(1, this.skipT / SKIP_HOLD);
        rect(ctx, sx, sy + m.h + 1, Math.round(m.w * k), 1, 'C3');
      }
      ctx.globalAlpha = a0;
    }
    // the button bubble over the puppet (2×, the real device's glyph)
    const bub = this.bubble;
    if (bub) {
      const p = this.p;
      const cx = Math.round(p.x - r.camX), cy0 = Math.round(p.y - 38 - r.camY);
      const fadeIn = Math.min(1, (this.t - bub.shown) / 0.15);
      const fadeOut = bub.up >= 0 ? Math.max(0, 1 - (this.t - bub.up - 0.15) / 0.3) : 1;
      const a = fadeIn * fadeOut;
      if (a > 0) {
        ctx.globalAlpha = a0 * a;
        const down = bub.down >= 0 && bub.up < 0;
        const bob = bub.down < 0 ? Math.round(Math.sin(G.time * Math.PI * 4)) : 0;
        const holding = down && bub.holdS > 0;
        const fill = holding ? Math.min(1, (this.t - bub.down) / bub.holdS) : 0;
        const sz = bigPrompt(ctx, bub.a as TokenAction, cx, cy0 + bob, this.real, down ? (holding ? 'hold' : 'down') : 'up', fill);
        // rings on press and on release
        const ring = (t0: number) => {
          const k = (this.t - t0) / 0.25;
          if (k < 0 || k > 1) return;
          const R = 10 + 10 * k;
          ctx.globalAlpha = a0 * a * (1 - k);
          ctx.fillStyle = col('C3');
          for (let i = 0; i < 24; i++) { const an = (i / 24) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(an) * R), Math.round(cy0 + Math.sin(an) * R * 0.8), 1, 1); }
          ctx.globalAlpha = a0 * a;
        };
        if (bub.down >= 0) ring(bub.down);
        if (bub.up >= 0) ring(bub.up);
        // "Tap" / "Hold" / "Hold 0.8s" under it
        const word = holding ? tr(S('onboard', 'holdFor')).replace('{s}', (this.t - bub.down).toFixed(1)) : tr(S('onboard', bub.holdS > 0 || (bub.down < 0 && this.upcoming()?.hold) ? 'hold' : 'tap'));
        Text.draw(ctx, word, cx, cy0 + sz.h / 2 + 3, { size: 'small', color: 'K9', align: 'center', outline: 'K0' });
        ctx.globalAlpha = a0;
      }
    }
  }
}

/** the running demos (a Stage obstacle source, the frame widget) */
export const Demos = {
  list(): readonly DemoDirector[] { return active; },
  get on(): boolean { return active.some((d) => d.mode === 'puppet' && !d.done); },
  clear(): void { for (const d of active.slice()) d.abort(); active = []; },
};

// the frame, badge and bubble ride the HUD (on top of the caption rail, under the film wipe)
Hud.register({
  id: 'demoFrame', area: 'top', order: 95,
  draw(ctx) {
    let any = false;
    for (const d of active) if (!d.done && d.mode === 'puppet') { d.draw(ctx); any = true; }
    // the world desaturates a little while a demo plays (post grading is applied after the HUD)
    if (any) G.r.params.saturation *= 0.85;
  },
});
Stage.addObstacles((hard) => { for (const d of active) { const b = d.bubbleBox(); if (b) hard.push({ x0: b.x0 - 4, y0: b.y0 - 4, x1: b.x1 + 4, y1: b.y1 + 4 }); } });
