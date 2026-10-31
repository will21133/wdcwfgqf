// Pause menu, settings panel, and run-info (build) panel.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import { drawScaled, RARITY_TEXT } from './overlay';
import { MenuList, MenuItem } from './menu';
import { panel, rect } from './draw';
import { G, sfx } from '../G';
import { tr, L, UI, i18n } from '../i18n';
import { settings, saveSettings } from '../settings';
import { MEMORIES, PATRONS } from '../progression/memories';
import { PARTS_BY_ID } from '../progression/parts';
import { HOURGLASS_BY_ID } from '../progression/hourglass';
import { CAL_BY_ID } from '../progression/calibrations';
import { patronSigil, ICONS } from '../../art/sprites/icons';
import { partLook } from '../progression/rewards';
import type { Run } from '../run';
import type { Sprite } from '../../engine/gfx/sprite';
import { rumble } from '../../engine/rumble';
import { ControlsPanel } from './controls';

interface PauseHost { run: Run; overlays: Overlay[]; onQuit?: (run: Run) => void; bankStats(): void; inHub?: boolean }

export function settingsItems(onBack: () => void, openControls?: () => void): MenuItem[] {
  const set = <K extends keyof typeof settings>(k: K) => (v: (typeof settings)[K]) => { settings[k] = v; saveSettings(); };
  return [
    { label: () => tr(L('主音量', 'Master volume')), kind: 'slider', get: () => settings.master, set: set('master') },
    { label: () => tr(L('音乐', 'Music')), kind: 'slider', get: () => settings.music, set: set('music') },
    { label: () => tr(L('音效', 'Sound effects')), kind: 'slider', get: () => settings.sfx, set: (v: number) => { set('sfx')(v); sfx('hit'); } },
    { label: () => tr(L('屏幕震动', 'Screen shake')), kind: 'slider', get: () => settings.shake, set: set('shake'), min: 0, max: 1 },
    { label: () => tr(L('语言 / Language', 'Language / 语言')), kind: 'choice', options: [{ label: '简体中文', value: 'zh' }, { label: 'English', value: 'en' }], get: () => settings.lang, set: set('lang') },
    { label: () => tr(L('手柄震动', 'Controller rumble')), kind: 'toggle', get: () => settings.rumble, set: (v: boolean) => { set('rumble')(v); if (v) rumble(0.6, 0.6, 200); } },
    { label: () => tr(L('震动强度', 'Rumble strength')), kind: 'slider', get: () => settings.rumbleStrength, set: (v: number) => { set('rumbleStrength')(v); rumble(0.6, 0.6, 150); }, disabled: () => !settings.rumble },
    { label: () => tr(L('整数倍像素缩放', 'Pixel-perfect scaling')), kind: 'toggle', get: () => settings.pixelPerfect, set: set('pixelPerfect'), hint: () => tr(L('关闭时画面铺满窗口（锐利双线性）。', 'When off, the image fills the window (sharp bilinear).')) },
    { label: () => tr(L('闪光效果', 'Flash effects')), kind: 'toggle', get: () => settings.flashes, set: set('flashes'), hint: () => tr(L('关闭全屏闪白（光敏友好）。', 'Disable full-screen flashes (photosensitivity).')) },
    { label: () => tr(L('瞄准辅助（手柄）', 'Aim assist (gamepad)')), kind: 'toggle', get: () => settings.aimAssist, set: set('aimAssist') },
    { label: () => tr(L('按键设置', 'Controls')), act: () => openControls?.() },
    { label: () => tr(L('全屏', 'Fullscreen')), act: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); } },
    { label: () => tr(L('返回', 'Back')), act: onBack },
  ];
}

export class SettingsPanel implements Overlay {
  blocks = true;
  done = false;
  list: MenuList;
  sub: Overlay | null = null;
  constructor() { this.list = new MenuList(settingsItems(() => (this.done = true), () => (this.sub = new ControlsPanel()))); }
  update(dt: number) {
    if (this.sub) { if (!this.sub.update(dt)) this.sub = null; return true; }
    if (G.input.pressed('cancel') || G.input.pressed('pause')) { G.input.consume('pause'); sfx('uiBack'); return false; }
    this.list.update(dt);
    return !this.done;
  }
  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.6; ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1;
    panel(ctx, 150, 20, 340, 320);
    G.font.draw(ctx, tr(UI.settings), 320, 30, { align: 'center', color: 'B5' });
    rect(ctx, 166, 48, 308, 1, 'B1');
    this.list.render(ctx, 172, 58, 296);
    this.sub?.render(r);
  }
}

export class RunInfoPanel implements Overlay {
  blocks = true;
  sel = 0;
  constructor(private run: Run) {}
  private entries(): { icon: Sprite; name: string; desc: string; color: string; tag: string }[] {
    const run = this.run;
    const out: { icon: Sprite; name: string; desc: string; color: string; tag: string }[] = [];
    for (const om of run.memories) {
      const d = MEMORIES[om.id];
      if (!d) continue;
      out.push({ icon: patronSigil(d.patron), name: tr(d.name), desc: tr(d.desc(d.v[om.rarity])), color: RARITY_TEXT[om.rarity], tag: `${tr(PATRONS[d.patron].name)} · ${tr(UI.slots[d.slot])} · ${tr(UI.rarity[om.rarity])}` });
    }
    for (const id of run.hourglass) { const h = HOURGLASS_BY_ID[id]; if (h) out.push({ icon: ICONS.hourglass, name: tr(h.name), desc: tr(h.desc), color: 'C3', tag: tr(UI.hourglass) }); }
    for (const id of run.calibrations) { const c = CAL_BY_ID[id]; if (c) out.push({ icon: ICONS.whetstone, name: tr(c.name), desc: tr(c.desc), color: 'K9', tag: tr(UI.calibration) }); }
    for (const id of run.parts) { const p = PARTS_BY_ID[id]; if (p) { const lk = partLook(p); out.push({ icon: lk.icon, name: tr(p.name), desc: tr(p.desc), color: lk.color, tag: tr(UI.part) }); } }
    return out;
  }
  update(dt: number) {
    const inp = G.input;
    if (inp.pressed('cancel') || inp.pressed('info') || inp.pressed('pause')) { G.input.consume('pause'); sfx('uiBack'); return false; }
    const n = this.entries().length;
    const nav = inp.nav(dt);
    if (n) {
      if (nav.x) { this.sel = (this.sel + nav.x + n) % n; sfx('uiMove'); }
      if (nav.y) { this.sel = Math.max(0, Math.min(n - 1, this.sel + nav.y * 10)); sfx('uiMove'); }
    }
    return true;
  }
  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.65; ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1;
    panel(ctx, 40, 24, 560, 312);
    const run = this.run;
    G.font.draw(ctx, tr(L('本局构筑', 'Your Build')), 320, 34, { align: 'center', color: 'B5' });
    const m = run.mods;
    const stats = [
      `${tr(L('生命', 'HP'))} ${Math.ceil(run.hp)}/${m.maxHp}`,
      `${tr(L('伤害', 'Damage'))} ${Math.round(m.dmg * 100)}%`,
      `${tr(L('暴击', 'Crit'))} ${Math.round(m.critChance * 100)}%`,
      `${tr(L('回溯', 'Rewind'))} ${m.rewindCharges}×${m.rewindWindow.toFixed(1)}s`,
      `${tr(L('残响', 'Echo'))} ${Math.round(m.echoDmg * 100)}%`,
      `${tr(L('悖论', 'Paradox'))} ${Math.round(m.paradoxDmg)}`,
    ];
    stats.forEach((s, i) => G.small.draw(ctx, s, 60 + i * 90, 54, { color: 'K8' }));
    rect(ctx, 56, 68, 528, 1, 'B1');
    const es = this.entries();
    if (!es.length) { G.font.draw(ctx, tr(L('还没有任何回忆或零件。', 'No memories or parts yet.')), 320, 170, { align: 'center', color: 'K7' }); return; }
    es.forEach((e, i) => {
      const cx = 72 + (i % 10) * 50, cy = 98 + Math.floor(i / 10) * 44;
      if (i === this.sel) { rect(ctx, cx - 20, cy - 20, 40, 40, 'K3'); rect(ctx, cx - 20, cy + 19, 40, 1, 'B5'); }
      drawScaled(ctx, e.icon, cx, cy, 2);
    });
    const e = es[Math.min(this.sel, es.length - 1)];
    rect(ctx, 56, 246, 528, 1, 'B1');
    G.font.draw(ctx, e.name, 64, 254, { color: e.color });
    G.small.draw(ctx, e.tag, 64 + G.font.measure(e.name) + 10, 257, { color: 'K7' });
    G.font.draw(ctx, e.desc, 64, 274, { color: 'K9', wrap: 512 });
  }
}

export class PauseMenu implements Overlay {
  blocks = true;
  list: MenuList;
  closing = false;
  confirmQuit = false;
  t = 0;
  constructor(private host: PauseHost) {
    G.audio.muffle(true, 700);
    sfx('uiOpen');
    this.list = new MenuList([
      { label: () => tr(UI.resume), act: () => (this.closing = true) },
      { label: () => tr(L('本局构筑', 'Your Build')), act: () => host.overlays.push(new RunInfoPanel(host.run)) },
      { label: () => tr(UI.settings), act: () => host.overlays.push(new SettingsPanel()) },
      { label: () => (this.confirmQuit ? tr(L('确定？（再按一次）', 'Are you sure? (press again)')) : tr(host.inHub ? UI.quit : UI.abandon)), act: () => {
        if (!this.confirmQuit) { this.confirmQuit = true; return; }
        this.closing = true;
        G.audio.muffle(false);
        host.bankStats();
        host.onQuit?.(host.run);
      } },
    ]);
  }
  update(dt: number) {
    this.t += dt;
    if (this.closing) { G.audio.muffle(false); return false; }
    if (this.t > 0.1 && (G.input.pressed('pause') || G.input.pressed('cancel'))) { G.input.consume('pause'); sfx('uiBack'); G.audio.muffle(false); return false; }
    if (G.input.pressed('info')) { this.host.overlays.push(new RunInfoPanel(this.host.run)); return true; }
    const prev = this.list.sel;
    this.list.update(dt);
    if (this.list.sel !== prev) this.confirmQuit = false;
    return true;
  }
  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1;
    panel(ctx, 220, 110, 200, 136);
    G.font.draw(ctx, tr(UI.paused), 320, 120, { align: 'center', color: 'B5' });
    rect(ctx, 236, 138, 168, 1, 'B1');
    this.list.render(ctx, 240, 148, 160);
    void i18n;
  }
}
