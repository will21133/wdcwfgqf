import { VIEW_W, VIEW_H } from './gfx/post';
import { clamp, damp, noise1 } from './math';

/** Trauma-based screen shake + smoothed follow with look-ahead. */
export class Camera {
  x = 0; y = 0; // centre in world coords
  tx = 0; ty = 0;
  trauma = 0;
  shakeScale = 1;
  private t = 0;
  bounds: { x: number; y: number; w: number; h: number } | null = null;
  /** directional kick (e.g. recoil) */
  kickX = 0; kickY = 0;
  zoomPunch = 0;

  follow(x: number, y: number, dt: number, lambda = 9) {
    this.tx = x;
    this.ty = y;
    this.x = damp(this.x, x, lambda, dt);
    this.y = damp(this.y, y, lambda, dt);
  }

  snap(x: number, y: number) { this.x = this.tx = x; this.y = this.ty = y; }

  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  kick(dx: number, dy: number) { this.kickX += dx; this.kickY += dy; }

  update(dt: number) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.kickX = damp(this.kickX, 0, 18, dt);
    this.kickY = damp(this.kickY, 0, 18, dt);
  }

  /** centre of the view in world coords after the room bounds, without shake */
  centre(): { x: number; y: number } { return this.centreOf(this.x, this.y); }
  /** where the view centre settles when following (x, y), after the room bounds */
  centreOf(x: number, y: number): { x: number; y: number } {
    let cx = x, cy = y;
    if (this.bounds) {
      const b = this.bounds;
      cx = b.w <= VIEW_W ? b.x + b.w / 2 : clamp(cx, b.x + VIEW_W / 2, b.x + b.w - VIEW_W / 2);
      cy = b.h <= VIEW_H ? b.y + b.h / 2 : clamp(cy, b.y + VIEW_H / 2, b.y + b.h - VIEW_H / 2);
    }
    return { x: cx, y: cy };
  }

  /** top-left of the view in world coords, including shake */
  view(): { x: number; y: number } {
    const { x: cx, y: cy } = this.centre();
    const s = this.trauma * this.trauma * this.shakeScale;
    const sx = noise1(this.t * 28, 1) * 7 * s;
    const sy = noise1(this.t * 28, 2) * 7 * s;
    return { x: cx - VIEW_W / 2 + sx + this.kickX, y: cy - VIEW_H / 2 + sy + this.kickY };
  }
}
