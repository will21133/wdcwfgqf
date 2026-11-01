// Onboarding state (ONBOARD2 §5.3, §5.9, §5.10, §11.5): who is a novice, what they were taught,
// the guidance mode, the guest seats' session records, and the `window.__tut` test surface.
//
// A leaf module on purpose: gates.ts (read by player.ts / hud.ts / rewindHud.ts every frame) and
// every onboarding file import it, so it only depends on the save, the registries and settings —
// never on scenes, the HUD or the Stage (that would make an import cycle through hud.ts).
// onboard/index.ts re-exports Onboard and Tut; F4b assigns Onboard.coach and Onboard.deathCard.
//
// Nothing here changes how the game plays: the gates read it (gates.ts), and until the prologue
// lands the gates stay open unless a test asks for them (Gates.live).
import type { Player } from '../entities/player';
import { G } from '../G';
import { profile, saveProfile } from '../save';
import { Teach, Flags } from '../meta/registry';
import { settings, saveSettings } from '../settings';

/**
 * full = the adaptive coach, lessons after fights, gates, mastery prompts (default)
 * lite = coach only on the first 2 undoable hits, no lessons, gates open (notes + Hall)
 * off  = no coach, lessons, gates or prompts (safety notes only)
 * skip = everything counts as already learned: ?bot=1, ?onboard=skip, a direct debug run
 *        (?seed= / ?room= … without ?onboard=), non-standard runs (daily, custom, rush)
 */
export type OnboardMode = 'full' | 'lite' | 'off' | 'skip';
export type TeachHow = 'lesson' | 'recognised' | 'soft' | 'skip';

/** the F4b coach (default: silent) — onboard/coach/coach.ts replaces Onboard.coach */
export interface CoachApi {
  /** a lesson on this seat speaks for itself: the coach stays quiet */
  quiet(slot: number, on: boolean): void;
  /** the next D1 on this hand is a scripted L3 card (prologue L6, the Hall) */
  scripted(p: Player, det: 'hit'): void;
  level(slot: number): 0 | 1 | 2 | 3;
  /** a coach prompt is on screen */
  busy(): boolean;
}
/** the F4b death card (default: never shown) — onboard/coach/deathCard.ts replaces Onboard.deathCard */
export interface DeathCardApi { active(): boolean; lastSnap(): unknown }

/** a guest seat (slots II–IV) this session: its own novice flag and taught set (not saved) */
export interface SeatRecord { novice: boolean; taught: Set<string> }

/** the verbs S0–S2 the first-launch "I know how to play" and the pause menu's "skip" mark taught */
export const CORE_VERBS = ['move', 'attack', 'dash', 'undo', 'echo', 'paradox', 'fork', 'scrub'] as const;
/** Ines's notes the lessons make redundant in full mode (ONBOARD2 §5.11): note id → Teach id */
export const NOTE_COVERS: Record<string, string> = {
  armed_echo: 'paradox', fork_ready: 'fork', scrub: 'scrub', sync: 'sync', culprit: 'culprit', chain: 'chain', tick_dodge: 'tick',
};
/** every Teach id a "reset tutorial progress" clears (with their ':soft' variants) */
export const TEACH_VERBS = ['move', 'attack', 'dash', 'undo', 'echo', 'paradox', 'fork', 'scrub', 'sync', 'culprit', 'tick', 'chain', 'perfect', 'pierce', 'fixed', 'lastSecond', 'recall', 'duet', 'pullBack', 'tandem'];

const DIRECT_KEYS = ['seed', 'room', 'floor', 'spawn', 'offer', 'god', 'players', 'devices'];
let urlCache: { mode: OnboardMode | null; direct: boolean } | null = null;
function url() {
  if (urlCache) return urlCache;
  const q = G.debug;
  const o = q.get('onboard');
  let mode: OnboardMode | null = null;
  // ?bot=1 is the QA autopilot: it plays like someone who knows the game (ONBOARD2 §11.6, §12.5)
  if (q.has('bot') && !q.has('autoplay')) mode = 'skip';
  else if (o === 'skip' || o === 'lite' || o === 'off' || o === 'full') mode = o;
  // a debug run straight into a room (boot.ts "direct") without ?onboard= keeps v2-F3 behaviour,
  // so the F3 scripts (rewind2*.json: hold to scrub, fork at once) keep working
  const direct = !q.has('scene') && DIRECT_KEYS.some((k) => q.has(k));
  if (!mode && !o && direct) mode = 'skip';
  return (urlCache = { mode, direct });
}

let forced: OnboardMode | null = null;
const seats = new Map<number, SeatRecord>();
/** providers the rest of the onboarding package plugs in (kept here so this module stays a leaf) */
export const OnboardHooks = {
  /** is a lesson for this Teach id waiting in the Calm queue? (calm.ts) */
  queued: (_id: string): boolean => false,
};

export const Onboard = {
  /** the guidance mode now: debug overrides > ?bot / ?onboard= / direct debug runs > settings */
  mode(): OnboardMode {
    if (forced) return forced;
    return url().mode ?? settings.onboarding;
  },
  /** a debug route or test sets the mode for this session (null = back to the normal rules) */
  force(m: OnboardMode | null): void { forced = m; },
  /** started straight into a room from the URL (boot.ts "direct" path) */
  get directDebug(): boolean { return url().direct; },
  /**
   * do the gates and the coach apply to this hand? Slot I in full mode (its saved profile); a
   * guest seat that said "first time?" (SeatTeach); never a bot, never a non-standard run.
   */
  isNovice(p: Player | null | undefined): boolean {
    if (!p) return false;
    if (Onboard.mode() !== 'full') return false;
    if (p.input?.kind === 'bot' && !G.debug.has('coachbots')) return false;
    const rm = p.world?.run?.config?.mode;
    if (rm && rm !== 'standard' && rm !== 'practice') return false;
    if (p.slot === 0) return true;
    return seats.get(p.slot)?.novice ?? false;
  },
  /** has this hand been taught `id`? (slot I: Teach in the profile; guests: this session) */
  taught(p: Player | null | undefined, id: string): boolean {
    const m = Onboard.mode();
    if (m === 'skip') return true;
    if (!p || p.slot === 0) return Teach.has(id);
    const s = seats.get(p.slot);
    return s ? s.taught.has(id) : true;
  },
  /** taught, or let through without the lesson (`fork:soft` after two postponements, a skipped lesson) */
  learned(p: Player | null | undefined, id: string): boolean {
    return Onboard.taught(p, id) || Onboard.taught(p, id + ':soft');
  },
  /** record that a hand learned `id` (how = 'soft' records `id:soft`: open, but not "learned") */
  mark(p: Player | null | undefined, id: string, how: TeachHow = 'lesson'): void {
    const key = how === 'soft' ? id + ':soft' : id;
    if (!p || p.slot === 0) Teach.mark(key);
    else seat(p.slot).taught.add(key);
    Tut.log('taught', { id: key, slot: p?.slot ?? 0, how });
  },
  /**
   * "I know how to play" (first-launch card B, pause menu, skip the prologue): the core verbs and
   * the Hall's first three ticks are marked, guidance drops to lite, the coach to L0. The prologue
   * counts as done (no shards for it).
   */
  skipAll(): void {
    for (const v of CORE_VERBS) Teach.mark(v);
    for (const v of ['undo', 'echo', 'paradox']) Teach.mark('hall.' + v);
    profile.prologueDone = true;
    Flags.set('coach.lvl', 0);
    settings.onboarding = 'lite';
    saveSettings();
    saveProfile();
    Tut.log('skipAll');
  },
  /** settings → "reset tutorial progress": verbs, soft unlocks and onboard/coach/prompt flags (rewards and Hall stars stay) */
  reset(): void {
    const drop = new Set<string>();
    for (const v of TEACH_VERBS) { drop.add(v); drop.add(v + ':soft'); }
    profile.taught = profile.taught.filter((id) => !drop.has(id));
    for (const k of Object.keys(profile.flags)) if (/^(onboard|coach|prompt)\./.test(k)) delete profile.flags[k];
    saveProfile();
    for (const s of seats.values()) s.taught.clear();
    Tut.log('reset');
  },
  /** should Ines's note `hintId` stay quiet because a lesson covers it? (P7 wraps Hints.define with it) */
  covers(hintId: string): boolean {
    if (Onboard.mode() !== 'full') return false;
    const verb = NOTE_COVERS[hintId];
    if (!verb) return false;
    return Teach.has(verb) || OnboardHooks.queued(verb);
  },
  /** guest seats: the session record (created on first use; `novice` false = a veteran) */
  seat(slot: number): SeatRecord { return seat(slot); },
  /** the coach (F4b assigns the real one) */
  coach: {
    quiet() {}, scripted() {}, level: () => 0, busy: () => false,
  } as CoachApi,
  /** the in-scene death card (F4b assigns the real one) */
  deathCard: { active: () => false, lastSnap: () => null } as DeathCardApi,
};
function seat(slot: number): SeatRecord {
  let s = seats.get(slot);
  if (!s) seats.set(slot, (s = { novice: false, taught: new Set() }));
  return s;
}

// ───────────────────────── window.__tut (ONBOARD2 §11.7) ─────────────────────────
export interface TutLogEntry { t: number; real: number; ev: string; data?: unknown }
const LOG_MAX = 2000;
/** the shared test surface: F4a fills its base fields (onboard/debug.ts), F4b registers coach / death / guide / hall */
export const tut: Record<string, unknown> & { log: TutLogEntry[] } = { log: [] };
let realT0 = -1;
/** how many times each event was logged (never trimmed: __tut.wait counts on it) */
export const tutCounts: Record<string, number> = {};

export const Tut = {
  /** hang `obj` on window.__tut[key] (F4b: coach, death, guide, hall) */
  register(key: string, obj: object): void {
    tut[key] = obj;
  },
  /** append to __tut.log (sim time of the current world, real seconds since the first entry) */
  log(ev: string, data?: unknown): void {
    const now = performance.now() / 1000;
    if (realT0 < 0) realT0 = now;
    const w = (G.scenes.current as { world?: { time: number } } | null)?.world;
    const e: TutLogEntry = { t: +(w?.time ?? G.time).toFixed(3), real: +(now - realT0).toFixed(3), ev, data };
    tutCounts[ev] = (tutCounts[ev] ?? 0) + 1;
    tut.log.push(e);
    if (tut.log.length > LOG_MAX) tut.log.splice(0, tut.log.length - LOG_MAX);
    if (G.debug.has('tutlog')) console.log('[tut]', ev, data ?? '');
  },
};
try { (window as unknown as { __tut: unknown }).__tut = tut; } catch { /* not in a browser */ }
