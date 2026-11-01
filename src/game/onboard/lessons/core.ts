// The prologue's six lessons (ONBOARD2 §2.2–§2.7): move · strike (attack + dash) · undo · echo ·
// paradox · final. Stage coordinates are from the floor centre of the 22×11 prologue room (x −160..160,
// y −72..72); every number a line shows comes from the real hand (its weapon's combo, its preview's
// +N and cost, its mods' echo stand time), so a retune in P1 / P5 keeps the lessons honest.
//
// Each lesson: Ines says what is coming (intro beats), her hand is driven through it once (the demo
// puppet, chalk-outlined), the film winds back, then the player does it — one thing per step, a fail
// line that says what happened and what to do next, and a success beat that points back at the one
// sentence (MODEL) and lights its cells on the model strip.
import type { Entity } from '../../entities/entity';
import type { Player } from '../../entities/player';
import type { Echo } from '../../entities/echo';
import type { Enemy } from '../../entities/enemy';
import type { DemoClip } from '../demo';
import { Lessons, type LessonCtx, type LessonEvent } from '../lesson';
import { S } from '../../strings';
import { Anim } from '../../entities/player';
import { RewindHudHooks } from '../../ui/rewindHud';
import { Onboard } from '../core';
import { Beat } from '../beat';
import { STRIP } from '../modelStrip';
import { Stage } from '../stage';
import { G, sfx } from '../../G';
import { findEnemy } from '../../world/director';
import { FallingGear, PracticeDummy, GlassJar, AlarmTurret, PendulumBlade, Fence, MarkerRing, InesStand, FloorArrows } from '../props';
import '../../strings/onboard';

const L = (k: string) => S('onboard', k);
/** the prologue's practice knobs (the run's bonus reads them): L5's training wheel (ONBOARD2 §10.2 #12) */
export const PracticeKnobs = { standT: null as number | null };

type V = Record<string, unknown>;
const ent = <T>(ctx: LessonCtx, k: string) => ctx.vars[k] as T | undefined;
/** a gear dropping on this hand (it follows the feet until just before it lands, so a walking hand is hit) */
function dropGear(ctx: LessonCtx, warn = 0.8, dmg = 12): FallingGear {
  const p = ctx.p;
  return ctx.spawn(new FallingGear(p.x, p.y, { follow: p, warn, lockAt: Math.max(0, warn - 0.14), dmg }));
}
/** the last rewind's cost and seconds (from the event; the preview's while none yet) */
function rwVars(ctx: LessonCtx): Record<string, string | number> {
  const r = ctx.vars.lastRw as { cost: number; seconds: number } | undefined;
  const pv = ctx.p.rewindPreview();
  const c = Math.round(r?.cost ?? pv.cost), s = Math.round(r?.seconds ?? pv.seconds);
  return { c, s, n: Math.round(pv.hpGain) };
}
const mine = (ctx: LessonCtx, pl?: Player) => !pl || pl === ctx.p;
/** the latest echo of this hand */
const myEcho = (ctx: LessonCtx): Echo | null => { const l = ctx.p.echoes; for (let i = l.length - 1; i >= 0; i--) if (!l[i].dead) return l[i]; return null; };

// ───────────────────────── L1 · wake up · move (§2.2) ─────────────────────────
Lessons.define({
  id: 'move', teach: 'move', where: ['prologue'], reward: 0, sand: 'refill',
  start: { x: -80, y: 0, face: 1 },
  success: { stamp: L('l2Nice'), why: L('l2Nice'), quiet: true }, successDur: 0.6,
  props(ctx) {
    ctx.vars.ines = ctx.spawn(new InesStand(ctx.at(72, -8).x, ctx.at(72, -8).y));
    ctx.vars.ring = ctx.spawn(new MarkerRing(ctx.at(56, 0).x, ctx.at(56, 0).y, 12));
  },
  steps: [{
    key: 'l1Wake',
    caption: (ctx) => ({ spot: ent<Entity>(ctx, 'ring') }),
    enter(ctx) {
      // lying on the floor; 0.6 s later the hand gets up with a key winding
      if (!ctx.vars.woke) { const p = ctx.p; p.locked = true; p.hurtT = 0.8; p.anim = Anim.Hurt; ctx.vars.wakeT = 0.6; }
    },
    tick(ctx, dt) {
      const p = ctx.p;
      if (typeof ctx.vars.wakeT === 'number') {
        ctx.vars.wakeT = (ctx.vars.wakeT as number) - dt;
        p.hurtT = Math.max(p.hurtT, 0.05);
        if ((ctx.vars.wakeT as number) <= 0) { ctx.vars.wakeT = undefined; ctx.vars.woke = true; p.locked = false; p.hurtT = 0; sfx('windUp'); p.world.fx.dust(p.x, p.y, 6); }
        return;
      }
      const ring = ent<MarkerRing>(ctx, 'ring');
      if (ring && ring.reached(p)) { sfx('clockJump'); p.world.fx.ring(ring.x, ring.y, 4, 22, 0.35, 'B5', 2); ctx.succeed(); }
    },
    auto: [{ k: 'wait', s: 0.8 }, { k: 'walkTo', x: 56, y: 0 }],
  }],
});

// ───────────────────────── L2 · attack + dash (§2.3) ─────────────────────────
const DASH_DEMO: DemoClip = {
  id: 'dash', start: { x: 0, y: 0, face: 'right' }, maxDur: 6, dur: 3,
  steps: [{ k: 'walkTo', x: 18, y: 0 }, { k: 'aimAt', x: 80, y: 0 }, { k: 'wait', s: 0.3 }, { k: 'dashTo', x: 80, y: 0 }, { k: 'walkTo', x: 104, y: 0 }, { k: 'wait', s: 0.6 }],
  captions: [{ at: 0, key: 'l2Dash', dur: 3 }],
};
Lessons.define({
  id: 'strike', teach: 'attack', where: ['prologue'], reward: 0, sand: 'refill',
  start: { x: -88, y: 0, face: 1 },
  demo: DASH_DEMO, demoFirst: false, replayable: false,
  success: { stamp: L('l2Through'), why: L('l2ThroughWhy') },
  props(ctx) {
    const at = (x: number, y: number) => ctx.at(x, y);
    ctx.vars.ines = ctx.spawn(new InesStand(at(128, -40).x, at(128, -40).y));
    ctx.vars.dummy = ctx.spawn(new PracticeDummy(at(-32, 0).x, at(-32, 0).y, { hp: 999, immortal: true, punch: false, bar: false }));
    ctx.spawn(new Fence(at(32, 0).x, at(32, -96).y, at(32, 96).y, at(32, -6).y, at(32, 6).y));
    ctx.vars.blade = ctx.spawn(new PendulumBlade(at(48, 0).x, at(48, 0).y, 40, 1.6));
    ctx.vars.ring = ctx.spawn(new MarkerRing(at(104, 0).x, at(104, 0).y, 12));
  },
  steps: [
    {
      // 2a: a full three-hit combo on the dummy
      key: 'l2Hit', start: { x: -88, y: 0 },
      caption: (ctx) => ({ spot: ent<Entity>(ctx, 'dummy') }),
      until(ev, ctx) {
        if (ev.type !== 'hit' || ev.e.target !== ctx.vars.dummy || ev.e.info.echo || !mine(ctx, ev.e.player)) return false;
        const hits = ((ctx.vars.hits as number[]) ?? []).filter((t) => ctx.t - t < 2.0);
        hits.push(ctx.t);
        ctx.vars.hits = hits;
        ctx.vars.lastHit = ctx.t;
        return hits.length >= 3;
      },
      hint(ctx) {
        // one or two hits, then nothing for 3 s: say it again (the buttons pulse)
        const lh = ctx.vars.lastHit as number | undefined;
        if (lh !== undefined && ctx.t - lh > 3 && ctx.once('again')) { Stage.nudge('lesson.step', ctx.p.slot); }
        return null;
      },
      auto: [{ k: 'walkTo', x: -52, y: 0 }, { k: 'aimAt', x: -32, y: 0 }, { k: 'combo', n: 3 }, { k: 'wait', s: 1 }],
    },
    {
      // 2a's little success
      key: 'l2Nice', caption: null,
      enter(ctx) { Beat.success({ p: ctx.p, id: 'strike:combo', stamp: L('l2Nice'), why: L('l2NiceWhy'), dur: 1.6 }); },
      tick(ctx) { if (ctx.t >= 1.6) ctx.next(); },
    },
    {
      // 2b: dash through the pendulum to the ring
      key: 'l2Dash', start: { x: 0, y: 0 },
      caption: (ctx) => ({ spot: ent<Entity>(ctx, 'blade') }),
      tick(ctx) {
        const p = ctx.p, blade = ent<PendulumBlade>(ctx, 'blade'), ring = ent<MarkerRing>(ctx, 'ring');
        if (blade && ring && p.x > blade.x + 10 && ring.reached(p)) { ctx.succeed(); return; }
      },
      until(ev, ctx) {
        if (ev.type === 'custom' && ev.e.id === 'bladeHit' && mine(ctx, ev.e.player)) {
          const n = ((ctx.vars.clips as number) ?? 0) + 1;
          ctx.vars.clips = n;
          ctx.say({ key: 'lesson.hint', text: L('l2Clipped'), tier: 'A', dur: 2.2 });
          // clipped twice: Ines shows how once (a 3 s demo), then back to this step
          if (n === 2) ctx.p.world.after(1.2, () => { if (ctx.run.phase === 'try' && ctx.stepKey === 'l2Dash') ctx.replayDemo(); }, ctx.host.owner);
        }
        return false;
      },
      auto: [{ k: 'walkTo', x: 18, y: 0 }, { k: 'aimAt', x: 80, y: 0 }, { k: 'wait', s: 0.2 }, { k: 'dashTo', x: 80, y: 0 }, { k: 'walkTo', x: 104, y: 0 }],
    },
  ],
});

// ───────────────────────── L3 · undo: the Shadow and a tap (§2.4) ─────────────────────────
const UNDO_DEMO: DemoClip = {
  id: 'undo', start: { x: -120, y: 0, face: 'right', hp: 50, sand: 200 }, maxDur: 10, dur: 7, freezeOnHit: true,
  steps: [
    { k: 'walkTo', x: 16, y: 0 },
    { k: 'waitFor', ev: 'hit', timeout: 2.5, force: (ctx) => { ctx.p.hurt({ amount: 12, kind: 'melee', knock: 0 }); } },
    { k: 'wait', s: 1.3 },
    { k: 'tap', a: 'rewind' },
    { k: 'waitFor', ev: 'rewindLand', timeout: 1.0 },
    { k: 'wait', s: 2.4 },
  ],
  captions: [
    { at: 0.6, key: 'd3Shadow', spot: 'shadow', dur: 2.2 },
    { at: 'hit', key: 'd3Hit', spot: ['hpStripe', 'shadowGain'], dur: 3 },
    { at: 'press:rewind', key: 'd3Tap', dur: 1.2 },
    { at: 'rewindLand', key: 'd3Back', dur: 1.4 },
    { at: 'rewindLand+1.0', key: 'd3Cost', spot: 'sand', dur: 2.2, vars: (ctx) => rwVars(ctx) },
  ],
  segments: { tap: [2.0, 4.6] },
};
function undoCard(ctx: LessonCtx) {
  const p = ctx.p;
  // the coach's L3 card (the same card the first run's coach shows): live +N and cost, a countdown bar
  ctx.say({
    key: 'lesson.card', tier: 'S', form: 'card', critical: true, speaker: undefined,
    text: L('l3ACard'), sub: L('l3ACard2'), sub2: L('l3ACard3'), vars: () => rwVars(ctx),
    spot: ['shadow', 'hpStripe'], timer: () => ctx.freezeLeft, dur: Infinity,
    until: () => !!p.rw || ctx.stepKey !== 'l3A' || ctx.run.phase !== 'try' || !!ctx.vars.cardDone,
  });
  RewindHudHooks.pulse(p, 0.8);
  sfx('coachTick');
}
const fillL = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));

function gearStep(ctx: LessonCtx, triggerX: number, flag: string) {
  const p = ctx.p;
  if (!ctx.vars[flag] && p.x >= ctx.at(triggerX, 0).x && p.state === 'alive' && !p.rw) { ctx.vars[flag] = true; dropGear(ctx); }
}
function onGearDodged(ev: LessonEvent, ctx: LessonCtx) {
  if (ev.type !== 'custom' || ev.e.id !== 'gearLand' || !(ev.e.data as { dodged?: boolean })?.dodged) return;
  ctx.say({ key: 'lesson.hint', text: L('l3Dodged'), tier: 'A', dur: 2 });
  // one more, and this one cannot be dodged
  ctx.p.world.after(1.0, () => { if (ctx.run.phase === 'try') dropGear(ctx, 0.2); }, ctx.host.owner);
}
Lessons.define({
  id: 'undo', teach: 'undo', term: 'rewind', where: ['prologue'], reward: 0, sand: 'refill',
  start: { x: -120, y: 0, face: 1 },
  beats: [
    { text: L('l3Intro'), dur: 1.6 },
    { text: L('model1'), dur: 1.8 },
    { text: L('watchFirst'), dur: 0.9 },
  ],
  demo: UNDO_DEMO,
  success: { stamp: L('l3BStamp'), why: L('l3BWhy'), strip: STRIP.undo },
  stripPrev: STRIP.undo,
  props(ctx) {
    ctx.vars.ines = ctx.spawn(new InesStand(ctx.at(128, -40).x, ctx.at(128, -40).y));
    ctx.spawn(new FloorArrows(ctx.at(-140, 0).x, ctx.at(140, 0).x, ctx.at(0, 0).y));
  },
  tick(ctx) {
    // the demo's gear: crossing x = −10 drops it on the puppet
    if (ctx.demo) gearStep(ctx, -10, 'dropA');
  },
  event(ev, ctx) {
    if (ev.type === 'rewind' && ev.e.player === ctx.p) ctx.vars.lastRw = { cost: ev.e.cost ?? 0, seconds: ev.e.seconds ?? 0 };
    if (ev.type === 'damaged' && ev.e.player === ctx.p && ctx.demo) RewindHudHooks.pulse(ctx.p, 0.8);
  },
  steps: [
    {
      // A0: watch the Shadow follow (1.5 s of walking)
      key: 'l3A0', start: { x: -120, y: 0 },
      caption: { spot: 'shadow' },
      tick(ctx, dt) {
        const p = ctx.p;
        if (Math.hypot(p.vx, p.vy) > 20) ctx.vars.walked = ((ctx.vars.walked as number) ?? 0) + dt;
        if (((ctx.vars.walked as number) ?? 0) >= 1.5) ctx.next();
      },
      auto: [{ k: 'walkTo', x: -70, y: 6 }, { k: 'walkTo', x: -110, y: -4 }, { k: 'walkTo', x: -60, y: 0 }],
    },
    {
      // A: the gear, the FreezeGuide and the card
      key: 'l3A', freezeOnHit: true,
      caption: { tier: 'B' },
      tick(ctx) {
        gearStep(ctx, -10, 'dropA');
        const p = ctx.p;
        // after the 6 s card: the line "still time" until the hit slides off the tape
        if (ctx.vars.hitT !== undefined && !ctx.frozen && !p.rw && ctx.vars.cardDone) {
          if (p.rewindPreview().hpGain < 1 && p.state === 'alive') ctx.fail(L('l3ALate'), { to: 'l3A0' });
        }
      },
      until(ev, ctx) {
        onGearDodged(ev, ctx);
        if (ev.type === 'damaged' && ev.e.player === ctx.p && ctx.vars.hitT === undefined) { ctx.vars.hitT = ctx.t; undoCard(ctx); }
        return ev.type === 'rewind' && ev.e.player === ctx.p && ev.e.restored > 0;
      },
      onTimeout(ctx) {
        // 6 s without a press: the world runs again, the card shrinks to a line until the chance is gone
        ctx.vars.cardDone = true;
        Stage.clear('lesson.card', ctx.p.slot);
        ctx.say({ key: 'lesson.card', tier: 'A', text: L('l3AStill'), vars: () => rwVars(ctx), dur: Infinity, critical: true, until: () => !!ctx.p.rw || ctx.stepKey !== 'l3A' || ctx.run.phase !== 'try' });
      },
      auto: [{ k: 'walkTo', x: 16, y: 0 }, { k: 'waitFor', ev: 'hit', timeout: 3 }, { k: 'wait', s: 0.9 }, { k: 'tap', a: 'rewind' }, { k: 'wait', s: 2 }],
      // fumble: take the hit and do nothing (the card, then the line, then "too late")
      fumble: [{ k: 'walkTo', x: 16, y: 0 }, { k: 'waitFor', ev: 'hit', timeout: 3 }, { k: 'wait', s: 14 }], fumbleN: 2,
    },
    {
      // A's success: UNDONE! (cells ① ② light)
      key: 'l3AWin', caption: null,
      enter(ctx) {
        Stage.clear('lesson.card', ctx.p.slot);
        const v = rwVars(ctx);
        Beat.success({ p: ctx.p, id: 'undo:A', stamp: L('l3AStamp'), why: L('l3AWhy'), sub: { zh: fillL(L('l3ASub').zh, v), en: fillL(L('l3ASub').en, v) }, strip: STRIP.undo, stripPrev: 0, dur: 2.4 });
      },
      tick(ctx) { if (ctx.t >= 2.4 && ctx.once('wipe')) ctx.wipeTo('l3B0'); },
    },
    {
      // B0: the Tape (Sand refills during rehearsal)
      key: 'l3B0', start: { x: -10, y: 0 },
      caption: (ctx) => ({ spot: 'tape', footer: ctx.once('refillSaid') && !Onboard.taught(ctx.p, 'undo:refill') ? L('sandRefill') : undefined }),
      tick(ctx) { if (ctx.t >= 2.5) ctx.next(); },
    },
    {
      // B: on your own — before the red notch slides off
      key: 'l3B', freezeOnHit: 'help', resetTo: 'l3B0',
      tick(ctx) {
        gearStep(ctx, 64, 'dropB');
        const p = ctx.p, hit = ctx.vars.hitT as number | undefined;
        if (hit === undefined || p.rw || ctx.frozen) return;
        if (ctx.t - hit >= 1.5 && ctx.once('notchHint')) ctx.say({ key: 'lesson.hint', text: L('l3BHint'), tier: 'B', dur: 2.4, spot: 'tapeNotch' });
        if (p.rewindPreview().hpGain < 1 && p.state === 'alive' && ctx.t - hit > 0.3) ctx.fail(L('l3BLate'), { to: 'l3B0' });
      },
      until(ev, ctx) {
        onGearDodged(ev, ctx);
        if (ev.type === 'damaged' && ev.e.player === ctx.p && ctx.vars.hitT === undefined) ctx.vars.hitT = ctx.t;
        return false;
      },
      done(ev, ctx) { return ev.type === 'rewind' && ev.e.player === ctx.p && ev.e.restored > 0; },
      auto: [{ k: 'walkTo', x: 96, y: 0 }, { k: 'waitFor', ev: 'hit', timeout: 3 }, { k: 'wait', s: 0.8 }, { k: 'tap', a: 'rewind' }, { k: 'wait', s: 2 }],
      fumble: [{ k: 'walkTo', x: 96, y: 0 }, { k: 'waitFor', ev: 'hit', timeout: 3 }, { k: 'wait', s: 6 }],
    },
  ],
  ended(ctx) { Stage.clear('lesson.card', ctx.p.slot); },
});

// ───────────────────────── L4 · echo: your damage stays, past you hits again (§2.5) ─────────────────────────
const ECHO_DEMO: DemoClip = {
  id: 'echo', start: { x: -96, y: 0, face: 'right', hp: 50, sand: 200 }, maxDur: 11, dur: 7.6,
  steps: [
    { k: 'walkTo', x: 26, y: 0 }, { k: 'aimAt', x: 48, y: 0 }, { k: 'combo', n: 3 },
    { k: 'waitFor', ev: 'hit', timeout: 1.8, force: (ctx) => { ctx.p.hurt({ amount: 8, kind: 'melee', knock: 120, owner: ctx.vars.dummy as PracticeDummy, x: ctx.at(48, 0).x, y: ctx.at(48, 0).y }); } },
    { k: 'wait', s: 0.3 },
    { k: 'tap', a: 'rewind' }, { k: 'waitFor', ev: 'rewindLand', timeout: 1 },
    { k: 'waitFor', ev: 'propBroken', timeout: 4, force: (ctx) => { const d = ctx.vars.dummy as PracticeDummy | undefined; if (d && !d.dead) d.hurt({ amount: 999, kind: 'melee', owner: ctx.p, echo: true }); } },
    { k: 'wait', s: 1.4 },
  ],
  captions: [
    { at: 1.0, key: 'd4Almost', spot: (ctx) => ctx.vars.dummy as Entity, dur: 2 },
    { at: 'hit', key: 'd4Hit', dur: 1.2 },
    { at: 'rewindLand', key: 'd4Kept', spot: (ctx) => ctx.vars.dummy as Entity, dur: 1.4 },
    { at: 'rewindLand+0.6', key: 'd4Echo', spot: 'echo', dur: 2 },
    { at: 'propBroken+0.5', key: 'd4Sand', spot: 'sand', dur: 2.2 },
  ],
};
Lessons.define({
  id: 'echo', teach: 'echo', term: 'echo', where: ['prologue'], reward: 0, sand: 'refill',
  start: { x: -96, y: 0, face: 1 },
  beats: [
    { text: L('l4Intro'), dur: 1.8 },
    { text: L('model2'), dur: 1.8 },
    { text: L('watch'), dur: 0.7 },
  ],
  demo: ECHO_DEMO,
  success: { stamp: L('l4Stamp'), why: L('l4Why'), strip: STRIP.undo | STRIP.echo },
  stripPrev: STRIP.undo,
  props(ctx) {
    ctx.vars.ines = ctx.spawn(new InesStand(ctx.at(128, -40).x, ctx.at(128, -40).y));
    ctx.vars.dummy = ctx.spawn(new PracticeDummy(ctx.at(48, 0).x, ctx.at(48, 0).y, { hp: 'combo', punch: true, bar: true }));
  },
  event(ev, ctx) {
    // "Kept": the dummy's bar stays where your hits left it after a rewind
    if (ev.type === 'rewind' && ev.e.player === ctx.p) { const d = ent<PracticeDummy>(ctx, 'dummy'); if (d && !d.dead) d.kept(1.6); }
  },
  steps: [{
    key: 'l4Try', start: { x: -96, y: 0 },
    caption: (ctx) => ({ spot: ent<Entity>(ctx, 'dummy') }),
    enter(ctx) {
      // after "broken by your own hand" the dummy clatters back together (no wipe)
      const d = ent<PracticeDummy>(ctx, 'dummy');
      if (!d || d.dead) {
        const nd = ctx.spawn(new PracticeDummy(ctx.at(48, 0).x, ctx.at(48, 0).y, { hp: 'combo', punch: true, bar: true }));
        nd.spawnT = 1.0;
        ctx.vars.dummy = nd;
        sfx('cogWind');
      }
      ctx.vars.echoHits = 0; ctx.vars.attacked = false; ctx.vars.hitT = undefined; ctx.vars.lateN = ctx.vars.lateN ?? 0;
    },
    tick(ctx) {
      const p = ctx.p, hitT = ctx.vars.hitT as number | undefined;
      if (hitT !== undefined && !p.rw && ctx.t - hitT > 1.2 && !ctx.vars.lateSaid) {
        ctx.vars.lateSaid = true;
        ctx.vars.lateN = ((ctx.vars.lateN as number) ?? 0) + 1;
        ctx.say({ key: 'lesson.hint', text: L('l4Late'), tier: 'A', dur: 2.2 });
      }
    },
    fail(ev, ctx) {
      if (ev.type === 'rewind' && ev.e.player === ctx.p && !ctx.vars.attacked) return L('l4Empty');
      if (ev.type === 'custom' && ev.e.id === 'propBroken' && (ev.e.data as { prop?: unknown })?.prop === ctx.vars.dummy && !(ctx.vars.echoHits as number)) return { text: L('l4Broke'), wipe: false };
      return null;
    },
    until(ev, ctx) {
      const d = ctx.vars.dummy;
      if (ev.type === 'hit' && ev.e.target === d && mine(ctx, ev.e.player)) { if (ev.e.info.echo) ctx.vars.echoHits = ((ctx.vars.echoHits as number) ?? 0) + 1; else ctx.vars.attacked = true; }
      if (ev.type === 'attack' && !ev.e.echo && mine(ctx, ev.e.player)) ctx.vars.attacked = true;
      if (ev.type === 'damaged' && ev.e.player === ctx.p) {
        ctx.vars.hitT = ctx.t; ctx.vars.lateSaid = false;
        // the second time it goes unanswered, the FreezeGuide steps in
        if (((ctx.vars.lateN as number) ?? 0) >= 1 || ctx.help >= 3) ctx.freeze();
      }
      if (ev.type === 'rewind' && ev.e.player === ctx.p) ctx.vars.hitT = undefined;
      if (ev.type === 'echoEnd' && ev.e.player === ctx.p && !ev.e.paradox && (d as PracticeDummy | undefined) && !(d as PracticeDummy).dead && ((ctx.vars.echoHits as number) ?? 0) > 0 && ctx.once('more')) ctx.say({ key: 'lesson.hint', text: L('l4More'), tier: 'A', dur: 2.4 });
      return false;
    },
    done(ev, ctx) {
      return ev.type === 'custom' && ev.e.id === 'propBroken' && (ev.e.data as { prop?: unknown })?.prop === ctx.vars.dummy && ((ctx.vars.echoHits as number) ?? 0) > 0;
    },
    auto: [{ k: 'walkTo', x: 26, y: 0 }, { k: 'aimAt', x: 48, y: 0 }, { k: 'combo', n: 3 }, { k: 'waitFor', ev: 'hit', timeout: 2 }, { k: 'wait', s: 0.3 }, { k: 'tap', a: 'rewind' }, { k: 'wait', s: 4 }],
    // fumble: break it with your own hits (no echo)
    fumble: [{ k: 'walkTo', x: 26, y: 0 }, { k: 'aimAt', x: 48, y: 0 }, { k: 'combo', n: 3 }, { k: 'wait', s: 0.5 }, { k: 'combo', n: 2 }, { k: 'wait', s: 2 }],
  }],
});

// ───────────────────────── L5 · paradox: ◆ lit → walk into it (§2.6) ─────────────────────────
const PARADOX_DEMO: DemoClip = {
  id: 'paradox', start: { x: -104, y: 24, face: 'right', hp: 50, sand: 200 }, maxDur: 14, dur: 8,
  steps: [
    { k: 'walkTo', x: 30, y: 0 }, { k: 'aimAt', x: 48, y: -8 }, { k: 'combo', n: 1 },
    { k: 'waitFor', ev: 'hit', timeout: 3, force: (ctx) => { ctx.p.hurt({ amount: 6, kind: 'proj', knock: 40 }); } },
    { k: 'wait', s: 0.15 },
    { k: 'tap', a: 'rewind' }, { k: 'waitFor', ev: 'rewindLand', timeout: 1 },
    { k: 'waitFor', ev: 'echoArmed', timeout: 4 },
    { k: 'walkToEcho', timeout: 6 },
    { k: 'wait', s: 1.6 },
  ],
  captions: [
    { at: 'press:attack', key: 'd5Jar', spot: (ctx) => ctx.vars.jar as Entity, dur: 1.6 },
    { at: 'hit', key: 'd4Hit', dur: 1.2 },
    { at: 'echoArmed', key: 'd5Armed', spot: 'armed', dur: 1.4 },
    { at: 'echoArmed+0.6', key: 'd5Walk', spot: 'preview', dur: 1.8 },
    { at: 'paradox+0.5', key: 'd5Blast', dur: 2 },
  ],
};
Lessons.define({
  id: 'paradox', teach: 'paradox', term: 'paradox', where: ['prologue'], reward: 0, sand: 'refill',
  start: { x: -104, y: 24, face: 1 },
  beats: [{ text: L('l5Intro'), dur: 1.4 }, { text: L('watch'), dur: 0.7 }],
  demo: PARADOX_DEMO,
  success: { stamp: L('l5Stamp'), why: L('l5Why'), strip: STRIP.all },
  stripPrev: STRIP.undo | STRIP.echo,
  props(ctx) {
    ctx.vars.ines = ctx.spawn(new InesStand(ctx.at(-140, -40).x, ctx.at(-140, -40).y));
    const jar = ctx.spawn(new GlassJar(ctx.at(48, -8).x, ctx.at(48, -8).y, { alarmR: 44 }));
    ctx.vars.jar = jar;
    ctx.spawn(new AlarmTurret(ctx.at(104, -56).x, ctx.at(104, -56).y, jar));
  },
  staged(ctx) {
    // the training wheel (ONBOARD2 §10.2 #12): echoes wait 2 s in this lesson only
    PracticeKnobs.standT = 2.0;
    ctx.p.lo.recompute();
  },
  ended(ctx) { PracticeKnobs.standT = null; ctx.p.lo.recompute(); },
  steps: [{
    key: 'l5Try', start: { x: -104, y: 24 },
    caption: (ctx) => ({ spot: ent<Entity>(ctx, 'jar') }),
    hint(ctx, t) {
      const e = myEcho(ctx);
      if (e && !e.armed && Math.hypot(e.x - ctx.p.x, e.y - ctx.p.y) < 16 && e.phase === 'stand') return L('l5Wait');
      if (t > 8 && !ctx.vars.rewound) return L('l5How');
      return null;
    },
    tick(ctx) {
      const jar = ent<GlassJar>(ctx, 'jar');
      const pt = ctx.vars.paradoxT as number | undefined;
      if (pt !== undefined && ctx.t - pt > 0.1 && jar && !jar.dead) { ctx.vars.paradoxT = undefined; ctx.fail(L('l5Miss')); }
    },
    fail(ev, ctx) {
      const jar = ent<GlassJar>(ctx, 'jar');
      if (ev.type === 'echoEnd' && ev.e.player === ctx.p && !ev.e.paradox && jar && !jar.dead && ev.e.echo.armed) return L('l5Slow');
      return null;
    },
    until(ev, ctx) {
      if (ev.type === 'rewind' && ev.e.player === ctx.p) ctx.vars.rewound = true;
      if (ev.type === 'paradox' && ev.e.player === ctx.p) ctx.vars.paradoxT = ctx.t;
      return false;
    },
    done(ev, ctx) { return ev.type === 'custom' && ev.e.id === 'propBroken' && (ev.e.data as { prop?: unknown })?.prop === ctx.vars.jar; },
    auto: [
      { k: 'walkTo', x: 30, y: 0 }, { k: 'aimAt', x: 48, y: -8 }, { k: 'combo', n: 1 }, { k: 'waitFor', ev: 'hit', timeout: 4 }, { k: 'wait', s: 0.15 },
      { k: 'tap', a: 'rewind' }, { k: 'waitFor', ev: 'echoArmed', timeout: 6 }, { k: 'walkToEcho', timeout: 6 }, { k: 'wait', s: 1.5 },
    ],
    // fumble: rewind, then never touch the echo (it fades)
    fumble: [{ k: 'walkTo', x: 30, y: 0 }, { k: 'aimAt', x: 48, y: -8 }, { k: 'combo', n: 1 }, { k: 'waitFor', ev: 'hit', timeout: 4 }, { k: 'wait', s: 0.15 }, { k: 'tap', a: 'rewind' }, { k: 'walkTo', x: -120, y: 40 }, { k: 'wait', s: 8 }],
  }],
});

// ───────────────────────── L6 · the final (§2.7) ─────────────────────────
Lessons.define({
  id: 'final', teach: 'final', where: ['prologue'], reward: 0, sand: 'refill',
  start: { x: -96, y: 0, face: 1 },
  get beats() {
    return [
      { text: L('l6Intro'), dur: 1.8 },
      { text: L('model1'), footer: L('model2'), strip: STRIP.all, dur: 2.5 },
      { text: { zh: fillL(L('l6Stand').zh, { stand: standNow() }), en: fillL(L('l6Stand').en, { stand: standNow() }) }, dur: 1.8 },
    ];
  },
  success: { stamp: L('l6Stamp'), why: L('l6Why'), strip: STRIP.all },
  stripPrev: STRIP.all,
  successDur: 2.8,
  props(ctx) { ctx.vars.ines = ctx.spawn(new InesStand(ctx.at(-140, -40).x, ctx.at(-140, -40).y)); },
  steps: [{
    key: 'l6Try', start: { x: -96, y: 0 }, autoBot: true,
    enter(ctx) {
      // the coach is in scripted mode here: the first undoable hit gets the big card (F4b); until the
      // coach lands, the lesson shows that card itself
      Onboard.coach.scripted(ctx.p, 'hit');
      ctx.vars.ownCoach = !!(Onboard.coach as { stub?: boolean }).stub;
    },
    tick(ctx) {
      const w = ctx.w, p = ctx.p;
      if (!ctx.vars.cogs && ctx.t >= 1.2) {
        const d = findEnemy('cogling');
        if (d) ctx.vars.cogs = [ctx.spawn(d.make(ctx.at(80, -32).x, ctx.at(80, -32).y)), ctx.spawn(d.make(ctx.at(80, 32).x, ctx.at(80, 32).y))];
        else ctx.vars.cogs = [];
      }
      const cogs = ctx.vars.cogs as Enemy[] | undefined;
      if (cogs && cogs.length && cogs.every((c) => c.dead)) { ctx.succeed(); return; }
      // an armed echo with an enemy next to it: say so, once (D4)
      if (!ctx.vars.d4) for (const e of p.echoes) {
        if (e.dead || !e.armed) continue;
        if (w.enemies.some((en) => !en.dead && Math.hypot(en.x - e.x, en.y - e.y) <= 48)) { ctx.vars.d4 = true; ctx.say({ key: 'lesson.hint', text: L('l6Echo'), tier: 'A', dur: 2.6, spot: 'armed' }); break; }
      }
      // the real Last Second: say that rewinding still works
      if (p.state === 'stopped' && p.down.lastSecond > 0 && !p.down.final) {
        if (!ctx.vars.downSaid) { ctx.vars.downSaid = true; ctx.say({ key: 'lesson.card', tier: 'S', form: 'card', critical: true, text: L('l6Down'), dur: 2, until: () => p.state !== 'stopped' }); }
      } else ctx.vars.downSaid = false;
    },
    until(ev, ctx) {
      if (ctx.vars.ownCoach && !ctx.vars.coached && ev.type === 'damaged' && ev.e.player === ctx.p && ev.e.undoable !== false && ctx.p.state === 'alive') {
        ctx.vars.coached = true;
        const p = ctx.p;
        ctx.w.slowmo(0.3, 0.9);
        sfx('coachTick');
        ctx.say({ key: 'lesson.card', tier: 'S', form: 'card', critical: true, speaker: undefined, text: L('l3ACard'), sub: L('l3ACard2'), vars: () => rwVars(ctx), spot: ['shadow', 'hpStripe'], dur: 2.6, until: () => !!p.rw });
        RewindHudHooks.pulse(p, 0.8);
      }
      return false;
    },
  }],
});
/** the echo stand time a real fight has (what L6 says out loud) */
function standNow(): string {
  const p = (G.scenes.current as unknown as { world?: { players?: Player[] } } | null)?.world?.players?.[0];
  const v = p && PracticeKnobs.standT === null ? p.mods.echoStandT : 0.6;
  return String(Math.round(v * 10) / 10);
}
export type { V };
