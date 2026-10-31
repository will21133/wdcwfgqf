// Interactables (press E) and reward pickups that appear after clearing a room.
import { Entity } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { G, sfx } from '../G';
import { tr, L10n } from '../i18n';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { keyLabel } from '../../engine/input';
import { drawButton } from '../ui/prompts';
import { TAU } from '../../engine/math';
import { frand } from '../../engine/rng';
import { ICONS } from '../../art/sprites/icons';

export abstract class Interactable extends Entity {
  range = 20;
  near = false;
  enabled = true;
  abstract prompt(): string;
  abstract interact(): void;
  update(_dt: number) {
    const p = this.world.player;
    this.near = !!p && this.enabled && p.hp > 0 && !p.locked && Math.hypot(p.x - this.x, p.y - this.y) < this.range;
    if (this.near && G.input.pressed('interact')) {
      G.input.consume('interact');
      this.interact();
    }
  }
  renderUnlit(r: Renderer) {
    if (!this.near) return;
    const ctx = r.u;
    const text = this.prompt();
    const tw = G.small.measure(text);
    const kw = G.input.lastDevice === 'pad' ? 11 : Math.max(11, G.small.measure(keyLabel(G.input.bindings.interact[0])) + 6);
    const total = kw + 4 + tw;
    const x = Math.round(this.x - total / 2), y = Math.round(this.y - this.promptY());
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#0b0a14';
    ctx.fillRect(x - 3, y - 2, total + 6, 15);
    ctx.globalAlpha = 1;
    drawButton(ctx, x, y, 'interact');
    G.small.draw(ctx, text, x + kw + 4, y + 1, { color: 'K10' });
  }
  promptY() { return 34; }
}

/** Floating reward that is collected by touching it. */
export class RewardOrb extends Entity {
  t = 0;
  taken = false;
  constructor(x: number, y: number, public icon: Sprite, public color: string, private onCollect: () => void) {
    super();
    this.x = x; this.y = y;
  }
  added() {
    this.world.fx.ring(this.x, this.y - 10, 2, 30, 0.5, this.color, 2);
    this.world.fx.burst(this.x, this.y - 10, 20, ['W', this.color], 120, 0.5);
    sfx('shard', { vol: 0.6 });
  }
  update(dt: number) {
    this.t += dt;
    const p = this.world.player;
    if (!this.taken && this.t > 0.6 && p && p.hp > 0 && Math.hypot(p.x - this.x, p.y - this.y) < 14) {
      this.taken = true;
      this.kill();
      this.world.fx.burst(this.x, this.y - 12, 26, ['W', this.color], 160, 0.5);
      this.onCollect();
    }
    if (Math.floor(this.t * 20) % 3 === 0)
      this.world.particles.spawn({ kind: 'px', x: this.x + frand(-6, 6), y: this.y - 12 + frand(-6, 6), vy: frand(-20, -5), life: frand(0.4, 0.8), ramp: ['W', this.color], layer: 'glow', size: 1 });
  }
  renderGround(r: Renderer) {
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.45)';
    ctx.beginPath(); ctx.ellipse(Math.round(this.x), Math.round(this.y), 7, 3, 0, 0, TAU); ctx.fill();
  }
  renderUnlit(r: Renderer) {
    const bob = Math.round(Math.sin(this.t * 3) * 2);
    const y = this.y - 14 + bob;
    r.glowAt(this.x, y, 22, this.color, 0.45 + Math.sin(this.t * 5) * 0.1);
    drawSprite(r.u, this.icon, this.x, y);
    r.lightAt(this.x, y, 70, this.color, 0.7);
  }
}

/** Brass chest containing a part. Opens on touch. */
export class Chest extends Interactable {
  opened = false;
  t = 0;
  constructor(x: number, y: number, private onOpen: () => void, private label: () => string) {
    super();
    this.x = x; this.y = y;
    this.range = 22;
  }
  prompt() { return this.label(); }
  interact() {
    if (this.opened) return;
    this.opened = true;
    this.enabled = false;
    this.world.fx.burst(this.x, this.y - 8, 30, ['W', 'B6', 'B4'], 150, 0.6);
    this.world.fx.ring(this.x, this.y - 6, 4, 34, 0.4, 'B5', 2);
    sfx('doorOpen');
    sfx('pickupBig', { vol: 0.6 });
    this.onOpen();
  }
  update(dt: number) { this.t += dt; super.update(dt); }
  renderGround(r: Renderer) {
    r.w.fillStyle = 'rgba(11,10,20,0.45)';
    r.w.fillRect(Math.round(this.x) - 8, Math.round(this.y) - 1, 16, 3);
  }
  render(r: Renderer) {
    const s = ICONS.chest;
    drawSprite(r.w, s, this.x, this.y - 6, { sy: this.opened ? 0.9 : 1 });
    if (!this.opened) r.lightAt(this.x, this.y - 8, 40, 'B5', 0.5 + Math.sin(this.t * 4) * 0.1);
    if (this.opened && this.t < 99) {
      // lid glow when opened
      r.glowAt(this.x, this.y - 12, 14, 'B5', 0.25);
    }
  }
}

export type { L10n };
void tr;
