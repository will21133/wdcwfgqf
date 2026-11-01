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
// Interface day: the queue, the rules, isCalm and the room budget work; the CalmDirector that picks a
// lesson at the quiet moment and starts it with a SoftHost lands F4a day 8.
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

// the gates queue the Fork lesson when a press is explained; covers() asks the queue
GateHooks.request = (id, why) => Calm.request(id, why);
OnboardHooks.queued = (teach) => Calm.queued(teach);
