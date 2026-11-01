// Interactables (press E) and reward pickups that appear after clearing a room.
import { Entity } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { sfx } from '../G';
import type { Player } from './player';
import { tr, L10n } from '../i18n';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { drawPromptLabel } from '../ui/widgets';
import { TAU } from '../../engine/math';
import { frand } from '../../engine/rng';
import { ICONS } from '../../art/sprites/icons';
import { drawSlotBadge, slotColor } from '../players';
import { rect } from '../ui/draw';

export abstract class Interactable extends Entity {
  range = 20;
  near = false;
  /** the closest player in range (their device draws the prompt and presses the button) */
  nearBy: Player | null = null;
  /** who pressed interact last (events / shops attribute the choice to them, GDD2 §5.8) */
  user: Player | null = null;
  enabled = true;
  abstract prompt(): string;
  abstract interact(): void;
  /** can this hand use it (a rest bench each hand uses once, …) */
  accepts(_p: Player): boolean { return true; }
  update(_dt: number) {
    let best: Player | null = null, bd = this.range;
    if (this.enabled) for (const p of this.world.players) {
      if (p.hp <= 0 || p.locked || !this.accepts(p)) continue;
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < bd) { bd = d; best = p; }
    }
    this.nearBy = best;
    this.near = !!best;
    if (best && best.input.pressed('interact')) {
      best.input.consume('interact');
      this.user = best;
      this.interact();
    }
  }
  renderUnlit(r: Renderer) {
    if (!this.near) return;
    const text = this.prompt();
    const x = this.x, y = this.y - this.promptY();
    const who = this.nearBy?.input ?? null;
    r.worldUi((ctx, toUi) => { const p = toUi(x, y); drawPromptLabel(ctx, 'interact', text, p.x, p.y, { who }); });
  }
  promptY() { return 34; }
}

/**
 * Floating reward that is collected by touching it. Co-op (GDD2 §5.8): memory / hourglass /
 * calibration rewards drop one orb per hand, ringed in that hand's colour with its shape on top;
 * only that hand (standing or a ghost) can take it. An orb whose hand has left goes to anyone.
 */
export class RewardOrb extends Entity {
  t = 0;
  taken = false;
  /** onCollect gets the hand that touched it (the reward is theirs) */
  constructor(x: number, y: number, public icon: Sprite, public color: string, private onCollect: (p: Player) => void, public owner: number | null = null) {
    super();
    this.x = x; this.y = y;
  }
  /** may this hand take it */
  takes(p: Player): boolean {
    if (p.hp <= 0 && p.state !== 'ghost') return false;
    if (p.state === 'stopped') return false;
    if (this.owner === null || !this.world.players.some((q) => q.slot === this.owner)) return true;
    return p.slot === this.owner;
  }
  added() {
    this.world.fx.ring(this.x, this.y - 10, 2, 30, 0.5, this.color, 2);
    this.world.fx.burst(this.x, this.y - 10, 20, ['W', this.color], 120, 0.5);
    sfx('shard', { vol: 0.6 });
  }
  update(dt: number) {
    this.t += dt;
    const p = this.t > 0.6 ? this.world.players.find((q) => this.takes(q) && Math.hypot(q.x - this.x, q.y - this.y) < 14) : undefined;
    if (!this.taken && p) {
      this.taken = true;
      this.kill();
      this.world.fx.burst(this.x, this.y - 12, 26, ['W', this.color], 160, 0.5);
      this.onCollect(p);
    }
    if (Math.floor(this.t * 20) % 3 === 0)
      this.world.particles.spawn({ kind: 'px', x: this.x + frand(-6, 6), y: this.y - 12 + frand(-6, 6), vy: frand(-20, -5), life: frand(0.4, 0.8), ramp: ['W', this.color], layer: 'glow', size: 1 });
  }
  renderGround(r: Renderer) {
    const ctx = r.w;
    ctx.fillStyle = 'rgba(11,10,20,0.45)';
    ctx.beginPath(); ctx.ellipse(Math.round(this.x), Math.round(this.y), 7, 3, 0, 0, TAU); ctx.fill();
    // co-op: a pixel ring in the owner's colour on the floor
    if (this.owner !== null) {
      const c = slotColor(this.owner);
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU + this.t * 0.8;
        if (i % 5 === 4) continue;
        rect(ctx, Math.round(this.x + Math.cos(a) * 10), Math.round(this.y + Math.sin(a) * 4), 1, 1, c);
      }
    }
  }
  renderUnlit(r: Renderer) {
    const bob = Math.round(Math.sin(this.t * 3) * 2);
    const y = this.y - 14 + bob;
    r.glowAt(this.x, y, 22, this.color, 0.45 + Math.sin(this.t * 5) * 0.1);
    drawSprite(r.u, this.icon, this.x, y);
    r.lightAt(this.x, y, 70, this.color, 0.7);
    // co-op: whose it is: the owner's shape floats above the orb
    if (this.owner !== null) drawSlotBadge(r.u, this.owner, Math.round(this.x), Math.round(y - 13));
  }
}

/** Brass chest containing a part. Opens on touch. */
export class Chest extends Interactable {
  opened = false;
  t = 0;
  /** co-op: each hand rolls its own part and opens its own chest (owner = slot; null = anyone) */
  constructor(x: number, y: number, private onOpen: (p: Player | null) => void, private label: () => string, public owner: number | null = null) {
    super();
    this.x = x; this.y = y;
    this.range = 22;
  }
  accepts(p: Player) { return this.owner === null || p.slot === this.owner || !this.world.players.some((q) => q.slot === this.owner); }
  prompt() { return this.label(); }
  interact() {
    if (this.opened) return;
    this.opened = true;
    this.enabled = false;
    this.world.fx.burst(this.x, this.y - 8, 30, ['W', 'B6', 'B4'], 150, 0.6);
    this.world.fx.ring(this.x, this.y - 6, 4, 34, 0.4, 'B5', 2);
    sfx('doorOpen');
    sfx('pickupBig', { vol: 0.6 });
    this.onOpen(this.user);
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
  renderUnlit(r: Renderer) {
    super.renderUnlit(r);
    if (this.owner !== null && !this.opened) drawSlotBadge(r.u, this.owner, Math.round(this.x), Math.round(this.y - 22 + Math.sin(this.t * 3)));
  }
}

export type { L10n };
void tr;
