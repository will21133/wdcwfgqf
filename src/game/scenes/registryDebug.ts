// Debug: ?debug=registry — counts of every shared registry (PLAN2 §1.2), printed on screen and to the
// console as one JSON line ("[registry] {...}"). &demo=1 also previews the toast and note designs
// (nothing is saved).
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import { G } from '../G';
import { col } from '../../art/palette';
import { L } from '../i18n';
import { Text } from '../ui/text';
import { drawPanel } from '../ui/widgets';
import { rect } from '../ui/draw';
import { registryCounts, CHIME_NAME } from '../meta/registry';
import { TERMS, stringCounts } from '../strings';
import { Hints } from '../ui/hints';
import { Panels } from '../ui/panels';
import { Notices } from '../ui/notices';
import { debugRouteNames } from '../debugRoutes';
import { RealClock } from '../clock';
import { profile } from '../save';

function counts() {
  return {
    ...registryCounts(),
    terms: Object.keys(TERMS).length,
    strings: stringCounts(),
    hints: { defined: Hints.defs().length, seen: profile.hints.length },
    panels: Panels.ids(),
    debugRoutes: debugRouteNames().length,
    sfx: (G.audio as any).registry?.size ?? 0,
    save: { version: profile.version, shards: profile.shards, migratedFrom: profile.migration?.from ?? null, refund: profile.migration?.refund ?? 0 },
    clock: { now: RealClock.now().toString().slice(0, 24), season: RealClock.season() },
  };
}

export class RegistryDebugScene implements Scene {
  t = 0;
  constructor() {
    console.log('[registry] ' + JSON.stringify(counts()));
    if (G.debug.get('demo') === '1') {
      Notices.push({ kind: 'achievement', name: L('永远差一秒', 'Forever One Second Short') });
      Notices.push({ kind: 'chime', name: CHIME_NAME.wound, label: L('钟响 · 第 3 / 11 响', 'Chime · 3 of 11'), sub: TERMS.chime?.plain });
      Notices.push({ kind: 'secret', name: L('猫知道些什么', 'The cat knows something') });
      Hints.preview({ id: 'demo', text: L('{c:◆} 表示残响已就绪。走进它，引发{c:悖论}。', 'A {c:◆} means the echo is armed. Walk into it to cause a {c:Paradox}.'), icon: 'hourglass' });
    }
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const p = r.params;
    p.lighting = false; p.bloom = 0; p.vignette = 0; p.grain = 0; p.rewind = 0; p.ca = 0; p.fade = 0;
    r.begin(0, 0, col('K1'));
    const ctx = r.ui2;
    ctx.fillStyle = col('K1');
    ctx.fillRect(0, 0, 640, 360);
    const c = counts();
    drawPanel(ctx, 16, 16, 360, 300, 'brass');
    Text.draw(ctx, L('共享注册表', 'Shared registries'), 30, 24, { color: 'B5' });
    rect(ctx, 30, 42, 332, 1, 'B1');
    const rows: [string, string][] = [
      ['achievements', `${c.achievements.earned} earned / ${c.achievements.defined} defined`],
      ['unlocks', `${c.unlocks.owned} owned / ${c.unlocks.defined} defined`],
      ['cosmetics', `${c.cosmetics.owned} owned / ${c.cosmetics.defined} defined`],
      ['chimes', `${c.chimes.rung} / ${c.chimes.total}`],
      ['flags · stats', `${c.flags} · ${c.stats}`],
      ['secrets', `${c.secrets}`],
      ['terms', `${c.terms} defined · ${c.termsSeen} seen · ${c.taught} taught`],
      ['hints', `${c.hints.seen} seen / ${c.hints.defined} defined`],
      ['strings', Object.entries(c.strings).map(([k, v]) => `${k}:${v}`).join(' ') || '—'],
      ['panels', c.panels.join(' ') || '—'],
      ['debug routes · sfx', `${c.debugRoutes} · ${c.sfx}`],
      ['save', `v${c.save.version} · ${c.save.shards} shards${c.save.migratedFrom ? ` · from v1 (+${c.save.refund})` : ''}`],
      ['clock', `${c.clock.now}${c.clock.season ? ' · ' + c.clock.season : ''}`],
    ];
    let y = 50;
    for (const [k, v] of rows) {
      Text.draw(ctx, k, 30, y, { size: 'small', color: 'K7' });
      Text.draw(ctx, v, 150, y, { size: 'small', color: 'K10', maxW: 214 });
      y += 19;
    }
  }
}
