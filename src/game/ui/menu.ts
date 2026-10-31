// Reusable vertical menu list: buttons, sliders, toggles, choices and section headers.
// Keyboard / mouse (hover + wheel) / gamepad. Long lists scroll when maxRows is set.
import { G, sfx } from '../G';
import { rect } from './draw';
import { Text } from './text';

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
    // a mouse resting where the menu opens does not pick a row until it moves
    this.lmx = G.input.mx; this.lmy = G.input.my;
  }

  private isHeader(i: number) { return this.items[i]?.kind === 'header'; }
  /** row height this frame: rowH at text scale 1, growing with the text (window scale, 125% setting) */
  get rh() { return this.rowH + Math.max(0, Math.round(Text.lineH('body') - G.font.lineH)); }
  /** height of the list's rows on screen (from y - 3 to the bottom of the last row's highlight) */
  get listH() { return this.rows * this.rh; }
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

  private lastRows = -1;
  render(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
    this.x = x; this.y = y; this.w = w;
    const rows = this.rows;
    const rh = this.rh;
    // the window got shorter or taller (first frame, resize, text size): keep the selection in view
    if (rows !== this.lastRows) { this.lastRows = rows; this.follow(); }
    this.top = Math.max(0, Math.min(this.items.length - rows, this.top));
    // scroll bar and arrows when the list is longer than the window
    if (rows < this.items.length) {
      const trackY = y - 3, trackH = rows * rh - 2;
      const thumbH = Math.max(12, Math.round((trackH * rows) / this.items.length));
      const thumbY = trackY + Math.round(((trackH - thumbH) * this.top) / (this.items.length - rows));
      rect(ctx, x + w + 7, trackY, 2, trackH, 'K2');
      rect(ctx, x + w + 7, thumbY, 2, thumbH, 'B3');
      if (this.top > 0) for (let k = 0; k < 3; k++) rect(ctx, x + w / 2 - k, y - 8 + k, 1 + k * 2, 1, 'B4');
      if (this.top + rows < this.items.length) for (let k = 0; k < 3; k++) rect(ctx, x + w / 2 - 2 + k, y + rows * rh - 2 + k, 5 - k * 2, 1, 'B4');
    }
    let hint: string | null = null;
    for (let i = this.top; i < this.top + rows && i < this.items.length; i++) {
      const it = this.items[i];
      const yy = y + (i - this.top) * rh;
      // every row is a highlight band from yy - 3, rh - 2 tall; everything in it is centred on cy
      const cy = yy - 3 + (rh - 2) / 2;
      if (it.kind === 'header') {
        // section title sits low in its row, close to the rows it introduces
        const t = it.label();
        const hy = Math.round(cy + 2);
        const tw = Math.ceil(Text.draw(ctx, t, x - 2, hy, { size: 'small', color: 'B4', valign: 'middle' }).w);
        rect(ctx, x + tw + 4, hy, w - tw - 2, 1, 'B1');
        continue;
      }
      const sel = i === this.sel;
      const dis = it.disabled?.();
      if (sel) {
        rect(ctx, x - 4, yy - 3, w + 8, rh - 2, 'K3');
        rect(ctx, x - 4, yy - 3, 2, rh - 2, 'B5');
      }
      Text.draw(ctx, it.label(), x + 6, cy, { color: dis ? 'K7' : sel ? 'K10' : 'K8', valign: 'middle' });
      const kind = it.kind ?? 'button';
      const rx = x + w - 90;
      const c = Math.round(cy);
      if (kind === 'slider') {
        const v = (it.get?.() as number) ?? 0;
        const k = (v - (it.min ?? 0)) / ((it.max ?? 1) - (it.min ?? 0));
        rect(ctx, rx, c - 1, 80, 3, 'K0');
        rect(ctx, rx, c - 1, Math.round(80 * k), 3, sel ? 'B5' : 'B3');
        rect(ctx, rx + Math.round(80 * k) - 1, c - 3, 3, 7, sel ? 'B6' : 'B4');
        // 5×7 digits with a 1 px outline: 9 font px tall
        G.digits.draw(ctx, String(Math.round(v * 100)), rx - 6, cy - 4.5 * Text.k, { fill: 'K9', align: 'right' });
      } else if (kind === 'toggle') {
        const on = !!it.get?.();
        rect(ctx, rx + 56, c - 4, 22, 9, 'K0');
        rect(ctx, rx + 57, c - 3, 20, 7, on ? 'G2' : 'K3');
        rect(ctx, on ? rx + 67 : rx + 58, c - 3, 9, 7, on ? 'G4' : 'K6');
      } else if (kind === 'choice') {
        const cur = it.get?.();
        const o = it.options?.find((x) => x.value === cur);
        Text.draw(ctx, `◀ ${o?.label ?? ''} ▶`, rx + 80, cy, { align: 'right', color: sel ? 'B5' : 'K8', valign: 'middle' });
      }
      if (sel && it.hint) hint = it.hint();
    }
    if (hint) Text.draw(ctx, hint, x + 6, y + rows * rh + 6, { size: 'small', color: 'K8', maxW: w });
  }
}
