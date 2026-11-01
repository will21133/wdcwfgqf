// The late ladder (ONBOARD2 §5.2, §5.7, §5.8): which lesson a quiet moment teaches from run 2 on,
// the event lessons (violet damage, Recall), "recognise it and stop teaching", and the natural-use
// counts (Stats 'did.*') the gates and the mastery prompts read.
//
//   Calm.addRule   sync (scrub ∧ R ≥ 2) · culprit (sync ∧ R ≥ 2, room ≥ 3 after a lesson) · tick
//                  (culprit ∧ R ≥ 3) · chain (tick ∧ R ≥ 3 ∧ 3 paradoxes) · perfect (chain ∧ R ≥ 4 ∧
//                  10 undos) · pierce (perfect ∧ R ≥ 4) · fixed (first violet hit) · recall (bought)
//                  From run 5 on only the event lessons are offered. F4a's Calm director picks among
//                  the rules and keeps the per-run cap (2).
//   recognition    a move done twice in real fights before its lesson → at the next quiet moment a
//                  3 s line "You just pulled off {x}!" instead of the lesson: taught, ✓, +3 shards
//   did.*          counted in real runs only (never the prologue, the Hall or a lesson)
//
// Debug: ?onboard=stage&stage=N (the ladder preset at stage N: its Teach marks, profile.runs and the
// did.* minimums) · ?runs=N (profile.runs)
import type { Player } from '../entities/player';
import type { GameScene } from '../scenes/game';
import type { L10n } from '../i18n';
import { G } from '../G';
import { S, term } from '../strings';
import { tr } from '../i18n';
import { Stats, Teach } from '../meta/registry';
import { profile } from '../save';
import { GameHooks } from '../hooks';
import { registerDebugRoute } from '../debugRoutes';
import { GameScene as GameSceneCls } from '../scenes/game';
import { Onboard, Tut } from './core';
import { Gates } from './gates';
import { Calm } from './calm';
import * as CalmMod from './calm';
import { Lessons } from './lesson';
import { Stage } from './stage';
import { HallRunner, makeHost, realRunner } from './lessons/hall';
import '../strings/coach';

const C = (k: string): L10n => S('coach', k);
const R = () => profile.runs;
const taught = (p: Player, id: string) => Onboard.learned(p, id);
/** lessons offered in this run (the second needs room ≥ 3, ONBOARD2 §5.2) */
const lessonsThisRun = (scene: GameScene) => (scene.run.flags['onboard.lessons'] ?? 0) as number;
/** rooms counted from 1 (like F4a's LADDER: the first room's clear is room 1) */
const room = (scene: GameScene) => scene.run.roomIndex + 1;
const lateOk = () => R() <= 4;

// ───────────────────────── the rules (§5.2) ─────────────────────────
Calm.addRule({ id: 'sync', prio: 50, eligible: ({ p, scene }) => lateOk() && taught(p, 'scrub') && R() >= 2 && room(scene) >= 1 });
Calm.addRule({ id: 'culprit', prio: 49, eligible: ({ p, scene }) => lateOk() && taught(p, 'sync') && R() >= 2 && (lessonsThisRun(scene) === 0 || room(scene) >= 3) });
Calm.addRule({ id: 'tick', prio: 48, eligible: ({ p, scene }) => lateOk() && taught(p, 'culprit') && R() >= 3 && room(scene) >= 1 });
Calm.addRule({ id: 'chain', prio: 47, eligible: ({ p, scene }) => lateOk() && taught(p, 'tick') && R() >= 3 && Stats.get('did.paradox') >= 3 && (lessonsThisRun(scene) === 0 || room(scene) >= 3) });
Calm.addRule({ id: 'perfect', prio: 46, eligible: ({ p, scene }) => lateOk() && taught(p, 'chain') && R() >= 4 && Stats.get('did.undo') >= 10 && room(scene) >= 1 });
Calm.addRule({ id: 'pierce', prio: 45, eligible: ({ p, scene }) => lateOk() && taught(p, 'perfect') && R() >= 4 && (lessonsThisRun(scene) === 0 || room(scene) >= 3) });
// event lessons: the first violet hit; Recall once it is bought (any run)
Calm.addRule({ id: 'fixed', prio: 90, eligible: ({ p }) => Teach.has('fixed:seen') && !taught(p, 'fixed') });
Calm.addRule({ id: 'recall', prio: 80, eligible: ({ p }) => p.mods.recall >= 1 && !taught(p, 'recall') });

// ───────────────────────── natural use (did.*) ─────────────────────────
/** moves recognition watches (§5.8) */
const RECOGNISE = ['sync', 'chain', 'tick', 'perfect', 'pierce', 'culprit', 'recall', 'duet'] as const;
const realScene = (): GameScene | null => {
  const sc = G.scenes.current;
  if (!(sc instanceof GameSceneCls)) return null;
  const k = sc.opt.kind;
  if (k === 'prologue' || k === 'rehearsal' || sc.run.config?.mode !== 'standard') return null;
  return sc;
};
const counts = (p: Player | undefined | null) => !!p && p.input?.kind !== 'bot' && !Lessons.active(p);
function did(id: string, p: Player | undefined | null) {
  if (!counts(p) || !realScene()) return;
  Stats.add('did.' + id, 1);
  Tut.log('did', { id, n: Stats.get('did.' + id) });
}
GameHooks.onRoomStart(({ w }) => {
  const lastRw = new Map<number, number>();
  w.bus.on('rewind', (e) => {
    if ((e.restored ?? 0) > 0) did('undo', e.player);
    if (e.scrub) did('scrub', e.player);
    if (e.player) {
      // tandem: two hands' rewinds within 0.3 s
      lastRw.set(e.player.slot, w.time);
      for (const [s, t] of lastRw) if (s !== e.player.slot && w.time - t <= 0.3) did('tandem', e.player);
    }
  });
  w.bus.on('fork', (e) => did('fork', e.player));
  w.bus.on('hit', (e) => {
    const p = e.player;
    if (!p) return;
    const src = (e.info as { src?: number }).src;
    if (src === p.slot * 2 + 1) { did('echoHit', p); if (e.target.culpritOf?.has(p.slot)) did('culprit', p); }
    if (e.info.counter) did('counter', p);
  });
  w.bus.on('paradox', (e) => {
    did('paradox', e.player);
    if (e.kind === 'pierce') did('pierce', e.player);
    if (e.kind === 'recall') did('recall', e.player);
    if ((e.chain ?? 1) >= 2) did('chain', e.player);
    if (e.duet) did('duet', e.player);
  });
  w.bus.on('sync', (e) => did(e.sources >= 3 ? 'chord' : 'sync', e.player));
  w.bus.on('tickDodge', (e) => did('tick', e.player));
  w.bus.on('perfectRewind', (e) => did('perfect', e.player));
  w.bus.on('revived', (e) => { if (e.source === 'self') did('lastSecond', e.player); if (e.source === 'pullback') did('pullBack', e.by); });
  w.bus.on('custom', (e) => { if (e.id === 'grandfatherParadox') did('grandfather', e.player); });
  // the first violet (fixed) hit: the event lesson waits for the next quiet moment
  w.bus.on('damaged', (e) => {
    if (!e.info.fixed || !e.player || Teach.has('fixed:seen') || !realScene()) return;
    Teach.mark('fixed:seen');
    if (Onboard.isNovice(e.player)) Calm.request('fixed', 'event');
  });
});

// ───────────────────────── recognise it, stop teaching (§5.8) ─────────────────────────
function recognisable(p: Player): string | null {
  for (const id of RECOGNISE) if (!taught(p, id) && Stats.get('did.' + id) >= 2) return id;
  return null;
}
let recogniseWait = 0;
Stage.onUpdate((dt) => {
  const sc = realScene();
  if (!sc || sc.overlays.some((o) => o.blocks)) return;
  recogniseWait = Math.max(0, recogniseWait - dt);
  if (recogniseWait > 0 || !Gates.live || Onboard.mode() !== 'full') return;
  for (const p of sc.world.players) {
    if (!Onboard.isNovice(p) || Lessons.active(p) || !Calm.isCalm(sc, p)) continue;
    // its order (§5.5): a request, an owed lesson and an eligible rule all come first
    if (Calm.queue().length) continue;
    if (Calm.rules().some((r) => !taught(p, Lessons.get(r.id)?.teach ?? r.id) && r.eligible({ run: sc.run, p, scene: sc }))) continue;
    const id = recognisable(p);
    if (!id) continue;
    Calm.spend(sc);
    recogniseWait = 3.5;
    const t = term(id === 'tick' ? 'tickDodge' : id);
    const nm = t ? tr(t.name) : id;
    Stage.say({ key: 'ladder.recognised', slot: p.slot, who: p.input, tier: 'C', dur: 3, text: () => `${tr(C('recognised')).replace('{x}', nm)}${t ? '\n' + tr(t.plain) : ''}` });
    Lessons.complete(id, p, 'recognised');
    Tut.log('recognised', { id, slot: p.slot });
    return;
  }
});

// ───────────────────────── a quiet-moment director until F4a's lands (see lessons/hall.ts) ─────────────────────────
// F4a's calm.ts (day 8) picks a rule's lesson at a quiet moment and starts it on a SoftHost; it
// exports LESSONS_PER_RUN. Until that is in the build this does the same with the Hall's runner, so
// the ladder's lessons can be seen and tested. It never runs alongside F4a's.
const hasDirector = () => (CalmMod as unknown as Record<string, unknown>).LESSONS_PER_RUN !== undefined;
Stage.onUpdate(() => {
  if (hasDirector()) return;
  const sc = realScene();
  if (!sc || sc.overlays.some((o) => o.blocks) || !Gates.live || Onboard.mode() !== 'full') return;
  for (const p of sc.world.players) {
    if (p.input?.kind === 'bot' || !Onboard.isNovice(p) || Lessons.active(p) || !Calm.isCalm(sc, p)) continue;
    const ok = (id: string) => { const d = Lessons.get(id); return !!d && d.where.includes('calm') && !taught(p, d.teach); };
    let id: string | null = null;
    for (const q of Calm.queue()) if (ok(q.id)) { id = q.id; break; }
    if (!id && lessonsThisRun(sc) < 2) for (const r of Calm.rules()) if (ok(r.id) && r.eligible({ run: sc.run, p, scene: sc })) { id = r.id; break; }
    if (!id) continue;
    Calm.take(id);
    Calm.spend(sc);
    sc.run.flags['onboard.lessons'] = lessonsThisRun(sc) + 1;
    const host = makeHost(sc.world, p);
    if (realRunner()) Lessons.start(id, p, 'calm', host);
    else new HallRunner(Lessons.get(id)!, p, 'calm', host);
    Tut.log('calmStart', { id, room: sc.run.roomIndex, by: 'ladder' });
    return;
  }
});

// ───────────────────────── debug presets ─────────────────────────
/** what each stage of the ladder has taught (ONBOARD2 §5.2) */
const STAGES: string[][] = [
  ['move', 'attack', 'dash', 'undo', 'echo', 'paradox', 'hall.undo', 'hall.echo', 'hall.paradox'],
  ['fork', 'hall.fork'], ['scrub', 'hall.scrub'], ['sync', 'culprit', 'hall.sync', 'hall.culprit'], ['tick', 'chain', 'hall.tick', 'hall.chain'], ['perfect', 'pierce'],
];
/** the earliest run of each stage */
const STAGE_RUNS = [0, 1, 1, 2, 3, 4];
registerDebugRoute('onboard=stage|runs', (q) => {
  const n = q.get('onboard') === 'stage' ? Math.max(0, Math.min(5, Number(q.get('stage') ?? 1))) : -1;
  if (n >= 0) {
    profile.prologueDone = true;
    for (let i = 0; i < n && i < STAGES.length; i++) for (const id of STAGES[i]) if (!profile.taught.includes(id)) profile.taught.push(id);
    profile.runs = Math.max(profile.runs, STAGE_RUNS[n] ?? 0);
    if (n >= 4) profile.stats['did.paradox'] = Math.max(profile.stats['did.paradox'] ?? 0, 3);
    if (n >= 5) profile.stats['did.undo'] = Math.max(profile.stats['did.undo'] ?? 0, 10);
    Tut.log('preset', { stage: n, runs: profile.runs });
  }
  const r = q.get('runs');
  if (r !== null && r !== '') profile.runs = Number(r) || 0;
  return false;
});

Tut.register('ladder', {
  rules: () => Calm.rules().map((r) => r.id),
  recognisable: () => { const p = realScene()?.world.players[0]; return p ? recognisable(p) : null; },
  did: (id: string) => Stats.get('did.' + id),
});
