import { Entity, Actor, Team } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { col } from '../../art/palette';
import { frand } from '../../engine/rng';
import { TAU } from '../../engine/math';
import type { DamageInfo } from '../systems/combat';
import { sfx } from '../G';

export type BulletStyle = 'orb' | 'bolt' | 'big' | 'arrow' | 'spore' | 'shard' | 'star' | 'ink';

export interface BulletOpts {
  team: Team; x: number; y: number; ang: number; speed: number; dmg: number;
  style?: BulletStyle; r?: number; life?: number; fixed?: boolean; owner?: Actor | null;
  /** palette [core, mid, edge] */
  pal?: string[];
  accel?: number; turn?: number; homing?: number; pierce?: number; bounce?: number; echo?: boolean;
  knock?: number; info?: Partial<DamageInfo>;
}

export class Bullet extends Entity {
  dmg: number; style: BulletStyle; life: number; fixed: boolean; owner: Actor | null;
  pal: string[]; accel: number; turn: number; homing: number; pierce: number; bounce: number; echo: boolean;
  knock: number; info: Partial<DamageInfo>;
  ang: number; speed: number;
  hit = new Set<number>();
  /** height above ground (visual) */
  h = 8;

  constructor(o: BulletOpts) {
    super();
    this.team = o.team;
    this.x = o.x; this.y = o.y;
    this.ang = o.ang; this.speed = o.speed;
    this.dmg = o.dmg;
    this.style = o.style ?? 'orb';
    this.r = o.r ?? 3;
    this.life = o.life ?? 3;
    this.fixed = !!o.fixed;
    this.owner = o.owner ?? null;
    this.pal = o.pal ?? (o.fixed ? ['W', 'V4', 'V2'] : o.team === 'enemy' ? ['W', 'M3', 'M1'] : ['W', 'B6', 'B4']);
    this.accel = o.accel ?? 0; this.turn = o.turn ?? 0; this.homing = o.homing ?? 0;
    this.pierce = o.pierce ?? 0; this.bounce = o.bounce ?? 0; this.echo = !!o.echo;
    this.knock = o.knock ?? 40;
    this.info = o.info ?? {};
    this.collides = false;
  }

  update(dt: number) {
    this.life -= dt;
    if (this.life <= 0) { this.pop(false); return; }
    this.speed += this.accel * dt;
    this.ang += this.turn * dt;
    if (this.homing) {
      const tgt = this.team === 'player' ? this.world.nearestEnemy(this.x, this.y, 140) : this.world.player;
      if (tgt) {
        const want = Math.atan2(tgt.y - 6 - this.y, tgt.x - this.x);
        let d = want - this.ang;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        this.ang += Math.max(-this.homing * dt, Math.min(this.homing * dt, d));
      }
    }
    const nx = this.x + Math.cos(this.ang) * this.speed * dt;
    const ny = this.y + Math.sin(this.ang) * this.speed * dt;
    // walls are tested at the shadow position (y + h)
    if (this.world.map.shotBlockedAt(nx, ny + this.h)) {
      if (this.bounce > 0) {
        this.bounce--;
        const bx = this.world.map.shotBlockedAt(nx, this.y + this.h), by = this.world.map.shotBlockedAt(this.x, ny + this.h);
        if (bx) this.ang = Math.PI - this.ang;
        if (by) this.ang = -this.ang;
        if (!bx && !by) this.ang += Math.PI;
        return;
      }
      this.pop(true);
      return;
    }
    this.x = nx; this.y = ny;
    // hits
    const targets = this.team === 'player' ? this.world.enemies : this.world.playerTeam;
    for (const t of targets) {
      if (t.dead || this.hit.has(t.id) || t.falling > 0) continue;
      const dx = t.x - this.x, dy = t.y - 8 - this.y + this.h * 0.5;
      const rr = t.r + this.r + 1;
      if (dx * dx + dy * dy > rr * rr) continue;
      this.hit.add(t.id);
      const dealt = t.hurt({
        amount: this.dmg, kind: 'proj', owner: this.owner, x: this.x - Math.cos(this.ang) * 8, y: this.y + this.h - Math.sin(this.ang) * 8,
        knock: this.knock, fixed: this.fixed, echo: this.echo, ...this.info,
      });
      if (dealt > 0 || this.team === 'player') {
        if (this.pierce > 0) { this.pierce--; continue; }
        this.pop(false);
        return;
      }
    }
  }

  pop(wall: boolean) {
    if (this.dead) return;
    this.kill();
    const w = this.world;
    for (let i = 0; i < 5; i++) {
      const a = this.ang + Math.PI + frand(-1.2, 1.2);
      w.particles.spawn({ kind: 'spark', x: this.x, y: this.y, vx: Math.cos(a) * frand(40, 110), vy: Math.sin(a) * frand(40, 110), life: frand(0.1, 0.22), ramp: this.pal, layer: 'glow', drag: 6 });
    }
    if (wall) sfx('bulletWall', { vol: 0.3, pan: w.pan(this.x) });
  }

  renderGround(r: Renderer) {
    // shadow on the floor
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.3)';
    ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y + this.h), 3, 1);
  }

  renderUnlit(r: Renderer) {
    const ctx = r.u;
    const x = Math.round(this.x), y = Math.round(this.y);
    const [c0, c1, c2] = this.pal.map(col);
    const pulse = Math.floor(this.age * 20) % 2;
    switch (this.style) {
      case 'orb':
      case 'spore':
      case 'star': {
        const R = this.r;
        ctx.fillStyle = col('K0');
        ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, R + 1.5, 0, TAU); ctx.fill();
        ctx.fillStyle = c2;
        ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, R + 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, R - 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = c0;
        ctx.fillRect(x - (pulse ? 1 : 0), y - 1, pulse ? 2 : 1, pulse ? 2 : 1);
        break;
      }
      case 'big': {
        const R = this.r + (pulse ? 0.5 : 0);
        ctx.fillStyle = col('K0');
        ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, R + 1.5, 0, TAU); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, R + 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, R - 1, 0, TAU); ctx.fill();
        ctx.fillStyle = c0; ctx.beginPath(); ctx.arc(x - 0.5, y - 0.5, R * 0.45, 0, TAU); ctx.fill();
        break;
      }
      case 'bolt':
      case 'arrow':
      case 'shard':
      case 'ink': {
        const len = this.style === 'arrow' ? 9 : 6;
        const cx = Math.cos(this.ang), cy = Math.sin(this.ang);
        ctx.lineCap = 'butt';
        ctx.strokeStyle = col('K0'); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x - cx * len, y - cy * len); ctx.lineTo(x + cx * 2, y + cy * 2); ctx.stroke();
        ctx.strokeStyle = c2; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - cx * len, y - cy * len); ctx.lineTo(x + cx * 1, y + cy * 1); ctx.stroke();
        ctx.strokeStyle = c0; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - cx * (len - 3), y - cy * (len - 3)); ctx.lineTo(x + cx, y + cy); ctx.stroke();
        break;
      }
    }
    r.glowAt(this.x, this.y, this.r * 3 + 4, this.pal[1], 0.5);
    r.lightAt(this.x, this.y, 28, this.pal[1], 0.4);
  }
}
