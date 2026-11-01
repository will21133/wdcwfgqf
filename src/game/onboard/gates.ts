// Gates (ONBOARD2 §5.3, §5.4, §11.5): what a novice may do and see before it is taught.
// FROZEN after F4 — production packages read it, nobody edits it.
//
//   Gates.tapOnly(p)      scrub not taught: a held rewind is a tap (player.ts beginRewind / updateRewind)
//   Gates.forkAllow(p)    false = this Fork press is explained instead (no Sand, no echo); a second
//                         press within 3 s forks as usual (player.ts fork())
//   Gates.shows(p, what)  'culprit': the Culprit hand, the tape's white diamonds, the culprit plate
//                         stay hidden until the Culprit lesson (its +50% applies all along)
//   Gates.hud(id, p)      a HUD widget (or a part of one, e.g. 'slots:empty') is drawn (hud.ts)
//
// Every answer defaults to "allow" — the game plays exactly as without onboarding — unless
//   · a layer says otherwise: the prologue (fork off, hold = tap, a sparse HUD) and every lesson
//     (its own verbs opened for its player) push one with Gates.push and drop it when done; or
//   · the base rules are live (Gates.live) and the hand is a novice (Onboard.isNovice): slot I in
//     full guidance, or a guest seat that said "first time?", taught per Onboard.taught.
// The base rules go live with the prologue (F4a); until then a test turns them on with
// ?gates=1 or any ?onboard= preset (fresh, prologueDone, taught:…, full). ?gates=0 turns them off.
import type { Player } from '../entities/player';
import type { World } from '../world/world';
import { G } from '../G';
import { profile } from '../save';
import { Flags } from '../meta/registry';
import { Onboard, Tut } from './core';

/** 'culprit': the Culprit marks · 'shadow': the Shadow, its hairspring and labels (the prologue's L1–L2 hide it) */
export type ShowId = 'culprit' | 'shadow';

/**
 * A temporary override. Each function may return undefined to fall through to the next layer (and
 * finally to the base rules). The newest layer is asked first.
 */
export interface GateLayer {
  /** debug label (__tut.gates.layers) */
  name: string;
  /** the hand it applies to (omit / null: every hand) */
  p?: Player | null;
  tapOnly?(p: Player): boolean | undefined;
  /** pure (no side effects: __tut and tests ask it too) */
  forkAllow?(p: Player): boolean | undefined;
  /** a real Fork press this layer refused (the prologue: "This lesson uses {@rewind}") */
  onForkDenied?(p: Player): void;
  /** may this hand rewind at all? (the prologue's L1–L2: not yet) — pure, like forkAllow */
  rewindAllow?(p: Player): boolean | undefined;
  /** a real rewind press this layer refused */
  onRewindDenied?(p: Player): void;
  shows?(p: Player | null, what: ShowId): boolean | undefined;
  hud?(id: string, p: Player | null): boolean | undefined;
}

/** seconds after an explained Fork press during which the next press forks (ONBOARD2 §5.3) */
export const FORK_WINDOW = 3;
/** D9: lifetime count of "holding = tap for now" lines (ONBOARD2 §6.5) */
export const HOLD_HINT_MAX = 2, HOLD_HINT_T = 0.6;
/** the base rules are live from the prologue on (F4a flips this when the prologue lands) */
const GATES_LIVE = true;

/**
 * What the gates say. onboard/index.ts wires these to the Stage, the Calm queue and the strings;
 * gates.ts itself stays free of UI imports (it is read by player.ts and hud.ts).
 */
export const GateHooks = {
  /** a Fork press was explained: "That's {@fork} Fork: leave an Echo here (−50)" / "Press again to use it …" */
  explainFork: (_p: Player): void => {},
  /** a novice held rewind past 0.6 s: "Holding is a tap for now · Scrub comes later" */
  holdIsTap: (_p: Player): void => {},
  /** queue a lesson for the next quiet moment (Calm.request) */
  request: (_id: string, _why: string): void => {},
};

const layers: GateLayer[] = [];
let liveOverride: boolean | null = null;
let liveUrl: boolean | null = null;
function liveFromUrl(): boolean {
  if (liveUrl !== null) return liveUrl;
  const q = G.debug;
  const g = q.get('gates');
  const o = q.get('onboard');
  liveUrl = g === '1' ? true : g === '0' ? false : GATES_LIVE || (!!o && o !== 'skip' && o !== 'lite' && o !== 'off');
  return liveUrl;
}

/** per room (World) and seat: when the last explained Fork press opened its 3 s window */
const forkWindows = new WeakMap<World, Map<number, number>>();
/** a hold that has already been told "hold = tap" (one line per press) */
const holdTold = new WeakSet<object>();

/** the newest layer's answer for this hand (and the layer that gave it), or undefined */
function ask<K extends 'tapOnly' | 'forkAllow' | 'rewindAllow'>(k: K, p: Player): boolean | undefined { return askLayer(k, p)?.v; }
function askLayer<K extends 'tapOnly' | 'forkAllow' | 'rewindAllow'>(k: K, p: Player): { v: boolean; l: GateLayer } | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i];
    if (l.p && l.p !== p) continue;
    const fn = l[k];
    if (!fn) continue;
    const v = fn.call(l, p);
    if (v !== undefined) return { v, l };
  }
  return undefined;
}

export const Gates = {
  /** scrub not taught: holding rewind lands on the Shadow like a tap */
  tapOnly(p: Player): boolean {
    const v = ask('tapOnly', p);
    if (v !== undefined) return v;
    if (!Gates.live || !Onboard.isNovice(p)) return false;
    return !Onboard.learned(p, 'scrub');
  },

  /**
   * may this Fork press fork? false = explained instead (no Sand spent, no echo): the first press in
   * a room says what Fork is and opens a 3 s window in which the next press forks as usual; the
   * Fork lesson is queued for the next quiet moment.
   */
  forkAllow(p: Player): boolean {
    const a = askLayer('forkAllow', p);
    if (a) { if (!a.v) a.l.onForkDenied?.(p); return a.v; }
    if (!Gates.live || !Onboard.isNovice(p) || Onboard.learned(p, 'fork')) return true;
    const w = p.world;
    if (!w) return true;
    let m = forkWindows.get(w);
    if (!m) forkWindows.set(w, (m = new Map()));
    const t0 = m.get(p.slot);
    if (t0 !== undefined && w.time - t0 <= FORK_WINDOW) return true;
    m.set(p.slot, w.time);
    GateHooks.explainFork(p);
    GateHooks.request('fork', 'press');
    Tut.log('gated', { verb: 'fork', slot: p.slot });
    return false;
  },

  /**
   * may this rewind press rewind? Only a layer ever says no (the prologue before L3); the base rules
   * never hold rewind back. A refusal calls the layer's onRewindDenied.
   */
  rewindAllow(p: Player): boolean {
    const a = askLayer('rewindAllow', p);
    if (a && !a.v) { a.l.onRewindDenied?.(p); return false; }
    return true;
  },

  /** would a Fork press fork now? (forkAllow without its side effects: tests, __tut.gates) */
  wouldFork(p: Player): boolean {
    const v = ask('forkAllow', p);
    if (v !== undefined) return v;
    if (!Gates.live || !Onboard.isNovice(p) || Onboard.learned(p, 'fork')) return true;
    const t0 = p.world ? forkWindows.get(p.world)?.get(p.slot) : undefined;
    return t0 !== undefined && !!p.world && p.world.time - t0 <= FORK_WINDOW;
  },

  /** 'culprit': draw the Culprit marks (hand, tape diamonds, plate)? */
  shows(p: Player | null, what: ShowId): boolean {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.p && l.p !== p) continue;
      const v = l.shows?.(p, what);
      if (v !== undefined) return v;
    }
    if (!Gates.live) return true;
    if (what === 'shadow') return true;
    if (what === 'culprit') {
      // no hand (a shared HUD area): the profile owner's progress decides
      const novice = p ? Onboard.isNovice(p) : Onboard.mode() === 'full';
      return !novice || Onboard.taught(p, 'culprit');
    }
    return true;
  },

  /**
   * is this HUD widget (or widget part) shown for this hand? Ids are the Hud.register ids
   * ('hp' 'tape' 'sand' 'dash' 'special' 'brass' 'slots' 'chain' 'caption' …) plus parts:
   * 'slots:empty' (an empty build slot; hidden in a novice's first run, ONBOARD2 §5.4).
   */
  hud(id: string, p: Player | null): boolean {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.p && p && l.p !== p) continue;
      const v = l.hud?.(id, p);
      if (v !== undefined) return v;
    }
    if (!Gates.live) return true;
    if (id === 'slots:empty') {
      const novice = p ? Onboard.isNovice(p) : Onboard.mode() === 'full';
      return !(novice && profile.runs <= 1);
    }
    return true;
  },

  /** add an override (the prologue, a lesson); returns the function that removes it */
  push(layer: GateLayer): () => void {
    layers.push(layer);
    Tut.log('gateLayer', { name: layer.name, on: true });
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) { layers.splice(i, 1); Tut.log('gateLayer', { name: layer.name, on: false }); }
    };
  },
  /** the layers now, oldest first (debug) */
  layers(): readonly GateLayer[] { return layers; },
  /** are the base (novice) rules in force? (layers always are) */
  get live(): boolean { return liveOverride ?? liveFromUrl(); },
  /** tests / the prologue flow: force the base rules on or off (null = the default) */
  setLive(on: boolean | null): void { liveOverride = on; },

  /**
   * once per frame (the Stage's update): D9 — a novice holding rewind past 0.6 s while it is still
   * a tap hears "holding is a tap for now" (twice per lifetime, one line per press).
   */
  update(w: World | null | undefined): void {
    if (!w) return;
    for (const p of w.players) {
      const inp = p.input;
      if (!inp || inp.heldFor('rewind') < HOLD_HINT_T) continue;
      if (holdTold.has(inp) || !Gates.tapOnly(p) || ask('tapOnly', p) !== undefined) continue;
      holdTold.add(inp);
      if (Flags.get('onboard.holdHint') >= HOLD_HINT_MAX) continue;
      Flags.inc('onboard.holdHint');
      GateHooks.holdIsTap(p);
      Tut.log('gated', { verb: 'scrub', slot: p.slot });
    }
    // a released key may be told again next time
    for (const p of w.players) if (p.input && !p.input.down('rewind')) holdTold.delete(p.input);
  },
};
