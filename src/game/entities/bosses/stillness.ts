// 静止 THE STILLNESS — the final boss: Ines's grief, the second that refused to end.
// Phase 1 "Grief": sweeping clock hands, frozen tears.
// Phase 2 "Stop": she STOPS TIME — you are frozen, only your echoes still move. Prepare echoes before it hits.
// Phase 3 "Let Go": all of her damage becomes fixed (it cannot be undone).
import { Boss } from '../boss';
import type { Renderer } from '../../../engine/gfx/renderer';
import { PixelBuf } from '../../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, drawSprite, RotCache } from '../../../engine/gfx/sprite';
import { rgb } from '../../../art/blit';
import { Bullet } from '../projectile';
import { Entity } from '../entity';
import { frand } from '../../../engine/rng';
import { angleTo, clamp, ease, TAU, bayer } from '../../../engine/math';
import { sfx, G } from '../../G';
import { L, tr } from '../../i18n';
import { col } from '../../../art/palette';
import { rumbleAll } from '../../../engine/rumble';
import type { DamageInfo } from '../../systems/combat';
import { findEnemy } from '../../world/director';

interface Art { body: Sprite[]; halo: RotCache; haloBroken: RotCache }
let ART: Art | null = null;

function paintBody(breath: number): Sprite {
  const pb = new PixelBuf(44, 84);
  const set = (x: number, y: number, c: string) => pb.set(x, y, rgb(c));
  const cx = 22;
  // dress flowing down, dissolving into the stopped second
  for (let y = 28; y < 84; y++) {
    const t = (y - 28) / 56;
    const w = 7 + t * 14 + Math.sin(y * 0.3 + breath) * 1.2;
    for (let x = -Math.round(w); x <= Math.round(w); x++) {
      if (t > 0.65 && bayer(x + 44, y) < (t - 0.65) * 2.6) continue;
      let c = x < -w * 0.45 ? 'K3' : x > w * 0.45 ? 'K0' : 'K1';
      if (Math.abs(x) < 2 && y > 40) c = 'V0';
      set(cx + x, y, c);
    }
  }
  // veil over head and shoulders
  for (let y = 0; y < 34; y++) {
    const w = y < 14 ? 4 + y * 0.55 : 11 + (y - 14) * 0.2;
    for (let x = -Math.round(w); x <= Math.round(w); x++) {
      let c = x < -w * 0.4 ? 'K4' : x > w * 0.5 ? 'K1' : 'K2';
      if (y < 2) c = 'K4';
      set(cx + x, y + 2, c);
    }
  }
  // porcelain face under the veil
  for (let y = 9; y < 22; y++) for (let x = -5; x <= 5; x++) if (x * x / 25 + (y - 15) * (y - 15) / 42 < 1) set(cx + x, y, x > 2 ? 'K8' : 'K9');
  // closed eyes, tear track, crack
  set(cx - 3, 14, 'K3'); set(cx - 2, 14, 'K3'); set(cx + 2, 14, 'K3'); set(cx + 3, 14, 'K3');
  set(cx - 2, 16, 'U3'); set(cx - 2, 17, 'U3'); set(cx - 2, 19, 'U4');
  set(cx + 1, 9, 'K5'); set(cx + 2, 10, 'K5'); set(cx + 2, 11, 'K5'); set(cx + 3, 12, 'K5');
  set(cx - 1, 19, 'K6'); set(cx, 19, 'K6'); set(cx + 1, 19, 'K6');
  // clasped porcelain hands holding a stopped pocket watch
  for (let y = 36; y < 41; y++) for (let x = -4; x <= 4; x++) set(cx + x, y, x < 0 ? 'K9' : 'K8');
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) set(cx + x, 38 + y, x * x + y * y > 2 ? 'B4' : 'K10');
  set(cx, 37, 'R3');
  return spriteFromBuf(pb, cx, 83);
}

function paintHalo(broken: boolean): Sprite {
  const R = 34, S = R * 2 + 6;
  const pb = new PixelBuf(S, S);
  const c = S / 2;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (broken && a > 0.3 && a < 1.2) continue;
      if (d > R || d < R - 4) continue;
      const tick = Math.abs(((a / TAU) * 60 + 600) % 1 - 0.5) > 0.42;
      pb.set(x, y, rgb(d > R - 1 ? 'B5' : d < R - 3 ? 'B2' : tick ? 'K10' : 'B4'));
    }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    if (broken && a > 0.3 && a < 1.2) continue;
    for (let k = 0; k < 4; k++) pb.set(Math.round(c + Math.cos(a) * (R - 6 - k)), Math.round(c + Math.sin(a) * (R - 6 - k)), rgb('K10'));
  }
  return spriteFromBuf(pb, c, c, 'K0');
}

/** a giant clock hand sweeping the arena from a pivot */
class SweepHand extends Entity {
  t = 0;
  constructor(public cx: number, public cy: number, public ang: number, public speed: number, public len: number, public width: number, public dur: number, public owner: Stillness, public warn = 0.9) { super(); this.x = cx; this.y = cy; }
  update(dt: number) {
    this.t += dt;
    if (this.t > this.warn) this.ang += this.speed * dt;
    if (this.t > this.warn) {
      const p = this.world.player;
      if (p) {
        const vx = Math.cos(this.ang), vy = Math.sin(this.ang);
        const along = (p.x - this.cx) * vx + (p.y - this.cy) * vy;
        const across = Math.abs(-(p.x - this.cx) * vy + (p.y - this.cy) * vx);
        if (along > 0 && along < this.len && across < this.width / 2 + 3) p.hurt({ amount: 12, kind: 'aoe', owner: this.owner, x: this.cx, y: this.cy, knock: 160, fixed: this.owner.phase >= 2 });
      }
    }
    if (this.t > this.warn + this.dur) this.kill();
  }
  renderUnlit(r: Renderer) {
    const ctx = r.u;
    const live = this.t > this.warn;
    ctx.save();
    ctx.translate(Math.round(this.cx), Math.round(this.cy));
    ctx.rotate(this.ang);
    if (!live) {
      const k = this.t / this.warn;
      ctx.globalAlpha = 0.25 + k * 0.4;
      ctx.fillStyle = col('R3');
      ctx.fillRect(0, -this.width / 2, this.len, this.width);
    } else {
      // a tapered clock hand with a pointed tip and a counterweight ring
      const fixed = this.owner.phase >= 2;
      const hw = this.width / 2, L = this.len;
      const shape = (grow: number) => {
        ctx.beginPath();
        ctx.moveTo(-12 - grow, 0);
        ctx.lineTo(0, -hw - grow);
        ctx.lineTo(L * 0.82, -hw * 0.45 - grow);
        ctx.lineTo(L + grow * 2, 0);
        ctx.lineTo(L * 0.82, hw * 0.45 + grow);
        ctx.lineTo(0, hw + grow);
        ctx.closePath();
      };
      ctx.fillStyle = col('K0'); shape(1.5); ctx.fill();
      ctx.fillStyle = col(fixed ? 'V2' : 'B3'); shape(0); ctx.fill();
      ctx.fillStyle = col(fixed ? 'V4' : 'B5'); ctx.fillRect(0, -hw + 1, L * 0.8, 1);
      // counterweight ring near the pivot
      ctx.strokeStyle = col('K0'); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(-14, 0, 6, 0, TAU); ctx.stroke();
      ctx.strokeStyle = col(fixed ? 'V3' : 'B4'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-14, 0, 6, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (live) for (let k = 0; k < this.len; k += 40) r.lightAt(this.cx + Math.cos(this.ang) * k, this.cy + Math.sin(this.ang) * k, 30, this.owner.phase >= 2 ? 'V3' : 'B4', 0.4);
  }
}

export class Stillness extends Boss {
  bossName = L('静止', 'The Stillness');
  bossTitle = L('不肯走完的最后一秒', 'The Second That Would Not End');
  phases = [0.66, 0.3];
  float = 0;
  queue: string[] = [];
  haloA = 0;
  stopT = -1;
  stopDmg = 0;
  tears: Bullet[] = [];
  told = false;
  cx = 0; cy = 0;

  constructor(x: number, y: number) {
    super(x, y, 3200);
    ART ??= { body: [0, 1, 2, 3].map((b) => paintBody(b * 1.5)), halo: new RotCache(paintHalo(false), 32), haloBroken: new RotCache(paintHalo(true), 32) };
    this.r = 14; this.height = 80; this.kind = 'stillness'; this.codexId = 'stillness';
    this.debris = ['K10', 'K9', 'K2', 'B4', 'V3', 'U3'];
    this.collides = false;
    this.introT = 3.4;
  }

  added() { super.added(); this.cx = this.x; this.cy = this.y + 60; }

  onPhase(p: number) {
    this.queue = [];
    if (p === 1) { this.setState('stop'); }
    if (p === 2) {
      this.setState('letgo');
      this.world.fx.banner(this.x, this.y - 100, tr(L('有些事，无法撤销。', 'Some things cannot be undone.')), 'V4', 2.4);
      sfx('waveStart');
      rumbleAll(0.8, 0.5, 600);
    }
  }

  onHurt(info: DamageInfo, dealt: number) {
    if (this.stopT >= 0 && info.echo) {
      // the past strikes harder in a stopped moment
      this.stopDmg += dealt;
      this.hp = Math.max(1, this.hp - dealt); // double damage
      this.world.fx.number(this.x + frand(-10, 10), this.y - 70, dealt, 'C4', true);
    }
  }

  private next(): string {
    if (!this.queue.length) {
      this.queue = this.phase === 0 ? ['hands', 'tears', 'wave', 'hands', 'tears']
        : this.phase === 1 ? ['hands', 'tears', 'stop', 'wave', 'phantoms', 'hands', 'stop']
          : ['hands', 'tears', 'stop', 'wave', 'hands', 'tears', 'phantoms'];
      this.queue.sort(() => Math.random() - 0.5);
    }
    return this.queue.shift()!;
  }

  private get fixed() { return this.phase >= 2; }

  think(dt: number) {
    const t = this.target;
    if (!t) return;
    this.float = Math.sin(this.age * 1.2) * 4;
    this.haloA -= dt * (this.stopT >= 0 ? 3 : 0.4);
    switch (this.state) {
      case 'idle':
      case 'drift': {
        const tx = this.cx + Math.cos(this.age * 0.5) * (this.phase >= 2 ? 120 : 60), ty = this.cy - 60 + Math.sin(this.age * 0.8) * 20;
        this.x += (tx - this.x) * Math.min(1, dt * 1.2);
        this.y += (ty - this.y) * Math.min(1, dt * 1.2);
        if (this.stateT > (this.phase >= 2 ? 0.7 : 1.1)) this.setState(this.next());
        break;
      }
      case 'hands': {
        if (this.stateT < dt * 1.5) {
          const base = angleTo(this.cx, this.cy, t.x, t.y);
          const sp = this.phase >= 1 ? 1.1 : 0.85;
          this.world.add(new SweepHand(this.cx, this.cy, base + 1.2, sp, 230, 10, 3.6, this));
          this.world.add(new SweepHand(this.cx, this.cy, base + 1.2 + Math.PI, sp, 170, 14, 3.6, this));
          if (this.phase >= 2) this.world.add(new SweepHand(this.cx, this.cy, base - 0.6, -sp * 1.4, 200, 6, 3.6, this, 1.2));
          sfx('bruteWind');
        }
        if (this.stateT > 2.4) this.setState('drift');
        break;
      }
      case 'tears': {
        if (this.stateT < dt * 1.5) {
          this.tears = [];
          const n = this.phase >= 1 ? 20 : 14;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            const b = new Bullet({ team: 'enemy', x: this.x, y: this.y - 50, ang: a, speed: 140, dmg: 9, style: 'orb', r: 3, owner: this, life: 6, fixed: this.fixed, pal: this.fixed ? undefined : ['W', 'U4', 'U2'] });
            this.tears.push(b);
            this.world.add(b);
          }
          sfx('spitCharge');
        }
        // freeze mid-air, then all re-aim at the player
        if (this.stateT > 0.45 && this.stateT - dt <= 0.45) { for (const b of this.tears) b.speed = 0; sfx('stasis'); }
        if (this.stateT > 1.5 && this.stateT - dt <= 1.5) {
          for (const b of this.tears) if (!b.dead) { b.ang = angleTo(b.x, b.y, t.x, t.y - 8); b.speed = 150; }
          sfx('spit');
        }
        this.attacking = this.stateT > 1.4 && this.stateT < 1.8;
        if (this.stateT > 2) this.setState('drift');
        break;
      }
      case 'wave': {
        for (const tt of [0.6, 1.1, 1.6]) if (this.stateT >= tt && this.stateT - dt < tt) {
          this.shockRing(this.x, this.y, 180, 10, 130, this.fixed ? 'V4' : 'U4', this.fixed);
          sfx('wave');
        }
        if (this.stateT > 2.2) this.setState('drift');
        break;
      }
      case 'phantoms': {
        if (this.stateT > 0.5 && this.stateT - dt <= 0.5) {
          const def = findEnemy('echophantom') ?? findEnemy('phantom') ?? findEnemy('sentry');
          if (def && this.world.aliveEnemies.length < 4) for (let i = 0; i < 2; i++) this.world.add(def.make(this.x + (i ? 60 : -60), this.y + 30));
          sfx('wave');
        }
        if (this.stateT > 1.2) this.setState('drift');
        break;
      }
      case 'stop': {
        // 1.3s warning: the dial ticks backward. Then time stops for 3.2s.
        if (this.stateT < dt * 1.5) {
          sfx('rewind');
          this.world.fx.banner(this.x, this.y - 100, tr(L('时间……要停了', 'Time... is about to stop')), 'K10', 1.3);
          if (!this.told) { this.told = true; this.world.fx.banner(t.x, t.y - 40, tr(L('只有{c:残响}能在时停中行动——先回溯！', 'Only {c:echoes} move in stopped time — rewind now!')), 'C3', 2.4); }
        }
        if (this.stateT >= 1.3 && this.stopT < 0) {
          this.stopT = 0;
          this.stopDmg = 0;
          this.world.frozen = true;
          (this as any).ignoreFreeze = true;
          for (const e of this.world.player?.echoes ?? []) (e as any).ignoreFreeze = true;
          sfx('stasisBreak');
          G.audio.muffle(true, 500);
          rumbleAll(0.3, 0.9, 400);
        }
        if (this.stopT >= 0) {
          this.stopT += dt;
          this.world.timeStop = Math.min(1, this.stopT * 4);
          if (this.stopDmg > this.maxHp * 0.05) {
            // the past broke her focus
            this.endStop(true);
            break;
          }
          if (this.stopT > 3.2) this.endStop(false);
        }
        break;
      }
      case 'shattered':
        if (this.stateT > 1.8) this.setState('drift');
        break;
      case 'letgo':
        this.invuln = 0.1;
        if (this.stateT > 2.4) this.setState('drift');
        break;
    }
  }

  private endStop(broken: boolean) {
    this.stopT = -1;
    this.world.frozen = false;
    this.world.timeStop = 0;
    (this as any).ignoreFreeze = false;
    for (const e of this.world.player?.echoes ?? []) (e as any).ignoreFreeze = false;
    G.audio.muffle(false);
    if (broken) {
      this.world.fx.banner(this.x, this.y - 100, tr(L('过去击碎了静止！', 'The past shatters the stillness!')), 'C3', 1.6);
      this.world.fx.burst(this.x, this.y - 50, 50, ['C4', 'C3', 'K10'], 220, 0.8);
      this.world.shake(0.6);
      sfx('paradox');
      rumbleAll(1, 0.7, 400);
      this.setState('shattered');
    } else {
      // the gathered second explodes outward
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * TAU;
        this.world.add(new Bullet({ team: 'enemy', x: this.x, y: this.y - 50, ang: a, speed: 150, dmg: 12, style: 'big', r: 4, owner: this, life: 4, fixed: true }));
      }
      this.shockRing(this.x, this.y, 220, 14, 170, 'V4', true);
      this.world.shake(0.7);
      sfx('slam');
      rumbleAll(0.9, 0.9, 400);
      this.setState('drift');
    }
  }

  die(info: DamageInfo) {
    if (this.stopT >= 0) this.endStop(true);
    this.world.timeStop = 0;
    super.die(info);
  }

  render(r: Renderer) {
    const A = ART!;
    const y = this.y + this.float - 8;
    const halo = (this.phase >= 1 ? A.haloBroken : A.halo).get(this.haloA);
    const tint = this.flash > 0 ? '#ffffff' : undefined;
    drawSprite(r.w, halo, this.x, y - 50);
    drawSprite(r.w, A.body[Math.floor(this.age * 3) % 4], this.x, y, { tint });
    r.lightAt(this.x, y - 50, 120, this.fixed ? 'V3' : 'K10', 0.6);
    r.glowAt(this.x, y - 50, 30, this.fixed ? 'V3' : 'B4', 0.25 + (this.stopT >= 0 ? 0.3 : 0));
    if (this.state === 'stop' && this.stopT < 0) {
      // warning: a ghostly dial over the arena ticking backward
      const k = clamp(this.stateT / 1.3, 0, 1);
      const ctx = r.u;
      ctx.globalAlpha = 0.25 * k;
      ctx.strokeStyle = col('K10');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, 140, 0, TAU); ctx.stroke();
      const a = -Math.PI / 2 - k * 4;
      ctx.beginPath(); ctx.moveTo(this.cx, this.cy); ctx.lineTo(this.cx + Math.cos(a) * 130, this.cy + Math.sin(a) * 130); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  renderGround(r: Renderer) {
    r.w.fillStyle = 'rgba(11,10,20,0.35)';
    r.w.beginPath(); r.w.ellipse(Math.round(this.x), Math.round(this.y), 18, 6, 0, 0, TAU); r.w.fill();
  }
}

void ease;
