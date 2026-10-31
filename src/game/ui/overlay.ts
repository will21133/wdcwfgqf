// Modal overlays drawn on the UI layer: reward choices, toasts.
import type { Renderer } from '../../engine/gfx/renderer';
import { G, sfx } from '../G';
import { tr, L, L10n, UI } from '../i18n';
import { drawHint } from './prompts';
import { card, rect, panel } from './draw';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { ease, clamp } from '../../engine/math';
import type { Choice } from '../progression/rewards';
import { SLOT_GLYPH } from '../../art/sprites/icons';
import { col } from '../../art/palette';

export interface Overlay {
  /** returns false when finished */
  update(dt: number): boolean;
  render(r: Renderer): void;
  blocks: boolean;
}

export const RARITY_RIM = ['B3', 'U3', 'V3', 'O2'];
export const RARITY_TEXT = ['K10', 'U4', 'V4', 'O3'];

/** draw a sprite at integer scale */
export function drawScaled(ctx: CanvasRenderingContext2D, s: Sprite, cx: number, cy: number, k: number, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.img, Math.round(cx - (s.w * k) / 2), Math.round(cy - (s.h * k) / 2), s.w * k, s.h * k);
  ctx.globalAlpha = 1;
}

function glyph(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, c: string) {
  ctx.fillStyle = col(c);
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') ctx.fillRect(x + i, y + j, 1, 1); });
}

export class ChoiceOverlay implements Overlay {
  blocks = true;
  t = 0;
  sel = 0;
  picked = -1;
  pickT = 0;
  done = false;
  private hover = -1;

  constructor(
    public choices: Choice[],
    public header: { title: L10n; sub?: L10n; quote?: L10n; icon?: Sprite; color: string },
    private onDone?: (c: Choice) => void,
    /** returns fresh choices, or null if no rerolls remain */
    public reroll?: () => Choice[] | null,
  ) {
    sfx('uiOpen');
    G.audio.muffle(true, 2200);
  }

  rerollsLeft = () => 0;

  private layout() {
    const n = this.choices.length;
    const gap = 10;
    const w = Math.min(180, Math.floor((610 - (n - 1) * gap) / n));
    const h = 196;
    const total = n * w + (n - 1) * gap;
    const x0 = Math.round((640 - total) / 2);
    return { w, h, gap, x0, y0: 118 };
  }

  update(dt: number): boolean {
    this.t += dt;
    const inp = G.input;
    if (this.picked >= 0) {
      this.pickT += dt;
      if (this.pickT > 0.55) {
        G.audio.muffle(false);
        return false;
      }
      return true;
    }
    if (this.t < 0.35) return true;
    const nav = inp.nav(dt);
    if (nav.x) { this.sel = (this.sel + nav.x + this.choices.length) % this.choices.length; sfx('uiMove'); }
    // mouse hover
    const LY = this.layout();
    if (inp.mouseAim) {
      let h = -1;
      for (let i = 0; i < this.choices.length; i++) {
        const x = LY.x0 + i * (LY.w + LY.gap);
        if (inp.mx >= x && inp.mx < x + LY.w && inp.my >= LY.y0 && inp.my < LY.y0 + LY.h) h = i;
      }
      if (h >= 0 && h !== this.hover) { this.sel = h; sfx('uiMove'); }
      this.hover = h;
    }
    if (this.reroll && inp.pressed('special')) {
      const fresh = this.reroll();
      if (fresh && fresh.length) { this.choices = fresh; this.t = 0.12; this.sel = 0; sfx('cogWind'); }
      else sfx('denied');
      return true;
    }
    const click = inp.pressed('attack') && inp.mouseAim && this.hover >= 0;
    if (inp.pressed('confirm') || click || (inp.pressed('interact'))) {
      this.picked = this.sel;
      const c = this.choices[this.sel];
      c.apply();
      this.onDone?.(c);
      sfx('uiSelect');
      sfx('pickupBig', { vol: 0.6 });
    }
    return true;
  }

  render(r: Renderer) {
    const ctx = r.ui2;
    const fadeIn = clamp(this.t / 0.25, 0, 1);
    const fadeOut = this.picked >= 0 ? clamp(1 - (this.pickT - 0.25) / 0.3, 0, 1) : 1;
    const A = fadeIn * fadeOut;
    ctx.globalAlpha = 0.86 * A;
    ctx.fillStyle = col('K0');
    ctx.fillRect(0, 0, 640, 360);
    ctx.globalAlpha = 1;
    // header
    const h = this.header;
    const hy = 26 + Math.round((1 - ease.outCubic(fadeIn)) * -12);
    ctx.globalAlpha = A;
    if (h.icon) drawScaled(ctx, h.icon, 320, hy + 18, 2, A);
    G.font.draw(ctx, tr(h.title), 320, hy + 40, { align: 'center', color: h.color, outline: 'K0' });
    if (h.sub) G.small.draw(ctx, tr(h.sub), 320, hy + 56, { align: 'center', color: 'K7' });
    if (h.quote) {
      const q = tr(h.quote);
      const n = Math.floor(clamp((this.t - 0.2) * 40, 0, q.length));
      G.small.draw(ctx, '“' + q.slice(0, n) + (n < q.length ? '' : '”'), 320, hy + 70, { align: 'center', color: 'K8' });
    }
    ctx.globalAlpha = 1;
    // cards
    const LY = this.layout();
    this.choices.forEach((c, i) => {
      const delay = 0.08 + i * 0.07;
      const k = clamp((this.t - delay) / 0.4, 0, 1);
      const e = ease.outBack(k);
      let x = LY.x0 + i * (LY.w + LY.gap);
      let y = LY.y0 + Math.round((1 - e) * 140);
      const sel = i === this.sel && this.picked < 0;
      if (sel) y -= 4;
      let a = k;
      if (this.picked >= 0) {
        if (i === this.picked) { y -= Math.round(ease.outCubic(Math.min(1, this.pickT * 3)) * 10); a = fadeOut; }
        else { y += Math.round(ease.inCubic(Math.min(1, this.pickT * 2.2)) * 160); a = 1 - this.pickT * 2; }
      }
      if (a <= 0) return;
      ctx.globalAlpha = clamp(a, 0, 1);
      this.drawCard(ctx, c, x, y, LY.w, LY.h, sel, i === this.picked ? this.pickT : -1);
      ctx.globalAlpha = 1;
    });
    // footer hint
    if (this.picked < 0 && this.t > 0.5) {
      const items: [any, string][] = [['nav', tr(UI.choose)], ['confirm', tr(L('确认', 'Confirm'))]];
      if (this.reroll && this.rerollsLeft() > 0) items.push(['special', tr(L(`重抽 ×${this.rerollsLeft()}`, `Reroll ×${this.rerollsLeft()}`))]);
      drawHint(ctx, 320, 334, items);
    }
  }

  private drawCard(ctx: CanvasRenderingContext2D, c: Choice, x: number, y: number, w: number, h: number, sel: boolean, pickT: number) {
    const rim = sel ? 'B6' : RARITY_RIM[c.rarity];
    card(ctx, x, y, w, h, rim, sel);
    // coloured header band
    rect(ctx, x + 3, y + 3, w - 6, 38, sel ? 'K4' : 'K3');
    rect(ctx, x + 3, y + 41, w - 6, 1, RARITY_RIM[c.rarity]);
    // icon medallion at 2x
    drawScaled(ctx, c.icon, x + 24, y + 22, 2);
    // slot glyph
    const slotKey = Object.keys(SLOT_GLYPH).find((k) => tr(c.tag).toLowerCase().includes(tr(UI.slots[k]).toLowerCase()));
    if (slotKey) glyph(ctx, SLOT_GLYPH[slotKey], x + w - 14, y + 8, RARITY_TEXT[c.rarity]);
    // title & tag
    G.font.draw(ctx, tr(c.title), x + 44, y + 9, { color: RARITY_TEXT[c.rarity], wrap: w - 60 });
    G.small.draw(ctx, tr(c.tag), x + 44, y + 27, { color: 'K7' });
    // description
    G.font.draw(ctx, tr(c.desc), x + 9, y + 50, { color: 'K9', wrap: w - 18, lineH: 15 });
    // replaces / flavour
    let fy = y + h - 22;
    if (c.replaces) {
      G.small.draw(ctx, `${tr(UI.replaces)}：${tr(c.replaces)}`, x + 9, fy - 12, { color: 'R4' });
    }
    if (c.flavor) G.small.draw(ctx, tr(c.flavor), x + 9, fy, { color: c.color, wrap: w - 18 });
    if (c.isNew) G.small.draw(ctx, tr(UI.new), x + w - 30, y + h - 14, { color: 'B5' });
    // selection: ticking clock hand above the card
    if (sel) {
      const cx = x + w / 2, cy = y - 8;
      const a = -Math.PI / 2 + Math.floor(G.time * 2) * (Math.PI / 6);
      rect(ctx, cx - 3, cy - 3, 7, 7, 'K0');
      rect(ctx, cx - 2, cy - 2, 5, 5, 'B4');
      ctx.strokeStyle = col('B6');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 0.5, cy + 0.5);
      ctx.lineTo(cx + 0.5 + Math.cos(a) * 3, cy + 0.5 + Math.sin(a) * 3);
      ctx.stroke();
    }
    if (pickT >= 0 && pickT < 0.2) {
      ctx.globalAlpha = 1 - pickT / 0.2;
      rect(ctx, x, y, w, h, 'W');
      ctx.globalAlpha = 1;
    }
  }
}

/** Non-blocking toast (part pickups, notices) */
export class Toast implements Overlay {
  blocks = false;
  t = 0;
  constructor(private icon: Sprite | null, private title: string, private desc: string, private color = 'B5', private dur = 3.2) {}
  update(dt: number) { this.t += dt; return this.t < this.dur; }
  render(r: Renderer) {
    const ctx = r.ui2;
    const k = this.t < 0.3 ? ease.outBack(this.t / 0.3) : this.t > this.dur - 0.3 ? 1 - (this.t - (this.dur - 0.3)) / 0.3 : 1;
    const w = 260, h = 46;
    const x = 320 - w / 2, y = Math.round(-h + (h + 44) * k);
    panel(ctx, x, y, w, h, { fill: 'K1' });
    if (this.icon) drawScaled(ctx, this.icon, x + 22, y + 23, 2);
    G.font.draw(ctx, this.title, x + 42, y + 7, { color: this.color });
    G.small.draw(ctx, this.desc, x + 42, y + 24, { color: 'K8', wrap: w - 50 });
  }
}
