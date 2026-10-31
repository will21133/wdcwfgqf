import type { Renderer } from '../../engine/gfx/renderer';
import type { World } from '../world/world';
import { G } from '../G';
import { rect, hourglass, gearIcon, coinIcon, shardIcon } from './draw';
import { damp } from '../../engine/math';
import { col } from '../../art/palette';
import { tr } from '../i18n';
import { MEMORIES } from '../progression/memories';
import { patronSigil, partIcon, SLOT_GLYPH } from '../../art/sprites/icons';

export class HUD {
  hpShown = -1;
  hpTrail = -1;
  chargeFlash: number[] = [];
  lastCharges = 0;
  brassShown = 0;
  alpha = 1;
  boss: import('../entities/boss').Boss | null = null;

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
    const bw = Math.min(150, Math.round(70 + m.maxHp * 0.3)), bh = 7;
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
    for (let i = 10; i < p.maxHp && p.maxHp < 400; i += 10) rect(ctx, bx + Math.round((bw * i) / p.maxHp), by + bh - 2, 1, 2, 'K1');
    // brass caps
    rect(ctx, bx - 2, by - 2, 2, bh + 4, 'B3');
    rect(ctx, bx + bw, by - 2, 2, bh + 4, 'B3');
    G.digits.draw(ctx, `${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`, bx + bw + 5, by - 1, { fill: 'K10' });

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
    coinIcon(ctx, 640 - 16, 11);
    G.digits.draw(ctx, String(brass), 640 - 19, 10, { fill: 'B5', align: 'right' });
    if (run.shards > 0) {
      shardIcon(ctx, 640 - 16, 23);
      G.digits.draw(ctx, String(run.shards), 640 - 19, 23, { fill: 'V4', align: 'right' });
    }
    ctx.globalAlpha = 1;

    // ── build: memory slots (bottom-left) ──
    {
      const slots = ['attack', 'special', 'dash', 'rewind', 'echo'];
      const y0 = 360 - 26;
      slots.forEach((sl, i) => {
        const x = 10 + i * 22;
        const om = run.memories.find((m) => MEMORIES[m.id]?.slot === sl);
        rect(ctx, x - 1, y0 - 1, 20, 20, 'K0');
        rect(ctx, x, y0, 18, 18, om ? 'K2' : 'K1');
        if (om) {
          const d = MEMORIES[om.id];
          ctx.drawImage(patronSigil(d.patron).img, x, y0);
          rect(ctx, x, y0 + 17, 18, 1, ['B3', 'U3', 'V3', 'O2'][om.rarity]);
        } else {
          const g = SLOT_GLYPH[sl];
          ctx.fillStyle = col('K3');
          g.forEach((row, j) => { for (let k = 0; k < row.length; k++) if (row[k] !== '.') ctx.fillRect(x + 5 + k, y0 + 5 + j, 1, 1); });
        }
      });
      const extra = run.memories.filter((m) => !slots.includes(MEMORIES[m.id]?.slot)).length;
      if (extra) G.digits.draw(ctx, '+' + extra, 10 + 5 * 22, y0 + 5, { fill: 'K8' });
      if (run.parts.length) {
        const px = 10 + 5 * 22 + (extra ? 4 + Math.ceil(G.digits.measure('+' + extra)) : 2);
        ctx.drawImage(partIcon('gear').img, px, y0 + 1);
        G.digits.draw(ctx, String(run.parts.length), px + 17, y0 + 5, { fill: 'B5' });
      }
    }

    // ── boss bar ──
    if (this.boss) {
      const b = this.boss;
      const w = 300, x = 320 - w / 2, y = 336;
      G.font.draw(ctx, tr(b.bossName), 320, y - 16, { align: 'center', color: 'K10', outline: 'K0' });
      rect(ctx, x - 2, y - 2, w + 4, 9, 'K0');
      rect(ctx, x - 1, y - 1, w + 2, 7, 'B2');
      rect(ctx, x, y, w, 5, 'K2');
      const fw = Math.round((w * b.shownHp) / b.maxHp), hw = Math.round((w * b.hp) / b.maxHp);
      rect(ctx, x, y, fw, 5, 'K9');
      rect(ctx, x, y, hw, 5, b.phase ? 'O1' : 'R2');
      rect(ctx, x, y, hw, 2, b.phase ? 'O2' : 'R3');
      for (const ph of b.phases) { rect(ctx, x + Math.round(w * ph), y - 2, 1, 9, 'B5'); }
      // brass end caps with gears
      rect(ctx, x - 6, y - 3, 4, 11, 'B3'); rect(ctx, x + w + 2, y - 3, 4, 11, 'B3');
    }

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
