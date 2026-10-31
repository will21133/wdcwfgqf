// Controls panel: keyboard/mouse rebinding + Xbox controller reference.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import { panel, rect } from './draw';
import { G, sfx } from '../G';
import { tr, L, L10n } from '../i18n';
import { REBINDABLE, DEFAULT_BINDINGS, keyLabel, Action } from '../../engine/input';
import { settings, saveSettings } from '../settings';
import { drawHint } from './prompts';
import { drawPadGlyph, drawKeycap, keycapW, PadGlyph } from './widgets';

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
    if (inp.mouseAim) for (let i = 0; i < this.rows.length; i++) if (inp.mx > 70 && inp.mx < 330 && inp.my >= 70 + i * 18 && inp.my < 88 + i * 18 && this.sel !== i) { this.sel = i; sfx('uiMove'); }
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

  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1;
    panel(ctx, 40, 22, 560, 316);
    G.font.draw(ctx, tr(L('按键设置', 'Controls')), 320, 32, { align: 'center', color: 'B5' });
    G.small.draw(ctx, tr(L('键盘 / 鼠标', 'Keyboard / Mouse')), 70, 53, { color: 'K8' });
    G.small.draw(ctx, tr(L('Xbox 手柄', 'Xbox controller')), 380, 53, { color: 'K8' });
    this.rows.forEach((row, i) => {
      const y = 72 + i * 18;
      const sel = i === this.sel;
      if (sel) { rect(ctx, 64, y - 3, 270, 16, 'K3'); rect(ctx, 64, y - 3, 2, 16, 'B5'); }
      if (row === 'reset' || row === 'back') {
        G.font.draw(ctx, tr(row === 'reset' ? L('恢复默认', 'Reset to defaults') : L('返回', 'Back')), 74, y - 1, { color: sel ? 'K10' : 'K8' });
        return;
      }
      G.font.draw(ctx, tr(NAMES[row]), 74, y - 1, { color: sel ? 'K10' : 'K8' });
      const b = G.input.bindings[row];
      if (sel && this.capture) {
        G.small.draw(ctx, tr(L('请按下新按键…（ESC 取消）', 'Press a key... (ESC cancels)')), 330, y + 1, { align: 'right', color: Math.floor(this.t * 4) % 2 ? 'B5' : 'B3' });
      } else {
        let x = 330;
        for (let k = b.length - 1; k >= 0; k--) {
          const lab = keyLabel(b[k]);
          x -= keycapW(lab);
          drawKeycap(ctx, lab, x, y - 1);
          x -= 4;
        }
      }
    });
    // Xbox reference
    PAD_ROWS.forEach(([b, name], i) => {
      const y = 72 + i * 18;
      drawPadGlyph(ctx, b, 380 + Math.floor((19 - (b === 'LB' || b === 'RB' ? 19 : b === 'LT' || b === 'RT' ? 15 : 13)) / 2), y - 1);
      G.font.draw(ctx, tr(name), 406, y - 2, { color: 'K8' });
    });
    G.small.draw(ctx, tr(L('手柄可在任何时候直接使用，会自动切换按键提示。', 'Pick up a controller anytime — prompts switch automatically.')), 380, 285, { color: 'K8', wrap: 205 });
    drawHint(ctx, 320, 321, [['nav', tr(L('选择', 'Select'))], ['confirm', tr(L('重新绑定', 'Rebind'))], ['cancel', tr(L('返回', 'Back'))]]);
  }
}
