// Quiet moments (ONBOARD2 §5.5): lessons are only ever taught when nothing is going on — after a room
// is cleared, or in a rest / shop room — and at most one new thing per room.
//
//   Calm.isCalm(scene, p)     solo: the room is cleared ≥ 1.2 s ago (or a rest / shop room entered
//                             ≥ 1.5 s ago), no enemy, no boss, no menu, the hand standing; never in a
//                             boss room or a vault, while a note shows, during a transition, or once
//                             the room's "one new thing" has been used
//   Calm.request(id, why)     curiosity jumps the queue: a Fork press before its lesson, the pause
//                             page's "teach me after this fight", the death card's "practise"
//   Calm.addRule(rule)        F4a registers R1's fork / scrub; F4b's ladder.ts adds R2+ and the events
//   Calm.spend(scene) / Calm.spent(scene)   the room's one new thing
//
// The director (every Stage update, standard runs only, novice hands only): at the quiet moment it
// takes ① the queue's head (a press, the pause page, the death card), ② a lesson owed from earlier
// (postponed), ③ the first rule whose gate is open while the run has had fewer than LESSONS_PER_RUN
// lessons — and starts it with a SoftHost where the hand stands. Walking out through a door
// postpones it (Flags 'onboard.postpone.<id>'); postponed twice, a gated verb opens anyway (id:soft).
import type { Player } from '../entities/player';
import type { Run } from '../run';
import type { GameScene } from '../scenes/game';
import type { World } from '../world/world';
import type { LessonId } from './lesson';
import { G } from '../G';
import { Hints, hintsHooks } from '../ui/hints';
import { GameHooks } from '../hooks';
import { OnboardHooks, Tut } from './core';
import { GateHooks } from './gates';
import { Lessons } from './lesson';
import { Onboard, Tut as TutLog } from './core';
import { Gates } from './gates';
import { Flags } from '../meta/registry';
import { SoftHost } from './host';
import { Stage } from './stage';

export interface CalmRule {
  id: LessonId;
  /** the lesson's gate: taught prerequisites ∧ earliest run ∧ evidence (Stats 'did.*') */
  eligible(ctx: { run: Run; p: Player; scene: GameScene }): boolean;
  /** higher first */
  prio: number;
}
export type CalmWhy = 'press' | 'guide' | 'death' | 'owed' | (string & {});

/** after a clear (s), after entering a rest / shop room (s) */
export const CALM_AFTER_CLEAR = 1.2, CALM_AFTER_ENTER = 1.5;
/** lessons a run may start (ONBOARD2 §5.2: R1 = 2, R2–R4 = 2) and postponements before a gated verb opens anyway */
export const LESSONS_PER_RUN = 2, POSTPONE_SOFT = 2;

const rules: CalmRule[] = [];
const queue: { id: LessonId; why: CalmWhy }[] = [];
/** per room: when it was cleared (world time), and whether its one new thing is spent */
const roomInfo = new WeakMap<World, { clearedAt: number; spent: boolean }>();
const info = (w: World) => { let r = roomInfo.get(w); if (!r) roomInfo.set(w, (r = { clearedAt: -1, spent: false })); return r; };
GameHooks.onRoomClear((c) => { info(c.w).clearedAt = c.w.time; });

export const Calm = {
  addRule(r: CalmRule): void {
    const i = rules.findIndex((x) => x.id === r.id);
    if (i >= 0) rules[i] = r; else rules.push(r);
    rules.sort((a, b) => b.prio - a.prio);
  },
  rules(): readonly CalmRule[] { return rules; },
  /** put a lesson at the front of the queue (once) */
  request(id: LessonId, why: CalmWhy): void {
    if (queue.some((q) => q.id === id)) return;
    queue.unshift({ id, why });
    Tut.log('calmRequest', { id, why });
  },
  queue(): readonly { id: LessonId; why: CalmWhy }[] { return queue; },
  /** is a lesson teaching this Teach id waiting? */
  queued(teach: string): boolean { return queue.some((q) => (Lessons.get(q.id)?.teach ?? q.id) === teach); },
  /** take a lesson off the queue (it started, or was learned elsewhere) */
  take(id: LessonId): void { const i = queue.findIndex((q) => q.id === id); if (i >= 0) queue.splice(i, 1); },
  /** a quiet moment for this hand right now? */
  isCalm(scene: GameScene, p: Player): boolean {
    const w = scene.world;
    if (!w || p.state !== 'alive' || p.world !== w) return false;
    const kind = scene.opt.kind;
    if (kind === 'boss' || kind === 'vault' || scene.boss) return false;
    if (hintsHooks.busy() || Hints.active || G.scenes.transitioning) return false;
    if (scene.overlays.some((o) => o.blocks)) return false;
    const r = info(w);
    if (r.spent) return false;
    if (kind === 'rest' || kind === 'shop') return w.time >= CALM_AFTER_ENTER;
    if (!scene.cleared || w.aliveEnemies.length > 0) return false;
    return r.clearedAt >= 0 && w.time - r.clearedAt >= CALM_AFTER_CLEAR;
  },
  /** the room's one new thing was used (a lesson, a recognition, a note) */
  spend(scene: GameScene): void { if (scene.world) info(scene.world).spent = true; },
  spent(scene: GameScene): boolean { return !!scene.world && info(scene.world).spent; },
};

// ───────────────────────── the director ─────────────────────────
type SceneLike = GameScene & { opt: { kind: string }; run: Run; world: World };
/** pick the lesson for this quiet moment (null = nothing to teach: quiet is its own reward) */
function pick(scene: SceneLike, p: Player): string | null {
  const ok = (id: string) => { const d = Lessons.get(id); return !!d && d.where.includes('calm') && !Onboard.learned(p, d.teach); };
  for (const q of queue) if (ok(q.id) && (q.why !== 'press' || ruleOpen(q.id, scene, p, true))) return q.id;
  const run = scene.run;
  if ((run.flags['onboard.lessons'] ?? 0) >= LESSONS_PER_RUN) return null;
  for (const r of rules) if (ok(r.id) && r.eligible({ run, p, scene })) return r.id;
  return null;
}
/** a press-requested lesson still waits for its prerequisites (Fork after the prologue's Paradox) */
function ruleOpen(id: string, scene: SceneLike, p: Player, pressed: boolean): boolean {
  const r = rules.find((x) => x.id === id);
  if (!r) return true;
  return pressed ? (r as CalmRule & { requires?: (p: Player) => boolean }).requires?.(p) ?? true : r.eligible({ run: scene.run, p, scene });
}
function tickDirector(): void {
  const sc = G.scenes.current as unknown as SceneLike | null;
  if (!sc || !sc.world || !sc.run || !sc.opt) return;
  const kind = sc.opt.kind;
  if (kind === 'prologue' || kind === 'rehearsal' || sc.run.config?.mode !== 'standard') return;
  if (!Gates.live || Onboard.mode() !== 'full') return;
  for (const p of sc.world.players) {
    if (p.input?.kind === 'bot' || !Onboard.isNovice(p) || Lessons.active(p)) continue;
    if (!Calm.isCalm(sc, p)) continue;
    const id = pick(sc, p);
    if (!id) continue;
    Calm.take(id);
    Calm.spend(sc);
    sc.run.flags['onboard.lessons'] = (sc.run.flags['onboard.lessons'] ?? 0) + 1;
    const host = new SoftHost(sc.world, p);
    const run = Lessons.start(id, p, 'calm', host);
    TutLog.log('calmStart', { id, room: sc.run.roomIndex });
    Lessons.runner(run)?.onEnd((how) => {
      if (how !== 'postpone') return;
      const def = Lessons.get(id);
      const n = Flags.get('onboard.postpone.' + id);
      // put off twice: a gated verb opens anyway (the Hall board keeps it as "!"); else it is owed
      if (n >= POSTPONE_SOFT) { if (def) Onboard.mark(p, def.teach, 'soft'); }
      else Calm.request(id, 'owed');
    });
    return;
  }
}
Stage.onUpdate(() => {
  const sc = G.scenes.current as unknown as { overlays?: { blocks: boolean }[] } | null;
  if (sc?.overlays?.some((o) => o.blocks)) return;
  tickDirector();
});

// the gates queue the Fork lesson when a press is explained; covers() asks the queue
GateHooks.request = (id, why) => Calm.request(id, why);
OnboardHooks.queued = (teach) => Calm.queued(teach);
