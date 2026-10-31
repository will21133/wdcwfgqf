import { Entity } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { Sprite, drawSprite } from '../../engine/gfx/sprite';
import { arcSmear, thrustSmear, SmearPal } from '../../art/sprites/weapons';
import type { Wielder } from '../weapons/weapon';

/** Short-lived swing smear that follows its wielder. */
export class Smear extends Entity {
  t = 0;
  constructor(
    private follow: Wielder | null,
    private ox: number, private oy: number,
    private kind: 'arc' | 'thrust',
    private angle: number,
    private p: { R?: number; thick?: number; sweep?: number; len?: number; width?: number; cw?: boolean },
    private pal: SmearPal,
    private dur = 0.12,
  ) {
    super();
    if (follow) { this.x = follow.x + ox; this.y = follow.y + oy; }
    else { this.x = ox; this.y = oy; }
  }
  update(dt: number) {
    this.t += dt;
    if (this.follow && !this.follow.isEcho) { this.x = this.follow.x + this.ox; this.y = this.follow.y + this.oy; }
    else if (this.follow) { this.x = this.follow.x + this.ox; this.y = this.follow.y + this.oy; }
    if (this.t >= this.dur) this.kill();
  }
  renderUnlit(r: Renderer) {
    const f = Math.min(3, Math.floor((this.t / this.dur) * 4));
    let s: Sprite;
    if (this.kind === 'arc') s = arcSmear(this.p.R ?? 24, this.p.thick ?? 6, this.p.sweep ?? 2.4, this.angle, f, this.pal, this.p.cw ?? true);
    else s = thrustSmear(this.p.len ?? 26, this.p.width ?? 6, this.angle, f, this.pal);
    drawSprite(r.u, s, this.x, this.y);
    if (f < 2) r.glowAt(this.x + Math.cos(this.angle) * 14, this.y + Math.sin(this.angle) * 14, 18, this.pal === 'echo' ? 'C2' : 'B4', 0.25);
  }
}

/** Fading silhouette copy (dash afterimages, rewind trail). */
export class Afterimage extends Entity {
  t = 0;
  constructor(x: number, y: number, private spr: Sprite, private flip: boolean, private color: string, private dur = 0.25, private a0 = 0.6) {
    super();
    this.x = x; this.y = y;
    this.sortBias = -1;
  }
  update(dt: number) { this.t += dt; if (this.t >= this.dur) this.kill(); }
  render(r: Renderer) {
    const k = 1 - this.t / this.dur;
    drawSprite(r.w, this.spr, this.x, this.y, { flip: this.flip, tint: this.color, alpha: this.a0 * k });
  }
}

/** Expanding ground ring telegraph or shockwave (drawn on ground layer). */
export class GroundMark extends Entity {
  t = 0;
  constructor(x: number, y: number, private r0: number, private dur: number, private color: string, private filled = false) {
    super();
    this.x = x; this.y = y;
  }
  update(dt: number) { this.t += dt; if (this.t >= this.dur) this.kill(); }
  renderGround(r: Renderer) {
    const k = this.t / this.dur;
    const ctx = r.w;
    ctx.globalAlpha = 0.5 * (1 - k);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(Math.round(this.x), Math.round(this.y), this.r0, this.r0 * 0.6, 0, 0, Math.PI * 2);
    if (this.filled) ctx.fill();
    else { ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
}
