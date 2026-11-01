// Lesson props (ONBOARD2 §2, §5.6, §11.2; F4a). Every prop belongs to the onboarding: the stage hosts
// track them (removed without effects on a reset), they never count toward a room's clear, and the
// numbers come from the hand's real weapon and mods, so a retuned weapon keeps every lesson honest.
//
//   FallingGear    a shadow grows under the hand (it follows for 0.5 s, then locks), a gear tumbles
//                  down and lands for 12 undoable damage (knockback 0) — the "take a hit" of L3 / scrub
//   PracticeDummy  a wooden dummy: HP = the weapon's three-hit combo + 4 (L4), a 6-pip bar with room for
//                  "Kept ✓"; punches back (0.5 s red cone, 8 undoable damage) after its 2nd hit, or when
//                  a hand loiters 1.6 s within 36 px; cooldown 2 s. Optional: no punch, no bar (L2).
//   GlassJar       a bell jar only a paradox breaks (other hits: "ding", a white flash); a hand within
//                  44 px or a hit rings the alarm; a brass key (prologue) or brass (in-run) inside
//   AlarmTurret    on the alarm: 0.5 s magenta aim line, a slow magenta shot (6 damage, dodgeable), then
//                  one every 1.5 s while a hand stays within 60 px of its jar
//   PendulumBlade  sweeps a column; a hand not dashing is shoved back (0 damage, a hazard, knock 140)
//   Fence          brass posts with a gap (solid tiles under them)
//   MarkerRing     a pulsing B5 dotted ring on the floor ("walk here")
//   InesStand      Ines on the stage, turning to whatever the lesson points at
//   FloorArrows    a faint row of chevrons (decoration, never text)
// Props announce themselves on the bus with `custom` ids: gearLand {hit, dodged}, propBroken {prop,
// by}, jarDing, alarm, bladeHit — the lessons listen for them.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Player } from '../entities/player';
import type { DamageInfo } from '../systems/combat';
import { Entity, Actor } from '../entities/entity';
import { Enemy } from '../entities/enemy';
import { Bullet } from '../entities/projectile';
import { Pickup } from '../entities/pickup';
import { drawSprite } from '../../engine/gfx/sprite';
import { col } from '../../art/palette';
import { TAU, clamp, ease } from '../../engine/math';
import { sfx } from '../G';
import { T, TS } from '../world/room';
import { ownerPlayer } from '../players';
import { Callouts } from '../ui/callouts';
import { Text } from '../ui/text';
import { rect } from '../ui/draw';
import { S } from '../strings';
import { buildInes } from '../../art/sprites/hub';
import type { Sprite } from '../../engine/gfx/sprite';
import {
  dummySprites, jarBase, brassKey, turretSprites, pendulumPivot, pendulumBlade, fallingGearFrames, gearHalves, fencePost,
} from '../../art/sprites/onboard';
import '../strings/onboard';

/** a prop the lesson put down (stage hosts remove these without effects) */
export interface LessonProp { lessonProp: true; owner: Player | null }
const emit = (e: Entity, id: string, data?: unknown, player?: Player | null) => e.world?.bus.emit('custom', { id, player: player ?? undefined, data });

// ───────────────────────── FallingGear ─────────────────────────
export interface GearOpts {
  /** follow this hand's feet for `lockAt` seconds, then lock (L3: 0.5 s) */
  follow?: Player | null;
  /** seconds from the shadow appearing to the landing (0.8; the "can't dodge" one: 0.2) */
  warn?: number;
  lockAt?: number;
  dmg?: number;
  /** hit radius */
  r?: number;
}
export class FallingGear extends Entity implements LessonProp {
  readonly lessonProp = true as const;
  owner: Player | null;
  t = 0;
  landed = false;
  private warn: number; private lockAt: number; private dmg: number; private hitR: number;
  private spin = 0;
  constructor(x: number, y: number, o: GearOpts = {}) {
    super();
    this.x = x; this.y = y;
    this.owner = o.follow ?? null;
    this.warn = o.warn ?? 0.8;
    this.lockAt = Math.min(this.warn, o.lockAt ?? 0.5);
    this.dmg = o.dmg ?? 12;
    this.hitR = o.r ?? 12;
    this.collides = false;
  }
  added() { sfx('gearWhistle', { pan: this.world.pan(this.x) }); }
  update(dt: number) {
    if (this.landed) return;
    this.t += dt;
    const f = this.owner;
    if (f && this.t < this.lockAt && f.state === 'alive') { this.x += (f.x - this.x) * Math.min(1, dt * 18); this.y += (f.y - this.y) * Math.min(1, dt * 18); }
    this.spin += dt * 9;
    if (this.t >= this.warn) this.land();
  }
  private land() {
    this.landed = true;
    const w = this.world;
    let hit = false, dodged = false;
    for (const p of w.players) {
      if (p.state !== 'alive' || p.dead || p.falling > 0) continue;
      if (Math.hypot(p.x - this.x, (p.y - this.y) * 1.2) > this.hitR + p.r) continue;
      const dealt = p.hurt({ amount: this.dmg, kind: 'melee', x: this.x, y: this.y, knock: 0, via: 'lesson' });
      if (dealt > 0) hit = true; else if (p.dashT > 0 || p.rewinding) dodged = true;
    }
    w.shake(0.35);
    w.fx.dust(this.x, this.y, 10);
    w.fx.burst(this.x, this.y - 4, 10, ['B5', 'B4', 'K7'], 110, 0.35, 'world', 'px');
    sfx('gearCrash', { pan: w.pan(this.x) });
    const [a, b] = gearHalves();
    w.add(new Debris(this.x - 3, this.y - 6, a, -70, -60));
    w.add(new Debris(this.x + 3, this.y - 6, b, 70, -50));
    emit(this, 'gearLand', { hit, dodged, x: this.x, y: this.y }, this.owner);
    this.dead = true;
  }
  renderGround(r: Renderer) {
    if (this.landed) return;
    const k = clamp(this.t / this.warn, 0, 1);
    const rr = 4 + 10 * ease.outCubic(k);
    const ctx = r.w;
    ctx.globalAlpha = 0.25 + 0.2 * k;
    ctx.fillStyle = col('K0');
    ctx.beginPath(); ctx.ellipse(Math.round(this.x), Math.round(this.y), rr, rr * 0.45, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    // a thin warning rim that tightens as it comes
    const u = r.u;
    const n = 20;
    u.fillStyle = col(k > 0.7 && Math.floor(this.world.time * 20) % 2 ? 'R4' : 'R3');
    for (let i = 0; i < n; i += 2) {
      const a = (i / n) * TAU + this.t * 2;
      u.fillRect(Math.round(this.x + Math.cos(a) * (rr + 2)), Math.round(this.y + Math.sin(a) * (rr + 2) * 0.45), 1, 1);
    }
  }
  render(r: Renderer) {
    if (this.landed) return;
    // the gear itself drops from above during the last 0.3 s
    const fall = this.warn - this.t;
    if (fall > 0.3) return;
    const k = 1 - fall / 0.3;
    const z = (1 - ease.inQuad(k)) * 90;
    const fr = fallingGearFrames();
    drawSprite(r.w, fr[Math.floor(this.spin) % fr.length], this.x, this.y - 8 - z);
  }
}

/** a piece that bounces away and fades (gear halves) */
class Debris extends Entity {
  private t = 0; private vz = 70; private zz = 6;
  constructor(x: number, y: number, private spr: Sprite, vx: number, vz0: number) { super(); this.x = x; this.y = y; this.vx = vx; this.vy = 0; this.vz = -vz0; this.collides = false; }
  update(dt: number) {
    this.t += dt;
    this.vz -= 300 * dt; this.zz = Math.max(0, this.zz + this.vz * dt);
    if (this.zz <= 0) { this.vz = Math.abs(this.vz) * 0.35; this.vx *= 0.6; }
    this.vx *= Math.exp(-2 * dt);
    if (this.t > 1.6) this.dead = true;
  }
  render(r: Renderer) {
    const a = this.t > 1.1 ? 1 - (this.t - 1.1) / 0.5 : 1;
    drawSprite(r.w, this.spr, this.x, this.y - this.zz, { alpha: a, rot: this.t * this.vx * 0.02 });
  }
}

// ───────────────────────── PracticeDummy ─────────────────────────
export interface DummyOpts {
  /** a number, or 'combo' = the hand's three-hit combo + 4 (ONBOARD2 §2.5) */
  hp?: number | 'combo';
  punch?: boolean;
  /** the 6-pip bar over its head */
  bar?: boolean;
  /** only this hand (and its echoes) can hurt it (co-op lanes) */
  owner?: Player | null;
  /** punch damage (8) */
  dmg?: number;
  /** never breaks (L2's "hit it three times" dummy) */
  immortal?: boolean;
}
export const DUMMY_PUNCH_R = 34, DUMMY_WIND = 0.5, DUMMY_CD = 2.0, DUMMY_LOITER = 1.6, DUMMY_LOITER_R = 36;
/** the damage of a hand's full ground combo with its real weapon and mods (what L4's dummy is built around) */
export function comboDamage(p: Player): number {
  const m = p.mods;
  let sum = 0;
  for (const s of p.weapon.steps) sum += Math.round(s.dmg * m.dmg);
  return sum;
}
export class PracticeDummy extends Enemy implements LessonProp {
  readonly lessonProp = true as const;
  owner: Player | null;
  private o: DummyOpts;
  private hitsInRow = 0;
  private lastHitT = -9;
  private cd = 0.6;
  private loiter = 0;
  private keptT = 0;
  private hitAnim = 0;
  constructor(x: number, y: number, o: DummyOpts = {}) {
    super(x, y, typeof o.hp === 'number' ? o.hp : 50);
    this.o = o;
    this.owner = o.owner ?? null;
    this.r = 7; this.height = 24; this.mass = 999; this.kind = 'dummy';
    this.brass = [0, 0];
    this.spawnT = 0.35;
    this.canFall = false;
    this.debris = ['B2', 'B3', 'B1', 'S2', 'R3'];
    (this as unknown as { ignoreClear: boolean }).ignoreClear = true;
    this.codexId = '';
  }
  added() {
    super.added();
    if (this.o.hp === 'combo') {
      const p = this.owner ?? this.world.players[0];
      this.hp = this.maxHp = (p ? comboDamage(p) : 46) + 4;
    }
  }
  /** "Kept ✓" beside its bar for `dur` seconds (L4: the damage you dealt stays) */
  kept(dur = 1.6) { this.keptT = dur; }
  hurt(info: DamageInfo): number {
    if (this.owner && info.owner && ownerPlayer(info.owner) !== this.owner) return 0;
    const dealt = super.hurt(info);
    if (dealt > 0) {
      this.hitAnim = 0.12;
      if (!info.echo && info.owner && info.owner.team === 'player') {
        this.hitsInRow = this.world.time - this.lastHitT < 1.2 ? this.hitsInRow + 1 : 1;
        this.lastHitT = this.world.time;
      }
    }
    return dealt;
  }
  onDeath(info: DamageInfo) {
    super.onDeath(info);
    this.world.add(new GearDrop(this.x, this.y - 6));
    emit(this, 'propBroken', { prop: this, echo: !!info.echo, kind: info.kind, src: info.src ?? -2 }, ownerPlayer(info.owner));
  }
  think(dt: number) {
    const w = this.world;
    if (this.keptT > 0) this.keptT -= dt;
    if (this.hitAnim > 0) this.hitAnim -= dt;
    if (this.o.immortal) this.hp = this.maxHp; // L2's dummy never breaks
    this.faceTarget();
    if (!this.o.punch) return;
    const t = this.target;
    const d = this.distT();
    if (this.cd > 0) this.cd -= dt;
    switch (this.state) {
      case 'idle': {
        // loitering next to it without attacking: it swings anyway (the "hit back" never fails to come)
        const tp = t as Player | null;
        const attacking = !!tp && (tp as Player).weapon?.busy;
        this.loiter = d < DUMMY_LOITER_R && !attacking ? this.loiter + dt : Math.max(0, this.loiter - dt * 2);
        if (this.cd <= 0 && (this.hitsInRow >= 2 || this.loiter >= DUMMY_LOITER)) {
          this.hitsInRow = 0; this.loiter = 0;
          this.windup('wind', DUMMY_WIND, { tele: { kind: 'cone', ang: this.angT(), len: DUMMY_PUNCH_R, half: 0.85, y: this.y - 4 } });
          sfx('sentryWind', { pan: w.pan(this.x), vol: 0.8 });
        }
        break;
      }
      case 'wind':
        // the cone follows the hand while it charges (so it reads as aimed)
        if (this.wind?.tele && this.wind.tele.kind === 'cone') this.wind.tele.ang = this.angT();
        if (this.stateT >= DUMMY_WIND) {
          this.setState('punch');
          const a = this.angT();
          w.combat.add({ shape: { t: 'arc', x: this.x, y: this.y - 6, r: DUMMY_PUNCH_R, a, w: 0.9 }, team: 'enemy', life: 3, info: { amount: this.o.dmg ?? 8, kind: 'melee', owner: this, x: this.x, y: this.y, knock: 120 } });
          sfx('sentryThrust', { pan: w.pan(this.x) });
        }
        break;
      case 'punch':
        if (this.stateT > 0.4) { this.setState('idle'); this.cd = DUMMY_CD; }
        break;
    }
  }
  render(r: Renderer) {
    const D = dummySprites();
    const spr = this.state === 'wind' ? D.wind : this.state === 'punch' ? D.punch : this.hitAnim > 0 ? D.hit : D.idle;
    this.drawBody(r, spr, {});
  }
  renderUnlit(r: Renderer) {
    if (this.dead || this.spawnT > 0 || this.o.bar === false) return;
    // 6 pips over its head: brass frame, red fill (ONBOARD2 §2.5)
    const n = 6, pw = 4, gap = 1, w = n * (pw + gap) - gap;
    const x0 = Math.round(this.x - w / 2), y0 = Math.round(this.y - this.height - 10);
    const u = r.u;
    rect(u, x0 - 2, y0 - 2, w + 4, 7, 'K0');
    rect(u, x0 - 1, y0 - 1, w + 2, 5, 'B4');
    const frac = this.hp / this.maxHp;
    for (let i = 0; i < n; i++) {
      const lo = i / n, hi = (i + 1) / n;
      const fill = clamp((frac - lo) / (hi - lo), 0, 1);
      rect(u, x0 + i * (pw + gap), y0, pw, 3, 'K2');
      if (fill > 0) rect(u, x0 + i * (pw + gap), y0, Math.max(1, Math.round(pw * fill)), 3, 'R3');
    }
    if (this.keptT > 0) {
      const a = Math.min(1, this.keptT / 0.3);
      const tx = x0 + w + 6, ty = y0 + 1;
      r.worldUi((ctx, toUi) => {
        const q = toUi(tx, ty);
        Text.draw(ctx, S('onboard', 'kept'), q.x, q.y, { size: 'small', color: 'G4', valign: 'middle', plate: true, alpha: a });
      });
    }
  }
}

/** a little brass gear a broken dummy leaves behind (decoration) */
class GearDrop extends Entity {
  private t = 0; private zz = 0; private vz = 90;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.vx = 24; this.collides = false; }
  update(dt: number) {
    this.t += dt;
    this.vz -= 320 * dt; this.zz = Math.max(0, this.zz + this.vz * dt);
    if (this.zz <= 0) { this.vz = Math.abs(this.vz) * 0.3; this.vx *= 0.5; }
    if (this.t > 3) this.dead = true;
  }
  render(r: Renderer) {
    const fr = fallingGearFrames();
    const a = this.t > 2.4 ? 1 - (this.t - 2.4) / 0.6 : 1;
    drawSprite(r.w, fr[0], this.x, this.y - 4 - this.zz, { alpha: a, sx: 0.5, sy: 0.5 });
  }
}

// ───────────────────────── GlassJar ─────────────────────────
export interface JarOpts {
  /** what is inside: a brass key (prologue decoration) or this much real brass (in-run) */
  brass?: number;
  owner?: Player | null;
  /** a hand this close (or a hit) rings the alarm (44) */
  alarmR?: number;
}
export class GlassJar extends Actor implements LessonProp {
  readonly lessonProp = true as const;
  owner: Player | null;
  alarmed = false;
  dings = 0;
  private o: JarOpts;
  private ringT = 0;
  private shine = 0;
  constructor(x: number, y: number, o: JarOpts = {}) {
    super();
    this.x = x; this.y = y;
    this.o = o;
    this.owner = o.owner ?? null;
    this.team = 'enemy';
    this.hp = this.maxHp = 1;
    this.r = 8; this.height = 22; this.mass = 999; this.solid = true; this.canFall = false;
    this.kind = 'jar';
    (this as unknown as { ignoreClear: boolean }).ignoreClear = true;
  }
  hurt(info: DamageInfo): number {
    if (this.dead) return 0;
    if (this.owner && info.owner && ownerPlayer(info.owner) !== this.owner) return 0;
    if (info.kind === 'paradox') { this.shatter(info); return 1; }
    // anything else just rings off the glass
    this.flash = 0.08;
    this.ringT = 0.35;
    this.dings++;
    const w = this.world;
    w.fx.burst(this.x, this.y - 12, 5, ['W', 'K10', 'K9'], 80, 0.2, 'glow');
    sfx('glassDing', { pan: w.pan(this.x), pitch: 1 + (this.dings % 3) * 0.06 });
    emit(this, 'jarDing', { n: this.dings }, ownerPlayer(info.owner));
    this.alarm(ownerPlayer(info.owner));
    return 0;
  }
  alarm(by: Player | null) {
    if (this.alarmed) return;
    this.alarmed = true;
    sfx('alarmBell', { pan: this.world.pan(this.x) });
    emit(this, 'alarm', { jar: this }, by);
  }
  private shatter(info: DamageInfo) {
    this.dead = true;
    const w = this.world;
    w.fx.burst(this.x, this.y - 12, 26, ['W', 'K10', 'K9', 'K8'], 170, 0.55, 'world', 'px');
    w.fx.burst(this.x, this.y - 10, 10, ['B5', 'B4'], 90, 0.4, 'glow');
    w.shake(0.3);
    sfx('glassBreak', { pan: w.pan(this.x) });
    if (this.o.brass) for (let i = 0; i < this.o.brass; i++) w.add(new Pickup(this.x, this.y - 6, 'brass', 1));
    else w.add(new KeyDrop(this.x, this.y - 6));
    emit(this, 'propBroken', { prop: this, kind: info.kind, echoKind: (info as { echoKind?: string }).echoKind ?? null }, ownerPlayer(info.owner));
  }
  update(dt: number) {
    if (this.ringT > 0) this.ringT -= dt;
    this.shine += dt;
    if (!this.alarmed) {
      const R = this.o.alarmR ?? 44;
      for (const p of this.world.players) if (p.state === 'alive' && !p.dead && Math.hypot(p.x - this.x, p.y - this.y) < R && (!this.owner || p === this.owner)) { this.alarm(p); break; }
    }
  }
  renderGround(r: Renderer) {
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.45)';
    ctx.beginPath(); ctx.ellipse(Math.round(this.x), Math.round(this.y), 10, 3.5, 0, 0, TAU); ctx.fill();
  }
  render(r: Renderer) {
    const ctx = r.w;
    const x = Math.round(this.x), y = Math.round(this.y);
    const wob = this.ringT > 0 ? Math.round(Math.sin(this.ringT * 60) * 1) : 0;
    // the key inside (behind the glass)
    drawSprite(ctx, brassKey(), x, y - 8);
    // the dome: a faint fill, a neutral rim, a moving highlight streak
    const hw = 7, top = y - 22, bot = y - 3;
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = col('K9');
    for (let yy = top; yy <= bot; yy++) {
      const k = (yy - top) / (bot - top);
      const half = Math.round(k < 0.35 ? hw * Math.sqrt(k / 0.35) : hw);
      ctx.fillRect(x - half + wob, yy, half * 2 + 1, 1);
    }
    ctx.globalAlpha = 1;
    for (let yy = top; yy <= bot; yy++) {
      const k = (yy - top) / (bot - top);
      const half = Math.round(k < 0.35 ? hw * Math.sqrt(k / 0.35) : hw);
      ctx.fillStyle = col(this.flash > 0 ? 'W' : 'K8');
      ctx.fillRect(x - half - 1 + wob, yy, 1, 1);
      ctx.fillRect(x + half + 1 + wob, yy, 1, 1);
      if (yy === top) ctx.fillRect(x - half + wob, yy - 1, half * 2 + 1, 1);
    }
    // a knob on top
    ctx.fillStyle = col('K9'); ctx.fillRect(x - 1 + wob, top - 3, 3, 2);
    // the highlight slides slowly down the left side
    const hs = Math.floor((this.shine * 6) % 14);
    ctx.fillStyle = col('K10');
    ctx.fillRect(x - 4 + wob, top + 3 + Math.min(10, hs), 1, 3);
    ctx.fillRect(x - 5 + wob, top + 6, 1, 6);
    drawSprite(ctx, jarBase(), x, y);
    if (this.flash > 0) { ctx.globalAlpha = 0.5; drawSprite(ctx, jarBase(), x, y, { tint: '#ffffff' }); ctx.globalAlpha = 1; }
  }
}

/** the brass key that pops out of a broken jar (prologue) */
class KeyDrop extends Entity {
  private t = 0; private zz = 4; private vz = 130;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.vx = -20; this.collides = false; }
  update(dt: number) {
    this.t += dt;
    this.vz -= 360 * dt; this.zz = Math.max(0, this.zz + this.vz * dt);
    if (this.zz <= 0) { this.vz = Math.abs(this.vz) * 0.35; this.vx *= 0.5; }
    this.vx *= Math.exp(-3 * dt);
  }
  render(r: Renderer) {
    drawSprite(r.w, brassKey(), this.x, this.y - 2 - this.zz, { rot: this.zz > 0 ? this.t * 8 : 0 });
    r.glowAt(this.x, this.y - 4 - this.zz, 10, 'B5', 0.35);
  }
}

// ───────────────────────── AlarmTurret ─────────────────────────
export class AlarmTurret extends Entity implements LessonProp {
  readonly lessonProp = true as const;
  owner: Player | null;
  private aimT = -1;
  private cd = 0;
  private aimAt: { x: number; y: number } | null = null;
  private lit = 0;
  constructor(x: number, y: number, public jar: GlassJar, o: { owner?: Player | null; speed?: number; dmg?: number } = {}) {
    super();
    this.x = x; this.y = y;
    this.owner = o.owner ?? null;
    this.speed = o.speed ?? 120;
    this.dmg = o.dmg ?? 6;
    this.collides = false;
  }
  private speed: number;
  private dmg: number;
  private target(): Player | null {
    if (this.owner) return this.owner.state === 'alive' ? this.owner : null;
    return (this.world.nearestPlayer(this.x, this.y) as Player | null) ?? null;
  }
  update(dt: number) {
    if (this.lit > 0) this.lit -= dt;
    if (!this.jar.alarmed || this.jar.dead) { this.aimT = -1; return; }
    const p = this.target();
    if (!p || p.rewinding) return;
    if (this.aimT >= 0) {
      this.aimT += dt;
      this.aimAt = { x: p.x, y: p.y - 6 };
      if (this.aimT >= 0.5) this.fire(p);
      return;
    }
    this.cd -= dt;
    // the first shot always comes; after that only while the hand stays by the jar
    const near = Math.hypot(p.x - this.jar.x, p.y - this.jar.y) < 60;
    if (this.cd <= 0 && (this.shots === 0 || near)) this.aimT = 0;
  }
  private shots = 0;
  private fire(p: Player) {
    this.aimT = -1;
    this.cd = 1.5;
    this.shots++;
    this.lit = 0.25;
    const w = this.world;
    const ang = Math.atan2(p.y - 6 - (this.y - 10), p.x - this.x);
    w.add(new Bullet({ team: 'enemy', x: this.x + Math.cos(ang) * 8, y: this.y - 10, ang, speed: this.speed, dmg: this.dmg, life: 4, r: 3 }));
    sfx('spit', { pan: w.pan(this.x) });
  }
  renderGround(r: Renderer) {
    if (this.aimT < 0 || !this.aimAt) return;
    // the aim line: magenta (enemy shots), fills in as it charges; no plate may sit on it
    const ax = this.x, ay = this.y - 10, bx = this.aimAt.x, by = this.aimAt.y;
    Callouts.avoid(Math.min(ax, bx) - 6, Math.min(ay, by) - 6, Math.abs(bx - ax) + 12, Math.abs(by - ay) + 12);
    const u = r.u;
    const d = Math.hypot(bx - ax, by - ay) || 1;
    const k = clamp(this.aimT / 0.5, 0, 1);
    for (let s = 0; s < d; s += 2) {
      if (s > d * k && (s / 2) % 2 < 1) continue;
      u.fillStyle = col(s < d * k ? 'M2' : 'M1');
      u.fillRect(Math.round(ax + ((bx - ax) * s) / d), Math.round(ay + ((by - ay) * s) / d), 1, 1);
    }
  }
  render(r: Renderer) {
    const [off, on] = turretSprites();
    const lit = this.lit > 0 || (this.aimT >= 0 && Math.floor(this.aimT * 16) % 2 === 0);
    drawSprite(r.w, lit ? on : off, this.x, this.y);
    if (lit) r.glowAt(this.x + 6, this.y - 7, 12, 'M2', 0.5);
  }
}

// ───────────────────────── PendulumBlade ─────────────────────────
export class PendulumBlade extends Entity implements LessonProp {
  readonly lessonProp = true as const;
  owner: Player | null = null;
  t = 0;
  /** the blade's centre now */
  by = 0;
  private lastSign = 0;
  private hitCd = new Map<number, number>();
  /** hands that went through the blade's column while dashing (once each) */
  passedDashing = new Set<number>();
  constructor(x: number, private cy: number, private amp = 40, private period = 1.6) { super(); this.x = x; this.y = cy - amp - 16; this.collides = false; this.by = cy; }
  get sortY() { return this.by + 6; }
  update(dt: number) {
    this.t += dt;
    const s = Math.sin((this.t / this.period) * TAU);
    this.by = this.cy + this.amp * s;
    const sign = Math.sign(Math.cos((this.t / this.period) * TAU));
    if (sign !== this.lastSign) { this.lastSign = sign; sfx('cfPendSwing', { pan: this.world.pan(this.x), vol: 0.35 }); }
    for (const [k, v] of this.hitCd) if (v - dt <= 0) this.hitCd.delete(k); else this.hitCd.set(k, v - dt);
    for (const p of this.world.players) {
      if (p.state !== 'alive' || p.dead) continue;
      if (Math.abs(p.x - this.x) > 8 || Math.abs(p.y - this.by) > 9) continue;
      if (p.dashT > 0 || p.invuln > 0 || p.rewinding) { if (p.dashT > 0) this.passedDashing.add(p.id); continue; }
      if (this.hitCd.has(p.id)) continue;
      this.hitCd.set(p.id, 0.5);
      // a hazard shove: no damage (ONBOARD2 §2.3: "0 damage, info.hazard, knock 140")
      const dir = p.x < this.x ? -1 : 1;
      p.kx += dir * 140; p.ky += (p.y - this.by) * 2;
      p.flash = 0.1;
      p.invuln = Math.max(p.invuln, 0.35);
      p.weapon.cancel();
      this.world.shake(0.2);
      this.world.fx.hitSparks(p.x, p.y - 10, dir > 0 ? 0 : Math.PI, 'normal', 4);
      sfx('clank', { pan: this.world.pan(p.x) });
      p.input.rumble(0.3, 0.4, 100);
      emit(this, 'bladeHit', { x: p.x }, p);
    }
  }
  renderGround(r: Renderer) {
    // its sweep is marked on the floor: a faint rust dotted lane
    const u = r.u;
    u.globalAlpha = 0.5;
    u.fillStyle = col('R2');
    for (let y = this.cy - this.amp - 8; y <= this.cy + this.amp + 8; y += 3) { u.fillRect(Math.round(this.x - 9), Math.round(y), 1, 1); u.fillRect(Math.round(this.x + 9), Math.round(y), 1, 1); }
    u.globalAlpha = 1;
    Callouts.avoid(this.x - 10, this.cy - this.amp - 14, 20, this.amp * 2 + 20);
  }
  render(r: Renderer) {
    const ctx = r.w;
    const px = Math.round(this.x), py = Math.round(this.cy - this.amp - 16);
    // the rod
    ctx.fillStyle = col('K0'); ctx.fillRect(px, py, 2, Math.round(this.by - py));
    ctx.fillStyle = col('K6'); ctx.fillRect(px, py, 1, Math.round(this.by - py));
    drawSprite(ctx, pendulumPivot(), px, py);
    // a little motion smear behind the blade
    const v = Math.cos((this.t / this.period) * TAU);
    ctx.globalAlpha = 0.25;
    drawSprite(ctx, pendulumBlade(), px, this.by - v * 5, { tint: 'K8' });
    ctx.globalAlpha = 1;
    drawSprite(ctx, pendulumBlade(), px, this.by);
  }
}

// ───────────────────────── Fence ─────────────────────────
/** brass posts down a column (x) from y0 to y1, open between gap0 and gap1; the posts' tiles are solid */
export class Fence extends Entity implements LessonProp {
  readonly lessonProp = true as const;
  owner: Player | null = null;
  private tiles: [number, number][] = [];
  constructor(x: number, private y0: number, private y1: number, private gap0: number, private gap1: number) { super(); this.x = x; this.y = y0; this.collides = false; }
  added() {
    const m = this.world.map;
    const tx = Math.floor(this.x / TS);
    for (let ty = Math.floor(this.y0 / TS); ty <= Math.floor(this.y1 / TS); ty++) {
      const cy = ty * TS + 8;
      if (cy + 8 > this.gap0 && cy - 8 < this.gap1) continue;
      if (m.get(tx, ty) === T.FLOOR) { m.set(tx, ty, T.BLOCK); this.tiles.push([tx, ty]); }
    }
  }
  removed() { const m = this.world.map; for (const [tx, ty] of this.tiles) if (m.get(tx, ty) === T.BLOCK) m.set(tx, ty, T.FLOOR); }
  get sortY() { return -1e9; }
  render(r: Renderer) {
    const ctx = r.w;
    const post = fencePost();
    const tx = Math.floor(this.x / TS);
    const x = tx * TS + 8;
    for (const [, ty] of this.tiles) {
      const y = ty * TS + 14;
      // a chain between this post and the next
      ctx.fillStyle = col('K5');
      for (let k = 0; k < 16; k += 2) ctx.fillRect(x, y - 8 + k, 1, 1);
      drawSprite(ctx, post, x, y);
    }
  }
}

// ───────────────────────── MarkerRing ─────────────────────────
export class MarkerRing extends Entity implements LessonProp {
  readonly lessonProp = true as const;
  owner: Player | null = null;
  t = 0;
  constructor(x: number, y: number, public radius = 12) { super(); this.x = x; this.y = y; this.collides = false; }
  update(dt: number) { this.t += dt; }
  /** a hand stands inside it */
  reached(p: Player): boolean { return Math.hypot(p.x - this.x, (p.y - this.y) * 1.3) <= this.radius; }
  renderGround(r: Renderer) {
    const u = r.u;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * TAU * 2);
    const R = this.radius + pulse * 1.5;
    const n = Math.round(R * 2.6);
    for (let i = 0; i < n; i++) {
      if (i % 3 === 2) continue;
      const a = (i / n) * TAU + this.t * 0.8;
      const x = Math.round(this.x + Math.cos(a) * R), y = Math.round(this.y + Math.sin(a) * R * 0.5);
      u.fillStyle = col('K0'); u.fillRect(x, y + 1, 1, 1);
      u.fillStyle = col(pulse > 0.6 ? 'B6' : 'B5'); u.fillRect(x, y, 1, 1);
    }
    r.lightAt(this.x, this.y, 30, 'B5', 0.25 + pulse * 0.15);
  }
}

// ───────────────────────── InesStand ─────────────────────────
let INES: Sprite[] | null = null;
export class InesStand extends Entity implements LessonProp {
  readonly lessonProp = true as const;
  owner: Player | null = null;
  t = 0;
  /** where she looks / points (world), null = at the hand */
  look: { x: number; y: number } | null = null;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.collides = false; INES ??= buildInes(); }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const p = this.world.players[0];
    const tx = this.look?.x ?? p?.x ?? this.x;
    const blink = Math.floor(this.t * 10) % 37 === 0;
    const f = blink ? INES![3] : INES![Math.floor(this.t * 2) % 3];
    drawSprite(r.w, f, this.x, this.y, { flip: tx < this.x });
    r.lightAt(this.x, this.y - 10, 50, 'O3', 0.35);
  }
}

// ───────────────────────── FloorArrows (decoration) ─────────────────────────
export class FloorArrows extends Entity implements LessonProp {
  readonly lessonProp = true as const;
  owner: Player | null = null;
  constructor(private x0: number, private x1: number, y: number) { super(); this.y = y; this.collides = false; }
  get sortY() { return -1e9; }
  renderGround(r: Renderer) {
    const ctx = r.w;
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = col('B3');
    for (let x = this.x0; x <= this.x1; x += 18) {
      const cx = Math.round(x), cy = Math.round(this.y);
      for (let k = 0; k < 4; k++) { ctx.fillRect(cx + k, cy - 3 + k, 1, 1); ctx.fillRect(cx + k, cy + 3 - k, 1, 1); }
    }
    ctx.globalAlpha = 1;
  }
}

/** is this entity a lesson prop? */
export const isLessonProp = (e: unknown): e is Entity & LessonProp => !!(e as { lessonProp?: boolean } | null)?.lessonProp;
