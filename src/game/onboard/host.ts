// Stage hosts (ONBOARD2 §3.7): how a lesson winds its stage back to the start of a step. Never with
// the game's rewind ripple — a reset is not a rewind (players would think rewind rewinds the world).
// Both show the same film wipe: a dark band with sprocket holes sweeping up the screen with
// "⏪ Back to the start", the reset at 0.2 s, the band leaving by 0.4 s (sfx filmWipe).
//
//   RebuildHost (prologue)        refills hp / Sand, clears the tape and goes to a brand-new
//                                 GameScene of kind 'prologue' — a fresh World, so timers, bus
//                                 listeners, bubbles, echoes and marks are all gone; the lesson lays
//                                 its stage out again from build()
//   SoftHost (after-fight, Hall)  cannot rebuild a real room: cancels the lesson's timers, removes its
//                                 props and this hand's echoes and bubbles (no effects, no paradox),
//                                 restores hp / Sand to the step's snapshot, re-prefills the tape at
//                                 the hand's feet, re-places the props from where the hand stands now
//
// The wipe is drawn by the HUD widget 'onboardWipe' (on top of the caption rail), so it covers the
// old stage, the scene swap and the new stage alike.
import type { World } from '../world/world';
import type { Player } from '../entities/player';
import type { Entity } from '../entities/entity';
import type { GameScene } from '../scenes/game';
import { G, sfx } from '../G';
import { col } from '../../art/palette';
import { rect } from '../ui/draw';
import { Text } from '../ui/text';
import { Hud } from '../ui/hud';
import { S } from '../strings';
import { isLessonProp } from './props';
import '../strings/onboard';

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

/**
 * What a host asks the lesson to do when a stage stands again: lay out the props and put the hand at
 * its start (lesson.ts installs it on the host).
 */
export interface StageLayout { layout(w: World, p: Player): void }

// ───────────────────────── the film wipe ─────────────────────────
interface WipeState { t: number; mid: (() => void) | null; done: (() => void) | null }
let wipeNow: WipeState | null = null;
/** run a film wipe: `mid` at 0.2 s (under full cover), `done` at 0.4 s */
export function filmWipe(mid: () => void, done: () => void): void {
  if (wipeNow) { const prev = wipeNow; prev.mid?.(); prev.done?.(); }
  wipeNow = { t: 0, mid, done };
  sfx('filmWipe');
}
export const Wipe = {
  get active(): boolean { return !!wipeNow; },
  /** 0..1 */
  get k(): number | null { return wipeNow ? Math.min(1, wipeNow.t / WIPE_T) : null; },
};
function tickWipe(dt: number) {
  const s = wipeNow;
  if (!s) return;
  s.t += dt;
  if (s.t >= WIPE_RESET_AT && s.mid) { const m = s.mid; s.mid = null; m(); }
  if (s.t >= WIPE_T) { wipeNow = null; s.done?.(); }
}
/** the band: K0 with K3 sprocket holes; below it (pass 1) / above it (pass 2) the screen is dark */
function drawWipe(ctx: CanvasRenderingContext2D) {
  const s = wipeNow;
  if (!s) return;
  const k = Math.min(1, s.t / WIPE_T);
  const BAND = 44;
  // pass 1 (0 → 0.5): the band rises from the bottom, darkness follows it; pass 2: it rises again, revealing
  const first = k < 0.5;
  const kk = first ? k / 0.5 : (k - 0.5) / 0.5;
  const y = Math.round(360 - (360 + BAND) * kk);
  const a0 = ctx.globalAlpha;
  ctx.globalAlpha = a0 * 0.92;
  ctx.fillStyle = col('K0');
  if (first) ctx.fillRect(0, y + BAND, 640, 360 - y - BAND + 1);
  else ctx.fillRect(0, 0, 640, Math.max(0, y));
  ctx.globalAlpha = a0;
  rect(ctx, 0, y, 640, BAND, 'K0');
  rect(ctx, 0, y, 640, 1, 'K4');
  rect(ctx, 0, y + BAND - 1, 640, 1, 'K4');
  const off = Math.floor(G.time * 160) % 20;
  for (let x = -20 + off; x < 640; x += 20) { rect(ctx, x, y + 4, 9, 6, 'K3'); rect(ctx, x, y + BAND - 10, 9, 6, 'K3'); }
  // "⏪ Back to the start" on the band (the rewind mark is drawn: the fonts have no ⏪)
  const label = S('onboard', 'wipe');
  const tw = Text.measure(label, 'small').w;
  const cx = 320, cy = y + BAND / 2;
  const x0 = Math.round(cx - (tw + 14) / 2);
  for (let i = 0; i < 2; i++) {
    const bx = x0 + i * 5;
    for (let j = 0; j < 4; j++) { rect(ctx, bx + 3 - j, cy - j, 1, j * 2 + 1, 'K9'); }
  }
  Text.draw(ctx, label, x0 + 14, cy, { size: 'small', color: 'K9', valign: 'middle', shadow: false });
}
Hud.register({
  id: 'onboardWipe', area: 'top', order: 97,
  update(dt) { tickWipe(dt); },
  draw(ctx) { drawWipe(ctx); },
});

// ───────────────────────── RebuildHost (prologue) ─────────────────────────
/**
 * The prologue's host: every reset is a fresh GameScene from `make()` (kind 'prologue'); the
 * scene's build() calls `built(scene)` and the lesson lays the stage out.
 */
export class RebuildHost implements StageHost {
  readonly kind = 'rebuild' as const;
  readonly owner = {};
  layout: StageLayout | null = null;
  private scene: GameScene;
  private props: Entity[] = [];
  private pendingThen: (() => void) | null = null;
  private wiping = false;
  constructor(scene: GameScene, private make: () => GameScene, private prepare: (p: Player) => void) { this.scene = scene; }
  world(): World { return this.scene.world; }
  get p(): Player { return this.scene.world.players[0]; }
  track<T extends Entity>(e: T): T { this.props.push(e); return e; }
  /** the scene standing now (the prologue director swaps it in on reset) */
  get current(): GameScene { return this.scene; }
  /** a new prologue scene's build(): lay the stage out (props, hand position) */
  built(scene: GameScene): void {
    this.scene = scene;
    this.props = [];
    const p = scene.world.players[0];
    if (p && this.layout) this.layout.layout(scene.world, p);
  }
  reset(then: () => void): void {
    if (this.wiping) { this.pendingThen = then; return; }
    this.wiping = true;
    this.pendingThen = then;
    filmWipe(() => {
      const p = this.p;
      if (p) this.prepare(p);
      const s = this.make();
      // the swap happens under full cover: no transition of its own
      G.scenes.set(s);
    }, () => {
      this.wiping = false;
      const t = this.pendingThen;
      this.pendingThen = null;
      t?.();
    });
  }
  /** re-lay the stage in place without a wipe (the first stage of a lesson) */
  relayout(): void { const p = this.p; if (p && this.layout) this.layout.layout(this.world(), p); }
  dispose(): void {
    for (const e of this.props) if (!e.dead) e.dead = true;
    this.props = [];
    this.world()?.cancelTimers(this.owner);
    this.world()?.bus.off(this.owner);
  }
  wipe(): number | null { return this.wiping ? Wipe.k : null; }
}

// ───────────────────────── SoftHost (in-run, Hall) ─────────────────────────
export interface SoftSnap { hp: number; sand: number }
export class SoftHost implements StageHost {
  readonly kind = 'soft' as const;
  readonly owner = {};
  layout: StageLayout | null = null;
  private props: Entity[] = [];
  private wiping = false;
  /** hp / Sand at the step's start (reset restores them) */
  snap: SoftSnap;
  /** Sand when the lesson began (a 'refill' lesson gives back what it spent) */
  readonly startSand: number;
  constructor(private w: World, readonly p: Player) { this.snap = { hp: p.hp, sand: p.lo.sand }; this.startSand = p.lo.sand; }
  world(): World { return this.w; }
  track<T extends Entity>(e: T): T { this.props.push(e); return e; }
  /** remember hp / Sand now (a step's start) */
  snapshot(): void { this.snap = { hp: this.p.hp, sand: this.p.lo.sand }; }
  private clear(): void {
    const w = this.w, p = this.p;
    w.cancelTimers(this.owner);
    for (const e of this.props) if (!e.dead) e.dead = true;
    this.props = [];
    // stray lesson props spawned by props themselves (debris, drops) go too
    for (const e of w.entities) if (isLessonProp(e) && !e.dead) e.dead = true;
    for (const e of p.echoes) if (!e.dead) e.kill();
    p.echoes = [];
    // bullets of the lesson (the alarm turret) and pending hitboxes
    for (const e of w.entities) if ((e as { team?: string }).team === 'enemy' && (e as { dmg?: number }).dmg !== undefined && !e.dead) e.dead = true;
  }
  reset(then: () => void): void {
    if (this.wiping) return;
    this.wiping = true;
    filmWipe(() => {
      const p = this.p, w = this.w;
      this.clear();
      // hp / Sand back to the step's start, the tape refilled where the hand stands (the Shadow at its feet)
      if (p.state === 'alive') p.hp = Math.max(p.hp, this.snap.hp);
      p.lo.sand = Math.max(0, Math.min(p.lo.sandMax, this.snap.sand));
      p.rec.clear();
      p.rec.prefill(p.x, p.y, p.rec.capacity, { hp: Math.max(1, p.hp), fixed: p.fixedTaken, tempo: p.lo.tempo });
      if (this.layout) this.layout.layout(w, p);
    }, () => { this.wiping = false; then(); });
  }
  dispose(): void { this.clear(); this.w.bus.off(this.owner); }
  wipe(): number | null { return this.wiping ? Wipe.k : null; }
}
