// Mastery prompts (ONBOARD2 §6.10; the answer to "it's hard to pull off particular mechanics and
// combos"): once a move is learned but rarely used, say so at the moment it would work right now.
//
//   A  in-run chance     the situation for a learned verb is on screen now (tier C, two lines, a token)
//   B  after the fact    "a hair earlier and …" at the next quiet second (Tick-Dodge, Perfect Rewind)
//   C  the run's recap   "this run: undo ×7 · Echo hits ×23 · Paradox ×3" (death card, victory)
//   D  today's drill     one move to practise (the Hall arch's plate, a pin on the lesson board)
//
// Throttle: one a room, three a run (from run 2; run 1 only Fork / Scrub), 45 s between, never in
// a boss intro, below 25% HP, over a busy rail or a note. Only verbs taught and used < 3 times;
// ignored three times → no more in-run prompts for it (C and D still name it).
import type { Player } from '../../entities/player';
import type { World } from '../../world/world';
import type { BusEvents } from '../../systems/bus';
import type { L10n } from '../../i18n';
import { G } from '../../G';
import { S, term } from '../../strings';
import { tr } from '../../i18n';
import { Flags, Stats, Teach } from '../../meta/registry';
import { profile } from '../../save';
import { GameHooks } from '../../hooks';
import { GameScene } from '../../scenes/game';
import { Hints } from '../../ui/hints';
import { Paradox } from '../../systems/paradox';
import { Onboard, Tut } from '../core';
import { Stage } from '../stage';
import { coachable, say, clog } from './coach';
import { calm } from './detectors';

const C = (k: string): L10n => S('coach', k);
const sceneOf = () => (G.scenes.current instanceof GameScene ? G.scenes.current : null);

/** verb → its two lines */
const LINES: Record<string, [string, string]> = {
  fork: ['mFork1', 'mFork2'], paradox: ['mParadox1', 'mParadox2'], sync: ['mSync1', 'mSync2'], culprit: ['mCulprit1', 'mCulprit2'],
  chain: ['mChain1', 'mChain2'], pierce: ['mPierce1', 'mPierce2'], recall: ['mRecall1', 'mRecall2'], scrub: ['mScrub1', 'mScrub2'],
  duet: ['mDuet1', 'mDuet2'], tick: ['mTick1', 'mTick2'], perfect: ['mPerfect1', 'mPerfect2'],
};
/** the move's short name for the recap / drill (TERMS name where there is one) */
const TERM_OF: Record<string, string> = { undo: 'rewind', echo: 'echo', paradox: 'paradox', fork: 'fork', scrub: 'scrub', sync: 'sync', culprit: 'culprit', tick: 'tickDodge', chain: 'chain', perfect: 'perfect', pierce: 'pierce', recall: 'recall', duet: 'duet', fixed: 'fixed' };
export function verbName(v: string): L10n {
  if (v === 'lastSecond') return C('n.lastSecond');
  const t = term(TERM_OF[v] ?? v);
  return t ? t.name : { zh: v, en: v };
}

const ROOM_MAX = 1, RUN_MAX = 3, COOLDOWN = 45, WATCH_T = 10;
let runCount = 0;
let lastPromptReal = -999;
const roomDone = new WeakSet<World>();
/** a prompt waiting to be followed: verb, real time shown */
let watching: { verb: string; t: number; p: Player } | null = null;
/** after-the-fact prompts waiting for a quiet second */
let after: { verb: string; p: Player; t: number } | null = null;
/** what this hand hit last (fork's "just swung") */
const lastSwing = new Map<number, { t: number; target: { x: number; y: number; dead: boolean } }>();
/** two hits within 1 s (scrub) */
const lastHits = new Map<number, number[]>();
let pollT = 0;

// ── this run's recap ──
export const runStats = { undo: 0, echoHits: 0, paradox: 0, firsts: [] as string[], missed: new Set<string>() };
GameHooks.onRunStart(() => { runCount = 0; runStats.undo = 0; runStats.echoHits = 0; runStats.paradox = 0; runStats.firsts = []; runStats.missed.clear(); });
Teach.onMark((id) => { if (TERM_OF[id] && !runStats.firsts.includes(id) && sceneOf()) runStats.firsts.push(id); });

/** may a mastery prompt about `verb` show for this hand now? */
function allowed(p: Player, verb: string, w: World): boolean {
  if (!coachable(p) || Onboard.mode() !== 'full' || !Onboard.isNovice(p)) return false;
  const sc = sceneOf();
  if (!sc || sc.opt.kind === 'prologue' || sc.opt.kind === 'rehearsal') return false;
  if (!Onboard.taught(p, verb) || Stats.get('did.' + verb) >= 3) return false;
  if (Flags.get('prompt.ignored.' + verb) >= 3) return false;
  const run1 = profile.runs <= 1;
  if (run1 && verb !== 'fork' && verb !== 'scrub') return false;
  if (roomDone.has(w) || runCount >= RUN_MAX || G.time - lastPromptReal < COOLDOWN) return false;
  if (sc.boss && (sc.boss.inIntro || sc.t < 10)) return false;
  if (p.hp < 0.25 * p.maxHp || Hints.active || Stage.current(p.slot)) return false;
  return true;
}
function prompt(p: Player, verb: string) {
  const w = p.world;
  const [a, b] = LINES[verb];
  roomDone.add(w); runCount++; lastPromptReal = G.time;
  Flags.inc('prompt.shown.' + verb);
  say({ key: 'coach.mastery', slot: p.slot, who: p.input, tier: 'C', text: () => `${tr(C(a))}\n${tr(C(b))}`, dur: 2.4, maxWait: 1 });
  clog('prompt', { det: 'mastery:' + verb, slot: p.slot });
  watching = { verb, t: G.time, p };
}
/** the verb was just done: a watched prompt was followed */
function did(verb: string, p?: Player) {
  if (watching && watching.verb === verb && (!p || watching.p === p)) { clog('followed', { det: 'mastery:' + verb }); watching = null; }
}

// ── the predicates (each 0.2 s, existing APIs only) ──
type Pred = (p: Player, w: World) => boolean;
const own = (p: Player) => p.echoes.filter((e) => !e.dead);
const PREDS: Record<string, Pred> = {
  fork(p, w) {
    if (!p.canFork().ok || own(p).length) return false;
    const s = lastSwing.get(p.slot);
    return !!s && w.time - s.t <= 1.5 && !s.target.dead && Math.hypot(s.target.x - p.x, s.target.y - p.y) <= 40;
  },
  paradox(p, w) {
    const pv = Paradox.preview(p);
    if (!pv || pv.kind !== 'circle') return false;
    return w.enemies.some((e) => !e.dead && Math.hypot(e.x - pv.x, e.y - pv.y) <= (pv.r ?? 48));
  },
  sync(p, w) {
    for (const e of own(p)) for (const c of e.cues()) {
      if (c.kind !== 'attack' || c.t < 0.4 || c.t > 1.2) continue;
      const foe = w.enemies.find((q) => !q.dead && Math.hypot(q.x - c.x, q.y - c.y) <= 20);
      if (foe && Math.hypot(foe.x - p.x, foe.y - p.y) <= 60) return true;
    }
    return false;
  },
  culprit(p, w) {
    const foes = w.enemies.filter((e) => !e.dead && e.culpritOf.has(p.slot));
    if (!foes.length) return false;
    for (const e of own(p)) {
      const fr = e.rec.frames;
      for (let k = e.i; k < Math.min(fr.length, e.i + 90); k += 6) if (foes.some((q) => Math.hypot(q.x - fr[k].x, q.y - fr[k].y) <= 24)) return true;
    }
    return false;
  },
  chain(p) {
    const es = own(p).filter((e) => e.phase !== 'recall');
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) if (Math.hypot(es[i].x - es[j].x, es[i].y - es[j].y) <= 48) return true;
    return false;
  },
  pierce(p, w) {
    if (p.dashCharges <= 0) return false;
    for (const e of own(p)) {
      if (!e.armed) continue;
      const ax = e.x - p.x, ay = e.y - p.y, da = Math.hypot(ax, ay);
      if (da < 12) continue;
      for (const q of w.enemies) {
        if (q.dead) continue;
        const bx = q.x - p.x, by = q.y - p.y, db = Math.hypot(bx, by);
        if (db <= da || db - da > 80) continue;
        const cos = (ax * bx + ay * by) / (da * db);
        if (cos >= Math.cos((15 * Math.PI) / 180)) return true;
      }
    }
    return false;
  },
  recall(p, w) {
    if (p.mods.recall < 1) return false;
    const es = own(p).filter((e) => e.armed);
    if (es.length < 2) return false;
    let n = 0;
    for (const q of w.enemies) {
      if (q.dead) continue;
      if (es.some((e) => segDist(q.x, q.y, e.x, e.y, p.x, p.y) <= 12 && Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(e.x - p.x, e.y - p.y))) n++;
    }
    return n >= 2;
  },
  scrub(p, w) {
    const h = lastHits.get(p.slot);
    if (!h || h.length < 2 || h[h.length - 1] - h[h.length - 2] > 1) return false;
    return w.time - h[h.length - 1] < 1.2 && p.canRewind().ok && p.rewindPreview().hpGain > 0;
  },
  duet(p, w) {
    if (w.playerCount < 2) return false;
    for (const q of w.players) {
      if (q === p) continue;
      for (const e of q.echoes) if (!e.dead && e.armed && Math.hypot(e.x - p.x, e.y - p.y) <= 56 && w.enemies.some((f) => !f.dead && Math.hypot(f.x - e.x, f.y - e.y) <= 60)) return true;
    }
    return false;
  },
};
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// ── the room's events: what was done (the verbs), what was nearly done (after-the-fact) ──
GameHooks.onRoomStart(({ w }) => {
  lastSwing.clear(); lastHits.clear(); after = null;
  w.bus.on('hit', (e: BusEvents['hit']) => {
    const p = e.player;
    if (!p) return;
    const src = (e.info as { src?: number }).src;
    if (src === p.slot * 2) lastSwing.set(p.slot, { t: w.time, target: e.target });
    if (src === p.slot * 2 + 1) { runStats.echoHits++; if (e.target.culpritOf?.has(p.slot)) did('culprit', p); }
  });
  w.bus.on('fork', (e) => did('fork', e.player));
  w.bus.on('paradox', (e) => {
    if (e.player && e.player.input.kind !== 'bot') runStats.paradox++;
    did('paradox', e.player);
    if (e.kind === 'pierce') did('pierce', e.player);
    if (e.kind === 'recall') did('recall', e.player);
    if ((e.chain ?? 1) >= 2) did('chain', e.player);
    if (e.duet) did('duet', e.player);
  });
  w.bus.on('sync', (e) => did('sync', e.player));
  w.bus.on('damaged', (e) => {
    const p = e.player;
    if (!p) return;
    const h = lastHits.get(p.slot) ?? [];
    h.push(w.time); if (h.length > 3) h.shift();
    lastHits.set(p.slot, h);
    // B: a melee blow taken with a dash in hand while its windup had flashed white within 40 px → Tick-Dodge
    const by = e.info.owner as { interruptWindow?: boolean; x: number; y: number } | null | undefined;
    if (e.info.kind === 'melee' && p.dashCharges > 0 && by && Math.hypot(by.x - p.x, by.y - p.y) <= 40 && Onboard.taught(p, 'tick')) after = { verb: 'tick', p, t: G.time };
  });
  w.bus.on('rewind', (e) => {
    const p = e.player;
    if (!p) return;
    if ((e.restored ?? 0) > 0 && p.input.kind !== 'bot') runStats.undo++;
    if (e.scrub && (e.restored ?? 0) > 0) did('scrub', p);
    // B: a quick undo (≤ 0.35 s after the hit) → "a hair earlier = Sand refunded"
    const h = lastHits.get(p.slot);
    if ((e.restored ?? 0) > 0 && !e.perfect && h && h.length && w.time - h[h.length - 1] <= 0.35 + 0.25 && Onboard.taught(p, 'perfect')) after = { verb: 'perfect', p, t: G.time };
  });
});

// ── the poll ──
Stage.onUpdate((dt) => {
  const sc = sceneOf();
  const w = sc?.world;
  if (!sc || !w || sc.overlays.some((o) => o.blocks)) return;
  if (watching && G.time - watching.t > WATCH_T) {
    Flags.inc('prompt.ignored.' + watching.verb);
    runStats.missed.add(watching.verb);
    watching = null;
  }
  pollT -= dt;
  if (pollT > 0) return;
  pollT = 0.2;
  for (const p of w.players) {
    if (p.state !== 'alive' || p.rw) continue;
    if (after && after.p === p && G.time - after.t >= 1 && calm(p) && allowed(p, after.verb, w)) { const v = after.verb; after = null; prompt(p, v); continue; }
    if (after && G.time - after.t > 20) after = null;
    for (const verb of ['fork', 'paradox', 'sync', 'culprit', 'chain', 'pierce', 'recall', 'scrub', 'duet']) {
      if (!allowed(p, verb, w)) continue;
      let ok = false;
      try { ok = PREDS[verb](p, w); } catch { ok = false; }
      if (ok) { prompt(p, verb); break; }
    }
  }
});

// ── C and D ──
/** the next move worth practising (ONBOARD2 §6.10 "today's drill") */
export function todaysDrill(deathLesson?: string | null): string | null {
  const all = ['undo', 'echo', 'paradox', 'fork', 'scrub', 'sync', 'culprit', 'tick', 'chain', 'perfect', 'pierce'];
  // learned ones plus the next one on the ladder
  const learned = all.filter((v) => Teach.has(v));
  const next = all.find((v) => !Teach.has(v));
  const cands = next ? [...learned, next] : learned;
  // what would have saved this hand is always a candidate (a fresh profile's "next" is only undo);
  // a verb only: "try Fixed Damage" means nothing
  if (deathLesson && (all.includes(deathLesson) || deathLesson === 'lastSecond') && !cands.includes(deathLesson)) cands.push(deathLesson);
  let best: string | null = null, bs = -Infinity;
  for (const v of cands) {
    let s = 3 - Math.min(3, Stats.get('did.' + v));
    if (runStats.missed.has(v)) s += 1;
    if (deathLesson === v) s += 2;
    if (Flags.get('prompt.ignored.' + v) >= 3) s -= 2;
    if (s > bs) { bs = s; best = v; }
  }
  return best;
}
/** the run's recap lines (ONBOARD2 §6.10 C): what you did, first times, what to try next */
export function recapLines(deathLesson?: string | null): string[] {
  const out: string[] = [];
  const v = (k: string, vars: Record<string, string | number>) => tr(C(k)).replace(/\{(\w+)\}/g, (m, n) => (n in vars ? String(vars[n]) : m));
  const parts: string[] = [];
  if (runStats.undo) parts.push(v('recapUndo', { n: runStats.undo }));
  if (runStats.echoHits) parts.push(v('recapEchoHits', { n: runStats.echoHits }));
  if (runStats.paradox) parts.push(v('recapParadox', { n: runStats.paradox }));
  if (parts.length) out.push(v('recapDid', { list: parts.join(' · ') }));
  if (runStats.firsts.length) out.push(v('recapFirst', { list: runStats.firsts.map((f) => tr(verbName(f))).join(tr({ zh: '、', en: ', ' })) }));
  const d = todaysDrill(deathLesson);
  if (d) out.push(v('recapTry', { x: tr(verbName(d)) }));
  return out;
}

Tut.register('mastery', { recap: () => recapLines(), drill: () => todaysDrill(), run: runStats, preds: Object.keys(PREDS) });
