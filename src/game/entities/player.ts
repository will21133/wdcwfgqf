// 滴答 Tick — the living second hand.
import { Actor } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { drawSprite, Sprite, spriteFromDef } from '../../engine/gfx/sprite';
import { buildTick, TickFrames, Dir, KEY_FRAMES, KEY_PAL } from '../../art/sprites/tick';
import { G, sfx } from '../G';
import { Recorder, Recording } from '../systems/rewind';
import { Weapon, Wielder, Pose } from '../weapons/weapon';
import { Rapier } from '../weapons/rapier';
import { makeWeapon } from '../weapons';
import { Scarf } from './scarf';
import { Afterimage } from './fxents';
import { Echo } from './echo';
import { angleTo, clamp, angleDiff, ease, TAU } from '../../engine/math';
import { frand } from '../../engine/rng';
import type { DamageInfo } from '../systems/combat';
import { VIEW_W, VIEW_H } from '../../engine/gfx/post';
import { col } from '../../art/palette';
import { rumble } from '../../engine/rumble';
import { settings } from '../settings';

let FRAMES: TickFrames | null = null;
let KEYS: Sprite[] = [];
export function tickFrames() {
  if (!FRAMES) {
    FRAMES = buildTick();
    KEYS = KEY_FRAMES.map((rows) => spriteFromDef({ rows, pal: KEY_PAL, ox: 3, oy: 2 }));
  }
  return FRAMES;
}
export function keySprites() { tickFrames(); return KEYS; }

export const enum Anim { Idle, Run, Dash, Hurt, Attack }

export interface PlayerPoseSnapshot { dir: Dir; flip: boolean; anim: Anim; animT: number; pose: Pose }

export class Player extends Actor implements Wielder {
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
  recorder = new Recorder(180);
  echoes: Echo[] = [];
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
  // rewind cinematic
  rewinding: { rec: Recording; t: number; dur: number; fromX: number; fromY: number } | null = null;
  rewindFx = 0;
  fixedTaken = 0;
  lastSafeX = 0; lastSafeY = 0;
  /** control lock (cutscenes, room transitions) */
  locked = false;
  hurtT = 0;
  deadT = 0;
  stepT = 0;
  lastEchoTouch = 0;

  constructor(x: number, y: number) {
    super();
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
  get mods() { return this.world.run!.mods; }

  added() {
    this.world.player = this;
    this.weapon = makeWeapon(this.run.weapon);
    this.hp = this.run.hp;
    this.maxHp = this.mods.maxHp;
    this.dashCharges = this.mods.dashCharges;
    this.recorder.setWindow(this.mods.rewindWindow);
  }

  // ───────────────────────── update ─────────────────────────
  update(dt: number) {
    const inp = G.input;
    const m = this.mods;
    this.maxHp = m.maxHp;
    this.animT += dt;
    this.keyAngle += dt * (this.rewinding ? -40 : this.anim === Anim.Run ? 7 : 2.5);
    if (this.hurtT > 0) this.hurtT -= dt;
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = frand(2, 5);

    if (this.rewinding) { this.updateRewind(dt); this.syncRun(); return; }
    if (this.hp <= 0) { this.deadT += dt; return; }

    // dash charges
    if (this.dashCharges < m.dashCharges) {
      this.dashRecharge += dt;
      if (this.dashRecharge >= m.dashCd) { this.dashRecharge = 0; this.dashCharges++; }
    }

    const mv = this.locked ? { x: 0, y: 0 } : inp.move();
    this.moveX = mv.x; this.moveY = mv.y;
    this.updateAim(mv);

    // inputs
    const attackPressed = !this.locked && inp.pressed('attack');
    const specialPressed = !this.locked && inp.pressed('special');
    const dashPressed = !this.locked && inp.pressed('dash');
    const rewindPressed = !this.locked && inp.pressed('rewind');

    if (rewindPressed) this.tryRewind();
    if (this.rewinding) return;

    if (dashPressed && this.dashT <= 0 && this.dashCharges > 0 && this.falling <= 0) this.startDash();

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.world.move(this, this.dashVX * dt, this.dashVY * dt);
      if (Math.floor(this.dashT * 60) % 2 === 0) this.afterimage('C3', 0.18, 0.45);
      if (this.dashT <= 0) {
        this.airborne = false;
        this.world.bus.emit('dashEnd', { owner: this, echo: false });
      }
    } else {
      // weapon
      this.weapon.update(dt, {
        attackPressed, attackHeld: !this.locked && inp.down('attack'), specialPressed,
        specialHeld: !this.locked && inp.down('special'), specialReleased: inp.released('special'),
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
    if (this.weapon.busy || G.input.mouseAim || G.input.padAimX || G.input.padAimY) this.setFacing(this.aim);
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

    // paradox: touch your own echo
    for (const e of this.echoes) {
      if (e.dead || !e.paradoxReady) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) < 11) { this.paradox(e); break; }
    }
    this.echoes = this.echoes.filter((e) => !e.dead);

    this.record();
    this.updateScarf(dt);
    this.syncRun();
  }

  private syncRun() { this.run.hp = this.hp; }

  private updateAim(mv: { x: number; y: number }) {
    const inp = G.input;
    if (inp.bot) { if (inp.bot.aimX || inp.bot.aimY) this.aim = Math.atan2(inp.bot.aimY, inp.bot.aimX); return; }
    if (inp.mouseAim) {
      const v = this.world.cam.view();
      const fx = Math.floor(v.x), fy = Math.floor(v.y);
      this.aim = angleTo(this.x - fx, this.y - 8 - fy, inp.mx, inp.my);
    } else if (Math.hypot(inp.padAimX, inp.padAimY) > 0.3) {
      this.aim = Math.atan2(inp.padAimY, inp.padAimX);
    } else {
      let base = this.aim;
      if (mv.x || mv.y) base = Math.atan2(mv.y, mv.x);
      // soft aim assist toward the nearest enemy within a cone
      let best: number | null = null, bd = settings.aimAssist ? 150 : 0;
      for (const e of this.world.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d > bd) continue;
        const a = angleTo(this.x, this.y, e.x, e.y);
        if (Math.abs(angleDiff(base, a)) < 0.9) { bd = d; best = a; }
      }
      this.aim = best ?? base;
    }
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
    rumble(0, 0.25, 60);
    this.world.bus.emit('dash', { owner: this, dx, dy, echo: false });
    // perfect dodge check: enemy projectile/hitbox nearby
    if (this.world.enemies.some((e) => (e as any).attacking && Math.hypot(e.x - this.x, e.y - this.y) < 40)) {
      this.world.bus.emit('perfectDodge', { x: this.x, y: this.y });
    }
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

  // ───────────────────────── recording & rewind ─────────────────────────
  private record() {
    const pose = this.weapon.pose(this.aim);
    this.recorder.push({
      x: this.x, y: this.y, dir: this.dir === 'down' ? 0 : this.dir === 'up' ? 1 : 2, flip: this.flip,
      anim: this.anim, animT: this.animT, wa: pose.angle, we: pose.ext, wv: pose.vis,
      hp: this.hp, fixed: this.fixedTaken, air: this.dashT > 0,
    });
  }

  canRewind() { return this.run.charges >= 1 && this.recorder.length >= 20 && !this.rewinding && this.hp > 0 && this.falling <= 0; }

  tryRewind(auto = false) {
    if (!this.canRewind() && !auto) {
      if (!this.rewinding && this.hp > 0) { sfx('denied', { vol: 0.6 }); this.world.fx.banner(this.x, this.y - 30, this.run.charges < 1 ? '时砂不足' : '……', 'K7', 0.6); }
      return;
    }
    if (this.recorder.length < 2) return;
    if (!auto) this.run.charges--;
    const rec = this.recorder.take();
    this.rewinding = { rec, t: 0, dur: 0.42, fromX: this.x, fromY: this.y };
    this.ignoreFreeze = true;
    this.world.frozen = true;
    this.weapon.cancel();
    this.dashT = 0; this.lungeT = 0; this.vx = this.vy = 0;
    this.world.stats.rewinds++;
    sfx('rewind');
    rumble(0.1, 0.5, 400);
    G.audio.muffle(true, 1400);
    G.audio.duck(0.3, 0.6);
  }

  private updateRewind(dt: number) {
    const R = this.rewinding!;
    R.t += dt;
    const k = Math.min(1, R.t / R.dur);
    const frames = R.rec.frames;
    const idx = Math.round((1 - ease.inOutQuad(k)) * (frames.length - 1));
    const f = frames[idx];
    this.x = f.x; this.y = f.y;
    this.dir = f.dir === 0 ? 'down' : f.dir === 1 ? 'up' : 'side';
    this.flip = f.flip;
    this.anim = f.anim as Anim;
    this.animT = f.animT;
    if (Math.floor(R.t * 60) % 2 === 0) this.afterimage('C3', 0.35, 0.55);
    this.updateScarf(dt);
    this.rewindFx = Math.sin(k * Math.PI);
    if (k >= 1) this.finishRewind();
  }

  private finishRewind() {
    const R = this.rewinding!;
    const m = this.mods;
    const first = R.rec.frames[0];
    this.x = first.x; this.y = first.y;
    const fixedDuring = this.fixedTaken - first.fixed;
    const restoreTo = m.noRewindHeal ? this.hp : Math.max(this.hp, Math.min(this.maxHp, first.hp - fixedDuring));
    const restored = restoreTo - this.hp;
    this.hp = restoreTo;
    this.rewinding = null;
    this.ignoreFreeze = false;
    this.world.frozen = false;
    this.rewindFx = 0;
    this.invuln = Math.max(this.invuln, m.rewindInvuln);
    this.hurtT = 0;
    // retire oldest echo if at cap
    const alive = this.echoes.filter((e) => !e.dead);
    while (alive.length >= m.maxEchoes) { const old = alive.shift()!; old.shatter(false); }
    const echo = this.world.add(new Echo(R.rec, this.weapon, m.echoDmg, m.echoSpeed));
    this.echoes.push(echo);
    if (m.mirrorEcho) {
      // mirrored twin: reflect the path horizontally around the start point
      const sx = R.rec.frames[0].x;
      const mir = {
        frames: R.rec.frames.map((f) => ({ ...f, x: sx - (f.x - sx), flip: !f.flip, wa: Math.PI - f.wa })),
        events: R.rec.events.map((e) => ({ ...e, angle: e.angle !== undefined ? Math.PI - e.angle : undefined, dx: e.dx !== undefined ? -e.dx : undefined })),
      };
      // keep mirrored path inside walkable space
      if (mir.frames.every((f) => !this.world.map.solidAt(f.x, f.y))) this.echoes.push(this.world.add(new Echo(mir, this.weapon, m.echoDmg * 0.5, m.echoSpeed)));
    }
    this.recorder.clear();
    this.scarfA.reset(this.x, this.y - 10);
    this.scarfB.reset(this.x, this.y - 10);
    if (restored > 0) this.world.fx.number(this.x, this.y - 26, restored, 'C3', true);
    this.world.fx.ring(this.x, this.y - 6, 2, 34, 0.35, 'C3', 2);
    this.world.fx.burst(this.x, this.y - 8, 14, ['C4', 'C3', 'C2'], 120, 0.4);
    this.world.shake(0.2);
    sfx('rewindEnd');
    rumble(0.45, 0.3, 140);
    G.audio.muffle(false);
    this.world.bus.emit('rewind', { fromX: R.fromX, fromY: R.fromY, toX: this.x, toY: this.y, restored });
    this.world.bus.emit('echoSpawn', { echo });
  }

  private paradox(e: Echo) {
    const m = this.mods;
    const w = this.world;
    const x = (e.x + this.x) / 2, y = (e.y + this.y) / 2;
    const dmg = m.paradoxDmg * m.dmg;
    for (const t of w.enemiesNear(x, y - 4, m.paradoxRadius)) {
      t.hurt({ amount: dmg, kind: 'paradox', owner: this, x, y, knock: 260, src: 'paradox', hitstop: 0.02 });
    }
    w.fx.ring(x, y - 4, 4, m.paradoxRadius + 6, 0.45, 'C4', 3);
    w.fx.ring(x, y - 4, 2, m.paradoxRadius * 0.7, 0.3, 'W', 2);
    w.fx.burst(x, y - 6, 30, ['W', 'C4', 'C3', 'C2'], 240, 0.55);
    w.fx.banner(x, y - 34, '悖论！', 'C3', 0.9);
    w.hitstop(0.1);
    w.shake(0.45);
    w.stats.paradoxes++;
    if (settings.flashes) G.r.params.flash = 0.35;
    sfx('paradox');
    rumble(1, 0.8, 260);
    G.audio.duck(0.4, 0.7);
    w.bus.emit('paradox', { x, y, echo: e });
    if (!m.paradoxKeepsEcho) e.shatter(true);
    else e.paradoxReady = false;
  }

  // ───────────────────────── damage ─────────────────────────
  hurt(info: DamageInfo): number {
    if (this.hp <= 0 || this.rewinding) return 0;
    if ((this.invuln > 0 || this.dashT > 0) && !info.pierceInvuln) return 0;
    const m = this.mods;
    if (this.run.shieldReady) {
      this.run.shieldReady = false;
      this.invuln = 0.6;
      this.world.fx.banner(this.x, this.y - 30, '封蜡', 'B5', 0.8);
      this.world.fx.ring(this.x, this.y - 8, 4, 22, 0.3, 'B5', 2);
      sfx('clank');
      return 0;
    }
    let amt = Math.max(1, Math.round(info.amount * (1 - m.armor) * (1 + 0.1 * this.run.overwind)));
    if (info.fixed) this.fixedTaken += amt;
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
    w.fx.hitSparks(this.x, this.y - 10, info.x !== undefined ? Math.atan2(this.y - (info.y ?? 0), this.x - info.x) : 0, 'blood', amt);
    w.hitstop(0.09);
    w.shake(0.38);
    w.stats.hitsTaken++;
    G.r.params.hurt = 1;
    sfx('hurt');
    rumble(0.55, 0.8, 180);
    w.bus.emit('damaged', { info, dealt: amt });
    if (this.hp <= 0) {
      if (this.run.autoRewindLeft > 0 && this.recorder.length > 10) {
        this.run.autoRewindLeft--;
        this.hp = 1;
        this.tryRewind(true);
        w.fx.banner(this.x, this.y - 36, '最后一秒！', 'C3', 1.2);
        return amt;
      }
      if (this.run.revivesUsed < m.revives) {
        this.run.revivesUsed++;
        this.hp = Math.round(this.maxHp * 0.4);
        this.invuln = 2;
        w.fx.banner(this.x, this.y - 36, '第二根发条', 'B5', 1.4);
        w.fx.ring(this.x, this.y - 8, 4, 60, 0.6, 'B5', 3);
        w.fx.burst(this.x, this.y - 8, 30, ['W', 'B6', 'B4'], 180, 0.6);
        for (const e of w.enemiesNear(this.x, this.y, 70)) e.hurt({ amount: 20, kind: 'aoe', owner: this, x: this.x, y: this.y, knock: 300 });
        sfx('rewindEnd');
        return amt;
      }
      this.hp = 0;
      this.deadT = 0;
      sfx('playerDeath');
    }
    return amt;
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
    const F = tickFrames();
    switch (this.anim) {
      case Anim.Run: return F.run[this.dir][Math.floor(this.animT * 12) % 6];
      case Anim.Dash: return F.dash[this.dir];
      case Anim.Hurt: return F.hurt[this.dir];
      default:
        if (this.blinkT < 0 && this.dir !== 'up') return F.blink[this.dir];
        return F.idle[this.dir][Math.floor(this.animT * 4) % 4];
    }
  }

  private updateScarf(dt: number) {
    const F = tickFrames();
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
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.45)';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), 6, 2.5, 0, 0, TAU);
    ctx.fill();
  }

  render(r: Renderer) {
    if (this.hp <= 0 && this.deadT > 0.05) return this.renderDead(r);
    const ctx = r.w;
    const spr = this.currentSprite();
    const fall = this.falling > 0 ? this.falling / 0.55 : 1;
    if (this.falling > 0) {
      drawSprite(ctx, spr, this.x, this.y + (1 - fall) * 6, { flip: this.flip, sx: fall, sy: fall, alpha: fall });
      return;
    }
    const blink = this.invuln > 0 && this.hurtT <= 0 && !this.rewinding && this.dashT <= 0 && Math.floor(this.world.time * 20) % 2 === 0;
    const F = tickFrames();
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
    drawSprite(ctx, spr, this.x, this.y, { flip: this.flip, tint, alpha: blink ? 0.4 : 1 });
    if (!weaponBehind) this.weapon.drawHeld(r, hx, hy, pose);
    if (scarfFront) {
      drawSprite(ctx, key, this.x, this.y - 11, { flip: this.flip });
      this.scarfB.draw(ctx);
      this.scarfA.draw(ctx);
    }
    // heart-lamp: the player always carries a little warm light
    r.lightAt(this.x, this.y - 8, 70, 'O3', 0.55);
    r.lightAt(this.x, this.y - 8, 26, 'K10', 0.25);
  }

  renderUnlit(r: Renderer) {
    // aim reticle (mouse) is drawn by HUD; here: future path of echoes
    for (const e of this.echoes) if (!e.dead) e.renderPath(r);
    // low-HP heartbeat outline
    if (this.hp > 0 && this.hp / this.maxHp < 0.25 && Math.floor(this.world.time * 3) % 2 === 0) {
      const spr = this.currentSprite();
      drawSprite(r.u, spr, this.x, this.y, { flip: this.flip, tint: 'R3', alpha: 0.35 });
    }
  }

  private renderDead(r: Renderer) {
    // scattered parts handled by death fx; draw collapsed head
    const F = tickFrames();
    drawSprite(r.w, F.hurt.down, this.x, this.y + 2, { sy: 0.6, alpha: Math.max(0, 1 - this.deadT * 0.5) });
  }

  /** helper for HUD: player position in view coords */
  viewPos(): [number, number] {
    const v = this.world.cam.view();
    return [clamp(this.x - Math.floor(v.x), 0, VIEW_W), clamp(this.y - Math.floor(v.y), 0, VIEW_H)];
  }
  get colorKey() { return col('R3'); }
}
