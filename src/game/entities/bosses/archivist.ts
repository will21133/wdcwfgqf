// 档案管理员 THE ARCHIVIST — boss of the Sand Archive.
// She keeps the record of every second — and she can REVISE it: she rewinds herself, restoring the damage
// you dealt in the last few seconds. But what your ECHOES did is already the past: echo and paradox damage
// cannot be revised, and hitting her with one while the hourglass flips interrupts the revision.
import { Boss } from '../boss';
import type { Renderer } from '../../../engine/gfx/renderer';
import { PixelBuf } from '../../../engine/gfx/canvas';
import { Sprite, spriteFromBuf, drawSprite } from '../../../engine/gfx/sprite';
import { rgb } from '../../../art/blit';
import { Bullet } from '../projectile';
import { Entity } from '../entity';
import { frand } from '../../../engine/rng';
import { angleTo, clamp, ease, TAU } from '../../../engine/math';
import { sfx } from '../../G';
import { L, tr } from '../../i18n';
import { col } from '../../../art/palette';
import { rumbleAll } from '../../../engine/rumble';
import type { DamageInfo } from '../../systems/combat';
import { findEnemy } from '../../world/director';

interface Art { body: Sprite[]; flip: Sprite }
let ART: Art | null = null;

function paint(phase: number, flipped: boolean): Sprite {
  const pb = new PixelBuf(40, 72);
  const set = (x: number, y: number, c: string) => pb.set(x, y, rgb(c));
  const cx = 20;
  // robe: tall, tapering into tattered pages at the hem
  for (let y = 26; y < 70; y++) {
    const t = (y - 26) / 44;
    const w = 6 + t * 11;
    for (let x = -Math.round(w); x <= Math.round(w); x++) {
      if (y > 62 && ((x + phase * 2 + y) % 5 === 0)) continue; // tattered hem
      let c = x < -w * 0.4 ? 'V1' : x > w * 0.5 ? 'K1' : 'V0';
      if ((y - 30) % 9 === 0 && Math.abs(x) < w - 2) c = 'K10'; // bands of paper strips
      if ((y - 30) % 9 === 1 && Math.abs(x) < w - 2 && x % 3 === 0) c = 'K8';
      set(cx + x, y, c);
    }
  }
  // shoulders / cowl
  for (let y = 20; y < 30; y++) for (let x = -10; x <= 10; x++) if (x * x / 100 + (y - 27) * (y - 27) / 25 < 1) set(cx + x, y, x < -3 ? 'V2' : x > 4 ? 'V0' : 'V1');
  // the hourglass head
  const hy = 2;
  for (let y = 0; y < 20; y++) {
    const pinch = Math.abs(y - 10) / 10;
    const w = Math.round(1 + pinch * 6);
    for (let x = -w; x <= w; x++) {
      let c = 'U1';
      if (Math.abs(x) === w) c = 'K8';
      set(cx + x, hy + y, c);
    }
  }
  // brass caps
  for (let x = -8; x <= 8; x++) { set(cx + x, hy - 1, 'B4'); set(cx + x, hy, 'B3'); set(cx + x, hy + 19, 'B3'); set(cx + x, hy + 20, 'B2'); }
  // golden sand (top or bottom depending on flip)
  for (let y = 0; y < 20; y++) {
    const pinch = Math.abs(y - 10) / 10;
    const w = Math.round(pinch * 6) - 1;
    const filled = flipped ? y < 10 && y > 3 : y > 13;
    if (filled) for (let x = -w; x <= w; x++) set(cx + x, hy + y, y % 3 ? 'S3' : 'S4');
  }
  set(cx, hy + 10, 'S4'); set(cx, hy + 11, 'S3');
  // glowing eye in the glass
  set(cx - 1, hy + 6, 'V4'); set(cx + 1, hy + 6, 'V4');
  // quill hand
  for (let k = 0; k < 14; k++) set(cx + 13 + Math.round(k * 0.3), 34 - k, k < 3 ? 'K10' : 'K9');
  return spriteFromBuf(pb, cx, 70);
}

/** ink line hazard: draws, then burns for a while */
class InkLine extends Entity {
  t = 0;
  constructor(public x0: number, public y0: number, public x1: number, public y1: number, public owner: Boss, public warn = 0.8, public live = 1.6) { super(); }
  update(dt: number) {
    this.t += dt;
    if (this.t > this.warn && this.t < this.warn + this.live) {
      const vx = this.x1 - this.x0, vy = this.y1 - this.y0;
      const L2 = vx * vx + vy * vy;
      for (const p of this.world.playersIn((q) => {
        const k = clamp(((q.x - this.x0) * vx + (q.y - this.y0) * vy) / L2, 0, 1);
        return Math.hypot(q.x - (this.x0 + vx * k), q.y - (this.y0 + vy * k)) < 7;
      })) this.world.hurtPlayers((q) => q === p, { amount: 9, kind: 'aoe', owner: this.owner, x: p.x, y: p.y - 10, knock: 80 });
    }
    if (this.t > this.warn + this.live) this.kill();
  }
  renderGround(r: Renderer) {
    const ctx = r.u;
    const k = clamp(this.t / this.warn, 0, 1);
    const live = this.t > this.warn;
    ctx.strokeStyle = col(live ? 'K0' : 'R3');
    ctx.globalAlpha = live ? 0.9 : 0.35 + k * 0.3;
    ctx.lineWidth = live ? 6 : 2 + k * 3;
    ctx.beginPath();
    const ex = this.x0 + (this.x1 - this.x0) * (live ? 1 : k), ey = this.y0 + (this.y1 - this.y0) * (live ? 1 : k);
    ctx.moveTo(this.x0, this.y0); ctx.lineTo(ex, ey); ctx.stroke();
    if (live) { ctx.strokeStyle = col('V1'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(this.x0, this.y0); ctx.lineTo(this.x1, this.y1); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
}

/** a falling column of time-sand: FIXED damage (cannot be undone) */
class SandFall extends Entity {
  t = 0;
  constructor(x: number, y: number, public owner: Boss, public warn = 1.0) { super(); this.x = x; this.y = y; }
  update(dt: number) {
    const prev = this.t;
    this.t += dt;
    if (prev < this.warn && this.t >= this.warn) {
      this.world.hurtPlayers((p) => Math.hypot(p.x - this.x, (p.y - this.y) * 1.4) < 18, { amount: 12, kind: 'aoe', owner: this.owner, x: this.x, y: this.y, knock: 120, fixed: true });
      for (let i = 0; i < 14; i++) this.world.particles.spawn({ kind: 'debris', x: this.x + frand(-8, 8), y: this.y, z: frand(0, 6), vx: frand(-40, 40), vy: frand(-20, 20), vz: frand(30, 80), grav: 300, life: frand(0.4, 0.8), ramp: ['S4', 'S3', 'V3'], size: 1 });
      this.world.fx.ring(this.x, this.y, 3, 20, 0.3, 'V3', 2, 'unlit');
      sfx('splash', { vol: 0.4, pan: this.world.pan(this.x) });
    }
    if (this.t > this.warn + 0.35) this.kill();
  }
  renderGround(r: Renderer) {
    const ctx = r.u;
    if (this.t < this.warn) {
      const k = this.t / this.warn;
      ctx.globalAlpha = 0.3 + k * 0.3;
      ctx.fillStyle = col('V2');
      ctx.beginPath(); ctx.ellipse(Math.round(this.x), Math.round(this.y), 18, 12, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = col('V4'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(Math.round(this.x), Math.round(this.y), 18 * k, 12 * k, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      // trickle from above
      ctx.fillStyle = col('S3');
      for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(this.x + frand(-3, 3)), Math.round(this.y - 120 + ((this.t * 200 + i * 30) % 120)), 1, 3);
    } else {
      const k = (this.t - this.warn) / 0.35;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = col('S3');
      ctx.fillRect(Math.round(this.x) - 5, Math.round(this.y) - 140, 10, 140);
      ctx.fillStyle = col('S4');
      ctx.fillRect(Math.round(this.x) - 2, Math.round(this.y) - 140, 3, 140);
      ctx.globalAlpha = 1;
    }
  }
}

export class Archivist extends Boss {
  bossName = L('档案管理员', 'The Archivist');
  bossTitle = L('记录每一秒的人', 'Keeper of Every Second');
  phases = [0.66, 0.33];
  float = 0;
  queue: string[] = [];
  /** damage ledger for revision: [time, amount] of revisable (non-echo) damage */
  ledger: [number, number][] = [];
  past: { x: number; y: number }[] = [];
  revT = 4;
  flipped = false;
  waveA = 0;

  constructor(x: number, y: number) {
    super(x, y, 2300);
    ART ??= { body: [0, 1, 2].map((p) => paint(p, false)), flip: paint(0, true) };
    this.r = 12; this.height = 68; this.kind = 'archivist'; this.codexId = 'archivist';
    this.debris = ['K10', 'K9', 'V1', 'S3', 'B4'];
    this.collides = false;
  }

  onHurt(info: DamageInfo, dealt: number) {
    // revisable = a hand's own blow; the past (any hand's echo: odd DamageInfo.src, a paradox,
    // a resonance ring) cannot be revised (PLAN2 §1.9 src = slot × 2 + echo)
    const fromPast = !!info.echo || (info.src !== undefined && info.src >= 0 && info.src % 2 === 1);
    const revisable = !fromPast && info.kind !== 'paradox' && info.via !== 'resonance';
    if (revisable) this.ledger.push([this.world.time, dealt]);
    if (this.state === 'revise' && !revisable) {
      // interrupted by the past!
      this.setState('stagger');
      this.world.fx.banner(this.x, this.y - 84, tr(L('修订失败！', 'Revision failed!')), 'C3', 1.2);
      this.world.fx.burst(this.x, this.y - 50, 30, ['C4', 'C3', 'S4'], 160, 0.6);
      sfx('stasisBreak');
      rumbleAll(0.5, 0.5, 200);
      this.revT = 6;
    }
  }

  onPhase(p: number) {
    this.setState('summon');
    this.queue = [];
    if (p === 2) sfx('waveStart');
  }

  private next(): string {
    if (this.revT <= 0) { this.revT = this.phase >= 2 ? 6 : 8; return 'revise'; }
    if (!this.queue.length) {
      this.queue = this.phase === 0 ? ['pages', 'ink', 'sand', 'pages'] : this.phase === 1 ? ['pages', 'ink', 'sand', 'teleport', 'pages', 'ink'] : ['pages', 'sand', 'ink', 'teleport', 'sand', 'pages'];
      this.world.rng.shuffle(this.queue);
    }
    return this.queue.shift()!;
  }

  think(dt: number) {
    const t = this.target;
    if (!t) return;
    this.float = Math.sin(this.age * 1.8) * 3;
    this.revT -= dt;
    // keep a short history of positions (for her own rewind)
    if (Math.floor(this.age * 10) !== Math.floor((this.age - dt) * 10)) { this.past.push({ x: this.x, y: this.y }); if (this.past.length > 30) this.past.shift(); }
    this.ledger = this.ledger.filter(([tm]) => this.world.time - tm < 3);
    this.faceTarget();
    switch (this.state) {
      case 'idle':
      case 'float': {
        const d = this.distT();
        const a = angleTo(t.x, t.y, this.x, this.y);
        const want = 120;
        if (d < want) this.moveDir(a, 40, dt);
        else if (d > want + 40) this.moveDir(a + Math.PI, 30, dt);
        else this.moveDir(a + Math.PI / 2, 25, dt);
        if (this.stateT > (this.phase ? 0.8 : 1.2)) this.setState(this.next());
        break;
      }
      case 'pages': {
        if (this.stateT < dt * 1.5) { this.waveA = angleTo(this.x, this.y, t.x, t.y); sfx('cogWind'); }
        const waves = this.phase >= 1 ? 4 : 3;
        for (let wv = 0; wv < waves; wv++) {
          const tt = 0.5 + wv * 0.45;
          if (this.stateT >= tt && this.stateT - dt < tt) {
            const n = 11, gap = Math.floor(frand(2, n - 2));
            for (let i = 0; i < n; i++) {
              if (Math.abs(i - gap) <= 0.5 + (this.phase ? 0 : 0.5)) continue;
              const a = this.waveA + (i - (n - 1) / 2) * 0.13;
              this.world.add(new Bullet({ team: 'enemy', x: this.x, y: this.y - 40, ang: a, speed: 105, dmg: 8, style: 'shard', r: 2.5, owner: this, life: 4, pal: ['W', 'K10', 'M2'] }));
            }
            sfx('spit', { vol: 0.5 });
          }
        }
        this.attacking = this.stateT > 0.4;
        if (this.stateT > 0.6 + waves * 0.45) this.setState('float');
        break;
      }
      case 'ink': {
        if (this.stateT < dt * 1.5) {
          const n = this.phase >= 1 ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const a = angleTo(this.x, this.y, t.x, t.y) + (i - (n - 1) / 2) * 0.55;
            const x0 = this.x, y0 = this.y;
            this.world.add(new InkLine(x0, y0, x0 + Math.cos(a) * 320, y0 + Math.sin(a) * 320, this, 0.85 + i * 0.12));
          }
          sfx('sentryWind');
        }
        if (this.stateT > 1.6) this.setState('float');
        break;
      }
      case 'sand': {
        if (this.stateT < dt * 1.5) {
          sfx('steamWind');
          const n = this.phase >= 2 ? 9 : 6;
          this.world.add(new SandFall(t.x, t.y, this, 1.1));
          for (let i = 0; i < n; i++) {
            const a = frand(0, TAU), d = frand(30, 110);
            const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d * 0.7;
            if (!this.world.map.solidAt(x, y)) this.world.add(new SandFall(x, y, this, 0.9 + frand(0, 0.8)));
          }
        }
        if (this.stateT > 2) this.setState('float');
        break;
      }
      case 'teleport': {
        if (this.stateT < dt * 1.5) { this.world.fx.burst(this.x, this.y - 40, 30, ['S4', 'S3', 'V3'], 120, 0.6); sfx('stasis'); }
        if (this.stateT > 0.45 && this.stateT - dt <= 0.45) {
          for (let k = 0; k < 20; k++) {
            const a = frand(0, TAU), d = frand(110, 160);
            const x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d * 0.7;
            if (!this.world.map.solidAt(x, y) && !this.world.map.pitAt(x, y)) { this.x = x; this.y = y; break; }
          }
          this.world.fx.burst(this.x, this.y - 40, 30, ['S4', 'S3', 'V3'], 120, 0.6);
          this.past = [];
        }
        this.invuln = this.stateT < 0.5 ? 0.1 : 0;
        if (this.stateT > 0.9) this.setState(this.next());
        break;
      }
      case 'revise': {
        // tell: the hourglass flips (1.2s). Echo/paradox damage interrupts (see onHurt).
        if (this.stateT < dt * 1.5) {
          this.flipped = true;
          sfx('rewind');
          this.world.fx.banner(this.x, this.y - 84, tr(L('修订中……', 'Revising...')), 'V4', 1.2);
        }
        if (this.stateT >= 1.2) {
          const restored = Math.round(this.ledger.reduce((s, [, a]) => s + a, 0) * 0.6);
          const back = this.past[0];
          if (back) { this.x = back.x; this.y = back.y; }
          if (restored > 0) {
            this.hp = Math.min(this.maxHp, this.hp + restored);
            this.world.fx.number(this.x, this.y - 74, restored, 'V4', true);
          }
          this.world.fx.ring(this.x, this.y - 40, 4, 60, 0.5, 'V4', 3);
          sfx('rewindEnd');
          this.ledger = [];
          this.flipped = false;
          this.setState('float');
        }
        break;
      }
      case 'stagger':
        this.flipped = false;
        if (this.stateT > 1.6) this.setState('float');
        break;
      case 'summon': {
        if (this.stateT > 0.6 && this.stateT - dt <= 0.6) {
          const def = findEnemy('pageswarm') ?? findEnemy('pages') ?? findEnemy('mite');
          if (def) for (let i = 0; i < 4; i++) this.world.add(def.make(this.x + frand(-50, 50), this.y + frand(10, 40)));
          this.world.fx.banner(this.x, this.y - 84, tr(L('翻页', 'Turn the page')), 'K10', 1);
        }
        this.invuln = 0.1;
        if (this.stateT > 1.2) this.setState('float');
        break;
      }
    }
  }

  render(r: Renderer) {
    const A = ART!;
    const s = this.flipped ? A.flip : A.body[Math.floor(this.age * 4) % 3];
    const tint = this.flash > 0 ? '#ffffff' : this.state === 'revise' && Math.floor(this.stateT * 10) % 2 ? 'V3' : undefined;
    const y = this.y + this.float - 6;
    if (this.state === 'teleport' && this.stateT > 0.2 && this.stateT < 0.6) return;
    drawSprite(r.w, s, this.x, y, { tint, flip: this.flip });
    r.lightAt(this.x, y - 58, 70, 'V3', 0.55);
    r.glowAt(this.x, y - 62, 8, 'V4', 0.4);
    if (this.state === 'revise') {
      // the past position she will return to
      const back = this.past[0];
      if (back) { r.u.globalAlpha = 0.4; drawSprite(r.u, s, back.x, back.y - 6, { tint: 'V3' }); r.u.globalAlpha = 1; }
    }
  }

  renderGround(r: Renderer) {
    r.w.fillStyle = 'rgba(11,10,20,0.4)';
    r.w.beginPath(); r.w.ellipse(Math.round(this.x), Math.round(this.y), 14, 5, 0, 0, TAU); r.w.fill();
  }
}

void ease;
