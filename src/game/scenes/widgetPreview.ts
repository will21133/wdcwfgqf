// Debug: UI toolkit sheet (?scene=widgets[&pad=1][&lang=en]). Every text size, prompt icon, panel,
// bar, tag chip, tooltip, stamp and term label on one screen, for text-clarity review.
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import { G } from '../G';
import { col } from '../../art/palette';
import { L, tr } from '../i18n';
import { Text } from '../ui/text';
import { drawPanel, drawPrompt, drawPadGlyph, drawBar, drawTagChip, drawTooltip, drawStamp, drawTermLabel, drawPromptLabel, promptH, tagChipH, PadGlyph, TagId, TAG_COLOR } from '../ui/widgets';
import type { Action } from '../../engine/input';

export class WidgetPreview implements Scene {
  t = 0;
  update(dt: number) {
    this.t += dt;
    if (G.debug.get('pad') === '1') G.input.lastDevice = 'pad';
  }
  render(r: Renderer) {
    const p = r.params;
    p.lighting = false; p.bloom = 0; p.vignette = 0; p.grain = 0; p.rewind = 0; p.ca = 0; p.fade = 0;
    r.begin(0, 0, col('K1'));
    const ctx = r.ui2;
    ctx.fillStyle = col('K1');
    ctx.fillRect(0, 0, 640, 360);
    // text sizes
    let y = 6;
    Text.draw(ctx, L('标题 Title 12×2', 'Title 12×2 gjpqy'), 8, y, { size: 'title', color: 'B5' }); y += Text.lineH('title');
    Text.draw(ctx, L('正文 FP12：回溯会回到旧影 gjpqy_', 'Body FP12: rewinding returns to your Shadow gjpqy_'), 8, y, { color: 'K10' }); y += Text.lineH('body');
    Text.draw(ctx, L('次要 FP10：标签芯片与风味文字 gjpqy', 'Small FP10: tag chips and flavour gjpqy'), 8, y, { size: 'small', color: 'K8' }); y += Text.lineH('small');
    Text.draw(ctx, 'Tiny FP8: 0123456789 ABC xyz gjpqy', 8, y, { size: 'tiny', color: 'K8' }); y += Text.lineH('tiny') + 2;
    Text.draw(ctx, L('带底板的世界标签', 'World label on a plate'), 8, y, { plate: true, color: 'B6' }); y += Math.ceil(Text.lineH('body') + 5);
    // prompts: keyboard / mouse row, then pad glyph row
    const acts: Action[] = ['attack', 'special', 'dash', 'rewind', 'interact', 'confirm', 'cancel', 'pause', 'info'];
    let x = 8;
    for (const a of acts) x += drawPrompt(ctx, a, x, y) + 4;
    x += drawPrompt(ctx, 'up', x, y) + 4;
    y += promptH() + 5;
    x = 8;
    const pads: PadGlyph[] = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'LS', 'RS', 'MENU', 'VIEW', 'DPAD'];
    for (const g of pads) x += drawPadGlyph(ctx, g, x, y) + 4;
    y += 20;
    drawPromptLabel(ctx, 'interact', tr(L('发条台', 'Mainspring')), 120, y);
    y += Math.max(promptH(), Math.ceil(Text.inkH('body')) + 2) + 9;
    // tag chips
    x = 8;
    const tags = Object.keys(TAG_COLOR) as TagId[];
    for (const tg of tags) {
      const w = drawTagChip(ctx, tg, x, y);
      x += w + 4;
      if (x > 560) { x = 8; y += tagChipH() + 3; }
    }
    y += tagChipH() + 7;
    // bars
    drawBar(ctx, 8, y, 150, 7, 50, [{ v: 30, color: 'R3' }, { v: 8, color: 'C3', pattern: 'hatch' }, { v: 5, color: 'V3', pattern: 'lock' }]);
    Text.draw(ctx, '38/50', 166, y - 4, { size: 'small' });
    y += 16;
    // panels
    drawPanel(ctx, 8, y, 90, 40, 'brass');
    drawPanel(ctx, 104, y, 90, 40, 'dark');
    drawPanel(ctx, 200, y, 90, 40, 'paper');
    Text.draw(ctx, L('便条', 'A note'), 208, y + 4, { color: 'K1', shadow: false });
    for (let i = 0; i < 4; i++) drawPanel(ctx, 296 + i * 34, y, 30, 40, 'slot', i);
    // term labels: stylised name + plain-language line while the player is still learning it
    y += 50;
    const terms = ['memory', 'part', 'shard', 'sand', 'echo', 'paradox'];
    const termRow = Math.ceil(Text.lineH('body') + Text.lineH('small') + 6);
    terms.forEach((id, i) => drawTermLabel(ctx, id, 8 + (i % 3) * 210, y + Math.floor(i / 3) * termRow, { color: id === 'sand' || id === 'echo' || id === 'paradox' ? 'C3' : 'B5' }));
    // tooltip and stamp (right column)
    drawTooltip(ctx, 430, 6, L('残响', 'Echo'), [L('过去的你，会重复你做过的动作。', 'Past you: repeats what you did.'), L('{c:回溯}时生成。', 'Spawned when you {c:rewind}.')]);
    drawStamp(ctx, L('卡秒！', 'TICK!'), 560, 120, 'B5', 0.3 + (this.t % 0.8));
  }
}
