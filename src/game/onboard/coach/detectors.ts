// The coach's detectors besides D1 (ONBOARD2 §6.5). Each one names a moment that is happening
// right now and says situation → button → result, once, and only through the Stage.
//
//   D2  missed        a prompted hit got too old: "that hit is 3s old — too late" (first 2, silent)
//   D3  echo hit      your echo landed a hit: "free damage" (first 3; one a room)
//   D4  echoIgnored   your armed echo stands by enemies and you're not going in: line + » arrows
//   D5  sand full     full for 20 s in a fight: spend it (first 5 runs; cuttable)
//   D6  no sand       an undoable hit you cannot afford / cannot reach
//   D7  refused       a rewind / fork refusal: what to do about it (first 2 per reason)
//   D8  scrub short   a scrub that did not reach the hit: hold longer (once Scrub is taught)
//   D9  gates         F4a's gates say it; the coach counts it against the room's budget
//   D10 nemesis       the enemy kind that stopped you last run winds up near you (cuttable)
//   D11 Last Second   a note under the panel; a success card when you get up
//   D12 pull back     co-op: a teammate is down, you have the Sand: get close, hold rewind
import type { Player } from '../../entities/player';
import type { World } from '../../world/world';
import type { BusEvents } from '../../systems/bus';
import type { Echo } from '../../entities/echo';
import type { L10n } from '../../i18n';
import { G } from '../../G';
import { S } from '../../strings';
import { tr } from '../../i18n';
import { Flags, Stats } from '../../meta/registry';
import { profile } from '../../save';
import { Bullet } from '../../entities/projectile';
import { GameHooks } from '../../hooks';
import { GameScene } from '../../scenes/game';
import { Hud } from '../../ui/hud';
import { Text } from '../../ui/text';
import { rect } from '../../ui/draw';
import { Callouts } from '../../ui/callouts';
import { ROSTERS } from '../../world/director';
import { ROMAN, slotColor } from '../../players';
import { LAST_SECOND } from '../../systems/downed';
import { Onboard } from '../core';
import { GateHooks } from '../gates';
import { Beat } from '../beat';
import { Rich } from '../rich';
import { coachable, effLevel, seatOf, roomOf, budgetLeft, spendBudget, say, clog, forcedDet, forcedOnceTake, suppressed, directorOf, GAIN_MIN, type CoachDirector } from './coach';

const C = (k: string): L10n => S('coach', k);
const sceneOf = () => (G.scenes.current instanceof GameScene ? G.scenes.current : null);
/** lifetime count on slot I (Flags; guests: the session) */
const guestCounts = new Map<string, number>();
function life(p: Player, key: string): number { return p.slot === 0 ? Flags.get('coach.' + key) : guestCounts.get(p.slot + ':' + key) ?? 0; }
function lifeInc(p: Player, key: string) { if (p.slot === 0) Flags.inc('coach.' + key); else guestCounts.set(p.slot + ':' + key, life(p, key) + 1); }
/** the room-once memo of a seat */
const onceInRoom = (p: Player, id: string) => { const r = roomOf(p); if (r.once.has(id)) return false; r.once.add(id); return true; };
const realRun = (w: World) => { const sc = sceneOf(); return !!sc && sc.world === w && sc.opt.kind !== 'prologue' && sc.opt.kind !== 'rehearsal'; };

/**
 * calm(p) (ONBOARD2 §6.8, for D4 and the mastery prompts): no enemy winding up within 160 px, no
 * enemy bullet within 96 px, HP above 30%, no hit in the last 1.5 s
 */
export function calm(p: Player): boolean {
  const w = p.world;
  if (p.hp <= 0.3 * p.maxHp) return false;
  if (w.time - seatOf(p.slot).lastHitT < 1.5) return false;
  for (const e of w.enemies) if (!e.dead && (e as unknown as { wind?: unknown }).wind && Math.hypot(e.x - p.x, e.y - p.y) < 160) return false;
  for (const b of w.entities) if (b instanceof Bullet && !b.dead && b.team === 'enemy' && Math.hypot(b.x - p.x, b.y - p.y) < 96) return false;
  return true;
}

// ───────────────────────── D4 state, D12 state ─────────────────────────
interface D4 { p: Player; echo: Echo; t0: number; fading: boolean }
let d4: D4 | null = null;
interface D12 { p: Player; q: Player; shown: boolean }
const d12: D12[] = [];
let pollT = 0;
/** D5: seconds each seat has sat on full Sand in a fight */
const fullT = new Map<number, number>();
let d5Run = 0;
/** D10: kinds already warned about this run */
const d10Run = new Set<string>();

function nameOf(kind: string): L10n | null {
  for (const r of ROSTERS) for (const d of r) if (d.id === kind && d.name) return d.name;
  return null;
}

export const Detect = {
  /** the room's bus (CoachDirector.added) */
  listen(w: World, owner: CoachDirector) {
    d4 = null; d12.length = 0; fullT.clear();
    w.bus.on('hit', (e) => onEchoHit(e), owner);
    w.bus.on('paradox', (e) => onParadox(e), owner);
    w.bus.on('echoEnd', (e) => { if (d4 && e.echo === d4.echo && !e.paradox) { clog('ignored', { det: 'echoIgnored', slot: d4.p.slot }); d4 = null; } }, owner);
    w.bus.on('custom', (e) => onCustom(e), owner);
    w.bus.on('downed', (e) => onDowned(e), owner);
    w.bus.on('revived', (e) => onRevived(e), owner);
  },

  /** every Stage update: polls at 10 Hz */
  tick(w: World, dt: number) {
    pollT -= dt;
    if (pollT > 0) return;
    pollT = 0.1;
    for (const p of w.players) {
      if (!coachable(p) || p.state !== 'alive') continue;
      pollD4(p, w);
      pollD5(p, w);
      pollD10(p, w);
    }
    pollD12(w);
  },

  /** an undoable hit landed (before D1 decides): D6 when the Sand cannot pay for any rewind */
  damaged(p: Player, _e: BusEvents['damaged']) {
    const cr = p.canRewind();
    if (cr.ok || cr.reason !== 'sand') return;
    if (!onceInRoom(p, 'D6') && !forcedOnceTake('D6')) return;
    if (life(p, 'd6') >= 4 && !forcedDet('D6')) return;
    if (suppressed(p) || !budgetLeft(p)) return;
    lifeInc(p, 'd6'); spendBudget(p);
    say({ key: 'coach.d6', slot: p.slot, who: p.input, tier: 'A', text: C('d6'), vars: { n: Math.floor(p.lo.sand) }, dur: 2.2, maxWait: 2 });
    clog('prompt', { det: 'D6', slot: p.slot });
  },

  /** D2: a prompted chance ran out */
  missed(p: Player, tHit: number) {
    if (life(p, 'expireShown') >= 2 && !forcedDet('D2')) return;
    lifeInc(p, 'expireShown');
    const s = Math.max(1, Math.round(p.world.time - tHit));
    say({ key: 'coach.d2', slot: p.slot, who: p.input, tier: 'C', text: C('d2'), vars: { s }, dur: 1.8, maxWait: 4 });
    clog('prompt', { det: 'D2', slot: p.slot });
  },

  /** D6 variant: the hit expired because the Sand only reached a shorter way back */
  sandShort(p: Player) {
    const pv = p.rewindPreview();
    if (pv.seconds >= p.mods.tapeLen - 0.05 || pv.hpGain >= GAIN_MIN(p)) return;
    if (!onceInRoom(p, 'D6')) return;
    if (life(p, 'd6s') >= 2 && !forcedDet('D6')) return;
    if (suppressed(p) || !budgetLeft(p)) return;
    lifeInc(p, 'd6s'); spendBudget(p);
    say({ key: 'coach.d6', slot: p.slot, who: p.input, tier: 'A', text: C('d6Short'), vars: { s: Math.max(0.5, Math.round(pv.seconds * 2) / 2) }, dur: 2.2, maxWait: 2 });
    clog('prompt', { det: 'D6', slot: p.slot });
  },

  /** D8: a scrub landed short of the hit it could have undone */
  scrubShort(p: Player, gain: number) {
    if (!Onboard.taught(p, 'scrub') && !forcedDet('D8')) return;
    if (!onceInRoom(p, 'D8')) return;
    if (life(p, 'd8') >= 3 && !forcedDet('D8')) return;
    lifeInc(p, 'd8');
    say({ key: 'coach.d8', slot: p.slot, who: p.input, tier: 'B', text: C('d8'), vars: { n: Math.max(1, Math.round(gain)) }, dur: 2.2, maxWait: 3 });
    clog('prompt', { det: 'D8', slot: p.slot });
  },
};

// ───────────────────────── D3 ─────────────────────────
function onEchoHit(e: BusEvents['hit']) {
  const p = e.player;
  if (!p || !coachable(p) || e.dealt <= 0) return;
  if ((e.info as { src?: number }).src !== p.slot * 2 + 1) return;
  if (!realRun(p.world) || effLevel(p) === 0 && !forcedDet('D3')) return;
  if (life(p, 'echoHits') >= 3 && !forcedDet('D3')) return;
  if (!onceInRoom(p, 'D3')) return;
  lifeInc(p, 'echoHits');
  Stats.add('coach.echoHits', 1);
  say({ key: 'coach.d3', slot: p.slot, who: p.input, tier: 'C', text: C('d3'), dur: 1.8, maxWait: 4 });
  clog('prompt', { det: 'D3', slot: p.slot });
}

// ───────────────────────── D4 ─────────────────────────
function pollD4(p: Player, w: World) {
  if (d4) {
    // the line follows its echo: once it stands and is running out, "walk in now!"
    if (d4.p === p && !d4.fading && d4.echo.phase === 'stand' && d4.echo.stood / Math.max(0.05, d4.echo.standT) > 0.45) {
      d4.fading = true;
      say({ key: 'coach.d4', slot: p.slot, who: p.input, tier: 'A', text: C('d4Fading'), dur: 1.4, until: () => !d4 || d4.echo.dead });
    }
    return;
  }
  const forced = forcedDet('D4') || forcedDet('echoIgnored');
  if (!realRun(w) && !forced) return;
  const room = roomOf(p);
  if (room.once.has('D4') && !forced) return;
  if (life(p, 'd4') >= 3 && !forced && !G.debug.get('coach')) return;
  if (Stats.get('did.paradox') >= 3 && effLevel(p) < 2 && !forced) return;
  if (suppressed(p) || !budgetLeft(p) || !calm(p)) return;
  for (const e of p.echoes) {
    if (e.dead || !e.armed || e.paradoxCd > 0 || e.phase === 'recall') continue;
    const dp = Math.hypot(e.x - p.x, e.y - p.y);
    if (dp < 20 || dp > 160) continue;
    if (!w.enemies.some((q) => !q.dead && Math.hypot(q.x - e.x, q.y - e.y) <= 48)) continue;
    room.once.add('D4');
    lifeInc(p, 'd4'); spendBudget(p);
    d4 = { p, echo: e, t0: w.time, fading: false };
    const cur = d4;
    say({ key: 'coach.d4', slot: p.slot, who: p.input, tier: 'A', text: C('d4'), spot: 'armed', dur: 3, until: () => d4 !== cur || e.dead });
    const dir = directorOf(w);
    dir?.arrows.push({ from: p, to: () => (e.dead ? null : { x: e.x, y: e.y }), color: 'C3', until: () => d4 !== cur || e.dead || Math.hypot(e.x - p.x, e.y - p.y) < 22 });
    clog('prompt', { det: 'echoIgnored', slot: p.slot });
    return;
  }
}
function onParadox(e: BusEvents['paradox']) {
  if (!d4 || e.player !== d4.p) return;
  const p = d4.p;
  d4 = null;
  // got them: the echo really was the bomb (only when the blast had something to hit)
  clog('success', { det: 'echoIgnored', slot: p.slot });
  Beat.success({ p, id: 'coach.d4', stamp: C('d4Stamp'), why: C('d4Why'), dur: 2.0 });
}

// ───────────────────────── D5 (cuttable) ─────────────────────────
function pollD5(p: Player, w: World) {
  if (!realRun(w) || profile.runs > 5 && !forcedDet('D5')) return;
  const lo = p.lo;
  const fight = w.aliveEnemies.length > 0;
  const t = fight && lo.sand >= lo.sandMax - 0.5 ? (fullT.get(p.slot) ?? 0) + 0.1 : 0;
  fullT.set(p.slot, t);
  if (t < 20 && !(forcedDet('D5') && t > 2)) return;
  if (d5Run >= 2 || !onceInRoom(p, 'D5') || suppressed(p)) return;
  d5Run++;
  fullT.set(p.slot, -999);
  say({ key: 'coach.d5', slot: p.slot, who: p.input, tier: 'C', text: Onboard.taught(p, 'fork') ? C('d5Fork') : C('d5Rewind'), dur: 2.4, maxWait: 4 });
  clog('prompt', { det: 'D5', slot: p.slot });
}

// ───────────────────────── D7 ─────────────────────────
function onCustom(e: BusEvents['custom']) {
  if (e.id !== 'rewindRefused' && e.id !== 'forkRefused') return;
  const p = e.player;
  if (!p || !coachable(p)) return;
  const reason = String(e.data?.reason ?? '');
  const fork = e.id === 'forkRefused';
  let key: string | null = null;
  const vars: Record<string, number> = {};
  if (reason === 'sand') { key = fork ? 'd7forkSand' : 'd7sand'; vars.n = Math.round(e.data?.need ?? p.mods.forkCost); }
  else if (reason === 'tape') key = 'd7tape';
  else if (reason === 'anchor') key = 'd7anchor';
  else if (reason === 'burnt') { key = 'd7burnt'; vars.s = Math.max(1, Math.ceil(p.rec.burnT)); }
  if (!key) return;
  const id = (fork ? 'f.' : 'r.') + reason;
  if (life(p, 'd7.' + id) >= 2 && !forcedDet('D7')) return;
  lifeInc(p, 'd7.' + id);
  say({ key: 'coach.d7', slot: p.slot, who: p.input, tier: 'B', text: C(key), vars, dur: 2.0, maxWait: 3 });
  clog('prompt', { det: 'D7', slot: p.slot });
}

// ───────────────────────── D9: the gates speak, the coach counts ─────────────────────────
for (const k of ['explainFork', 'holdIsTap'] as const) {
  const orig = GateHooks[k];
  GateHooks[k] = (p: Player) => { orig(p); if (p.world) spendBudget(p); clog('prompt', { det: 'D9', slot: p.slot }); };
}

// ───────────────────────── D10 (cuttable) ─────────────────────────
function pollD10(p: Player, w: World) {
  if (!realRun(w) || p.slot !== 0) return;
  for (const e of w.enemies) {
    if (e.dead || !(e as unknown as { wind?: unknown }).wind) continue;
    const kind = (e as unknown as { codexId?: string }).codexId || e.kind;
    if (d10Run.has(kind)) continue;
    const lastRun = Flags.get('death.lastRun.' + kind) === profile.runs - 1 && profile.runs > 0;
    if (!lastRun && Flags.get('death.by.' + kind) < 2 && !forcedDet('D10')) continue;
    if (Math.hypot(e.x - p.x, e.y - p.y) > 140 || suppressed(p)) continue;
    d10Run.add(kind);
    const nm = nameOf(kind);
    say({ key: 'coach.d10', slot: p.slot, who: p.input, tier: 'B', text: C('d10'), vars: { name: nm ? tr(nm) : kind }, dur: 2.2, maxWait: 2 });
    clog('prompt', { det: 'D10', slot: p.slot });
    return;
  }
}
GameHooks.onRunStart(() => { d10Run.clear(); d5Run = 0; });

// ───────────────────────── D11: the Last Second (solo) ─────────────────────────
/** the note under the Last Second panel: drawn with the panel (it is part of it), 2 lifetimes */
let d11Shown: Player | null = null;
Hud.register({
  id: 'coachLastSecond', area: 'top', order: 95,
  update(_dt, _p, w) {
    const p = w.players[0];
    const on = !!p && w.playerCount <= 1 && p.state === 'stopped' && !p.down.final && p.down.lastSecond > 0 && coachable(p);
    if (!on) { if (d11Shown && (!p || p.state !== 'stopped')) d11Shown = null; return; }
    if (d11Shown === p) return;
    if (Flags.get('coach.d11note') >= 2 && !forcedDet('D11')) return;
    d11Shown = p;
    Flags.inc('coach.d11note');
    clog('prompt', { det: 'D11', slot: p.slot });
  },
  draw(ctx, _p) {
    const sc = sceneOf();
    const p = sc?.world.players[0];
    if (!p || d11Shown !== p || p.state !== 'stopped' || p.down.final || p.down.lastSecond <= 0) return;
    // the panel (downed.ts renderLastSecondUi) is centred on (320, 132): this sits 4 px under it
    const lt = Math.ceil(Text.lineH('title')), ph = 13;
    const H = lt + 4 + Math.max(ph, Math.ceil(Text.lineH('body'))) + 14;
    const y0 = Math.round(132 + H / 2) + 4;
    const text = tr(C('d11'));
    const m = Text.measure(text, 'small');
    const w = Math.ceil(m.w) + 12, h = Math.ceil(Text.lineH('small')) + 4;
    const x0 = Math.round(320 - w / 2);
    const a = Math.min(1, (LAST_SECOND - p.down.lastSecond) / 0.2);
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * a * 0.85;
    rect(ctx, x0, y0, w, h, 'K0');
    ctx.globalAlpha = a0 * a;
    Text.draw(ctx, text, 320, y0 + h / 2, { size: 'small', color: 'K9', align: 'center', valign: 'middle' });
    ctx.globalAlpha = a0;
    Callouts.avoidUi(x0, y0, w, h);
  },
});
function onRevived(e: BusEvents['revived']) {
  const p = e.player;
  if (e.source === 'self' && coachable(p) && p.world.playerCount <= 1) {
    if (Flags.get('coach.d11ok') < 3 || forcedDet('D11')) {
      Flags.inc('coach.d11ok');
      Beat.success({ p, id: 'coach.d11', stamp: C('d11Stamp'), why: C('d11Why'), dur: 2.0 });
      clog('success', { det: 'D11', slot: p.slot });
    }
  }
  if (e.source === 'pullback' && e.by) {
    const i = d12.findIndex((d) => d.q === p && d.p === e.by && d.shown);
    for (let k = d12.length - 1; k >= 0; k--) if (d12[k].q === p) d12.splice(k, 1);
    if (i >= 0 && coachable(e.by)) {
      Beat.success({ p: e.by, id: 'coach.d12', stamp: C('d12Stamp'), why: C('d12Why'), dur: 2.0 });
      clog('success', { det: 'D12', slot: e.by.slot });
    }
  }
}

// ───────────────────────── D12: pull a teammate back (co-op) ─────────────────────────
function onDowned(e: BusEvents['downed']) {
  const q = e.player;
  const w = q.world;
  if (!w || w.playerCount <= 1) return;
  for (const p of w.players) if (p !== q && p.state === 'alive' && coachable(p)) d12.push({ p, q, shown: false });
}
function pollD12(w: World) {
  for (let i = d12.length - 1; i >= 0; i--) {
    const d = d12[i];
    const { p, q } = d;
    const windowOpen = q.state === 'stopped' && q.down.t <= 3 && p.state === 'alive' && !p.dead && !q.dead;
    if (!windowOpen) { d12.splice(i, 1); continue; }
    if (d.shown) continue;
    const dist = Math.hypot(p.x - q.x, p.y - q.y);
    if (p.lo.sand < 100 || dist <= 48 || dist > 200) continue;
    if (p.slot === 0 && Flags.get('coach.d12') >= 5 && !forcedDet('D12')) continue;
    if (p.rw) continue;
    d.shown = true;
    if (p.slot === 0) Flags.inc('coach.d12');
    spendBudget(p);
    const r = ROMAN[((q.slot % 4) + 4) % 4];
    const gone = () => q.state !== 'stopped' || q.down.t > 3 || Math.hypot(p.x - q.x, p.y - q.y) <= 48;
    say({ key: 'coach.d12', slot: p.slot, who: p.input, tier: 'A', critical: true, text: C('d12'), vars: { r }, until: gone, dur: 3.2 });
    directorOf(w)?.arrows.push({ from: p, to: () => ({ x: q.x, y: q.y }), color: slotColor(p.slot), until: gone });
    clog('prompt', { det: 'D12', slot: p.slot });
  }
}

void Rich; void Hud.multi;
