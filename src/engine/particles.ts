import type { Renderer } from './gfx/renderer';
import type { Sprite } from './gfx/sprite';
import { col } from '../art/palette';

export type PKind = 'px' | 'spark' | 'debris' | 'smoke' | 'ring' | 'sprite' | 'streak' | 'dust';
export type PLayer = 'world' | 'unlit' | 'glow';

export interface Particle {
  kind: PKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  /** colour ramp: picks by age */
  ramp: string[];
  size: number;
  size2: number;
  drag: number;
  grav: number;
  layer: PLayer;
  rot: number; vrot: number;
  sprite?: Sprite;
  bounce: number;
  /** light emitted (radius) */
  light: number;
  alpha: number;
}

export interface PSpawn {
  kind?: PKind; x: number; y: number; z?: number;
  vx?: number; vy?: number; vz?: number;
  life?: number; ramp?: string[]; color?: string; size?: number; size2?: number;
  drag?: number; grav?: number; layer?: PLayer; rot?: number; vrot?: number; sprite?: Sprite; bounce?: number; light?: number; alpha?: number;
}

export class Particles {
  list: Particle[] = [];
  private pool: Particle[] = [];
  max = 2400;

  spawn(s: PSpawn) {
    if (this.list.length >= this.max) return;
    const p = this.pool.pop() ?? ({} as Particle);
    p.kind = s.kind ?? 'px';
    p.x = s.x; p.y = s.y; p.z = s.z ?? 0;
    p.vx = s.vx ?? 0; p.vy = s.vy ?? 0; p.vz = s.vz ?? 0;
    p.life = p.max = s.life ?? 0.5;
    p.ramp = s.ramp ?? [s.color ?? 'K10'];
    p.size = s.size ?? 1;
    p.size2 = s.size2 ?? p.size;
    p.drag = s.drag ?? 0;
    p.grav = s.grav ?? 0;
    p.layer = s.layer ?? 'world';
    p.rot = s.rot ?? 0; p.vrot = s.vrot ?? 0;
    p.sprite = s.sprite;
    p.bounce = s.bounce ?? 0.4;
    p.light = s.light ?? 0;
    p.alpha = s.alpha ?? 1;
    this.list.push(p);
  }

  clear() { this.pool.push(...this.list); this.list.length = 0; }

  update(dt: number) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        this.pool.push(p);
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grav || p.vz || p.z > 0) {
        p.vz -= p.grav * dt;
        p.z += p.vz * dt;
        if (p.z < 0) {
          p.z = 0;
          if (Math.abs(p.vz) > 20) {
            p.vz = -p.vz * p.bounce;
            p.vx *= 0.6; p.vy *= 0.6; p.vrot *= 0.5;
          } else { p.vz = 0; p.vx *= 0.85; p.vy *= 0.85; p.vrot = 0; }
        }
      }
      p.rot += p.vrot * dt;
    }
  }

  render(r: Renderer) {
    for (const p of this.list) {
      if (!r.visible(p.x, p.y, 40)) continue;
      const age = 1 - p.life / p.max;
      const c = col(p.ramp[Math.min(p.ramp.length - 1, Math.floor(age * p.ramp.length))]);
      const ctx = p.layer === 'world' ? r.w : p.layer === 'unlit' ? r.u : r.g;
      if (p.layer === 'glow') ctx.globalCompositeOperation = 'lighter';
      const sz = p.size + (p.size2 - p.size) * age;
      ctx.fillStyle = c;
      if (p.alpha !== 1) ctx.globalAlpha = p.alpha * (p.kind === 'smoke' || p.kind === 'ring' ? 1 - age : 1);
      else if (p.kind === 'smoke' || p.kind === 'ring') ctx.globalAlpha = 1 - age * age;
      const x = Math.round(p.x), y = Math.round(p.y - p.z);
      switch (p.kind) {
        case 'px':
        case 'dust': {
          const s = Math.max(1, Math.round(sz));
          ctx.fillRect(x - (s >> 1), y - (s >> 1), s, s);
          break;
        }
        case 'debris': {
          // shadow
          if (p.z > 1) {
            r.w.fillStyle = 'rgba(11,10,20,0.35)';
            r.w.fillRect(Math.round(p.x) - 1, Math.round(p.y), 2, 1);
            ctx.fillStyle = c;
          }
          const s = Math.max(1, Math.round(sz));
          ctx.fillRect(x - (s >> 1), y - (s >> 1), s, s + (Math.sin(p.rot) > 0 ? 0 : -Math.min(s - 1, 1)));
          break;
        }
        case 'spark':
        case 'streak': {
          const sp = Math.hypot(p.vx, p.vy);
          const len = Math.max(1, Math.min(p.kind === 'streak' ? 14 : 6, sp * 0.03 * sz));
          const nx = sp > 0 ? p.vx / sp : 0, ny = sp > 0 ? p.vy / sp : 0;
          ctx.strokeStyle = c;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, y + 0.5);
          ctx.lineTo(x + 0.5 - nx * len, y + 0.5 - ny * len);
          ctx.stroke();
          break;
        }
        case 'smoke': {
          const rr = Math.max(1, Math.round(sz));
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'ring': {
          ctx.strokeStyle = c;
          ctx.lineWidth = Math.max(1, Math.round(2 * (1 - age)));
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, sz), 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case 'sprite': {
          if (p.sprite) {
            ctx.save();
            ctx.translate(x, y);
            if (p.rot) ctx.rotate(Math.round(p.rot / (Math.PI / 4)) * (Math.PI / 4));
            ctx.drawImage(p.sprite.img, -p.sprite.ox, -p.sprite.oy);
            ctx.restore();
          }
          break;
        }
      }
      ctx.globalAlpha = 1;
      if (p.layer === 'glow') ctx.globalCompositeOperation = 'source-over';
      if (p.light > 0) r.lightAt(p.x, p.y - p.z, p.light * (1 - age * 0.7), p.ramp[0], 0.5 * (1 - age));
    }
  }
}
