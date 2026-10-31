// Story cutscenes (intro, ending) as illustrated slides, and the credits roll.
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import { G, sfx } from '../G';
import { tr, L, L10n } from '../i18n';
import { col } from '../../art/palette';
import { ease, clamp, TAU } from '../../engine/math';
import { drawHint } from '../ui/prompts';
import { promptW, promptH } from '../ui/widgets';
import { Text } from '../ui/text';
import { drawScaled } from '../ui/overlay';
import { buildInesPortrait, buildTickPortrait } from '../../art/sprites/hub';
import { tickFrames } from '../entities/player';
import { frand } from '../../engine/rng';

type Painter = (ctx: CanvasRenderingContext2D, t: number) => void;
interface Slide { text: L10n; paint: Painter; dur?: number }

// ── slide painters (pure pixel shapes; vignette added by post) ──
const clockFace = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sec: number, t: number) => {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d > r) continue;
    ctx.fillStyle = col(d > r - 3 ? (y < 0 ? 'B5' : 'B3') : d > r * 0.8 ? 'S3' : d > r * 0.45 ? 'S4' : 'K9');
    ctx.fillRect(cx + x, cy + y, 1, 1);
  }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.fillStyle = col('K1'); ctx.fillRect(Math.round(cx + Math.cos(a) * (r - 7)) - 1, Math.round(cy + Math.sin(a) * (r - 7)) - 1, 2, 2); }
  const hand = (a: number, len: number, w: number, c: string) => { ctx.strokeStyle = col(c); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx + 0.5, cy + 0.5); ctx.lineTo(cx + 0.5 + Math.cos(a) * len, cy + 0.5 + Math.sin(a) * len); ctx.stroke(); };
  hand((11.98 / 12) * TAU - Math.PI / 2, r * 0.5, 4, 'K1');
  hand((59.9 / 60) * TAU - Math.PI / 2, r * 0.75, 3, 'K1');
  hand((sec / 60) * TAU - Math.PI / 2, r * 0.85, 1, 'R3');
  ctx.fillStyle = col('B4'); ctx.fillRect(cx - 2, cy - 2, 5, 5);
  void t;
};
const stars = (ctx: CanvasRenderingContext2D, t: number, seed = 1) => {
  for (let i = 0; i < 80; i++) {
    const x = (i * 97 * seed) % 640, y = (i * 53 * seed) % 220;
    ctx.fillStyle = col(Math.sin(t * 2 + i) > 0.7 ? 'K10' : 'K5');
    ctx.fillRect(x, y, 1, 1);
  }
};

const INTRO: Slide[] = [
  {
    text: L('霍罗城，钟表之城。这里的一切都随着大钟的节拍而转动。', 'Horologe, the city of clocks. Everything here turned to the beat of the Great Clock.'),
    paint: (ctx, t) => { stars(ctx, t); clockFace(ctx, 320, 150, 80, 50 + (t * 2) % 9, t); },
  },
  {
    text: L('直到那个夜晚。11 点 59 分 59 秒——大钟停了。', 'Until that night. At 11:59:59 — the Great Clock stopped.'),
    paint: (ctx, t) => { stars(ctx, 0); const s = t < 1.2 ? 57 + t * 1.7 : 59; clockFace(ctx, 320, 150, 80, s, t); if (t > 1.2 && t < 1.5) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(0, 0, 640, 360); } },
  },
  {
    text: L('雨滴悬在半空，钟声卡在喉咙里，整座城凝固在午夜前的最后一秒。', 'Raindrops hung in the air. The bells caught in their throats. The whole city froze in the last second before midnight.'),
    paint: (ctx, t) => {
      for (let i = 0; i < 160; i++) { const x = (i * 131) % 640, y = (i * 71) % 300 + 20; ctx.fillStyle = col(Math.sin(t + i) > 0.9 ? 'K9' : 'U2'); ctx.fillRect(x, y, 1, 4); }
      for (let x = 0; x < 640; x += 30) { const h = 60 + ((x * 7) % 50); ctx.fillStyle = col('K1'); ctx.fillRect(x, 300 - h, 26, h + 60); for (let wy = 300 - h + 6; wy < 300; wy += 10) if ((x + wy) % 3 === 0) { ctx.fillStyle = col('O2'); ctx.fillRect(x + 6, wy, 3, 4); } }
    },
  },
  {
    text: L('在那一秒里，有一样东西从钟面上落了下来。', 'And in that second, something fell from the clock face.'),
    paint: (ctx, t) => {
      stars(ctx, 0);
      const y = 40 + ease.inQuad(clamp(t / 2, 0, 1)) * 230;
      const a = t * 3;
      ctx.strokeStyle = col('R3'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(320 - Math.cos(a) * 8, y - Math.sin(a) * 8); ctx.lineTo(320 + Math.cos(a) * 30, y + Math.sin(a) * 30); ctx.stroke();
      ctx.fillStyle = col('B4'); ctx.fillRect(316 - Math.round(Math.cos(a) * 8), Math.round(y - Math.sin(a) * 8) - 3, 6, 6);
    },
  },
  {
    text: L('"……动了。真的动了。"老钟匠伊妮丝拾起了它，替它上紧了发条。', '"...It moved. It really moved." The old clockmaker Ines picked it up, and wound its spring.'),
    paint: (ctx, t) => {
      ctx.fillStyle = col('B0'); ctx.fillRect(0, 230, 640, 130);
      const ines = PORTRAIT_I ??= buildInesPortrait(0);
      drawScaled(ctx, ines, 250, 180, 3);
      const f = tickFrames().idle.down[Math.floor(t * 4) % 4];
      drawScaled(ctx, f, 400, 220, 3);
      for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i * 0.33) % 1; ctx.fillStyle = col('O3'); ctx.globalAlpha = 1 - k; ctx.fillRect(400 + frand(-1, 1), 200 - k * 40, 2, 2); ctx.globalAlpha = 1; }
    },
  },
  {
    text: L('它是大钟的秒针。它叫滴答。它要去塔顶，让时间走完最后一秒。', 'It was the Great Clock\'s second hand. Its name was Tick. It would climb the tower, and let time finish its last second.'),
    paint: (ctx, t) => { stars(ctx, t, 3); const tk = PORTRAIT_T ??= buildTickPortrait(); drawScaled(ctx, tk, 320, 200, 4); },
  },
];
let PORTRAIT_I: import('../../engine/gfx/sprite').Sprite | null = null;
let PORTRAIT_T: import('../../engine/gfx/sprite').Sprite | null = null;

const ENDING: Slide[] = [
  { text: L('静止碎裂了。秒针跨过了最后一格。', 'The Stillness shattered. The second hand crossed the final mark.'), paint: (ctx, t) => { stars(ctx, t, 2); clockFace(ctx, 320, 150, 80, Math.min(60, 59 + t * 0.8), t); } },
  { text: L('当——当——当——午夜的钟声第一次响彻霍罗城。', 'DONG — DONG — DONG — for the first time, the midnight bells rang across Horologe.'), paint: (ctx, t) => { stars(ctx, t, 2); clockFace(ctx, 320, 150, 80 + Math.sin(t * 8) * 2, 0, t); if (Math.floor(t * 2) % 2 === 0) { ctx.globalAlpha = 0.15; ctx.fillStyle = col('B6'); ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1; } } },
  { text: L('雨落了下来。面包师接住了她的托盘。迷路的孩子哭出了声，又笑了。', 'The rain fell. The baker caught her tray. The lost child cried out loud — and then laughed.'), paint: (ctx, t) => { for (let i = 0; i < 180; i++) { const x = (i * 131) % 640, y = ((i * 71) + t * 260) % 360; ctx.fillStyle = col('U3'); ctx.fillRect(x, y, 1, 5); } } },
  { text: L('在工坊里，奥伦握着伊妮丝的手。"灯都点好了。"他说。然后，安静地睡去了。', 'In the workshop, Oren held Ines\'s hand. "The lamps are all lit," he said. Then he slept, peacefully.'), paint: (ctx, t) => { ctx.fillStyle = col('B0'); ctx.fillRect(0, 240, 640, 120); const ines = PORTRAIT_I ??= buildInesPortrait(0); drawScaled(ctx, ines, 320, 200, 3); ctx.fillStyle = col('O3'); ctx.globalAlpha = 0.5 + Math.sin(t * 3) * 0.1; ctx.fillRect(200, 120, 4, 6); ctx.globalAlpha = 1; } },
  { text: L('"有些事无法撤销。"伊妮丝轻声说，"但时间会带着我们，继续向前。"', '"Some things cannot be undone," Ines whispered. "But time carries us onward, all the same."'), paint: (ctx, t) => { stars(ctx, t, 5); } },
  { text: L('滴答——滴答——', 'Tick — tock —'), dur: 3, paint: (ctx, t) => { stars(ctx, t, 5); clockFace(ctx, 320, 160, 60, (t * 1) % 60, t); } },
];

export class CutsceneScene implements Scene {
  i = 0;
  t = 0;
  private slides: Slide[];
  constructor(which: 'intro' | 'ending', private onDone: () => void) { this.slides = which === 'intro' ? INTRO : ENDING; }
  enter() { G.music.play(this.slides === INTRO ? 'title' : 'victory', 2); }
  update(dt: number) {
    this.t += dt;
    const s = this.slides[this.i];
    const text = tr(s.text);
    const typed = this.t * 30 >= text.length;
    if (G.input.pressed('cancel') || G.input.pressed('pause')) { this.onDone(); return; }
    if (G.input.pressed('confirm') || G.input.pressed('attack') || G.input.pressed('interact') || (s.dur && this.t > s.dur)) {
      if (!typed) { this.t = text.length / 30 + 0.01; return; }
      sfx('uiMove');
      if (this.i < this.slides.length - 1) { this.i++; this.t = 0; }
      else this.onDone();
    }
  }
  render(r: Renderer) {
    r.params.lighting = false; r.params.bloom = 0.28; r.params.bloomThreshold = 0.86; r.params.vignette = 0.6; r.params.saturation = 1; r.params.tint = [1, 1, 1]; r.params.lift = [0, 0, 0];
    r.params.rewind = 0; r.params.ca = 0; r.params.fade = 0;
    r.begin(0, 0, col('K0'));
    const s = this.slides[this.i];
    const fade = clamp(this.t / 0.6, 0, 1);
    r.w.globalAlpha = fade;
    s.paint(r.w, this.t);
    r.w.globalAlpha = 1;
    const ctx = r.ui2;
    const text = tr(s.text);
    const shown = text.slice(0, Math.floor(this.t * 30));
    // caption band sized from the whole line (so it does not grow while typing), prompts at the bottom
    const hintY = 360 - 6 - promptH();
    const textH = G.font.blockSize(text, 520, 16)[1];
    const top = Math.min(290, Math.floor(hintY - 6 - textH - 8));
    ctx.globalAlpha = 0.6; ctx.fillStyle = col('K0'); ctx.fillRect(0, top, 640, 360 - top); ctx.globalAlpha = 1;
    G.font.draw(ctx, shown, 320, top + 10, { align: 'center', color: 'K10', wrap: 520, lineH: 16 });
    if (this.t * 30 >= text.length) drawHint(ctx, 600, hintY, [['confirm', '']]);
    // left-aligned at x 16 (drawHint centres its row)
    const skip = tr(L('跳过', 'Skip'));
    drawHint(ctx, 16 + (promptW('cancel') + 4 + Text.measure(skip, 'body').w) / 2, hintY, [['cancel', skip]]);
  }
}

export class CreditsScene implements Scene {
  t = 0;
  constructor(private onDone: () => void) {}
  enter() { G.music.play('victory', 2); }
  update(dt: number) { this.t += dt * (G.input.down('confirm') || G.input.down('attack') ? 4 : 1); if (G.input.pressed('cancel') || this.t > 48) this.onDone(); }
  render(r: Renderer) {
    r.params.lighting = false; r.params.bloom = 0.5; r.params.vignette = 0.5; r.params.saturation = 1; r.params.fade = 0;
    r.begin(0, 0, col('K0'));
    stars(r.w, this.t, 7);
    const lines: [string, string][] = [
      ['B5', '秒针  SECOND HAND'], ['', ''],
      ['K7', tr(L('一个关于时间、悲伤与放手的故事', 'A story about time, grief, and letting go'))], ['', ''], ['', ''],
      ['B4', tr(L('游戏设计 · 程序 · 美术 · 音乐', 'Design · Code · Art · Music'))], ['K10', 'Claude Studio'], ['', ''],
      ['B4', tr(L('像素字体', 'Pixel Font'))], ['K10', 'Fusion Pixel Font — TakWolf (SIL OFL 1.1)'], ['', ''],
      ['B4', tr(L('特别感谢', 'Special Thanks'))], ['K10', tr(L('每一位倒回三秒、再试一次的玩家', 'Everyone who rewound three seconds and tried again'))], ['', ''], ['', ''],
      ['K7', tr(L('献给所有不肯放手的人。', 'For everyone who could not let go.'))], ['', ''], ['', ''],
      ['B5', tr(L('谢谢游玩', 'Thank you for playing'))],
    ];
    const ctx = r.ui2;
    lines.forEach(([c, s], i) => { const y = 380 + i * 22 - this.t * 22; if (y > -20 && y < 380 && s) G.font.draw(ctx, s, 320, y, { align: 'center', color: c || 'K10' }); });
  }
}
