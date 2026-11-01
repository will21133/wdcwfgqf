// End-of-run report: what you achieved, what you bank.
import { drawSlotBadge } from '../players';
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Run } from '../run';
import { G, sfx } from '../G';
import { tr, L, L10n } from '../i18n';
import { panel, rect, shardIcon } from '../ui/draw';
import { drawScaled } from '../ui/overlay';
import { MEMORIES } from '../progression/memories';
import { PARTS_BY_ID } from '../progression/parts';
import { patronSigil } from '../../art/sprites/icons';
import { partLook } from '../progression/rewards';
import { THEMES } from '../../art/themes';
import { ease, clamp } from '../../engine/math';
import { drawHint } from '../ui/prompts';
import { promptH } from '../ui/widgets';
import { Text } from '../ui/text';
import { col } from '../../art/palette';
import { WEAPON_INFO } from '../ui/metaPanels';

export class SummaryScene implements Scene {
  t = 0;
  constructor(private run: Run, private kind: 'death' | 'quit' | 'victory', private shardsBanked: number, private onDone: () => void) {}
  enter() { G.music.play(this.kind === 'victory' ? 'victory' : 'death', 1.5); }
  update(dt: number) {
    this.t += dt;
    if (this.t > 1.5 && (G.input.pressed('confirm') || G.input.pressed('attack') || G.input.pressed('interact'))) { sfx('uiSelect'); this.onDone(); }
  }
  render(r: Renderer) {
    r.params.lighting = false; r.params.bloom = 0.4; r.params.vignette = 0.5; r.params.rewind = 0; r.params.ca = 0; r.params.hurt = 0;
    r.params.saturation = 1; r.params.tint = [1, 1, 1]; r.params.lift = [0, 0, 0]; r.params.fade = 0;
    r.begin(0, 0, col('K0'));
    const ctx = r.ui2;
    // slowly turning clock in the background
    const w = r.w;
    w.strokeStyle = col('K2'); w.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 + this.t * 0.02;
      const r0 = i % 5 ? 150 : 140;
      w.beginPath(); w.moveTo(320 + Math.cos(a) * r0, 180 + Math.sin(a) * r0); w.lineTo(320 + Math.cos(a) * 158, 180 + Math.sin(a) * 158); w.stroke();
    }
    const k = ease.outCubic(clamp(this.t / 0.6, 0, 1));
    ctx.globalAlpha = k;
    const title: L10n = this.kind === 'victory' ? L('午 夜', 'MIDNIGHT') : this.kind === 'quit' ? L('提前收工', 'CALLED IT A NIGHT') : L('停 摆', 'THE CLOCK STOPS');
    Text.draw(ctx, title, 320, 34, { align: 'center', color: this.kind === 'victory' ? 'B5' : 'R3', outline: 'K0' });
    const run = this.run;
    const th = THEMES[Math.min(run.floor, THEMES.length - 1)];
    const ow = run.overwind > 0 ? tr(L(` · 超频 ${run.overwind}`, ` · Overwind ${run.overwind}`)) : '';
    const sub = this.kind === 'victory'
      ? L(`钟声敲响了第十二下${ow}`, `The clock struck twelve${ow}`)
      : L(`到达：第 ${run.floor + 1} 层 · ${th.name.zh} · 第 ${run.roomIndex + 1} 间${ow}`, `Reached: Floor ${run.floor + 1} · ${th.name.en} · Room ${run.roomIndex + 1}${ow}`);
    // every row below is spaced from the text's real size (the panel grows with larger text)
    const lb = Text.lineH('body'), ls = Text.lineH('small');
    const subY = Math.round(34 + lb + 5);
    Text.draw(ctx, sub, 320, subY, { size: 'small', align: 'center', color: this.kind === 'victory' ? 'B4' : 'K7' });
    const top = Math.max(70, Math.round(subY + ls + 4));
    const rowsY = top + 14, rowH = Math.max(18, Math.ceil(lb) + 2);
    const s = run.stats;
    const mm = Math.floor(run.time / 60), ss = Math.floor(run.time % 60);
    const rows: [L10n, string][] = [
      [L('用时', 'Time'), `${mm}:${String(ss).padStart(2, '0')}`],
      [L('清理房间', 'Rooms cleared'), String(s.rooms)],
      [L('击毁敌人', 'Enemies destroyed'), String(s.kills)],
      [L('造成伤害', 'Damage dealt'), String(Math.round(s.damage))],
      [L('回溯次数', 'Rewinds'), String(s.rewinds)],
      [L('悖论次数', 'Paradoxes'), String(s.paradoxes)],
    ];
    const ruleY = Math.max(top + 130, rowsY + rows.length * rowH + 4);
    const shardY = ruleY + 12;
    const explY = Math.round(shardY + lb + 9);
    const hintY = Math.max(284, Math.round(explY + ls + 14));
    panel(ctx, 110, top, 420, hintY + promptH() + 9 - top);
    rows.forEach(([label, v], i) => {
      const y = rowsY + i * rowH;
      const show = this.t > 0.4 + i * 0.12;
      if (!show) return;
      Text.draw(ctx, label, 130, y, { color: 'K8' });
      Text.draw(ctx, v, 318, y, { align: 'right', color: 'K10' });
    });
    // build icons (co-op: one row per hand, led by its badge; never creates a loadout)
    const los = run.all;
    const iconsOf = (lo: import('../run').Loadout) => {
      const icons: import('../../engine/gfx/sprite').Sprite[] = [];
      for (const m of lo.memories) { const d = MEMORIES[m.id]; if (d) icons.push(patronSigil(d.patron)); }
      for (const id of lo.parts) { const p = PARTS_BY_ID[id]; if (p) icons.push(partLook(p).icon); }
      return icons;
    };
    Text.draw(ctx, L('本局构筑', 'Build'), 330, rowsY, { size: 'small', color: 'K8' });
    if (los.length > 1) {
      los.forEach((lo, r) => {
        const cy = rowsY + 22 + r * 22;
        if (this.t <= 0.8 + r * 0.1) return;
        drawSlotBadge(ctx, lo.slot, 336, cy);
        iconsOf(lo).slice(0, 7).forEach((ic, i) => drawScaled(ctx, ic, 352 + i * 22, cy, 1, k));
      });
    } else if (los[0]) {
      iconsOf(los[0]).slice(0, 24).forEach((ic, i) => { if (this.t > 0.8 + i * 0.04) drawScaled(ctx, ic, 342 + (i % 8) * 22, rowsY + 22 + Math.floor(i / 8) * 22, 1, k); });
    }
    const wi = los.length === 1 ? WEAPON_INFO.find((x) => x.id === los[0].weapon) : undefined;
    if (wi && this.t > 0.6) {
      const wy = ruleY - 40;
      Text.draw(ctx, L('武器', 'Weapon'), 330, wy, { size: 'small', color: 'K8' });
      const cy = wy + ls + 9;
      drawScaled(ctx, wi.sprite, 342, cy, 1, k);
      Text.draw(ctx, wi.name, 360, cy, { color: 'B5', valign: 'middle' });
    }
    rect(ctx, 126, ruleY, 388, 1, 'B1');
    if (this.t > 1.2) {
      const n = Math.round(this.shardsBanked * clamp((this.t - 1.2) / 0.8, 0, 1));
      // icon + line centred together
      const line = tr(L(`带回时之碎片  ${n}`, `Time Shards banked  ${n}`));
      const lw = Text.measure(line, 'body').w;
      const lx = Math.round(320 - (lw + 14) / 2);
      shardIcon(ctx, lx, Math.round(shardY + Text.inkMid('body') - 4));
      Text.draw(ctx, line, lx + 14, shardY, { color: 'V4' });
      Text.draw(ctx, L('碎片会留在工坊，用来拧紧你的发条。', 'Shards stay in the workshop to wind your mainspring.'), 320, explY, { size: 'small', align: 'center', color: 'K8' });
    }
    if (this.t > 1.5) drawHint(ctx, 320, hintY, [['confirm', tr(L('回到工坊', 'Return to the workshop'))]]);
    ctx.globalAlpha = 1;
  }
}
