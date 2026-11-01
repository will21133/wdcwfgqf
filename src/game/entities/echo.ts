// 残响 Echo 2.0 (GDD2 §3.5, PLAN2 §1.8) — a hand's past, replayed by the same weapon code at its
// echo damage. Made to be read and planned around:
//   · its owner's scarf colour, and in co-op the owner's shape badge over it
//   · armed (◆) after 0.4 s: the dashed rim turns solid, a white ring pulses, a soft "pip"; only an
//     armed echo can set off a Paradox (and it waits until no hand overlaps it before arming)
//   · it stands 0.6 s at the end of its path, glowing and pulsing faster, then breaks
//   · its future path is a 2 px dashed line with a tick every 0.5 s and action beads (blade, », the
//     rapier's gold ★ last thrust) that count down 3·2·1 in the last second; the end is a clock face
//   · replayed attacks turn up to 30° toward the nearest enemy in reach (intent correction)
//   · for its first 0.6 s ordinary enemies within 60 px go after it ("?" over them)
//   · integrity 3: an Eraser's hit or touch chips it; at 0 it bursts into cyan glass
// Kinds: walk (a rewind's), fork (walks to where Fork was pressed and waits there), statue (stands
// at the end of the script and replays its attacks in place for `life` s), bell (walks; rings +1
// resonance on every enemy it passes), dash (a short dash echo; not counted in the hand's cap).
import { Entity, Actor } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { outlineOf } from '../../engine/gfx/outline';
import type { Recording, Frame, RecEvent } from '../systems/rewind';
import type { Weapon, Wielder } from '../weapons/weapon';
import { tickFramesFor } from './player';
import { Scarf } from './scarf';
import { Afterimage } from './fxents';
import { G, sfx } from '../G';
import type { Dir } from '../../art/sprites/tick';
import { frand } from '../../engine/rng';
import { TAU } from '../../engine/math';
import { col } from '../../art/palette';
import type { Player } from './player';
import { SLOT_RAMP, SLOT_COLOR, drawSlotBadge } from '../players';
import { Text } from '../ui/text';
import { rect } from '../ui/draw';
import { termCallout } from '../ui/callouts';
import { Paradox } from '../systems/paradox';
import '../strings/f3';
import { Terms } from '../meta/registry';

const ECHO_RAMP = ['C0', 'C1', 'C2', 'C3', 'C4'];

export type EchoKind = 'walk' | 'statue' | 'bell' | 'fork' | 'dash';
export interface EchoOpts {
  kind?: EchoKind;
  /** playback speed (default mods.echoSpeed) */
  speed?: number;
  /** damage multiplier of the hand's own (default mods.echoDmg) */
  dmgScale?: number;
  /** seconds before it breaks no matter what (statue default 4, dash 1) */
  life?: number;
  /** seconds it stands at the end of its path (default mods.echoStandT; Sentinel: echoSentinelT) */
  standT?: number;
  /** passes over the path (default mods.echoLoops; passes after the first deal 50%) */
  loops?: number;
  gilded?: boolean;
  /** seconds nearby enemies go after it (default mods.echoTauntT) */
  taunt?: number;
  /** hits it takes before it breaks (default mods.echoIntegrity) */
  integrity?: number;
  /** called every tick after it moved (P4/P5 hooks: mines, trails, rings) */
  onStep?: (e: Echo) => void;
}
export interface EchoCue { t: number; x: number; y: number; kind: 'attack' | 'special' | 'dash' | 'last' }

/** every hand's echoes together (GDD2 §3.5) */
export const TEAM_ECHO_CAP = 8;
/** Recall (GDD2 §3.4): flight speed (px/s), line hit radius; it sets off its paradox this close */
export const RECALL_SPEED = 420, RECALL_R = 8, RECALL_ARRIVE = 10;
/** a statue / dash echo's default life (s) */
const STATUE_LIFE = 4, DASH_LIFE = 1;
/** a bell echo rings enemies this close */
const BELL_R = 14;
/** the term lines show for this long after an echo's first sight / arming */
const TERM_T = 2.6;

export class Echo extends Entity implements Wielder {
  isEcho = true;
  /** echoes keep acting in stopped time (the Stillness's time stop: "only echoes move") */
  ignoreFreeze = true;
  /** the hand whose past this is (hits, kills and Sand are credited to it) */
  owner: Player;
  /** F2 name of the owner */
  get player(): Player { return this.owner; }
  kind: EchoKind;
  weapon: Weapon;
  dmgScale: number;
  speed: number;
  /** Perfect Rewind (GDD2 §3.9): +50% damage and a brass outline */
  gilded = false;
  lastSecond = false;
  flip = false;
  dir: Dir = 'down';
  /** playback position (frames into the script) */
  i = 0;
  fired = 0;
  /** ◆: it can set off a Paradox (GDD2 §3.5) */
  armed = false;
  /** seconds since it armed (the ring pulse) */
  armedT = 0;
  /** seconds a paradox it set off keeps it from setting off another (hg_stable keeps the echo) */
  paradoxCd = 0;
  /** hits left (an Eraser's hit or touch costs one) */
  integrity: number;
  integrityMax: number;
  /** > 0 while nearby enemies go after it (GDD2 §3.5; Mina's longer taunt, P5) */
  taunt: number;
  /** how far its taunt reaches (px; world.targetFor; Mina's is 64) */
  tauntR = 60;
  /** seconds it stands at the end */
  standT: number;
  loops: number;
  loop = 0;
  /** seconds before it breaks regardless (Infinity = until its script ends) */
  life: number;
  onStep?: (e: Echo) => void;
  /** contact radius for a paradox (px) */
  contactR: number;
  /** where its path ends (a fork's clock face, a statue's spot) */
  endX: number; endY: number;
  startX: number; startY: number;
  /** 'play' along the script, 'stand' at its end, 'recall' flying back to its owner */
  phase: 'play' | 'stand' | 'recall' = 'play';
  stood = 0;
  /** spawned by a paradox (Mainspring VI) — it never leaves another */
  fromParadox = false;
  /** P1's Midnight tempo, P4's escapements … may read or set this freely */
  tag: Record<string, number> = {};
  private armAt: number;
  private sentinelT = 0;
  private baseDmg: number;
  private frame: Frame;
  private lastAttackTick: number;
  private lastAttack: RecEvent | null;
  private scarf = new Scarf(6, 2.2);
  private trailT = 0;
  private hitFlash = 0;
  private rung: Set<number> | null = null;
  private recallHit: Set<number> | null = null;
  /** echoes standing on (nearly) the same spot are drawn a few px apart, the first with "×N" (D10) */
  stackDx = 0;
  stackN = 1;
  /** where it is drawn (x + its stack offset) */
  get drawX(): number { return this.x + this.stackDx; }

  constructor(owner: Player, public rec: Recording, o: EchoOpts = {}) {
    super();
    const m = owner.mods;
    this.owner = owner;
    this.team = 'player';
    this.kind = o.kind ?? 'walk';
    this.weapon = owner.weapon;
    this.dmgScale = this.baseDmg = o.dmgScale ?? m.echoDmg;
    this.speed = o.speed ?? m.echoSpeed;
    this.loops = Math.max(1, Math.round(o.loops ?? m.echoLoops));
    this.integrity = this.integrityMax = Math.max(1, Math.round(o.integrity ?? m.echoIntegrity));
    this.taunt = o.taunt ?? (this.kind === 'dash' ? 0 : m.echoTauntT);
    const sentinel = m.echoSentinelT > 0 && this.kind !== 'dash';
    this.standT = o.standT ?? (sentinel ? Math.max(m.echoStandT, m.echoSentinelT) : this.kind === 'dash' ? 0.1 : m.echoStandT);
    this.life = o.life ?? (this.kind === 'statue' ? STATUE_LIFE : this.kind === 'dash' ? DASH_LIFE : Infinity);
    this.onStep = o.onStep;
    this.contactR = m.echoContactR;
    this.armAt = m.echoArm;
    if (this.kind === 'bell') this.rung = new Set();
    const fr = rec.frames;
    this.frame = fr[0];
    const last = fr[fr.length - 1];
    this.endX = last.x; this.endY = last.y;
    // a statue stands where the script ends (the hand's feet) and replays its attacks there
    const at = this.kind === 'statue' ? last : fr[0];
    this.x = this.startX = at.x;
    this.y = this.startY = at.y;
    const attacks = rec.events.filter((e) => e.type === 'attack' || e.type === 'special' || e.type === 'heavy' || e.type === 'dashAttack');
    this.lastAttack = attacks.length ? attacks[attacks.length - 1] : null;
    this.lastAttackTick = this.lastAttack ? this.lastAttack.tick : -1;
    this.scarf.ramp = SLOT_RAMP[owner.slot % 4];
    this.scarf.reset(this.x, this.y - 10);
    this.collides = false;
    if (o.gilded) this.gild();
  }

  lunge() {}

  /** a Perfect Rewind's echo: +50% damage, brass outline (once) */
  gild() {
    if (this.gilded || this.dead) return;
    this.gilded = true;
    this.dmgScale *= 1.5;
    this.baseDmg *= 1.5;
    this.world?.fx.ring(this.x, this.y - 8, 2, 20, 0.35, 'B5', 2);
  }

  get progress() { return Math.min(1, this.i / this.rec.frames.length); }
  get isTaunting(): boolean { return this.taunt > 0 && !this.dead; }
  /** 1.0 name: can set off a paradox right now */
  get paradoxReady(): boolean { return this.armed && this.paradoxCd <= 0 && this.phase !== 'recall' && !this.dead; }
  set paradoxReady(v: boolean) { if (!v) this.paradoxCd = Math.max(this.paradoxCd, 1); }
  /** the script's length in seconds of its own time */
  get duration(): number { return this.rec.frames.length / 60 / Math.max(0.05, this.speed); }

  update(dt: number) {
    if (this.dead) return;
    const w = this.world;
    if (this.paradoxCd > 0) this.paradoxCd -= dt;
    if (this.taunt > 0) this.taunt -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.armed) this.armedT += dt;
    if (this.age >= this.life) { this.shatter(); return; }
    const fr = this.rec.frames, n = fr.length;
    if (this.phase === 'recall') { this.flyBack(dt); if (this.dead) return; }
    else if (this.phase === 'play') {
      this.i += dt * 60 * this.speed;
      if (this.kind === 'statue') {
        // replays the attacks on a loop where it stands; the pose follows the script
        if (this.i >= n) { this.i -= n; this.fired = 0; }
        const f = fr[Math.min(n - 1, Math.floor(this.i))];
        this.frame = f;
        this.fireUpTo(Math.floor(this.i));
      } else {
        const fi = Math.floor(this.i);
        // a fast echo may step over the last frames: their events still fire before it stands
        if (fi >= n) { this.fireUpTo(n - 1); this.endPass(); }
        else {
          this.frame = fr[fi];
          this.x = this.frame.x; this.y = this.frame.y;
          this.fireUpTo(fi);
        }
      }
    } else {
      // standing at the end: glowing, pulsing faster and faster; Sentinel repeats its last blow
      this.stood += dt;
      const m = this.owner.mods;
      if (m.echoSentinelT > 0 && this.lastAttack && this.kind !== 'dash') {
        this.sentinelT -= dt;
        if (this.sentinelT <= 0) { this.sentinelT = m.echoSentinelRate; this.fire(this.lastAttack); }
      }
      if (this.stood >= this.standT) { this.shatter(); return; }
    }
    if (this.kind !== 'statue' || this.phase !== 'play') {
      this.dir = this.frame.dir === 0 ? 'down' : this.frame.dir === 1 ? 'up' : 'side';
      this.flip = this.frame.flip;
    } else {
      const last = fr[n - 1];
      this.dir = last.dir === 0 ? 'down' : last.dir === 1 ? 'up' : 'side';
      this.flip = this.frame.flip;
    }
    this.updateArm();
    this.updateStack();
    if (this.rung) this.ringBells();
    // trail
    this.trailT -= dt;
    if (this.trailT <= 0 && this.phase !== 'stand') {
      this.trailT = this.frame.air || this.phase === 'recall' ? 0.02 : 0.08;
      w.add(new Afterimage(this.x, this.y, this.sprite().recolor(ECHO_RAMP), this.flip, 'C2', 0.22, 0.3));
    }
    const fx = this.flip ? -1 : 1;
    const n2 = this.frames().neck[this.dir];
    const prev = fr[Math.max(0, Math.min(n - 1, Math.floor(this.i) - 1))];
    const moving = this.phase === 'play' && this.kind !== 'statue';
    this.scarf.update(this.x + n2.x * fx, this.y + n2.y, moving ? -(this.frame.x - prev.x) * 80 : 0, -20, dt);
    if (frand() < (this.phase === 'stand' ? 0.5 : 0.3)) {
      w.particles.spawn({ kind: 'px', x: this.x + frand(-5, 5), y: this.y - frand(2, 18), vy: frand(-20, -6), life: frand(0.3, 0.6), ramp: ['C4', 'C3', 'C2'], layer: 'glow', size: 1 });
    }
    this.onStep?.(this);
  }

  private F: ReturnType<typeof tickFramesFor> | null = null;
  /** the owner's sprite set (its hand's variant), looked up once */
  private frames() { return (this.F ??= tickFramesFor(this.owner.slot, this.owner.hand)); }

  /** the end of a pass: loop back (later passes at 50%), or stand at the end */
  private endPass() {
    const fr = this.rec.frames;
    if (this.loop + 1 < this.loops) {
      this.loop++;
      this.world.fx.ring(this.x, this.y - 8, 2, 14, 0.25, 'C3', 1);
      this.i = 0; this.fired = 0;
      this.dmgScale = this.baseDmg * 0.5;
      this.frame = fr[0];
      this.x = this.frame.x; this.y = this.frame.y;
      this.world.fx.ring(this.x, this.y - 8, 2, 14, 0.25, 'C3', 1);
      return;
    }
    this.phase = 'stand';
    this.stood = 0;
    this.sentinelT = 0.2;
    const last = fr[fr.length - 1];
    // it stands still in the last pose's facing, idling
    this.frame = { ...last, anim: 0, air: false };
    this.x = last.x; this.y = last.y;
    this.world.fx.ring(this.x, this.y - 2, 2, 12, 0.3, 'C3', 1);
  }

  /** fire the script's events up to frame fi */
  private fireUpTo(fi: number) {
    const evs = this.rec.events;
    while (this.fired < evs.length && evs[this.fired].tick <= fi) this.fire(evs[this.fired++]);
  }
  private fire(e: RecEvent) {
    const w = this.world;
    const isLast = e === this.lastAttack && this.weapon.id === 'rapier';
    this.lastSecond = isLast;
    const a = e.angle !== undefined ? this.weapon.intentAngle(this, e.angle) : 0;
    if (e.type === 'attack') this.weapon.perform(this, e.combo!, a);
    else if (e.type === 'special') this.weapon.performSpecial(this, a, e.charge);
    else if (e.type === 'heavy') this.weapon.performHeavy(this, a, e.charge ?? 1);
    else if (e.type === 'dashAttack') this.weapon.performDashAttack(this, a);
    else if (e.type === 'dash') {
      w.bus.emit('dash', { owner: this as unknown as Actor, dx: e.dx!, dy: e.dy!, echo: true, player: this.owner });
      sfx('dashEcho', { vol: 0.4, pan: w.pan(this.x) });
    }
    this.lastSecond = false;
  }

  /** armed (◆) 0.4 s in — once no hand stands in it (GDD2 §3.5) */
  private updateArm() {
    if (this.armed || this.age < this.armAt || this.phase === 'recall') return;
    for (const p of this.world.players) {
      if (p.state !== 'alive' || p.dead) continue;
      if (Math.hypot(p.x - this.x, p.y - this.y) < this.contactR) return;
    }
    this.armed = true;
    this.armedT = 0;
    const w = this.world;
    w.fx.ring(this.x, this.y - 9, 3, 18, 0.35, 'W', 2);
    sfx('echoArm', { vol: 0.5, pan: w.pan(this.x) });
    w.bus.emit('echoArmed', { echo: this, player: this.owner });
  }

  /**
   * Two echoes on one spot (two Forks from where the hand stood) looked like one, and the chain
   * link between them vanished: each one after the first in a stack is drawn 4 px further out,
   * alternating sides, and the first carries "×N".
   */
  private updateStack() {
    let idx = 0, n = 1;
    for (const p of this.world.players) for (const e of p.echoes) {
      if (e === this || e.dead) continue;
      if (Math.abs(e.x - this.x) > 5 || Math.abs(e.y - this.y) > 5) continue;
      n++;
      if (e.id < this.id) idx++;
    }
    this.stackN = idx === 0 ? n : 1;
    const want = idx === 0 ? 0 : (idx % 2 ? 1 : -1) * 4 * Math.ceil(idx / 2);
    this.stackDx += (want - this.stackDx) * 0.3;
    if (Math.abs(want - this.stackDx) < 0.3) this.stackDx = want;
  }

  /** a bell echo gives +1 resonance to every enemy it walks past (Ling, GDD2 §5.2) */
  private ringBells() {
    const w = this.world;
    for (const e of w.enemies) {
      if (e.dead || this.rung!.has(e.id)) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > BELL_R + e.r) continue;
      this.rung!.add(e.id);
      w.combat.addStatus(e, 'resonance', 1, this);
      w.fx.ring(e.x, e.y - 6, 2, 12, 0.25, 'U4', 1);
    }
  }

  // ───────────────────────── Recall (GDD2 §3.4) ─────────────────────────
  /** drop the script and fly straight back to the owner (armed echoes only); true if it took off */
  recall(): boolean {
    if (!this.armed || this.dead || this.phase === 'recall') return false;
    this.phase = 'recall';
    this.recallHit = new Set();
    this.taunt = 0;
    this.world.fx.ring(this.x, this.y - 8, 2, 16, 0.25, 'C4', 2);
    return true;
  }
  private flyBack(dt: number) {
    const w = this.world, p = this.owner;
    if (p.dead || p.state !== 'alive' || p.world !== w) { this.shatter(); return; }
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = RECALL_SPEED * dt;
    const x0 = this.x, y0 = this.y;
    if (d <= Math.max(RECALL_ARRIVE, step)) { this.x = p.x; this.y = p.y; }
    else { this.x += (dx / d) * step; this.y += (dy / d) * step; }
    this.flip = dx < 0;
    this.frame = { ...this.frame, anim: 2, air: true, x: this.x, y: this.y };
    // a line cut along the flight: 24 × the damage coefficient, through every enemy once
    const m = p.mods;
    for (const e of w.enemies) {
      if (e.dead || this.recallHit!.has(e.id)) continue;
      const vx = this.x - x0, vy = this.y - y0, L2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((e.x - x0) * vx + (e.y - 4 - y0) * vy) / L2));
      const px = x0 + vx * t, py = y0 + vy * t;
      if (Math.hypot(e.x - px, e.y - 4 - py) > RECALL_R + e.r) continue;
      this.recallHit!.add(e.id);
      e.hurt({ amount: m.recallDmg * m.dmg * (this.gilded ? 1.5 : 1), kind: 'melee', owner: this as unknown as Actor, echo: true, x: x0, y: y0, knock: 120, via: 'recall', heavy: true });
    }
    if (Math.hypot(p.x - this.x, p.y - this.y) <= RECALL_ARRIVE) {
      Paradox.trigger({ x: p.x, y: p.y, owner: p, echo: this, kind: 'recall', dmgMul: 0.75 });
      if (!this.dead) this.shatter(null, { paradox: true });
    }
  }

  // ───────────────────────── damage & ending ─────────────────────────
  /** an Eraser's hit or touch (GDD2 §3.5): one integrity less; at 0 it breaks */
  hit(by?: Actor | null, n = 1) {
    if (this.dead) return;
    this.integrity -= n;
    this.hitFlash = 0.12;
    sfx('echoShatter', { vol: 0.35, pan: this.world.pan(this.x) });
    if (this.integrity <= 0) this.shatter(by ?? null);
  }

  /**
   * Break up (PLAN2 §1.8: shatter(by?)). `by` = whatever broke it (an Eraser: a cyan glass burst);
   * nothing = it reached its end; o.paradox = it went off in a paradox (the blast is the effect).
   */
  shatter(by?: Actor | null, o: { paradox?: boolean } = {}) {
    if (this.dead) return;
    const w = this.world;
    const paradox = !!o.paradox, broken = !!by;
    w.fx.burst(this.x, this.y - 8, paradox ? 6 : broken ? 26 : 14, ['C4', 'C3', 'C2', 'C1'], broken ? 140 : 90, 0.5);
    for (let k = 0; k < (broken ? 14 : 8); k++) {
      const a = frand(0, TAU);
      w.particles.spawn({ kind: 'debris', x: this.x, y: this.y - 2, z: frand(4, 16), vx: Math.cos(a) * frand(20, 60), vy: Math.sin(a) * frand(20, 60), vz: frand(30, 80), grav: 300, life: frand(0.4, 0.8), ramp: ['C3', 'C2'], layer: 'glow', size: 1 });
    }
    if (broken) sfx('echoShatter', { vol: 0.7, pan: w.pan(this.x) });
    else if (!paradox) sfx('echoEnd', { vol: 0.5, pan: w.pan(this.x) });
    w.bus.emit('echoEnd', { echo: this, paradox, player: this.owner });
    this.kill();
  }

  /** the next action beads, soonest first (seconds of the echo's own time until each) */
  cues(): EchoCue[] {
    const out: EchoCue[] = [];
    if (this.dead || this.phase !== 'play') return out;
    const fr = this.rec.frames, n = fr.length, sp = 60 * Math.max(0.05, this.speed);
    const statue = this.kind === 'statue';
    for (let k = this.fired; k < this.rec.events.length; k++) {
      const e = this.rec.events[k];
      if (e.type === 'specialRelease') continue;
      const f = fr[Math.max(0, Math.min(n - 1, e.tick))];
      const kind: EchoCue['kind'] = e.type === 'dash' ? 'dash' : e === this.lastAttack && this.weapon.id === 'rapier' ? 'last' : e.type === 'special' || e.type === 'heavy' ? 'special' : 'attack';
      out.push({ t: Math.max(0, (e.tick - this.i) / sp), x: statue ? this.x : f.x, y: statue ? this.y : f.y, kind });
    }
    return out;
  }

  sprite(): Sprite {
    const F = this.frames();
    const f = this.frame;
    switch (f.anim) {
      case 1: return F.run[this.dir][Math.floor(f.animT * 12) % 6];
      case 2: return F.dash[this.dir];
      case 3: return F.hurt[this.dir];
      default: return F.idle[this.dir][Math.floor((this.phase === 'stand' ? this.age : f.animT) * 4) % 4];
    }
  }

  renderGround(r: Renderer) {
    const ctx = r.g;
    const standK = this.phase === 'stand' ? Math.min(1, this.stood / Math.max(0.05, this.standT)) : 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(47,166,217,${(0.25 + standK * 0.2).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), 7, 3, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // standing: a ring of light under it that beats faster as it runs out
    if (this.phase === 'stand') {
      const beat = Math.sin(this.stood * (10 + standK * 30));
      const u = r.u;
      u.globalAlpha = 0.45 + 0.35 * beat;
      u.strokeStyle = col('C3');
      u.lineWidth = 1;
      u.beginPath(); u.ellipse(Math.round(this.x) + 0.5, Math.round(this.y) + 0.5, 9, 4, 0, 0, TAU); u.stroke();
      u.globalAlpha = 1;
    }
  }

  render(r: Renderer) {
    const spr = this.sprite();
    const body = spr.recolor(ECHO_RAMP);
    const x0 = this.x;
    this.x = this.drawX;
    const fade = this.phase === 'stand' ? 1 - Math.max(0, this.stood / Math.max(0.05, this.standT) - 0.8) / 0.2 : 1;
    const standK = this.phase === 'stand' ? this.stood / Math.max(0.05, this.standT) : 0;
    const a = (0.72 + Math.sin(this.age * (20 + standK * 30)) * 0.08) * fade;
    const f = this.frame;
    const F = this.frames();
    const hand = F.hand[this.dir];
    const fx = this.flip ? -1 : 1;
    const pose = { angle: f.wa, ext: f.we, vis: f.wv };
    const behind = Math.sin(pose.angle) < -0.35 || this.dir === 'up';
    // the owner's scarf colour (GDD2 §3.5)
    this.scarf.draw(r.w, undefined, a * 0.85);
    if (behind) this.weapon.drawHeld(r, this.x + hand.x * fx, this.y + hand.y, pose, 'C3', a);
    drawSprite(r.w, body, this.x, this.y, { flip: this.flip, alpha: a, tint: this.hitFlash > 0 ? '#ffffff' : undefined });
    if (!behind) this.weapon.drawHeld(r, this.x + hand.x * fx, this.y + hand.y, pose, 'C3', a);
    // rim: dashed until armed, then solid and pulsing (GDD2 §3.5); a Perfect Rewind's echo has a
    // brass rim on the unlit layer, bright enough to read in any light (D12)
    const pulse = this.armed ? 0.7 + 0.3 * Math.sin(this.armedT * (8 + standK * 24)) : 0.55;
    const rimC = this.gilded ? 'B5' : this.armed ? 'C4' : 'C2';
    drawSprite(r.u, outlineOf(spr, rimC, this.armed || this.gilded ? 'solid' : 'dash'), this.x, this.y, { flip: this.flip, alpha: (this.gilded ? Math.max(0.85, pulse) : pulse) * fade });
    if (this.gilded && Math.floor(this.age * 6) % 3 === 0) { r.u.fillStyle = col('B6'); r.u.fillRect(Math.round(this.x) + (Math.floor(this.age * 6) % 2 ? 3 : -4), Math.round(this.y) - 18, 1, 1); }
    // additive ghost glow
    r.g.globalCompositeOperation = 'lighter';
    drawSprite(r.g, body, this.x, this.y, { flip: this.flip, alpha: (0.28 + standK * 0.2) * fade });
    r.g.globalCompositeOperation = 'source-over';
    r.lightAt(this.x, this.y - 8, 46, 'C2', (0.45 + standK * 0.25) * fade);
    this.x = x0;
  }

  renderUnlit(r: Renderer) {
    const w = this.world;
    const u = r.u;
    const coop = w.playerCount > 1;
    const x = Math.round(this.drawX), top = Math.round(this.y) - 25;
    // co-op: the owner's shape badge over it, where a hand's own sits
    if (coop) drawSlotBadge(u, this.owner.slot, x, top);
    // ◆ (armed): a spinning diamond over its head
    if (this.armed) {
      diamond(u, x, coop ? top - 8 : top - 2, this.armedT, this.paradoxCd > 0);
      r.glowAt(x, (coop ? top - 8 : top - 2), 8, 'C3', 0.35);
    }
    // a stack of echoes on one spot says how many
    if (this.stackN > 1) {
      const n = `×${this.stackN}`, bx = x + 6, by = coop ? top - 8 : top - 2;
      r.worldUi((ctx, toUi) => { const q = toUi(bx, by); G.digits.draw(ctx, n.slice(1), q.x + 4, q.y - 4.5 * Text.k, { fill: 'C4', outline: 'K0' }); ctx.fillStyle = col('C4'); ctx.fillRect(Math.round(q.x), Math.round(q.y) - 1, 1, 1); ctx.fillRect(Math.round(q.x) + 2, Math.round(q.y) - 1, 1, 1); ctx.fillRect(Math.round(q.x) + 1, Math.round(q.y), 1, 1); ctx.fillRect(Math.round(q.x), Math.round(q.y) + 1, 1, 1); ctx.fillRect(Math.round(q.x) + 2, Math.round(q.y) + 1, 1, 1); });
    }
    // integrity pips once it has been chipped
    if (this.integrity < this.integrityMax) {
      for (let k = 0; k < this.integrityMax; k++) rect(u, x - this.integrityMax * 2 + k * 4 + 1, top + 4, 2, 1, k < this.integrity ? 'C4' : 'K3');
    }
    // "?" over every ordinary enemy it is drawing off (GDD2 §3.5 taunt)
    if (this.taunt > 0) for (const e of w.enemies) {
      if (e.dead || w.lockedTarget(e) !== (this as unknown as Actor)) continue;
      const qx = Math.round(e.x), qy = Math.round(e.y - e.height - 12 + Math.sin(w.time * 9 + e.id) * 1.2);
      rect(u, qx - 3, qy - 4, 7, 9, 'K0');
      rect(u, qx - 2, qy - 3, 5, 7, 'K10');
      // a pixel "?" in cyan
      rect(u, qx - 1, qy - 2, 3, 1, 'C2'); rect(u, qx + 1, qy - 1, 1, 1, 'C2'); rect(u, qx, qy, 1, 1, 'C2'); rect(u, qx, qy + 2, 1, 1, 'C2');
    }
    this.renderTerms(r);
  }

  /**
   * first sight (GDD2 §9.8): "残响 – 过去的你 · 会重复你做过的动作" (a Fork's: "分岔 – 原地留下一个
   * 残响"), then "就绪 ◆ – …" once armed. Placed beside it by ui/callouts.ts, one at a time.
   */
  private renderTerms(r: Renderer) {
    const id = this.armed && this.armedT < TERM_T ? 'armed' : !this.armed && this.age < TERM_T ? (this.kind === 'fork' && Terms.showPlain('fork') ? 'fork' : 'echo') : null;
    // a Fork is something the player just did: it may cut in on an older line (prio 5)
    if (id) termCallout(r, this.world, id, this.drawX, this.y - 11, { prio: id === 'echo' ? 4 : 5, hw: 8, hh: 14 });
  }

  /**
   * Its future (GDD2 §3.5): a 2 px dashed C3 line from here to the end with a tick every 0.5 s,
   * the action beads (counting down 3·2·1 in their last second) and a clock face at the end.
   * `dim`: someone else's echo in co-op (40%, only its imminent beads).
   */
  renderPath(r: Renderer, dim = false) {
    if (this.dead || this.phase === 'recall') return;
    const fr = this.rec.frames, n = fr.length;
    const u = r.u;
    const statue = this.kind === 'statue';
    const pathA = dim ? 0.4 : 0.85;
    if (!statue && this.phase === 'play') {
      const start = Math.max(0, Math.floor(this.i));
      const c = dim ? SLOT_COLOR[this.owner.slot % 4] : 'C3';
      u.fillStyle = col(c);
      for (let k = start + 3; k < n; k++) {
        // 4 frames on, 2 off: a dashed line; it fades toward the far end
        if ((k % 6) >= 4) continue;
        const f = fr[k];
        u.globalAlpha = pathA * (0.55 + 0.45 * (1 - (k - start) / n));
        u.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 2, 2);
      }
      // a tick every 0.5 s of its own time
      u.fillStyle = col('C4');
      const step = Math.max(1, Math.round(30 * this.speed));
      for (let k = Math.ceil((start + 1) / step) * step; k < n; k += step) {
        const f = fr[k];
        u.globalAlpha = pathA;
        u.fillRect(Math.round(f.x) - 2, Math.round(f.y) - 1, 4, 1);
        u.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 2, 2, 3);
      }
      u.globalAlpha = 1;
      // the end: a little clock face where it will stand (a fork's: where Fork was pressed)
      clockFace(u, this.endX, this.endY, this.kind === 'fork' ? 1 : pathA, this.world.time);
    }
    // action beads; in their last second a cyan ring closes in on them (a countdown without digits,
    // which read as damage numbers next to the real ones; clarity S2.11)
    const cues = this.cues();
    for (const c of cues) {
      const soon = c.t <= 1;
      if (dim && !soon) continue;
      u.globalAlpha = soon ? 1 : 0.75 * pathA;
      cueBead(u, c.x, c.y - 6, c.kind);
      if (soon) closingRing(u, c.x, c.y - 6, 5 + 5 * c.t, c.kind === 'last' || c.kind === 'special' ? 'B5' : 'C3');
    }
    u.globalAlpha = 1;
  }
}

/** ◆ spinning: 7 px tall, its width runs 7 → 5 → 3 → 1 → 3 → 5 (a coin turning); hollow while a
 * stable echo recharges (hg_stable) */
const DIAMOND_W = [3, 2, 1, 0, 1, 2];
function diamond(u: CanvasRenderingContext2D, x: number, y: number, t: number, cooling: boolean) {
  const h = DIAMOND_W[Math.floor(t * 9) % DIAMOND_W.length];
  const bob = Math.round(Math.sin(t * 4) * 1);
  y += bob;
  for (let k = -3; k <= 3; k++) {
    const half = Math.min(h, 3 - Math.abs(k));
    rect(u, x - half - 1, y + k - 1, half * 2 + 3, 3, 'K0');
  }
  for (let k = -3; k <= 3; k++) {
    const half = Math.min(h, 3 - Math.abs(k));
    if (cooling && Math.abs(k) < 3 && half > 0) { rect(u, x - half, y + k, 1, 1, 'C3'); rect(u, x + half, y + k, 1, 1, 'C3'); continue; }
    // lit facet (top-left) white, the rest cyan
    rect(u, x - half, y + k, half * 2 + 1, 1, k < 0 ? 'K10' : k === 0 ? 'C4' : 'C3');
    if (k < 0 && half > 0) rect(u, x + half, y + k, 1, 1, 'C4');
  }
}

/** a 1 px ring of radius `rad` round a bead (with a dark under-pixel) */
function closingRing(u: CanvasRenderingContext2D, x: number, y: number, rad: number, c: string) {
  x = Math.round(x); y = Math.round(y);
  const n = Math.max(12, Math.round(rad * 4));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const px = Math.round(x + Math.cos(a) * rad), py = Math.round(y + Math.sin(a) * rad);
    u.fillStyle = col('K0'); u.fillRect(px, py + 1, 1, 1);
    u.fillStyle = col(c); u.fillRect(px, py, 1, 1);
  }
}

/** 7×7 clock face (end of an echo's path) with a hand ticking around */
function clockFace(u: CanvasRenderingContext2D, x: number, y: number, a: number, time: number) {
  x = Math.round(x); y = Math.round(y);
  u.globalAlpha = a;
  rect(u, x - 3, y - 4, 7, 1, 'K0'); rect(u, x - 3, y + 2, 7, 1, 'K0'); rect(u, x - 4, y - 3, 1, 5, 'K0'); rect(u, x + 4, y - 3, 1, 5, 'K0');
  rect(u, x - 2, y - 3, 5, 5, 'C1');
  rect(u, x - 2, y - 4, 5, 1, 'C3'); rect(u, x - 2, y + 2, 5, 1, 'C3'); rect(u, x - 3, y - 3, 1, 5, 'C3'); rect(u, x + 3, y - 3, 1, 5, 'C3');
  // the hand: 8 positions around the centre
  const k = Math.floor(time * 4) % 8;
  const hx = [0, 1, 1, 1, 0, -1, -1, -1][k], hy = [-1, -1, 0, 1, 1, 1, 0, -1][k];
  rect(u, x, y - 1, 1, 1, 'K10'); rect(u, x + hx, y - 1 + hy, 1, 1, 'K10');
  if (Math.abs(hx) + Math.abs(hy) === 1) rect(u, x + hx * 2, y - 1 + hy * 2, 1, 1, 'C4');
  u.globalAlpha = 1;
}

/** an action bead (GDD2 §3.5): a blade for attacks, » for dashes, a star for specials, a gold ★ for the rapier's last thrust */
export function cueBead(u: CanvasRenderingContext2D, x: number, y: number, kind: EchoCue['kind'] | 'attack' | 'special' | 'dash' | string) {
  x = Math.round(x); y = Math.round(y);
  rect(u, x - 3, y - 3, 7, 7, 'K0');
  const c = kind === 'last' ? 'B5' : kind === 'special' ? 'B5' : 'C4';
  u.fillStyle = col(c);
  if (kind === 'dash') {
    for (const ox of [-2, 1]) { u.fillRect(x + ox, y - 2, 1, 1); u.fillRect(x + ox + 1, y - 1, 1, 1); u.fillRect(x + ox + 2, y, 1, 1); u.fillRect(x + ox + 1, y + 1, 1, 1); u.fillRect(x + ox, y + 2, 1, 1); }
  } else if (kind === 'last') {
    // ★
    u.fillRect(x, y - 2, 1, 1); u.fillRect(x - 2, y - 1, 5, 1); u.fillRect(x - 1, y, 3, 1); u.fillRect(x - 1, y + 1, 1, 1); u.fillRect(x + 1, y + 1, 1, 1); u.fillRect(x - 2, y + 2, 1, 1); u.fillRect(x + 2, y + 2, 1, 1);
    u.fillStyle = col('B6'); u.fillRect(x, y - 1, 1, 1);
  } else if (kind === 'special') {
    u.fillRect(x, y - 2, 1, 5); u.fillRect(x - 2, y, 5, 1); u.fillRect(x - 1, y - 1, 3, 3);
  } else {
    // a little blade, tip up-right
    u.fillRect(x + 2, y - 2, 1, 1); u.fillRect(x + 1, y - 1, 1, 1); u.fillRect(x, y, 1, 1); u.fillRect(x - 1, y + 1, 1, 1);
    u.fillRect(x - 2, y, 1, 1); u.fillRect(x, y + 2, 1, 1);
  }
}
