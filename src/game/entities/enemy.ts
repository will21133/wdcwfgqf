// Enemy base: spawn-in, state machine helpers, steering (flow field + LOS), telegraphs, death & drops.
import { Actor, Entity } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { drawSprite, Sprite, DrawOpts } from '../../engine/gfx/sprite';
import { angleTo, TAU, clamp } from '../../engine/math';
import { frand } from '../../engine/rng';
import { Pickup } from './pickup';
import { sfx } from '../G';
import type { DamageInfo } from '../systems/combat';
import { col } from '../../art/palette';

export abstract class Enemy extends Actor {
  state = 'idle';
  stateT = 0;
  spawnT = 0.8;
  spawnDur = 0.8;
  speed = 40;
  /** palette used for death debris */
  debris = ['B3', 'B2', 'K5', 'K4'];
  brass: [number, number] = [1, 3];
  sandDrop = 0;
  flip = false;
  attacking = false;
  /** visual squash from hits/landing */
  squash = 0;
  wanderA = frand(0, TAU);
  codexId = '';
  /** elite modifier aura */
  aura = false;
  /** elite glow colour */
  auraColor = 'O1';
  tier = 1;

  constructor(x: number, y: number, hp: number) {
    super();
    this.x = x; this.y = y;
    this.hp = this.maxHp = hp;
    this.team = 'enemy';
    this.solid = true;
  }

  /** 0 → 1 over the spawn-in animation */
  get spawnK() { return clamp(1 - this.spawnT / this.spawnDur, 0, 1); }

  added() {
    const ow = this.world.run?.overwind ?? 0;
    if (ow > 0 && !(this as any).owApplied) { (this as any).owApplied = true; this.maxHp = Math.round(this.maxHp * (1 + 0.15 * ow)); this.hp = this.maxHp; }
    this.spawnDur = Math.max(0.01, this.spawnT);
    sfx('spawn', { vol: 0.5, pan: this.world.pan(this.x) });
  }

  get target(): Entity | null {
    const p = this.world.player;
    if (!p || p.hp <= 0) return null;
    // taunting echoes draw aggro
    if (this.world.run?.mods && (this.world as any).tauntEcho) {
      const e = (this.world as any).tauntEcho as Entity;
      if (!e.dead && Math.hypot(e.x - this.x, e.y - this.y) < 120) return e;
    }
    return p;
  }
  distT() { const t = this.target; return t ? Math.hypot(t.x - this.x, t.y - this.y) : 9999; }
  angT() { const t = this.target; return t ? angleTo(this.x, this.y, t.x, t.y) : 0; }

  setState(s: string) { this.state = s; this.stateT = 0; this.attacking = false; }

  update(dt: number) {
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      this.invuln = 0.1;
      if (this.spawnT <= 0) { this.world.fx.dust(this.x, this.y, 6); this.squash = 0.4; }
      return;
    }
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 3);
    this.stateT += dt;
    this.vx = this.vy = 0;
    if (this.st.stun > 0 || this.hitstun > 0) { this.attacking = false; this.onStagger(dt); return; }
    this.think(dt);
  }

  abstract think(dt: number): void;
  onStagger(_dt: number) {}

  /** steer toward target using LOS or flow field */
  moveTo(tx: number, ty: number, speed: number, dt: number) {
    let dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    if (!this.world.map.los(this.x, this.y - 2, tx, ty - 2) || this.blockedAhead(dx / d, dy / d)) {
      const f = this.world.flowDir(this.x, this.y);
      if (f) { dx = f.x; dy = f.y; }
    }
    const l = Math.hypot(dx, dy) || 1;
    const sp = speed * this.speedMul;
    this.vx = (dx / l) * sp; this.vy = (dy / l) * sp;
    this.world.move(this, this.vx * dt, this.vy * dt);
    if (Math.abs(dx) > 2) this.flip = dx < 0;
  }

  private blockedAhead(nx: number, ny: number) {
    const m = this.world.map;
    const px = this.x + nx * 12, py = this.y + ny * 12;
    return m.solidAt(px, py) || m.pitAt(px, py);
  }

  moveDir(ang: number, speed: number, dt: number): boolean {
    const vx = Math.cos(ang) * speed * this.speedMul, vy = Math.sin(ang) * speed * this.speedMul;
    // avoid walking into pits voluntarily
    const m = this.world.map;
    if (m.pitAt(this.x + Math.cos(ang) * 8, this.y + Math.sin(ang) * 8)) return true;
    return this.world.move(this, vx * dt, vy * dt);
  }

  faceTarget() { const t = this.target; if (t) this.flip = t.x < this.x; }

  onDeath(info: DamageInfo) {
    const w = this.world;
    if (info.kind !== 'fall') w.fx.shatter(this, this.debris, this.isElite ? 2 : this.r > 8 ? 1.5 : 1);
    sfx(this.isElite || this.isBoss ? 'deathBig' : 'death', { pan: w.pan(this.x) });
    w.hitstop(this.isElite ? 0.12 : 0.05);
    w.shake(this.isElite ? 0.4 : 0.15);
    if (info.kind === 'fall') return;
    // drops
    const run = w.run;
    const nb = Math.round(frand(this.brass[0], this.brass[1]) * (run?.mods.brassMul ?? 1));
    for (let i = 0; i < nb; i++) w.add(new Pickup(this.x, this.y - 4, 'brass', 1));
    if (this.sandDrop) for (let i = 0; i < this.sandDrop; i++) w.add(new Pickup(this.x, this.y - 4, 'sand', 10));
  }

  // ─── rendering helpers ───
  drawBody(r: Renderer, s: Sprite, o: DrawOpts = {}) {
    const k = this.squash;
    const sx = 1 + k * 0.25, sy = 1 - k * 0.2;
    const tint = this.flash > 0 ? '#ffffff' : this.st.stasis > 0 ? undefined : o.tint;
    let spr = s;
    if (this.st.stasis > 0) spr = s.recolor(['V0', 'V1', 'V2', 'V3', 'V4']);
    const opts: DrawOpts = { flip: this.flip, ...o, tint };
    if (k > 0.02) { opts.sx = sx; opts.sy = sy; }
    if (this.spawnT > 0) {
      const p = this.spawnK;
      opts.alpha = p;
      opts.sy = 0.3 + p * 0.7;
      opts.sx = 1.4 - p * 0.4;
    }
    if (this.falling > 0) {
      const f = this.falling / 0.55;
      opts.sx = f; opts.sy = f; opts.alpha = f;
    }
    drawSprite(r.w, spr, this.x, this.y + (this.falling > 0 ? (1 - this.falling / 0.55) * 8 : 0), opts);
    if (this.isElite) {
      r.g.globalCompositeOperation = 'lighter';
      drawSprite(r.g, spr, this.x, this.y, { flip: this.flip, tint: this.auraColor, alpha: 0.18 + Math.sin(this.age * 6) * 0.06 });
      r.g.globalCompositeOperation = 'source-over';
    }
  }

  renderGround(r: Renderer) {
    if (this.falling > 0) return;
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.45)';
    ctx.beginPath();
    const s = this.spawnT > 0 ? Math.max(0.05, this.spawnK) : 1;
    ctx.ellipse(Math.round(this.x), Math.round(this.y), this.r * 1.3 * s, this.r * 0.55 * s, 0, 0, TAU);
    ctx.fill();
    if (this.spawnT > 0) this.renderSpawn(r);
    this.renderTelegraph(r);
  }

  renderSpawn(r: Renderer) {
    // brass summoning circle with ticking marks
    const k = this.spawnK;
    const ctx = r.u;
    const R = 10 + this.r;
    ctx.strokeStyle = col('B4');
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), R * (0.5 + k * 0.5), R * 0.45 * (0.5 + k * 0.5), 0, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + k * 2;
      ctx.fillStyle = col(i % 3 ? 'B3' : 'B6');
      ctx.fillRect(Math.round(this.x + Math.cos(a) * R), Math.round(this.y + Math.sin(a) * R * 0.45), 1, 1);
    }
    ctx.globalAlpha = 1;
    r.lightAt(this.x, this.y, 40, 'B4', 0.5 * Math.sin(k * Math.PI));
  }

  renderTelegraph(_r: Renderer) {}

  /** red danger line on the ground: fills from thin to full width as k → 1 */
  teleLine(r: Renderer, x: number, y: number, ang: number, len: number, width: number, k: number, color = 'R3') {
    const ctx = r.u;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(ang);
    const w = Math.max(1, width * clamp(k, 0.15, 1));
    ctx.globalAlpha = 0.28 + k * 0.25;
    ctx.fillStyle = col(color);
    ctx.fillRect(0, -w / 2, len, w);
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, -width / 2, len * k, 1);
    ctx.fillRect(0, width / 2 - 1, len * k, 1);
    if (k > 0.85 && Math.floor(this.world.time * 30) % 2 === 0) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5; ctx.fillRect(0, -w / 2, len, w); }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  teleCircle(r: Renderer, x: number, y: number, rad: number, k: number, color = 'R3') {
    const ctx = r.u;
    ctx.globalAlpha = 0.22 + k * 0.2;
    ctx.fillStyle = col(color);
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), rad, rad, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = col(color);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), rad * k, rad * k, 0, 0, TAU);
    ctx.stroke();
    if (k > 0.85 && Math.floor(this.world.time * 30) % 2 === 0) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), rad, rad, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  teleCone(r: Renderer, x: number, y: number, ang: number, len: number, half: number, k: number, color = 'R3') {
    const ctx = r.u;
    ctx.globalAlpha = 0.2 + k * 0.2;
    ctx.fillStyle = col(color);
    ctx.beginPath();
    ctx.moveTo(Math.round(x), Math.round(y));
    ctx.arc(Math.round(x), Math.round(y), len, ang - half, ang + half);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = col(color);
    ctx.beginPath();
    ctx.arc(Math.round(x), Math.round(y), len * k, ang - half, ang + half);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** small HP pip bar shown after being damaged */
  renderUnlit(r: Renderer) {
    if (this.hp >= this.maxHp || this.dead || this.isBoss || this.spawnT > 0) return;
    const w = Math.max(10, Math.round(this.r * 2.5));
    const x = Math.round(this.x - w / 2), y = Math.round(this.y - this.height - 6);
    const ctx = r.u;
    ctx.fillStyle = col('K0');
    ctx.fillRect(x - 1, y - 1, w + 2, 4);
    ctx.fillStyle = col('K3');
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = col(this.isElite ? 'O2' : 'R3');
    ctx.fillRect(x, y, Math.max(1, Math.round((w * this.hp) / this.maxHp)), 2);
    // status pips
    let px = x;
    const pip = (c: string, n: number) => { for (let i = 0; i < Math.min(n, 10); i++) { ctx.fillStyle = col(c); ctx.fillRect(px, y + 3, 1, 1); px += 2; } };
    if (this.st.burn) pip('O3', this.st.burn);
    if (this.st.rust) pip('T4', this.st.rust);
    if (this.st.resonance) pip('U4', this.st.resonance);
  }
}
