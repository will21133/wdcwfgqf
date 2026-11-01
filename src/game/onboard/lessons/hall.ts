// The Rehearsal Hall's lesson machinery (ONBOARD2 §8.4–§8.8): the practice props the advanced and
// Hall lessons stand up (dummies that punch / punch slowly / spit violet, the bell jar, the falling
// gear, the duet bells, the floor marks), the ★ trials (the GDD2 §9.5 eight and the rest), the
// co-op lessons (duet, pull back, tandem) and the Hall's stage host.
//
// Lessons run on F4a's LessonRunner (Lessons.start) with F4a's SoftHost when those are in the build.
// Until they are (this branch was cut from the interface day, where Lessons.start is a stub that
// ends at once and SoftHost is only an interface), the Hall runs a lesson's TRY steps itself with
// HallRunner below — intro, the lesson's loop on the curtain as its demo, the steps, fail beats,
// success — so the Hall is complete and testable either way. Once F4a's runner is present it is
// always preferred (it adds the demo puppet, help levels and "watch again").
import type { Player } from '../../entities/player';
import type { World } from '../../world/world';
import type { Entity } from '../../entities/entity';
import type { Renderer } from '../../../engine/gfx/renderer';
import type { DamageInfo } from '../../systems/combat';
import type { BusEvents } from '../../systems/bus';
import type { L10n } from '../../i18n';
import type { LessonDef, LessonRun, LessonCtx, LessonEvent, LessonPhase, Where, LessonId } from '../lesson';
import type { StageHost } from '../host';
import { G, sfx } from '../../G';
import { S } from '../../strings';
import { tr } from '../../i18n';
import { Enemy } from '../../entities/enemy';
import { Entity as EntityCls } from '../../entities/entity';
import { Bullet } from '../../entities/projectile';
import { drawSprite } from '../../../engine/gfx/sprite';
import { col } from '../../../art/palette';
import { ownerPlayer } from '../../players';
import { Flags, Teach, unlock } from '../../meta/registry';
import { profile, saveProfile } from '../../save';
import { Notices } from '../../ui/notices';
import { dummySprite, bellJar, jarBase, jarShards, duetBells, smallGear, type DummyPose } from '../../../art/sprites/hall';
import { Onboard, Tut } from '../core';
import { Gates } from '../gates';
import { Stage, type SayOpts } from '../stage';
import { Beat } from '../beat';
import { Lessons } from '../lesson';
import * as HostMod from '../host';
import { Callouts } from '../../ui/callouts';
import { RewindHudHooks } from '../../ui/rewindHud';
import '../../strings/coach';

const C = (k: string): L10n => S('coach', k);
const O = (k: string): L10n => S('onboard', k);

// ───────────────────────── props ─────────────────────────
/**
 * may a prop go for this hand now? Not while its lesson is still introducing / demonstrating (the
 * props stand still until "your turn"); always outside lessons (the dummy yard) and in ★ trials
 */
function rehearsing(p: Player): boolean {
  const r = Lessons.active(p) ?? runs.find((x) => x.p === p) ?? null;
  return !r || r.phase === 'try' || r.phase === 'fail';
}
/** a lesson prop: only its owner's hits count (co-op lessons), removed without effects on reset */
export interface HallProp { lessonProp: true; owner: Player | null }
export const isHallProp = (e: Entity): e is Entity & HallProp => (e as unknown as HallProp).lessonProp === true;
function ownsHit(owner: Player | null, info: DamageInfo): boolean {
  if (!owner) return true;
  return ownerPlayer(info.owner) === owner || info.player === owner;
}

export type DummyMode = 'idle' | 'punch' | 'slowPunch' | 'violet';
/**
 * A practice dummy: wood and brass, never moves. idle takes hits; punch winds up 0.5 s (red fan)
 * and punches for 8 (undoable); slowPunch winds up 1.2 s, its last 0.18 s flashing white (the
 * Tick-Dodge / Perfect Rewind moment), then hits for 10; violet spits a slow violet bolt (6, fixed).
 * heals: back to full 1 s after the last hit. Never counts for a room's clear.
 */
export class HallDummy extends Enemy implements HallProp {
  lessonProp = true as const;
  owner: Player | null = null;
  heals = true;
  /** seconds between attacks (punch / violet), and the first one */
  every = 2.5;
  cd = 1.5;
  punchDmg = 8;
  private sinceHit = 9;
  constructor(x: number, y: number, public mode: DummyMode = 'idle', hp = 9999) {
    super(x, y, hp);
    this.r = 6; this.height = 22; this.mass = 999; this.kind = 'dummy'; this.codexId = '';
    this.brass = [0, 0];
    (this as unknown as { ignoreClear: boolean }).ignoreClear = true;
    this.debris = ['B3', 'K6', 'B2'];
    this.spawnT = 0.3;
  }
  hurt(info: DamageInfo): number {
    if (!ownsHit(this.owner, info)) return 0;
    this.sinceHit = 0;
    return super.hurt(info);
  }
  think(dt: number) {
    this.sinceHit += dt;
    if (this.heals && this.sinceHit > 1 && this.hp < this.maxHp) this.hp = this.maxHp;
    const t = this.target;
    if (!t || this.mode === 'idle' || !rehearsing(t as Player)) { if (this.state === 'idle') return; this.setStateIfNot('idle'); return; }
    this.faceTarget();
    const d = this.distT();
    switch (this.state) {
      case 'idle':
        this.cd -= dt;
        if (this.mode === 'violet') { if (this.cd <= 0 && d < 200) { this.cd = this.every; this.windup('aim', 0.5); } break; }
        // punch: when the hand stands close (or every few seconds while it lingers within reach)
        if (d < 40 && this.cd <= 0) { this.cd = this.every; this.windup('wind', this.mode === 'slowPunch' ? 1.2 : 0.5); }
        break;
      case 'wind':
        if (this.stateT >= (this.mode === 'slowPunch' ? 1.2 : 0.5)) {
          this.setState('punch');
          this.attacking = true;
          const a = this.angT();
          this.world.combat.add({ shape: { t: 'arc', x: this.x, y: this.y - 8, r: 36, a, w: 0.9 }, team: 'enemy', life: 3, info: { amount: this.mode === 'slowPunch' ? 10 : this.punchDmg, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 120 } });
          sfx('sentryThrust', { pan: this.world.pan(this.x) });
        }
        break;
      case 'aim':
        if (this.stateT >= 0.5) {
          this.setState('punch');
          this.world.add(new Bullet({ team: 'enemy', x: this.x, y: this.y - 12, ang: this.angT(), speed: 90, dmg: 6, fixed: true, owner: this, style: 'orb' }));
          sfx('spit', { vol: 0.6, pan: this.world.pan(this.x) });
        }
        break;
      case 'punch':
        if (this.stateT > 0.35) this.setState('idle');
        break;
    }
  }
  private setStateIfNot(s: string) { if (this.state !== s) this.setState(s); }
  renderTelegraph(r: Renderer) {
    if (this.state === 'wind') this.teleCone(r, this.x, this.y, this.angT(), 36, 0.9, this.windupK);
  }
  render(r: Renderer) {
    const pose: DummyPose = this.state === 'wind' || this.state === 'aim' ? 'wind' : this.state === 'punch' ? 'punch' : this.flash > 0 ? 'hit' : 'idle';
    this.drawBody(r, dummySprite(pose), { flip: this.flip });
  }
}

/** the bell jar: only a Paradox blast breaks it (a plain hit just rings); a brass key / coin inside */
export class BellJarProp extends Enemy implements HallProp {
  lessonProp = true as const;
  owner: Player | null = null;
  broken = false;
  private brokeT = 0;
  constructor(x: number, y: number) {
    super(x, y, 1);
    this.r = 8; this.height = 16; this.mass = 999; this.kind = 'jar'; this.codexId = '';
    this.brass = [0, 0];
    (this as unknown as { ignoreClear: boolean }).ignoreClear = true;
    this.spawnT = 0.3;
  }
  hurt(info: DamageInfo): number {
    if (this.broken || !ownsHit(this.owner, info)) return 0;
    if (info.kind !== 'paradox') { this.flash = 0.1; sfx('clank', { vol: 0.5, pan: this.world.pan(this.x) }); return 0; }
    this.broken = true;
    this.flash = 0.1;
    sfx('echoShatter', { vol: 0.8, pan: this.world.pan(this.x) });
    this.world.fx.burst(this.x, this.y - 10, 18, ['K10', 'K9', 'K8'], 120, 0.5);
    this.world.bus.emit('custom', { id: 'propBroken', player: ownerPlayer(info.owner) ?? undefined, data: { prop: 'jar' } });
    return 1;
  }
  think(dt: number) { if (this.broken) { this.brokeT += dt; if (this.brokeT > 3) this.dead = true; } }
  render(r: Renderer) {
    if (!this.broken) { this.drawBody(r, bellJar()); return; }
    drawSprite(r.w, jarBase(), this.x, this.y);
    const S = jarShards(), k = Math.min(1, this.brokeT / 0.6);
    for (let i = 0; i < 6; i++) { const a = -Math.PI * (0.15 + (i / 5) * 0.7), d = 4 + k * 12; drawSprite(r.w, S[i % 3], this.x + Math.cos(a) * d, this.y - 2 + Math.sin(a) * d * 0.3 + k * 2); }
  }
}

/** the duet bells: a target that "rings" (two-tone) on a Sync, otherwise just takes hits */
export class DuetBellProp extends HallDummy {
  rang = 0;
  constructor(x: number, y: number) { super(x, y, 'idle'); this.kind = 'bells'; }
  render(r: Renderer) {
    const shake = this.rang > 0 ? Math.round(Math.sin(this.rang * 60)) : 0;
    drawSprite(r.w, duetBells(), this.x + shake, this.y, { tint: this.flash > 0 ? '#ffffff' : undefined });
  }
  think(dt: number) { super.think(dt); if (this.rang > 0) this.rang = Math.max(0, this.rang - dt); }
}

/** a falling brass gear: a shadow grows at its spot for `warn` s, then it lands (8 undoable damage) */
export class FallingGearProp extends Enemy implements HallProp {
  lessonProp = true as const;
  owner: Player | null = null;
  t = 0;
  constructor(x: number, y: number, public warn = 0.8, public dmg = 8) {
    super(x, y, 1);
    this.r = 0; this.solid = false; this.collides = false; this.kind = 'gear'; this.codexId = '';
    (this as unknown as { ignoreClear: boolean }).ignoreClear = true;
    this.spawnT = 0;
    this.invuln = 99;
  }
  hurt(): number { return 0; }
  think(dt: number) {
    this.t += dt;
    if (this.t >= this.warn && this.state !== 'fell') {
      this.setState('fell');
      this.world.combat.add({ shape: { t: 'circle', x: this.x, y: this.y, r: 12 }, team: 'enemy', life: 2, info: { amount: this.dmg, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 0 } });
      this.world.fx.dust(this.x, this.y, 8);
      sfx('clank', { pan: this.world.pan(this.x) });
      this.world.shake(0.2);
    }
    if (this.t > this.warn + 0.6) this.dead = true;
  }
  renderGround(r: Renderer) {
    const k = Math.min(1, this.t / this.warn);
    if (this.t >= this.warn) return;
    const u = r.w;
    u.globalAlpha = 0.4;
    u.fillStyle = col('K0');
    u.beginPath(); u.ellipse(Math.round(this.x), Math.round(this.y), 4 + 10 * k, 2 + 4 * k, 0, 0, Math.PI * 2); u.fill();
    u.globalAlpha = 1;
  }
  render(r: Renderer) {
    if (this.t >= this.warn) return;
    const k = Math.min(1, this.t / this.warn);
    drawSprite(r.w, smallGear()[Math.floor(this.t * 12) % 4], this.x, this.y - 60 * (1 - k));
  }
}

/**
 * holds a gate layer for as long as a lesson's props stand (host.dispose / reset remove it): the
 * Culprit lessons show the Culprit marks whatever runner runs them
 */
export class GateHolder extends EntityCls {
  private un: (() => void) | null;
  constructor(layer: Parameters<typeof Gates.push>[0]) { super(); this.collides = false; this.un = Gates.push(layer); }
  update() {}
  render() {}
  removed() { this.un?.(); this.un = null; }
}

/** a faint floor ring (where to leave an echo) */
export class FloorMark extends Enemy implements HallProp {
  lessonProp = true as const;
  owner: Player | null = null;
  constructor(x: number, y: number, public rr = 10) {
    super(x, y, 1);
    this.solid = false; this.collides = false; this.r = 0; this.kind = 'mark'; this.codexId = '';
    (this as unknown as { ignoreClear: boolean }).ignoreClear = true;
    this.spawnT = 0; this.invuln = 99;
  }
  hurt(): number { return 0; }
  think() {}
  renderGround(r: Renderer) {
    const u = r.w;
    u.globalAlpha = 0.45 + 0.2 * Math.sin(this.world.time * 4);
    u.strokeStyle = col('C2');
    u.lineWidth = 1;
    u.beginPath(); u.ellipse(Math.round(this.x) + 0.5, Math.round(this.y) + 0.5, this.rr, this.rr * 0.45, 0, 0, Math.PI * 2); u.stroke();
    u.globalAlpha = 1;
  }
  render() {}
}

// ───────────────────────── the Hall's stage host ─────────────────────────
/** a lesson's layout callback (F4a's runner installs one on SoftHost; HallRunner on HallHost) */
interface Layout { layout(w: World, p: Player): void }
export class HallHost implements StageHost {
  readonly kind = 'soft' as const;
  readonly owner = {};
  layout: Layout | null = null;
  props: Entity[] = [];
  snap: { hp: number; sand: number };
  readonly startSand: number;
  private wipeT = -1;
  constructor(private w: World, readonly p: Player) { this.snap = { hp: p.hp, sand: p.lo.sand }; this.startSand = p.lo.sand; }
  world(): World { return this.w; }
  track<T extends Entity>(e: T): T { this.props.push(e); return e; }
  snapshot(): void { this.snap = { hp: this.p.hp, sand: this.p.lo.sand }; }
  clear(): void {
    const w = this.w, p = this.p;
    w.cancelTimers(this.owner);
    for (const e of this.props) if (!e.dead) e.dead = true;
    this.props = [];
    for (const e of p.echoes) if (!e.dead) e.kill();
    p.echoes = [];
    for (const e of w.entities) if (e instanceof Bullet && e.team === 'enemy' && !e.dead) e.dead = true;
  }
  reset(then: () => void): void {
    this.wipeT = 0;
    sfx('filmWipe');
    const p = this.p;
    this.clear();
    if (p.state === 'alive') p.hp = Math.max(p.hp, this.snap.hp);
    p.lo.sand = Math.max(0, Math.min(p.lo.sandMax, this.snap.sand));
    p.rec.clear();
    p.rec.prefill(p.x, p.y, p.rec.capacity, { hp: Math.max(1, p.hp), fixed: p.fixedTaken, tempo: p.lo.tempo });
    this.layout?.layout(this.w, p);
    this.w.after(0.4, () => { this.wipeT = -1; then(); }, this.owner);
  }
  dispose(): void { this.clear(); this.w.bus.off(this.owner); }
  wipe(): number | null { return this.wipeT >= 0 ? 0.5 : null; }
}
/** F4a's SoftHost when the build has it (its runner lays the stage out through it), else the Hall's own */
export function makeHost(w: World, p: Player): StageHost {
  const SH = (HostMod as unknown as Record<string, unknown>).SoftHost as (new (w: World, p: Player) => StageHost) | undefined;
  return SH ? new SH(w, p) : new HallHost(w, p);
}
/** does the build carry F4a's real lesson runner? (the interface-day stub has no Lessons.runner) */
export const realRunner = () => typeof (Lessons as unknown as { runner?: unknown }).runner === 'function';

// ───────────────────────── HallRunner (the Hall's own TRY machine; see the header) ─────────────────────────
const EVENTS: (keyof BusEvents)[] = ['hit', 'kill', 'damaged', 'attack', 'dash', 'dashEnd', 'rewind', 'fork', 'echoSpawn', 'echoArmed', 'echoEnd', 'paradox', 'sync', 'culprit', 'perfectRewind', 'tickDodge', 'downed', 'revived', 'custom'];
const runs: HallRunner[] = [];
export class HallRunner implements LessonRun {
  phase: LessonPhase = 'intro';
  step = 0;
  attempts: Record<string, number> = {};
  fails: string[] = [];
  help: 0 | 1 | 2 | 3 = 0;
  demoPlays = 0;
  t = 0;
  ended = false;
  private stepT = 0;
  private phaseT = 0;
  private ungate: (() => void) | null = null;
  readonly ctx: LessonCtx;
  private origin = { x: 0, y: 0, face: 1 as 1 | -1 };
  private vars: Record<string, unknown> = {};
  private onEnd: ((how: string) => void) | null = null;
  constructor(readonly def: LessonDef, readonly p: Player, readonly where: Where, readonly host: StageHost, onEnd?: (how: string) => void) {
    this.onEnd = onEnd ?? null;
    const self = this;
    this.ctx = {
      get p() { return self.p; }, get run() { return self; }, get host() { return self.host; }, get where() { return self.where; },
      get w() { return self.host.world(); }, get step() { return self.step; }, get attempt() { return self.attempts[self.stepKey ?? ''] ?? 1; },
      get help() { return self.help; }, get t() { return self.stepT; }, get origin() { return self.origin; },
      at: (dx: number, dy: number) => ({ x: Math.round(self.origin.x + dx * self.origin.face), y: Math.round(self.origin.y + dy) }),
      spawn: <T extends Entity>(e: T): T => { const w = self.host.world(); w.add(e); self.host.track(e); if (isHallProp(e) && w.playerCount > 1) e.owner = self.p; return e; },
      get vars() { return self.vars; }, set vars(v) { self.vars = v; },
    } as LessonCtx;
    const v = def.verbs;
    this.ungate = Gates.push({ name: 'hall:' + def.id, p, tapOnly: v?.scrub ? () => false : undefined, forkAllow: v?.fork ? () => true : undefined, shows: def.id === 'culprit' || def.id === 'grandfather' ? () => true : undefined });
    if (host instanceof HallHost) host.layout = { layout: (w, q) => this.layout(w, q) };
    Onboard.coach.quiet(p.slot, true);
    const w = host.world();
    for (const k of EVENTS) w.bus.on(k, ((e: unknown) => this.event({ type: k, e } as LessonEvent)) as never, host.owner);
    runs.push(this);
    Tut.log('lessonStart', { lesson: def.id, where, slot: p.slot, runner: 'hall' });
    this.layout(w, p);
    if (def.intro) this.say({ key: 'lesson.intro', text: def.intro.lines.map((l) => tr(l)).join('\n'), tier: 'A', dur: def.intro.dur, speaker: 'ines' });
  }
  get id(): LessonId { return this.def.id; }
  get stepKey(): string | null { return this.def.steps[this.step]?.key ?? null; }
  private say(o: SayOpts) { return Stage.say({ slot: this.p.slot, who: this.p.input, ...o }); }
  layout(w: World, p: Player) {
    this.vars = {};
    this.origin = { x: Math.round(p.x), y: Math.round(p.y), face: 1 };
    this.def.props(this.ctx);
    void w;
  }
  private enterStep(i: number) {
    this.step = i;
    this.stepT = 0;
    const st = this.def.steps[i];
    if (!st) return;
    this.attempts[st.key] = (this.attempts[st.key] ?? 0) + 1;
    (this.host as HallHost).snapshot?.();
    const k = i;
    this.say({ key: 'lesson.step', text: O(st.key), tier: 'A', dur: Infinity, until: () => this.step !== k || this.phase !== 'try' || this.ended });
    Tut.log('step', { lesson: this.id, step: st.key, attempt: this.attempts[st.key] });
  }
  update(dt: number) {
    if (this.ended) return;
    this.t += dt; this.phaseT += dt;
    const introT = this.def.intro?.dur ?? 1.2;
    if (this.phase === 'intro' && this.phaseT >= introT) {
      this.phase = 'demo'; this.phaseT = 0;
      // in the Hall the curtain plays the lesson's loop (its demo); elsewhere straight to "your turn"
      if (this.where === 'hall') { this.demoPlays++; Tut.log('demoStart', { lesson: this.id }); this.say({ key: 'lesson.watch', text: L2('看幕布上的示范。', 'Watch the curtain.'), tier: 'B', dur: 2.6, speaker: 'ines' }); }
      else this.phaseT = 2.6;
    }
    if (this.phase === 'demo' && this.phaseT >= 2.6) { this.phase = 'try'; this.phaseT = 0; Tut.log('demoEnd', { lesson: this.id }); this.say({ key: 'lesson.turn', text: O('yourTurn'), tier: 'B', dur: 1.2 }); this.enterStep(0); }
    if (this.phase !== 'try') return;
    this.stepT += dt;
    this.event({ type: 'time', e: { dt } });
    const st = this.def.steps[this.step];
    const h = st?.hint?.(this.ctx, this.stepT);
    if (h) this.say({ key: 'lesson.hint', text: h, tier: 'B', dur: 2.2, maxWait: 1 });
    if (st?.timeout && this.stepT > st.timeout) this.failWith(L2('慢慢来，再试一次。', 'Take your time — again.'));
  }
  private event(ev: LessonEvent) {
    if (this.ended || this.phase !== 'try') return;
    const e = ev.e as { player?: Player };
    if (ev.type !== 'time' && e.player && e.player !== this.p && this.def.id !== 'duet' && this.def.id !== 'tandem' && this.def.id !== 'pullBack') return;
    const st = this.def.steps[this.step];
    if (!st) return;
    const f = st.fail?.(ev, this.ctx);
    if (f) { this.failWith(f); return; }
    if (st.done?.(ev, this.ctx)) { this.succeed(); return; }
    if (st.until?.(ev, this.ctx)) this.enterStep(this.step + 1);
  }
  private failWith(text: L10n) {
    this.phase = 'fail';
    this.fails.push(this.stepKey ?? '?');
    Beat.fail({ p: this.p, id: this.id, text });
    this.host.reset(() => { if (this.ended) return; this.phase = 'try'; this.enterStep(this.step); });
  }
  succeed() {
    if (this.ended) return;
    this.phase = 'success';
    const s = this.def.success;
    Beat.success({ p: this.p, id: this.id, stamp: s.stamp, why: s.why, strip: s.strip });
    Lessons.complete(this.id, this.p, 'lesson');
    this.end('success');
  }
  skip(): void { Lessons.complete(this.id, this.p, 'skip'); this.end('skip'); }
  postpone(): void { Flags.inc('onboard.postpone.' + this.id); this.end('postpone'); }
  replay(): void { this.demoPlays++; this.phase = 'demo'; this.phaseT = 0; }
  end(how = 'abort') {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'end';
    this.ungate?.(); this.ungate = null;
    this.host.dispose();
    Onboard.coach.quiet(this.p.slot, false);
    const i = runs.indexOf(this);
    if (i >= 0) runs.splice(i, 1);
    Tut.log('lessonEnd', { lesson: this.id, how });
    this.onEnd?.(how);
  }
}
export function hallRuns(): readonly HallRunner[] { return runs; }
Stage.onUpdate((dt) => { for (const r of runs.slice()) { try { r.update(dt); } catch (e) { console.error('[hall]', e); } } });
function L2(zh: string, en: string): L10n { return { zh, en }; }

// ───────────────────────── ★ trials (ONBOARD2 §8.5; G = the GDD2 §9.5 eight) ─────────────────────────
export interface TrialDef {
  id: string;
  /** "3 undos in a row, each +8 or more" */
  goal: L10n;
  need: number;
  /** a GDD2 §9.5 training (10 shards + a cosmetic) */
  g?: boolean;
  /** count resets on a miss (only where the GDD asks for a streak) */
  streak?: boolean;
  props(ctx: LessonCtx): void;
  /** +1 / 'miss' / nothing for an event */
  judge(ev: LessonEvent, st: Record<string, number>, p: Player): 1 | 'miss' | void;
  /** open these gates for the trial */
  verbs?: { scrub?: boolean; fork?: boolean };
  cosmetic?: string;
}
const T = (zh: string, en: string): L10n => ({ zh, en });
export const TRIALS: Record<string, TrialDef> = {
  undo: { id: 'undo', goal: T('连续 3 次撤销，每次拿回 8 以上', '3 undos in a row, each +8 or more'), need: 3, streak: true,
    props: (c) => { const d = c.spawn(new HallDummy(c.at(0, -40).x, c.at(0, -40).y, 'punch')); d.every = 1.6; },
    judge: (ev) => (ev.type === 'rewind' ? ((ev.e.restored ?? 0) >= 8 ? 1 : 'miss') : undefined) },
  echo: { id: 'echo', goal: T('一次回溯让残响打出 30 以上', 'One rewind: your Echo deals 30+'), need: 1,
    props: (c) => { c.spawn(new HallDummy(c.at(36, -16).x, c.at(36, -16).y, 'punch')); },
    judge: (ev, st, p) => {
      if (ev.type === 'rewind') st.dmg = 0;
      if (ev.type === 'hit' && (ev.e.info as { src?: number }).src === p.slot * 2 + 1) { st.dmg = (st.dmg ?? 0) + ev.e.dealt; if (st.dmg >= 30 && !st.done) { st.done = 1; return 1; } }
    } },
  paradox: { id: 'paradox', goal: T('一次悖论同时炸到 2 个木偶', 'One Paradox hits 2 dummies'), need: 1,
    props: (c) => { c.spawn(new HallDummy(c.at(20, -40).x, c.at(20, -40).y, 'punch')); c.spawn(new HallDummy(c.at(-20, -40).x, c.at(-20, -40).y, 'idle')); },
    judge: (ev, st, p) => {
      if (ev.type === 'paradox' && ev.e.player === p) { st.blast = p.world.time; st.n = 0; }
      if (ev.type === 'hit' && ev.e.info.kind === 'paradox' && st.blast !== undefined && Math.abs(p.world.time - st.blast) < 0.1) { st.n = (st.n ?? 0) + 1; if (st.n === 2) return 1; }
    } },
  fork: { id: 'fork', goal: T('两次分岔悖论，间隔不超过 6 秒', 'Two Fork Paradoxes within 6 s'), need: 2, verbs: { fork: true },
    props: (c) => { c.spawn(new HallDummy(c.at(0, -40).x, c.at(0, -40).y, 'idle')); },
    judge: (ev, st, p) => {
      if (ev.type !== 'paradox' || ev.e.player !== p || ev.e.echo?.kind !== 'fork') return;
      const now = p.world.time, last = st.last ?? -99;
      st.last = now;
      return now - last <= 6 || st.first === undefined ? ((st.first = 1), 1) : 'miss';
    } },
  scrub: { id: 'scrub', goal: T('3 次擦带，每次退不到 1.2 秒且拿回生命', '3 scrubs under 1.2 s that give health back'), need: 3, verbs: { scrub: true },
    props: (c) => { const d = c.spawn(new HallDummy(c.at(0, -40).x, c.at(0, -40).y, 'punch')); d.every = 1.4; },
    judge: (ev) => (ev.type === 'rewind' && ev.e.scrub ? ((ev.e.seconds ?? 9) <= 1.2 && (ev.e.restored ?? 0) > 0 ? 1 : undefined) : undefined) },
  sync: { id: 'sync', g: true, cosmetic: 'cos_sync_tassel', goal: T('同步 ×3', 'Sync ×3'), need: 3,
    props: (c) => { c.spawn(new DuetBellProp(c.at(0, -40).x, c.at(0, -40).y)); },
    judge: (ev, _st, p) => (ev.type === 'sync' && ev.e.player === p ? 1 : undefined) },
  grandfather: { id: 'grandfather', g: true, cosmetic: 'cos_grandfather_watch', goal: T('用悖论击杀元凶（祖父悖论）', 'Kill your Culprit with a Paradox'), need: 1,
    props: (c) => { const d = c.spawn(new HallDummy(c.at(0, -40).x, c.at(0, -40).y, 'punch', 40)); d.heals = false; },
    judge: (ev, _st, p) => (ev.type === 'custom' && ev.e.id === 'grandfatherParadox' && ev.e.player === p ? 1 : undefined) },
  tick: { id: 'tick', goal: T('卡秒 ×3，其中 1 次接反击', 'Tick-Dodge ×3, one followed by a Counter'), need: 3,
    props: (c) => { const d = c.spawn(new HallDummy(c.at(0, -32).x, c.at(0, -32).y, 'slowPunch')); d.every = 1.0; },
    judge: (ev, st, p) => {
      if (ev.type === 'tickDodge' && ev.e.player === p) { st.ticks = (st.ticks ?? 0) + 1; if (st.ticks < 3 || st.counter) return 1; return; }
      if (ev.type === 'hit' && ev.e.info.counter && ev.e.player === p && !st.counter) { st.counter = 1; if ((st.ticks ?? 0) >= 3) return 1; }
    } },
  chain: { id: 'chain', g: true, cosmetic: 'cos_chain_trail', goal: T('3 个残响连锁 ×2', 'A 3-Echo chain ×2'), need: 2, verbs: { fork: true },
    props: (c) => { c.spawn(new HallDummy(c.at(28, -44).x, c.at(28, -44).y, 'idle')); c.spawn(new HallDummy(c.at(-28, -44).x, c.at(-28, -44).y, 'idle')); },
    judge: (ev, _st, p) => (ev.type === 'paradox' && ev.e.player === p && (ev.e.chain ?? 1) >= 3 ? 1 : undefined) },
  perfect: { id: 'perfect', g: true, cosmetic: 'cos_gilded_mask', goal: T('完美回溯 ×3', 'Perfect Rewind ×3'), need: 3,
    props: (c) => { const d = c.spawn(new HallDummy(c.at(0, -32).x, c.at(0, -32).y, 'slowPunch')); d.every = 1.0; },
    judge: (ev, _st, p) => (ev.type === 'perfectRewind' && ev.e.player === p ? 1 : undefined) },
  pierce: { id: 'pierce', g: true, cosmetic: 'cos_pierce_tassel', goal: T('穿越悖论 ×2，都炸到木偶', 'Pierce Paradox ×2, both hit the dummy'), need: 2, verbs: { fork: true },
    props: (c) => { c.spawn(new HallDummy(c.at(48, -24).x, c.at(48, -24).y, 'idle')); },
    judge: (ev, st, p) => {
      if (ev.type === 'paradox' && ev.e.player === p && ev.e.kind === 'pierce') st.pierceT = p.world.time;
      if (ev.type === 'hit' && ev.e.info.kind === 'paradox' && st.pierceT !== undefined && Math.abs(p.world.time - st.pierceT) < 0.15) { st.pierceT = -99; return 1; }
    } },
  recall: { id: 'recall', g: true, cosmetic: 'cos_recall_spring', goal: T('召回穿过 3 个敌人', 'A Recall through 3 enemies'), need: 1,
    props: (c) => { for (const dx of [-24, 0, 24]) c.spawn(new HallDummy(c.at(dx, -36).x, c.at(dx, -36).y, 'idle')); },
    judge: (ev, st, p) => {
      if (ev.type === 'hit' && (ev.e.info as { via?: string }).via === 'recall' && ev.e.player === p) { st.n = (st.n ?? 0) + 1; if (st.n === 3) return 1; }
      if (ev.type === 'fork') st.n = 0;
    } },
  lastSecond: { id: 'lastSecond', goal: T('两次最后一秒自救', 'Two Last Second saves'), need: 2,
    props: (c) => { const d = c.spawn(new HallDummy(c.at(0, -28).x, c.at(0, -28).y, 'punch')); d.punchDmg = 60; d.every = 3; },
    judge: (ev, _st, p) => (ev.type === 'revived' && ev.e.player === p && ev.e.source === 'self' ? 1 : undefined) },
};

/** a ★ trial on the Hall's stage: same layout as the lesson, a count on the rail, success → ★ */
export class TrialRun {
  count = 0;
  ended = false;
  private st: Record<string, number> = {};
  private ungate: (() => void) | null;
  private origin: { x: number; y: number; face: 1 | -1 };
  readonly ctx: LessonCtx;
  constructor(readonly def: TrialDef, readonly p: Player, readonly host: StageHost, private done: (ok: boolean) => void, private halfSpeed = false) {
    const self = this;
    this.origin = { x: Math.round(p.x), y: Math.round(p.y), face: 1 };
    this.ctx = {
      get p() { return self.p; }, get w() { return self.host.world(); }, get host() { return self.host; },
      at: (dx: number, dy: number) => ({ x: Math.round(self.origin.x + dx), y: Math.round(self.origin.y + dy) }),
      spawn: <E extends Entity>(e: E): E => { self.host.world().add(e); self.host.track(e); if (isHallProp(e) && self.host.world().playerCount > 1) e.owner = self.p; return e; },
      vars: {},
    } as unknown as LessonCtx;
    this.ungate = Gates.push({ name: 'trial:' + def.id, p, tapOnly: def.verbs?.scrub ? () => false : undefined, forkAllow: def.verbs?.fork ? () => true : undefined, shows: () => true });
    Onboard.coach.quiet(p.slot, true);
    const w = host.world();
    for (const k of EVENTS) w.bus.on(k, ((e: unknown) => this.event({ type: k, e } as LessonEvent)) as never, host.owner);
    def.props(this.ctx);
    this.show();
    trials.push(this);
    Tut.log('trialStart', { trial: def.id, slot: p.slot });
  }
  private show() {
    Stage.say({ key: 'hall.trial', slot: this.p.slot, who: this.p.input, tier: 'A', dur: Infinity, until: () => this.ended,
      text: () => `${tr(C('hallTrial')).replace('{goal}', tr(this.def.goal))}   ${this.count} / ${this.def.need}` });
  }
  private event(ev: LessonEvent) {
    if (this.ended) return;
    const r = this.def.judge(ev, this.st, this.p);
    if (r === 1) { this.count++; sfx('glyphPress'); this.p.world.fx.banner(this.p.x, this.p.y - 36, `${this.count} / ${this.def.need}`, 'B5', 0.9); }
    else if (r === 'miss' && this.def.streak && this.count > 0) { this.count = 0; Stage.say({ key: 'hall.trialMiss', slot: this.p.slot, tier: 'B', text: C('hallTrialAgain'), dur: 1.6 }); }
    if (this.count >= this.def.need) this.finish(true);
  }
  finish(ok: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.ungate?.(); this.ungate = null;
    this.host.dispose();
    Onboard.coach.quiet(this.p.slot, false);
    const i = trials.indexOf(this);
    if (i >= 0) trials.splice(i, 1);
    if (ok && !this.halfSpeed) grantStar(this.def, this.p);
    Tut.log('trialEnd', { trial: this.def.id, ok, count: this.count });
    this.done(ok);
  }
}
const trials: TrialRun[] = [];
export function activeTrial(p?: Player | null): TrialRun | null { return trials.find((t) => !t.ended && (!p || t.p === p)) ?? null; }

/** ★: the stamp, the shards (G 10 + its cosmetic, others 5), once a lifetime (slot I) */
export function grantStar(def: TrialDef, p: Player) {
  Beat.success({ p, id: 'star.' + def.id, stamp: C('hallMastered'), why: def.goal, dur: 2.4 });
  if (p.slot !== 0 || Teach.has('star.' + def.id)) return;
  Teach.mark('star.' + def.id);
  const n = def.g ? 10 : 5;
  profile.shards += n;
  profile.totalShards += n;
  if (def.cosmetic) unlock(def.cosmetic, 'hall:' + def.id);
  saveProfile();
  const sub = C('hallShards');
  Notices.push({ kind: 'unlock', name: def.goal, label: C('hallMastered'), sub: { zh: sub.zh.replace('{n}', String(n)), en: sub.en.replace('{n}', String(n)) } });
}
/** ✓ in the Hall pays at once (in-run lessons bank it for the run's end: Lessons.complete does that) */
export function payTickNow(lessonId: string, p: Player) {
  if (p.slot !== 0) return;
  const pend = Flags.get('onboard.pendingShards');
  const reward = Lessons.get(lessonId)?.reward ?? 3;
  if (pend >= reward && reward > 0) {
    Flags.set('onboard.pendingShards', pend - reward);
    profile.shards += reward;
    profile.totalShards += reward;
    saveProfile();
  }
}

Stage.onUpdate(() => {
  for (const t of trials.slice()) if (t.p.dead || t.p.world !== (G.scenes.current as { world?: World } | null)?.world) t.finish(false);
  Callouts.mute('hall', runs.length > 0 || trials.length > 0);
});
// the F3 HUD plates and term callouts go quiet while a Hall lesson / trial speaks (as for F4a's lessons)
const mutedBefore = RewindHudHooks.muted;
RewindHudHooks.muted = () => mutedBefore() || runs.length > 0 || trials.length > 0;
void Gates;
