import type { Renderer } from '../../engine/gfx/renderer';
import type { World } from './world';
import type { Actor } from '../entities/entity';
import { frand, fpick } from '../../engine/rng';
import { G } from '../G';
import { col, rgba } from '../../art/palette';
import { TAU } from '../../engine/math';

interface Num { x: number; y: number; vy: number; vx: number; t: number; img: HTMLCanvasElement; big: boolean }
interface Ring { x: number; y: number; r0: number; r1: number; t: number; dur: number; color: string; width: number; layer: 'glow' | 'unlit' }
interface Banner { text: string; t: number; dur: number; color: string; x: number; y: number }

export class FX {
  nums: Num[] = [];
  rings: Ring[] = [];
  banners: Banner[] = [];
  constructor(private w: World) {}

  update(dt: number) {
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      n.y += n.vy * dt;
      n.x += n.vx * dt;
      n.vy += 140 * dt;
      if (n.vy > 10) n.vy = 10;
      if (n.t > 0.75) this.nums.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.dur) this.rings.splice(i, 1);
    }
    for (let i = this.banners.length - 1; i >= 0; i--) {
      this.banners[i].t += dt;
      if (this.banners[i].t > this.banners[i].dur) this.banners.splice(i, 1);
    }
  }

  render(r: Renderer) {
    const u = r.u;
    for (const rg of this.rings) {
      const k = rg.t / rg.dur;
      const e = 1 - Math.pow(1 - k, 3);
      const rad = rg.r0 + (rg.r1 - rg.r0) * e;
      const ctx = rg.layer === 'glow' ? r.g : u;
      if (rg.layer === 'glow') ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col(rg.color);
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = Math.max(1, rg.width * (1 - k));
      ctx.beginPath();
      ctx.ellipse(Math.round(rg.x), Math.round(rg.y), rad, rad * 0.72, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const n of this.nums) {
      const pop = n.t < 0.06 ? 2 : 1;
      const a = n.t > 0.55 ? 1 - (n.t - 0.55) / 0.2 : 1;
      u.globalAlpha = Math.max(0, a);
      const w = n.img.width * pop, h = n.img.height * pop;
      u.drawImage(n.img, Math.round(n.x - w / 2), Math.round(n.y - h / 2), w, h);
      u.globalAlpha = 1;
    }
    for (const b of this.banners) {
      const k = b.t / b.dur;
      const a = k < 0.1 ? k / 0.1 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const yo = k < 0.1 ? (1 - k / 0.1) * 6 : 0;
      G.font.draw(u, b.text, b.x, b.y - yo - k * 8, { color: b.color, align: 'center', outline: 'K0', alpha: a });
    }
  }

  number(x: number, y: number, amt: number, color: string, big: boolean) {
    const v = Math.round(amt);
    if (v <= 0) return;
    // merge with a very recent number at the same spot (dot ticks)
    const img = (big ? G.digits : G.digits).render(String(v), color, 'K0', big ? 'B6' : undefined);
    this.nums.push({ x: x + frand(-4, 4), y, vy: big ? -95 : -70, vx: frand(-12, 12), t: 0, img, big });
  }

  banner(x: number, y: number, text: string, color = 'K10', dur = 1.1) {
    this.banners.push({ text, x, y, t: 0, dur, color });
  }

  ring(x: number, y: number, r0: number, r1: number, dur: number, color: string, width = 2, layer: 'glow' | 'unlit' = 'glow') {
    this.rings.push({ x, y, r0, r1, t: 0, dur, color, width, layer });
  }

  hitSparks(x: number, y: number, ang: number, style: 'normal' | 'crit' | 'echo' | 'blood', amt: number) {
    const P = this.w.particles;
    const n = Math.min(14, 4 + Math.floor(amt / 6));
    const ramp = style === 'echo' ? ['C4', 'C3', 'C2'] : style === 'blood' ? ['R4', 'R3', 'R2'] : style === 'crit' ? ['W', 'B6', 'B5', 'O2'] : ['W', 'B6', 'B4'];
    for (let i = 0; i < n; i++) {
      const a = ang + frand(-0.7, 0.7);
      const s = frand(90, 260);
      P.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: frand(0.12, 0.3), ramp, drag: 8, layer: 'glow', size: 1.5 });
    }
    // impact flash
    P.spawn({ kind: 'smoke', x, y, life: 0.08, ramp: style === 'echo' ? ['C4'] : ['W'], size: style === 'crit' ? 7 : 5, size2: 1, layer: 'glow' });
    // oil / gear chips from automatons
    if (style !== 'echo' && style !== 'blood') {
      for (let i = 0; i < 3; i++) {
        const a = ang + frand(-1, 1);
        P.spawn({ kind: 'debris', x, y, z: 6, vx: Math.cos(a) * frand(30, 90), vy: Math.sin(a) * frand(30, 90), vz: frand(40, 90), grav: 300, life: frand(0.5, 0.9), ramp: [fpick(['B3', 'K6', 'B2'])], size: 1 });
      }
    }
  }

  burst(x: number, y: number, n: number, ramp: string[], speed = 120, life = 0.4, layer: 'world' | 'glow' | 'unlit' = 'glow', kind: 'px' | 'spark' = 'spark') {
    for (let i = 0; i < n; i++) {
      const a = frand(0, TAU), s = frand(speed * 0.3, speed);
      this.w.particles.spawn({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.75, life: frand(life * 0.5, life), ramp, drag: 5, layer, size: 1.5 });
    }
  }

  dust(x: number, y: number, n = 4, dir?: number) {
    for (let i = 0; i < n; i++) {
      const a = dir !== undefined ? dir + Math.PI + frand(-0.8, 0.8) : frand(0, TAU);
      const s = frand(10, 35);
      this.w.particles.spawn({ kind: 'smoke', x: x + frand(-3, 3), y: y + frand(-1, 1), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 6, life: frand(0.3, 0.55), ramp: ['K7', 'K6', 'K5'], size: frand(1.5, 2.5), size2: frand(3, 4.5), drag: 4, alpha: 0.55 });
    }
  }

  smoke(x: number, y: number, n = 6, ramp = ['K7', 'K6', 'K5', 'K4']) {
    for (let i = 0; i < n; i++) {
      this.w.particles.spawn({ kind: 'smoke', x: x + frand(-5, 5), y: y + frand(-4, 4), vx: frand(-15, 15), vy: frand(-30, -10), life: frand(0.5, 1), ramp, size: frand(2, 3), size2: frand(5, 8), drag: 2, alpha: 0.6 });
    }
  }

  splash(x: number, y: number) {
    const th = this.w.theme;
    for (let i = 0; i < 14; i++) {
      const a = frand(-Math.PI, 0);
      this.w.particles.spawn({ kind: 'debris', x, y, z: 0, vx: Math.cos(a) * frand(20, 60), vy: Math.sin(a) * frand(5, 20), vz: frand(60, 140), grav: 400, life: frand(0.4, 0.7), ramp: [th.pitWater[4], th.pitWater[3], th.pitWater[2]], size: 1, bounce: 0 });
    }
    this.ring(x, y, 2, 14, 0.4, th.pitWater[4], 1, 'unlit');
    G.audio.play(th.key === 'archive' ? 'sandSink' : th.key === 'clockface' ? 'fall' : 'splash', { pan: this.w.pan(x) });
  }

  /** automaton death: gears, springs, oil decal */
  shatter(a: Actor, palette: string[], scale = 1) {
    const P = this.w.particles;
    const n = Math.round(14 * scale);
    for (let i = 0; i < n; i++) {
      const ang = frand(0, TAU), s = frand(40, 150) * Math.sqrt(scale);
      P.spawn({ kind: 'debris', x: a.x, y: a.y - 2, z: frand(4, a.height * 0.8), vx: Math.cos(ang) * s, vy: Math.sin(ang) * s * 0.7, vz: frand(50, 160), grav: 380, life: frand(0.7, 1.4), ramp: [fpick(palette)], size: frand(1, 2.5), vrot: frand(-10, 10), bounce: 0.45 });
    }
    for (let i = 0; i < 8 * scale; i++) {
      const ang = frand(0, TAU), s = frand(100, 260);
      P.spawn({ kind: 'spark', x: a.x, y: a.y - a.height / 2, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, life: frand(0.15, 0.35), ramp: ['W', 'B6', 'O3', 'O1'], drag: 6, layer: 'glow' });
    }
    this.smoke(a.x, a.y - a.height / 2, Math.round(5 * scale));
    P.spawn({ kind: 'smoke', x: a.x, y: a.y - a.height / 2, life: 0.12, ramp: ['W', 'B6'], size: 10 * scale, size2: 2, layer: 'glow' });
    this.ring(a.x, a.y - 2, 4, 26 * scale, 0.35, 'B5', 2);
    this.oilDecal(a.x, a.y, 5 * scale);
  }

  oilDecal(x: number, y: number, r: number) {
    const c = this.w.dctx;
    c.fillStyle = rgba('K0', 0.35);
    for (let i = 0; i < 6; i++) {
      const rx = frand(r * 0.4, r), ry = rx * 0.55;
      const ox = frand(-r, r), oy = frand(-r * 0.5, r * 0.5);
      c.beginPath();
      c.ellipse(Math.round(x + ox), Math.round(y + oy), rx, ry, 0, 0, TAU);
      c.fill();
    }
  }

  scorch(x: number, y: number, r: number) {
    const c = this.w.dctx;
    c.fillStyle = rgba('K0', 0.25);
    c.beginPath();
    c.ellipse(Math.round(x), Math.round(y), r, r * 0.6, 0, 0, TAU);
    c.fill();
  }

  corrode(x: number, y: number) {
    this.burst(x, y, 18, ['T5', 'T4', 'T3', 'G2'], 140, 0.5);
    this.ring(x, y, 4, 40, 0.4, 'T4', 3);
    G.audio.play('corrode', { pan: this.w.pan(x) });
  }

  stasisRelease(x: number, y: number, amt: number) {
    this.burst(x, y, 16, ['V4', 'V3', 'C3'], 160, 0.45);
    this.ring(x, y, 2, 30, 0.35, 'V4', 3);
    this.w.shake(Math.min(0.35, 0.08 + amt / 200));
    this.w.hitstop(0.06);
    G.audio.play('stasisBreak', { pan: this.w.pan(x) });
  }

  burnTick(t: Actor) {
    for (let i = 0; i < 2; i++)
      this.w.particles.spawn({ kind: 'px', x: t.x + frand(-4, 4), y: t.y - frand(2, t.height), vx: frand(-6, 6), vy: frand(-40, -20), life: frand(0.3, 0.5), ramp: ['O4', 'O3', 'O2', 'O1'], layer: 'glow', size: 1.5 });
  }

  /** soft telegraph helpers are drawn by entities themselves */
}
