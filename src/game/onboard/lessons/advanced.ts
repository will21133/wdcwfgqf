// Advanced and event lessons (ONBOARD2 §5.7) and the Hall's co-op lessons (§8.8). Each is one
// standard LessonDef: intro → (demo) → try steps → success, shared by the after-fight lessons
// (Calm, from ladder.ts) and the Rehearsal Hall. Props stand in front of the hand (at(48, 0) …), so
// a lesson lays out the same in a cleared room and on the Hall's stage.
//
// Also here: the Hall's versions of the five basic lessons, defined only when F4a's own (core.ts /
// inrun.ts) are not in the build, and the lesson board's catalogue (groups, unlock rules, rewards,
// the loop each row previews).
import type { Player } from '../../entities/player';
import type { L10n } from '../../i18n';
import type { LessonDef, LessonEvent, LessonCtx } from '../lesson';
import { S, term } from '../../strings';
import { Teach } from '../../meta/registry';
import { profile } from '../../save';
import { Lessons } from '../lesson';
import { Onboard } from '../core';
import { STRIP } from '../modelStrip';
import { HallDummy, BellJarProp, DuetBellProp, FallingGearProp, FloorMark, GateHolder } from './hall';
import '../../strings/coach';

const O = (k: string): L10n => S('onboard', k);
const C = (k: string): L10n => S('coach', k);
const mine = (ev: LessonEvent, p: Player) => !('player' in (ev.e as object)) || (ev.e as { player?: Player }).player === p;
const isEchoHit = (ev: LessonEvent, p: Player) => ev.type === 'hit' && (ev.e.info as { src?: number }).src === p.slot * 2 + 1;
function dummy(c: LessonCtx, dx: number, dy: number, mode: 'idle' | 'punch' | 'slowPunch' | 'violet', hp?: number): HallDummy {
  const q = c.at(dx, dy);
  const d = c.spawn(new HallDummy(q.x, q.y, mode, hp));
  return d;
}
const adv = (id: string): Pick<LessonDef, 'success'> => ({ success: { stamp: O(`b.${id}.stamp`), why: O(`b.${id}.why`) } });

// ───────────────────────── advanced ─────────────────────────
const SYNC: LessonDef = {
  id: 'sync', teach: 'sync', term: 'sync', where: ['calm', 'hall'], sand: 'refill',
  intro: { lines: [O('b.sync.i1')], dur: 2.2 },
  props: (c) => { const q = c.at(40, -8); c.spawn(new DuetBellProp(q.x, q.y)); },
  steps: [
    { key: 'b.sync.s1', until: (ev, c) => ev.type === 'rewind' && mine(ev, c.p) },
    { key: 'b.sync.s2', done: (ev, c) => ev.type === 'sync' && ev.e.player === c.p,
      fail: (ev, c) => (ev.type === 'echoEnd' && ev.e.player === c.p && !ev.e.paradox ? O('b.sync.miss') : null) },
  ],
  ...adv('sync'),
};
const CULPRIT: LessonDef = {
  id: 'culprit', teach: 'culprit', term: 'culprit', where: ['calm', 'hall'], sand: 'refill',
  intro: { lines: [O('b.culprit.i1')], dur: 2.2 },
  props: (c) => { dummy(c, 30, -6, 'punch'); c.spawn(new GateHolder({ name: 'lesson:culprit', p: c.p, shows: () => true })); },
  steps: [
    { key: 'b.culprit.s1', until: (ev, c) => ev.type === 'rewind' && mine(ev, c.p) && (ev.e.restored ?? 0) > 0,
      fail: (ev, c) => (ev.type === 'rewind' && mine(ev, c.p) && (ev.e.restored ?? 0) === 0 ? O('b.culprit.miss') : null) },
    { key: 'b.culprit.s2', done: (ev, c) => isEchoHit(ev, c.p) && ev.type === 'hit' && ev.e.target.culpritOf.has(c.p.slot) },
  ],
  ...adv('culprit'),
};
const TICK: LessonDef = {
  id: 'tick', teach: 'tick', term: 'tickDodge', where: ['calm', 'hall'], sand: 'refill',
  intro: { lines: [O('b.tick.i1')], dur: 2.2 },
  props: (c) => { const d = dummy(c, 28, -4, 'slowPunch'); d.every = 1.2; },
  steps: [
    { key: 'b.tick.s1', done: (ev, c) => ev.type === 'tickDodge' && ev.e.player === c.p,
      fail: (ev, c) => (ev.type === 'damaged' && ev.e.player === c.p ? O('b.tick.late') : null),
      hint: (c) => { const w = c.w; const d = w.enemies.find((e) => e instanceof HallDummy) as HallDummy | undefined; return d && d.state === 'wind' && d.windupK < 0.7 && c.p.dashT > 0 ? O('b.tick.early') : null; } },
  ],
  ...adv('tick'),
};
const CHAIN: LessonDef = {
  id: 'chain', teach: 'chain', term: 'chain', where: ['calm', 'hall'], sand: 'refill', verbs: { fork: true },
  intro: { lines: [O('b.chain.i1')], dur: 2.2 },
  props: (c) => {
    dummy(c, 56, -28, 'idle'); dummy(c, 56, 28, 'idle');
    const a = c.at(36, -12), b = c.at(36, 12);
    c.spawn(new FloorMark(a.x, a.y)); c.spawn(new FloorMark(b.x, b.y));
  },
  steps: [
    { key: 'b.chain.s1', until: (ev, c) => ev.type === 'echoArmed' && ev.e.player === c.p && c.p.echoes.filter((e) => !e.dead && e.armed).length >= 2 },
    { key: 'b.chain.s2', done: (ev, c) => ev.type === 'paradox' && ev.e.player === c.p && (ev.e.chain ?? 1) >= 2,
      fail: (ev, c) => (ev.type === 'paradox' && ev.e.player === c.p && (ev.e.chain ?? 1) < 2 ? O('b.chain.far') : null) },
  ],
  ...adv('chain'),
};
const PERFECT: LessonDef = {
  id: 'perfect', teach: 'perfect', term: 'perfect', where: ['calm', 'hall'], sand: 'refill',
  intro: { lines: [O('b.perfect.i1')], dur: 2.2 },
  props: (c) => { const d = dummy(c, 28, -4, 'slowPunch'); d.every = 1.2; },
  steps: [
    { key: 'b.perfect.s1', done: (ev, c) => ev.type === 'perfectRewind' && ev.e.player === c.p,
      fail: (ev, c) => (ev.type === 'damaged' && ev.e.player === c.p ? O('b.perfect.late') : ev.type === 'rewind' && mine(ev, c.p) && !ev.e.perfect && (ev.e.restored ?? 0) === 0 ? O('b.perfect.early') : null) },
  ],
  ...adv('perfect'),
};
const PIERCE: LessonDef = {
  id: 'pierce', teach: 'pierce', term: 'pierce', where: ['calm', 'hall'], sand: 'refill', verbs: { fork: true },
  intro: { lines: [O('b.pierce.i1')], dur: 2.2 },
  props: (c) => { dummy(c, 72, 0, 'idle'); },
  steps: [
    { key: 'b.pierce.s1', until: (ev, c) => ev.type === 'echoArmed' && ev.e.player === c.p },
    { key: 'b.pierce.s2', done: (ev, c) => ev.type === 'paradox' && ev.e.player === c.p && ev.e.kind === 'pierce',
      fail: (ev, c) => (ev.type === 'paradox' && ev.e.player === c.p && ev.e.kind === 'overlap' ? O('b.pierce.plain') : null) },
  ],
  ...adv('pierce'),
};
const FIXED: LessonDef = {
  id: 'fixed', teach: 'fixed', term: 'fixed', where: ['calm', 'hall'], sand: 'refill',
  intro: { lines: [O('b.fixed.i1')], dur: 2.2 },
  props: (c) => { const d = dummy(c, 64, -10, 'violet'); d.every = 2.2; d.cd = 0.6; },
  steps: [
    { key: 'b.fixed.s1', done: (ev, c) => ev.type === 'rewind' && mine(ev, c.p) && c.p.fixedTaken > 0,
      until: () => false },
  ],
  ...adv('fixed'),
};
const LAST_SECOND: LessonDef = {
  id: 'lastSecond', teach: 'lastSecond', where: ['hall'], sand: 'refill',
  intro: { lines: [O('b.lastSecond.i1')], dur: 2.2 },
  props: (c) => { c.p.hp = Math.min(c.p.hp, 5); const d = dummy(c, 26, -4, 'punch'); d.punchDmg = 10; d.every = 2.2; c.vars.lastSecond = 1; },
  steps: [
    { key: 'b.lastSecond.s1', done: (ev, c) => ev.type === 'revived' && ev.e.player === c.p && ev.e.source === 'self' },
  ],
  ...adv('lastSecond'),
};
const RECALL: LessonDef = {
  id: 'recall', teach: 'recall', term: 'recall', where: ['calm', 'hall'], sand: 'refill', verbs: { fork: true },
  intro: { lines: [O('b.recall.i1')], dur: 2.2 },
  props: (c) => { for (const dy of [-20, 0, 20]) dummy(c, 40, dy, 'idle'); const m = c.at(80, 0); c.spawn(new FloorMark(m.x, m.y)); },
  steps: [
    { key: 'b.recall.s1', done: (ev, c) => ev.type === 'paradox' && ev.e.player === c.p && ev.e.kind === 'recall' },
  ],
  ...adv('recall'),
};
const GRANDFATHER: LessonDef = {
  id: 'grandfather', teach: 'grandfather', term: 'grandfather', where: ['hall'], sand: 'refill',
  intro: { lines: [O('b.grandfather.i1')], dur: 2.2 },
  props: (c) => { const d = dummy(c, 30, -6, 'punch', 40); d.heals = false; c.spawn(new GateHolder({ name: 'lesson:grandfather', p: c.p, shows: () => true })); },
  steps: [
    { key: 'b.grandfather.s1', done: (ev, c) => ev.type === 'custom' && ev.e.id === 'grandfatherParadox' && ev.e.player === c.p },
  ],
  ...adv('grandfather'),
};
// ── co-op (§8.8): either hand's success counts for the pair ──
const DUET: LessonDef = {
  id: 'duet', teach: 'duet', term: 'duet', where: ['hall'], sand: 'refill', verbs: { fork: true },
  props: (c) => { dummy(c, 0, -48, 'idle'); },
  steps: [{ key: 'b.duet.s1', done: (ev) => ev.type === 'paradox' && !!ev.e.duet }],
  ...adv('duet'),
};
const PULLBACK: LessonDef = {
  id: 'pullBack', teach: 'pullBack', where: ['hall'], sand: 'refill',
  props: (c) => {
    const mate = c.w.players.find((q) => q !== c.p);
    if (mate) { mate.hp = 1; const q = { x: mate.x + 20, y: mate.y - 4 }; const d = c.spawn(new HallDummy(q.x, q.y, 'punch')); d.punchDmg = 10; d.every = 1; }
  },
  steps: [{ key: 'b.pullBack.s1', done: (ev) => ev.type === 'revived' && ev.e.source === 'pullback' }],
  ...adv('pullBack'),
};
const TANDEM: LessonDef = {
  id: 'tandem', teach: 'tandem', where: ['hall'], sand: 'refill',
  props: (c) => { dummy(c, 0, -48, 'punch'); c.vars.rw = {}; },
  steps: [{ key: 'b.tandem.s1', done: (ev, c) => {
    if (ev.type !== 'rewind' || !ev.e.player) return false;
    const rw = c.vars.rw as Record<number, number>;
    rw[ev.e.player.slot] = c.w.time;
    const ts = Object.values(rw);
    return ts.length >= 2 && Math.max(...ts) - Math.min(...ts) <= 0.3;
  } }],
  ...adv('tandem'),
};

// ───────────────────────── the basics (only if F4a's are not in the build) ─────────────────────────
const BASICS: LessonDef[] = [
  { id: 'undo', teach: 'undo', term: 'rewind', where: ['hall'], sand: 'refill', reward: 0,
    props: (c) => { dummy(c, 26, -4, 'punch'); },
    steps: [{ key: 'b.undo.s1', done: (ev, c) => ev.type === 'rewind' && mine(ev, c.p) && (ev.e.restored ?? 0) > 0 }],
    success: { stamp: O('b.undo.stamp'), why: O('b.undo.why'), strip: STRIP.undo } },
  { id: 'echo', teach: 'echo', term: 'echo', where: ['hall'], sand: 'refill', reward: 0,
    props: (c) => { dummy(c, 26, -4, 'punch'); },
    steps: [{ key: 'b.echo.s1', done: (ev, c) => isEchoHit(ev, c.p) }],
    success: { stamp: O('b.echo.stamp'), why: O('b.echo.why'), strip: STRIP.echo } },
  { id: 'paradox', teach: 'paradox', term: 'paradox', where: ['hall'], sand: 'refill', reward: 0,
    props: (c) => { const j = c.at(40, -10); c.spawn(new BellJarProp(j.x, j.y)); dummy(c, 70, -30, 'punch'); },
    steps: [{ key: 'b.paradox.s1', done: (ev, c) => ev.type === 'custom' && ev.e.id === 'propBroken' && (!ev.e.player || ev.e.player === c.p) }],
    success: { stamp: O('b.paradox.stamp'), why: O('b.paradox.why'), strip: STRIP.paradox } },
  { id: 'fork', teach: 'fork', term: 'fork', where: ['calm', 'hall'], sand: 'refill', verbs: { fork: true },
    props: (c) => { const j = c.at(48, -6); c.spawn(new BellJarProp(j.x, j.y)); },
    steps: [
      { key: 'b.fork.s1', until: (ev, c) => ev.type === 'fork' && ev.e.player === c.p },
      { key: 'b.fork.s2', until: (ev, c) => ev.type === 'echoArmed' && ev.e.player === c.p },
      { key: 'b.fork.s3', done: (ev, c) => ev.type === 'custom' && ev.e.id === 'propBroken' && (!ev.e.player || ev.e.player === c.p) },
    ],
    success: { stamp: O('b.fork.stamp'), why: O('b.fork.why') } },
  { id: 'scrub', teach: 'scrub', term: 'scrub', where: ['calm', 'hall'], sand: 'refill', verbs: { scrub: true },
    props: (c) => {
      const a = c.at(0, 0), b = c.at(24, 0);
      const g1 = c.spawn(new FallingGearProp(a.x, a.y, 1.6)); void g1;
      c.spawn(new FallingGearProp(b.x, b.y, 2.6));
    },
    steps: [{ key: 'b.scrub.s1',
      done: (ev, c) => ev.type === 'rewind' && mine(ev, c.p) && !!ev.e.scrub && (ev.e.restored ?? 0) >= 8,
      fail: (ev, c) => (ev.type === 'rewind' && mine(ev, c.p) ? (!ev.e.scrub ? O('b.scrub.tap') : (ev.e.restored ?? 0) === 0 ? O('b.scrub.short') : null) : null) }],
    success: { stamp: O('b.scrub.stamp'), why: O('b.scrub.why') } },
];

for (const d of [SYNC, CULPRIT, TICK, CHAIN, PERFECT, PIERCE, FIXED, LAST_SECOND, RECALL, GRANDFATHER, DUET, PULLBACK, TANDEM]) Lessons.define(d);
for (const d of BASICS) if (!Lessons.get(d.id)) Lessons.define(d);

// ───────────────────────── the lesson board's catalogue (ONBOARD2 §8.3, §8.5) ─────────────────────────
export type HallGroup = 'prologue' | 'basics' | 'combos' | 'timing' | 'know' | 'coop' | 'combat';
export interface HallRow {
  id: string;
  group: HallGroup;
  /** the loop the board and the curtain play for it */
  loop: 'undo' | 'echo' | 'paradox' | 'scrub' | 'fork' | 'sand';
  /** shards for ✓ (0 = paid by the prologue) and for ★ (0 = no trial) */
  tick: number; star: number;
  /** can it be started? (else the reason) */
  unlocked(p: Player | null): { ok: boolean; why?: L10n };
  coop?: boolean;
}
const fill = (l: L10n, v: Record<string, string | number>): L10n => {
  const f = (s: string) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  return { zh: f(l.zh), en: f(l.en) };
};
const ok = { ok: true };
const after = (n: number) => (profile.runs >= n ? ok : { ok: false, why: fill(C('hallLockRuns'), { n }) });
const needs = (p: Player | null, id: string) => (Onboard.learned(p, id) || Teach.has('hall.' + id) ? ok : { ok: false, why: fill(C('hallLockFirst'), { x: nameOf(id) }) });
const both = (...r: { ok: boolean; why?: L10n }[]) => r.find((x) => !x.ok) ?? ok;
/** rows with their own name / plain / when-why lines in the 'coach' table (no TERMS entry, or a longer name) */
const OWN_NAME = new Set(['lastSecond', 'undo', 'grandfather', 'duet', 'pullBack', 'tandem', 'heavy', 'interrupt', 'break', 'reverse']);
export const OWN_PLAIN = new Set(['lastSecond']);
export const HAS_WHEN = new Set(['undo', 'echo', 'paradox', 'fork', 'scrub', 'sync', 'culprit', 'grandfather', 'tick', 'chain', 'perfect', 'pierce', 'recall', 'fixed', 'lastSecond', 'duet', 'pullBack', 'tandem']);
export function nameOf(id: string): string {
  if (OWN_NAME.has(id)) return tr2(S('coach', 'n.' + id));
  const t = term(id === 'tick' ? 'tickDodge' : id);
  return t ? tr2(t.name) : id;
}
import { tr } from '../../i18n';
const tr2 = (l: L10n) => tr(l);
export const HALL_ROWS: HallRow[] = [
  { id: 'prologue', group: 'prologue', loop: 'undo', tick: 0, star: 0, unlocked: () => ok },
  { id: 'undo', group: 'basics', loop: 'undo', tick: 0, star: 5, unlocked: () => ok },
  { id: 'echo', group: 'basics', loop: 'echo', tick: 0, star: 5, unlocked: () => ok },
  { id: 'paradox', group: 'basics', loop: 'paradox', tick: 0, star: 5, unlocked: () => ok },
  { id: 'fork', group: 'basics', loop: 'fork', tick: 3, star: 5, unlocked: () => ok },
  { id: 'scrub', group: 'basics', loop: 'scrub', tick: 3, star: 5, unlocked: (p) => needs(p, 'fork') },
  { id: 'sync', group: 'combos', loop: 'echo', tick: 3, star: 10, unlocked: (p) => both(needs(p, 'scrub'), after(1)) },
  { id: 'culprit', group: 'combos', loop: 'echo', tick: 3, star: 0, unlocked: (p) => needs(p, 'sync') },
  { id: 'chain', group: 'combos', loop: 'paradox', tick: 3, star: 10, unlocked: (p) => needs(p, 'tick') },
  { id: 'pierce', group: 'combos', loop: 'paradox', tick: 3, star: 10, unlocked: (p) => needs(p, 'perfect') },
  { id: 'recall', group: 'combos', loop: 'fork', tick: 3, star: 10, unlocked: (p) => ((p?.mods.recall ?? 0) >= 1 ? ok : { ok: false, why: C('hallLockRecall') }) },
  { id: 'grandfather', group: 'combos', loop: 'paradox', tick: 3, star: 10, unlocked: (p) => both(needs(p, 'culprit'), needs(p, 'fork')) },
  { id: 'tick', group: 'timing', loop: 'undo', tick: 3, star: 5, unlocked: (p) => both(needs(p, 'culprit'), after(2)) },
  { id: 'perfect', group: 'timing', loop: 'undo', tick: 3, star: 10, unlocked: (p) => both(needs(p, 'chain'), after(3)) },
  { id: 'lastSecond', group: 'timing', loop: 'undo', tick: 3, star: 5, unlocked: () => (profile.deaths >= 1 || profile.runs >= 2 ? ok : { ok: false, why: C('hallLockEvent') }) },
  { id: 'fixed', group: 'know', loop: 'sand', tick: 3, star: 0, unlocked: () => (Teach.has('fixed:seen') || profile.runs >= 3 ? ok : { ok: false, why: C('hallLockEvent') }) },
  { id: 'duet', group: 'coop', loop: 'paradox', tick: 3, star: 0, coop: true, unlocked: () => ok },
  { id: 'pullBack', group: 'coop', loop: 'undo', tick: 3, star: 0, coop: true, unlocked: () => ok },
  { id: 'tandem', group: 'coop', loop: 'undo', tick: 3, star: 0, coop: true, unlocked: () => ok },
  { id: 'heavy', group: 'combat', loop: 'echo', tick: 3, star: 0, unlocked: () => ({ ok: false, why: C('hallLockSoon') }) },
  { id: 'interrupt', group: 'combat', loop: 'echo', tick: 3, star: 0, unlocked: () => ({ ok: false, why: C('hallLockSoon') }) },
  { id: 'break', group: 'combat', loop: 'echo', tick: 3, star: 10, unlocked: () => ({ ok: false, why: C('hallLockSoon') }) },
  { id: 'reverse', group: 'combat', loop: 'echo', tick: 3, star: 10, unlocked: () => ({ ok: false, why: C('hallLockSoon') }) },
];
export const GROUP_KEY: Record<HallGroup, string> = { prologue: 'hallGroupPrologue', basics: 'hallGroupBasics', combos: 'hallGroupCombos', timing: 'hallGroupTiming', know: 'hallGroupKnow', coop: 'hallGroupCoop', combat: 'hallGroupCombat' };
void FallingGearProp;
