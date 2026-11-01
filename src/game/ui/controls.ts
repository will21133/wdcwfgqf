// Controls panel: per-device keyboard rebinding (keyboard + mouse, left half, right half; GDD2 §2.1–2.2)
// + Xbox controller reference with the bumper swap. A pad button (or Esc) cancels a rebind.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import { panel, rect } from './draw';
import { G, sfx } from '../G';
import { tr, L, L10n } from '../i18n';
import { REBINDABLE, KB, keyLabel, Action, KbProfile, padLayout } from '../../engine/input';
import { settings, saveSettings, profileBindings } from '../settings';
import { drawHint } from './prompts';
import { drawPadGlyph, drawKeycap, keycapW, promptH, promptW, drawPrompt, PadGlyph } from './widgets';
import { Text } from './text';
import { col } from '../../art/palette';

const NAMES: Record<string, L10n> = {
  up: L('上', 'Up'), down: L('下', 'Down'), left: L('左', 'Left'), right: L('右', 'Right'),
  attack: L('攻击', 'Attack'), special: L('特技', 'Special'), dash: L('冲刺', 'Dash'), rewind: L('回溯', 'Rewind'),
  fork: L('分岔', 'Fork'), interact: L('交互', 'Interact'), info: L('构筑信息', 'Build info'),
};

const PROFILES: KbProfile[] = ['kbm', 'kbL', 'kbR'];
const PROFILE_NAME: Record<KbProfile, L10n> = {
  kbm: L('键盘 + 鼠标', 'Keyboard + mouse'),
  kbL: L('左半键盘（双人）', 'Left half (shared)'),
  kbR: L('右半键盘（双人）', 'Right half (shared)'),
};

function padRows(): [PadGlyph, L10n][] {
  const rw = L('回溯', 'Rewind'), fk = L('分岔', 'Fork');
  return [
    ['A', L('冲刺 / 确认', 'Dash / Confirm')],
    ['B', L('交互 / 返回', 'Interact / Back')],
    ['X', L('攻击', 'Attack')],
    ['Y', L('特技', 'Special')],
    ['LB', padLayout.swapBumpers ? fk : rw],
    ['RB', padLayout.swapBumpers ? rw : fk],
    ['RT', L('攻击', 'Attack')],
    ['LT', L('特技', 'Special')],
    ['LS', L('移动', 'Move')],
    ['RS', L('瞄准', 'Aim')],
    ['MENU', L('暂停', 'Pause')],
    ['VIEW', L('构筑信息', 'Build info')],
  ];
}

type Row = Action | 'swap' | 'reset' | 'back';

export class ControlsPanel implements Overlay {
  blocks = true;
  /** Ines's notes stay hidden (and paused) while this is open */
  hidesNotes = true;
  sel = 0;
  capture = false;
  t = 0;
  /** which keyboard layout the rows show and rebind */
  prof: KbProfile = 'kbm';
  private rows: Row[] = [...REBINDABLE, 'swap', 'reset', 'back'];
  /** seconds left on "that key belongs to the other half" */
  private warnT = 0;

  private switchProfile(d: number) {
    this.prof = PROFILES[(PROFILES.indexOf(this.prof) + d + PROFILES.length) % PROFILES.length];
    sfx('uiMove');
  }

  update(dt: number) {
    this.t += dt;
    if (this.warnT > 0) this.warnT -= dt;
    const inp = G.input;
    if (this.capture) {
      const code = inp.lastPressedCode;
      if (code && this.t > 0.15) {
        // the split halves have no mouse: ignore clicks and keep listening
        if (this.prof !== 'kbm' && code.startsWith('Mouse')) { inp.lastPressedCode = null; return true; }
        const a = this.rows[this.sel] as Action;
        // the two halves share one keyboard: a key the other half already uses would drive both
        const other: KbProfile | null = this.prof === 'kbL' ? 'kbR' : this.prof === 'kbR' ? 'kbL' : null;
        const taken = other && code !== 'Escape' && !code.startsWith('Pad') && (Object.keys(KB[other]) as Action[]).some((k) => KB[other][k].includes(code));
        if (taken) {
          sfx('denied');
          this.warnT = 2;
          this.capture = false;
          inp.lastPressedCode = null;
          return true;
        }
        if (code !== 'Escape' && !code.startsWith('Pad')) {
          const cur = KB[this.prof][a];
          const next = [code, ...cur.filter((c) => c !== code)].slice(0, 2);
          profileBindings(this.prof)[a] = next;
          saveSettings();
          sfx('uiSelect');
        } else sfx('uiBack'); // Esc, or any button on a controller, cancels
        this.capture = false;
        inp.lastPressedCode = null;
      }
      return true;
    }
    if (inp.pressed('cancel') || inp.pressed('pause')) { inp.consume('pause'); sfx('uiBack'); return false; }
    // layout tabs: Q / E, LB / RB (checked before confirm: E also confirms on the keyboard)
    if (inp.pressed('tabL') || inp.pressed('tabR')) {
      this.switchProfile(inp.pressed('tabL') ? -1 : 1);
      inp.consume('tabL'); inp.consume('tabR'); inp.consume('confirm');
      return true;
    }
    const nav = inp.nav(dt);
    if (nav.y) { this.sel = (this.sel + nav.y + this.rows.length) % this.rows.length; sfx('uiMove'); }
    if (inp.mouseAim) for (let i = 0; i < this.rows.length; i++) if (inp.mx > 70 && inp.mx < 330 && inp.my >= this.rowsTop - 2 + i * this.rh && inp.my < this.rowsTop - 2 + (i + 1) * this.rh && this.sel !== i) { this.sel = i; sfx('uiMove'); }
    // clicking the layout header steps through the layouts
    const click = inp.pressed('attack') && inp.mouseAim;
    if (click && inp.my >= this.tabY - 2 && inp.my < this.tabY + this.tabH + 2 && inp.mx > 64 && inp.mx < 336) {
      this.switchProfile(inp.mx < 200 ? -1 : 1);
      return true;
    }
    if (this.rows[this.sel] === 'swap' && nav.x) this.toggleSwap();
    if (inp.pressed('confirm') || click) {
      const r = this.rows[this.sel];
      if (r === 'back') { sfx('uiBack'); return false; }
      if (r === 'reset') { if (this.prof === 'kbm') settings.bindings = {}; else settings.bindingsKb[this.prof] = {}; saveSettings(); sfx('uiSelect'); return true; }
      if (r === 'swap') { this.toggleSwap(); return true; }
      this.capture = true;
      this.t = 0;
      inp.lastPressedCode = null;
      sfx('uiOpen');
    }
    return true;
  }

  private toggleSwap() {
    settings.padSwap = !settings.padSwap;
    saveSettings();
    sfx('uiSelect');
  }

  /** row grid and layout header from the last render (mouse hit-testing uses them) */
  private rowsTop = 72;
  private rh = 18;
  private tabY = 50;
  private tabH = 13;

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
    const ph = promptH();
    // keyboard layout tabs: [Q] ‹ name › [E]
    const tabH = Math.max(ph, Math.ceil(Text.inkH('small')) + 2);
    this.tabY = headerY - 2; this.tabH = tabH;
    const tcy = this.tabY + tabH / 2;
    drawPrompt(ctx, 'tabL', 70, Math.round(tcy - ph / 2));
    const rw = promptW('tabR');
    drawPrompt(ctx, 'tabR', 330 - rw, Math.round(tcy - ph / 2));
    Text.draw(ctx, PROFILE_NAME[this.prof], 200, tcy, { size: 'small', align: 'center', color: 'B5', valign: 'middle' });
    Text.draw(ctx, L('Xbox 手柄', 'Xbox controller'), 380, tcy, { size: 'small', color: 'K8', valign: 'middle' });
    const hintY = pBot - 17 - (ph - 13);
    const PAD = padRows();
    const n = Math.max(this.rows.length, PAD.length);
    const rowsTop = Math.round(this.tabY + tabH + (big ? 6 : 8));
    const rh = Math.max(Math.ceil(Text.inkH('body')) + 3, Math.min(18 + Math.max(0, Math.round(lb - 15)), Math.floor((hintY - 8 - rowsTop) / n)));
    this.rowsTop = rowsTop; this.rh = rh;
    const B = KB[this.prof];
    this.rows.forEach((row, i) => {
      const y = rowsTop + i * rh;
      const cy = y - 3 + (rh - 2) / 2;
      const sel = i === this.sel;
      if (sel) { rect(ctx, 64, y - 3, 270, rh - 2, 'K3'); rect(ctx, 64, y - 3, 2, rh - 2, 'B5'); }
      if (row === 'reset' || row === 'back') {
        Text.draw(ctx, row === 'reset' ? L('恢复默认', 'Reset to defaults') : L('返回', 'Back'), 74, cy, { color: sel ? 'K10' : 'K8', valign: 'middle' });
        return;
      }
      if (row === 'swap') {
        Text.draw(ctx, L('手柄 LB / RB 互换', 'Swap pad LB / RB'), 74, cy, { color: sel ? 'K10' : 'K8', valign: 'middle' });
        Text.draw(ctx, settings.padSwap ? L('开', 'On') : L('关', 'Off'), 330, cy, { align: 'right', color: settings.padSwap ? 'B5' : 'K7', valign: 'middle' });
        return;
      }
      Text.draw(ctx, NAMES[row], 74, cy, { color: sel ? 'K10' : 'K8', valign: 'middle' });
      const b = B[row];
      if (sel && !this.capture && this.warnT > 0) {
        Text.draw(ctx, L('另一半键盘在用这个键', 'The other half uses that key'), 330, cy, { size: 'small', align: 'right', color: 'R4', valign: 'middle' });
      } else if (sel && this.capture) {
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
    PAD.forEach(([b, name], i) => {
      const cy = rowsTop + i * rh - 3 + (rh - 2) / 2;
      drawPadGlyph(ctx, b, 380 + Math.floor((19 - (b === 'LB' || b === 'RB' ? 19 : b === 'LT' || b === 'RT' ? 15 : 13)) / 2), Math.round(cy - 6.5));
      Text.draw(ctx, name, 406, cy, { color: 'K8', valign: 'middle' });
    });
    const note = L('每个手柄各控制一名玩家；单人时手柄与键鼠可随时切换。', 'Each controller drives its own player; solo, switch between pad and keyboard anytime.');
    const noteY = rowsTop + PAD.length * rh - 3;
    if (noteY + Text.measureWrapped(note, 'small', 205).h <= hintY - 4) Text.draw(ctx, note, 380, noteY, { size: 'small', color: 'K8', maxW: 205 });
    drawHint(ctx, 320, hintY, [['nav', tr(L('选择', 'Select'))], ['confirm', tr(L('重新绑定', 'Rebind'))], ['cancel', tr(L('返回', 'Back'))]]);
  }
}
