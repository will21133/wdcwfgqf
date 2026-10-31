import type { Renderer } from '../../engine/gfx/renderer';
import { Particles } from '../../engine/particles';
import { Camera } from '../../engine/camera';
import { makeCanvas } from '../../engine/gfx/canvas';
import { Actor, Entity } from '../entities/entity';
import { Combat } from '../systems/combat';
import { Bus } from '../systems/bus';
import { RoomMap, TS, T } from './room';
import { RoomVisual, renderRoom } from './roomRender';
import { Theme } from '../../art/themes';
import { FX } from './fx';
import { frand } from '../../engine/rng';
import { VIEW_W } from '../../engine/gfx/post';
import type { Run } from '../run';
import type { Player } from '../entities/player';

export interface WorldStats { damage: number; kills: number; rewinds: number; paradoxes: number; hitsTaken: number }

export class World {
  entities: Entity[] = [];
  enemies: Actor[] = [];
  playerTeam: Actor[] = [];
  breakables: Actor[] = [];
  player: Player | null = null;
  particles = new Particles();
  combat: Combat;
  bus = new Bus();
  fx: FX;
  cam = new Camera();
  vis: RoomVisual;
  decals: HTMLCanvasElement;
  dctx: CanvasRenderingContext2D;
  time = 0;
  /** hitstop timer (freezes simulation) */
  stop = 0;
  /** global slow motion multiplier */
  timeScale = 1;
  slowT = 0;
  /** freezes all entity updates except those flagged (rewind cinematic / time stop) */
  frozen = false;
  stats: WorldStats = { damage: 0, kills: 0, rewinds: 0, paradoxes: 0, hitsTaken: 0 };
  run: Run | null = null;
  private dustT = 0;
  private toAdd: Entity[] = [];
  /** BFS distance field toward the player (for enemy navigation) */
  flow: Int16Array;
  private flowT = 0;

  constructor(public map: RoomMap, public theme: Theme, seed: number) {
    this.combat = new Combat(this);
    this.fx = new FX(this);
    this.vis = renderRoom(map, theme, seed);
    [this.decals, this.dctx] = makeCanvas(map.pw, map.ph);
    this.cam.bounds = { x: 0, y: -8, w: map.pw, h: map.ph + 8 };
    this.flow = new Int16Array(map.w * map.h).fill(-1);
  }

  private updateFlow() {
    const p = this.player;
    if (!p) return;
    const m = this.map, W = m.w;
    const f = this.flow;
    f.fill(-1);
    const sx = Math.floor(p.x / TS), sy = Math.floor(p.y / TS);
    if (!m.in(sx, sy)) return;
    const q = new Int32Array(m.w * m.h);
    let qh = 0, qt = 0;
    q[qt++] = sy * W + sx;
    f[sy * W + sx] = 0;
    const walk = (t: number) => t === T.FLOOR;
    while (qh < qt) {
      const i = q[qh++];
      const x = i % W, y = (i / W) | 0;
      const d = f[i] + 1;
      for (let k = 0; k < 8; k++) {
        const dx = [1, -1, 0, 0, 1, 1, -1, -1][k], dy = [0, 0, 1, -1, 1, -1, 1, -1][k];
        const nx = x + dx, ny = y + dy;
        if (!m.in(nx, ny)) continue;
        const j = ny * W + nx;
        if (f[j] >= 0 || !walk(m.tiles[j])) continue;
        // no corner cutting
        if (dx && dy && (!walk(m.tiles[y * W + nx]) || !walk(m.tiles[ny * W + x]))) continue;
        f[j] = d;
        q[qt++] = j;
      }
    }
  }

  /** direction toward the player following the flow field */
  flowDir(x: number, y: number): { x: number; y: number } | null {
    const m = this.map, W = m.w;
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    const cur = m.in(tx, ty) ? this.flow[ty * W + tx] : -1;
    let best = -1, bx = 0, by = 0;
    for (let k = 0; k < 8; k++) {
      const dx = [1, -1, 0, 0, 1, 1, -1, -1][k], dy = [0, 0, 1, -1, 1, -1, 1, -1][k];
      const nx = tx + dx, ny = ty + dy;
      if (!m.in(nx, ny)) continue;
      const v = this.flow[ny * W + nx];
      if (v < 0) continue;
      if (dx && dy && (m.isSolid(nx, ty) || m.isSolid(tx, ny) || m.isPit(nx, ty) || m.isPit(tx, ny))) continue;
      if (best < 0 || v < best) { best = v; bx = dx; by = dy; }
    }
    if (best < 0 || (cur >= 0 && best >= cur)) return null;
    // aim at the centre of the next tile
    const cx = (tx + bx) * TS + 8 - x, cy = (ty + by) * TS + 8 - y;
    const l = Math.hypot(cx, cy) || 1;
    return { x: cx / l, y: cy / l };
  }

  add<E extends Entity>(e: E): E {
    e.world = this;
    this.toAdd.push(e);
    return e;
  }

  flushAdds() {
    if (!this.toAdd.length) return;
    for (const e of this.toAdd) {
      this.entities.push(e);
      if (e instanceof Actor) {
        if (e.team === 'enemy') this.enemies.push(e);
        else if (e.team === 'player') this.playerTeam.push(e);
        else if (e.team === 'neutral') this.breakables.push(e);
      }
      e.added();
      this.bus.emit('spawn', { e });
    }
    this.toAdd.length = 0;
  }

  hitstop(t: number) { this.stop = Math.max(this.stop, t); }
  shake(n: number) { this.cam.shake(n); }
  slowmo(scale: number, dur: number) { this.timeScale = scale; this.slowT = dur; }
  pan(x: number) { return Math.max(-0.8, Math.min(0.8, (x - this.cam.x) / (VIEW_W * 0.6))); }

  update(dt: number) {
    this.flushAdds();
    this.cam.update(dt);
    if (this.stop > 0) {
      this.stop -= dt;
      return;
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.timeScale = 1;
    }
    const sdt = dt * this.timeScale;
    this.time += sdt;
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.25; this.updateFlow(); }
    for (const e of this.entities) {
      if (e.dead) continue;
      if (this.frozen && !(e as any).ignoreFreeze) continue;
      e.age += sdt;
      if (e instanceof Actor) {
        if (this.combat.tickStatus(e, sdt) && !e.dead) { this.physics(e, sdt, true); continue; }
      }
      e.update(sdt);
      if (e instanceof Actor && !e.dead) this.physics(e, sdt, false);
      else if (!(e instanceof Actor) && !e.dead) { e.x += e.vx * sdt; e.y += e.vy * sdt; }
    }
    if (!this.frozen) {
      this.separate();
      this.combat.update(sdt);
    }
    this.particles.update(sdt);
    this.fx.update(sdt);
    this.ambient(sdt);
    // cleanup
    let removed = false;
    for (const e of this.entities) if (e.dead) { e.removed(); removed = true; }
    if (removed) {
      this.entities = this.entities.filter((e) => !e.dead);
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.playerTeam = this.playerTeam.filter((e) => !e.dead);
      this.breakables = this.breakables.filter((e) => !e.dead);
    }
    this.flushAdds();
  }

  /** knockback, wall collision and pits */
  private physics(a: Actor, dt: number, frozen: boolean) {
    if (a.invuln > 0) a.invuln -= dt;
    if (a.flash > 0) a.flash -= dt;
    if (a.hitstun > 0) a.hitstun -= dt;
    if (frozen) { a.kx = a.ky = 0; return; }
    const k = Math.exp(-10 * dt);
    if (a.kx || a.ky) {
      const hitWall = this.move(a, a.kx * dt, a.ky * dt);
      if (hitWall && Math.hypot(a.kx, a.ky) > 160 && a.team === 'enemy') {
        // wall slam: small bonus damage, dust
        this.fx.dust(a.x, a.y, 5);
        this.shake(0.08);
      }
      a.kx *= k; a.ky *= k;
      if (Math.abs(a.kx) < 2) a.kx = 0;
      if (Math.abs(a.ky) < 2) a.ky = 0;
    }
    // pits
    if (a.canFall && a.falling <= 0 && a.z <= 0.5 && !(a as any).airborne && this.map.pitAt(a.x, a.y)) {
      a.falling = 0.55;
      (a as any).onFall?.();
    }
    if (a.falling > 0) {
      a.falling -= dt;
      if (a.falling <= 0) {
        a.falling = 0;
        if ((a as any).onFallEnd) (a as any).onFallEnd();
        else {
          this.fx.splash(a.x, a.y);
          a.hp = 0;
          a.die({ amount: 999, kind: 'fall' });
          if (a.team === 'enemy') this.bus.emit('kill', { target: a, info: { amount: 999, kind: 'fall', owner: this.player } });
        }
      }
    }
  }

  /** move with tile collision, sub-stepped; returns true if blocked */
  move(e: Entity, dx: number, dy: number): boolean {
    if (!e.collides) { e.x += dx; e.y += dy; return false; }
    let blocked = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    const sx = dx / steps, sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx) {
        const nx = e.x + sx;
        if (this.boxFree(nx, e.y, e.r)) e.x = nx;
        else { blocked = true; this.slideX(e, sx); }
      }
      if (sy) {
        const ny = e.y + sy;
        if (this.boxFree(e.x, ny, e.r)) e.y = ny;
        else { blocked = true; this.slideY(e, sy); }
      }
    }
    return blocked;
  }
  private slideX(e: Entity, sx: number) {
    // nudge toward the edge
    const step = Math.sign(sx) * 0.5;
    for (let k = 0; k < 8 && this.boxFree(e.x + step, e.y, e.r); k++) e.x += step;
  }
  private slideY(e: Entity, sy: number) {
    const step = Math.sign(sy) * 0.5;
    for (let k = 0; k < 8 && this.boxFree(e.x, e.y + step, e.r); k++) e.y += step;
  }
  boxFree(x: number, y: number, r: number) {
    const m = this.map;
    const ry = r * 0.7;
    return !(m.solidAt(x - r, y - ry) || m.solidAt(x + r, y - ry) || m.solidAt(x - r, y + ry) || m.solidAt(x + r, y + ry));
  }

  private separate() {
    const L = this.entities;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.solid || a.dead) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.solid || b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        const ma = (a as Actor).mass ?? 1, mb = (b as Actor).mass ?? 1;
        const ta = mb / (ma + mb), tb = ma / (ma + mb);
        this.move(a, -nx * push * ta * 2, -ny * push * ta * 2);
        this.move(b, nx * push * tb * 2, ny * push * tb * 2);
      }
    }
  }

  /** floating dust motes — the city is frozen mid-second */
  private ambient(dt: number) {
    this.dustT -= dt;
    if (this.dustT > 0) return;
    this.dustT = 0.12;
    const v = this.cam.view();
    const x = v.x + frand(0, VIEW_W), y = v.y + frand(0, 360);
    if (this.map.get(Math.floor(x / TS), Math.floor(y / TS)) === T.VOID) return;
    this.particles.spawn({
      kind: 'dust', x, y, vx: frand(-2, 2), vy: frand(-3, -0.5), life: frand(3, 6),
      ramp: [this.theme.dust, this.theme.dust, 'K6'], layer: 'glow', alpha: frand(0.25, 0.6), size: 1,
    });
  }

  enemiesNear(x: number, y: number, r: number): Actor[] {
    const out: Actor[] = [];
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - x, e.y - y) <= r + e.r) out.push(e);
    return out;
  }

  nearestEnemy(x: number, y: number, maxD = 9999, filter?: (e: Actor) => boolean): Actor | null {
    let best: Actor | null = null, bd = maxD;
    for (const e of this.enemies) {
      if (e.dead || e.falling > 0) continue;
      if (filter && !filter(e)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  get aliveEnemies() { return this.enemies.filter((e) => !e.dead && !(e as any).ignoreClear); }

  render(r: Renderer) {
    const v = this.cam.view();
    r.ambient = this.theme.ambient;
    r.begin(v.x, v.y, this.theme.clear);
    const w = r.w;
    w.drawImage(this.vis.floor, 0, 0);
    w.drawImage(this.decals, 0, 0);
    for (const e of this.entities) e.renderGround?.(r);
    // y-sorted pass: entities + wall strips
    const items: { y: number; e?: Entity; s?: number }[] = [];
    for (const e of this.entities) if (!e.layerTop && r.visible(e.x, e.y, 64)) items.push({ y: e.sortY, e });
    const walls = this.vis.walls;
    for (let i = 0; i < walls.length; i++) {
      const s = walls[i];
      if (s.y > v.y + 380 || s.y + 48 < v.y - 10) continue;
      items.push({ y: s.sortY, s: i });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.e) it.e.render(r);
      else w.drawImage(walls[it.s!].canvas, 0, walls[it.s!].y);
    }
    for (const e of this.entities) if (e.layerTop) e.render(r);
    this.particles.render(r);
    for (const e of this.entities) e.renderUnlit?.(r);
    this.fx.render(r);
  }
}
