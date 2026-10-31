// 工头 THE FOREMAN — boss of the Sunken Gearworks.
// Phase 1: piston slam (shockwave rings), gear toss (ricochets), steam charge (stuns on walls).
// Phase 2 (60%): furnace door blows open; shift-whistle summons coglings, steam vents erupt.
import { Boss } from '../boss';
import type { Renderer } from '../../../engine/gfx/renderer';
import { drawSprite } from '../../../engine/gfx/sprite';
import { buildForeman, ForemanArt } from '../../../art/sprites/foreman';
import { Bullet } from '../projectile';
import { Cogling } from '../enemies/gearworks';
import { frand } from '../../../engine/rng';
import { angleTo, clamp, ease, TAU } from '../../../engine/math';
import { sfx } from '../../G';
import { L } from '../../i18n';
import { col } from '../../../art/palette';
import { rumble } from '../../../engine/rumble';

let ART: ForemanArt | null = null;

interface Vent { x: number; y: number; t: number }

export class Foreman extends Boss {
  bossName = L('工头', 'The Foreman');
  bossTitle = L('沉没齿轮厂的监工', 'Overseer of the Sunken Gearworks');
  atkA = 0;
  slamX = 0; slamY = 0; slamArm = 1;
  armL = { x: -24, y: -22 }; armR = { x: 24, y: -22 };
  chargeV = 0;
  tossN = 0;
  vents: Vent[] = [];
  queue: string[] = [];
  bob = 0;
  stepT = 0;

  constructor(x: number, y: number) {
    super(x, y, 1250);
    ART ??= buildForeman();
    this.r = 18; this.height = 48; this.speed = 30; this.kind = 'foreman'; this.codexId = 'foreman';
    this.debris = ['B2', 'B3', 'B4', 'K4', 'K5', 'O2'];
    this.contactDamage = 10;
  }

  updateIntro() {
    // stomps forward and roars (whistle)
    this.bob = Math.sin(this.age * 6) * 1;
    if (this.introT < 1.2 && this.introT + 1 / 60 >= 1.2) { sfx('waveStart'); this.world.shake(0.4); rumble(0.6, 0.4, 300); this.world.fx.smoke(this.x - 14, this.y - 52, 6, ['K9', 'K8', 'K7']); this.world.fx.smoke(this.x + 14, this.y - 52, 6, ['K9', 'K8', 'K7']); }
  }

  onPhase(p: number) {
    if (p === 1) {
      // furnace door blows off
      this.setState('phaseShift');
      this.world.fx.burst(this.x, this.y - 18, 40, ['W', 'O4', 'O3', 'O2'], 220, 0.7);
      this.world.fx.ring(this.x, this.y - 10, 6, 90, 0.5, 'O3', 3);
      this.world.shake(0.6);
      this.world.hitstop(0.15);
      sfx('slam');
      sfx('steam');
      rumble(1, 0.8, 500);
      this.speed = 38;
      this.queue = [];
    }
  }

  private nextAttack(): string {
    if (!this.queue.length) {
      const d = this.distT();
      const pool = this.phase === 0 ? ['slam', 'toss', 'charge', 'slam'] : ['slam', 'toss', 'charge', 'whistle', 'vents', 'slam'];
      this.queue = pool.sort(() => Math.random() - 0.5);
      if (d < 70) this.queue.unshift('slam');
    }
    return this.queue.shift()!;
  }

  think(dt: number) {
    const t = this.target;
    if (!t) return;
    this.bob = Math.sin(this.age * 4) * 1;
    // contact damage
    const p = this.world.player;
    if (p && Math.hypot(p.x - this.x, p.y - this.y) < this.r + 4 && this.state !== 'stunned') p.hurt({ amount: this.contactDamage, kind: 'contact', owner: this, x: this.x, y: this.y, knock: 200 });
    this.updateVents(dt);
    const restArms = () => {
      this.armL.x += (-24 - this.armL.x) * 0.15; this.armL.y += (-20 + Math.sin(this.age * 3) * 2 - this.armL.y) * 0.15;
      this.armR.x += (24 - this.armR.x) * 0.15; this.armR.y += (-20 + Math.cos(this.age * 3) * 2 - this.armR.y) * 0.15;
    };
    switch (this.state) {
      case 'idle':
      case 'walk': {
        restArms();
        const want = this.phase ? 0.9 : 1.3;
        if (this.distT() > 60) {
          this.moveTo(t.x, t.y, this.speed, dt);
          this.stepT -= dt;
          if (this.stepT <= 0) { this.stepT = 0.45; this.world.shake(0.05); sfx('clank', { vol: 0.25 }); this.world.fx.dust(this.x + frand(-10, 10), this.y, 3); }
        }
        this.faceTarget();
        if (this.stateT > want) this.setState(this.nextAttack());
        break;
      }
      case 'slam': {
        // raise an arm high, track the target, then slam
        if (this.stateT < dt * 1.5) { this.slamArm = t.x < this.x ? -1 : 1; sfx('bruteWind', { pan: this.world.pan(this.x) }); }
        const arm = this.slamArm < 0 ? this.armL : this.armR;
        const k = clamp(this.stateT / 0.8, 0, 1);
        if (this.stateT < 0.6) { this.slamX = t.x; this.slamY = t.y; }
        if (this.stateT < 0.8) { arm.x += (this.slamArm * 30 - arm.x) * 0.2; arm.y += (-58 - arm.y) * 0.2; }
        if (this.stateT >= 0.8 && this.stateT < 0.8 + dt * 1.5) {
          // crash down: arm reaches toward the slam point (max reach)
          const a = angleTo(this.x, this.y, this.slamX, this.slamY);
          const reach = Math.min(70, Math.hypot(this.slamX - this.x, this.slamY - this.y));
          this.slamX = this.x + Math.cos(a) * reach; this.slamY = this.y + Math.sin(a) * reach;
          arm.x = this.slamX - this.x; arm.y = this.slamY - this.y - 4;
          this.world.combat.add({ shape: { t: 'circle', x: this.slamX, y: this.slamY - 4, r: 22 }, team: 'enemy', life: 3, info: { amount: 16, kind: 'aoe', owner: this, x: this.slamX, y: this.slamY, knock: 260 } });
          this.shockRing(this.slamX, this.slamY, this.phase ? 150 : 110, 10, this.phase ? 170 : 140);
          this.world.fx.dust(this.slamX, this.slamY, 14);
          this.world.fx.scorch(this.slamX, this.slamY, 16);
          this.world.shake(0.55);
          sfx('slam', { pan: this.world.pan(this.slamX) });
          rumble(0.7, 0.5, 200);
        }
        this.attacking = this.stateT > 0.75 && this.stateT < 0.95;
        void k;
        if (this.stateT > 1.5) {
          if (this.phase && Math.random() < 0.5 && this.stateT < 1.6) { this.setState('slam'); this.stateT = 0.25; break; }
          this.setState('walk');
        }
        break;
      }
      case 'toss': {
        restArms();
        this.armR.y += (-46 - this.armR.y) * 0.2;
        if (this.stateT < dt * 1.5) { this.tossN = 0; sfx('cogWind', { pan: this.world.pan(this.x) }); }
        const n = this.phase ? 5 : 3;
        if (this.stateT > 0.6 && this.tossN < n && this.stateT > 0.6 + this.tossN * 0.18) {
          const base = angleTo(this.x, this.y - 30, t.x, t.y - 6);
          const a = base + (this.tossN - (n - 1) / 2) * 0.32;
          this.world.add(new Bullet({ team: 'enemy', x: this.x + 20, y: this.y - 36, ang: a, speed: 120, dmg: 9, style: 'gear', r: 5, owner: this, bounce: 2, life: 4, pal: ['W', 'O3', 'B2'] }));
          this.tossN++;
          sfx('spit', { pan: this.world.pan(this.x) });
        }
        this.attacking = this.stateT > 0.5 && this.stateT < 1.2;
        if (this.stateT > 1.6) this.setState('walk');
        break;
      }
      case 'charge': {
        if (this.stateT < 0.8) {
          // lower head, scrape the floor
          this.atkA = angleTo(this.x, this.y, t.x, t.y);
          restArms();
          this.armL.y += (-8 - this.armL.y) * 0.2; this.armR.y += (-8 - this.armR.y) * 0.2;
          if (Math.floor(this.stateT * 20) % 3 === 0) this.world.fx.dust(this.x, this.y, 1, this.atkA);
          if (this.stateT < dt * 1.5) sfx('steamWind', { pan: this.world.pan(this.x) });
        } else {
          this.attacking = true;
          if (this.stateT < 0.8 + dt * 1.5) { sfx('steam'); rumble(0.3, 0.3, 300); }
          const sp = this.phase ? 230 : 200;
          const hit = this.moveDir(this.atkA, sp, dt);
          this.world.fx.smoke(this.x - Math.cos(this.atkA) * 10, this.y - 30, 1, ['K9', 'K8']);
          if (hit || this.stateT > 2.2) {
            if (hit) {
              this.world.shake(0.7);
              this.world.hitstop(0.1);
              sfx('slam', { pan: this.world.pan(this.x) });
              rumble(0.8, 0.6, 300);
              this.world.fx.hitSparks(this.x + Math.cos(this.atkA) * 18, this.y - 20, this.atkA + Math.PI, 'crit', 40);
              // debris rain from the ceiling
              for (let i = 0; i < (this.phase ? 6 : 4); i++) {
                const rx = this.x + frand(-120, 120), ry = this.y + frand(-80, 80);
                if (!this.world.map.solidAt(rx, ry)) this.vents.push({ x: rx, y: ry, t: -0.6 - i * 0.12 });
              }
              this.setState('stunned');
            } else this.setState('walk');
          }
        }
        break;
      }
      case 'stunned':
        restArms();
        this.armL.y += (2 - this.armL.y) * 0.1; this.armR.y += (2 - this.armR.y) * 0.1;
        if (Math.floor(this.stateT * 6) % 2 === 0 && Math.floor((this.stateT - dt) * 6) % 2 !== 0) this.world.particles.spawn({ kind: 'px', x: this.x + frand(-8, 8), y: this.y - 54, vy: -20, life: 0.6, ramp: ['B6', 'B5'], layer: 'glow', size: 2 });
        if (this.stateT > (this.phase ? 1.4 : 1.8)) this.setState('walk');
        break;
      case 'whistle': {
        restArms();
        if (this.stateT < dt * 1.5) { sfx('waveStart'); this.world.fx.smoke(this.x - 14, this.y - 52, 8, ['K10', 'K9', 'K8']); this.world.fx.smoke(this.x + 14, this.y - 52, 8, ['K10', 'K9', 'K8']); this.world.fx.banner(this.x, this.y - 64, '— 换班！—', 'B5', 1); }
        if (this.stateT > 0.7 && this.stateT < 0.7 + dt * 1.5) {
          const n = this.world.aliveEnemies.length < 4 ? 3 : 1;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + frand(0, 1);
            const x = this.x + Math.cos(a) * 60, y = this.y + Math.sin(a) * 40;
            if (!this.world.map.solidAt(x, y) && !this.world.map.pitAt(x, y)) this.world.add(new Cogling(x, y));
          }
        }
        if (this.stateT > 1.4) this.setState('walk');
        break;
      }
      case 'vents': {
        restArms();
        this.armL.y += (-40 - this.armL.y) * 0.15; this.armR.y += (-40 - this.armR.y) * 0.15;
        if (this.stateT < dt * 1.5) {
          sfx('steamWind');
          // rings of vents centred on the target, then on the boss
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            this.vents.push({ x: t.x + Math.cos(a) * 34, y: t.y + Math.sin(a) * 24, t: -0.9 });
          }
          this.vents.push({ x: t.x, y: t.y, t: -1.4 });
          for (let i = 0; i < 6; i++) this.vents.push({ x: t.x + frand(-140, 140), y: t.y + frand(-90, 90), t: -1.2 - i * 0.15 });
        }
        if (this.stateT > 1.8) this.setState('walk');
        break;
      }
      case 'phaseShift':
        restArms();
        this.invuln = 0.1;
        if (this.stateT > 1.2) this.setState('whistle');
        break;
    }
  }

  private updateVents(dt: number) {
    for (let i = this.vents.length - 1; i >= 0; i--) {
      const v = this.vents[i];
      const prev = v.t;
      v.t += dt;
      if (prev < 0 && v.t >= 0) {
        this.world.combat.add({ shape: { t: 'circle', x: v.x, y: v.y - 4, r: 13 }, team: 'enemy', life: 6, info: { amount: 9, kind: 'aoe', owner: this, x: v.x, y: v.y, knock: 120 } });
        for (let k = 0; k < 6; k++) this.world.particles.spawn({ kind: 'smoke', x: v.x + frand(-4, 4), y: v.y, vx: frand(-10, 10), vy: frand(-120, -60), life: frand(0.5, 0.8), ramp: ['K10', 'K9', 'K8', 'K7'], size: 3, size2: 7, drag: 2, alpha: 0.8 });
        sfx('steam', { vol: 0.25, pan: this.world.pan(v.x) });
      }
      if (v.t > 0.5) this.vents.splice(i, 1);
    }
  }

  renderTelegraph(r: Renderer) {
    if (this.state === 'slam' && this.stateT < 0.8) this.teleCircle(r, this.slamX, this.slamY, 22, this.stateT / 0.8);
    if (this.state === 'charge' && this.stateT < 0.8) this.teleLine(r, this.x, this.y - 2, this.atkA, 260, this.r * 2, this.stateT / 0.8);
    for (const v of this.vents) if (v.t < 0) this.teleCircle(r, v.x, v.y, 13, clamp(1 + v.t / 0.9, 0, 1), 'O2');
  }

  render(r: Renderer) {
    const A = ART!;
    const ctx = r.w;
    const flip = this.flip;
    const bob = Math.round(this.bob);
    const x = this.x, y = this.y + bob;
    const tint = this.flash > 0 ? '#ffffff' : undefined;
    const intro = this.introT > 0 ? ease.outCubic(clamp(1 - (this.introT - 1.4) / 1.2, 0, 1)) : 1;
    ctx.globalAlpha = intro;
    // legs
    for (const s of [-1, 1]) {
      const lx = x + s * 9, phase = this.state === 'walk' ? Math.sin(this.age * 7 + (s > 0 ? Math.PI : 0)) : 0;
      const lift = Math.max(0, Math.round(phase * 2));
      ctx.fillStyle = col('K1'); ctx.fillRect(Math.round(lx) - 4, Math.round(y) - 12, 9, 12 - lift);
      ctx.fillStyle = col('K4'); ctx.fillRect(Math.round(lx) - 3, Math.round(y) - 12, 6, 10 - lift);
      ctx.fillStyle = col('K5'); ctx.fillRect(Math.round(lx) - 3, Math.round(y) - 12, 2, 10 - lift);
      ctx.fillStyle = col('B2'); ctx.fillRect(Math.round(lx) - 5, Math.round(y) - 3 - lift, 11, 3);
      ctx.fillStyle = col('B4'); ctx.fillRect(Math.round(lx) - 5, Math.round(y) - 3 - lift, 11, 1);
    }
    // arms behind/in front depending on position
    const drawArm = (arm: { x: number; y: number }, side: number) => {
      const sx = x + side * 20, sy = y - 38;
      const hx = x + arm.x, hy = y + arm.y;
      const ex = (sx + hx) / 2 + side * 6, ey = (sy + hy) / 2 + 4;
      const seg = (x0: number, y0: number, x1: number, y1: number, w: number, c1: string, c2: string) => {
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
        for (let i = 0; i <= n; i++) {
          const px = Math.round(x0 + ((x1 - x0) * i) / n), py = Math.round(y0 + ((y1 - y0) * i) / n);
          ctx.fillStyle = col('K0'); ctx.fillRect(px - (w >> 1) - 1, py - (w >> 1) - 1, w + 2, w + 2);
        }
        for (let i = 0; i <= n; i++) {
          const px = Math.round(x0 + ((x1 - x0) * i) / n), py = Math.round(y0 + ((y1 - y0) * i) / n);
          ctx.fillStyle = col(i % 6 < 1 ? c2 : c1); ctx.fillRect(px - (w >> 1), py - (w >> 1), w, w);
        }
      };
      seg(sx, sy, ex, ey, 6, 'K5', 'B4');
      seg(ex, ey, hx, hy, 5, 'K4', 'B3');
      ctx.fillStyle = col('B5'); ctx.fillRect(Math.round(ex) - 2, Math.round(ey) - 2, 4, 4);
      if (tint) {
        drawSprite(ctx, A.fist, hx, hy + 2, { flip: side < 0, tint });
      } else drawSprite(ctx, A.fist, hx, hy + 2, { flip: side < 0 });
    };
    if (this.armL.y < -30) drawArm(this.armL, -1);
    if (this.armR.y < -30) drawArm(this.armR, 1);
    const torso = this.phase ? A.torsoOpen : this.state === 'charge' || this.state === 'slam' ? A.torsoHot : A.torso;
    drawSprite(ctx, torso, x, y - 10, { tint, flip });
    const angry = this.phase > 0 || this.state === 'charge';
    const hy = y - 50 + (this.state === 'charge' && this.stateT < 0.8 ? 4 : 0) + (this.state === 'stunned' ? 3 : 0);
    drawSprite(ctx, angry ? A.headAngry : A.head, x + (flip ? -1 : 1), hy, { tint, flip });
    if (this.armL.y >= -30) drawArm(this.armL, -1);
    if (this.armR.y >= -30) drawArm(this.armR, 1);
    ctx.globalAlpha = 1;
    // lights: furnace + eyes
    r.lightAt(x, y - 18, this.phase ? 110 : 60, 'O2', this.phase ? 0.8 : 0.45);
    r.glowAt(x, hy - 4, 10, angry ? 'R3' : 'O3', 0.35);
    if (this.phase) r.glowAt(x, y - 16, 16, 'O3', 0.4 + Math.sin(this.age * 10) * 0.1);
    if (this.state === 'stunned') {
      // dizzy gears circling the head
      for (let i = 0; i < 3; i++) {
        const a = this.age * 5 + (i * TAU) / 3;
        r.u.fillStyle = col('B5');
        r.u.fillRect(Math.round(x + Math.cos(a) * 12), Math.round(hy - 12 + Math.sin(a) * 3), 2, 2);
      }
    }
  }

  renderGround(r: Renderer) {
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.5)';
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), 24, 8, 0, 0, TAU);
    ctx.fill();
    this.renderTelegraph(r);
  }
}
