// Enemy base: spawn-in, state machine helpers, steering (flow field + LOS), telegraphs, death & drops.
import { Actor, Entity } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { drawSprite, Sprite, DrawOpts } from '../../engine/gfx/sprite';
import { angleTo, TAU, clamp } from '../../engine/math';
import { frand } from '../../engine/rng';
import { Pickup } from './pickup';
import { sfx } from '../G';
import type { DamageInfo } from '../systems/combat';
import { col } from '../../art/palette';
import { coopScale } from '../world/coopScale';
import { ownerPlayer, slotColor } from '../players';
import type { Player } from './player';

/** what a windup draws on the ground (Enemy.windup's `tele`; GDD2 §4.7 colours) */
export type TeleSpec =
  | { kind: 'line'; ang: number; len: number; width: number; x?: number; y?: number; color?: string }
  | { kind: 'circle'; r: number; x?: number; y?: number; color?: string }
  | { kind: 'cone'; ang: number; len: number; half: number; x?: number; y?: number; color?: string };
export interface WindupOpts {
  /** a heavy hit in the last 0.18 s cancels it (default true; armored windups never) */
  interruptible?: boolean;
  /** gold-outlined super armour: only a Break cancels it (GDD2 §4.1) */
  armored?: boolean;
  tele?: TeleSpec;
}
export type StaggerWhy = 'hit' | 'interrupt' | 'break' | 'wall';
/** the last stretch of a windup flashes white; a heavy hit inside it interrupts (GDD2 §4.1, §4.7) */
export const INTERRUPT_WINDOW = 0.18;
/** Break (GDD2 §4.4): stagger, cap growth after a Break, idle time before the bar drains, drain rate */
export const BREAK_T = 2.5, BREAK_T_BOSS = 3, BREAK_GROWTH = 1.25, POISE_IDLE = 2, POISE_DRAIN = 8;

const RIM: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export abstract class Enemy extends Actor {
  state = 'idle';
  stateT = 0;
  spawnT = 0.8;
  spawnDur = 0.8;
  speed = 40;
  /** palette used for death debris */
  debris = ['B3', 'B2', 'K5', 'K4'];
  brass: [number, number] = [1, 3];
  sandDrop = 0;
  flip = false;
  attacking = false;
  /** visual squash from hits/landing */
  squash = 0;
  wanderA = frand(0, TAU);
  codexId = '';
  /** elite modifier aura */
  aura = false;
  /** elite glow colour */
  auraColor = 'O1';
  tier = 1;
  /** the windup under way (Enemy.windup): its state, length and armour; null otherwise */
  wind: { state: string; dur: number; interruptible: boolean; armored: boolean; tele?: TeleSpec } | null = null;
  /** true during the last 0.18 s of an interruptible windup (the enemy flashes white) */
  interruptWindow = false;
  /**
   * Break bar (GDD2 §4.4, PLAN2 §1.9): points so far / cap (0 = this enemy has no bar) / seconds of
   * Break left (stunned, takes +50%). P1 sets poiseMax on elites, bosses and heavies.
   */
  poise = 0;
  poiseMax = 0;
  breakT = 0;
  private poiseIdle = 0;
  /** P2 fills: elite affixes */
  affixes: string[] = [];

  constructor(x: number, y: number, hp: number) {
    super();
    this.x = x; this.y = y;
    this.hp = this.maxHp = hp;
    this.team = 'enemy';
    this.solid = true;
  }

  /** 0 → 1 over the spawn-in animation */
  get spawnK() { return clamp(1 - this.spawnT / this.spawnDur, 0, 1); }

  added() {
    const ow = this.world.run?.overwind ?? 0;
    if (ow > 0 && !(this as any).owApplied) { (this as any).owApplied = true; this.maxHp = Math.round(this.maxHp * (1 + 0.15 * ow)); this.hp = this.maxHp; }
    // co-op health scaling (GDD2 §5.8); bullets and fire rates never scale
    const n = this.world.playerCount;
    if (n > 1 && !(this as any).coopApplied) {
      (this as any).coopApplied = true;
      const sc = coopScale(n);
      this.maxHp = Math.round(this.maxHp * (this.isBoss || this.isElite ? sc.eliteHp : sc.enemyHp));
      this.hp = this.maxHp;
    }
    this.spawnDur = Math.max(0.01, this.spawnT);
    sfx('spawn', { vol: 0.5, pan: this.world.pan(this.x) });
  }

  /**
   * Who this enemy is after (PLAN2 §1.4, GDD2 §5.8): the standing hand (or taunting echo) with the
   * best aggro score, held at least 1.5 s. Solo: the player while standing (1.0).
   */
  get target(): Actor | null { return this.world.targetFor(this); }
  /** slot of the hand being targeted (telegraph tip dots); -1 when none */
  get targetSlot(): number { return this.world.targetSlotFor(this); }
  distT() { const t = this.target; return t ? Math.hypot(t.x - this.x, t.y - this.y) : 9999; }
  angT() { const t = this.target; return t ? angleTo(this.x, this.y, t.x, t.y) : 0; }

  setState(s: string) {
    this.state = s; this.stateT = 0; this.attacking = false;
    if (this.wind && this.wind.state !== s) { this.wind = null; this.interruptWindow = false; }
  }

  /**
   * Enter an attack's windup (PLAN2 §1.9, GDD2 §4.1): `state` for `dur` seconds. The last 0.18 s
   * flash white and set interruptWindow (a heavy hit then interrupts it), unless it is armored
   * (gold outline: only a Break stops it). `tele` is drawn on the ground while it lasts. The
   * enemy's own think() still moves on when stateT passes dur.
   */
  windup(state: string, dur: number, o: WindupOpts = {}): void {
    this.setState(state);
    const armored = !!o.armored;
    this.wind = { state, dur, interruptible: o.interruptible !== false && !armored, armored, tele: o.tele };
    this.interruptWindow = false;
  }
  /** 0 → 1 over the current windup (0 when none) */
  get windupK(): number { return this.wind ? clamp(this.stateT / Math.max(0.01, this.wind.dur), 0, 1) : 0; }

  /**
   * Stagger for `t` seconds (PLAN2 §1.9). The state timer pauses while staggered (1.0 kept counting
   * it, so a windup finished during a stagger). An interrupt cancels an interruptible windup; a
   * Break cancels any windup, armored or not (cancelAttack()).
   */
  stagger(t: number, why: StaggerWhy): void {
    if (t <= 0 || this.dead) return;
    this.hitstun = Math.max(this.hitstun, t);
    this.attacking = false;
    const w = this.wind;
    if (w && (why === 'break' || (why === 'interrupt' && w.interruptible))) { this.wind = null; this.interruptWindow = false; this.cancelAttack(why); }
    if (why === 'break') this.breakT = Math.max(this.breakT, t);
    if (why !== 'hit') this.squash = Math.max(this.squash, 0.5);
  }
  /** an interrupt or Break cancelled the attack being wound up; default: back to 'idle' */
  cancelAttack(_why: StaggerWhy) { this.setState('idle'); }

  /**
   * Break damage (GDD2 §4.4; P1 tunes the sources). Filling the bar Breaks the enemy: a 2.5 s
   * stagger (bosses 3 s) that cancels its attack, +50% damage taken, and the cap grows 25%.
   */
  addPoise(n: number, by?: Player | null): void {
    if (this.poiseMax <= 0 || this.breakT > 0 || !(n > 0) || this.dead) return;
    this.poise += n;
    this.poiseIdle = 0;
    if (this.poise < this.poiseMax) return;
    const w = this.world;
    this.poise = 0;
    this.stagger(this.isBoss ? BREAK_T_BOSS : BREAK_T, 'break');
    this.poiseMax = Math.round(this.poiseMax * BREAK_GROWTH);
    w.fx.ring(this.x, this.y - this.height / 2, 4, 40, 0.45, 'B5', 3);
    w.fx.burst(this.x, this.y - this.height / 2, 24, ['W', 'B6', 'B4', 'K6'], 200, 0.6);
    w.hitstop(0.14);
    w.shake(0.4);
    sfx('stasisBreak', { pan: w.pan(this.x) });
    w.bus.emit('poiseBreak', { player: by ?? undefined, target: this });
  }

  update(dt: number) {
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      this.invuln = 0.1;
      if (this.spawnT <= 0) { this.world.fx.dust(this.x, this.y, 6); this.squash = 0.4; }
      return;
    }
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 3);
    this.vx = this.vy = 0;
    if (this.breakT > 0) this.breakT = Math.max(0, this.breakT - dt);
    if (this.poise > 0) { this.poiseIdle += dt; if (this.poiseIdle > POISE_IDLE) this.poise = Math.max(0, this.poise - POISE_DRAIN * dt); }
    // staggered: the state timer holds still (GDD2 §4.4 fix — a windup no longer runs out under a stagger)
    if (this.st.stun > 0 || this.hitstun > 0) { this.attacking = false; this.interruptWindow = false; this.onStagger(dt); return; }
    this.stateT += dt;
    const wd = this.wind;
    if (wd && this.state !== wd.state) this.wind = null;
    this.interruptWindow = !!this.wind && this.wind.interruptible && this.stateT >= this.wind.dur - INTERRUPT_WINDOW && this.stateT < this.wind.dur;
    // nobody left standing (every hand stopped, a ghost, or the solo Last Second): hold still
    if (!this.target) { this.attacking = false; return; }
    this.think(dt);
  }

  abstract think(dt: number): void;
  onStagger(_dt: number) {}

  /** steer toward target using LOS or flow field */
  moveTo(tx: number, ty: number, speed: number, dt: number) {
    let dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    if (!this.world.map.los(this.x, this.y - 2, tx, ty - 2) || this.blockedAhead(dx / d, dy / d)) {
      // follow the field toward the hand we are after when that is where we are heading
      const t = this.world.playerCount > 1 ? this.target : null;
      const slot = t && Math.hypot(t.x - tx, t.y - ty) < 32 ? (ownerPlayer(t)?.slot ?? -1) : -1;
      const f = this.world.flowDir(this.x, this.y, slot);
      if (f) { dx = f.x; dy = f.y; }
    }
    const l = Math.hypot(dx, dy) || 1;
    const sp = speed * this.speedMul;
    this.vx = (dx / l) * sp; this.vy = (dy / l) * sp;
    this.world.move(this, this.vx * dt, this.vy * dt);
    if (Math.abs(dx) > 2) this.flip = dx < 0;
  }

  private blockedAhead(nx: number, ny: number) {
    const m = this.world.map;
    const px = this.x + nx * 12, py = this.y + ny * 12;
    return m.solidAt(px, py) || m.pitAt(px, py);
  }

  moveDir(ang: number, speed: number, dt: number): boolean {
    const vx = Math.cos(ang) * speed * this.speedMul, vy = Math.sin(ang) * speed * this.speedMul;
    // avoid walking into pits voluntarily
    const m = this.world.map;
    if (m.pitAt(this.x + Math.cos(ang) * 8, this.y + Math.sin(ang) * 8)) return true;
    return this.world.move(this, vx * dt, vy * dt);
  }

  faceTarget() { const t = this.target; if (t) this.flip = t.x < this.x; }

  onDeath(info: DamageInfo) {
    const w = this.world;
    if (info.kind !== 'fall') w.fx.shatter(this, this.debris, this.isElite ? 2 : this.r > 8 ? 1.5 : 1);
    sfx(this.isElite || this.isBoss ? 'deathBig' : 'death', { pan: w.pan(this.x) });
    w.hitstop(this.isElite ? 0.12 : 0.05);
    w.shake(this.isElite ? 0.4 : 0.15);
    if (info.kind === 'fall') return;
    // drops
    const run = w.run;
    // Brass income: the killer's Brass multiplier, and more hands find more coins (GDD2 §5.8)
    const by = ownerPlayer(info.owner) ?? w.player;
    const mul = by && run ? run.lo(by.slot).mods.brassMul : 1;
    const nb = Math.round(frand(this.brass[0], this.brass[1]) * mul * coopScale(w.playerCount).brass);
    for (let i = 0; i < nb; i++) w.add(new Pickup(this.x, this.y - 4, 'brass', 1));
    if (this.sandDrop) for (let i = 0; i < this.sandDrop; i++) w.add(new Pickup(this.x, this.y - 4, 'sand', 10));
  }

  // ─── rendering helpers ───
  drawBody(r: Renderer, s: Sprite, o: DrawOpts = {}) {
    const k = this.squash;
    const sx = 1 + k * 0.25, sy = 1 - k * 0.2;
    // the interrupt window blinks white (GDD2 §4.7: "the last 0.18 s of a windup flashes white")
    const iw = this.interruptWindow && Math.floor(this.world.time * 30) % 2 === 0;
    const tint = this.flash > 0 || iw ? '#ffffff' : this.st.stasis > 0 ? undefined : o.tint;
    let spr = s;
    if (this.st.stasis > 0) spr = s.recolor(['V0', 'V1', 'V2', 'V3', 'V4']);
    const opts: DrawOpts = { flip: this.flip, ...o, tint };
    if (k > 0.02) { opts.sx = sx; opts.sy = sy; }
    if (this.spawnT > 0) {
      const p = this.spawnK;
      opts.alpha = p;
      opts.sy = 0.3 + p * 0.7;
      opts.sx = 1.4 - p * 0.4;
    }
    if (this.falling > 0) {
      const f = this.falling / 0.55;
      opts.sx = f; opts.sy = f; opts.alpha = f;
    }
    // an armored windup (super armour) wears a gold rim (GDD2 §4.7)
    if (this.wind?.armored && this.spawnT <= 0) for (const [ox, oy] of RIM) drawSprite(r.w, spr, this.x + ox, this.y + oy, { ...opts, tint: 'B5' });
    drawSprite(r.w, spr, this.x, this.y + (this.falling > 0 ? (1 - this.falling / 0.55) * 8 : 0), opts);
    if (this.isElite) {
      r.g.globalCompositeOperation = 'lighter';
      drawSprite(r.g, spr, this.x, this.y, { flip: this.flip, tint: this.auraColor, alpha: 0.18 + Math.sin(this.age * 6) * 0.06 });
      r.g.globalCompositeOperation = 'source-over';
    }
  }

  renderGround(r: Renderer) {
    if (this.falling > 0) return;
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.45)';
    ctx.beginPath();
    const s = this.spawnT > 0 ? Math.max(0.05, this.spawnK) : 1;
    ctx.ellipse(Math.round(this.x), Math.round(this.y), this.r * 1.3 * s, this.r * 0.55 * s, 0, 0, TAU);
    ctx.fill();
    if (this.spawnT > 0) this.renderSpawn(r);
    const tl = this.wind?.tele;
    if (tl) {
      const k = this.windupK, x = tl.x ?? this.x, y = tl.y ?? this.y - 2;
      if (tl.kind === 'line') this.teleLine(r, x, y, tl.ang, tl.len, tl.width, k, tl.color);
      else if (tl.kind === 'circle') this.teleCircle(r, x, y, tl.r, k, tl.color);
      else this.teleCone(r, x, y, tl.ang, tl.len, tl.half, k, tl.color);
    }
    this.renderTelegraph(r);
  }

  renderSpawn(r: Renderer) {
    // brass summoning circle with ticking marks
    const k = this.spawnK;
    const ctx = r.u;
    const R = 10 + this.r;
    ctx.strokeStyle = col('B4');
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), R * (0.5 + k * 0.5), R * 0.45 * (0.5 + k * 0.5), 0, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + k * 2;
      ctx.fillStyle = col(i % 3 ? 'B3' : 'B6');
      ctx.fillRect(Math.round(this.x + Math.cos(a) * R), Math.round(this.y + Math.sin(a) * R * 0.45), 1, 1);
    }
    ctx.globalAlpha = 1;
    r.lightAt(this.x, this.y, 40, 'B4', 0.5 * Math.sin(k * Math.PI));
  }

  renderTelegraph(_r: Renderer) {}

  /** red danger line on the ground: fills from thin to full width as k → 1 */
  teleLine(r: Renderer, x: number, y: number, ang: number, len: number, width: number, k: number, color = 'R3') {
    const ctx = r.u;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(ang);
    const w = Math.max(1, width * clamp(k, 0.15, 1));
    ctx.globalAlpha = 0.28 + k * 0.25;
    ctx.fillStyle = col(color);
    ctx.fillRect(0, -w / 2, len, w);
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, -width / 2, len * k, 1);
    ctx.fillRect(0, width / 2 - 1, len * k, 1);
    if (k > 0.85 && Math.floor(this.world.time * 30) % 2 === 0) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5; ctx.fillRect(0, -w / 2, len, w); }
    ctx.restore();
    ctx.globalAlpha = 1;
    this.teleTip(r, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  }

  /** co-op: a dot in the target's colour at the tip of a telegraph says whom it is aimed at (GDD2 §5.2) */
  teleTip(r: Renderer, x: number, y: number) {
    if (this.world.playerCount < 2) return;
    const s = this.targetSlot;
    if (s < 0) return;
    const ctx = r.u;
    const px = Math.round(x), py = Math.round(y);
    ctx.fillStyle = col('K0');
    ctx.fillRect(px - 2, py - 2, 4, 4);
    ctx.fillStyle = col(slotColor(s));
    ctx.fillRect(px - 1, py - 1, 2, 2);
  }

  teleCircle(r: Renderer, x: number, y: number, rad: number, k: number, color = 'R3') {
    const ctx = r.u;
    ctx.globalAlpha = 0.22 + k * 0.2;
    ctx.fillStyle = col(color);
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), rad, rad, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = col(color);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), rad * k, rad * k, 0, 0, TAU);
    ctx.stroke();
    if (k > 0.85 && Math.floor(this.world.time * 30) % 2 === 0) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), rad, rad, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  teleCone(r: Renderer, x: number, y: number, ang: number, len: number, half: number, k: number, color = 'R3') {
    const ctx = r.u;
    ctx.globalAlpha = 0.2 + k * 0.2;
    ctx.fillStyle = col(color);
    ctx.beginPath();
    ctx.moveTo(Math.round(x), Math.round(y));
    ctx.arc(Math.round(x), Math.round(y), len, ang - half, ang + half);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = col(color);
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), len * k, ang - half, ang + half);
    ctx.stroke();
    ctx.globalAlpha = 1;
    this.teleTip(r, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  }

  /** small HP pip bar shown after being damaged (and the brass Break bar under it once it has any) */
  renderUnlit(r: Renderer) {
    if (this.hp >= this.maxHp || this.dead || this.isBoss || this.spawnT > 0) return;
    const w = Math.max(10, Math.round(this.r * 2.5));
    const x = Math.round(this.x - w / 2), y = Math.round(this.y - this.height - 6);
    const ctx = r.u;
    if (this.poiseMax > 0 && (this.poise > 0 || this.breakT > 0)) {
      ctx.fillStyle = col('K0');
      ctx.fillRect(x - 1, y + 4, w + 2, 3);
      ctx.fillStyle = col(this.breakT > 0 ? 'B6' : 'B4');
      ctx.fillRect(x, y + 5, this.breakT > 0 ? w : Math.max(1, Math.round((w * this.poise) / this.poiseMax)), 1);
    }
    ctx.fillStyle = col('K0');
    ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = col('K3');
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = col(this.isElite ? 'O2' : 'R3');
    ctx.fillRect(x, y, Math.max(1, Math.round((w * this.hp) / this.maxHp)), 2);
    // status pips
    let px = x;
    const pip = (c: string, n: number) => { for (let i = 0; i < Math.min(n, 10); i++) { ctx.fillStyle = col(c); ctx.fillRect(px, y + 3, 1, 1); px += 2; } };
    if (this.st.burn) pip('O3', this.st.burn);
    if (this.st.rust) pip('T4', this.st.rust);
    if (this.st.resonance) pip('U4', this.st.resonance);
  }
}
