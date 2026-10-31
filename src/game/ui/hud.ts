import type { Renderer } from '../../engine/gfx/renderer';
import type { World } from '../world/world';
import { G } from '../G';
import { rect, hourglass, gearIcon, coinIcon, shardIcon } from './draw';
import { damp } from '../../engine/math';
import { col } from '../../art/palette';

export class HUD {
  hpShown = -1;
  hpTrail = -1;
  chargeFlash: number[] = [];
  lastCharges = 0;
  brassShown = 0;
  alpha = 1;
  bossName = '';

  update(dt: number, w: World) {
    const p = w.player;
    const run = w.run!;
    if (!p) return;
    if (this.hpShown < 0) { this.hpShown = p.hp; this.hpTrail = p.hp; }
    this.hpShown = damp(this.hpShown, p.hp, 25, dt);
    if (p.hp >= this.hpTrail) this.hpTrail = p.hp;
    else this.hpTrail = Math.max(p.hp, this.hpTrail - dt * 30);
    if (run.charges > this.lastCharges) this.chargeFlash[run.charges - 1] = 0.5;
    this.lastCharges = run.charges;
    for (let i = 0; i < this.chargeFlash.length; i++) if (this.chargeFlash[i] > 0) this.chargeFlash[i] -= dt;
    this.brassShown = damp(this.brassShown, run.brass, 12, dt);
  }

  render(r: Renderer, w: World) {
    const ctx = r.ui2;
    const p = w.player;
    const run = w.run!;
    if (!p) return;
    const m = run.mods;
    ctx.globalAlpha = this.alpha;
    // ── HP ──
    const x = 10, y = 10;
    gearIcon(ctx, x, y + 1, 'B4', 'B2', p.hp / p.maxHp < 0.3 && Math.floor(G.time * 4) % 2 ? 'R4' : 'R3');
    const bw = Math.round(70 + m.maxHp * 0.3), bh = 7;
    const bx = x + 12, by = y + 2;
    rect(ctx, bx - 1, by - 1, bw + 2, bh + 2, 'K0');
    rect(ctx, bx, by, bw, bh, 'K2');
    const tw = Math.round((bw * this.hpTrail) / p.maxHp);
    const fw = Math.round((bw * Math.max(0, this.hpShown)) / p.maxHp);
    rect(ctx, bx, by, tw, bh, 'K9');
    rect(ctx, bx, by, fw, bh, 'R2');
    rect(ctx, bx, by, fw, 2, 'R3');
    rect(ctx, bx, by, Math.min(fw, 2), 1, 'R4');
    // brass tube ticks every 10 hp
    for (let i = 10; i < p.maxHp; i += 10) rect(ctx, bx + Math.round((bw * i) / p.maxHp), by + bh - 2, 1, 2, 'K1');
    // brass caps
    rect(ctx, bx - 2, by - 2, 2, bh + 4, 'B3');
    rect(ctx, bx + bw, by - 2, 2, bh + 4, 'B3');
    ctx.drawImage(G.digitsSmall.render(`${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`, 'K10', 'K0'), bx + bw + 5, by);

    // ── Sand charges (hourglasses) ──
    const hy = y + 14;
    for (let i = 0; i < m.rewindCharges; i++) {
      const hx = bx + i * 12;
      const full = i < run.charges;
      const filling = i === run.charges;
      hourglass(ctx, hx, hy, filling ? run.sandFrac : 0, full, G.time, !full && !filling);
      if (full) {
        r.ui2.globalCompositeOperation = 'lighter';
        ctx.fillStyle = col('C1');
        ctx.globalAlpha = 0.25 + Math.sin(G.time * 4 + i) * 0.1 + Math.max(0, this.chargeFlash[i] ?? 0) * 1.4;
        ctx.fillRect(hx - 2, hy - 2, 13, 17);
        ctx.globalAlpha = this.alpha;
        r.ui2.globalCompositeOperation = 'source-over';
      }
    }
    // dash pips
    const dy = hy + 16;
    for (let i = 0; i < m.dashCharges; i++) {
      const on = i < p.dashCharges;
      rect(ctx, bx + i * 6, dy, 4, 3, 'K0');
      rect(ctx, bx + i * 6 + 1, dy, 2, 2, on ? 'K9' : 'K3');
    }
    // special cooldown dial
    const wpn = p.weapon;
    const sx = bx + m.dashCharges * 6 + 4;
    const cdFrac = wpn.specialCd > 0 ? wpn.specialCd / (wpn.specialCooldown * m.specialCd) : 0;
    rect(ctx, sx, dy - 1, 13, 5, 'K0');
    rect(ctx, sx + 1, dy, 11, 3, 'K3');
    rect(ctx, sx + 1, dy, Math.round(11 * (1 - cdFrac)), 3, cdFrac > 0 ? 'B2' : 'B5');

    // ── currencies (top-right) ──
    const brass = Math.round(this.brassShown);
    const bimg = G.digitsSmall.render(String(brass), 'B5', 'K0');
    coinIcon(ctx, 640 - 14, 10);
    ctx.drawImage(bimg, 640 - 17 - bimg.width, 11);
    if (run.shards > 0) {
      const simg = G.digitsSmall.render(String(run.shards), 'V4', 'K0');
      shardIcon(ctx, 640 - 14, 21);
      ctx.drawImage(simg, 640 - 17 - simg.width, 22);
    }
    ctx.globalAlpha = 1;

    // ── crosshair when aiming with mouse ──
    if (G.input.mouseAim && G.input.mouseInside && p.hp > 0) {
      const mx = Math.round(G.input.mx), my = Math.round(G.input.my);
      const c = 'K10';
      rect(ctx, mx - 4, my, 3, 1, c); rect(ctx, mx + 2, my, 3, 1, c);
      rect(ctx, mx, my - 4, 1, 3, c); rect(ctx, mx, my + 2, 1, 3, c);
      rect(ctx, mx, my, 1, 1, 'R4');
    }
  }
}
