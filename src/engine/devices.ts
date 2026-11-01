// DeviceHub (PLAN2 §1.3): which device drives which player slot, joining, disconnects, and the
// recent-codes buffer for secret sequences. Raw device state lives in input.ts.
//
// Solo rule (the 1.0 baseline): while exactly one human has joined, their PlayerInput is `merged`:
// it reads every keyboard, the mouse and every pad. The device they actually use (raw.lastPhys) is
// theirs. Because a solo player may pick up another device at any moment (1.0: every device just
// works), a free device joins from solo only by HOLDING its join button (JOIN_HOLD); a tap stays
// the solo player's input. When a second human joins, the solo player settles on the device they
// were using and stops reading the rest. With two or more humans seated (or in the title's join
// lobby, where nobody is merged) a tap joins.

import { raw, input, PlayerInput, kindOf, padIndex, type DeviceId, type Src } from './input';
import { rumbleTargets } from './rumble';

export const MAX_SLOTS = 4;
/** seconds a free device holds its join button to join next to a solo player */
export const JOIN_HOLD = 0.8;
const STEP = 1 / 60;

/** a free device holding its join button next to a solo player (UI: devices.joinHold) */
export interface JoinHold { id: DeviceId; t: number; k: number; slot: number; soloOn: DeviceId | null }

const KB_IDS: DeviceId[] = ['kbm', 'kbL', 'kbR'];

export class DeviceHub {
  readonly slots: (PlayerInput | null)[] = [null, null, null, null];
  /** last 16 key / button codes from every device ('KeyW', 'ArrowUp', 'PadA', 'PadUp', …) */
  readonly recentCodes: string[] = [];
  /** raw.lastPhys as of the end of the previous tick (a press this tick does not count yet) */
  private physAtTick: DeviceId | null = null;
  private seqs: { seq: string[][]; cb: () => void; owner?: unknown }[] = [];
  private lostCbs: ((slot: number) => void)[] = [];
  private joinCbs: ((p: PlayerInput) => void)[] = [];
  /** bumps on every claim / release (scenes compare it to respawn players) */
  version = 0;
  /**
   * The title's join lobby: every seat reads only its own device (nobody is merged), so a free
   * device's presses never act for a seated hand and a tap joins.
   */
  private lobbyOn = false;
  /** the hold in progress (joining next to a solo player) */
  private hold: JoinHold | null = null;
  /** a free device tapped its join button next to a solo player: "hold to join" for a moment */
  private hint: { id: DeviceId; t: number } | null = null;
  /** joinPressed runs once per fixed tick (it advances the hold); repeated calls see the same answer */
  private tickNo = 0;
  private polledAt = -1;
  private polled: DeviceId | null = null;
  /** what the solo player was really on when the join that is being claimed began */
  private joinSoloOn: DeviceId | null | undefined = undefined;

  constructor() {
    raw.onCode = (code) => this.code(code);
    raw.onPadLost = (i) => {
      const s = this.slotOf(`pad${i}`);
      if (s >= 0 && !this.slots[s]!.merged) for (const cb of this.lostCbs) cb(s);
    };
    input.sourceList = () => this.menuSources();
    input.onTick = () => {
      this.physAtTick = raw.lastPhys;
      this.tickNo++;
      if (this.hint && (this.hint.t += STEP) > 1.6) this.hint = null;
    };
    rumbleTargets.fn = () => this.rumblePads();
  }

  /** joined players in slot order */
  get players(): PlayerInput[] { return this.slots.filter((p): p is PlayerInput => !!p); }
  get count(): number { let n = 0; for (const p of this.slots) if (p) n++; return n; }
  get humans(): PlayerInput[] { return this.players.filter((p) => p.kind !== 'bot'); }
  input(slot: number): PlayerInput | null { return this.slots[slot] ?? null; }

  /** the solo player who currently reads every device, if any */
  get soloMerged(): PlayerInput | null { return this.players.find((p) => p.merged) ?? null; }

  slotOf(id: DeviceId): number { return this.slots.findIndex((p) => p?.device === id); }
  freeSlot(): number { return this.slots.findIndex((p) => !p); }

  /**
   * Can this device join right now? (not driving anyone, no shared-keyboard conflict.)
   * The solo (merged) player is on `soloOn` — what they touched last, before this press — or, if
   * they have not touched anything yet, on their seat device.
   */
  isFree(id: DeviceId, soloOn: DeviceId | null = this.physAtTick): boolean {
    const busy = new Set<DeviceId>();
    for (const p of this.slots) if (p) busy.add(p.merged ? soloOn ?? p.device : p.device);
    if (busy.has(id)) return false;
    const k = kindOf(id);
    if (k === 'kbm') return !busy.has('kbL') && !busy.has('kbR');
    if (k === 'kb') return !busy.has('kbm');
    if (k === 'pad') return !!raw.pads[padIndex(id)]?.connected;
    return true;
  }

  /**
   * A free device joins this tick: pads A / Start, keyboard Enter (kbm), F (kbL) or K (kbR);
   * `split: false` leaves the half-keyboard keys out (in-world hot join).
   * Next to a solo (merged) player the join button must be HELD for JOIN_HOLD (devices.joinHold
   * shows the progress; a tap is just the solo player's input, as in 1.0). While the solo player
   * has not touched anything yet, every press is theirs. Call once per fixed tick.
   */
  joinPressed(o: { split?: boolean } = {}): DeviceId | null {
    if (this.polledAt === this.tickNo) return this.polled;
    this.polledAt = this.tickNo;
    this.joinSoloOn = undefined;
    return (this.polled = this.pollJoin(o));
  }

  /** the join hold in progress, for the "hold to join" prompt (k = 0…1) */
  get joinHold(): Readonly<JoinHold> | null { return this.hold && this.hold.t >= 0.12 ? this.hold : null; }
  /** a free device just tapped its join button next to a solo player (k = time left 1…0) */
  get joinHint(): { id: DeviceId; k: number; slot: number } | null {
    return this.hint ? { id: this.hint.id, k: 1 - this.hint.t / 1.6, slot: this.freeSlot() } : null;
  }

  /** is this device's join button down right now */
  private joinDown(id: DeviceId): boolean {
    if (id === 'kbm') return raw.held.has('Enter') || raw.held.has('NumpadEnter');
    if (id === 'kbL') return raw.held.has('KeyF');
    if (id === 'kbR') return raw.held.has('KeyK');
    const ps = raw.pads[padIndex(id)];
    return !!ps?.connected && (ps.held.has(0) || ps.held.has(9));
  }

  private pollJoin(o: { split?: boolean }): DeviceId | null {
    const slot = this.freeSlot();
    if (slot < 0) { this.hold = null; return null; }
    const solo = this.soloMerged;
    if (solo && this.physAtTick === null) { this.hold = null; return null; }
    if (this.hold) {
      const h = this.hold;
      h.slot = slot;
      if (!this.joinDown(h.id) || !this.isFree(h.id, h.soloOn)) {
        // a tap: hint "hold to join" (not for the solo player's own seat device: that is almost
        // certainly them picking it back up)
        if (h.t < JOIN_HOLD && h.id !== solo?.device) this.hint = { id: h.id, t: 0 };
        this.hold = null;
      } else {
        h.t += STEP;
        h.k = Math.min(1, h.t / JOIN_HOLD);
        if (h.t < JOIN_HOLD) return null;
        this.hold = null;
        this.hint = null;
        this.joinSoloOn = h.soloOn;
        return h.id;
      }
    }
    const cands: DeviceId[] = [];
    for (const p of raw.pads) if (p?.connected && (p.pressed.has(0) || p.pressed.has(9))) cands.push(`pad${p.index}`);
    if (raw.pressed.has('Enter') || raw.pressed.has('NumpadEnter')) cands.push('kbm');
    if (o.split !== false) {
      if (raw.pressed.has('KeyF')) cands.push('kbL');
      if (raw.pressed.has('KeyK')) cands.push('kbR');
    }
    for (const id of cands) {
      if (!this.isFree(id)) continue;
      // next to a solo player: start a hold (the press itself stays theirs)
      if (solo) { this.hold = { id, t: 0, k: 0, slot, soloOn: this.physAtTick }; this.hint = null; return null; }
      return id;
    }
    return null;
  }

  /**
   * Give a device to a slot; returns that player's input. A human joining next to the solo
   * (merged) player first settles the solo player on the device they were really using; it never
   * evicts them: if the only device the solo player is known to use is the one being claimed, the
   * claim is refused and the solo player's own input comes back (callers compare .slot).
   */
  claim(id: DeviceId, slot: number): PlayerInput {
    if (slot < 0 || slot >= MAX_SLOTS) throw new Error(`[devices] bad slot ${slot}`);
    const solo = this.soloMerged;
    if (solo && solo.slot !== slot && kindOf(id) !== 'bot') {
      const act = this.joinSoloOn !== undefined ? this.joinSoloOn : this.physAtTick;
      if (act && act !== id && (act === solo.device || this.slotOf(act) < 0)) { if (act !== solo.device) solo.setDevice(act); }
      else if (solo.device === id) { console.warn(`[devices] ${id} drives the solo hand; not seating it in slot ${slot}`); return solo; }
    }
    this.joinSoloOn = undefined;
    const prev = this.slotOf(id);
    if (prev >= 0 && prev !== slot) this.release(prev);
    if (this.slots[slot]) this.release(slot);
    const p = new PlayerInput(slot, id);
    this.slots[slot] = p;
    this.remerge();
    this.version++;
    for (const cb of this.joinCbs) cb(p);
    return p;
  }

  release(slot: number) {
    const p = this.slots[slot];
    if (!p) return;
    const dev = p.device;
    p.dispose();
    this.slots[slot] = null;
    this.remerge();
    this.version++;
    // the device that just left (its owner held "leave" on it) is not the one the remaining solo
    // hand uses: without this, the next join would hand that pad to the solo player
    const solo = this.soloMerged;
    if (solo && (raw.lastPhys === dev || this.physAtTick === dev)) { raw.lastPhys = solo.device; this.physAtTick = solo.device; }
  }

  /** title join lobby on / off (see lobbyOn) */
  setLobby(on: boolean) { if (this.lobbyOn !== on) { this.lobbyOn = on; this.hold = null; this.hint = null; this.remerge(); } }
  get lobby(): boolean { return this.lobbyOn; }

  /**
   * Seated pads that went away and have not come back (scenes poll this so a pad lost during the
   * summary, a cutscene or the credits is still reported). Pads never seen connected (debug URLs
   * such as ?devices=pad0 without a pad) do not count; nor does the solo player, who reads every
   * device.
   */
  lostSlots(): number[] {
    const out: number[] = [];
    for (const p of this.slots) {
      if (!p || p.merged || p.kind !== 'pad') continue;
      const ps = raw.pads[padIndex(p.device)];
      if (ps && !ps.connected) out.push(p.slot);
    }
    return out;
  }

  /** the first scene that needs a player: claim slot 0 for whatever device was used last */
  ensureSolo(): PlayerInput {
    const first = this.players[0];
    if (first) return first;
    return this.claim(raw.lastPhys ?? 'kbm', 0);
  }

  /** a joined pad disappeared (the merged solo player's pads never report) */
  onDisconnect(cb: (slot: number) => void) { this.lostCbs.push(cb); }
  /** a device was claimed (join panels, HUD pods) */
  onJoin(cb: (p: PlayerInput) => void) { this.joinCbs.push(cb); }

  /**
   * Call cb when the last codes typed on any device end with `seq`. Each step may list
   * alternatives with '|' (e.g. 'ArrowUp|PadUp'). owner lets offSequence remove it.
   */
  onSequence(seq: string[], cb: () => void, owner?: unknown) { this.seqs.push({ seq: seq.map((s) => s.split('|')), cb, owner }); }
  offSequence(owner: unknown) { this.seqs = this.seqs.filter((s) => s.owner !== owner); }

  private code(c: string) {
    const R = this.recentCodes;
    R.push(c);
    if (R.length > 16) R.splice(0, R.length - 16);
    for (const s of this.seqs.slice()) {
      const n = s.seq.length;
      if (n > R.length) continue;
      let ok = true;
      for (let i = 0; i < n && ok; i++) ok = s.seq[i].includes(R[R.length - n + i]);
      if (ok) s.cb();
    }
  }

  private remerge() {
    const humans = this.humans;
    for (const p of this.players) {
      const m = !this.lobbyOn && humans.length === 1 && p === humans[0] && (p.kind === 'kbm' || p.kind === 'pad');
      if (m !== p.merged) { p.merged = m; p.rebuild(); }
    }
  }

  /**
   * Menus: every joined human's device (everything while no human has joined). Bots drive the
   * menus only when no human is seated (?bot=1 runs); next to a human their random presses
   * would close the pause menu or skip the death screen.
   */
  private menuSources(): Src[] {
    const humans = this.humans;
    if (humans.length) return humans.map((p) => p.source);
    const out: Src[] = [{ kb: input.bindings, mouse: true, pads: 'all' }];
    for (const p of this.players) if (p.kind === 'bot') out.push(p.source);
    return out;
  }

  private rumblePads(): number[] {
    const humans = this.humans;
    if (!humans.length || humans.some((p) => p.merged)) return raw.connectedPads();
    const out: number[] = [];
    for (const p of humans) if (p.kind === 'pad') out.push(padIndex(p.device));
    return out;
  }
}

export const devices = new DeviceHub();
export { KB_IDS };
