// Exit door: stone arch in the north wall, brass gate, floating reward icon.
import { Entity } from './entity';
import type { Renderer } from '../../engine/gfx/renderer';
import { TS, T, DoorSpec } from '../world/room';
import { col } from '../../art/palette';
import { sfx } from '../G';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import type { Player } from './player';
import { G } from '../G';
import { rect } from '../ui/draw';
import { drawSlotBadge } from '../players';
import { Text } from '../ui/text';

/** co-op: more than half the standing hands waiting this long in a doorway take everyone through */
export const DOOR_MAJORITY_WAIT = 2.5;

export interface RewardPreview { icon: Sprite | null; label: string; color: string }

export class Door extends Entity {
  open = false;
  openT = 0;
  hover = 0;
  chosen = false;
  /** standing hands inside the door frame (co-op) */
  inside: Player[] = [];
  /** standing hands that count (ghosts and stopped hands do not) */
  need = 1;
  /** seconds a majority has been waiting */
  majorityT = 0;
  /** the room keeps everyone in while this is true (a hand is still choosing its reward) */
  hold: () => boolean = () => false;
  constructor(public spec: DoorSpec, public reward: RewardPreview | null, private onEnter: (d: Door) => void) {
    super();
    this.x = spec.tx * TS + TS;
    this.y = (spec.ty + 1) * TS;
    this.sortBias = 0.6;
  }

  unlock() {
    if (this.open) return;
    this.open = true;
    this.openT = 0;
    const m = this.world.map;
    for (let ty = this.spec.ty - 1; ty <= this.spec.ty; ty++) for (let tx = this.spec.tx; tx < this.spec.tx + this.spec.w; tx++) m.set(tx, ty, T.FLOOR);
    sfx('doorOpen', { pan: this.world.pan(this.x) });
  }

  /** is a hand standing in this doorway */
  inFrame(p: Player) { return p.y < this.y - 6 && Math.abs(p.x - this.x) < 14; }

  update(dt: number) {
    if (this.open) this.openT += dt;
    const w = this.world;
    const standing = w.alive();
    if (!standing.length) return;
    const near = standing.some((p) => Math.hypot(p.x - this.x, p.y - this.y) < 48);
    this.hover += ((near ? 1 : 0) - this.hover) * Math.min(1, dt * 8);
    if (!this.open || this.chosen) { this.inside = []; this.majorityT = 0; return; }
    // GDD2 §5.4: everyone standing steps into the same door → go; more than half for 2.5 s → go.
    // Solo: one of one, so the door takes you the moment you step in (1.0).
    const was = this.inside;
    this.inside = standing.filter((p) => this.inFrame(p));
    this.need = standing.length;
    // co-op: hands waiting in the doorway draw in front of the dark passage (solo walks straight in)
    if (w.playerCount > 1) {
      for (const p of was) if (!this.inside.includes(p)) p.sortBias = 0;
      for (const p of this.inside) p.sortBias = this.y + 1 - p.y;
    }
    const n = this.inside.length;
    // co-op: nobody leaves while a hand is still choosing a reward
    if (this.hold()) { this.majorityT = 0; return; }
    if (n > this.need / 2 && n < this.need) this.majorityT += dt; else this.majorityT = 0;
    if (n >= this.need || this.majorityT >= DOOR_MAJORITY_WAIT) {
      this.chosen = true;
      sfx('doorEnter');
      this.onEnter(this);
    }
  }

  render(r: Renderer) {
    const ctx = r.w;
    const x0 = this.spec.tx * TS, y0 = this.y - 32;
    // dark passage
    for (let i = 0; i < 32; i++) {
      ctx.fillStyle = col(i < 10 ? 'K0' : i < 20 ? 'K1' : 'K2');
      ctx.globalAlpha = 1 - Math.max(0, i - 22) / 12;
      ctx.fillRect(x0 + 2, y0 + i, 28, 1);
    }
    ctx.globalAlpha = 1;
    // arch pillars, coloured by the floor's stonework
    const th = this.world.theme;
    const lip = th.wallLip, trim = th.capTrim;
    for (const px of [x0 - 2, x0 + 28]) {
      ctx.fillStyle = col('K0'); ctx.fillRect(px, y0 - 3, 6, 35);
      ctx.fillStyle = col(lip[1]); ctx.fillRect(px + 1, y0 - 2, 4, 34);
      ctx.fillStyle = col(lip[2]); ctx.fillRect(px + 1, y0 - 2, 1, 34);
      ctx.fillStyle = col(lip[0]); ctx.fillRect(px + 4, y0 - 2, 1, 34);
      ctx.fillStyle = col(trim); ctx.fillRect(px + 1, y0 + 8, 4, 1); ctx.fillRect(px + 1, y0 + 24, 4, 1);
    }
    // lintel with keystone
    ctx.fillStyle = col('K0'); ctx.fillRect(x0 - 3, y0 - 6, 38, 6);
    ctx.fillStyle = col(lip[1]); ctx.fillRect(x0 - 2, y0 - 5, 36, 4);
    ctx.fillStyle = col(lip[2]); ctx.fillRect(x0 - 2, y0 - 5, 36, 1);
    ctx.fillStyle = col('B4'); ctx.fillRect(x0 + 13, y0 - 6, 6, 6);
    ctx.fillStyle = col('B6'); ctx.fillRect(x0 + 14, y0 - 5, 4, 1);
    // gate (slides up when opening)
    const lift = this.open ? Math.min(30, this.openT * 70) : 0;
    if (lift < 30) {
      const gh = 30 - lift;
      for (let bx = x0 + 4; bx < x0 + 28; bx += 4) {
        ctx.fillStyle = col('K0'); ctx.fillRect(bx, y0, 3, gh);
        ctx.fillStyle = col('B3'); ctx.fillRect(bx + 1, y0, 1, gh - 1);
        ctx.fillStyle = col('B5'); ctx.fillRect(bx + 1, y0 + gh - 3, 1, 2);
      }
      ctx.fillStyle = col('B2'); ctx.fillRect(x0 + 3, y0 + Math.max(0, gh - 10), 26, 2);
      ctx.fillStyle = col('B2'); ctx.fillRect(x0 + 3, y0 + Math.max(0, gh - 22), 26, 2);
    }
  }

  renderUnlit(r: Renderer) {
    this.renderCount(r);
    if (!this.reward) return;
    const bob = Math.round(Math.sin(this.age * 2.5) * 2);
    const x = this.x, y = this.y - 46 + bob;
    const a = this.open ? 1 : 0.55;
    if (this.reward.icon) {
      // pedestal glow
      r.glowAt(x, y, 16, this.reward.color, this.open ? 0.5 : 0.2);
      drawSprite(r.u, this.reward.icon, x, y, { alpha: a });
    }
    r.lightAt(x, y + 20, 50, this.reward.color, this.open ? 0.6 : 0.25);
  }

  /** co-op: "1/2" and the shapes of the hands already in the doorway, over the lintel */
  private renderCount(r: Renderer) {
    if (this.world.playerCount < 2 || !this.open || this.chosen || !this.inside.length) return;
    const n = this.inside.length, need = this.need;
    const text = `${n}/${need}`;
    const slots = this.inside.map((p) => p.slot).sort((a, b) => a - b);
    const k = need > 0 && n < need ? Math.min(1, this.majorityT / DOOR_MAJORITY_WAIT) : 0;
    // beside the floating reward icon (rooms put doors on the top edge, so never above it)
    const x = this.x + 14, y = this.y - 46;
    r.worldUi((ctx, toUi) => {
      const q = toUi(x, y);
      const tw = Math.ceil(G.digits.measure(text));
      const bw = slots.length * 8;
      const W = Math.max(tw + 6 + bw, 28), H = Math.max(13, Math.ceil(9 * Text.k) + 4);
      const x0 = Math.round(q.x + 4), y0 = Math.round(q.y - H / 2);
      ctx.globalAlpha = 0.85;
      rect(ctx, x0 - 3, y0 - 2, W + 6, H + 4, 'K0');
      ctx.globalAlpha = 1;
      G.digits.draw(ctx, text, x0, y0 + H / 2 - 4.5 * Text.k, { fill: n >= need ? 'B6' : 'K10' });
      slots.forEach((s, i) => drawSlotBadge(ctx, s, x0 + tw + 8 + i * 8, y0 + Math.round(H / 2)));
      // the majority countdown fills under the plate
      if (k > 0) {
        rect(ctx, x0 - 3, y0 + H + 2, W + 6, 2, 'K2');
        rect(ctx, x0 - 3, y0 + H + 2, Math.round((W + 6) * k), 2, 'B5');
      }
    });
  }
}
