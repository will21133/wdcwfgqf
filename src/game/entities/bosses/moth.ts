// 灯蛾女王 THE LANTERN MOTH — boss of the Verdigris Conservatory.
// Her wings carry lantern eyespots. In phase 2 she snuffs out the moonlight: only lanterns, you, and your
// echoes give light — rewinding literally lights the room.
import { Boss } from '../boss';
import type { Renderer } from '../../../engine/gfx/renderer';
import { PixelBuf } from '../../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, drawSprite } from '../../../engine/gfx/sprite';
import { rgb } from '../../../art/blit';
import { Bullet } from '../projectile';
import { frand } from '../../../engine/rng';
import { angleTo, clamp, ease, TAU, fbm2 } from '../../../engine/math';
import { sfx } from '../../G';
import { L, tr } from '../../i18n';
import { rumble } from '../../../engine/rumble';
import { findEnemy } from '../../world/director';

interface MothArt { wings: Sprite[]; body: Sprite; bodyAngry: Sprite }
let ART: MothArt | null = null;

function paintWing(span: number): Sprite {
  // full pair of wings (both sides) for a flap phase; span 1 = fully open
  const W = 120, H = 70;
  const pb = new PixelBuf(W, H);
  const cx = W / 2;
  for (let side = -1; side <= 1; side += 2) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W / 2; x++) {
        const u = x / (W / 2 * span); // 0 at body, 1 at wing tip
        if (u > 1) continue;
        const v = y / H;
        // upper wing: big rounded; lower wing: smaller, tail-like
        const upper = v < 0.55 && (Math.pow(u, 1.6) + Math.pow((v - 0.3) / 0.32, 2)) < 1;
        const lower = v >= 0.42 && (Math.pow(u / 0.7, 2) + Math.pow((v - 0.62) / 0.3, 2)) < 1;
        if (!upper && !lower) continue;
        const px = Math.round(cx + side * (x + 3));
        const n = fbm2(x * 0.15, y * 0.15, 11, 2);
        let c = 'T1';
        if (upper) {
          c = n > 0.55 ? 'T2' : 'T1';
          if (u > 0.85) c = 'K2';
          // veins
          if (Math.abs(Math.sin(Math.atan2(y - 18, x) * 7)) < 0.12 && u > 0.2) c = 'K3';
          // lantern eyespot
          const ex = 0.55, ey = 0.26;
          const d = Math.hypot(u - ex, (v - ey) * 1.6);
          if (d < 0.17) c = d < 0.07 ? 'O4' : d < 0.11 ? 'O3' : d < 0.14 ? 'O1' : 'K1';
          // pale scalloped edge
          if (u > 0.92 && ((y >> 1) & 1)) c = 'K8';
        } else {
          c = n > 0.5 ? 'V1' : 'V0';
          if (u > 0.82) c = 'K1';
          const d = Math.hypot(u - 0.42, (v - 0.66) * 1.5);
          if (d < 0.09) c = d < 0.04 ? 'K10' : 'B4';
        }
        pb.set(px, y, rgb(c));
      }
  }
  return spriteFromBuf(pb, cx, 30);
}

function paintBody(angry: boolean): Sprite {
  const pb = new PixelBuf(22, 46);
  const set = (x: number, y: number, c: string) => pb.set(x, y, rgb(c));
  // abdomen segments
  for (let y = 18; y < 44; y++) {
    const w = 7 - Math.max(0, y - 34) * 0.6;
    for (let x = -Math.round(w); x <= Math.round(w); x++) {
      const seg = (y - 18) % 5 === 0;
      set(11 + x, y, seg ? 'B1' : x < -w / 3 ? 'B4' : x > w / 3 ? 'B2' : 'B3');
    }
  }
  // fuzzy thorax
  for (let y = 8; y < 20; y++) for (let x = -7; x <= 7; x++) if (x * x / 49 + (y - 14) * (y - 14) / 36 < 1) set(11 + x, y, ((x + y) & 1) ? 'K9' : 'K8');
  // head
  for (let y = 2; y < 10; y++) for (let x = -5; x <= 5; x++) if (x * x / 25 + (y - 6) * (y - 6) / 16 < 1) set(11 + x, y, 'K7');
  // eyes
  for (const ex of [7, 15]) { set(ex, 6, angry ? 'R3' : 'O3'); set(ex, 7, angry ? 'R2' : 'O2'); set(ex + (ex < 11 ? 1 : -1), 6, angry ? 'R4' : 'O4'); }
  // feathery antennae
  for (let k = 0; k < 8; k++) { set(9 - k, 2 - Math.round(k * 0.3), 'K8'); set(13 + k, 2 - Math.round(k * 0.3), 'K8'); if (k % 2) { set(9 - k, 3 - Math.round(k * 0.3), 'K6'); set(13 + k, 3 - Math.round(k * 0.3), 'K6'); } }
  return spriteFromBuf(pb, 11, 44);
}

export class LanternMoth extends Boss {
  bossName = L('灯蛾女王', 'The Lantern Moth');
  bossTitle = L('不肯熄灭的月光', 'Moonlight That Will Not Go Out');
  phases = [0.5];
  hover = 0;
  flap = 0;
  queue: string[] = [];
  spiralA = 0;
  diveX = 0; diveY = 0;
  dark = 0;
  darkTarget = 0;
  homeX: number; homeY: number;
  driftT = 0;

  constructor(x: number, y: number) {
    super(x, y, 1700);
    ART ??= { wings: [1, 0.85, 0.62, 0.85].map(paintWing), body: paintBody(false), bodyAngry: paintBody(true) };
    this.r = 16; this.height = 60; this.kind = 'lanternmoth'; this.codexId = 'lanternmoth';
    this.debris = ['T2', 'T1', 'O3', 'K8', 'V1'];
    this.homeX = x; this.homeY = y;
    this.collides = false;
  }

  onPhase() {
    this.setState('snuff');
    sfx('waveStart');
    rumble(0.6, 0.4, 400);
  }

  private next(): string {
    if (!this.queue.length) this.queue = (this.phase ? ['spiral', 'dive', 'gust', 'swarm', 'spiral', 'dive', 'darkness'] : ['spiral', 'gust', 'dive', 'swarm', 'spiral']).sort(() => Math.random() - 0.5);
    return this.queue.shift()!;
  }

  think(dt: number) {
    const t = this.target;
    if (!t) return;
    this.flap += dt * (this.state === 'dive' ? 3 : 9);
    this.hover = Math.sin(this.age * 2) * 3;
    this.dark += (this.darkTarget - this.dark) * Math.min(1, dt * 2);
    this.world.darkness = this.dark * 0.85;
    this.faceTarget();
    switch (this.state) {
      case 'idle':
      case 'drift': {
        this.driftT += dt;
        const tx = this.homeX + Math.cos(this.driftT * 0.7) * 90, ty = this.homeY + Math.sin(this.driftT * 1.1) * 30;
        this.x += (tx - this.x) * Math.min(1, dt * 1.5);
        this.y += (ty - this.y) * Math.min(1, dt * 1.5);
        if (this.stateT > (this.phase ? 1.0 : 1.5)) this.setState(this.next());
        break;
      }
      case 'spiral': {
        if (this.stateT < dt * 1.5) { this.spiralA = frand(0, TAU); sfx('spitCharge'); }
        if (this.stateT > 0.6 && this.stateT < 3) {
          if (Math.floor(this.stateT * 14) !== Math.floor((this.stateT - dt) * 14)) {
            const arms = this.phase ? 5 : 4;
            for (let i = 0; i < arms; i++) {
              const a = this.spiralA + (i / arms) * TAU;
              this.world.add(new Bullet({ team: 'enemy', x: this.x, y: this.y - 34, ang: a, speed: 70, accel: 20, dmg: 8, style: 'orb', r: 3, owner: this, life: 5, pal: ['W', 'M3', 'M1'] }));
            }
            this.spiralA += this.phase ? 0.21 : 0.17;
            sfx('spit', { vol: 0.3 });
          }
        }
        this.attacking = this.stateT > 0.6;
        if (this.stateT > 3.4) this.setState('drift');
        break;
      }
      case 'gust': {
        if (this.stateT < dt * 1.5) sfx('steamWind');
        const k = clamp(this.stateT / 0.8, 0, 1);
        if (this.stateT >= 0.8 && this.stateT < 0.8 + dt * 1.5) {
          const a = angleTo(this.x, this.y, t.x, t.y);
          this.world.combat.add({ shape: { t: 'arc', x: this.x, y: this.y - 10, r: 150, a, w: 0.5 }, team: 'enemy', life: 3, info: { amount: 8, kind: 'aoe', owner: this, x: this.x, y: this.y, knock: 520 } });
          for (let i = 0; i < 40; i++) {
            const aa = a + frand(-0.5, 0.5), s = frand(150, 300);
            this.world.particles.spawn({ kind: 'streak', x: this.x, y: this.y - 10, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, life: frand(0.3, 0.6), ramp: ['K10', 'K9', 'T5'], layer: 'glow', drag: 2 });
          }
          sfx('steam');
          this.world.shake(0.3);
        }
        void k;
        this.attacking = this.stateT > 0.7 && this.stateT < 1;
        if (this.stateT > 1.4) this.setState('drift');
        break;
      }
      case 'dive': {
        // rise out of view, shadow hunts the player, then crash down
        if (this.stateT < 0.8) { this.z = ease.inCubic(this.stateT / 0.8) * 240; }
        else if (this.stateT < 2.2) {
          this.z = 240;
          this.diveX += (t.x - this.diveX) * Math.min(1, dt * 3);
          this.diveY += (t.y - this.diveY) * Math.min(1, dt * 3);
          if (this.stateT < 0.8 + dt * 1.5) { this.diveX = t.x; this.diveY = t.y; }
          this.x = this.diveX; this.y = this.diveY;
        } else if (this.stateT < 2.5) {
          this.z = (1 - ease.inCubic((this.stateT - 2.2) / 0.3)) * 240;
          if (this.z < 5 && this.z >= 0) {
            this.z = 0;
          }
        } else {
          if (this.stateT - dt < 2.5) {
            this.z = 0;
            this.world.combat.add({ shape: { t: 'circle', x: this.x, y: this.y - 6, r: 30 }, team: 'enemy', life: 3, info: { amount: 16, kind: 'aoe', owner: this, x: this.x, y: this.y, knock: 300 } });
            this.shockRing(this.x, this.y, 130, 9, 150, 'T5');
            this.world.fx.dust(this.x, this.y, 16);
            this.world.shake(0.6);
            sfx('slam');
            rumble(0.8, 0.6, 250);
          }
          if (this.stateT > 3.2) { this.homeX = clamp(this.x, 120, this.world.map.pw - 120); this.homeY = clamp(this.y - 30, 90, this.world.map.ph - 140); this.setState('drift'); }
        }
        this.attacking = this.stateT > 2.3 && this.stateT < 2.7;
        this.invuln = this.z > 40 ? 0.1 : 0;
        break;
      }
      case 'swarm': {
        if (this.stateT > 0.5 && this.stateT - dt <= 0.5) {
          const def = findEnemy('brassmoth') ?? findEnemy('moth') ?? findEnemy('mite');
          const n = this.world.aliveEnemies.length < 5 ? (this.phase ? 4 : 3) : 0;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            if (def) this.world.add(def.make(this.x + Math.cos(a) * 40, this.y + Math.sin(a) * 30));
          }
          sfx('wave');
          this.world.fx.burst(this.x, this.y - 30, 30, ['K10', 'T5', 'O3'], 160, 0.6);
        }
        if (this.stateT > 1.4) this.setState('drift');
        break;
      }
      case 'snuff':
      case 'darkness': {
        if (this.stateT < dt * 1.5) { this.darkTarget = 1; sfx('stasis'); this.world.fx.banner(this.x, this.y - 80, tr(L('— 熄灯 —', '— Lights Out —')), 'K7', 1.2); }
        if (this.stateT > (this.state === 'snuff' ? 1.2 : 6)) { if (this.state === 'darkness') this.darkTarget = 0.6; this.setState('drift'); }
        if (this.state === 'darkness' && Math.floor(this.stateT * 3) !== Math.floor((this.stateT - dt) * 3)) {
          // falling dust motes in the dark
          for (let i = 0; i < 3; i++) this.world.add(new Bullet({ team: 'enemy', x: t.x + frand(-120, 120), y: t.y - 140, ang: Math.PI / 2 + frand(-0.2, 0.2), speed: 70, dmg: 6, style: 'orb', r: 2, owner: this, life: 4, pal: ['W', 'O3', 'O1'] }));
        }
        break;
      }
    }
  }

  renderTelegraph(r: Renderer) {
    if (this.state === 'gust' && this.stateT < 0.8) { const t = this.target; if (t) this.teleCone(r, this.x, this.y, angleTo(this.x, this.y, t.x, t.y), 150, 0.5, this.stateT / 0.8); }
    if (this.state === 'dive' && this.stateT > 0.8 && this.stateT < 2.5) this.teleCircle(r, this.diveX, this.diveY, 30, clamp((this.stateT - 0.8) / 1.6, 0, 1));
  }

  renderGround(r: Renderer) {
    const ctx = r.w;
    const s = 1 - Math.min(0.7, this.z / 300);
    ctx.fillStyle = 'rgba(11,10,20,0.45)';
    ctx.beginPath(); ctx.ellipse(Math.round(this.x), Math.round(this.y), 40 * s, 10 * s, 0, 0, TAU); ctx.fill();
    this.renderTelegraph(r);
  }

  render(r: Renderer) {
    const A = ART!;
    const y = this.y - 26 + this.hover - this.z;
    const fi = Math.floor(this.flap) % 4;
    const tint = this.flash > 0 ? '#ffffff' : undefined;
    drawSprite(r.w, A.wings[fi], this.x, y, { tint });
    drawSprite(r.w, this.phase ? A.bodyAngry : A.body, this.x, y + 18, { tint });
    // lantern eyespots light the room
    const span = [1, 0.85, 0.62, 0.85][fi];
    for (const s of [-1, 1]) {
      const ex = this.x + s * (3 + 0.55 * 60 * span), ey = y - 30 + 0.26 * 70;
      r.lightAt(ex, ey, 90, 'O3', 0.8);
      r.glowAt(ex, ey, 10, 'O3', 0.5);
    }
  }

  die(info: Parameters<Boss['die']>[0]) {
    this.darkTarget = 0;
    this.world.darkness = 0;
    this.z = 0;
    super.die(info);
  }
}
