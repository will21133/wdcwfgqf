import { Entity, Actor } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { SCONCE, FLAME, CRATE, BARREL } from '../../art/sprites/props';
import { WALL_GEAR_BIG, WALL_GEAR_SMALL } from '../../art/sprites/gearworks';
import { TS, T } from '../world/room';
import { frand } from '../../engine/rng';
import { Pickup } from './pickup';
import { sfx } from '../G';
import type { DamageInfo } from '../systems/combat';

export class WallLamp extends Entity {
  flick = frand(0, 10);
  constructor(tx: number, ty: number, private color: string, private lightColor: string) {
    super();
    this.x = tx * TS + 8;
    this.y = ty * TS - 4;
    this.sortBias = TS + 4.5; // draw just after its wall strip
  }
  update(dt: number) { this.flick += dt; }
  render(r: Renderer) {
    drawSprite(r.w, SCONCE, this.x, this.y);
    const f = FLAME[Math.floor(this.flick * 9) % 3];
    drawSprite(r.u, f, this.x, this.y + 1);
    const fl = 0.85 + Math.sin(this.flick * 13) * 0.06 + Math.sin(this.flick * 31) * 0.04;
    r.lightAt(this.x, this.y + 20, 120 * fl, this.lightColor, 0.7);
    r.lightAt(this.x, this.y + 2, 30, this.color, 0.6 * fl);
    r.glowAt(this.x, this.y, 9, this.color, 0.22 * fl);
  }
}

let BIG: Sprite[] | null = null, SMALL: Sprite[] | null = null;
export class WallGear extends Entity {
  rot = frand(0, 10);
  constructor(tx: number, ty: number, private big: boolean) {
    super();
    BIG ??= WALL_GEAR_BIG();
    SMALL ??= WALL_GEAR_SMALL();
    this.x = tx * TS + 8;
    this.y = ty * TS - (big ? 2 : 0);
    this.sortBias = TS + 3;
  }
  update(dt: number) { this.rot += dt * (this.big ? 2 : -5); }
  render(r: Renderer) {
    const fr = this.big ? BIG! : SMALL!;
    const n = fr.length;
    drawSprite(r.w, fr[((Math.floor(this.rot) % n) + n) % n], this.x, this.y);
  }
}

/** Breakable crate / barrel. Occupies a BLOCK tile until destroyed. */
export class Breakable extends Actor {
  constructor(private tx: number, private ty: number, private type: 'crate' | 'barrel') {
    super();
    this.x = tx * TS + 8;
    this.y = ty * TS + 14;
    this.hp = this.maxHp = type === 'crate' ? 20 : 14;
    this.team = 'neutral';
    this.r = 7;
    this.mass = 99;
    this.canFall = false;
    this.height = 16;
  }
  hurt(info: DamageInfo): number {
    if (this.dead) return 0;
    this.hp -= info.amount;
    this.flash = 0.08;
    this.world.fx.hitSparks(this.x, this.y - 8, info.x !== undefined ? Math.atan2(this.y - (info.y ?? 0), this.x - info.x) : 0, 'normal', 6);
    sfx('woodHit', { vol: 0.6, pan: this.world.pan(this.x) });
    if (this.hp <= 0) this.smash();
    return info.amount;
  }
  smash() {
    this.dead = true;
    const w = this.world;
    w.map.set(this.tx, this.ty, T.FLOOR);
    w.fx.shatter(this, this.type === 'crate' ? ['B1', 'B2', 'B0', 'B4'] : ['T2', 'T1', 'K4', 'B2'], 0.8);
    sfx('woodBreak', { pan: w.pan(this.x) });
    if (frand() < 0.5) for (let i = 0; i < 2; i++) w.add(new Pickup(this.x, this.y - 4, 'brass', 1));
    if (frand() < 0.08) w.add(new Pickup(this.x, this.y - 4, 'heal', 8));
  }
  update() {}
  renderGround(r: Renderer) {
    r.w.fillStyle = 'rgba(11,10,20,0.4)';
    r.w.fillRect(Math.round(this.x) - 8, Math.round(this.y) - 1, 16, 3);
  }
  render(r: Renderer) {
    drawSprite(r.w, this.type === 'crate' ? CRATE : BARREL, this.x, this.y, { tint: this.flash > 0 ? '#ffffff' : undefined });
  }
}
