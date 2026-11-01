// Pause menu, settings panel, and run-info (build) panel.
import { drawSlotTag } from '../players';
import type { PlayerInput } from '../../engine/input';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import { drawScaled, RARITY_TEXT } from './overlay';
import { MenuList, MenuItem } from './menu';
import { panel, rect } from './draw';
import { Text } from './text';
import { G, sfx } from '../G';
import { tr, L, UI, i18n } from '../i18n';
import { settings, saveSettings, settingsLive, setLanguage } from '../settings';
import { MEMORIES, PATRONS } from '../progression/memories';
import { PARTS_BY_ID } from '../progression/parts';
import { HOURGLASS_BY_ID } from '../progression/hourglass';
import { CAL_BY_ID } from '../progression/calibrations';
import { patronSigil, ICONS } from '../../art/sprites/icons';
import { partLook } from '../progression/rewards';
import type { Run } from '../run';
import type { Sprite } from '../../engine/gfx/sprite';
import { rumbleAll } from '../../engine/rumble';
import { ControlsPanel } from './controls';
import { GameHooks } from '../hooks';
// the F4b package (coach, death card, rewind guide, Rehearsal Hall, late ladder): pause.ts is F4b's
// only file every scene loads, so its entry hangs here (the lead may move it into onboard/index.ts)
import '../onboard/f4b';
import { S } from '../strings';
import { Onboard } from '../onboard/core';
import { Lessons } from '../onboard/lesson';
import { Panels } from './panels';
import { profile, saveProfile } from '../save';
import { Flags } from '../meta/registry';
import '../strings/coach';
import '../strings/onboard';

interface PauseHost {
  run: Run; overlays: Overlay[]; onQuit?: (run: Run) => void; bankStats(): void; inHub?: boolean;
  /** co-op: "Leave (II)" for the hand that opened the menu (GDD2 §5.1) */
  leaveItem?: { label: import('../i18n').L10n; act: () => void };
  /** whose build "Your Build" shows (co-op: whoever opened the menu) */
  buildSlot?: number;
}

/** settings → "reset tutorial progress" (ONBOARD2 §5.10): asks once more, then Onboard.reset() */
function resetRow(): MenuItem {
  let armed = false, done = false;
  return {
    label: () => tr(done ? S('coach', 'setResetDone') : armed ? S('coach', 'setResetConfirm') : S('coach', 'setReset')),
    act: () => { if (done) return; if (!armed) { armed = true; return; } Onboard.reset(); done = true; sfx('uiSelect'); },
  };
}

/** "I know how to play" from the pause menu: skipAll(), but the prologue's own flag stays as it was */
function skipTeaching() {
  const pd = profile.prologueDone;
  Onboard.skipAll();
  profile.prologueDone = pd;
  saveProfile();
}

export function settingsItems(onBack: () => void, openControls?: () => void): MenuItem[] {
  const set = <K extends keyof typeof settings>(k: K) => (v: (typeof settings)[K]) => { settings[k] = v; saveSettings(); };
  const header = (zh: string, en: string): MenuItem => ({ kind: 'header', label: () => tr(L(zh, en)) });
  // option labels are read every frame, so a language switch shows at once
  const tripleOpts = () => [
    { label: tr(L('自动', 'Auto')), value: 'auto' },
    { label: tr(L('总是', 'Always')), value: 'always' },
    { label: tr(L('关闭', 'Off')), value: 'off' },
  ];
  return [
    header('音频', 'Audio'),
    { label: () => tr(L('主音量', 'Master volume')), kind: 'slider', get: () => settings.master, set: set('master') },
    { label: () => tr(L('音乐', 'Music')), kind: 'slider', get: () => settings.music, set: set('music') },
    { label: () => tr(L('音效', 'Sound effects')), kind: 'slider', get: () => settings.sfx, set: (v: number) => { set('sfx')(v); sfx('hit'); } },
    header('画面', 'Display'),
    { label: () => tr(L('屏幕震动', 'Screen shake')), kind: 'slider', get: () => settings.shake, set: set('shake'), min: 0, max: 1 },
    {
      label: () => tr(L('闪光效果', 'Flash effects')), kind: 'choice',
      get options() { return [{ label: tr(L('开', 'On')), value: 'on' }, { label: tr(L('减弱', 'Limited')), value: 'limit' }, { label: tr(L('关', 'Off')), value: 'off' }]; },
      get: () => (!settings.flashes ? 'off' : settings.flashLimit ? 'limit' : 'on'),
      set: (v: string) => { settings.flashes = v !== 'off'; settings.flashLimit = v === 'limit'; saveSettings(); },
      hint: () => tr(L('减弱：全屏闪白变得很轻；关：完全不闪（光敏友好）。', 'Limited: full-screen flashes are much softer. Off: none at all (photosensitivity).')),
    },
    { label: () => tr(L('整数倍像素缩放', 'Pixel-perfect scaling')), kind: 'toggle', get: () => settings.pixelPerfect, set: set('pixelPerfect'), hint: () => tr(L('关闭时画面铺满窗口（锐利双线性）。', 'When off, the image fills the window (sharp bilinear).')) },
    { label: () => tr(L('全屏', 'Fullscreen')), act: () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); } },
    header('文字与提示', 'Text & guidance'),
    // shows the language actually on screen (a ?lang= debug URL can differ from the saved one)
    { label: () => tr(L('语言 / Language', 'Language / 语言')), kind: 'choice', options: [{ label: '简体中文', value: 'zh' }, { label: 'English', value: 'en' }], get: () => i18n.lang, set: (v: string) => setLanguage(v === 'en' ? 'en' : 'zh') },
    {
      label: () => tr(L('文字大小', 'Text size')), kind: 'choice', options: [{ label: '100%', value: '100' }, { label: '125%', value: '125' }],
      get: () => String(settings.textSize), set: (v: string) => { settings.textSize = v === '125' ? 125 : 100; saveSettings(); },
      hint: () => tr(L('125%：文字放大一级像素（随窗口大小，最多 150%），依然锐利。', '125%: text one pixel step larger (depends on the window, at most 150%) and still sharp.')),
    },
    {
      label: () => tr(L('术语说明', 'Term explanations')), kind: 'choice', get options() { return tripleOpts(); },
      get: () => settings.termHints, set: (v: string) => { settings.termHints = v as typeof settings.termHints; saveSettings(); },
      hint: () => tr(L('在"回忆""残响"等名称旁显示一句大白话。自动：每个词前 3 次显示。', 'A plain-language line next to names like "Memory" and "Echo". Auto: the first 3 times you see each.')),
    },
    ...(!settingsLive.hudLabels ? [] : [{
      label: () => tr(L('HUD 标注', 'HUD labels')), kind: 'choice' as const, get options() { return tripleOpts(); },
      get: () => settings.hudLabels, set: (v: string) => { settings.hudLabels = v as typeof settings.hudLabels; saveSettings(); },
      hint: () => tr(L('在血条、磁带、时砂旁标出名字。自动：前 3 局显示。', 'Names next to your health bar, tape and sand. Auto: your first 3 runs.')),
    }]),
    { label: () => tr(L('伤害数字', 'Damage numbers')), kind: 'toggle', get: () => settings.showDamage, set: set('showDamage'), hint: () => tr(L('在敌人头上显示造成的伤害。', 'Show the damage you deal above enemies.')) },
    // ── F4b (ONBOARD2 §6.12, §5.10): guidance, the coach, its slow motion, the death replay, reset ──
    header('教学', 'Tutorial'),
    {
      label: () => tr(S('onboard', 'setGuidance')), kind: 'choice',
      get options() { return [{ label: tr(S('onboard', 'setGuidanceFull')), value: 'full' }, { label: tr(S('onboard', 'setGuidanceLite')), value: 'lite' }, { label: tr(S('onboard', 'setGuidanceOff')), value: 'off' }]; },
      get: () => settings.onboarding, set: (v: string) => { settings.onboarding = v === 'lite' ? 'lite' : v === 'off' ? 'off' : 'full'; saveSettings(); },
      hint: () => tr(S('onboard', 'setGuidanceHint')),
    },
    {
      label: () => tr(S('coach', 'setCoach')), kind: 'choice', get options() { return tripleOpts(); },
      get: () => settings.coach, set: (v: string) => { settings.coach = v as typeof settings.coach; saveSettings(); },
      hint: () => tr(S('coach', 'setCoachHint')),
    },
    { label: () => tr(S('coach', 'setCoachSlow')), kind: 'toggle', get: () => settings.coachSlowmo, set: set('coachSlowmo'), hint: () => tr(S('coach', 'setCoachSlowHint')), disabled: () => settings.coach === 'off' },
    { label: () => tr(S('coach', 'setDeathReplay')), kind: 'toggle', get: () => settings.deathReplay, set: set('deathReplay'), hint: () => tr(S('coach', 'setDeathReplayHint')) },
    resetRow(),
    header('操作', 'Controls'),
    ...(!settingsLive.rewindMode ? [] : [{
      label: () => tr(L('回溯方式', 'Rewind input')), kind: 'choice' as const,
      get options() { return [{ label: tr(L('轻按+按住', 'Tap + hold')), value: 'both' }, { label: tr(L('仅轻按', 'Tap only')), value: 'tap' }]; },
      get: () => settings.rewindMode, set: (v: string) => { settings.rewindMode = v === 'tap' ? 'tap' : 'both'; saveSettings(); },
      hint: () => tr(L('轻按：回到旧影。按住：拖动磁带，选择回到哪一刻。仅轻按：按住也当作轻按。', 'Tap: return to your Shadow. Hold: scrub the tape to pick the moment. Tap only: holding counts as a tap.')),
    }]),
    { label: () => tr(L('瞄准辅助（手柄）', 'Aim assist (gamepad)')), kind: 'toggle', get: () => settings.aimAssist, set: set('aimAssist') },
    { label: () => tr(L('手柄震动', 'Controller rumble')), kind: 'toggle', get: () => settings.rumble, set: (v: boolean) => { set('rumble')(v); if (v) rumbleAll(0.6, 0.6, 200); } },
    { label: () => tr(L('震动强度', 'Rumble strength')), kind: 'slider', get: () => settings.rumbleStrength, set: (v: number) => { set('rumbleStrength')(v); rumbleAll(0.6, 0.6, 150); }, disabled: () => !settings.rumble },
    { label: () => tr(L('按键设置', 'Controls')), act: () => openControls?.() },
    { label: () => tr(L('返回', 'Back')), act: onBack },
  ];
}

export class SettingsPanel implements Overlay {
  blocks = true;
  done = false;
  list: MenuList;
  sub: Overlay | null = null;
  /** Ines's notes stay hidden (and paused) while this is open */
  hidesNotes = true;
  constructor() {
    this.list = new MenuList(settingsItems(() => (this.done = true), () => (this.sub = new ControlsPanel())));
  }
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
    // layout follows the text size: rule under the title, rows, then room for a two-line hint
    const ruleY = Math.round(30 + Math.max(18, Text.lineH('body') + 3));
    rect(ctx, 166, ruleY, 308, 1, 'B1');
    // room above the first row for the scroll-up arrow
    const listY = ruleY + 13;
    this.list.maxH = 334 - listY - Math.ceil(2 * Text.lineH('small') + 8);
    this.list.render(ctx, 172, listY, 296);
    this.sub?.render(r);
  }
}

export class RunInfoPanel implements Overlay {
  blocks = true;
  hidesNotes = true;
  sel = 0;
  /** slot: whose build to show; input: co-op, that hand's own device drives the panel */
  constructor(private run: Run, private slot = 0, private input?: PlayerInput) {}
  private entries(): { icon: Sprite; name: string; desc: string; color: string; tag: string }[] {
    const run = this.run;
    const out: { icon: Sprite; name: string; desc: string; color: string; tag: string }[] = [];
    const lo = run.lo(this.slot);
    for (const om of lo.memories) {
      const d = MEMORIES[om.id];
      if (!d) continue;
      out.push({ icon: patronSigil(d.patron), name: tr(d.name), desc: tr(d.desc(d.v[om.rarity])), color: RARITY_TEXT[om.rarity], tag: `${tr(PATRONS[d.patron].name)} · ${tr(UI.slots[d.slot])} · ${tr(UI.rarity[om.rarity])}` });
    }
    for (const id of lo.hourglass) { const h = HOURGLASS_BY_ID[id]; if (h) out.push({ icon: ICONS.hourglass, name: tr(h.name), desc: tr(h.desc), color: 'C3', tag: tr(UI.hourglass) }); }
    for (const id of lo.calibrations) { const c = CAL_BY_ID[id]; if (c) out.push({ icon: ICONS.whetstone, name: tr(c.name), desc: tr(c.desc), color: 'K9', tag: tr(UI.calibration) }); }
    for (const id of lo.parts) { const p = PARTS_BY_ID[id]; if (p) { const lk = partLook(p); out.push({ icon: lk.icon, name: tr(p.name), desc: tr(p.desc), color: lk.color, tag: tr(UI.part) }); } }
    return out;
  }
  update(dt: number) {
    const inp = this.input ?? G.input;
    if (inp.pressed('cancel') || inp.pressed('info') || inp.pressed('pause')) { inp.consume('pause'); sfx('uiBack'); return false; }
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
    // co-op: whose build
    if (this.input || G.players.length > 1) drawSlotTag(ctx, this.slot, 52, 34 + Text.lineH('body') / 2);
    const lo = run.lo(this.slot);
    const m = lo.mods;
    const stats = [
      `${tr(L('生命', 'HP'))} ${Math.ceil(lo.hp)}/${m.maxHp}`,
      `${tr(L('伤害', 'Damage'))} ${Math.round(m.dmg * 100)}%`,
      `${tr(L('暴击', 'Crit'))} ${Math.round(m.critChance * 100)}%`,
      `${tr(L('回溯', 'Rewind'))} ${m.rewindCharges}×${m.rewindWindow.toFixed(1)}s`,
      `${tr(L('残响', 'Echo'))} ${Math.round(m.echoDmg * 100)}%`,
      `${tr(L('悖论', 'Paradox'))} ${Math.round(m.paradoxDmg)}`,
    ];
    // stat line(s): measured, spread across the panel; two rows when one would not fit
    const sy = Math.round(34 + Text.lineH('body') + 6), ls = Text.lineH('small');
    const sw = stats.map((t) => Math.ceil(Text.measure(t, 'small').w));
    const oneRow = sw.reduce((a, b) => a + b, 0) + 14 * (stats.length - 1) <= 520;
    const perRow = oneRow ? stats.length : Math.ceil(stats.length / 2);
    for (let row = 0; row * perRow < stats.length; row++) {
      // spread each row's items over the panel width with equal gaps
      const ids = stats.map((_, i) => i).slice(row * perRow, row * perRow + perRow);
      const used = ids.reduce((a, i) => a + sw[i], 0);
      const gap = ids.length > 1 ? Math.min(60, (520 - used) / (ids.length - 1)) : 0;
      let x = 60;
      for (const i of ids) { Text.draw(ctx, stats[i], x, sy + row * ls, { size: 'small', color: 'K8' }); x += sw[i] + gap; }
    }
    const ruleY = Math.round(sy + Math.ceil(stats.length / perRow) * ls + 1);
    rect(ctx, 56, ruleY, 528, 1, 'B1');
    const es = this.entries();
    if (!es.length) { Text.draw(ctx, L('还没有任何回忆或零件。', 'No memories or parts yet.'), 320, 170, { align: 'center', color: 'K7' }); return; }
    // detail of the selected entry, anchored to the panel's bottom: name + tag, then the description
    const e = es[Math.min(this.sel, es.length - 1)];
    const lb = Text.lineH('body');
    const descH = Text.measureWrapped(e.desc, 'body', 512).h;
    const dRule = Math.round(Math.min(246, 330 - (lb + 4 + descH) - 8));
    es.forEach((en, i) => {
      const cx = 72 + (i % 10) * 50, cy = ruleY + 30 + Math.floor(i / 10) * 44;
      if (cy + 20 > dRule) return;
      if (i === this.sel) { rect(ctx, cx - 20, cy - 20, 40, 40, 'K3'); rect(ctx, cx - 20, cy + 19, 40, 1, 'B5'); }
      drawScaled(ctx, en.icon, cx, cy, 2);
    });
    rect(ctx, 56, dRule, 528, 1, 'B1');
    const nw = Text.draw(ctx, e.name, 64, dRule + 8, { color: e.color }).w;
    Text.draw(ctx, e.tag, 64 + nw + 10, dRule + 8 + Text.inkMid('body'), { size: 'small', color: 'K7', valign: 'middle' });
    Text.draw(ctx, e.desc, 64, dRule + 8 + lb + 4, { color: 'K9', maxW: 512 });
  }
}

export class PauseMenu implements Overlay {
  blocks = true;
  hidesNotes = true;
  list: MenuList;
  closing = false;
  confirmQuit = false;
  t = 0;
  constructor(private host: PauseHost) {
    G.audio.muffle(true, 700);
    sfx('uiOpen');
    // whose menu this is (co-op: whoever opened it): their buttons in the guide, their lesson
    const hand = (G.scenes.current as { world?: { players: import('../entities/player').Player[] } } | null)?.world?.players.find((q) => q.slot === (host.buildSlot ?? 0)) ?? null;
    const who = hand?.input;
    const lesson = hand ? Lessons.active(hand) : null;
    const kind = (G.scenes.current as { opt?: { kind?: string } } | null)?.opt?.kind;
    const inPrologue = kind === 'prologue';
    const confirm = (key: string): MenuItem => {
      let armed = false;
      return { label: () => tr(S('coach', armed ? key + 'Confirm' : key)), act: () => {
        if (!armed) { armed = true; return; }
        this.closing = true; G.audio.muffle(false);
        if (key === 'pauseSkipLesson') lesson?.skip();
        else if (key === 'pauseSkipPrologue') { Onboard.skipAll(); Flags.set('onboard.skipped', 1); void import('../flow').then((m) => m.Flow.hub('start')); }
      } };
    };
    let skipArmed = false;
    const teach: MenuItem[] = [
      // ONBOARD2 §7.1: the second row everywhere (in the prologue, from its third lesson on)
      ...(!inPrologue || (lesson && ['undo', 'echo', 'paradox', 'final'].includes(String(lesson.id))) ? [{ label: () => tr(S('coach', 'pauseGuide')), act: () => { const g = Panels.open('rewindGuide', { who }); if (g) host.overlays.push(g); } }] : []),
      // the prologue: watch the demo again · skip this lesson · skip the prologue (each asks twice)
      ...(inPrologue && lesson ? [{ label: () => tr(S('coach', 'pauseWatchDemo')), act: () => { this.closing = true; G.audio.muffle(false); lesson.replay(); } }, confirm('pauseSkipLesson')] : []),
      ...(inPrologue ? [confirm('pauseSkipPrologue')] : []),
      // an after-fight lesson in progress: "later" (a postponement, the door was always open)
      ...(!inPrologue && lesson ? [{ label: () => tr(S('coach', 'pauseLater')), act: () => { this.closing = true; G.audio.muffle(false); lesson.postpone(); } }] : []),
      // "I know how to play": the coach and the lessons go away (asks once more)
      ...(!inPrologue && Onboard.mode() === 'full' ? [{ label: () => tr(S('coach', skipArmed ? 'pauseSkipYes' : 'pauseSkip')), act: () => { if (!skipArmed) { skipArmed = true; return; } skipTeaching(); this.closing = true; G.audio.muffle(false); } }] : []),
    ];
    this.list = new MenuList([
      { label: () => tr(UI.resume), act: () => (this.closing = true) },
      ...teach,
      { label: () => tr(L('本局构筑', 'Your Build')), act: () => host.overlays.push(new RunInfoPanel(host.run, host.buildSlot ?? 0)) },
      { label: () => tr(UI.settings), act: () => host.overlays.push(new SettingsPanel()) },
      ...(host.leaveItem ? [{ label: () => tr(host.leaveItem!.label), act: () => { this.closing = true; G.audio.muffle(false); host.leaveItem!.act(); } }] : []),
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
    GameHooks.fire.pauseTick(this.t);
    if (this.closing) { G.audio.muffle(false); return false; }
    if (this.t > 0.1 && (G.input.pressed('pause') || G.input.pressed('cancel'))) { G.input.consume('pause'); sfx('uiBack'); G.audio.muffle(false); return false; }
    if (G.input.pressed('info')) { this.host.overlays.push(new RunInfoPanel(this.host.run, this.host.buildSlot ?? 0)); return true; }
    const prev = this.list.sel;
    this.list.update(dt);
    if (this.list.sel !== prev) this.confirmQuit = false;
    return true;
  }
  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1;
    // 136 px holds four rows; each row past four (co-op "Leave", the teaching rows) adds one more
    const extra = this.list.items.length * (this.list.rh - this.list.rowH) + Math.round(Math.max(0, Text.lineH('body') - 15)) + Math.max(0, this.list.items.length - 4) * this.list.rowH;
    // as wide as the longest row needs (the teaching rows are longer than 1.0's), centred
    let lw = 160;
    for (const it of this.list.items) lw = Math.max(lw, Math.ceil(Text.measure(it.label(), 'body').w) + 16);
    lw = Math.min(lw, 340);
    const pw = lw + 40, px = Math.round(320 - pw / 2);
    panel(ctx, px, 110 - Math.round(extra / 2), pw, 136 + extra);
    const top = 110 - Math.round(extra / 2);
    G.font.draw(ctx, tr(UI.paused), 320, top + 10, { align: 'center', color: 'B5' });
    const ruleY = Math.round(top + 10 + Math.max(18, Text.lineH('body') + 3));
    rect(ctx, px + 16, ruleY, pw - 32, 1, 'B1');
    this.list.render(ctx, px + 20, ruleY + 10, lw);
    void i18n;
  }
}
