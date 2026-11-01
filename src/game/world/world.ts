import type { Renderer } from '../../engine/gfx/renderer';
import { Particles } from '../../engine/particles';
import { Camera } from '../../engine/camera';
import { makeCanvas } from '../../engine/gfx/canvas';
import { Actor, Entity } from '../entities/entity';
import { Combat, circleHits, type Shape, type DamageInfo } from '../systems/combat';
import { Bus } from '../systems/bus';
import { RoomMap, TS, T } from './room';
import { RoomVisual, renderRoom } from './roomRender';
import { Theme } from '../../art/themes';
import { FX } from './fx';
import { frand, RNG } from '../../engine/rng';
import { mix } from '../../art/palette';
import { VIEW_W } from '../../engine/gfx/post';
import type { Run } from '../run';
import type { Player } from '../entities/player';
import { ownerPlayer } from '../players';
import { TimeBubbles } from '../systems/timeBubble';

/** a sim-time timer (world.after / world.every) */
interface Timer { t: number; fn: () => void; owner: unknown; every: number; dead: boolean }
/** an enemy's current aggro choice (GDD2 §5.8) */
interface Aggro { target: Actor | null; slot: number; until: number }
/** damage dealt to an enemy by a hand, for aggro scoring */
interface DmgMark { t: number; slot: number; amount: number }

/** Culprit marks wear off (GDD2 §3.8) */
function tickCulprits(a: Actor, dt: number) {
  for (const [slot, t] of a.culpritOf) {
    if (t - dt <= 0) a.culpritOf.delete(slot);
    else a.culpritOf.set(slot, t - dt);
  }
}

/** aggro lock-in (s): an enemy keeps its target at least this long so it doesn't jitter */
export const AGGRO_LOCK = 1.5;
/** aggro damage memory (s) */
export const AGGRO_MEMORY = 3;

export interface WorldStats { damage: number; kills: number; rewinds: number; paradoxes: number; hitsTaken: number }

export class World {
  entities: Entity[] = [];
  enemies: Actor[] = [];
  playerTeam: Actor[] = [];
  breakables: Actor[] = [];
  /** every player in the room, in slot order (PLAN2 §1.4) */
  players: Player[] = [];
  /** compat (1.0 code): the first living player, else the first player */
  get player(): Player | null {
    for (const p of this.players) if (p.state === 'alive') return p;
    return this.players[0] ?? null;
  }
  get playerCount(): number { return this.players.length; }
  /** players still standing (not stopped, not a ghost) */
  alive(): Player[] {
    // doors, the camera and the room loop ask several times a tick: one array per tick
    if (this.aliveAt === this.tickNo) {
      let n = 0, ok = true;
      for (const p of this.players) if (p.state === 'alive') n++;
      for (const p of this.aliveList) if (p.state !== 'alive' || p.dead) ok = false;
      if (ok && n === this.aliveList.length) return this.aliveList;
    }
    this.aliveAt = this.tickNo;
    this.aliveList = this.players.filter((p) => p.state === 'alive');
    return this.aliveList;
  }
  private aliveAt = -1;
  private aliveList: Player[] = [];
  /** fixed ticks this world has run */
  tickNo = 0;
  /** this room's seeded stream (derived from run.rng); use it for gameplay choices, never Math.random */
  rng: RNG;
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
  /** freezes all entity updates except those flagged (the final boss's time stop) */
  frozen = false;
  /** rewind time bubbles (systems/timeBubble.ts): solo = the whole room at 0.15×, co-op = r72 */
  bubbles = new TimeBubbles();
  stats: WorldStats = { damage: 0, kills: 0, rewinds: 0, paradoxes: 0, hitsTaken: 0 };
  run: Run | null = null;
  /** 0..1 extra darkness (boss mechanics) */
  darkness = 0;
  /** 0..1 time-stop strength (final boss): world desaturates */
  timeStop = 0;
  private dustT = 0;
  private toAdd: Entity[] = [];
  /** multi-source BFS distance field toward the nearest standing player (enemy navigation) */
  flow: Int16Array;
  /** one field per player slot, so an enemy can path to the hand it is after */
  private flowSlot: (Int16Array | null)[] = [];
  private flowT = 0;
  private timers: Timer[] = [];
  private aggro = new Map<number, Aggro>();
  private dmgLog = new Map<number, DmgMark[]>();

  constructor(public map: RoomMap, public theme: Theme, seed: number) {
    this.combat = new Combat(this);
    this.fx = new FX(this);
    this.vis = renderRoom(map, theme, seed);
    [this.decals, this.dctx] = makeCanvas(map.pw, map.ph);
    this.cam.bounds = { x: 0, y: -8, w: map.pw, h: map.ph + 8 };
    this.flow = new Int16Array(map.w * map.h).fill(-1);
    this.rng = new RNG((seed * 2654435761) >>> 0);
  }

  // ───────────────────────── players & targeting (PLAN2 §1.4) ─────────────────────────
  /**
   * The nearest player to (x, y). alive (default true): standing hands only. taunts: a taunting
   * echo (Mina, GDD2 §5.2; echo.taunt > 0) counts as a target too.
   */
  nearestPlayer(x: number, y: number, o: { alive?: boolean; taunts?: boolean } = {}): Actor | null {
    const onlyAlive = o.alive !== false;
    let best: Actor | null = null, bd = Infinity;
    for (const p of this.players) {
      if (p.dead || (onlyAlive && p.state !== 'alive')) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    if (o.taunts) for (const p of this.players) for (const e of p.echoes) {
      if (e.dead || !((e as unknown as { taunt?: number }).taunt! > 0)) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e as unknown as Actor; }
    }
    return best;
  }

  /**
   * Enemy contact / hazard damage to every standing player the shape touches (the one entry point
   * for direct damage; PLAN2 §1.4). `shape` may also be a predicate for odd footprints (bands,
   * ellipses). `once` (optional) remembers who was already hit so a sweep hits each hand once.
   * Returns the total damage dealt.
   */
  hurtPlayers(shape: Shape | ((p: Player) => boolean), info: DamageInfo, once?: Set<number>): number {
    let total = 0;
    for (const p of this.players) {
      if (p.dead || p.state !== 'alive' || p.falling > 0) continue;
      if (once?.has(p.id)) continue;
      const touch = typeof shape === 'function' ? shape(p) : circleHits(shape, p.x, p.y, p.r);
      if (!touch) continue;
      const dealt = p.hurt(info);
      if (dealt > 0) { total += dealt; once?.add(p.id); }
    }
    return total;
  }

  /** standing players a shape (or predicate) touches */
  playersIn(shape: Shape | ((p: Player) => boolean)): Player[] {
    const out: Player[] = [];
    for (const p of this.players) {
      if (p.dead || p.state !== 'alive' || p.falling > 0) continue;
      if (typeof shape === 'function' ? shape(p) : circleHits(shape, p.x, p.y, p.r)) out.push(p);
    }
    return out;
  }

  /** a hand dealt damage to an enemy (combat calls this; feeds aggro scoring) */
  noteDamage(target: Actor, owner: unknown, amount: number) {
    if (this.players.length < 2 || target.team !== 'enemy') return;
    const p = ownerPlayer(owner);
    if (!p) return;
    let l = this.dmgLog.get(target.id);
    if (!l) this.dmgLog.set(target.id, (l = []));
    l.push({ t: this.time, slot: p.slot, amount });
    while (l.length && this.time - l[0].t > AGGRO_MEMORY) l.shift();
  }

  /**
   * Who an enemy goes after (GDD2 §5.8): the standing hand (or taunting echo) with the best score
   *   score = 1 / distance (in tiles) + 0.5 × its share of the damage this enemy took in the last 3 s
   * held for at least 1.5 s unless the target falls. Solo: the player (1.0).
   */
  targetFor(e: Actor): Actor | null {
    // solo: the player (1.0), unless one of their echoes is taunting (P5 Mina) — then score it too
    if (this.players.length <= 1 && !this.anyTaunt()) {
      const p = this.players[0];
      return p && p.state === 'alive' ? p : null;
    }
    const cur = this.aggro.get(e.id);
    if (cur && cur.target && this.time < cur.until && this.validTarget(cur.target)) return cur.target;
    const log = this.dmgLog.get(e.id);
    let sum = 0;
    const by: number[] = [0, 0, 0, 0];
    if (log) for (const m of log) if (this.time - m.t <= AGGRO_MEMORY) { sum += m.amount; by[m.slot % 4] += m.amount; }
    let best: Actor | null = null, bs = -Infinity, slot = -1;
    const consider = (a: Actor, s: number, sl: number) => { if (s > bs) { bs = s; best = a; slot = sl; } };
    for (const p of this.players) {
      if (p.dead || p.state !== 'alive') continue;
      const d = Math.max(0.5, Math.hypot(p.x - e.x, p.y - e.y) / TS);
      consider(p, 1 / d + (sum > 0 ? 0.5 * (by[p.slot % 4] / sum) : 0), p.slot);
    }
    for (const p of this.players) for (const ec of p.echoes) {
      if (ec.dead || !((ec as unknown as { taunt?: number }).taunt! > 0)) continue;
      const d = Math.max(0.5, Math.hypot(ec.x - e.x, ec.y - e.y) / TS);
      consider(ec as unknown as Actor, 1 / d, p.slot);
    }
    this.aggro.set(e.id, { target: best, slot, until: this.time + AGGRO_LOCK });
    return best;
  }
  private anyTaunt(): boolean {
    for (const p of this.players) for (const ec of p.echoes) if (!ec.dead && ((ec as unknown as { taunt?: number }).taunt ?? 0) > 0) return true;
    return false;
  }
  /** slot of the hand an enemy is after (telegraph tip dots); -1 when none */
  targetSlotFor(e: Actor): number {
    const t = this.targetFor(e);
    if (!t) return -1;
    const p = ownerPlayer(t);
    return p ? p.slot : (this.aggro.get(e.id)?.slot ?? -1);
  }
  private validTarget(t: Actor): boolean {
    if (t.dead) return false;
    const p = t as unknown as Player;
    if (typeof p.state === 'string') return p.state === 'alive';
    return true;
  }

  // ───────────────────────── sim-time timers (PLAN2 §1.4) ─────────────────────────
  /** run fn after sec seconds of simulation time (pauses with the game, hitstop and slow motion) */
  after(sec: number, fn: () => void, owner?: unknown): void {
    this.timers.push({ t: Math.max(0, sec), fn, owner: owner ?? null, every: 0, dead: false });
  }
  /** run fn every sec seconds of simulation time */
  every(sec: number, fn: () => void, owner?: unknown): void {
    const s = Math.max(1 / 60, sec);
    this.timers.push({ t: s, fn, owner: owner ?? null, every: s, dead: false });
  }
  /** cancel every timer an owner set */
  cancelTimers(owner: unknown) { for (const t of this.timers) if (t.owner === owner) t.dead = true; }
  private tickTimers(dt: number) {
    if (!this.timers.length) return;
    const due: Timer[] = [];
    for (const t of this.timers) {
      if (t.dead) continue;
      t.t -= dt;
      if (t.t <= 0) due.push(t);
    }
    for (const t of due) {
      if (t.dead) continue;
      if (t.every > 0) t.t += t.every; else t.dead = true;
      t.fn();
    }
    if (due.length) this.timers = this.timers.filter((t) => !t.dead);
  }

  /**
   * local time scale at a point (PLAN2 §1.4 / F3): the world's slow motion × any time bubble
   * covering it (a rewinding hand: solo the whole room, co-op r72; GDD2 §3.2). Players outside
   * their own rewind run on the world's scale; a rewinding hand runs on real time.
   */
  timeScaleAt(x: number, y: number): number { return this.timeScale * this.bubbles.scaleAt(x, y); }

  /** the dt an entity gets this tick: its own local time (time bubbles), real time while it rewinds */
  private dtFor(e: Entity, dt: number, sdt: number): number {
    if (e instanceof Actor && e.kind === 'player') return (e as unknown as Player).rewinding ? dt : sdt;
    if (!this.bubbles.list.length) return sdt;
    return sdt * this.bubbles.localAt(e.x, e.y);
  }

  // ───────────────────────── navigation ─────────────────────────
  private updateFlow() {
    const seeds: { x: number; y: number }[] = [];
    const L = this.players.length ? this.players : [];
    for (const p of L) if (p.state === 'alive') seeds.push(p);
    if (!seeds.length) return;
    this.bfs(this.flow, seeds);
    if (this.players.length > 1) {
      for (const p of this.players) {
        if (p.state !== 'alive') { this.flowSlot[p.slot] = null; continue; }
        const f = (this.flowSlot[p.slot] ??= new Int16Array(this.map.w * this.map.h));
        this.bfs(f, [p]);
      }
    }
  }

  private bfs(f: Int16Array, seeds: { x: number; y: number }[]) {
    const m = this.map, W = m.w;
    f.fill(-1);
    const q = new Int32Array(m.w * m.h);
    let qh = 0, qt = 0;
    for (const p of seeds) {
      const sx = Math.floor(p.x / TS), sy = Math.floor(p.y / TS);
      if (!m.in(sx, sy) || f[sy * W + sx] === 0) continue;
      q[qt++] = sy * W + sx;
      f[sy * W + sx] = 0;
    }
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

  /** direction toward the nearest player (or player `slot`) following the flow field */
  flowDir(x: number, y: number, slot = -1): { x: number; y: number } | null {
    const m = this.map, W = m.w;
    const field = (slot >= 0 && this.players.length > 1 && this.flowSlot[slot]) || this.flow;
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    const cur = m.in(tx, ty) ? field[ty * W + tx] : -1;
    let best = -1, bx = 0, by = 0;
    for (let k = 0; k < 8; k++) {
      const dx = [1, -1, 0, 0, 1, 1, -1, -1][k], dy = [0, 0, 1, -1, 1, -1, 1, -1][k];
      const nx = tx + dx, ny = ty + dy;
      if (!m.in(nx, ny)) continue;
      const v = field[ny * W + nx];
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
    this.tickNo++;
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
    // time bubbles: a rewinding hand slows the room (solo) or a circle around it (co-op)
    this.bubbles.collect(this.players, this.players.length <= 1, dt);
    const sdt = dt * this.timeScale * this.bubbles.global;
    this.time += sdt;
    this.tickTimers(sdt);
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.25; this.updateFlow(); }
    for (const e of this.entities) {
      if (e.dead) continue;
      if (this.frozen && !(e as any).ignoreFreeze) continue;
      const edt = this.dtFor(e, dt, sdt);
      e.age += edt;
      if (e instanceof Actor) {
        if (e.culpritOf.size) tickCulprits(e, edt);
        if (this.combat.tickStatus(e, edt) && !e.dead) { this.physics(e, edt, true); continue; }
      }
      e.update(edt);
      if (e instanceof Actor && !e.dead) this.physics(e, edt, false);
      else if (!(e instanceof Actor) && !e.dead) { e.x += e.vx * edt; e.y += e.vy * edt; }
    }
    if (!this.frozen) this.separate();
    // hitboxes still resolve during a time stop (echoes keep fighting)
    this.combat.update(sdt);
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
      if (this.players.some((p) => p.dead)) this.players = this.players.filter((p) => !p.dead);
      if (this.aggro.size) {
        const live = new Set(this.enemies.map((e) => e.id));
        for (const id of [...this.aggro.keys()]) if (!live.has(id)) { this.aggro.delete(id); this.dmgLog.delete(id); }
      }
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
        // wall slam: dust, and bonus damage with the Anvil part
        this.fx.dust(a.x, a.y, 5);
        this.shake(0.08);
        // the hand that sent it flying owns the slam (and its Anvil bonus)
        const by = ownerPlayer(a.lastHit?.owner) ?? this.player;
        const slam = by && this.run ? this.run.lo(by.slot).mods.wallSlam : 0;
        if (slam > 0) a.hurt({ amount: slam, kind: 'contact', owner: by, src: 'wallslam', quiet: true });
        a.kx = a.ky = 0;
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
          if (a.team === 'enemy') {
            const by = ownerPlayer(a.lastHit?.owner) ?? this.player;
            this.bus.emit('kill', { target: a, info: { amount: 999, kind: 'fall', owner: by }, player: by ?? undefined });
          }
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

  /**
   * The rewind ripple is local (GDD2 §3.2): centred on the hand rewinding hardest, radius 120
   * (solo) or the 72 px bubble (co-op), the world outside desaturated by 30% while it scrubs.
   * Scenes still drive params.rewind (the strength); post.ts keeps the effect inside the circle.
   */
  private rippleLast = { x: VIEW_W / 2, y: 180, r: 0 };
  private rewindPost(r: Renderer, v: { x: number; y: number }) {
    const pp = r.params;
    let best: Player | null = null, fx = 0;
    for (const p of this.players) if (p.rewindFx > fx) { fx = p.rewindFx; best = p; }
    const L = this.rippleLast;
    if (best) { L.x = best.x - v.x; L.y = best.y - 10 - v.y; L.r = best.rippleR(this.players.length <= 1); }
    let desat = 0;
    for (const p of this.players) desat = Math.max(desat, p.scrubDesat);
    pp.rewindX = L.x; pp.rewindY = L.y;
    pp.rewindR = Math.max(1, L.r);
    pp.rewindDesat = desat;
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
    this.rewindPost(r, v);
    r.ambient = this.darkness > 0.01 ? mix(this.theme.ambient, '#06050c', this.darkness) : this.theme.ambient;
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
