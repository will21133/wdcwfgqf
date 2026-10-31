// Dialogue overlay with portraits and typewriter text.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import { drawScaled } from './overlay';
import type { Sprite } from '../../engine/gfx/sprite';
import { G, sfx } from '../G';
import { tr, L10n } from '../i18n';
import { panel, rect } from './draw';
import { clamp, ease } from '../../engine/math';
import { drawButton } from './prompts';
import { promptW } from './widgets';

export interface DLine { name: L10n; portrait: Sprite; portraitTalk?: Sprite; text: L10n; color: string; right?: boolean }

export class DialogueOverlay implements Overlay {
  blocks = true;
  /** Ines's notes stay hidden (and paused) while this is open */
  hidesNotes = true;
  i = 0;
  t = 0;
  open = 0;
  closing = -1;
  private blip = 0;

  constructor(private lines: DLine[], private onDone?: () => void) {}

  update(dt: number): boolean {
    this.open = Math.min(1, this.open + dt * 5);
    if (this.closing >= 0) {
      this.closing += dt;
      if (this.closing > 0.25) { this.onDone?.(); return false; }
      return true;
    }
    this.t += dt;
    const line = this.lines[this.i];
    const text = tr(line.text);
    const shown = Math.floor(this.t * 45);
    if (shown < text.length) {
      this.blip -= dt;
      if (this.blip <= 0 && text[shown] !== ' ') { this.blip = 0.06; sfx('uiMove', { vol: 0.35 }); }
    }
    const adv = G.input.pressed('confirm') || G.input.pressed('attack') || G.input.pressed('interact');
    if (adv) {
      if (shown < text.length) this.t = 999;
      else if (this.i < this.lines.length - 1) { this.i++; this.t = 0; }
      else this.closing = 0;
    }
    if (G.input.pressed('cancel')) this.closing = 0;
    return true;
  }

  render(r: Renderer) {
    const ctx = r.ui2;
    const line = this.lines[this.i];
    const k = ease.outCubic(this.open) * (this.closing >= 0 ? 1 - this.closing / 0.25 : 1);
    ctx.globalAlpha = 0.35 * k;
    ctx.fillStyle = '#0b0a14';
    ctx.fillRect(0, 0, 640, 360);
    ctx.globalAlpha = k;
    const h = 88, y = 360 - h - 8 + Math.round((1 - k) * 30);
    panel(ctx, 20, y, 600, h, { fill: 'K1' });
    const px = line.right ? 560 : 80;
    // portrait frame
    panel(ctx, px - 48, y - 46, 96, 96, { fill: 'K0', border: 'B2' });
    const text = tr(line.text);
    const shown = Math.min(text.length, Math.floor(this.t * 45));
    const talking = shown < text.length && Math.floor(this.t * 10) % 2 === 0;
    const portrait = talking && line.portraitTalk ? line.portraitTalk : line.portrait;
    drawScaled(ctx, portrait, px, y + 2 - Math.round(portrait.h), 2);
    const tx = line.right ? 40 : 140;
    G.font.draw(ctx, tr(line.name), tx, y + 7, { color: line.color });
    rect(ctx, tx, y + 25, 300, 1, 'B1');
    G.font.draw(ctx, text.slice(0, shown), tx, y + 29, { color: 'K10', wrap: 440, lineH: 16 });
    if (shown >= text.length && Math.floor(this.t * 3) % 2 === 0) drawButton(ctx, 600 - promptW('confirm'), y + h - 19, 'confirm');
    ctx.globalAlpha = 1;
    void clamp;
  }
}
