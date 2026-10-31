// Reusable vertical menu list: buttons, sliders, toggles, choices and section headers.
// Keyboard / mouse (hover + wheel) / gamepad. Long lists scroll when maxRows is set.
import { G, sfx } from '../G';
import { rect } from './draw';
import { col } from '../../art/palette';
import { textScale } from '../../engine/gfx/font';

export interface MenuItem {
  label: () => string;
  /** 'header' rows are section titles: never selected, skipped by navigation */
  kind?: 'button' | 'slider' | 'toggle' | 'choice' | 'header';
  act?: () => void;
  get?: () => number | boolean | string;
  set?: (v: any) => void;
  min?: number; max?: number; step?: number;
  options?: { label: string; value: string }[];
  disabled?: () => boolean;
  hint?: () => string;
}

export class MenuList {
  sel = 0;
  private hover = -1;
  private lmx = -1;
  private lmy = -1;
  rowH = 20;
  x = 0; y = 0; w = 240;
  /** visible rows; the list scrolls to keep the selection in view */
  maxRows = Infinity;
  /** height available for rows (logical px); limits the visible rows too */
  maxH = Infinity;
  /** first visible row */
  top = 0;
  constructor(public items: MenuItem[]) {
    while (this.sel < items.length - 1 && this.isHeader(this.sel)) this.sel++;
  }

  private isHeader(i: number) { return this.items[i]?.kind === 'header'; }
  /** row height this frame: grows with the 125% text-size setting */
  get rh() { return Math.round(this.rowH * textScale.r); }
  private get rows() { return Math.max(1, Math.min(this.items.length, this.maxRows, Math.floor(this.maxH / this.rh))); }
  private follow() {
    // keep the selection (and its section header, when there is room) on screen
    const want = this.isHeader(this.sel - 1) ? this.sel - 1 : this.sel;
    if (want < this.top) this.top = want;
    if (this.sel >= this.top + this.rows) this.top = this.sel - this.rows + 1;
    this.top = Math.max(0, Math.min(this.items.length - this.rows, this.top));
  }

  update(dt: number) {
    const inp = G.input;
    const n = this.items.length;
    const nav = inp.nav(dt);
    if (nav.y) {
      let s = this.sel;
      for (let k = 0; k < n; k++) { s = (s + nav.y + n) % n; if (!this.isHeader(s)) break; }
      this.sel = s;
      sfx('uiMove');
      this.follow();
    }
    if (inp.wheel && this.rows < n) {
      this.top = Math.max(0, Math.min(n - this.rows, this.top + inp.wheel));
      this.hover = -1;
    }
    // hover selects only when the pointer moves, so rows scrolling under a resting mouse never steal the selection
    const moved = inp.mx !== this.lmx || inp.my !== this.lmy;
    this.lmx = inp.mx; this.lmy = inp.my;
    if (inp.mouseAim && (moved || inp.pressed('attack'))) {
      let h = -1;
      for (let j = 0; j < this.rows; j++) {
        const i = this.top + j;
        if (inp.mx >= this.x && inp.mx < this.x + this.w && inp.my >= this.y + j * this.rh - 2 && inp.my < this.y + (j + 1) * this.rh - 2) h = i;
      }
      if (h >= 0 && this.isHeader(h)) h = -1;
      if (h >= 0 && h !== this.hover) { this.sel = h; sfx('uiMove'); }
      this.hover = h;
    }
    const it = this.items[this.sel];
    if (!it || it.disabled?.()) return;
    const kind = it.kind ?? 'button';
    if (nav.x && (kind === 'slider' || kind === 'choice' || kind === 'toggle')) { this.change(it, nav.x); return; }
    const click = inp.pressed('attack') && inp.mouseAim && this.hover === this.sel;
    if (inp.pressed('confirm') || click) {
      if (kind === 'button') { sfx('uiSelect'); it.act?.(); }
      else if (kind === 'toggle' || kind === 'choice') this.change(it, 1);
      else if (kind === 'slider' && click) {
        const v = Math.max(0, Math.min(1, (inp.mx - (this.x + this.w - 90)) / 80));
        it.set?.((it.min ?? 0) + v * ((it.max ?? 1) - (it.min ?? 0)));
        sfx('uiMove');
      }
    }
  }

  private change(it: MenuItem, d: number) {
    const kind = it.kind;
    if (kind === 'slider') {
      const v = (it.get?.() as number) ?? 0;
      const st = it.step ?? 0.1;
      it.set?.(Math.max(it.min ?? 0, Math.min(it.max ?? 1, Math.round((v + d * st) * 100) / 100)));
    } else if (kind === 'toggle') it.set?.(!(it.get?.() as boolean));
    else if (kind === 'choice' && it.options) {
      const cur = it.get?.();
      let i = it.options.findIndex((o) => o.value === cur);
      i = (i + d + it.options.length) % it.options.length;
      it.set?.(it.options[i].value);
    }
    sfx('uiMove');
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
    this.x = x; this.y = y; this.w = w;
    const rows = this.rows;
    this.top = Math.max(0, Math.min(this.items.length - rows, this.top));
    // scroll bar and arrows when the list is longer than the window
    if (rows < this.items.length) {
      const trackY = y - 3, trackH = rows * this.rh - 2;
      const thumbH = Math.max(12, Math.round((trackH * rows) / this.items.length));
      const thumbY = trackY + Math.round(((trackH - thumbH) * this.top) / (this.items.length - rows));
      rect(ctx, x + w + 7, trackY, 2, trackH, 'K2');
      rect(ctx, x + w + 7, thumbY, 2, thumbH, 'B3');
      if (this.top > 0) for (let k = 0; k < 3; k++) rect(ctx, x + w / 2 - k, y - 9 + k, 1 + k * 2, 1, 'B4');
      if (this.top + rows < this.items.length) for (let k = 0; k < 3; k++) rect(ctx, x + w / 2 - 2 + k, y + rows * this.rh - 2 + k, 5 - k * 2, 1, 'B4');
    }
    this.items.forEach((it, i) => {
      if (i < this.top || i >= this.top + rows) return;
      const yy = y + (i - this.top) * this.rh;
      if (it.kind === 'header') {
        const t = it.label();
        const oyH = Math.round(this.rh - this.rowH);
        G.small.draw(ctx, t, x - 2, yy + 3 + oyH, { color: 'B4' });
        const tw = Math.ceil(G.small.measure(t));
        rect(ctx, x + tw + 4, yy + 10 + oyH, w - tw - 2, 1, 'B1');
        return;
      }
      const sel = i === this.sel;
      const dis = it.disabled?.();
      if (sel) {
        rect(ctx, x - 4, yy - 3, w + 8, this.rh - 2, 'K3');
        rect(ctx, x - 4, yy - 3, 2, this.rh - 2, 'B5');
      }
      G.font.draw(ctx, it.label(), x + 6, yy, { color: dis ? 'K7' : sel ? 'K10' : 'K8' });
      const kind = it.kind ?? 'button';
      const rx = x + w - 90;
      // keep sliders and toggles centred on the (possibly larger) label
      const oy = Math.round(7.5 * (textScale.r - 1));
      if (kind === 'slider') {
        const v = (it.get?.() as number) ?? 0;
        const k = (v - (it.min ?? 0)) / ((it.max ?? 1) - (it.min ?? 0));
        rect(ctx, rx, yy + oy + 5, 80, 3, 'K0');
        rect(ctx, rx, yy + oy + 5, Math.round(80 * k), 3, sel ? 'B5' : 'B3');
        rect(ctx, rx + Math.round(80 * k) - 1, yy + oy + 3, 3, 7, sel ? 'B6' : 'B4');
        G.digits.draw(ctx, String(Math.round(v * 100)), rx - 6, yy + 2, { fill: 'K9', align: 'right' });
      } else if (kind === 'toggle') {
        const on = !!it.get?.();
        rect(ctx, rx + 56, yy + oy + 2, 22, 9, 'K0');
        rect(ctx, rx + 57, yy + oy + 3, 20, 7, on ? 'G2' : 'K3');
        rect(ctx, on ? rx + 67 : rx + 58, yy + oy + 3, 9, 7, on ? 'G4' : 'K6');
      } else if (kind === 'choice') {
        const cur = it.get?.();
        const o = it.options?.find((x) => x.value === cur);
        G.font.draw(ctx, `◀ ${o?.label ?? ''} ▶`, rx + 80, yy, { align: 'right', color: sel ? 'B5' : 'K8' });
      }
      if (sel && it.hint) G.small.draw(ctx, it.hint(), x + 6, y + rows * this.rh + 6, { color: 'K8', wrap: w });
    });
    void col;
  }
}
