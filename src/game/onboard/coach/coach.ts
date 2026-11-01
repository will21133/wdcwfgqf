// The adaptive coach (ONBOARD2 §6): in a fight, the first, second and third time a hand needs
// rewind, the screen shows "now press this, this happens" — and then it fades as the hand learns.
//
//   CoachDirector   one per room world (GameHooks.onRoomStart): listens to the room's bus, draws the
//                   coach's only world marks (the hairspring light dots to the Shadow, the » arrows to
//                   an echo or a fallen teammate) — never a word in the world
//   SeatCoach       one per seat: the level L3 → L0 and its counts (slot I: Flags, guests: session)
//   Opportunity     one undoable hit per seat, straight from the real F3 data (rewindPreview,
//                   canRewind): valid while the Shadow still stands before the hit
//   detectors.ts    D2–D12 (this file runs D1, the core)
//
// Levels: L3 a big card (tier S) + 0.3× slow motion inside the post-hit invulnerability only ·
// L2 one line · L1 a chip in the pod · L0 off. self-undo 2 / 4 / 6 → one level down each; missed
// twice in a room → one level up for the next hit; a death that rewind could have prevented → at
// least L2 next run. All text goes through the Stage (it never covers a hand, an echo, a warning);
// all timing is real time from the Stage update or sim time from world.after — never setTimeout,
// never world.rng.
import type { Player } from '../../entities/player';
import type { World } from '../../world/world';
import type { Renderer } from '../../../engine/gfx/renderer';
import type { BusEvents } from '../../systems/bus';
import { Entity } from '../../entities/entity';
import { G, sfx } from '../../G';
import { S } from '../../strings';
import { tr, type L10n } from '../../i18n';
import { Flags, Stats } from '../../meta/registry';
import { profile } from '../../save';
import { settings } from '../../settings';
import { GameHooks } from '../../hooks';
import { GameScene } from '../../scenes/game';
import { col } from '../../../art/palette';
import { slotColor } from '../../players';
import { Onboard, Tut } from '../core';
import { Stage, type SayHandle } from '../stage';
import { Beat } from '../beat';
import { Lessons } from '../lesson';
import { RewindHudHooks } from '../../ui/rewindHud';
// detectors.ts and coach.ts use each other only inside functions (no top-level use: the cycle is safe)
import { Detect } from './detectors';
import '../../strings/coach';

export type Lvl = 0 | 1 | 2 | 3;
const C = (k: string): L10n => S('coach', k);

// ───────────────────────── tuning (ONBOARD2 §6.3–§6.8) ─────────────────────────
/** a hit worth coaching: 10% of max HP, at least 5 (Tick's 50 HP → 5: a scratch never interrupts) */
export const GAIN_MIN = (p: Player) => Math.max(5, Math.round(0.1 * p.maxHp));
/** real seconds a hand gets to press on its own before the prompt (shown < 2: almost at once) */
const GRACE: Record<Lvl, number> = { 0: 0.6, 1: 0.6, 2: 0.45, 3: 0.3 };
const GRACE_NEW = 0.05;
/** the L3 card shrinks to an L2 line after this long; an L2 line stays at most this long; L1 chip */
const L3_CARD_T = 2.4, L2_T = 1.8, L1_T = 1.2;
/** solo slow motion: 0.3× for 0.9 real s; co-op: a r72 bubble at 0.4× for 0.6 s */
const SLOW_SCALE = 0.3, SLOW_DUR = 0.9, BUBBLE_R = 72, BUBBLE_SCALE = 0.4, BUBBLE_DUR = 0.6;
const SLOW_LIFE = 6, SLOW_ROOM = 2, SLOW_GAP = 10;
/** D1: between two prompts on a seat (real s), prompts per room, coach prompts per room and seat */
const D1_GAP = 4, D1_ROOM = 4, PROMPTS_ROOM = 4, ROOM_QUIET_T = 1.0;

// ───────────────────────── debug overrides (ONBOARD2 §11.6) ─────────────────────────
const urlCoach = (): string | null => G.debug.get('coach');
/** ?coach=L3 … L0: the level is pinned for this session */
function urlLevel(): Lvl | null {
  const v = urlCoach();
  const m = v && /^L([0-3])$/.exec(v);
  return m ? (+m[1] as Lvl) : null;
}
const urlSlowOff = () => G.debug.get('coachslow') === '0';
/** ?coachdet=D4,D6 … : those detectors ignore their lifetime / room caps (screenshots) */
export function forcedDet(id: string): boolean {
  const v = G.debug.get('coachdet');
  return !!v && v.split(',').includes(id);
}
const forcedOnce = new Set<string>();

// ───────────────────────── seats ─────────────────────────
export interface RoomCounts { w: World | null; prompts: number; ignored: number; missed: number; slow: number; d1: number; once: Set<string> }
export interface SeatCoach {
  slot: number;
  lvl: Lvl;
  self: number; coached: number; ignored: number; missed: number; slowmos: number; shown: number;
  /** last 10 opportunities, newest in bit 0: 1 = undone */
  hist: number; histN: number;
  /** the decay counts again from here after a bump (halved thresholds) */
  selfAt: number; coachedAt: number; bumped: boolean;
  /** next D1 one level up (missed twice in a room) / forced to a scripted L3 / quiet (a lesson speaks) */
  bumpNext: boolean; scripted: boolean; quiet: boolean;
  /** G.time when a guest joined (its first 30 s: at least L2) */
  joinedAt: number;
  /** this run: undoable hits, self-undos */
  runOpps: number; runSelf: number;
  room: RoomCounts;
  lastD1: number; lastSlow: number;
  /** sim time of the last hit taken (calm() for D4) */
  lastHitT: number;
  wasRw: boolean;
}
const seats = new Map<number, SeatCoach>();
const FKEYS: (keyof SeatCoach)[] = ['lvl', 'self', 'coached', 'ignored', 'missed', 'slowmos', 'shown', 'hist', 'histN', 'selfAt', 'coachedAt'];

function freshRoom(): RoomCounts { return { w: null, prompts: 0, ignored: 0, missed: 0, slow: 0, d1: 0, once: new Set() }; }
export function seatOf(slot: number): SeatCoach {
  let s = seats.get(slot);
  if (s) return s;
  s = {
    slot, lvl: 3, self: 0, coached: 0, ignored: 0, missed: 0, slowmos: 0, shown: 0, hist: 0, histN: 0, selfAt: 0, coachedAt: 0, bumped: false,
    bumpNext: false, scripted: false, quiet: false, joinedAt: -99, runOpps: 0, runSelf: 0, room: freshRoom(), lastD1: -99, lastSlow: -99, lastHitT: -99, wasRw: false,
  };
  if (slot === 0) {
    // slot I lives in the profile; a new profile starts at L3 (the prologue's L3 / L6 cards were shown)
    if (!('coach.lvl' in profile.flags)) { Flags.set('coach.lvl', 3); Flags.set('coach.shown', profile.prologueDone ? 2 : 0); }
    for (const k of FKEYS) (s as unknown as Record<string, number>)[k] = Flags.get('coach.' + k);
    s.lvl = Math.max(0, Math.min(3, s.lvl)) as Lvl;
    s.bumped = Flags.get('coach.bumped') > 0;
  } else {
    // a guest: "first time?" → L3, otherwise a veteran at L2 (ONBOARD2 §5.10, §6.3)
    s.lvl = Onboard.seat(slot).novice ? 3 : 2;
    s.joinedAt = G.time;
  }
  seats.set(slot, s);
  return s;
}
function save(s: SeatCoach) {
  if (s.slot !== 0) return;
  for (const k of FKEYS) Flags.set('coach.' + k, (s as unknown as Record<string, number>)[k]);
  Flags.set('coach.bumped', s.bumped ? 1 : 0);
}
/** the last ten opportunities' undo rate */
function rate10(s: SeatCoach): number {
  const n = Math.min(10, s.histN);
  if (!n) return 0;
  let k = 0;
  for (let i = 0; i < n; i++) if (s.hist & (1 << i)) k++;
  return k / n;
}
function pushHist(s: SeatCoach, undone: boolean) {
  s.hist = ((s.hist << 1) | (undone ? 1 : 0)) & 0x3ff;
  s.histN = Math.min(10, s.histN + 1);
}
/** fade with learning (auto): self 2 / 4 / 6 (guests and after a bump: 1 / 2 / 3) */
function decay(s: SeatCoach) {
  const half = s.slot !== 0 || s.bumped;
  const T = half ? [1, 2, 3] : [2, 4, 6], CT = half ? 2 : 3;
  const self = s.self - s.selfAt, coached = s.coached - s.coachedAt;
  let target: Lvl = 3;
  if (self >= T[0] || coached >= CT) target = 2;
  if (self >= T[1]) target = 1;
  if (self >= T[2] && rate10(s) >= 0.5) target = 0;
  if (target < s.lvl) { Tut.log('coach', { ev: 'level', slot: s.slot, from: s.lvl, to: target }); s.lvl = target; }
}
/** back up after a death rewind could have prevented, or two runs without a single self-undo */
export function bumpSeat(slot: number, why: string) {
  const s = seatOf(slot);
  const to: Lvl = s.lvl === 0 && why === 'death' ? 1 : (Math.max(s.lvl, 2) as Lvl);
  if (to !== s.lvl) Tut.log('coach', { ev: 'level', slot, from: s.lvl, to, why });
  s.lvl = to; s.selfAt = s.self; s.coachedAt = s.coached; s.bumped = true;
  save(s);
}

// ───────────────────────── who is coached, at what level ─────────────────────────
const isBot = (p: Player) => p.input?.kind === 'bot' && !G.debug.has('coachbots');
/** does the coach speak to this hand at all? (red line 4: never to a bot; ?bot=1 → off) */
export function coachable(p: Player | null | undefined): boolean {
  if (!p || isBot(p)) return false;
  const u = urlCoach();
  if (u === 'off' || u === 'L0') return false;
  if (u) return true;
  if (settings.coach === 'off') return false;
  const m = Onboard.mode();
  if (m === 'skip' || m === 'off') return false;
  const rm = p.world?.run?.config?.mode;
  if (rm && rm !== 'standard' && rm !== 'practice') return false;
  return true;
}
const sceneOf = () => (G.scenes.current instanceof GameScene ? G.scenes.current : null);
const inHall = (w: World) => { const sc = sceneOf(); return !!sc && sc.world === w && sc.opt.kind === 'rehearsal'; };
/** the level a D1 would use for this hand right now */
export function effLevel(p: Player): Lvl {
  if (!coachable(p)) return 0;
  const s = seatOf(p.slot);
  if (s.scripted) return 3;
  const forced = urlLevel();
  if (Onboard.mode() === 'lite' && !urlCoach()) return Flags.get('coach.liteShown') < 2 && p.slot === 0 ? 2 : 0;
  // ?coach=L2 pins the base level for tests; the missed-twice bump still lifts it
  let l: number = forced ?? s.lvl;
  if (forced === null && (settings.coach === 'always' || urlCoach() === 'always')) l = Math.max(l, 2);
  if (s.bumpNext) l = Math.min(3, l + 1);
  if (s.slot !== 0 && G.time - s.joinedAt < 30) l = Math.max(l, 2);
  const sc = sceneOf();
  if (sc?.boss) l = Math.min(l, 1);
  return l as Lvl;
}

// ───────────────────────── the coach's log (__tut.coach.log) ─────────────────────────
export const coachLog: { t: number; ev: string; det?: string; slot?: number; lvl?: number; form?: string }[] = [];
export function clog(ev: string, o: { det?: string; slot?: number; lvl?: number; form?: string } = {}) {
  const w = sceneOf()?.world;
  coachLog.push({ t: +(w?.time ?? G.time).toFixed(2), ev, ...o });
  if (coachLog.length > 400) coachLog.splice(0, coachLog.length - 400);
  Tut.log('coach', { ev, ...o });
}
/** what each seat's coach line looks like now (form per Stage key) */
export const shownForm = new Map<string, string>();
export function say(o: Parameters<typeof Stage.say>[0]): SayHandle {
  shownForm.set(o.key + ':' + (o.slot ?? -1), o.form ?? 'line');
  return Stage.say(o);
}

// ───────────────────────── suppression (ONBOARD2 §6.8) ─────────────────────────
/** nothing new may start for this hand now */
export function suppressed(p: Player): boolean {
  const sc = sceneOf();
  if (!sc || p.world !== sc.world) return true;
  if (G.scenes.transitioning || sc.overlays.some((o) => o.blocks)) return true;
  if (sc.boss && sc.boss.inIntro) return true;
  if (p.rw || p.state !== 'alive' || p.anchorT > 0 || p.rec.burnT > 0) return true;
  if (Lessons.active(p) || seatOf(p.slot).quiet) return true;
  return false;
}
/** a seat's coach-prompt budget in this room (D1 D4 D6 D9 D12 count; D2 D3 and the beats do not) */
export function roomOf(p: Player): RoomCounts {
  const s = seatOf(p.slot);
  if (s.room.w !== p.world) { s.room = freshRoom(); s.room.w = p.world; }
  return s.room;
}
export function budgetLeft(p: Player): boolean { return roomOf(p).prompts < PROMPTS_ROOM; }
export function spendBudget(p: Player) { roomOf(p).prompts++; }

// ───────────────────────── the opportunity (ONBOARD2 §6.4) ─────────────────────────
interface Opp {
  p: Player;
  tHit: number;
  gain0: number;
  /** level it was shown at (0 = not shown, -1 = decided to stay silent) */
  shown: number;
  /** real seconds on screen */
  shownT: number;
  grace: number;
  handle: SayHandle | null;
  pressedWhileShown: boolean;
  validAtPress: boolean;
  gainAtPress: number;
  pressT: number;
}
const opps = new Map<number, Opp>();
/** our solo slow motion (so we only ever undo our own) */
let slowOurs: { w: World; p: Player; t: number } | null = null;
/** lowest invulnerability seen while our slow motion ran (the red-line eval) */
let slowMinInv = Infinity;

function oppValid(o: Opp): { valid: boolean; frac: number; sand: boolean } {
  const p = o.p, w = p.world;
  const pv = p.rewindPreview();
  const cr = p.canRewind();
  const remaining = pv.seconds - (w.time - o.tHit);
  const valid = p.state === 'alive' && cr.ok && pv.hpGain >= GAIN_MIN(p) && remaining > 0;
  return { valid, frac: Math.max(0, Math.min(1, remaining / Math.max(0.5, p.mods.tapeLen))), sand: cr.reason === 'sand' };
}
function liveNums(p: Player) { const pv = p.rewindPreview(); return { n: pv.hpGain, c: pv.cost }; }
function fillL(k: string, vars: Record<string, string | number>): L10n {
  const t = C(k);
  const f = (s: string) => s.replace(/\{(\w+)\}/g, (m, v) => (v in vars ? String(vars[v]) : m));
  return { zh: f(t.zh), en: f(t.en) };
}

function showD1(o: Opp, lvl: Lvl) {
  const p = o.p, s = seatOf(p.slot), w = p.world;
  const nums = () => liveNums(p);
  const timer = () => oppValid(o).frac;
  const pressed = () => (p.input.down('rewind') ? PRESS_SET : EMPTY_SET);
  o.shown = lvl;
  o.shownT = 0;
  if (lvl === 3) {
    o.handle = say({
      key: 'coach.d1', slot: p.slot, who: p.input, tier: 'S', form: 'card', critical: true,
      text: C('l3Title'), sub: fillL('l3Sub', nums()), sub2: s.shown < 2 ? C('l3Sub2') : undefined,
      timer, pressed, spot: ['shadow', 'hpStripe'], until: () => !opps.has(p.slot) || opps.get(p.slot) !== o,
    });
    RewindHudHooks.pulse(p, 0.4);
    sfx('coachTick', { vol: 0.25 });
    p.input.rumble(0.15, 0.25, 80);
    trySlowmo(p, s);
  } else if (lvl === 2) {
    o.handle = say({
      key: 'coach.d1', slot: p.slot, who: p.input, tier: 'A', critical: true, text: C('l2'), vars: nums, timer, pressed, dur: L2_T,
      until: () => opps.get(p.slot) !== o,
    });
  } else {
    o.handle = say({ key: 'coach.d1', slot: p.slot, who: p.input, tier: 'B', form: 'chip', text: C('l1'), vars: nums, dur: L1_T, color: 'C3', pressed });
  }
  s.shown++; s.room.d1++; spendBudget(p);
  s.lastD1 = G.time; s.bumpNext = false; s.scripted = false;
  if (Onboard.mode() === 'lite' && p.slot === 0) Flags.inc('coach.liteShown');
  save(s);
  clog('prompt', { det: 'D1', slot: p.slot, lvl, form: lvl === 3 ? 'card' : lvl === 2 ? 'line' : 'chip' });
  void w;
}
const PRESS_SET: ReadonlySet<import('../../../engine/input').Action> = new Set(['rewind']);
const EMPTY_SET: ReadonlySet<import('../../../engine/input').Action> = new Set();

/**
 * L3's slow motion (ONBOARD2 §6.7, red line 2): only right after a hit, only inside its
 * invulnerability (0.75 s of the hand's time = 2.5 real s at 0.3×, longer than the 0.9 s slow),
 * never twice within 10 s, ≤ 2 a room, ≤ 6 a lifetime, off with the setting.
 */
function trySlowmo(p: Player, s: SeatCoach) {
  const w = p.world;
  if (!settings.coachSlowmo || urlSlowOff()) return;
  if (s.slowmos >= SLOW_LIFE && !urlLevel() && !forcedDet('slow')) return;
  if (s.room.slow >= SLOW_ROOM || G.time - s.lastSlow < SLOW_GAP) return;
  if (w.timeScale !== 1 || w.bubbles.list.length > 0) return;
  const solo = w.playerCount <= 1;
  // the whole slow must fit in what is left of the invulnerability (in the hand's own time)
  if (solo ? p.invuln < SLOW_SCALE * SLOW_DUR + 0.03 : p.invuln < 0.1) return;
  if (solo) {
    w.slowmo(SLOW_SCALE, SLOW_DUR);
    G.audio.duck(0.5, SLOW_DUR);
    slowOurs = { w, p, t: 0 };
    slowMinInv = p.invuln;
  } else {
    // co-op: only the air around this hand slows; teammates keep their time (and it ends with the invulnerability)
    w.bubbles.push({ x: p.x, y: p.y, r: BUBBLE_R, scale: BUBBLE_SCALE, dur: Math.min(BUBBLE_DUR, p.invuln), owner: p });
  }
  s.slowmos++; s.room.slow++; s.lastSlow = G.time;
  clog('slowmo', { slot: p.slot });
}
function endSlowmo() {
  if (!slowOurs) return;
  const w = slowOurs.w;
  // never undo somebody else's slow (the Last Second, a Tick-Dodge)
  if (w.timeScale === SLOW_SCALE) { w.timeScale = 1; w.slowT = 0; }
  slowOurs = null;
}

function expire(o: Opp, sandShort: boolean) {
  const p = o.p, s = seatOf(p.slot), room = roomOf(p);
  opps.delete(p.slot);
  o.handle?.close();
  if (p.state !== 'alive') return; // stopped: the Last Second (D11) / a pull-back (D12) take over
  s.runOpps++;
  pushHist(s, false);
  if (o.shown > 0) {
    s.ignored++; room.ignored++;
    clog('expired', { det: 'D1', slot: p.slot });
    Detect.missed(p, o.tHit);
  } else {
    s.missed++;
    clog('missed', { det: 'D1', slot: p.slot });
  }
  // missed twice in a room (shown or not): the next hit's prompt is one level up (ONBOARD2 §6.3)
  room.missed++;
  if (room.missed >= 2) s.bumpNext = true;
  if (sandShort) Detect.sandShort(p);
  save(s);
}

function onDamaged(e: BusEvents['damaged']) {
  const p = e.player;
  if (!p || !p.world) return;
  const s = seatOf(p.slot);
  s.lastHitT = p.world.time;
  if (!coachable(p) || !e.undoable || e.dealt <= 0) return;
  if (inHall(p.world) && !s.scripted) return;
  const cur = opps.get(p.slot);
  if (cur) { cur.tHit = p.world.time; return; }
  Detect.damaged(p, e);
  const lvl = effLevel(p);
  const grace = s.shown < 2 ? GRACE_NEW : GRACE[lvl];
  opps.set(p.slot, { p, tHit: p.world.time, gain0: 0, shown: 0, shownT: 0, grace, handle: null, pressedWhileShown: false, validAtPress: false, gainAtPress: 0, pressT: -1 });
}

function onPress(p: Player) {
  const o = opps.get(p.slot);
  if (o) {
    o.pressedWhileShown = o.shown > 0 && !!o.handle && o.shownT < 99;
    o.validAtPress = oppValid(o).valid || p.rewindPreview().hpGain >= GAIN_MIN(p);
    o.gainAtPress = p.tapGain();
    o.pressT = G.time;
  }
  // the press ends our slow at once: the rewinder runs on real time anyway, the world catches up
  if (slowOurs && slowOurs.p === p) endSlowmo();
}

function onRewind(e: BusEvents['rewind']) {
  const p = e.player;
  if (!p || !coachable(p)) return;
  const s = seatOf(p.slot);
  const o = opps.get(p.slot);
  const restored = e.restored ?? 0;
  if (o) { opps.delete(p.slot); o.handle?.close(); }
  if (inHall(p.world) && !o) return;
  if (o && o.pressedWhileShown) {
    s.coached++; s.runOpps++; pushHist(s, true);
    clog('success', { det: 'D1', slot: p.slot });
    Beat.success({ p, id: 'coach.undo', stamp: C('undoneStamp'), why: C('undoneWhy'), dur: 2.0 });
    if (p.slot === 0 && Flags.get('coach.first') === 0) {
      Flags.set('coach.first', 1);
      say({ key: 'coach.first', slot: p.slot, tier: 'C', text: C('undoneFirst'), dur: 2.4, maxWait: 4 });
    }
  } else if (restored >= 5) {
    s.self++; s.runSelf++;
    if (o) { s.runOpps++; pushHist(s, true); }
    clog('self', { slot: p.slot });
    const k = p.slot === 0 ? Flags.inc('coach.selfBeat') : s.self;
    if (k <= 3) say({ key: 'coach.self', slot: p.slot, tier: 'C', text: C('selfUndo'), dur: 1.6, maxWait: 4 });
  }
  if (e.scrub && restored === 0 && o && o.validAtPress) Detect.scrubShort(p, o.gainAtPress);
  decay(s);
  save(s);
}

// ───────────────────────── the room entity (world marks only) ─────────────────────────
export interface Arrow { from: Player; to: { x: number; y: number } | (() => { x: number; y: number } | null); color: string; until: () => boolean }
export class CoachDirector extends Entity {
  arrows: Arrow[] = [];
  constructor() { super(); this.collides = false; this.solid = false; }
  added() {
    const w = this.world;
    w.bus.on('damaged', onDamaged, this);
    w.bus.on('rewind', onRewind, this);
    Detect.listen(w, this);
  }
  update() {}
  render() {}
  renderUnlit(r: Renderer) {
    const u = r.u;
    const t = G.time;
    // L3: light dots run along the hairspring from the hand to its Shadow ("you go back there")
    for (const o of opps.values()) {
      if (o.shown !== 3 || o.p.world !== this.world || o.p.rw) continue;
      const p = o.p, pv = p.rewindPreview();
      const dx = pv.x - p.x, dy = pv.y - 6 - (p.y - 10), d = Math.hypot(dx, dy);
      if (d < 8) continue;
      u.fillStyle = col('C4');
      for (let k = 0; k < 3; k++) {
        const f = ((t * 1.6 + k / 3) % 1);
        const x = Math.round(p.x + dx * f), y = Math.round(p.y - 10 + dy * f);
        u.globalAlpha = 0.85 * Math.sin(f * Math.PI);
        u.fillRect(x, y, 2, 2);
      }
      u.globalAlpha = 1;
    }
    // » arrows (D4: toward the echo; D12: toward the fallen teammate): three chevrons flowing along
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      if (a.until() || a.from.dead) { this.arrows.splice(i, 1); continue; }
      const to = typeof a.to === 'function' ? a.to() : a.to;
      if (!to) continue;
      const fx = a.from.x, fy = a.from.y - 8, dx = to.x - fx, dy = to.y - 8 - fy, d = Math.hypot(dx, dy);
      if (d < 30) continue;
      const ux = dx / d, uy = dy / d;
      for (let k = 0; k < 3; k++) {
        const f = 18 + (((t / 0.5 + k / 3) % 1) * (d - 36));
        chevron(u, fx + ux * f, fy + uy * f, ux, uy, a.color);
      }
    }
  }
}
/** a 1 px » pointing along (ux, uy), with a dark under-pixel */
function chevron(u: CanvasRenderingContext2D, x: number, y: number, ux: number, uy: number, c: string) {
  const px = -uy, py = ux;
  for (const [o, side] of [[0, 1], [0, -1]] as const) {
    for (let k = 0; k < 4; k++) {
      const bx = x - ux * k + px * k * side + o, by = y - uy * k + py * k * side;
      u.fillStyle = col('K0'); u.fillRect(Math.round(bx), Math.round(by) + 1, 1, 1);
      u.fillStyle = col(c); u.fillRect(Math.round(bx), Math.round(by), 1, 1);
    }
  }
}
const directors = new WeakMap<World, CoachDirector>();
export function directorOf(w: World): CoachDirector | null { return directors.get(w) ?? null; }

GameHooks.onRoomStart(({ w }) => {
  opps.clear();
  endSlowmo();
  const d = new CoachDirector();
  directors.set(w, d);
  w.add(d);
});
GameHooks.onRunStart(() => {
  for (const s of seats.values()) { s.runOpps = 0; s.runSelf = 0; }
  // a death rewind could have prevented → the next run starts at least at L2 (L0 → L1)
  if (Flags.get('coach.owed') > 0) { Flags.set('coach.owed', 0); bumpSeat(0, 'death'); }
});
GameHooks.onRunEnd(() => {
  const s = seats.get(0);
  if (!s) return;
  // two runs in a row with ≥ 4 undoable hits and not one self-undo → back to L2
  if (s.runOpps >= 4 && s.runSelf === 0) {
    const n = Flags.inc('coach.noSelfRuns');
    if (n >= 2) { Flags.set('coach.noSelfRuns', 0); bumpSeat(0, 'noSelf'); }
  } else Flags.set('coach.noSelfRuns', 0);
});

// ───────────────────────── the real-time tick (Stage update: runs through hit-stop) ─────────────────────────
Stage.onUpdate((dt) => {
  const sc = sceneOf();
  const w = sc?.world;
  if (!sc || !w) return;
  if (sc.overlays.some((o) => o.blocks)) return;
  for (const p of w.players) {
    const s = seatOf(p.slot);
    if (p.rw && !s.wasRw) onPress(p);
    s.wasRw = !!p.rw;
  }
  for (const o of [...opps.values()]) {
    const p = o.p;
    if (p.world !== w) { opps.delete(p.slot); continue; }
    if (p.rw) {
      // pressed: the 'rewind' event settles it. The card leaves 0.1 s after the press (it has been
      // answered), so it is gone before the success card arrives and never ghosts underneath it.
      if (o.handle && o.pressT >= 0 && G.time - o.pressT >= 0.1) { o.handle.close(); o.handle = null; }
      continue;
    }
    const v = oppValid(o);
    if (!v.valid) { expire(o, v.sand); continue; }
    if (o.shown === 0) {
      if (w.stop <= 0) o.grace -= dt;
      if (o.grace <= 0) {
        const lvl = effLevel(p);
        const s = seatOf(p.slot), room = roomOf(p);
        const capsOk = s.scripted || forcedOnce.delete('D1') || (w.time >= ROOM_QUIET_T && G.time - s.lastD1 >= D1_GAP && room.d1 < D1_ROOM && room.ignored < 2 && budgetLeft(p));
        if (lvl > 0 && capsOk && !suppressed(p)) showD1(o, lvl); else o.shown = -1;
      }
      continue;
    }
    if (o.shown < 0) continue;
    o.shownT += dt;
    // the card's numbers follow the live preview (consecutive hits, Sand)
    if (o.shown === 3 && o.handle) {
      if (o.shownT < L3_CARD_T) o.handle.update({ sub: fillL('l3Sub', liveNums(p)) });
      else if (o.shownT - dt < L3_CARD_T) {
        // still valid after 2.4 s: the card folds into one line until the chance is gone
        o.handle.close();
        o.handle = say({ key: 'coach.d1late', slot: p.slot, who: p.input, tier: 'A', critical: true, text: C('l3Late'), vars: () => liveNums(p), timer: () => oppValid(o).frac, until: () => opps.get(p.slot) !== o });
      }
    }
  }
  // the red line, enforced every frame: our slow never outlives the invulnerability
  if (slowOurs) {
    const p = slowOurs.p;
    slowOurs.t += dt;
    slowMinInv = Math.min(slowMinInv, p.invuln);
    if (slowOurs.w !== w || p.state !== 'alive' || p.invuln <= 0.02 || slowOurs.t >= SLOW_DUR + 0.05) endSlowmo();
  }
  Detect.tick(w, dt);
});

// ───────────────────────── Onboard.coach (F4a's interface) + __tut.coach ─────────────────────────
Onboard.coach = {
  quiet(slot, on) { seatOf(slot).quiet = on; if (on) { const o = opps.get(slot); if (o) { o.handle?.close(); opps.delete(slot); } } },
  scripted(p) { seatOf(p.slot).scripted = true; },
  level(slot) { return seatOf(slot).lvl; },
  busy() { return Stage.list().some((e) => e.placed && e.key.startsWith('coach.')); },
};
/** the death card asks the coach to come back next run (C1 / C2) */
export function oweLevel() { Flags.set('coach.owed', 1); }

const lvlName = (l: number) => `L${l}`;
Tut.register('coach', {
  level(slot = 0) { const w = sceneOf()?.world; const p = w?.players.find((q) => q.slot === slot); return lvlName(p ? effLevel(p) : seatOf(slot).lvl); },
  state(slot = 0) {
    const s = seatOf(slot);
    return { lvl: s.lvl, self: s.self, coached: s.coached, ignored: s.ignored, missed: s.missed, slowmos: s.slowmos, shown: s.shown, rate10: +rate10(s).toFixed(2),
      room: { prompts: s.room.prompts, ignored: s.room.ignored, missed: s.room.missed, slow: s.room.slow, d1: s.room.d1 },
      bumpNext: s.bumpNext, opp: !!opps.get(slot), slowMinInv: slowMinInv === Infinity ? null : +slowMinInv.toFixed(3), slowOn: !!slowOurs };
  },
  visible(slot?: number) {
    const c = Stage.current(slot);
    if (!c || !(c.key.startsWith('coach.') || c.key === 'onboard.success')) return null;
    const form = shownForm.get(c.key + ':' + (slot ?? 0)) ?? shownForm.get(c.key + ':-1') ?? (c.key === 'onboard.success' ? 'success' : 'line');
    return { ...c, form };
  },
  log: coachLog,
  force(det: string, slot = 0) {
    forcedOnce.add(det);
    if (det === 'D1') { const s = seatOf(slot); s.lastD1 = -99; s.room.d1 = 0; s.room.ignored = 0; s.room.prompts = 0; }
  },
  seats: () => [...seats.values()].map((s) => ({ slot: s.slot, lvl: s.lvl, self: s.self })),
});

export function forcedOnceTake(id: string): boolean { return forcedOnce.delete(id); }
void tr; void Stats; void slotColor;
