// The room objective line, minimal (ONBOARD2 §5.4, §10.1; GDD2 §9.8 rule 3): in a novice's first run,
// every fight says what it wants — "Clear the enemies → pick a door", then "Pick a door" once it is
// cleared. P2's real `objective` widget replaces this one (same HUD id).
import type { Player } from '../entities/player';
import { G } from '../G';
import { S } from '../strings';
import { Hud } from '../ui/hud';
import { Text } from '../ui/text';
import { rect } from '../ui/draw';
import { profile } from '../save';
import { RoomTypes } from '../rooms/registry';
import { Onboard } from './core';
import { Gates } from './gates';
import '../strings/onboard';

type SceneLike = { opt?: { kind?: string }; cleared?: boolean; boss?: unknown; run?: { config?: { mode?: string } } };
function wanted(p: Player | null): 0 | 1 | 2 {
  const sc = G.scenes.current as unknown as SceneLike | null;
  if (!sc?.opt?.kind || !p || sc.run?.config?.mode !== 'standard' || sc.boss) return 0;
  if (!Gates.live || !Onboard.isNovice(p) || profile.runs > 1) return 0;
  if (!RoomTypes.get(sc.opt.kind)?.combat) return 0;
  return sc.cleared ? 2 : 1;
}
let shownT = 0;
Hud.register({
  id: 'objective', area: 'top', order: 5,
  update(dt, p) { shownT = wanted(p) ? shownT + dt : 0; },
  draw(ctx, p, r) {
    const k = wanted(p);
    if (!k) return;
    const text = S('onboard', k === 1 ? 'objClear' : 'objDoor');
    const m = Text.measure(text, 'small');
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * Math.min(1, shownT / 0.4);
    const w = Math.ceil(m.w) + 14, h = Math.ceil(Text.lineH('small')) + 2;
    const x = Math.round(r.x + r.w / 2 - w / 2), y = r.y + 1;
    ctx.globalAlpha = a0 * Math.min(1, shownT / 0.4) * 0.8;
    rect(ctx, x, y, w, h, 'K0');
    ctx.globalAlpha = a0 * Math.min(1, shownT / 0.4);
    // a small brass diamond in front: an objective, not a teaching line
    rect(ctx, x + 4, y + h / 2 - 1, 3, 3, 'B5');
    Text.draw(ctx, text, x + 10, y + h / 2, { size: 'small', color: 'K9', valign: 'middle', shadow: false });
    ctx.globalAlpha = a0;
  },
});
