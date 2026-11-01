// Beats (ONBOARD2 §2.9, §2.10): the success beat every lesson, the coach and the Hall share, and the
// fail beat ("what happened + what to do next", one line, never a buzzer).
//
//   Beat.success({ p, id, stamp, why, strip? })   0.04 s hit-stop · the success card on the caption
//       rail (✓ + the stamp word + one "why" line + the model strip) · lessonPass · a pad rumble ·
//       bus custom 'onboard.success' { id }
//   Beat.fail({ p, text })                          a 1.8 s tier-A line · lessonRetry
//
// Interface day: real cards, sound, rumble and event; the stamp slam (2× → 1× in 0.07 s), the strip
// cell light-up at 0.8 s and the prologue clock jump at 1.6 s come with the lessons (F4a days 2–4).
import type { Player } from '../entities/player';
import type { World } from '../world/world';
import type { L10n } from '../i18n';
import { G, sfx } from '../G';
import { Stage, type SayHandle } from './stage';
import { Tut } from './core';

export interface SuccessOpts {
  /** the hand that did it (its seat's rail, its pad rumbles) */
  p?: Player | null;
  /** lesson / detector id (the 'onboard.success' event and __tut.log carry it) */
  id?: string;
  /** "UNDONE!" — the stamp word */
  stamp: L10n;
  /** "Got hit? Rewind — the damage is undone." — one line that points back to a why (ONBOARD2 §1.2) */
  why: L10n;
  /** model-strip cells to show lit under it (prologue and core lessons only) */
  strip?: number;
  /** the cells already lit before (the new ones light up at 0.8 s) */
  stripPrev?: number;
  /** a small grey line under the why ("−100 Sand · 3 seconds back") */
  sub?: L10n;
  /** seconds (default 2.4; the coach's 2.0) */
  dur?: number;
}

const worldOf = (): World | null => (G.scenes.current as unknown as { world?: World } | null)?.world ?? null;

export const Beat = {
  success(o: SuccessOpts): SayHandle {
    const p = o.p ?? null;
    const w = p?.world ?? worldOf();
    w?.hitstop(0.04);
    sfx('lessonPass');
    p?.input?.rumble(0.25, 0.4, 120);
    const h = Stage.say({
      key: 'onboard.success', tier: 'A', form: 'success', slot: p?.slot,
      text: o.stamp, stamp: o.stamp, why: o.why, strip: o.strip, stripPrev: o.stripPrev, footer: o.sub, dur: o.dur ?? 2.4,
    });
    w?.bus.emit('custom', { id: 'onboard.success', player: p ?? undefined, data: { id: o.id ?? null } });
    Tut.log('success', { id: o.id ?? null, slot: p?.slot ?? 0 });
    return h;
  },
  /** a fail beat: what happened + what to do next (tier A, 1.8 s) */
  fail(o: { p?: Player | null; id?: string; text: L10n | string; vars?: Record<string, string | number> }): SayHandle {
    const p = o.p ?? null;
    sfx('lessonRetry');
    Tut.log('fail', { id: o.id ?? null, slot: p?.slot ?? 0 });
    return Stage.say({ key: 'onboard.fail', tier: 'A', slot: p?.slot, text: o.text, vars: o.vars, dur: 1.8, speaker: 'ines' });
  },
};
