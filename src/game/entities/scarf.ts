// Verlet scarf tail — Tick's signature secondary motion.
import { col } from '../../art/palette';

export class Scarf {
  px: number[] = []; py: number[] = []; ox: number[] = []; oy: number[] = [];
  constructor(public n = 7, public seg = 2.2) {
    for (let i = 0; i < n; i++) { this.px.push(0); this.py.push(i * seg); this.ox.push(0); this.oy.push(i * seg); }
  }
  reset(x: number, y: number) {
    for (let i = 0; i < this.n; i++) { this.px[i] = this.ox[i] = x; this.py[i] = this.oy[i] = y + i * this.seg; }
  }
  update(ax: number, ay: number, windX: number, windY: number, dt: number) {
    const { px, py, ox, oy, n, seg } = this;
    px[0] = ax; py[0] = ay;
    const g = 220 * dt * dt;
    for (let i = 1; i < n; i++) {
      const vx = (px[i] - ox[i]) * 0.86, vy = (py[i] - oy[i]) * 0.86;
      ox[i] = px[i]; oy[i] = py[i];
      const flutter = Math.sin(performance.now() / 90 + i * 1.3) * 0.08 * Math.min(1, Math.hypot(windX, windY) / 60);
      px[i] += vx + windX * dt * dt * 6 + flutter;
      py[i] += vy + g + windY * dt * dt * 6;
    }
    for (let k = 0; k < 3; k++)
      for (let i = 1; i < n; i++) {
        const dx = px[i] - px[i - 1], dy = py[i] - py[i - 1];
        const d = Math.hypot(dx, dy) || 1;
        const diff = (d - seg) / d;
        px[i] -= dx * diff;
        py[i] -= dy * diff;
      }
  }
  draw(ctx: CanvasRenderingContext2D, tint?: string, alpha = 1) {
    const { px, py, n } = this;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) pts.push([Math.round(px[i]), Math.round(py[i])]);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    // outline pass
    ctx.fillStyle = col(tint ? tint : 'K0');
    if (!tint) for (const [x, y] of pts) ctx.fillRect(x - 1, y - 1, 3, 3);
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i];
      ctx.fillStyle = col(tint ?? (i < 2 ? 'R4' : i < n - 2 ? 'R3' : 'R2'));
      ctx.fillRect(x, y, i < n - 1 ? 2 : 1, i < n - 1 ? 2 : 1);
      if (i > 0) {
        // fill gaps between points
        const [x0, y0] = pts[i - 1];
        const steps = Math.max(Math.abs(x - x0), Math.abs(y - y0));
        for (let s = 1; s < steps; s++) {
          const xx = Math.round(x0 + ((x - x0) * s) / steps), yy = Math.round(y0 + ((y - y0) * s) / steps);
          ctx.fillRect(xx, yy, 2, 2);
        }
      }
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
}
