// F4b debug routes (ONBOARD2 §11.6). The coach's overrides are read straight from the URL by
// coach.ts (?coach=auto|always|off|L3|L2|L1|L0, ?coachslow=0, ?coachdet=<ids>, ?coachbots=1) and
// the death card's by deathTape.ts (?deathreplay=0); this file registers the routes that build a scene:
//
//   ?drill=death&case=c1..c8[&seed=2][&lang=en]   a real room (standard run) with one inert cogling;
//        scripted blows produce that case's death and the run walks into the death card:
//          c2  a 22 hit, then a lethal blow 2 s later (no rewind)      → "+22 was yours to take back"
//          c1  one lethal blow from full HP; the Last Second runs out  → "in that last 1.5 s …"
//          c3  10 Sand                                                  → "only 10 Sand left"
//          c4  a burnt tape (as after a self-rescue)                    → "a burnt Tape can't rewind"
//          c5  standing in a time anchor                                → "you were in a time anchor"
//          c6  two violet (fixed) blows                                 → "violet damage can't be undone"
//          c7  a scrub that stops short of the hit                      → "not far enough back"
//          c8  one lethal blow, no chance to answer                     → the enemy's own tip
//        (c7 / c8 cut the Last Second short — that is what "no chance" means for the drill.)
import type { Player } from '../../entities/player';
import { G } from '../../G';
import { registerDebugRoute } from '../../debugRoutes';
import { GameHooks } from '../../hooks';
import { Onboard, Tut } from '../core';
import { Stage } from '../stage';
import { applyOnboardPreset } from '../debug';

let drill: string | null = null;

/**
 * F4b's scene routes are registered before F4a's ?onboard= preset route (pause.ts loads with the
 * scenes, before onboard/index.ts) and they take over the boot, so they apply the preset themselves.
 */
let presetDone = false;
export function presetFromUrl(q: URLSearchParams): void {
  const v = q.get('onboard');
  if (!v || presetDone) return;
  presetDone = true;
  applyOnboardPreset(v);
  Tut.log('preset', { onboard: v, by: 'f4b' });
}

registerDebugRoute('drill=death', async (q) => {
  if (q.get('drill') !== 'death') return false;
  presetFromUrl(q);
  drill = (q.get('case') ?? 'c2').toLowerCase();
  // c7 needs a real scrub: hold-to-scrub is gated until taught, so this drill plays as someone who knows it
  if (drill === 'c7' && !q.get('onboard')) Onboard.force('skip');
  const [{ Run }, { GameScene }, { Flow }, { ensurePlayers }] = await Promise.all([
    import('../../run'), import('../../scenes/game'), import('../../flow'), import('../../players'),
  ]);
  const seats = ensurePlayers();
  const seed = Number(q.get('seed') ?? 2);
  const run = new Run({ mode: 'standard', seed, contracts: {}, players: seats.map((inp) => ({ slot: inp.slot, device: inp.device, hand: 'tick', weapon: 'rapier' })) });
  const gs = new GameScene(run, { kind: 'rest', reward: null }, seed);
  Flow.wire(gs);
  G.scenes.set(gs);
  Tut.log('drill', { death: drill });
  return true;
});

GameHooks.onRoomStart(async ({ w, scene }) => {
  if (!drill || scene.run.roomIndex !== 0) return;
  const c = drill;
  const { Cogling } = await import('../../entities/enemies/gearworks');
  const p = w.players[0] as Player;
  // one cogling, inert, keeping beside the hand (it is only there to be the one who did it, and to be
  // seen doing it in the replay)
  const foe = new Cogling(p.x + 26, p.y - 2);
  (foe as unknown as { update: () => void }).update = () => { if (p.state !== 'ghost') { foe.x = p.x + 26; foe.y = p.y - 2; } };
  foe.spawnT = 0;
  w.add(foe);
  const lo = p.lo;
  const blow = (amount: number, fixed = false) => { p.invuln = 0; p.dashT = 0; p.hurt({ amount, kind: 'melee', owner: foe, x: foe.x, y: foe.y, knock: 0, fixed }); };
  const cutLastSecond = () => w.after(0.05, () => { if (p.state === 'stopped') p.down.lastSecond = Math.min(p.down.lastSecond, 0.02); });
  const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  // let the hand walk a little so the tape and the Shadow have somewhere to be
  const walk = (on: boolean) => key('KeyA', on);
  w.after(0.6, () => walk(true));
  w.after(2.2, () => walk(false));
  switch (c) {
    case 'c1': w.after(3.5, () => blow(80)); break;
    case 'c3': w.after(1.0, () => { lo.sand = 10; }); w.after(3.5, () => blow(15)); w.after(5.0, () => blow(60)); break;
    case 'c4': w.after(3.5, () => { p.rec.burnT = 6; blow(15); }); w.after(4.6, () => blow(60)); break;
    case 'c5': w.every(0.05, () => { if (w.time > 3) p.anchorT = 0.2; }); w.after(3.5, () => blow(15)); w.after(4.6, () => blow(60)); break;
    case 'c6': w.after(3.5, () => blow(25, true)); w.after(4.6, () => blow(40, true)); break;
    case 'c7': {
      w.after(1.0, () => { lo.sand = lo.sandMax; });
      w.after(3.5, () => blow(15));
      // hold rewind just long enough to scrub a little: released as soon as the press counts as a scrub
      // (cursor ≈ 0.35 s back), short of the hit 0.6 s back, so nothing comes back. Watched on the frame
      // clock (the scrub runs on real time). The lethal blow lands 0.15 s after the landing, inside the
      // 0.3 s nobody could answer in, so "a tap right after the scrub" is not what this death is about.
      w.after(4.1, () => key('KeyQ', true));
      let phase = 0;
      Stage.onUpdate(() => {
        if (drill !== 'c7' || p.world !== w) return;
        const rw = p.rw as { scrub?: boolean; cursor: number } | null;
        if (phase === 0 && rw?.scrub) { key('KeyQ', false); phase = 1; }
        else if (phase === 1 && !p.rw) { phase = 2; w.after(0.15, () => { blow(60); cutLastSecond(); }); }
      });
      break;
    }
    case 'c8': w.after(3.5, () => { blow(80); cutLastSecond(); }); break;
    default: w.after(3.0, () => blow(22)); w.after(5.0, () => blow(60)); break;
  }
});
