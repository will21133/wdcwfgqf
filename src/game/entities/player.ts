// 滴答 Tick — the living second hand.
import { Actor } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { drawSprite, Sprite, spriteFromDef } from '../../engine/gfx/sprite';
import { buildTick, TickFrames, Dir, KEY_FRAMES, KEY_PAL } from '../../art/sprites/tick';
import { G, sfx } from '../G';
import { Recorder, type Recording, type Frame } from '../systems/rewind';
import { RewindStyles, type RewindStyle } from '../systems/rewindStyles';
import { renderShadow, renderRewindMarks } from '../ui/rewindHud';
import { GameHooks } from '../hooks';
import { Weapon, Wielder, Pose } from '../weapons/weapon';
import { Rapier } from '../weapons/rapier';
import { makeWeapon } from '../weapons';
import { Scarf } from './scarf';
import { Afterimage } from './fxents';
import { Echo, TEAM_ECHO_CAP, type EchoOpts } from './echo';
import { Paradox } from '../systems/paradox';
import { BUBBLE_R } from '../systems/timeBubble';
import { outlineOf } from '../../engine/gfx/outline';
import { angleTo, clamp, angleDiff, ease, TAU } from '../../engine/math';
import { frand } from '../../engine/rng';
import type { DamageInfo } from '../systems/combat';
import { VIEW_W, VIEW_H } from '../../engine/gfx/post';
import { col } from '../../art/palette';
import { settings } from '../settings';
import type { PlayerInput } from '../../engine/input';
import { ensurePlayers, slotColor, SLOT_SCARF, SLOT_RAMP, drawSlotBadge } from '../players';
import { handDef, type HandDef } from '../progression/hands';
import type { ColorKey } from '../ui/text';
import type { Loadout } from '../run';
import type { ReviveSource } from '../systems/bus';
import * as Down from '../systems/downed';
import { tr } from '../i18n';
import { S } from '../strings';
import '../strings/f2';
import '../strings/f3';
import { Gates } from '../onboard/gates';

export type PlayerState = 'alive' | 'stopped' | 'ghost';
/** Player.renderTint: the demo puppet's chalk look (ONBOARD2 §3.3–3.4) */
export interface PlayerTint { alpha: number; desat: number; outline: ColorKey; dashed: boolean }

let FRAMES: TickFrames | null = null;
let KEYS: Sprite[] = [];
/** slot I's frames (1.0 look; echoes and story scenes use these) */
export function tickFrames() {
  if (!FRAMES) {
    FRAMES = buildTick();
    KEYS = KEY_FRAMES.map((rows) => spriteFromDef({ rows, pal: KEY_PAL, ox: 3, oy: 2 }));
  }
  return FRAMES;
}
/** a slot's frames: the scarf takes the slot colour (GDD2 §5.2); cached per palette in tick.ts */
export function tickFramesFor(slot: number, hand?: HandDef): TickFrames {
  tickFrames();
  if (!slot && !hand?.palette && !hand?.variant) return FRAMES!;
  return buildTick({ ...(hand?.palette ?? {}), ...SLOT_SCARF[((slot % 4) + 4) % 4] }, hand?.variant);
}
export function keySprites() { tickFrames(); return KEYS; }

export const enum Anim { Idle, Run, Dash, Hurt, Attack }

/** right half of the 8×3.5 px ground ring (mirrored when drawn) */
const RING: [number, number][] = [[0, -4], [1, -4], [2, -4], [3, -4], [4, -3], [5, -3], [6, -2], [7, -1], [7, 0], [7, 1], [6, 2], [5, 3], [4, 3], [3, 4], [2, 4], [1, 4], [0, 4]];

export interface PlayerPoseSnapshot { dir: Dir; flip: boolean; anim: Anim; animT: number; pose: Pose }

// ───────────────────────── Rewind 2.0 (GDD2 §3.2 / §3.12) ─────────────────────────
/** shortest tape a rewind needs (frames) and the least it rewinds */
export const MIN_TAPE = 15;
export const MIN_BACK = 6;
/** scrub cursor: 3 s of tape per 0.9 s held */
export const SCRUB_RATE = 3 / 0.9;
/**
 * A short press is a tap (back to the Shadow) until the scrub cursor would pass this far back
 * (s of tape; ≈ 0.25 s held): a slow "tap" of 0.18–0.25 s used to become a 0.1–0.35 s scrub that
 * paid 25 Sand and gave nothing back (first-play clarity report S1.4). Set to MIN_BACK / 60 for
 * GDD2's strict 0.18 s threshold.
 */
export const TAP_GRACE_BACK = 0.35;
/** travel back along the path (real s) */
export const TRAVEL_TIME = 0.25;
/** a rewind out of a stop burns the tape (GDD2 §3.10) */
export const TAPE_BURN = 6;
/** Pull Back (GDD2 §5.5): range, hold time, cost, least HP the pulled hand gets */
export const PULL_RANGE = 48, PULL_TIME = 0.4, PULL_COST = 100, PULL_MIN_HP = 0.3;
/** Sand for clearing a room (GDD2 §3.3; kills: combat.ts) */
export const SAND_CLEAR = 30;
/** what counts as an attack for Perfect Rewind (not standing in a hazard, burning or bumping a body) */
const PERFECT_KINDS = new Set(['melee', 'proj', 'aoe']);
/** how long the PERFECT stamp stays up (real s) */
export const PERFECT_STAMP = 1.1;
/** Fork (GDD2 §3.4): the least tape it needs (s); Recall: hold Fork this long (mods.recall) */
export const FORK_MIN_TAPE = 0.3, RECALL_HOLD = 0.4;
/** Tick-Dodge (GDD2 §4.1): least time between two, the slow it gives, the Counter window (s) */
export const TICK_SPACING = 0.5, TICK_SLOW_SCALE = 0.3, COUNTER_T = 1.2;
/** what a dash can Tick-Dodge: an attack's hitbox or bullet (contact only from an enemy mid-attack) */
const TICK_KINDS = new Set(['melee', 'proj', 'aoe']);

export type RewindRefusal = 'sand' | 'tape' | 'anchor' | 'burnt' | 'state';
export type ForkRefusal = 'sand' | 'tape' | 'anchor' | 'cooldown' | 'state' | 'noArmed';
export interface RewindCheck { ok: boolean; reason?: RewindRefusal }
export interface RewindPreview {
  /** target frame index on the tape (0 = oldest) */
  frame: number;
  x: number; y: number;
  /** HP a rewind gives back right now / fixed damage it cannot */
  hpGain: number; locked: number;
  /** Sand it costs / seconds of tape it rewinds */
  cost: number; seconds: number;
  /** a rewind is possible at all (else the Shadow is drawn grey and dotted) */
  ok: boolean;
}
/** a rewind under way: held (tap or scrub) or travelling back */
export interface RewindState {
  phase: 'hold' | 'travel';
  /** real seconds since the press */
  t: number;
  /** held past the tap threshold */
  scrub: boolean;
  /** scrub cursor: target frame index */
  cursor: number;
  clickT: number;
  /** a rewind out of a stop (Last Second / self-rescue): cannot be cancelled, stands the hand up */
  rescue: boolean;
  /** costs nothing (Old Watch auto-rewind) */
  free: boolean;
  /** Old Watch's automatic rewind: no stop happened, so no tape burn and no 'revived' */
  auto: boolean;
  style: RewindStyle;
  cut: Recording | null;
  frameIdx: number;
  tt: number; dur: number;
  fromX: number; fromY: number;
  cost: number; seconds: number;
  /** real s until the muffle is asserted again (a pause menu closing lifts it) */
  mufT: number;
}

/** an incoming blow a dash can Tick-Dodge: an attack's hitbox or bullet, or the body of an enemy mid-attack */
function isAttack(info: DamageInfo): boolean {
  if (info.hazard || info.fixed && info.kind === 'status') return false;
  const by = info.owner as { team?: string; attacking?: boolean } | null | undefined;
  if (by && by.team !== 'enemy') return false;
  if (TICK_KINDS.has(info.kind)) return true;
  return info.kind === 'contact' && !!by?.attacking;
}

/**
 * The rewind muffle (GDD2 §3.2) is shared by every hand: it lifts only when the last hand holding
 * or travelling lands. A hand whose room closed mid-rewind is cleaned up when the next room's
 * hands are added (review F3 #7).
 */
const muffled = new Set<Player>();
function muffle(p: Player) { muffled.add(p); G.audio.muffle(true, 900); }
function unmuffle(p: Player) { if (muffled.delete(p) && muffled.size === 0) G.audio.muffle(false); }
function releaseStale(now: Player) {
  if (!muffled.size) return;
  for (const q of [...muffled]) {
    if (q.world === now.world && !q.dead) continue;
    const R = q.rw;
    // paid, cut and travelling, but never landed: the Sand comes back (the cut tape stays cut)
    if (R && R.phase === 'travel' && R.cost > 0 && q.world?.run) { const lo = q.lo; lo.sand = Math.min(lo.sandMax, lo.sand + R.cost); }
    q.rw = null;
    muffled.delete(q);
  }
  if (!muffled.size) G.audio.muffle(false);
}

// a run that ends, or a scene that leaves the rooms, never keeps a rewind's muffle
const clearMuffles = () => { if (muffled.size) { muffled.clear(); G.audio.muffle(false); } };
GameHooks.onRunEnd(clearMuffles);
GameHooks.onHub(clearMuffles);
GameHooks.onTitle(clearMuffles);

// the pool refills at room clears (GDD2 §3.3); kills give +2 in combat.ts
GameHooks.onRoomClear(({ w }) => { for (const p of w.players) if (p.state !== 'ghost') p.lo.addSand(SAND_CLEAR); });

export class Player extends Actor implements Wielder {
  /** player slot 0..3 (I..IV) */
  slot: number;
  /** this player's own device (PLAN2 §1.3); never read G.input for gameplay */
  input: PlayerInput;
  /** slot colour (scarf, badge, ring) */
  color: ColorKey;
  hand: HandDef;
  private frames: TickFrames;
  isEcho = false;
  dmgScale = 1;
  ignoreFreeze = false;
  dir: Dir = 'down';
  flip = false;
  anim: Anim = Anim.Idle;
  animT = 0;
  aim = Math.PI / 2;
  moveX = 0; moveY = 0;
  weapon: Weapon = new Rapier();
  /** this hand's tape (Loadout.tape: kept across rooms; PLAN2 §1.8) */
  get rec(): Recorder {
    const lo = this.lo;
    return (lo.tape ??= new Recorder(Math.round(lo.mods.tapeLen * 60)));
  }
  /** 1.0 name of the tape */
  get recorder(): Recorder { return this.rec; }
  echoes: Echo[] = [];
  /** the echo this hand's last rewind left (Perfect Rewind gilds it) */
  lastEcho: Echo | null = null;
  scarfA = new Scarf(7, 2.2);
  scarfB = new Scarf(5, 2.2);
  keyAngle = 0;
  blinkT = 2;
  // dash
  dashT = 0;
  dashDur = 0.15;
  dashVX = 0; dashVY = 0;
  dashCharges = 2;
  dashRecharge = 0;
  airborne = false;
  // lunge (attack step forward)
  lungeT = 0; lungeVX = 0; lungeVY = 0;
  /** the rewind under way (GDD2 §3.2): held, scrubbing or travelling back; null otherwise */
  rw: RewindState | null = null;
  /** true from the press to the landing (the hand is intangible) */
  get rewinding(): boolean { return this.rw !== null; }
  /** 0..1 strength of this hand's rewind ripple (scenes feed it to post.ts) */
  rewindFx = 0;
  /** 0..0.3: the world outside the ripple loses colour while this hand scrubs */
  scrubDesat = 0;
  /** seconds since the last landing (the ripple widens and fades); -1 = none */
  private rippleT = -1;
  fixedTaken = 0;
  /** damage that landed since the last taped frame (written into the next one) */
  private pendHit = 0;
  private pendFixed = 0;
  private pendCulprits: number[] | null = null;
  /** > 0 while the hand stands in a time anchor (P2 hazards set it every tick): no rewinds */
  anchorT = 0;
  /** Perfect Rewind window (game s) after the press, and what it refunds */
  private perfect: { t: number; hit: boolean; refunded: boolean; cost: number } | null = null;
  /** landing: invulnerability ring (s left, of landDur) and the '+N' it gave back */
  landT = 0;
  landDur = 0.5;
  landGain = 0;
  /** the cyan-and-gold PERFECT stamp over the hand (s left), and the Sand it refunded (flies to the HUD) */
  perfectStampT = 0;
  perfectRefund = 0;
  /** Pull Back hold on a stopped teammate (GDD2 §5.5) */
  pull: { target: Player; t: number } | null = null;
  /** this room's free scrub (mods.scrubFreeFirst) has been used */
  private scrubFreeUsed = false;
  /** scrubs this hand started (the "release = land here · dash cancels" line shows for the first few) */
  scrubsSeen = 0;
  // ── F3b: Fork, Recall, Tick-Dodge, Counter (GDD2 §3.4, §4.1) ──
  /** Fork cooldown left (s) */
  forkCdT = 0;
  /** Fork held (s; with mods.recall it becomes a Recall at 0.4 s); -1 = not held */
  forkHold = -1;
  private forkUsed = false;
  /** seconds since the current/last dash started, and since the last dash ended */
  dashAge = 99;
  sinceDash = 99;
  /** Tick-Dodge spacing left; the white clock ring after one (s) */
  private tickCdT = 0;
  tickRingT = 0;
  /** > 0: the next hit of this hand is a Counter (crit ×2; combat.ts) */
  counterT = 0;
  /**
   * The demo puppet's chalk look (ONBOARD2 §3.4): while a lesson drives this hand it is drawn at
   * `alpha`, washed grey by `desat` (0..1), with a 1 px `outline` rim (dashed: the chalk line).
   * null = normal (everything outside a demo).
   */
  renderTint: PlayerTint | null = null;
  private refuseT = 0;
  /** rewindPreview() cache: the tick and every input it depends on (no per-frame key string) */
  private previewCache: { tick: number; recTick: number; len: number; cursor: number; sand: number; hp: number; fixed: number; hold: boolean; v: RewindPreview } | null = null;
  /** the echo this hand's last rewind left (a Perfect Rewind gilds this one, never a later Fork echo) */
  private perfectEcho: Echo | null = null;
  lastSafeX = 0; lastSafeY = 0;
  /** control lock (cutscenes, room transitions) */
  locked = false;
  hurtT = 0;
  deadT = 0;
  stepT = 0;
  lastEchoTouch = 0;
  /** scripted walk-in through the entry door */
  autoWalk = 0;
  private beatT = 0;
  /** GDD2 §5.5: standing, stopped (downed) or a ghost hand */
  state: PlayerState = 'alive';
  /** downed bookkeeping (systems/downed.ts) */
  down: Down.DownState = Down.newDownState();
  /** ghost hand: tap-attack cooldown */
  ghostCd = 0;

  constructor(x: number, y: number, input?: PlayerInput) {
    super();
    this.input = input ?? ensurePlayers()[0];
    this.slot = this.input.slot;
    this.color = slotColor(this.slot);
    this.hand = handDef('tick');
    this.frames = tickFramesFor(this.slot, this.hand);
    this.scarfA.ramp = this.scarfB.ramp = SLOT_RAMP[this.slot % 4];
    this.x = x; this.y = y;
    this.team = 'player';
    this.r = 4;
    this.solid = true;
    this.mass = 1;
    this.kind = 'player';
    this.height = 20;
    tickFrames();
    this.scarfA.reset(x, y - 10);
    this.scarfB.reset(x, y - 10);
    this.lastSafeX = x; this.lastSafeY = y;
  }

  get run() { return this.world.run!; }
  /** leaving the world mid-rewind (room change, a hand that left) must not leave the mix muffled */
  removed() { if (this.rw) { this.rw = null; unmuffle(this); } }
  /** this hand's loadout (PLAN2 §1.5) */
  get lo(): Loadout { return this.world.run!.lo(this.slot); }
  get mods() { return this.lo.mods; }

  added() {
    // a hand left behind in the last room mid-rewind (the scene closed before it landed): give its
    // mix back and refund a rewind it had paid for but never got (review F3 #7)
    releaseStale(this);
    const L = this.world.players;
    if (!L.includes(this)) { L.push(this); L.sort((a, b) => a.slot - b.slot); }
    const lo = this.lo;
    this.hand = lo.hand;
    this.weapon = makeWeapon(lo.weapon);
    this.maxHp = this.mods.maxHp;
    // HP carries over between rooms; a hand that ended the last room stopped or as a ghost is
    // wound up at 25% when the next room starts (GDD2 §5.5)
    if (lo.hp > 0) this.hp = lo.hp;
    else {
      this.hp = lo.hp = Math.max(1, Math.round(this.maxHp * Down.ROOM_REVIVE_HP));
      this.world.after(0.5, () => {
        if (this.dead || this.state !== 'alive') return;
        this.world.fx.ring(this.x, this.y - 8, 3, 26, 0.45, this.color, 2);
        this.world.fx.banner(this.x, this.y - 38, tr(S('f2', 'roomRevive')), this.color, 1.4);
      }, this);
      // told on the room's first tick, once every hand's hooks and the room-start hooks are listening
      this.world.after(0, () => this.world.bus.emit('revived', { player: this, by: null, source: 'room' }), this);
    }
    this.dashCharges = this.mods.dashCharges;
    // the pool is full at the start of every floor (GDD2 §3.3)
    if (lo.sandFloor !== this.run.floor) { lo.sand = lo.sandMax; lo.sandFloor = this.run.floor; }
    // the tape is kept across rooms, starting with three seconds standing at the entrance: a rewind
    // works from the first frame (back to the door; GDD2 §3.2). The walk-in itself is never taped.
    const rec = this.rec;
    rec.setWindow(this.mods.tapeLen);
    const ahead = this.autoWalk > 0 ? Math.round(this.mods.moveSpeed * this.autoWalk * 0.85) : 0;
    const spot = this.freeSpot(this.x, this.y - ahead);
    rec.prefill(spot.x, spot.y, rec.capacity, this.frameBase());
  }

  /** the nearest standable spot to (x, y) (searching outward a tile at a time), else (x, y) */
  freeSpot(x: number, y: number): { x: number; y: number } {
    const w = this.world;
    const ok = (px: number, py: number) => w.boxFree(px, py, this.r) && !w.map.pitAt(px, py);
    if (ok(x, y)) return { x, y };
    for (let d = 4; d <= 48; d += 4) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (ok(px, py)) return { x: px, y: py };
      }
    }
    return { x: this.x, y: this.y };
  }

  /** the fields a standing frame copies from this hand (prefill) */
  private frameBase(): Partial<Frame> {
    return { hp: Math.max(1, this.hp), fixed: this.fixedTaken, tempo: this.lo.tempo, dir: this.dir === 'down' ? 0 : this.dir === 'up' ? 1 : 2, flip: this.flip };
  }

  // ───────────────────────── update ─────────────────────────
  update(dt: number) {
    const inp = this.input;
    const m = this.mods;
    this.maxHp = m.maxHp;
    this.animT += dt;
    this.keyAngle += dt * (this.rewinding ? -40 : this.anim === Anim.Run ? 7 : 2.5);
    if (this.hurtT > 0) this.hurtT -= dt;
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = frand(2, 5);
    this.tickRewindFx(dt);

    if (this.rw) { this.updateRewind(dt); this.syncRun(); return; }
    if (this.state === 'stopped') { Down.updateStopped(this, dt); this.syncRun(); return; }
    if (this.state === 'ghost') { this.updateGhost(dt); return; }
    if (this.hp <= 0) { this.deadT += dt; return; }

    // dash charges
    if (this.dashCharges < m.dashCharges) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= m.dashCd) { this.dashRecharge = 0; this.dashCharges++; }
    }

    if (this.autoWalk > 0) this.autoWalk -= dt;
    this.collides = this.autoWalk <= 0;
    const mv = this.autoWalk > 0 ? { x: 0, y: -1 } : this.locked ? { x: 0, y: 0 } : inp.move();
    // low-HP clockwork heartbeat
    if (this.hp > 0 && this.hp < this.maxHp * 0.25) {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.beatT = 0.55 + (this.hp / this.maxHp) * 2; sfx('heartbeat', { vol: 0.5 }); }
    }
    this.moveX = mv.x; this.moveY = mv.y;
    this.updateAim(mv);

    // inputs
    const attackPressed = !this.locked && inp.pressed('attack');
    const specialPressed = !this.locked && inp.pressed('special');
    const dashPressed = !this.locked && inp.pressed('dash');
    const rewindPressed = !this.locked && inp.pressed('rewind');

    // Rewind (GDD2 §3.2) — or, next to a teammate who just stopped, Pull Back (GDD2 §5.5)
    this.updatePull(dt, rewindPressed);
    if (rewindPressed && !this.pull) this.tryRewind();
    if (this.rw) return;
    // Fork (GDD2 §3.4): an echo of the last 2 s without moving; with Recall, holding it calls them home
    this.updateFork(dt);

    if (dashPressed && this.dashT <= 0 && this.dashCharges > 0 && this.falling <= 0) this.startDash();

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.world.move(this, this.dashVX * dt, this.dashVY * dt);
      if (Math.floor(this.dashT * 60) % 2 === 0) this.afterimage('C3', 0.18, 0.45);
      if (this.dashT <= 0) {
        this.airborne = false;
        this.sinceDash = 0;
        const dl = Math.hypot(this.dashVX, this.dashVY) || 1;
        this.world.bus.emit('dashEnd', { owner: this, echo: false, player: this, dx: this.dashVX / dl, dy: this.dashVY / dl });
      }
    } else {
      // weapon (heavy / dash-attack hook points: GDD2 §4.1; P1 gives the weapons their moves)
      this.weapon.update(dt, {
        attackPressed, attackHeld: !this.locked && inp.down('attack'), specialPressed,
        specialHeld: !this.locked && inp.down('special'), specialReleased: inp.released('special'),
        sinceDash: this.sinceDash,
      }, this.aim, m.atkSpeed, m.specialCd, {
        onAttack: (combo, angle) => {
          this.weapon.perform(this, combo, angle);
          this.recorder.event({ type: 'attack', combo, angle });
        },
        onSpecial: (angle, charge) => {
          this.weapon.performSpecial(this, angle, charge);
          this.recorder.event({ type: 'special', angle, charge });
          this.invuln = Math.max(this.invuln, 0.18);
        },
        onHeavy: (angle, charge) => {
          this.weapon.performHeavy(this, angle, charge);
          this.recorder.event({ type: 'heavy', angle, charge });
        },
        onDashAttack: (angle) => {
          this.weapon.performDashAttack(this, angle);
          this.recorder.event({ type: 'dashAttack', angle });
        },
      });
      // movement
      const spd = m.moveSpeed * this.weapon.moveMul() * this.speedMul;
      const tvx = mv.x * spd, tvy = mv.y * spd;
      const acc = 1 - Math.exp(-22 * dt);
      this.vx += (tvx - this.vx) * acc;
      this.vy += (tvy - this.vy) * acc;
      let dx = this.vx * dt, dy = this.vy * dt;
      if (this.lungeT > 0) {
        this.lungeT -= dt;
        dx += this.lungeVX * dt; dy += this.lungeVY * dt;
      }
      this.world.move(this, dx, dy);
    }

    // facing
    const moving = Math.hypot(this.vx, this.vy) > 12;
    if (this.weapon.busy || inp.facesAim()) this.setFacing(this.aim);
    else if (moving) this.setFacing(Math.atan2(this.vy, this.vx));

    // anim
    const prev = this.anim;
    if (this.dashT > 0) this.anim = Anim.Dash;
    else if (this.hurtT > 0) this.anim = Anim.Hurt;
    else if (moving) this.anim = Anim.Run;
    else this.anim = Anim.Idle;
    if (prev !== this.anim) this.animT = 0;

    // footsteps + dust
    if (this.anim === Anim.Run) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.25;
        sfx('step', { vol: 0.25, pan: 0 });
        this.world.fx.dust(this.x, this.y, 1, Math.atan2(this.vy, this.vx));
      }
    }

    // safe ground for pit respawn
    if (this.dashT <= 0 && !this.world.map.pitAt(this.x, this.y) && this.falling <= 0) {
      const m2 = this.world.map;
      const ok = !m2.pitAt(this.x + 8, this.y) && !m2.pitAt(this.x - 8, this.y) && !m2.pitAt(this.x, this.y + 8) && !m2.pitAt(this.x, this.y - 8);
      if (ok) { this.lastSafeX = this.x; this.lastSafeY = this.y; }
    }

    // Paradox (GDD2 §3.6): walk into an armed echo (anyone's), or dash through it
    Paradox.touch(this);
    if (this.echoes.some((e) => e.dead)) this.echoes = this.echoes.filter((e) => !e.dead);

    this.record();
    this.updateScarf(dt);
    this.syncRun();
  }

  /** write this player's HP back to its loadout (carried into the next room) */
  syncRun() { this.lo.hp = this.hp; }

  // ───────────────────────── stopped / ghost / revive (GDD2 §5.5) ─────────────────────────
  /** wind this hand up again (PLAN2 §1.4) */
  revive(frac: number, by: Player | null, source: ReviveSource) {
    if (this.state === 'alive' && this.hp > 0) return;
    const w = this.world;
    this.state = 'alive';
    this.solid = true;
    this.airborne = false;
    this.hp = Math.max(1, Math.round(this.maxHp * frac));
    this.invuln = Math.max(this.invuln, Down.REVIVE_INVULN);
    this.deadT = 0;
    this.hurtT = 0;
    this.down = Down.newDownState();
    this.dashCharges = this.mods.dashCharges;
    this.rec.prefill(this.x, this.y, 60, this.frameBase());
    this.syncRun();
    w.fx.ring(this.x, this.y - 8, 3, 34, 0.5, (by ?? this).color, 3);
    w.fx.burst(this.x, this.y - 10, 22, ['W', this.color, (by ?? this).color], 140, 0.5);
    if (source === 'windup') w.fx.banner(this.x, this.y - 48, tr(S('f2', 'wound')), this.color, 1.2);
    w.fx.number(this.x, this.y - 26, this.hp, 'G4', false);
    sfx('chimeRing', { vol: 0.7, pan: w.pan(this.x) });
    sfx('rewindEnd', { vol: 0.5 });
    this.input.rumble(0.4, 0.5, 200);
    by?.input.rumble(0.2, 0.4, 160);
    w.bus.emit('revived', { player: this, by, source });
  }

  /** a ghost hand drifts with the team and taps for 1 damage (sand goes to a teammate) */
  private updateGhost(dt: number) {
    const inp = this.input;
    const m = this.mods;
    if (this.ghostCd > 0) this.ghostCd -= dt;
    const mv = this.locked ? { x: 0, y: 0 } : inp.move();
    this.moveX = mv.x; this.moveY = mv.y;
    this.updateAim(mv);
    const spd = m.moveSpeed * 0.9;
    const acc = 1 - Math.exp(-14 * dt);
    this.vx += (mv.x * spd - this.vx) * acc;
    this.vy += (mv.y * spd - this.vy) * acc;
    this.collides = true;
    this.world.move(this, this.vx * dt, this.vy * dt);
    const moving = Math.hypot(this.vx, this.vy) > 12;
    if (moving) this.setFacing(Math.atan2(this.vy, this.vx));
    this.anim = moving ? Anim.Run : Anim.Idle;
    if (!this.locked && inp.pressed('attack') && this.ghostCd <= 0) {
      this.ghostCd = 0.35;
      const c = Math.cos(this.aim), s2 = Math.sin(this.aim);
      this.world.combat.add({
        shape: { t: 'arc', x: this.x, y: this.y - 7, r: 22, a: this.aim, w: 0.9 }, team: 'player', life: 3,
        info: { amount: 1, kind: 'melee', owner: this, knock: 20, via: 'ghost', quiet: true },
      });
      this.world.fx.ring(this.x + c * 12, this.y - 7 + s2 * 12, 1, 7, 0.18, this.color, 1);
      sfx('swingEcho', { vol: 0.35, pan: this.world.pan(this.x) });
    }
    this.updateScarf(dt);
  }

  private updateAim(mv: { x: number; y: number }) {
    const inp = this.input;
    const v = this.world.cam.view();
    const a = inp.aim(this.x - Math.floor(v.x), this.y - 8 - Math.floor(v.y));
    if (inp.kind === 'bot') { if (a.x || a.y) this.aim = Math.atan2(a.y, a.x); return; }
    if (a.kind === 'mouse' || a.kind === 'stick') { this.aim = Math.atan2(a.y, a.x); return; }
    let base = this.aim;
    if (mv.x || mv.y) base = Math.atan2(mv.y, mv.x);
    // soft aim assist toward the nearest enemy within a cone; split-keyboard players have no mouse
    // or stick, so theirs is always on and snaps inside a 60° fan (GDD2 §2.2)
    const kb = inp.kind === 'kb';
    const cone = kb ? Math.PI / 6 : 0.9;
    let best: number | null = null, bd = settings.aimAssist || kb ? 150 : 0;
    for (const e of this.world.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > bd) continue;
      const ea = angleTo(this.x, this.y, e.x, e.y);
      if (Math.abs(angleDiff(base, ea)) < cone) { bd = d; best = ea; }
    }
    this.aim = best ?? base;
  }

  setFacing(a: number) {
    const c = Math.cos(a), s = Math.sin(a);
    if (Math.abs(c) > Math.abs(s) * 1.1) { this.dir = 'side'; this.flip = c < 0; }
    else { this.dir = s > 0 ? 'down' : 'up'; this.flip = c < 0; }
  }

  private startDash() {
    const m = this.mods;
    let dx = this.moveX, dy = this.moveY;
    if (!dx && !dy) { dx = Math.cos(this.aim); dy = Math.sin(this.aim); }
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    this.dashT = this.dashDur;
    const sp = m.dashDist / this.dashDur;
    this.dashVX = dx * sp; this.dashVY = dy * sp;
    this.vx = dx * m.moveSpeed; this.vy = dy * m.moveSpeed;
    this.invuln = Math.max(this.invuln, m.dashInvuln);
    this.airborne = true;
    this.dashCharges--;
    this.weapon.cancel();
    this.lungeT = 0;
    this.setFacing(Math.atan2(dy, dx));
    this.recorder.event({ type: 'dash', dx, dy });
    this.world.fx.dust(this.x, this.y, 4, Math.atan2(dy, dx));
    sfx('dash', { pan: this.world.pan(this.x) });
    this.input.rumble(0, 0.25, 60);
    this.dashAge = 0;
    this.world.bus.emit('dash', { owner: this, dx, dy, echo: false, player: this });
    // Tick-Dodge is judged in hurt(): a blow this dash's invulnerability actually blocks (GDD2 §4.1)
  }

  lunge(dx: number, dy: number, dur: number) {
    this.lungeT = dur;
    this.lungeVX = dx / dur;
    this.lungeVY = dy / dur;
  }

  private afterimage(color: string, dur: number, a0: number) {
    const spr = this.currentSprite();
    this.world.add(new Afterimage(this.x, this.y, spr, this.flip, color, dur, a0));
  }

  // ───────────────────────── recording & rewind (GDD2 §3) ─────────────────────────
  private record() {
    // never tape a spot a rewind could not stand on: the entry walk (collision off, still inside
    // the sealed doorway), a fall, or anything lodged in a wall would rewind the hand into it
    if (!this.collides || this.falling > 0 || !this.world.boxFree(this.x, this.y, this.r)) return;
    const pose = this.weapon.pose(this.aim);
    this.rec.push({
      x: this.x, y: this.y, dir: this.dir === 'down' ? 0 : this.dir === 'up' ? 1 : 2, flip: this.flip,
      anim: this.anim, animT: this.animT, wa: pose.angle, we: pose.ext, wv: pose.vis,
      hp: this.hp, fixed: this.fixedTaken, air: this.dashT > 0,
      tempo: this.lo.tempo, culprits: this.pendCulprits, hit: this.pendHit, fixedHit: this.pendFixed,
    });
    this.pendHit = 0; this.pendFixed = 0; this.pendCulprits = null;
  }

  /** the style this hand rewinds with (hand.rewindStyle; P5 adds more) */
  get rewindStyle(): RewindStyle { return RewindStyles.get(this.hand.rewindStyle); }

  /** can this hand start a rewind now? (PLAN2 §1.8) `fromStop`: a stopped hand rewinding out */
  canRewind(fromStop = false): RewindCheck {
    const stateOk = fromStop ? this.state === 'stopped' && !this.down.final : this.state === 'alive' && this.hp > 0;
    if (!stateOk || this.rw || this.falling > 0 || (this.locked && !fromStop) || !this.world) return { ok: false, reason: 'state' };
    const rec = this.rec;
    if (rec.burnT > 0) return { ok: false, reason: 'burnt' };
    if (this.anchorT > 0) return { ok: false, reason: 'anchor' };
    if (rec.length < MIN_TAPE) return { ok: false, reason: 'tape' };
    if (this.lo.sand + 1e-6 < this.costFor(MIN_BACK / 60, false)) return { ok: false, reason: 'sand' };
    return { ok: true };
  }

  /** Sand for rewinding `seconds` (a scrub may be free: mods.scrubFreeFirst, once per room) */
  costFor(seconds: number, scrub: boolean): number {
    const m = this.mods;
    if (scrub && !this.scrubFreeUsed && m.scrubFreeFirst > 0 && seconds <= m.scrubFreeFirst + 1e-6) return 0;
    return this.rewindStyle.cost(this, seconds);
  }

  /** the most frames back the pool pays for (0 = not even the shortest rewind) */
  private maxBack(scrub: boolean): number {
    const n = this.rec.length;
    if (this.rw?.free) return n;
    const sand = this.lo.sand + 1e-6;
    if (n < MIN_BACK || this.costFor(MIN_BACK / 60, scrub) > sand) return 0;
    let lo = MIN_BACK, hi = n;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.costFor(mid / 60, scrub) <= sand) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  /**
   * frame i, or the nearest frame not over a pit (a dash over a pit is taped but never landed on).
   * Never older than `oldest`: frames before it cost more than the pool holds (review F3 #9).
   */
  private standable(i: number, oldest = 0): number {
    const rec = this.rec, m = this.world.map;
    const n = rec.length;
    oldest = Math.max(0, Math.min(n - 1, oldest));
    i = Math.max(oldest, Math.min(n - 1, i));
    const ok = (k: number) => { const f = rec.at(k); return !m.pitAt(f.x, f.y); };
    if (ok(i)) return i;
    for (let d = 1; d < 60; d++) {
      if (i - d >= oldest && ok(i - d)) return i - d;
      if (i + d < n - MIN_BACK && ok(i + d)) return i + d;
    }
    return i;
  }

  /** where a tap lands: the Shadow — the oldest frame the pool pays for */
  private tapTarget(): number {
    const n = this.rec.length;
    const back = this.maxBack(false);
    if (back <= 0) return 0;
    return this.standable(n - back, n - back);
  }

  /**
   * What a rewind would do right now (PLAN2 §1.8): while scrubbing, at the cursor; otherwise a tap
   * (the Shadow). Cached per tick.
   */
  rewindPreview(): RewindPreview {
    const rec = this.rec;
    const R = this.rw;
    const scrub = !!R && R.phase === 'hold' && R.scrub;
    const hold = !!R && R.phase === 'hold';
    const tick = this.world?.tickNo ?? 0;
    const cursor = scrub ? R!.cursor : -1, sand = Math.round(this.lo.sand);
    const c = this.previewCache;
    if (c && c.tick === tick && c.recTick === rec.tick && c.len === rec.length && c.cursor === cursor && c.sand === sand && c.hp === this.hp && c.fixed === this.fixedTaken && c.hold === hold) return c.v;
    const n = rec.length;
    let v: RewindPreview;
    if (n < 2) v = { frame: 0, x: this.x, y: this.y, hpGain: 0, locked: 0, cost: 0, seconds: 0, ok: false };
    else {
      const idx = scrub ? R!.cursor : this.tapTarget();
      const f = rec.at(idx);
      const seconds = (n - idx) / 60;
      const cost = R?.free ? 0 : this.costFor(seconds, scrub);
      const { gain, locked } = this.hpFromFrame(f, false);
      // a rewind under way passed its checks at the press (the Shadow stays bright until the scrub
      // starts; the HP promise stays cyan through the travel back)
      const ok = !!R || this.canRewind(this.state === 'stopped').ok;
      v = { frame: idx, x: f.x, y: f.y, hpGain: gain, locked, cost, seconds, ok };
    }
    if (c) { c.tick = tick; c.recTick = rec.tick; c.len = rec.length; c.cursor = cursor; c.sand = sand; c.hp = this.hp; c.fixed = this.fixedTaken; c.hold = hold; c.v = v; }
    else this.previewCache = { tick, recTick: rec.tick, len: rec.length, cursor, sand, hp: this.hp, fixed: this.fixedTaken, hold, v };
    return v;
  }

  /** what a tap would give back now (the Shadow's +N), even while a scrub points elsewhere */
  tapGain(): number {
    const rec = this.rec;
    if (rec.length < 2) return 0;
    const R = this.rw;
    if (!(R && R.phase === 'hold' && R.scrub)) return this.rewindPreview().hpGain;
    return this.hpFromFrame(rec.at(this.tapTarget()), false).gain;
  }
  /** why no rewind is possible right now (null = it is); for the grey Shadow and the HUD */
  rewindBlock(): RewindRefusal | null {
    if (this.rw) return null;
    const c = this.canRewind(this.state === 'stopped');
    return c.ok ? null : c.reason ?? 'state';
  }

  /** HP math (GDD2 §3.2): max(current, min(maxHp, frame HP − fixed damage taken since)) */
  private hpFromFrame(f: Frame, rescue: boolean): { to: number; gain: number; locked: number } {
    const fixedSince = Math.max(0, this.fixedTaken - f.fixed);
    const cur = Math.max(0, this.hp);
    let to = this.mods.noRewindHeal ? cur : Math.max(cur, Math.min(this.maxHp, f.hp - fixedSince));
    if (rescue) to = Math.max(1, Math.min(this.maxHp, Math.max(to, f.hp - fixedSince)));
    const gain = Math.max(0, Math.round(to - cur));
    const locked = Math.max(0, Math.min(Math.round(fixedSince), Math.round(this.maxHp - cur - gain)));
    return { to, gain, locked };
  }

  /** press Rewind (refuses with a reason when it can't) */
  tryRewind(auto = false) {
    if (auto) { this.beginRewind({ rescue: true, free: true, auto: true }); return; }
    const c = this.canRewind();
    if (!c.ok) { this.refuse(c.reason!); return; }
    this.beginRewind({});
  }

  /** a short readable reason over the hand (GDD2 §3.1), never "……" */
  refuse(reason: RewindRefusal, need?: number) {
    if (this.refuseT > 0 || !this.world) return;
    this.refuseT = 0.35;
    const lo = this.lo, rec = this.rec;
    const text = reason === 'sand' ? tr(S('f3', 'noSand')).replace('{n}', String(Math.floor(lo.sand))).replace('{m}', String(need ?? this.costFor(MIN_BACK / 60, false)))
      : reason === 'tape' ? tr(S('f3', 'tapeShort')).replace('{s}', rec.seconds.toFixed(1))
      : reason === 'anchor' ? tr(S('f3', 'anchored'))
      : reason === 'burnt' ? tr(S('f3', 'burnt')).replace('{s}', String(Math.ceil(rec.burnT)))
      : tr(S('f3', 'cantNow'));
    if (reason === 'state' && (this.hp <= 0 || this.state !== 'alive')) return;
    sfx('denied', { vol: 0.6 });
    this.world.fx.banner(this.x, this.y - 32, text, reason === 'anchor' ? 'K9' : reason === 'burnt' ? 'O3' : 'C4', 1.1);
    // the coach's "what to do about it" line (ONBOARD2 §6.5 D7) listens for this
    this.world.bus.emit('custom', { id: 'rewindRefused', player: this, data: { reason, need: need ?? null } });
  }

  /** start holding Rewind: the hand turns intangible at once, time around it crawls */
  private beginRewind(o: { rescue?: boolean; free?: boolean; auto?: boolean }) {
    const rec = this.rec;
    this.rw = {
      phase: 'hold', t: 0, scrub: false, cursor: Math.max(0, rec.length - MIN_BACK), clickT: 0,
      rescue: !!o.rescue, free: !!o.free, auto: !!o.auto, style: this.rewindStyle, cut: null, frameIdx: 0,
      tt: 0, dur: TRAVEL_TIME, fromX: this.x, fromY: this.y, cost: 0, seconds: 0, mufT: 0.25,
    };
    this.pull = null;
    this.weapon.cancel();
    this.dashT = 0; this.lungeT = 0; this.vx = this.vy = 0; this.kx = this.ky = 0;
    // out of time until it lands: nothing pushes it, no pit takes it (the path may cross one)
    this.airborne = true;
    this.solid = false;
    this.hurtT = 0;
    this.perfect = { t: this.mods.perfectWindow, hit: false, refunded: false, cost: 0 };
    this.perfectEcho = null;
    sfx('rewindHold', { vol: 0.8 });
    this.input.rumble(0.05, 0.3, 90);
    muffle(this);
    // tap-only: the setting, or scrub not taught yet (ONBOARD2 §5.3: holding = a tap until then)
    if (o.auto || settings.rewindMode === 'tap' || Gates.tapOnly(this)) this.confirmRewind();
  }

  /** dash while holding: a free cancel (GDD2 §3.2) */
  private cancelRewind() {
    this.rw = null;
    this.solid = true;
    this.airborne = false;
    // a blow dodged while holding pays out only for a rewind that happens (review F3 #5)
    this.perfect = null;
    unmuffle(this);
    sfx('tapeClick', { vol: 0.5 });
  }

  /** a held rewind / the travel back (real time: the hand scrubs while the world crawls) */
  private updateRewind(dt: number) {
    const R = this.rw!;
    const m = this.mods;
    const inp = this.input;
    R.t += dt;
    if (R.phase === 'hold') {
      const held = inp.down('rewind');
      if (!R.rescue && inp.pressed('dash')) {
        this.cancelRewind();
        if (this.dashCharges > 0 && this.falling <= 0) this.startDash();
        return;
      }
      const thr = m.rewindTapThreshold;
      // the cursor runs from the tap threshold, but a release before it passes TAP_GRACE_BACK is still a tap
      const scrubAt = thr + Math.max(0, TAP_GRACE_BACK - MIN_BACK / 60) / SCRUB_RATE;
      if (!R.scrub && held && R.t >= scrubAt && settings.rewindMode !== 'tap' && !Gates.tapOnly(this)) {
        R.scrub = true;
        R.clickT = 0.5;
        this.scrubsSeen++;
        sfx('tapeClick', { vol: 0.7 });
      }
      if (R.scrub) {
        const st = R.t - thr;
        const n = this.rec.length;
        const most = this.maxBack(true);
        const back = Math.min(most, MIN_BACK + Math.round(st * SCRUB_RATE * 60));
        R.cursor = back > 0 ? this.standable(n - back, n - most) : n - 1;
        R.clickT -= dt;
        if (R.clickT <= 0) { R.clickT += 0.5; sfx('tapeClick', { vol: 0.55 }); }
        // GDD2 §3.2: 1.2 s from the press, then it confirms on its own
        if (!held || R.t >= m.scrubMax) this.confirmRewind();
      } else if (!held) this.confirmRewind();
      // a pause menu (or the boss's time stop) may have lifted the muffle: keep it on while held
      if ((R.mufT -= dt) <= 0) { R.mufT = 0.25; G.audio.muffle(true, 900); }
      this.anim = Anim.Idle;
      this.updateScarf(dt);
      return;
    }
    // travel: back along the path, newest → target (a style that doesn't teleport stays put; review F3 #2)
    R.tt += dt;
    const k = Math.min(1, R.tt / R.dur);
    if (R.style.teleports) {
      const frames = R.cut!.frames;
      const idx = Math.round((1 - ease.inOutQuad(k)) * (frames.length - 1));
      const f = frames[idx];
      this.x = f.x; this.y = f.y;
      this.dir = f.dir === 0 ? 'down' : f.dir === 1 ? 'up' : 'side';
      this.flip = f.flip;
      this.anim = f.anim as Anim;
      this.animT = f.animT;
      if (this.world.tickNo % 2 === 0) this.afterimage('C3', 0.35, 0.55);
    }
    this.updateScarf(dt);
    if (k >= 1) this.finishRewind();
  }

  /** release (or the scrub ran out): pay, cut the tape, start the travel back */
  private confirmRewind() {
    const R = this.rw!;
    const rec = this.rec;
    const n = rec.length;
    const back = R.scrub ? n - R.cursor : (R.free ? n : this.maxBack(false));
    if (n < MIN_BACK || back < MIN_BACK) {
      this.cancelRewind();
      if (R.rescue) { this.state = 'stopped'; this.solid = false; }
      this.refuse(n < MIN_TAPE ? 'tape' : 'sand');
      return;
    }
    const idx = R.scrub ? R.cursor : (R.free ? 0 : this.tapTarget());
    const seconds = (n - idx) / 60;
    const cost = R.free ? 0 : this.costFor(seconds, R.scrub);
    if (cost > 0 && !this.lo.spendSand(cost)) {
      this.cancelRewind();
      if (R.rescue) { this.state = 'stopped'; this.solid = false; }
      this.refuse('sand', cost);
      return;
    }
    if (R.scrub && cost === 0 && !R.free) this.scrubFreeUsed = true;
    R.cost = cost; R.seconds = seconds; R.frameIdx = idx;
    if (this.perfect) this.perfect.cost = cost;
    R.fromX = this.x; R.fromY = this.y;
    R.cut = rec.cutFrom(idx);
    R.phase = 'travel';
    R.tt = 0;
    R.dur = R.style.teleports ? TRAVEL_TIME : 0.01;
    this.solid = false;
    sfx('rewind', { vol: 0.85 });
    this.input.rumble(0.1, 0.5, 250);
    G.audio.duck(0.3, 0.5);
  }

  /** landed: the style commits (move, heal, echo), then the landing beat */
  private finishRewind() {
    const R = this.rw!;
    const m = this.mods;
    const w = this.world;
    const hpBefore = Math.max(0, this.hp);
    const rescue = R.rescue;
    this.lastEcho = null;
    // hits that never reached the tape (the blow that stopped the hand) are undone with the rest
    this.pendHit = 0; this.pendFixed = 0; this.pendCulprits = null;
    R.style.commit(this, R.frameIdx, R.cut!);
    const restored = Math.max(0, Math.round(this.hp - hpBefore));
    this.rw = null;
    this.solid = true;
    this.airborne = false;
    this.hurtT = 0;
    this.dashT = 0;
    this.collides = true;
    this.autoWalk = 0;
    this.rippleT = 0;
    // landing: half a second of invulnerability (a shrinking ring of clock ticks), '+N', a click
    const inv = Math.max(m.landInvuln, m.rewindInvuln);
    this.invuln = Math.max(this.invuln, inv);
    this.landT = this.landDur = inv;
    this.landGain = restored;
    this.scarfA.reset(this.x, this.y - 10);
    this.scarfB.reset(this.x, this.y - 10);
    this.flash = 0.1;
    w.fx.ring(this.x, this.y - 6, 2, 34, 0.35, 'C3', 2);
    w.fx.burst(this.x, this.y - 8, 14, ['C4', 'C3', 'C2'], 120, 0.4);
    w.shake(0.15);
    w.stats.rewinds++;
    sfx('rewindLand');
    sfx('rewindEnd', { vol: 0.7 });
    this.input.rumble(0.45, 0.3, 120);
    unmuffle(this);
    // a blow dodged inside the Perfect window refunds the rewind and gilds its echo (the feedback
    // waits for the landing: a cancelled rewind pays nothing; review F3 #5)
    this.perfectEcho = this.lastEcho;
    if (this.perfect?.hit) { this.perfectFx(); this.payPerfect(); }
    if (rescue && !R.auto) {
      // rewinding out of a stop burns the tape for 6 s (GDD2 §3.10); Old Watch's own rewind is no rescue
      this.rec.burnT = Math.max(this.rec.burnT, TAPE_BURN);
      this.down = Down.newDownState();
      w.bus.emit('revived', { player: this, by: null, source: 'self' });
    }
    w.bus.emit('rewind', { fromX: R.fromX, fromY: R.fromY, toX: this.x, toY: this.y, restored, player: this, seconds: R.seconds, cost: R.cost, perfect: !!this.perfect?.hit, scrub: R.scrub });
  }

  /** standard commit: HP (and, out of a stop, at least 1) and the tempo at that moment */
  restoreFromFrame(f: Frame) {
    const R = this.rw;
    const { to } = this.hpFromFrame(f, !!R?.rescue);
    this.hp = to;
    this.lo.tempo = f.tempo;
    if (R?.rescue) { this.state = 'alive'; this.deadT = 0; }
  }

  /**
   * Culprits (GDD2 §3.8): whoever hurt this hand during the seconds it just undid is marked for
   * 4 s; this hand's echoes deal +50% to them.
   */
  markCulprits(rec: Recording) {
    const w = this.world;
    const ids = new Set<number>();
    for (const f of rec.frames) if (f.culprits) for (const id of f.culprits) ids.add(id);
    if (!ids.size) return;
    for (const e of w.enemies) {
      if (e.dead || !ids.has(e.id)) continue;
      const fresh = !e.culpritOf.has(this.slot);
      e.culpritOf.set(this.slot, this.mods.culpritT);
      if (fresh) w.bus.emit('culprit', { player: this, target: e });
    }
  }

  /**
   * Leave an echo that replays `rec` (PLAN2 §1.8; rewind styles, Fork, Pull Back and P4/P5 call it).
   * Caps (GDD2 §3.5): this hand keeps mods.maxEchoes (dash echoes don't count), the room keeps 8 —
   * the oldest goes first. Twin Mirror adds a mirrored twin at half damage under the same caps.
   * Every echo made here is announced with `echoSpawn`.
   */
  spawnEcho(rec: Recording, o: EchoOpts & { twin?: boolean } = {}): Echo | null {
    const m = this.mods;
    const w = this.world;
    if (rec.frames.length < 2 || !w) return null;
    const kind = o.kind ?? 'walk';
    if (kind !== 'dash') {
      const mine = this.echoes.filter((e) => !e.dead && e.kind !== 'dash');
      while (mine.length >= Math.max(1, m.maxEchoes)) mine.shift()!.shatter();
    }
    const all: Echo[] = [];
    for (const q of w.players) for (const e of q.echoes) if (!e.dead) all.push(e);
    all.sort((a, b) => b.age - a.age);
    while (all.length >= TEAM_ECHO_CAP) all.shift()!.shatter();
    const echo = w.add(new Echo(this, rec, o));
    this.echoes.push(echo);
    if (!o.twin) this.lastEcho = echo;
    w.bus.emit('echoSpawn', { echo, player: this });
    if (m.mirrorEcho && !o.twin && kind !== 'dash' && kind !== 'statue') {
      // Twin Mirror: the path reflected around its start, half damage
      const sx = rec.frames[0].x;
      const mir: Recording = {
        frames: rec.frames.map((f) => ({ ...f, x: sx - (f.x - sx), flip: !f.flip, wa: Math.PI - f.wa })),
        events: rec.events.map((e) => ({ ...e, angle: e.angle !== undefined ? Math.PI - e.angle : undefined, dx: e.dx !== undefined ? -e.dx : undefined })),
      };
      // only when the reflection stays on walkable floor
      if (mir.frames.every((f) => !w.map.solidAt(f.x, f.y) && !w.map.pitAt(f.x, f.y))) this.spawnEcho(mir, { ...o, twin: true, dmgScale: (o.dmgScale ?? m.echoDmg) * 0.5 });
    }
    return echo;
  }

  // ───────────────────────── Fork & Recall (GDD2 §3.4) ─────────────────────────
  /** can this hand Fork now? */
  canFork(): { ok: boolean; reason?: ForkRefusal } {
    const m = this.mods;
    if (this.state !== 'alive' || this.hp <= 0 || this.rw || this.locked || this.falling > 0 || !this.world) return { ok: false, reason: 'state' };
    if (this.anchorT > 0) return { ok: false, reason: 'anchor' };
    if (this.forkCdT > 0) return { ok: false, reason: 'cooldown' };
    if (this.rec.seconds < FORK_MIN_TAPE) return { ok: false, reason: 'tape' };
    if (this.lo.sand + 1e-6 < m.forkCost) return { ok: false, reason: 'sand' };
    return { ok: true };
  }

  /**
   * Fork (PLAN2 §1.8, GDD2 §3.4): pay 50 Sand for an echo of the last 2 s. The hand does not move,
   * heal or lose tape; the echo starts where the hand was 2 s ago and walks to where Fork was
   * pressed (a clock face marks it), then stands there — walk back into it for a Paradox.
   */
  fork(): boolean {
    const c = this.canFork();
    // not taught yet: the first press is explained instead (no Sand, no echo; ONBOARD2 §5.3)
    if (c.reason !== 'state' && !Gates.forkAllow(this)) return false;
    if (!c.ok) { this.refuseFork(c.reason!); return false; }
    const m = this.mods, w = this.world;
    if (!this.lo.spendSand(m.forkCost)) { this.refuseFork('sand'); return false; }
    const rec = this.rec.slice(m.forkLen);
    const echo = this.spawnEcho(rec, { kind: 'fork' });
    if (!echo) { this.lo.addSand(m.forkCost); return false; }
    this.forkCdT = m.forkCd;
    // the tape "unspools" back along the path to where the echo starts
    const fr = rec.frames;
    for (let k = 0; k < fr.length; k += 10) w.fx.ring(fr[k].x, fr[k].y - 2, 1, 5, 0.25 + (k / fr.length) * 0.2, 'C3', 1);
    w.fx.ring(echo.x, echo.y - 8, 2, 20, 0.35, 'C4', 2);
    w.fx.ring(this.x, this.y - 2, 2, 12, 0.3, 'C3', 1);
    w.fx.burst(echo.x, echo.y - 8, 12, ['C4', 'C3', 'C2'], 90, 0.35);
    sfx('fork', { pan: w.pan(this.x) });
    this.input.rumble(0.15, 0.35, 90);
    w.bus.emit('fork', { player: this, echo });
    return true;
  }
  private refuseFork(reason: ForkRefusal) {
    if (this.refuseT > 0 || !this.world || reason === 'state') return;
    this.refuseT = 0.35;
    const lo = this.lo;
    const text = reason === 'sand' ? tr(S('f3', 'noSand')).replace('{n}', String(Math.floor(lo.sand))).replace('{m}', String(this.mods.forkCost))
      : reason === 'anchor' ? tr(S('f3', 'anchored'))
      : reason === 'cooldown' ? tr(S('f3', 'forkCd')).replace('{s}', this.forkCdT.toFixed(1))
      : reason === 'noArmed' ? tr(S('f3', 'noArmed'))
      : tr(S('f3', 'tapeShort')).replace('{s}', this.rec.seconds.toFixed(1));
    sfx('denied', { vol: 0.6 });
    this.world.fx.banner(this.x, this.y - 32, text, reason === 'anchor' ? 'K9' : 'C4', 1.1);
    this.world.bus.emit('custom', { id: 'forkRefused', player: this, data: { reason, need: reason === 'sand' ? this.mods.forkCost : null } });
  }

  /** Recall (mods.recall): every armed echo of this hand flies home; true if any did */
  recallEchoes(): boolean {
    let n = 0;
    for (const e of this.echoes) if (e.recall()) n++;
    if (!n) return false;
    const w = this.world;
    w.fx.ring(this.x, this.y - 8, 18, 4, 0.3, 'C4', 2);
    sfx('recall', { pan: w.pan(this.x) });
    this.input.rumble(0.2, 0.5, 160);
    w.bus.emit('custom', { id: 'recall', player: this, data: { echoes: n } });
    return true;
  }

  /** Fork on press — or, with Recall unlocked, on release before 0.4 s (a longer hold recalls) */
  private updateFork(dt: number) {
    const inp = this.input;
    if (this.locked) { this.forkHold = -1; return; }
    const recall = this.mods.recall >= 1;
    if (inp.pressed('fork')) {
      if (!recall) { this.fork(); return; }
      this.forkHold = 0; this.forkUsed = false;
    }
    if (this.forkHold < 0) return;
    if (inp.down('fork')) {
      this.forkHold += dt;
      if (!this.forkUsed && this.forkHold >= RECALL_HOLD) { this.forkUsed = true; if (!this.recallEchoes()) this.refuseFork('noArmed'); }
      return;
    }
    if (!this.forkUsed) this.fork();
    this.forkHold = -1;
  }

  /**
   * An attack that would have landed inside the Perfect window (GDD2 §3.9). While the rewind is
   * still held only a soft glint answers it: the stamp, the refund and the event come at the
   * landing, so a rewind cancelled with a dash pays nothing (review F3 #5).
   */
  private perfectHit() {
    const pf = this.perfect!;
    pf.hit = true;
    if (this.rw) {
      this.world.fx.ring(this.x, this.y - 8, 2, 14, 0.25, 'B5', 1);
      sfx('tapeClick', { vol: 0.5, pitch: 2 });
      return;
    }
    this.perfectFx();
    this.payPerfect();
  }
  /** PERFECT: the stamp over the hand, a brass ring, the bell, a short freeze, the event */
  private perfectFx() {
    const w = this.world;
    this.perfectStampT = PERFECT_STAMP;
    w.fx.stamp(this.x, this.y - 46, S('f3', 'perfect'), 'B5', PERFECT_STAMP, { rule: 'C3', term: 'perfect' });
    w.fx.ring(this.x, this.y - 8, 4, 30, 0.4, 'B5', 2);
    w.fx.ring(this.x, this.y - 8, 2, 22, 0.3, 'C4', 2);
    w.hitstop(0.06);
    sfx('perfectRewind');
    this.input.rumble(0.3, 0.6, 140);
    w.bus.emit('perfectRewind', { player: this });
  }
  private payPerfect() {
    const pf = this.perfect;
    if (!pf || pf.refunded) return;
    pf.refunded = true;
    const lo = this.lo;
    const before = lo.sand;
    lo.sand = Math.min(lo.sandMax, lo.sand + pf.cost);
    this.perfectRefund = Math.round(lo.sand - before);
    this.perfectEcho?.gild();
  }

  /** per-tick rewind bookkeeping that runs in every state (ripple, timers, the Perfect window) */
  private tickRewindFx(dt: number) {
    const R = this.rw;
    if (this.refuseT > 0) this.refuseT -= dt;
    // F3b timers (game time around the hand)
    if (this.dashAge < 99) this.dashAge += dt;
    if (this.sinceDash < 99) this.sinceDash += dt;
    if (this.forkCdT > 0) this.forkCdT = Math.max(0, this.forkCdT - dt);
    if (this.tickCdT > 0) this.tickCdT -= dt;
    if (this.tickRingT > 0) this.tickRingT = Math.max(0, this.tickRingT - dt);
    if (this.counterT > 0) this.counterT = Math.max(0, this.counterT - dt);
    if (this.anchorT > 0) this.anchorT -= dt;
    const rec = this.rec;
    if (rec.burnT > 0) rec.burnT = Math.max(0, rec.burnT - dt);
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);
    if (this.perfectStampT > 0) this.perfectStampT = Math.max(0, this.perfectStampT - (R ? dt : dt / Math.max(0.05, this.world.timeScale)));
    if (this.perfect) {
      // the window runs on the time around the hand (0.15× while it rewinds)
      this.perfect.t -= R ? dt * this.world.timeScaleAt(this.x, this.y) : dt;
      if (this.perfect.t <= 0 && !R) this.perfect = null;
    }
    // ripple strength: a soft hold, a stronger scrub, full while travelling, fading after landing
    let fx = 0;
    if (R) fx = R.phase === 'travel' ? 0.75 + 0.25 * Math.sin(Math.min(1, R.tt / R.dur) * Math.PI) : R.scrub ? 0.62 + Math.sin(R.t * 9) * 0.06 : 0.45;
    else if (this.rippleT >= 0) {
      this.rippleT += dt;
      fx = Math.max(0, 0.7 * (1 - this.rippleT / 0.45));
      if (this.rippleT > 0.45) this.rippleT = -1;
    }
    this.rewindFx = fx;
    const want = R && R.phase === 'hold' && R.scrub ? 0.3 : 0;
    this.scrubDesat += (want - this.scrubDesat) * Math.min(1, dt * (want > this.scrubDesat ? 10 : 6));
  }

  /** ripple radius in view px: 120 solo / the 72 px bubble in co-op; it widens as it fades after landing */
  rippleR(solo: boolean): number {
    const base = solo ? 120 : 72;
    if (!this.rw && this.rippleT >= 0) return base * (1 + Math.min(1, this.rippleT / 0.45) * 0.45);
    return base + (this.rw?.scrub ? Math.sin(this.world.time * 30) * 1.5 : 0);
  }

  // ───────────────────────── stops, Pull Back, catch-up (GDD2 §3.10, §5.5, §5.3) ─────────────────────────
  /** Last Second / self-rescue: can this stopped hand rewind out now? (DownedHooks.canRewindOut) */
  canRewindFromStop() {
    // co-op: only within the first 3 s of the stop (GDD2 §5.5); solo: the Last Second window
    if (this.world && this.world.playerCount > 1 && this.down.t > Down.SELF_RESCUE) return false;
    return this.canRewind(true).ok;
  }
  /** rewind out of a stop (DownedHooks.rewindOut): a normal, paid rewind that stands the hand up */
  rewindFromStop(): boolean {
    const c = this.canRewind(true);
    if (!c.ok) { if (c.reason !== 'state') this.refuseStopped(c.reason!); return false; }
    this.state = 'alive';
    this.solid = true;
    this.beginRewind({ rescue: true });
    return true;
  }
  private refuseStopped(reason: RewindRefusal) {
    const st = this.state;
    this.state = 'alive';
    const hp = this.hp;
    this.hp = 1;
    this.refuse(reason);
    this.hp = hp;
    this.state = st;
  }

  /** the stopped teammate this hand could pull back right now (first 3 s, within 48 px) */
  pullTarget(): Player | null {
    const w = this.world;
    if (w.playerCount < 2 || this.state !== 'alive' || this.hp <= 0) return null;
    let best: Player | null = null, bd = PULL_RANGE;
    for (const q of w.players) {
      if (q === this || q.state !== 'stopped' || q.down.t > Down.SELF_RESCUE) continue;
      const d = Math.hypot(q.x - this.x, q.y - this.y);
      if (d <= bd) { bd = d; best = q; }
    }
    return best;
  }

  /** hold Rewind 0.4 s next to a teammate who just stopped (downed.ts asks DownedHooks.pullBack) */
  private updatePull(dt: number, pressed: boolean) {
    const P = this.pull;
    if (P) {
      const t = P.target;
      const valid = t.state === 'stopped' && t.down.t <= Down.SELF_RESCUE && Math.hypot(t.x - this.x, t.y - this.y) <= PULL_RANGE + 8;
      if (!valid || !this.input.down('rewind') || this.locked) { this.pull = null; return; }
      P.t += dt;
      return;
    }
    if (!pressed) return;
    const tgt = this.pullTarget();
    if (!tgt) return;
    // short of 100 Sand the press is an ordinary rewind (the prompt over the teammate is greyed)
    if (this.lo.sand + 1e-6 < PULL_COST) return;
    this.pull = { target: tgt, t: 0 };
    sfx('tapeClick', { vol: 0.6 });
  }

  /**
   * Pull Back (GDD2 §5.5, PLAN2 §1.8): pay 100 Sand; the teammate goes back to its own state three
   * seconds ago (its Shadow, its tape HP minus fixed damage, at least 30%) and leaves an echo that
   * replays the fight that stopped it.
   */
  pullBack(target: Player): boolean {
    if (target.state !== 'stopped' || target === this) return false;
    if (!this.lo.spendSand(PULL_COST)) return false;
    const w = this.world;
    const rec = target.rec;
    const fromX = target.x, fromY = target.y;
    target.state = 'alive';
    target.solid = true;
    target.airborne = false;
    target.deadT = 0;
    target.hurtT = 0;
    target.down = Down.newDownState();
    target.dashCharges = target.mods.dashCharges;
    target.pendHit = 0; target.pendFixed = 0; target.pendCulprits = null;
    let restored = 0;
    if (rec.length >= 2) {
      const idx = target.standable(0);
      const cut = rec.cutFrom(idx);
      const f = cut.frames[0];
      target.x = f.x; target.y = f.y;
      const fixedSince = Math.max(0, target.fixedTaken - f.fixed);
      target.hp = Math.round(Math.max(target.maxHp * PULL_MIN_HP, Math.min(target.maxHp, f.hp - fixedSince)));
      target.lo.tempo = f.tempo;
      target.lastEcho = null;
      target.spawnEcho(cut);
    } else target.hp = Math.round(target.maxHp * PULL_MIN_HP);
    restored = target.hp;
    target.syncRun();
    target.invuln = Math.max(target.invuln, Down.REVIVE_INVULN);
    target.landT = target.landDur = Down.REVIVE_INVULN;
    target.landGain = restored;
    target.rippleT = 0;
    target.scarfA.reset(target.x, target.y - 10);
    target.scarfB.reset(target.x, target.y - 10);
    this.pull = null;
    w.fx.ring(fromX, fromY - 8, 3, 26, 0.4, this.color, 2);
    w.fx.ring(target.x, target.y - 8, 3, 34, 0.5, target.color, 3);
    w.fx.burst(target.x, target.y - 10, 22, ['W', 'C3', target.color, this.color], 140, 0.5);
    w.fx.banner(target.x, target.y - 46, tr(S('f3', 'pulled')), 'C3', 1.4);
    sfx('rewind', { vol: 0.7 });
    sfx('chimeRing', { vol: 0.7, pan: w.pan(target.x) });
    target.input.rumble(0.4, 0.5, 200);
    this.input.rumble(0.25, 0.4, 160);
    w.bus.emit('rewind', { fromX, fromY, toX: target.x, toY: target.y, restored, player: target, seconds: 3, cost: 0, perfect: false, scrub: false });
    w.bus.emit('revived', { player: target, by: this, source: 'pullback' });
    return true;
  }

  /**
   * Catch-up rewind (GDD2 §5.3, PLAN2 §1.8): a free hop to (x, y) for a hand left off screen or
   * stuck; no echo, no Sand. The tape restarts standing there.
   */
  catchUpTo(x: number, y: number): void {
    const w = this.world;
    if (this.rw) { this.rw = null; this.solid = true; this.airborne = false; unmuffle(this); }
    w.fx.ring(this.x, this.y - 6, 2, 22, 0.3, 'C3', 2);
    this.x = x; this.y = y;
    this.vx = this.vy = 0; this.kx = this.ky = 0;
    this.dashT = 0; this.lungeT = 0;
    this.pendHit = 0; this.pendFixed = 0; this.pendCulprits = null;
    this.rec.prefill(x, y, 60, this.frameBase());
    this.scarfA.reset(this.x, this.y - 10);
    this.scarfB.reset(this.x, this.y - 10);
    this.invuln = Math.max(this.invuln, 0.5);
    w.fx.ring(this.x, this.y - 6, 2, 30, 0.35, 'C3', 2);
    w.fx.burst(this.x, this.y - 8, 12, ['C4', 'C3', 'C2'], 100, 0.35);
    sfx('rewindEnd', { vol: 0.5, pan: w.pan(this.x) });
  }

  // ───────────────────────── damage ─────────────────────────
  hurt(info: DamageInfo): number {
    // Perfect Rewind (GDD2 §3.9): an attack that would have landed within the window after the press
    const pf = this.perfect;
    if (pf && !pf.hit && pf.t > 0 && (this.rw || this.invuln > 0) && PERFECT_KINDS.has(info.kind) && !info.hazard && this.state === 'alive') this.perfectHit();
    // intangible from the press to the landing (GDD2 §3.2)
    if (this.rw) return 0;
    if (this.hp <= 0 || this.state !== 'alive') return 0;
    if ((this.invuln > 0 || this.dashT > 0) && !info.pierceInvuln) {
      // Tick-Dodge (GDD2 §4.1): a blow this dash's invulnerability blocked within 0.16 s of its start
      if (this.dashAge <= this.mods.tickDodgeWindow && this.tickCdT <= 0 && isAttack(info)) this.tickDodge(info);
      return 0;
    }
    const m = this.mods;
    const lo = this.lo;
    if (lo.shieldReady) {
      lo.shieldReady = false;
      this.invuln = 0.6;
      this.world.fx.banner(this.x, this.y - 30, tr(S('f3', 'sealWax')), 'B5', 0.8);
      this.world.fx.ring(this.x, this.y - 8, 4, 22, 0.3, 'B5', 2);
      sfx('clank');
      return 0;
    }
    let amt = Math.max(1, Math.round(info.amount * (1 - m.armor) * (1 + 0.1 * this.run.overwind)));
    // onto the tape: a red notch (undoable) or a violet one (fixed), and who dealt it (Culprit)
    if (info.fixed) { this.fixedTaken += amt; this.pendFixed += amt; } else this.pendHit += amt;
    const by = info.owner;
    if (by && by.team === 'enemy' && !(this.pendCulprits ??= []).includes(by.id)) this.pendCulprits.push(by.id);
    this.hp -= amt;
    this.flash = 0.12;
    this.hurtT = 0.22;
    this.invuln = 0.75;
    this.weapon.cancel();
    if (info.knock && info.x !== undefined) {
      const a = Math.atan2(this.y - (info.y ?? this.y), this.x - info.x);
      this.kx += Math.cos(a) * info.knock * 0.6;
      this.ky += Math.sin(a) * info.knock * 0.6;
    }
    const w = this.world;
    w.fx.number(this.x, this.y - 24, amt, info.fixed ? 'V3' : 'R4', true);
    // a blow that starts the solo Last Second gets a small red burst without the white impact flash:
    // at 0.2× the flash hung over the hand as a white blob for half a second, right when the player
    // must see where it stands (D18)
    if (this.hp <= 0 && w.playerCount <= 1) w.fx.burst(this.x, this.y - 10, 8, ['R4', 'R3', 'R2'], 120, 0.25);
    else w.fx.hitSparks(this.x, this.y - 10, info.x !== undefined ? Math.atan2(this.y - (info.y ?? 0), this.x - info.x) : 0, 'blood', amt);
    w.hitstop(0.09);
    w.shake(0.38);
    w.stats.hitsTaken++;
    G.r.params.hurt = 1;
    sfx('hurt');
    this.input.rumble(0.55, 0.8, 180);
    w.bus.emit('damaged', { info, dealt: amt, player: this, undoable: !info.fixed });
    if (this.hp <= 0) {
      // Old Watch (1.0): once a floor, rewind on its own instead of stopping (free, to the Shadow)
      if (lo.autoRewindLeft > 0 && this.rec.length > MIN_TAPE) {
        lo.autoRewindLeft--;
        this.hp = 0;
        this.tryRewind(true);
        w.fx.banner(this.x, this.y - 36, tr(S('f3', 'autoRewind')), 'C3', 1.2);
        return amt;
      }
      if (lo.revivesUsed < m.revives) {
        lo.revivesUsed++;
        this.hp = Math.round(this.maxHp * 0.4);
        this.invuln = 2;
        w.fx.banner(this.x, this.y - 36, tr(S('f3', 'secondSpring')), 'B5', 1.4);
        w.fx.ring(this.x, this.y - 8, 4, 60, 0.6, 'B5', 3);
        w.fx.burst(this.x, this.y - 8, 30, ['W', 'B6', 'B4'], 180, 0.6);
        for (const e of w.enemiesNear(this.x, this.y, 70)) e.hurt({ amount: 20, kind: 'aoe', owner: this, x: this.x, y: this.y, knock: 300 });
        sfx('rewindEnd');
        return amt;
      }
      // the clock stops (solo: the Last Second window first; co-op: 15 s to be wound up)
      Down.stop(this);
      this.syncRun();
    }
    return amt;
  }

  /**
   * Tick-Dodge (GDD2 §4.1): the world slows to 0.3× for 0.35 s (co-op: a bubble around this hand),
   * a white clock ring and "TICK!", +25 Sand, and the next hit within 1.2 s is a Counter.
   */
  private tickDodge(info: DamageInfo) {
    const m = this.mods, w = this.world;
    this.tickCdT = TICK_SPACING;
    this.tickRingT = 0.45;
    this.counterT = COUNTER_T;
    this.lo.addSand(m.tickDodgeSand);
    const solo = w.playerCount <= 1;
    w.bubbles.push({ x: this.x, y: this.y, r: solo ? Infinity : BUBBLE_R, scale: TICK_SLOW_SCALE, dur: m.tickDodgeSlow, owner: this });
    w.fx.ring(this.x, this.y - 8, 6, 30, 0.4, 'W', 2);
    w.fx.burst(this.x, this.y - 8, 10, ['W', 'K10', 'C4'], 110, 0.3);
    w.fx.stamp(this.x, this.y - 38, S('f3', 'tick'), 'K10', 0.9, { rule: 'C4', term: 'tickDodge' });
    sfx('tickDodge', { pan: w.pan(this.x) });
    this.input.rumble(0.2, 0.6, 90);
    void info;
    w.bus.emit('tickDodge', { x: this.x, y: this.y, player: this });
    w.bus.emit('perfectDodge', { x: this.x, y: this.y, player: this });
  }

  onFall() {
    sfx('fall');
  }
  onFallEnd() {
    this.world.fx.splash(this.x, this.y);
    this.x = this.lastSafeX; this.y = this.lastSafeY;
    this.falling = 0;
    this.hurt({ amount: 6, kind: 'fall', pierceInvuln: true });
    this.invuln = 1;
  }

  // ───────────────────────── render ─────────────────────────
  currentSprite(): Sprite {
    const F = this.frames;
    switch (this.anim) {
      case Anim.Run: return F.run[this.dir][Math.floor(this.animT * 12) % 6];
      case Anim.Dash: return F.dash[this.dir];
      case Anim.Hurt: return F.hurt[this.dir];
      default:
        if (this.blinkT < 0 && this.dir !== 'up') return F.blink[this.dir];
        return F.idle[this.dir][Math.floor(this.animT * 4) % 4];
    }
  }

  /** the sprite of a taped frame (the Shadow, previews) */
  spriteFor(f: Frame): Sprite {
    const F = this.frames;
    const dir: Dir = f.dir === 0 ? 'down' : f.dir === 1 ? 'up' : 'side';
    switch (f.anim) {
      case Anim.Run: return F.run[dir][Math.floor(f.animT * 12) % 6];
      case Anim.Dash: return F.dash[dir];
      case Anim.Hurt: return F.hurt[dir];
      default: return F.idle[dir][Math.floor(f.animT * 4) % 4];
    }
  }

  private updateScarf(dt: number) {
    const F = this.frames;
    const n = F.neck[this.dir];
    const fx = this.flip ? -1 : 1;
    const ax = this.x + n.x * fx, ay = this.y + n.y + (this.anim === Anim.Run ? 0 : 0);
    const vx = this.rewinding ? 0 : this.vx + (this.dashT > 0 ? this.dashVX * 0.4 : 0), vy = this.rewinding ? 0 : this.vy;
    // wind opposite to motion + idle breeze
    const bx = this.dir === 'side' ? -fx * 30 : 0;
    this.scarfA.update(ax + (this.dir === 'down' ? 2 : 0), ay, -vx * 1.4 + bx, -vy * 1.4 - 20, dt);
    this.scarfB.update(ax + (this.dir === 'down' ? -1 : 0), ay + 1, -vx * 1.2 + bx * 0.8, -vy * 1.2 - 10, dt);
  }

  renderGround(r: Renderer) {
    if (this.falling > 0) return;
    if (this.state === 'ghost') return;
    if (this.state === 'stopped') Down.renderStoppedGround(r, this);
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.45)';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), 6, 2.5, 0, 0, TAU);
    ctx.fill();
    // co-op: a pixel ring in the slot colour under each hand (GDD2 §5.2)
    if (this.world.playerCount > 1 && this.hp > 0 && this.state === 'alive') {
      const cx = Math.round(this.x), cy = Math.round(this.y);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = col(this.color);
      for (const [dx, dy] of RING) { ctx.fillRect(cx + dx, cy + dy, 1, 1); ctx.fillRect(cx - dx - 1, cy + dy, 1, 1); }
      ctx.globalAlpha = 1;
    }
  }

  render(r: Renderer) {
    if (this.state === 'ghost') return this.renderGhost(r);
    if (this.state === 'stopped' && this.world.playerCount > 1) { Down.renderStoppedBody(r, this, this.frames.hurt.down); return; }
    if (this.state === 'stopped' && !this.down.final) { Down.renderStoppedBody(r, this, this.currentSprite()); return; }
    if (this.hp <= 0 && this.deadT > 0.05) return this.renderDead(r);
    const ctx = r.w;
    const spr = this.currentSprite();
    const fall = this.falling > 0 ? this.falling / 0.55 : 1;
    if (this.falling > 0) {
      drawSprite(ctx, spr, this.x, this.y + (1 - fall) * 6, { flip: this.flip, sx: fall, sy: fall, alpha: fall });
      return;
    }
    const blink = this.invuln > 0 && this.hurtT <= 0 && !this.rewinding && this.dashT <= 0 && Math.floor(this.world.time * 20) % 2 === 0;
    const F = this.frames;
    const pose = this.weapon.pose(this.aim);
    const hand = F.hand[this.dir];
    const fx = this.flip ? -1 : 1;
    const hx = this.x + hand.x * fx, hy = this.y + hand.y;
    const weaponBehind = Math.sin(pose.angle) < -0.35 || this.dir === 'up';
    const scarfFront = this.dir === 'up';
    // key (behind when facing camera)
    const key = KEYS[Math.floor(((this.keyAngle % TAU) + TAU) % TAU / (TAU / 4)) % 4];
    if (!scarfFront) {
      this.scarfB.draw(ctx);
      this.scarfA.draw(ctx);
      drawSprite(ctx, key, this.x - (this.dir === 'side' ? fx * 6 : 0), this.y - 12, { flip: this.flip });
    }
    if (weaponBehind) this.weapon.drawHeld(r, hx, hy, pose);
    const tint = this.flash > 0 ? '#ffffff' : this.rewinding ? 'C3' : undefined;
    const pt = this.renderTint;
    if (pt) {
      // the demo puppet: the hand's own colours, see-through and greyed, with a white chalk rim
      const a = (blink ? 0.4 : 1) * pt.alpha;
      drawSprite(ctx, spr, this.x, this.y, { flip: this.flip, tint, alpha: a });
      if (pt.desat > 0) drawSprite(ctx, spr, this.x, this.y, { flip: this.flip, tint: 'K6', alpha: a * pt.desat * 0.6 });
      drawSprite(ctx, outlineOf(spr, pt.outline, pt.dashed ? 'dash' : 'solid'), this.x, this.y, { flip: this.flip });
    } else drawSprite(ctx, spr, this.x, this.y, { flip: this.flip, tint, alpha: blink ? 0.4 : 1 });
    if (!weaponBehind) this.weapon.drawHeld(r, hx, hy, pose);
    if (scarfFront) {
      drawSprite(ctx, key, this.x, this.y - 11, { flip: this.flip });
      this.scarfB.draw(ctx);
      this.scarfA.draw(ctx);
    }
    // heart-lamp: the player always carries a little warm light
    const pl = this.world.theme.playerLight ?? 1;
    r.lightAt(this.x, this.y - 8, 70, 'O3', 0.55 * pl);
    // co-op: the small inner glow takes the slot colour, so each hand carries its own tint
    if (this.world.playerCount > 1) r.lightAt(this.x, this.y - 8, 30, this.color, 0.35 * pl);
    else r.lightAt(this.x, this.y - 8, 26, 'K10', 0.25 * pl);
  }

  renderUnlit(r: Renderer) {
    // the Shadow and its hairspring first (under everything else this hand marks)
    renderShadow(r, this);
    // aim reticle (mouse) is drawn by HUD; here: future path of echoes (co-op: 40%, imminent beads only)
    const dim = this.world.playerCount > 1;
    for (const e of this.echoes) if (!e.dead) e.renderPath(r, dim);
    // what touching the nearest armed echo would set off (GDD2 §3.6)
    if (this.state === 'alive') Paradox.render(r, this);
    renderRewindMarks(r, this);
    this.renderVerbMarks(r);
    if (this.state === 'stopped') { Down.renderStoppedUnlit(r, this); Down.renderStoppedLabel(r, this); return; }
    if (this.state === 'ghost') {
      if (this.world.playerCount > 1) drawSlotBadge(r.u, this.slot, Math.round(this.x), Math.round(this.y) - 27 + Math.round(Math.sin(this.world.time * 3)));
      return;
    }
    // co-op: shape badge 3 px above the crown so colour-blind players can tell the hands apart
    if (this.world.playerCount > 1 && this.hp > 0 && this.falling <= 0) drawSlotBadge(r.u, this.slot, Math.round(this.x), Math.round(this.y) - 25);
    // low-HP heartbeat outline
    if (this.hp > 0 && this.hp / this.maxHp < 0.25 && Math.floor(this.world.time * 3) % 2 === 0) {
      const spr = this.currentSprite();
      drawSprite(r.u, spr, this.x, this.y, { flip: this.flip, tint: 'R3', alpha: 0.35 });
    }
  }

  /** Tick-Dodge's white clock ring, the Counter glint, the Recall hold (GDD2 §4.1, §3.4) */
  private renderVerbMarks(r: Renderer) {
    const u = r.u;
    if (this.tickRingT > 0) {
      const k = this.tickRingT / 0.45;
      const rad = 10 + (1 - k) * 14, cx = this.x, cy = this.y - 8;
      u.globalAlpha = Math.min(1, k * 1.5);
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + (i / 12) * TAU;
        const x = Math.round(cx + Math.cos(a) * rad), y = Math.round(cy + Math.sin(a) * rad * 0.8);
        u.fillStyle = col(i % 3 === 0 ? 'W' : 'K9');
        u.fillRect(x, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
      }
      u.globalAlpha = 1;
    }
    // a loaded Counter: the hand's rim glints white
    if (this.counterT > 0 && this.state === 'alive' && Math.floor(this.world.time * 12) % 3 !== 0) {
      drawSprite(u, outlineOf(this.currentSprite(), 'W', 'solid'), this.x, this.y, { flip: this.flip, alpha: 0.35 + 0.4 * Math.min(1, this.counterT / 0.3) });
    }
    // Recall: holding Fork fills a ring; at 0.4 s every armed echo flies home
    if (this.forkHold > 0.08 && !this.forkUsed && this.mods.recall >= 1) {
      const k = Math.min(1, this.forkHold / RECALL_HOLD), cx = Math.round(this.x), cy = Math.round(this.y) - 8;
      const n = Math.round(16 * k);
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + (i / 16) * TAU;
        u.fillStyle = col(i < n ? 'C4' : 'K3');
        u.fillRect(Math.round(cx + Math.cos(a) * 13), Math.round(cy + Math.sin(a) * 10), 1, 1);
      }
    }
  }

  /** a pale, floating hand with its scarf still in the slot colour */
  private renderGhost(r: Renderer) {
    const spr = this.currentSprite();
    const bob = Math.round(Math.sin(this.world.time * 3) * 1.5) - 2;
    this.scarfB.draw(r.w, undefined, 0.45);
    this.scarfA.draw(r.w, undefined, 0.45);
    drawSprite(r.w, spr, this.x, this.y + bob, { flip: this.flip, tint: 'K8', alpha: 0.4 });
    r.g.globalCompositeOperation = 'lighter';
    drawSprite(r.g, spr, this.x, this.y + bob, { flip: this.flip, tint: this.color, alpha: 0.18 });
    r.g.globalCompositeOperation = 'source-over';
    r.lightAt(this.x, this.y - 8, 26, 'K8', 0.2);
  }

  private renderDead(r: Renderer) {
    // scattered parts handled by death fx; draw collapsed head
    const F = this.frames;
    drawSprite(r.w, F.hurt.down, this.x, this.y + 2, { sy: 0.6, alpha: Math.max(0, 1 - this.deadT * 0.5) });
  }

  /** helper for HUD: player position in view coords */
  viewPos(): [number, number] {
    const v = this.world.cam.view();
    return [clamp(this.x - Math.floor(v.x), 0, VIEW_W), clamp(this.y - Math.floor(v.y), 0, VIEW_H)];
  }
  get colorKey() { return col(this.color); }
}
