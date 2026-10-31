// Drops: brass coins, sand shards (rewind fuel), oil (heal), time shards (meta currency).
import { Entity } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { frand } from '../../engine/rng';
import { TAU } from '../../engine/math';
import { col } from '../../art/palette';
import { sfx } from '../G';

export type PickupKind = 'brass' | 'sand' | 'heal' | 'shard';

export class Pickup extends Entity {
  vz: number;
  t = 0;
  magnet = false;
  constructor(x: number, y: number, public kind: PickupKind, public amount: number) {
    super();
    this.x = x; this.y = y;
    const a = frand(0, TAU), s = frand(30, 80);
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s * 0.6;
    this.z = 4;
    this.vz = frand(70, 120);
    this.collides = false;
  }

  update(dt: number) {
    this.t += dt;
    const p = this.world.player;
    // bounce
    if (!this.magnet) {
      this.vz -= 380 * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) { this.z = 0; this.vz = Math.abs(this.vz) > 40 ? -this.vz * 0.4 : 0; this.vx *= 0.6; this.vy *= 0.6; }
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      if (!this.world.map.solidAt(nx, ny)) { this.x = nx; this.y = ny; }
      this.vx *= Math.exp(-3 * dt); this.vy *= Math.exp(-3 * dt);
    }
    if (!p || p.hp <= 0) return;
    const d = Math.hypot(p.x - this.x, p.y - 6 - this.y);
    const cleared = this.world.aliveEnemies.length === 0;
    if (this.t > 0.45 && (d < 56 || cleared || this.kind === 'sand')) this.magnet = true;
    if (this.magnet) {
      const sp = 140 + this.t * 160;
      const a = Math.atan2(p.y - 6 - this.y, p.x - this.x);
      this.x += Math.cos(a) * sp * dt;
      this.y += Math.sin(a) * sp * dt;
      this.z = Math.max(0, this.z - dt * 30);
      if (d < 7) this.collect();
    }
  }

  collect() {
    const w = this.world;
    const run = w.run!;
    this.kill();
    switch (this.kind) {
      case 'brass': run.brass += this.amount; sfx('coin', { vol: 0.4, pitch: frand(0.95, 1.1) }); break;
      case 'sand': run.addSand(this.amount); sfx('sand', { vol: 0.4 }); break;
      case 'heal': {
        const p = w.player!;
        const h = Math.round(this.amount * run.mods.healMul);
        p.hp = Math.min(p.maxHp, p.hp + h);
        w.fx.number(p.x, p.y - 26, h, 'G4', true);
        sfx('heal');
        break;
      }
      case 'shard': run.shards += this.amount; sfx('shard'); break;
    }
    w.bus.emit('pickup', { kind: this.kind, amount: this.amount });
  }

  renderGround(r: Renderer) {
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.35)';
    ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y), 3, 1);
  }

  renderUnlit(r: Renderer) {
    const ctx = r.u;
    const x = Math.round(this.x), y = Math.round(this.y - this.z - 2);
    const spin = Math.floor(this.t * 10) % 4;
    switch (this.kind) {
      case 'brass': {
        const w = [3, 2, 1, 2][spin];
        ctx.fillStyle = col('K0'); ctx.fillRect(x - w + 1 - 1, y - 2, w + 2, 6);
        ctx.fillStyle = col('B3'); ctx.fillRect(x - w + 1, y - 1, w, 4);
        ctx.fillStyle = col('B5'); ctx.fillRect(x - w + 1, y - 1, Math.max(1, w - 1), 1);
        r.glowAt(x, y, 6, 'B4', 0.3);
        break;
      }
      case 'sand': {
        ctx.fillStyle = col('K0'); ctx.fillRect(x - 2, y - 2, 4, 5);
        ctx.fillStyle = col('C2'); ctx.fillRect(x - 1, y - 1, 2, 3);
        ctx.fillStyle = col('C4'); ctx.fillRect(x - 1, y - 1, 1, 1);
        r.glowAt(x, y, 8, 'C2', 0.5);
        break;
      }
      case 'heal': {
        ctx.fillStyle = col('K0'); ctx.fillRect(x - 3, y - 4, 6, 7);
        ctx.fillStyle = col('G3'); ctx.fillRect(x - 2, y - 2, 4, 4);
        ctx.fillStyle = col('G4'); ctx.fillRect(x - 1, y - 3, 2, 2);
        r.glowAt(x, y, 10, 'G3', 0.5);
        break;
      }
      case 'shard': {
        ctx.fillStyle = col('K0'); ctx.fillRect(x - 2, y - 4, 5, 8);
        ctx.fillStyle = col('V3'); ctx.fillRect(x - 1, y - 3, 3, 6);
        ctx.fillStyle = col('V4'); ctx.fillRect(x, y - 3, 1, 3);
        r.glowAt(x, y, 12, 'V3', 0.6);
        break;
      }
    }
  }
}
