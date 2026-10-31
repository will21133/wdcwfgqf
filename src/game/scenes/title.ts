// Title screen: the frozen city at 11:59:59 under a huge moon. The second hand keeps trying to reach midnight.
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import { PixelBuf, makeCanvas } from '../../engine/gfx/canvas';
import { rgb } from '../../art/blit';
import { col } from '../../art/palette';
import { hash2, fbm2, bayer, ease, clamp, TAU } from '../../engine/math';
import { G, sfx } from '../G';
import { MenuList } from '../ui/menu';
import { tr, L } from '../i18n';
import { SettingsPanel } from '../ui/pause';
import type { Overlay } from '../ui/overlay';
import { drawHint } from '../ui/prompts';
import { panel } from '../ui/draw';
import { drawPixelArt } from '../ui/widgets';
import { Text } from '../ui/text';
import { frand } from '../../engine/rng';

export interface TitleHooks { start(): void; credits(): void; ledger(): void }

let BACK: HTMLCanvasElement | null = null;
let TOWER: HTMLCanvasElement | null = null;
let CITY: HTMLCanvasElement | null = null;
let LOGO: HTMLCanvasElement | null = null;

const CLOCK = { x: 214, y: 112, r: 54 };

function paintBackdrop() {
  // sky
  const sky = new PixelBuf(640, 360);
  const ramp = ['K0', 'U0', 'U0', 'K1', 'U1', 'V0', 'U1', 'K2'].map(rgb);
  for (let y = 0; y < 360; y++)
    for (let x = 0; x < 640; x++) {
      const t = y / 360 + (fbm2(x * 0.01, y * 0.02, 3, 3) - 0.5) * 0.12;
      const f = clamp(t, 0, 0.999) * (ramp.length - 1);
      const i = Math.floor(f), k = f - i;
      const c = ramp[Math.max(0, Math.min(ramp.length - 1, i + (k > bayer(x, y) ? 1 : 0)))];
      sky.set(x, y, c);
    }
  // moon (behind the tower, right)
  const mx = 470, my = 96, mr = 64;
  for (let y = -mr - 2; y <= mr + 2; y++)
    for (let x = -mr - 2; x <= mr + 2; x++) {
      const d = Math.hypot(x, y);
      if (d > mr) continue;
      const crater = fbm2((x + 300) * 0.06, (y + 300) * 0.06, 9, 3);
      let c = 'K10';
      if (crater > 0.6) c = 'K9';
      if (crater > 0.7) c = 'K8';
      const lit = (-x * 0.5 - y * 0.7) / mr;
      if (lit < -0.45 && bayer(x, y) > 0.3) c = 'K9';
      if (d > mr - 1.5) c = 'K9';
      sky.set(mx + x, my + y, rgb(c));
    }
  // clouds drifting across the moon
  for (let y = 120; y < 230; y++)
    for (let x = 0; x < 640; x++) {
      const n = fbm2(x * 0.012, y * 0.05, 21, 4);
      if (n > 0.62) sky.set(x, y, rgb(n > 0.7 ? 'K3' : (x + y) & 1 ? 'K2' : 'U1'));
    }
  BACK = sky.toCanvas();

  // clock tower silhouette with moonlit right edge
  const tw = new PixelBuf(640, 360);
  const tx0 = CLOCK.x - 44, tx1 = CLOCK.x + 44;
  for (let y = 40; y < 360; y++)
    for (let x = tx0 - 6; x < tx1 + 6; x++) {
      const taper = y < 70 ? Math.max(0, 70 - y) * 0.5 : 0;
      const step = y > 200 ? 6 : 0;
      if (x < tx0 - step + taper || x >= tx1 + step - taper) continue;
      const edge = x >= tx1 + step - taper - 2;
      const brick = ((y >> 2) + ((x >> 3) & 1)) & 1 ? 0 : 1;
      let c = brick ? 'K1' : 'K2';
      if ((y & 3) === 0) c = 'K0';
      if (edge) c = 'K4';
      tw.set(x, y, rgb(c));
    }
  // spire
  for (let y = 0; y < 44; y++) {
    const half = Math.max(1, Math.round((y / 44) * 30));
    for (let x = CLOCK.x - half; x <= CLOCK.x + half; x++) tw.set(x, y + 8, rgb(x > CLOCK.x + half - 2 ? 'K4' : 'K1'));
  }
  tw.set(CLOCK.x, 4, rgb('B5')); tw.set(CLOCK.x, 5, rgb('B4')); tw.set(CLOCK.x, 6, rgb('B4')); tw.set(CLOCK.x, 7, rgb('B3'));
  // the great clock face
  const { x: cx, y: cy, r } = CLOCK;
  for (let y = -r - 4; y <= r + 4; y++)
    for (let x = -r - 4; x <= r + 4; x++) {
      const d = Math.hypot(x, y);
      if (d > r + 3) continue;
      let c: string;
      if (d > r) c = d > r + 2 ? 'B1' : 'B3';
      else if (d > r - 2) c = y < 0 ? 'B5' : 'B4';
      else {
        // glowing parchment face with subtle radial shade
        const s = d / r;
        c = s < 0.6 ? 'K10' : s < 0.85 ? (bayer(x, y) > s - 0.4 ? 'K10' : 'S4') : 'S4';
      }
      tw.set(cx + x, cy + y, rgb(c));
    }
  // hour ticks
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU;
    const big = i % 5 === 0;
    for (let k = 0; k < (big ? 6 : 2); k++) {
      const rr = r - 4 - k;
      tw.set(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), rgb(big ? 'K1' : 'K7'));
    }
  }
  TOWER = tw.toCanvas();
  // roman numerals via the pixel font
  const tctx = TOWER.getContext('2d')!;
  const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  nums.forEach((n, i) => {
    const a = (i / 12) * TAU - Math.PI / 2;
    G.tiny.draw(tctx, n, cx + Math.cos(a) * (r - 15), cy + Math.sin(a) * (r - 15) - 4, { align: 'center', color: 'K2', shadow: false });
  });

  // city rooftops
  const ct = new PixelBuf(640, 360);
  let x = 0;
  while (x < 640) {
    const w = 18 + Math.floor(hash2(x, 1, 5) * 40);
    const h = 40 + Math.floor(hash2(x, 2, 5) * 80);
    const top = 360 - h;
    const roof = hash2(x, 3, 5);
    for (let yy = top; yy < 360; yy++)
      for (let xx = x; xx < Math.min(640, x + w); xx++) {
        let c = 'K0';
        if (xx === x + w - 1 || yy === top) c = 'K2';
        // lit windows (frozen warm light)
        if ((xx - x) % 6 >= 2 && (xx - x) % 6 <= 3 && (yy - top) % 9 >= 4 && (yy - top) % 9 <= 6 && yy > top + 6 && hash2(xx >> 2, yy >> 3, 7) > 0.72) c = hash2(xx, yy >> 3, 8) > 0.5 ? 'O2' : 'O3';
        ct.set(xx, yy, rgb(c));
      }
    // pitched roofs / chimneys
    if (roof < 0.5) for (let k = 0; k < w / 2; k++) for (let xx = x + k; xx < x + w - k; xx++) ct.set(xx, top - k, rgb(k === Math.floor(w / 2) - 1 ? 'K2' : 'K0'));
    else if (roof < 0.8) for (let yy = top - 10; yy < top; yy++) { ct.set(x + 4, yy, rgb('K0')); ct.set(x + 5, yy, rgb('K0')); ct.set(x + 6, yy, rgb('K1')); }
    x += w + Math.floor(hash2(x, 4, 5) * 6);
  }
  CITY = ct.toCanvas();
  LOGO = paintLogo();
}

/** "秒针" forged in brass: the 12px glyphs blown up 4x with bevel shading */
function paintLogo(): HTMLCanvasElement {
  const text = '秒针';
  const [src, sctx] = makeCanvas(40, 16);
  G.font.draw(sctx, text, 1, 1, { color: 'K10', shadow: false });
  const id = sctx.getImageData(0, 0, 40, 16).data;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < 40 && y < 16 && id[(y * 40 + x) * 4 + 3] > 0;
  const K = 4;
  const pb = new PixelBuf(40 * K + 8, 16 * K + 8);
  // outline + drop shadow
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 40; x++) {
      if (!on(x, y)) continue;
      for (let j = -1; j <= K + 1; j++) for (let i = -1; i <= K + 1; i++) pb.set(4 + x * K + i, 4 + y * K + j + 3, rgb('K0'));
    }
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 40; x++) {
      if (!on(x, y)) continue;
      for (let j = -2; j <= K + 1; j++) for (let i = -2; i <= K + 1; i++) if (!(pb.alpha(4 + x * K + i, 4 + y * K + j) && pb.get(4 + x * K + i, 4 + y * K + j)[0] > 30)) pb.set(4 + x * K + i, 4 + y * K + j, rgb('K0'));
    }
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 40; x++) {
      if (!on(x, y)) continue;
      const top = !on(x, y - 1), left = !on(x - 1, y), bot = !on(x, y + 1), right = !on(x + 1, y);
      for (let j = 0; j < K; j++)
        for (let i = 0; i < K; i++) {
          const gy = (y * K + j) / (16 * K);
          let c = gy < 0.35 ? 'B5' : gy < 0.6 ? 'B4' : 'B3';
          if (top && j === 0) c = 'B6';
          if (left && i === 0) c = 'B5';
          if (bot && j === K - 1) c = 'B1';
          if (right && i === K - 1) c = 'B2';
          pb.set(4 + x * K + i, 4 + y * K + j, rgb(c));
        }
    }
  return pb.toCanvas();
}

export class TitleScene implements Scene {
  t = 0;
  list: MenuList;
  overlays: Overlay[] = [];
  stars: { x: number; y: number; p: number }[] = [];
  drops: { x: number; y: number; l: number }[] = [];
  /** second hand animation: tries to reach 60, snaps back */
  secT = 0;

  constructor(private hooks: TitleHooks) {
    if (!BACK) paintBackdrop();
    for (let i = 0; i < 120; i++) this.stars.push({ x: frand(0, 640), y: frand(0, 200), p: frand(0, 10) });
    for (let i = 0; i < 70; i++) this.drops.push({ x: frand(0, 640), y: frand(0, 360), l: frand(2, 6) });
    this.list = new MenuList([
      { label: () => tr(L('开始', 'Begin')), act: () => { sfx('uiSelect'); this.hooks.start(); } },
      { label: () => tr(L('账簿', 'Ledger')), act: () => this.hooks.ledger() },
      { label: () => tr(L('设置', 'Settings')), act: () => this.overlays.push(new SettingsPanel()) },
      { label: () => tr(L('制作人员', 'Credits')), act: () => this.hooks.credits() },
    ]);
    this.list.rowH = 18;
  }

  enter() { G.music.play('title', 2); }

  update(dt: number) {
    this.t += dt;
    this.secT += dt;
    if (this.overlays.length) {
      const o = this.overlays[this.overlays.length - 1];
      if (!o.update(dt)) this.overlays.pop();
      return;
    }
    if (this.t > 1.2) this.list.update(dt);
  }

  private secondAngle(): number {
    // 58 → 59 ... strains toward 60, then springs back to 59
    const cyc = this.secT % 4;
    let s = 59;
    if (cyc < 1) s = 58 + ease.outElastic(Math.min(1, cyc * 3));
    else if (cyc > 2.6 && cyc < 3.2) s = 59 + ease.outCubic((cyc - 2.6) / 0.6) * 0.8;
    else if (cyc >= 3.2) s = 59.8 - ease.outBounce((cyc - 3.2) / 0.8) * 0.8;
    return (s / 60) * TAU - Math.PI / 2;
  }

  render(r: Renderer) {
    r.params.lighting = false;
    r.params.bloom = 0.35;
    r.params.bloomThreshold = 0.84;
    r.params.vignette = 0.5;
    r.params.saturation = 1;
    r.params.tint = [1, 1, 1];
    r.params.lift = [0, 0, 0];
    r.params.rewind = 0; r.params.ca = 0; r.params.hurt = 0; r.params.fade = 0;
    r.begin(0, 0, col('K0'));
    const w = r.w;
    const t = this.t;
    w.drawImage(BACK!, 0, 0);
    // twinkling stars
    for (const s of this.stars) {
      const tw = Math.sin(t * 1.5 + s.p) > 0.6;
      w.fillStyle = col(tw ? 'K10' : 'K6');
      w.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
    }
    r.glowAt(470, 96, 120, 'K8', 0.18);
    // slow parallax: tower rises slightly on start
    const rise = Math.round((1 - ease.outCubic(clamp(t / 2.5, 0, 1))) * 30);
    w.drawImage(TOWER!, 0, rise);
    // clock hands
    const { x: cx, y } = CLOCK;
    const cy = y + rise;
    const hand = (a: number, len: number, wdt: number, c: string, tail = 0) => {
      w.strokeStyle = col(c);
      w.lineWidth = wdt;
      w.beginPath();
      w.moveTo(cx + 0.5 - Math.cos(a) * tail, cy + 0.5 - Math.sin(a) * tail);
      w.lineTo(cx + 0.5 + Math.cos(a) * len, cy + 0.5 + Math.sin(a) * len);
      w.stroke();
    };
    hand((11.98 / 12) * TAU - Math.PI / 2, 30, 4, 'K1');
    hand((59.9 / 60) * TAU - Math.PI / 2, 44, 3, 'K1');
    const sa = this.secondAngle();
    hand(sa, 48, 1, 'R3', 10);
    w.fillStyle = col('R3'); w.beginPath(); w.arc(cx - Math.cos(sa) * 10 + 0.5, cy - Math.sin(sa) * 10 + 0.5, 2.5, 0, TAU); w.fill();
    w.fillStyle = col('B4'); w.fillRect(cx - 2, cy - 2, 5, 5);
    r.glowAt(cx, cy, 70, 'S4', 0.12);
    w.drawImage(CITY!, 0, Math.round(rise * 0.4));
    // frozen rain: still, glinting
    for (const d of this.drops) {
      const g = Math.sin(t * 2 + d.x) > 0.85;
      w.fillStyle = col(g ? 'K9' : 'U2');
      w.fillRect(Math.round(d.x), Math.round(d.y), 1, Math.round(d.l));
    }
    // UI
    const ui = r.ui2;
    const la = ease.outCubic(clamp((t - 0.6) / 1.2, 0, 1));
    ui.globalAlpha = la;
    const lx = 430, ly = 58 - Math.round((1 - la) * 10);
    drawPixelArt(ui, LOGO!, lx, ly + LOGO!.height / 2);
    // wordmark, a red rule as wide as it, and the tagline: all spaced from the text's real size
    const wm = 'S E C O N D   H A N D';
    const [wmW] = G.font.draw(ui, wm, lx, ly + 73, { align: 'center', color: 'K9', outline: 'K0' });
    const ruleY = Math.round(ly + 73 + Text.lineH('body') + 6);
    const ruleW = Math.max(140, Math.ceil(wmW) + 10);
    ui.fillStyle = col('R3');
    ui.fillRect(Math.round(lx - ruleW / 2), ruleY, ruleW, 1);
    ui.fillStyle = col('B4');
    ui.fillRect(lx - 3, ruleY - 2, 6, 5);
    const tagY = ruleY + 7;
    Text.draw(ui, L('撤销失误，保留胜果', 'Undo your wounds. Keep your victories.'), lx, tagY, { size: 'small', align: 'center', color: 'K8' });
    // the plaque starts below the tagline (it only moves when text is much larger than the layout)
    const plaqueY = Math.max(203, Math.round(tagY + Text.lineH('small') + 10));
    // brass plaque that carries the menu (and the first "press any key" prompt)
    const pa = ease.outCubic(clamp((t - 0.9) / 0.6, 0, 1));
    // the plaque holds four menu rows (they grow with the text) with 11 px of brass margin around them
    const plaqueH = 90 + 4 * (this.list.rh - this.list.rowH);
    if (pa > 0) {
      ui.globalAlpha = pa;
      panel(ui, lx - 68, plaqueY, 136, plaqueH, { fill: 'K1' });
    }
    ui.globalAlpha = 1;
    if (t > 1.2 && !G.audio.ctx) {
      // first interaction gives the page keyboard focus and unlocks audio: two lines centred on the plaque
      const l1 = Text.lineH('body'), l2 = Text.lineH('small'), gap = 4;
      const py = plaqueY + (plaqueH - (l1 + gap + l2)) / 2;
      Text.draw(ui, L('按任意键', 'Press any key'), lx, py, { align: 'center', color: Math.floor(t * 2) % 2 ? 'K10' : 'K8' });
      Text.draw(ui, L('或点击画面', 'or click the screen'), lx, py + l1 + gap, { size: 'small', align: 'center', color: 'K8' });
    } else if (t > 1.2) {
      const ma = clamp((t - 1.2) / 0.5, 0, 1);
      ui.globalAlpha = ma;
      this.list.render(ui, lx - 55, plaqueY + 11, 110);
      ui.globalAlpha = 1;
      drawHint(ui, 320, 340, [['nav', tr(L('选择', 'Select'))], ['confirm', tr(L('确认', 'Confirm'))]]);
    }
    // version line, centred on y 349 so it never touches the bottom edge
    Text.draw(ui, L('v0.9 · 抢先体验版', 'v0.9 · Early Access build'), 6, 349, { size: 'small', color: 'K7', valign: 'middle' });
    for (const o of this.overlays) o.render(r);
  }
}
