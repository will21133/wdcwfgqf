// End-of-run report: what you achieved, what you bank.
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
    G.font.draw(ctx, tr(title), 320, 34, { align: 'center', color: this.kind === 'victory' ? 'B5' : 'R3', outline: 'K0' });
    const run = this.run;
    const th = THEMES[Math.min(run.floor, THEMES.length - 1)];
    const ow = run.overwind > 0 ? tr(L(` · 超频 ${run.overwind}`, ` · Overwind ${run.overwind}`)) : '';
    const sub = this.kind === 'victory'
      ? L(`钟声敲响了第十二下${ow}`, `The clock struck twelve${ow}`)
      : L(`到达：第 ${run.floor + 1} 层 · ${th.name.zh} · 第 ${run.roomIndex + 1} 间${ow}`, `Reached: Floor ${run.floor + 1} · ${th.name.en} · Room ${run.roomIndex + 1}${ow}`);
    G.small.draw(ctx, tr(sub), 320, 54, { align: 'center', color: this.kind === 'victory' ? 'B4' : 'K7' });
    panel(ctx, 110, 70, 420, 236);
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
    rows.forEach(([label, v], i) => {
      const y = 84 + i * 18;
      const show = this.t > 0.4 + i * 0.12;
      if (!show) return;
      G.font.draw(ctx, tr(label), 130, y, { color: 'K8' });
      G.font.draw(ctx, v, 300, y, { align: 'right', color: 'K10' });
    });
    // build icons
    const icons: [import('../../engine/gfx/sprite').Sprite, string][] = [];
    for (const m of run.memories) { const d = MEMORIES[m.id]; if (d) icons.push([patronSigil(d.patron), d.id]); }
    for (const id of run.parts) { const p = PARTS_BY_ID[id]; if (p) icons.push([partLook(p).icon, id]); }
    G.small.draw(ctx, tr(L('本局构筑', 'Build')), 330, 84, { color: 'K7' });
    icons.slice(0, 24).forEach(([ic], i) => { if (this.t > 0.8 + i * 0.04) drawScaled(ctx, ic, 342 + (i % 8) * 22, 106 + Math.floor(i / 8) * 22, 1, k); });
    const wi = WEAPON_INFO.find((x) => x.id === run.weapon);
    if (wi && this.t > 0.6) {
      G.small.draw(ctx, tr(L('武器', 'Weapon')), 330, 160, { color: 'K7' });
      drawScaled(ctx, wi.sprite, 342, 182, 1, k);
      G.font.draw(ctx, tr(wi.name), 360, 176, { color: 'B5' });
    }
    rect(ctx, 126, 200, 388, 1, 'B1');
    if (this.t > 1.2) {
      shardIcon(ctx, 260, 214);
      const n = Math.round(this.shardsBanked * clamp((this.t - 1.2) / 0.8, 0, 1));
      G.font.draw(ctx, tr(L(`带回时之碎片  ${n}`, `Time Shards banked  ${n}`)), 274, 212, { color: 'V4' });
      G.small.draw(ctx, tr(L('碎片会留在工坊，用来拧紧你的发条。', 'Shards stay in the workshop to wind your mainspring.')), 320, 236, { align: 'center', color: 'K6' });
    }
    if (this.t > 1.5) drawHint(ctx, 320, 284, [['confirm', tr(L('回到工坊', 'Return to the workshop'))]]);
    ctx.globalAlpha = 1;
  }
}
