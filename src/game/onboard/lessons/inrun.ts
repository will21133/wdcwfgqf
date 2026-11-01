// The first run's two after-fight lessons (ONBOARD2 §5.6): Fork once room 1 is cleared, Scrub once
// room 2 is (one at a time, ~25 s each, only at a quiet moment). They play where the hand stands, on a
// SoftHost: the props go down in front of it (48 px, toward open floor), a reset is the film wipe
// without moving the hand, Sand is full for every attempt and what the lesson spent is given back.
// Walking out through a door = later (the doors never lock).
//
//   fork    a bell jar in front of you (10 brass inside): fork beside it, step away, wait for the ◆,
//           walk back into it → the jar breaks. "An Echo without rewinding · 50 Sand."
//   scrub   two gears fall on you, a second apart: hold rewind, watch the preview walk back past the red
//           notches, let go → only that far back, for less Sand. "Hold to preview: a short rewind costs less."
import type { Entity } from '../../entities/entity';
import type { Player } from '../../entities/player';
import type { Echo } from '../../entities/echo';
import type { DemoClip } from '../demo';
import { Lessons, type LessonCtx } from '../lesson';
import { Calm } from '../calm';
import { Onboard } from '../core';
import { S, term } from '../../strings';
import { tr, type L10n } from '../../i18n';
import { Stage } from '../stage';
import { FallingGear, GlassJar } from '../props';
import '../../strings/onboard';

const L = (k: string) => S('onboard', k);
/** the room counts (1-based) after which each lesson is taught (LADDER.forkRoom / scrubRoom, ONBOARD2 §5.2) */
export const LADDER = { forkRoom: 1, scrubRoom: 2 };
const ent = <T>(ctx: LessonCtx, k: string) => ctx.vars[k] as T | undefined;
/** "分岔 — 原地留下一个残响": a term's name and plain line for an intro's second line */
function termLine(id: string): L10n {
  const t = term(id);
  return t ? { zh: `${t.name.zh} — ${t.plain.zh}`, en: `${t.name.en} — ${t.plain.en}` } : { zh: id, en: id };
}
const fill = (l: L10n, v: Record<string, string | number>): L10n => ({ zh: l.zh.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)), en: l.en.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) });
const myFork = (ctx: LessonCtx): Echo | null => { const l = ctx.p.echoes; for (let i = l.length - 1; i >= 0; i--) if (!l[i].dead && l[i].kind === 'fork') return l[i]; return null; };
/** the footer every in-run step carries: watch again · a door = later */
const FOOT = () => ({ zh: `${tr(L('watchAgain'))}  ·  ${L('laterDoor').zh}`, en: `${L('watchAgain').en}  ·  ${L('laterDoor').en}` });
/** Sand full for the attempt (the lesson's spending is given back at the end: sand 'refill') */
const refill = (p: Player) => { p.lo.sand = Math.max(p.lo.sand, p.lo.sandMax); };

// ───────────────────────── Fork (§5.6.1) ─────────────────────────
const FORK_DEMO: DemoClip = {
  id: 'fork', start: { x: 0, y: 0 }, maxDur: 11, dur: 6.5,
  steps: [
    { k: 'walkTo', x: 0, y: 22 }, { k: 'walkTo', x: 26, y: 22 }, { k: 'walkTo', x: 32, y: 2 },
    { k: 'aimAt', x: 48, y: 0 }, { k: 'combo', n: 1 }, { k: 'wait', s: 0.25 },
    { k: 'tap', a: 'fork' }, { k: 'waitFor', ev: 'fork', timeout: 1 },
    { k: 'walkTo', x: -4, y: -24 },
    { k: 'walkToEcho', timeout: 5 },
    { k: 'wait', s: 1.2 },
  ],
  captions: [
    { at: 'press:fork', key: 'fdPress', dur: 1.4 },
    { at: 'fork+0.4', key: 'fdCost', spot: 'sand', dur: 1.2, vars: (ctx) => ({ fork: ctx.p.mods.forkCost }) },
    { at: 'fork+1.0', key: 'fdWalk', spot: 'echo', dur: 1.8 },
    { at: 'fork+2.6', key: 'fdArmed', spot: 'armed', dur: 2 },
  ],
};
Lessons.define({
  id: 'fork', teach: 'fork', term: 'fork', where: ['calm', 'hall'], sand: 'refill',
  verbs: { fork: true },
  get beats() { return [{ text: L('forkIntro'), footer: termLine('fork'), dur: 2.4 }]; },
  demo: FORK_DEMO,
  success: { stamp: L('fStamp'), why: L('fWhy') },
  successVars: (ctx) => ({ fork: ctx.p.mods.forkCost }),
  props(ctx) {
    const q = ctx.at(48, 0);
    // real brass only for the player's own blast (the demo's jar holds a key: nothing to pocket)
    ctx.vars.jar = ctx.spawn(new GlassJar(q.x, q.y, { brass: ctx.demo ? 0 : 10, owner: ctx.p, alarmR: 0 }));
    refill(ctx.p);
  },
  event(ev, ctx) {
    // help level 3: a fork echo waits longer (and the footer says so)
    if (ev.type === 'echoSpawn' && ev.e.player === ctx.p && ev.e.echo.kind === 'fork' && ctx.help >= 3) ev.e.echo.standT = Math.max(ev.e.echo.standT, 1.5);
    if (ev.type === 'paradox' && ev.e.player === ctx.p) { ctx.vars.lastKind = ev.e.echo?.kind ?? null; ctx.vars.paradoxT = ctx.t; }
  },
  steps: [
    {
      // ① fork beside the jar
      key: 'f1',
      caption: (ctx) => ({ spot: ent<Entity>(ctx, 'jar'), footer: FOOT() }),
      until(ev, ctx) {
        if (ev.type === 'attack' && !ev.e.echo && ev.e.player === ctx.p) ctx.vars.swungT = ctx.t;
        if (ev.type !== 'fork' || ev.e.player !== ctx.p) return false;
        // forked without a swing in the last 2 s: still fine, but say what the echo does (not a failure)
        const sw = ctx.vars.swungT as number | undefined;
        if (sw === undefined || ctx.t - sw > 2) ctx.say({ key: 'lesson.hint', text: L('fSwing'), tier: 'B', dur: 2.4 });
        return true;
      },
      auto: [{ k: 'walkTo', x: 32, y: 2 }, { k: 'aimAt', x: 48, y: 0 }, { k: 'combo', n: 1 }, { k: 'wait', s: 0.25 }, { k: 'tap', a: 'fork' }, { k: 'wait', s: 0.5 }],
    },
    {
      // ② step away; the ◆ lights once you are off it
      key: 'f2',
      caption: (ctx) => ({ spot: 'echo', footer: ctx.help >= 3 ? L('fPractice') : FOOT() }),
      hint(ctx) {
        const e = myFork(ctx);
        if (e && !e.armed && e.phase === 'stand' && Math.hypot(e.x - ctx.p.x, e.y - ctx.p.y) < e.contactR) {
          ctx.vars.onIt = ((ctx.vars.onIt as number) ?? 0) + 1 / 60;
          if ((ctx.vars.onIt as number) > 1.5) return L('fOff');
        } else ctx.vars.onIt = 0;
        return null;
      },
      tick(ctx) { const e = myFork(ctx); if (e && e.armed && e.phase === 'stand') ctx.next(); },
      fail(ev, ctx) { return failFork(ev, ctx); },
      auto: [{ k: 'walkTo', x: -4, y: -24 }, { k: 'wait', s: 0.3 }],
    },
    {
      // ③ walk back into it
      key: 'f3',
      caption: (ctx) => ({ spot: 'armed', footer: FOOT() }),
      tick(ctx) {
        const jar = ent<GlassJar>(ctx, 'jar');
        const pt = ctx.vars.paradoxT as number | undefined;
        if (pt !== undefined && ctx.t - pt > 0.1 && jar && !jar.dead) { ctx.vars.paradoxT = undefined; ctx.fail(L('fNear'), { to: 'f1' }); }
      },
      fail(ev, ctx) { return failFork(ev, ctx); },
      done(ev, ctx) {
        if (ev.type !== 'custom' || ev.e.id !== 'propBroken' || (ev.e.data as { prop?: unknown })?.prop !== ctx.vars.jar) return false;
        if (ctx.vars.lastKind !== 'fork') ctx.say({ key: 'lesson.hint', text: L('fAlso'), tier: 'B', dur: 2.4 });
        return true;
      },
      auto: [{ k: 'walkToEcho', timeout: 5 }, { k: 'wait', s: 1 }],
    },
  ],
});
/** the fork echo ran out unanswered → too slow (back to ①) */
function failFork(ev: Parameters<NonNullable<import('../lesson').LessonStep['fail']>>[0], ctx: LessonCtx) {
  const jar = ent<GlassJar>(ctx, 'jar');
  if (ev.type === 'echoEnd' && ev.e.player === ctx.p && !ev.e.paradox && ev.e.echo.kind === 'fork' && jar && !jar.dead) return { text: fill(L('fSlow'), { stand: ctx.p.mods.echoStandT }), to: 'f1' };
  return null;
}

// ───────────────────────── Scrub (§5.6.2) ─────────────────────────
/** two gears, a second apart: one at the feet, one where the hand is heading (both follow it in) */
function dropTwo(ctx: LessonCtx, dmg = 8): void {
  const p = ctx.p;
  ctx.spawn(new FallingGear(p.x, p.y, { follow: p, warn: 0.8, lockAt: 0.66, dmg }));
  p.world.after(1.0, () => { if (!p.dead && ctx.run.phase !== 'end') ctx.spawn(new FallingGear(p.x, p.y, { follow: p, warn: 0.8, lockAt: 0.66, dmg })); }, ctx.host.owner);
}
const SCRUB_DEMO: DemoClip = {
  id: 'scrub', start: { x: 0, y: 0 }, maxDur: 10, dur: 5.5,
  steps: [
    { k: 'cue', id: 'gears' },
    { k: 'walkTo', x: 30, y: 0, speed: 0.4 },
    { k: 'waitFor', ev: 'hit', timeout: 2.5, force: (ctx) => { ctx.p.hurt({ amount: 8, kind: 'melee', knock: 0 }); } },
    { k: 'walkTo', x: 46, y: 0, speed: 0.35 },
    { k: 'waitFor', ev: 'hit', timeout: 2, force: (ctx) => { ctx.p.hurt({ amount: 8, kind: 'melee', knock: 0 }); } },
    { k: 'wait', s: 0.4 },
    { k: 'hold', a: 'rewind', s: 0.95 },
    { k: 'waitFor', ev: 'rewindLand', timeout: 1.5 },
    { k: 'wait', s: 1.6 },
  ],
  captions: [
    { at: 'hit+1.0', key: 'sdNotches', spot: 'tape', dur: 1.4 },
    { at: 'press:rewind', key: 'sdHold', dur: 0.8 },
    { at: 'press:rewind', key: 'sdPass', spot: 'tapeNotch', dur: 0.9 },
    { at: 'rewindLand', key: 'sdRelease', dur: 0.9 },
    { at: 'rewindLand+0.8', key: 'sdCost', spot: 'sand', dur: 1.8, vars: (ctx) => scrubVars(ctx) },
  ],
};
function scrubVars(ctx: LessonCtx): Record<string, string | number> {
  const r = ctx.vars.lastRw as { cost: number; seconds: number } | undefined;
  return { c: Math.round(r?.cost ?? 0), s: (Math.round((r?.seconds ?? 0) * 10) / 10).toFixed(1) };
}
Lessons.define({
  id: 'scrub', teach: 'scrub', term: 'scrub', where: ['calm', 'hall'], sand: 'refill',
  verbs: { scrub: true },
  get beats() { return [{ text: L('scrubIntro'), footer: termLine('scrub'), dur: 2.4 }]; },
  demo: SCRUB_DEMO,
  success: { stamp: L('sStamp'), why: L('sWhy') },
  props(ctx) { refill(ctx.p); },
  cue(ctx, id) { if (id === 'gears') dropTwo(ctx); },
  event(ev, ctx) {
    if (ev.type === 'rewind' && ev.e.player === ctx.p) ctx.vars.lastRw = { cost: ev.e.cost ?? 0, seconds: ev.e.seconds ?? 0 };
    if (ev.type === 'damaged' && ev.e.player === ctx.p) ctx.vars.hits = ((ctx.vars.hits as number) ?? 0) + 1;
  },
  steps: [{
    key: 's1',
    caption: () => ({ footer: L('sCancel') }),
    enter(ctx) { ctx.vars.hits = 0; dropTwo(ctx); },
    hint(ctx) {
      // two notches on the tape and nothing pressed for 3 s: say it again
      if ((ctx.vars.hits as number) >= 2 && ctx.t > 4.5 && ctx.once('again')) Stage.nudge('lesson.step', ctx.p.slot);
      return null;
    },
    fail(ev, ctx) {
      if (ev.type !== 'rewind' || ev.e.player !== ctx.p) return null;
      if (!ev.e.scrub) return L('sTap');
      if (ev.e.restored <= 0) return L('sEarly');
      if ((ev.e.seconds ?? 0) > 2.4 && !ctx.vars.farOnce) { ctx.vars.farOnce = true; return L('sFar'); }
      return null;
    },
    done(ev, ctx) {
      if (ev.type !== 'rewind' || ev.e.player !== ctx.p || !ev.e.scrub) return false;
      return ev.e.restored >= 8 && ((ev.e.seconds ?? 0) <= 2.4 || !!ctx.vars.farOnce);
    },
    auto: [{ k: 'waitFor', ev: 'hit', timeout: 3 }, { k: 'waitFor', ev: 'hit', timeout: 3 }, { k: 'wait', s: 0.4 }, { k: 'hold', a: 'rewind', s: 0.9 }, { k: 'wait', s: 2 }],
  }],
});

// ───────────────────────── the first run's two rules (ONBOARD2 §5.2 S1 / S2) ─────────────────────────
Calm.addRule(Object.assign({
  id: 'fork', prio: 20,
  eligible: ({ run, p }: { run: { roomIndex: number }; p: Player }) => Onboard.learned(p, 'paradox') && run.roomIndex + 1 >= LADDER.forkRoom,
}, { requires: (p: Player) => Onboard.learned(p, 'paradox') }));
Calm.addRule({
  id: 'scrub', prio: 10,
  eligible: ({ run, p }) => Onboard.learned(p, 'fork') && run.roomIndex + 1 >= LADDER.scrubRoom,
});
