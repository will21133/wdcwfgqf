// Controls panel: keyboard/mouse rebinding + Xbox controller reference.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import { panel, rect } from './draw';
import { G, sfx } from '../G';
import { tr, L, L10n } from '../i18n';
import { REBINDABLE, DEFAULT_BINDINGS, keyLabel, Action } from '../../engine/input';
import { settings, saveSettings } from '../settings';
import { drawHint } from './prompts';
import { drawPadGlyph, drawKeycap, keycapW, promptH, PadGlyph } from './widgets';
import { Text } from './text';
import { col } from '../../art/palette';

const NAMES: Record<string, L10n> = {
  up: L('上', 'Up'), down: L('下', 'Down'), left: L('左', 'Left'), right: L('右', 'Right'),
  attack: L('攻击', 'Attack'), special: L('特技', 'Special'), dash: L('冲刺', 'Dash'), rewind: L('回溯', 'Rewind'),
  interact: L('交互', 'Interact'), info: L('构筑信息', 'Build info'),
};

const PAD_ROWS: [PadGlyph, L10n][] = [
  ['A', L('冲刺 / 确认', 'Dash / Confirm')],
  ['B', L('交互 / 返回', 'Interact / Back')],
  ['X', L('攻击', 'Attack')],
  ['Y', L('特技', 'Special')],
  ['RB', L('回溯', 'Rewind')],
  ['LB', L('回溯', 'Rewind')],
  ['RT', L('攻击', 'Attack')],
  ['LT', L('特技', 'Special')],
  ['LS', L('移动', 'Move')],
  ['RS', L('瞄准', 'Aim')],
  ['MENU', L('暂停', 'Pause')],
  ['VIEW', L('构筑信息', 'Build info')],
];

export class ControlsPanel implements Overlay {
  blocks = true;
  /** Ines's notes stay hidden (and paused) while this is open */
  hidesNotes = true;
  sel = 0;
  capture = false;
  t = 0;
  private rows = [...REBINDABLE, 'reset' as const, 'back' as const];

  update(dt: number) {
    this.t += dt;
    const inp = G.input;
    if (this.capture) {
      const code = inp.lastPressedCode;
      if (code && this.t > 0.15) {
        const a = this.rows[this.sel] as Action;
        if (code !== 'Escape') {
          const cur = G.input.bindings[a];
          const next = [code, ...cur.filter((c) => c !== code)].slice(0, 2);
          settings.bindings[a] = next;
          saveSettings();
          sfx('uiSelect');
        } else sfx('uiBack');
        this.capture = false;
        inp.lastPressedCode = null;
      }
      return true;
    }
    if (inp.pressed('cancel') || inp.pressed('pause')) { inp.consume('pause'); sfx('uiBack'); return false; }
    const nav = inp.nav(dt);
    if (nav.y) { this.sel = (this.sel + nav.y + this.rows.length) % this.rows.length; sfx('uiMove'); }
    if (inp.mouseAim) for (let i = 0; i < this.rows.length; i++) if (inp.mx > 70 && inp.mx < 330 && inp.my >= this.rowsTop - 2 + i * this.rh && inp.my < this.rowsTop - 2 + (i + 1) * this.rh && this.sel !== i) { this.sel = i; sfx('uiMove'); }
    if (inp.pressed('confirm') || (inp.pressed('attack') && inp.mouseAim)) {
      const r = this.rows[this.sel];
      if (r === 'back') { sfx('uiBack'); return false; }
      if (r === 'reset') { settings.bindings = {}; saveSettings(); sfx('uiSelect'); return true; }
      this.capture = true;
      this.t = 0;
      inp.lastPressedCode = null;
      sfx('uiOpen');
    }
    void DEFAULT_BINDINGS;
    return true;
  }

  /** row grid from the last render (mouse hit-testing uses it) */
  private rowsTop = 72;
  private rh = 18;

  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.85; ctx.fillStyle = col('K0'); ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1;
    // everything is spaced from the text's real size; with much larger text (125% setting) the panel
    // grows to the screen edges, rows tighten, and the footnote is dropped if it no longer fits
    const lb = Text.lineH('body'), ls = Text.lineH('small');
    const big = Text.k > 1.25;
    const pTop = big ? 8 : 22, pBot = big ? 352 : 338;
    panel(ctx, 40, pTop, 560, pBot - pTop);
    Text.draw(ctx, L('按键设置', 'Controls'), 320, pTop + 10, { align: 'center', color: 'B5' });
    const headerY = Math.round(pTop + 10 + lb + (big ? 3 : 6));
    Text.draw(ctx, L('键盘 / 鼠标', 'Keyboard / Mouse'), 70, headerY, { size: 'small', color: 'K8' });
    Text.draw(ctx, L('Xbox 手柄', 'Xbox controller'), 380, headerY, { size: 'small', color: 'K8' });
    const ph = promptH();
    const hintY = pBot - 17 - (ph - 13);
    const n = Math.max(this.rows.length, PAD_ROWS.length);
    const rowsTop = Math.round(headerY + ls + (big ? 4 : 6));
    const rh = Math.max(Math.ceil(Text.inkH('body')) + 3, Math.min(18 + Math.max(0, Math.round(lb - 15)), Math.floor((hintY - 8 - rowsTop) / n)));
    this.rowsTop = rowsTop; this.rh = rh;
    this.rows.forEach((row, i) => {
      const y = rowsTop + i * rh;
      const cy = y - 3 + (rh - 2) / 2;
      const sel = i === this.sel;
      if (sel) { rect(ctx, 64, y - 3, 270, rh - 2, 'K3'); rect(ctx, 64, y - 3, 2, rh - 2, 'B5'); }
      if (row === 'reset' || row === 'back') {
        Text.draw(ctx, row === 'reset' ? L('恢复默认', 'Reset to defaults') : L('返回', 'Back'), 74, cy, { color: sel ? 'K10' : 'K8', valign: 'middle' });
        return;
      }
      Text.draw(ctx, NAMES[row], 74, cy, { color: sel ? 'K10' : 'K8', valign: 'middle' });
      const b = G.input.bindings[row];
      if (sel && this.capture) {
        Text.draw(ctx, L('请按下新按键…（ESC 取消）', 'Press a key... (ESC cancels)'), 330, cy, { size: 'small', align: 'right', color: Math.floor(this.t * 4) % 2 ? 'B5' : 'B3', valign: 'middle' });
      } else {
        let x = 330;
        for (let k = b.length - 1; k >= 0; k--) {
          const lab = keyLabel(b[k]);
          x -= keycapW(lab);
          drawKeycap(ctx, lab, x, Math.round(cy - ph / 2));
          x -= 4;
        }
      }
    });
    // Xbox reference
    PAD_ROWS.forEach(([b, name], i) => {
      const cy = rowsTop + i * rh - 3 + (rh - 2) / 2;
      drawPadGlyph(ctx, b, 380 + Math.floor((19 - (b === 'LB' || b === 'RB' ? 19 : b === 'LT' || b === 'RT' ? 15 : 13)) / 2), Math.round(cy - 6.5));
      Text.draw(ctx, name, 406, cy, { color: 'K8', valign: 'middle' });
    });
    const note = L('手柄可在任何时候直接使用，会自动切换按键提示。', 'Pick up a controller anytime — prompts switch automatically.');
    const noteY = rowsTop + PAD_ROWS.length * rh - 3;
    if (noteY + Text.measureWrapped(note, 'small', 205).h <= hintY - 4) Text.draw(ctx, note, 380, noteY, { size: 'small', color: 'K8', maxW: 205 });
    drawHint(ctx, 320, hintY, [['nav', tr(L('选择', 'Select'))], ['confirm', tr(L('重新绑定', 'Rebind'))], ['cancel', tr(L('返回', 'Back'))]]);
  }
}
