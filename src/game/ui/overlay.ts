// Modal overlays drawn on the UI layer: reward choices, toasts.
import type { Renderer } from '../../engine/gfx/renderer';
import { G, sfx } from '../G';
import { tr, L, L10n, UI, i18n } from '../i18n';
import { drawHint } from './prompts';
import { card, rect, panel } from './draw';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { ease, clamp } from '../../engine/math';
import type { Choice } from '../progression/rewards';
import { SLOT_GLYPH } from '../../art/sprites/icons';
import { col } from '../../art/palette';
import { Text, TextSize } from './text';
import { drawTermLabel } from './widgets';
import { Terms } from '../meta/registry';
import { term as termDef } from '../strings';

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

/**
 * "NEW!" sits at the right end of the tag line when both fit; otherwise the tag keeps the full width
 * and the badge gets its own line under it (the band grows), so a tag never wraps around the badge.
 */
function newBesideTag(c: Choice, w: number): boolean {
  return !!c.isNew && Text.measure(c.tag, 'small').w + Text.measure(UI.new, 'small').w + 6 <= w - 50;
}
function tagW(c: Choice, w: number): number {
  return w - 50 - (newBesideTag(c, w) ? Math.ceil(Text.measure(UI.new, 'small').w) + 6 : 0);
}

interface CardLayout {
  w: number; h: number; gap: number; x0: number; y0: number;
  /** height of the coloured title band */
  band: number;
  /** text size of descriptions / the "replaces" line this frame */
  desc: TextSize; repl: TextSize;
  /** header rows relative to hy (-1 = not shown) and the header's bottom */
  head: { term: number; sub: number; quote: number; bottom: number };
}

export interface ChoiceHeader {
  title: L10n; sub?: L10n; quote?: L10n; icon?: Sprite; color: string;
  /** term id of what is being offered (memory / hourglass / calibration ...): its plain line shows under the title while the player is learning it */
  term?: string;
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
    public header: ChoiceHeader,
    private onDone?: (c: Choice) => void,
    /** returns fresh choices, or null if no rerolls remain */
    public reroll?: () => Choice[] | null,
  ) {
    sfx('uiOpen');
    G.audio.muffle(true, 2200);
    // decide once per opening whether this offer explains its term, and count the sighting
    if (header.term) { this.termPlain = Terms.showPlain(header.term); Terms.seen(header.term); }
  }

  private termPlain = false;

  rerollsLeft = () => 0;

  /** header term line shown (decided once per opening) */
  private showTerm(): boolean {
    const td = this.header.term ? termDef(this.header.term) : null;
    return !!td && (this.termPlain || tr(td.name) !== tr(this.header.title));
  }

  private lay: CardLayout | null = null;
  private layChoices: Choice[] | null = null;
  private layKey = '';

  /**
   * Header rows and card size for this frame's text scale. Everything is measured, so cards stay
   * intact from text at 80% of the layout up to the 125% setting (150%): cards widen (to 200 px for
   * three), grow taller, start below the header; when three cards still cannot hold the text, the
   * header quote goes first, then the description and "replaces" line drop to the 10px font.
   */
  private layout(): CardLayout {
    // re-measure when the text scale, language or a card's extra lines change
    let key = `${Text.k}|${i18n.lang}`;
    for (const c of this.choices) key += `|${c.id}${c.replaces ? 'r' : ''}${c.isNew ? 'n' : ''}`;
    if (this.lay && this.layChoices === this.choices && this.layKey === key) return this.lay;
    const n = this.choices.length;
    const gap = 10;
    const k = Text.k;
    const w = Math.min(Math.floor((620 - (n - 1) * gap) / n), Math.round(180 * Math.max(1, k)));
    const total = n * w + (n - 1) * gap;
    const x0 = Math.round((640 - total) / 2);
    const BOTTOM = 326; // footer hint below
    const lb = Text.lineH('body'), ls = Text.lineH('small');
    // header rows below the 2× icon: title, term line, sub, quote (relative to hy)
    const rows = (quote: boolean) => {
      let y = 39 + lb + 1;
      const term = this.showTerm() ? y : -1;
      if (term >= 0) y += lb + 1;
      const sub = this.header.sub ? y : -1;
      if (sub >= 0) y += ls + 1;
      const q = quote && this.header.quote ? y : -1;
      if (q >= 0) y += ls;
      return { term, sub, quote: q, bottom: y };
    };
    const tw = w - 62;
    const band = Math.max(44, Math.max(...this.choices.map((c) => {
      const tSize: TextSize = Text.measure(c.title, 'body').w <= tw ? 'body' : 'small';
      const newLine = c.isNew && !newBesideTag(c, w) ? Text.lineH('small') : 0;
      return Math.ceil(6 + Math.max(Text.lineH('body'), Text.measureWrapped(c.title, tSize, tw).h + (tSize === 'small' ? 2 : 0)) + 3 + Text.measureWrapped(c.tag, 'small', tagW(c, w)).h + newLine + 4);
    })));
    const need = (desc: TextSize, repl: TextSize) => Math.max(...this.choices.map((c) => {
      let h = band + 7 + Text.measureWrapped(c.desc, desc, w - 18).h + 8;
      if (c.flavor) h += Text.measureWrapped(c.flavor, 'small', w - 18).h;
      if (c.replaces) h += Text.measureWrapped(`${tr(UI.replaces)}：${tr(c.replaces)}`, repl, w - 18).h + 2;
      return Math.ceil(h + 4);
    }));
    let quote = true, desc: TextSize = 'body', repl: TextSize = 'body';
    const fits = () => need(desc, repl) <= BOTTOM - Math.max(118, 26 + rows(quote).bottom + 8);
    if (!fits()) quote = false;
    if (!fits()) desc = 'small';
    if (!fits()) repl = 'small';
    const head = rows(quote);
    const y0 = Math.max(118, 26 + head.bottom + 8);
    const h = Math.max(Math.min(196, BOTTOM - y0), Math.min(BOTTOM - y0, need(desc, repl)));
    this.lay = { w, h, gap, x0, y0, band, desc, repl, head };
    this.layChoices = this.choices;
    this.layKey = key;
    return this.lay;
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
    // header: icon, title, then the rows the layout measured (term line, sub, quote)
    const h = this.header;
    const LY = this.layout();
    const hy = 26 + Math.round((1 - ease.outCubic(fadeIn)) * -12);
    ctx.globalAlpha = A;
    if (h.icon) drawScaled(ctx, h.icon, 320, hy + 18, 2, A);
    Text.draw(ctx, h.title, 320, hy + 39, { align: 'center', color: h.color, outline: 'K0' });
    // what is on offer, in plain words: "回忆 – 本局强化 · 死后消失" (the name alone once learned)
    const td = h.term ? termDef(h.term) : null;
    if (td && LY.head.term >= 0) {
      if (tr(td.name) === tr(h.title)) Text.draw(ctx, td.plain, 320, hy + LY.head.term + Text.inkMid('body'), { size: 'small', align: 'center', color: 'K7', valign: 'middle' });
      else drawTermLabel(ctx, h.term!, 320, hy + LY.head.term, { align: 'center', layout: 'inline', color: 'K9', forcePlain: this.termPlain });
    }
    if (h.sub && LY.head.sub >= 0) Text.draw(ctx, h.sub, 320, hy + LY.head.sub, { size: 'small', align: 'center', color: 'K8' });
    if (h.quote && LY.head.quote >= 0) {
      const q = tr(h.quote);
      const n = Math.floor(clamp((this.t - 0.2) * 40, 0, q.length));
      Text.draw(ctx, '“' + q.slice(0, n) + (n < q.length ? '' : '”'), 320, hy + LY.head.quote, { size: 'small', align: 'center', color: 'K8' });
    }
    ctx.globalAlpha = 1;
    // cards
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
      this.drawCard(ctx, c, x, y, LY, sel, i === this.picked ? this.pickT : -1);
      ctx.globalAlpha = 1;
    });
    // footer hint
    if (this.picked < 0 && this.t > 0.5) {
      const items: [any, string][] = [['nav', tr(UI.choose)], ['confirm', tr(L('确认', 'Confirm'))]];
      if (this.reroll && this.rerollsLeft() > 0) items.push(['special', tr(L(`重抽 ×${this.rerollsLeft()}`, `Reroll ×${this.rerollsLeft()}`))]);
      drawHint(ctx, 320, 334, items);
    }
  }

  private drawCard(ctx: CanvasRenderingContext2D, c: Choice, x: number, y: number, LY: CardLayout, sel: boolean, pickT: number) {
    const { w, h, band } = LY;
    const rim = sel ? 'B6' : RARITY_RIM[c.rarity];
    card(ctx, x, y, w, h, rim, sel);
    // coloured header band: title (12px, or 10px when a long name would not fit) + tag line (10px)
    rect(ctx, x + 3, y + 3, w - 6, band - 3, sel ? 'K4' : 'K3');
    rect(ctx, x + 3, y + band, w - 6, 1, RARITY_RIM[c.rarity]);
    // icon medallion at 2x
    drawScaled(ctx, c.icon, x + 24, y + 23, 2);
    // slot glyph
    const slotKey = Object.keys(SLOT_GLYPH).find((k) => tr(c.tag).toLowerCase().includes(tr(UI.slots[k]).toLowerCase()));
    if (slotKey) glyph(ctx, SLOT_GLYPH[slotKey], x + w - 14, y + 8, RARITY_TEXT[c.rarity]);
    const title = tr(c.title);
    const tw = w - 62;
    const tSize = Text.measure(title, 'body').w <= tw ? 'body' : 'small';
    const ty = y + 6;
    const th = Text.draw(ctx, title, x + 44, ty + (tSize === 'small' ? 2 : 0), { size: tSize, color: RARITY_TEXT[c.rarity], maxW: tw }).h;
    const tagY = ty + Math.max(Text.lineH('body'), th + (tSize === 'small' ? 2 : 0)) + 3;
    const tagH = Text.draw(ctx, c.tag, x + 44, tagY, { size: 'small', color: 'K8', maxW: tagW(c, w) }).h;
    // "NEW!" on the tag line's right end, or on its own line under the tag (see newBesideTag)
    if (c.isNew) Text.draw(ctx, UI.new, x + w - 8, newBesideTag(c, w) ? tagY : tagY + tagH, { size: 'small', color: 'B5', align: 'right' });
    // description (12px; 10px only when three cards cannot hold the text at this size)
    Text.draw(ctx, c.desc, x + 9, y + band + 7, { size: LY.desc, color: 'K9', maxW: w - 18 });
    // flavour (10px) pinned to the bottom, "replaces" (12px, red) above it: both measured, so a
    // wrapped line pushes upward instead of printing over the line below
    let by = y + h - 8;
    if (c.flavor) {
      by -= Text.measureWrapped(c.flavor, 'small', w - 18).h;
      Text.draw(ctx, c.flavor, x + 9, by, { size: 'small', color: c.color, maxW: w - 18 });
    }
    if (c.replaces) {
      const rt = `${tr(UI.replaces)}：${tr(c.replaces)}`;
      by -= Text.measureWrapped(rt, LY.repl, w - 18).h + 2;
      Text.draw(ctx, rt, x + 9, by, { size: LY.repl, color: 'R4', maxW: w - 18 });
    }

    // selection: ticking clock hand above the card
    if (sel) {
      // sits on the top rim so it never collides with the header quote above the cards
      const cx = x + w / 2, cy = y;
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
    const w = 280;
    const dh = Text.measureWrapped(this.desc, 'small', w - 52).h;
    const h = Math.max(46, Math.ceil(8 + Text.lineH('body') + dh + 6));
    const x = 320 - w / 2, y = Math.round(-h + (h + 44) * k);
    panel(ctx, x, y, w, h, { fill: 'K1' });
    if (this.icon) drawScaled(ctx, this.icon, x + 22, y + 23, 2);
    Text.draw(ctx, this.title, x + 42, y + 5, { color: this.color });
    Text.draw(ctx, this.desc, x + 42, y + 6 + Text.lineH('body'), { size: 'small', color: 'K8', maxW: w - 52 });
  }
}
