// DeviceHub (PLAN2 §1.3): which device drives which player slot, joining, disconnects, and the
// recent-codes buffer for secret sequences. Raw device state lives in input.ts.
//
// Solo rule (the 1.0 baseline): while exactly one human has joined, their PlayerInput is `merged`:
// it reads every keyboard, the mouse and every pad. The device they actually use (raw.lastPhys) is
// theirs; any other device can join. When a second human joins, the solo player settles on the
// device they were using and stops reading the rest.

import { raw, input, PlayerInput, kindOf, padIndex, type DeviceId, type Src } from './input';
import { rumbleTargets } from './rumble';

export const MAX_SLOTS = 4;

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

  constructor() {
    raw.onCode = (code) => this.code(code);
    raw.onPadLost = (i) => {
      const s = this.slotOf(`pad${i}`);
      if (s >= 0 && !this.slots[s]!.merged) for (const cb of this.lostCbs) cb(s);
    };
    input.sourceList = () => this.menuSources();
    input.onTick = () => { this.physAtTick = raw.lastPhys; };
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

  /** the device a player is really on (the solo player: whatever they touched last) */
  private effective(p: PlayerInput): DeviceId | null { return p.merged ? this.physAtTick : p.device; }

  /** can this device join right now? (not driving anyone, no shared-keyboard conflict) */
  isFree(id: DeviceId): boolean {
    const busy = new Set<DeviceId>();
    for (const p of this.slots) if (p) { const d = this.effective(p); if (d) busy.add(d); if (!p.merged) busy.add(p.device); }
    if (busy.has(id)) return false;
    const k = kindOf(id);
    if (k === 'kbm') return !busy.has('kbL') && !busy.has('kbR');
    if (k === 'kb') return !busy.has('kbm');
    if (k === 'pad') return !!raw.pads[padIndex(id)]?.connected;
    return true;
  }

  /**
   * A free device pressed its join button this tick: pads A / Start, keyboard Enter (kbm),
   * F (kbL) or K (kbR); `split: false` leaves the half-keyboard keys out (in-world hot join).
   * The solo player's own device never joins; while they have not touched anything yet, the
   * first press is theirs (returns null).
   */
  joinPressed(o: { split?: boolean } = {}): DeviceId | null {
    if (this.soloMerged && this.physAtTick === null) return null;
    if (this.count >= MAX_SLOTS) return null;
    const cands: DeviceId[] = [];
    for (const p of raw.pads) if (p?.connected && (p.pressed.has(0) || p.pressed.has(9))) cands.push(`pad${p.index}`);
    if (raw.pressed.has('Enter') || raw.pressed.has('NumpadEnter')) cands.push('kbm');
    if (o.split !== false) {
      if (raw.pressed.has('KeyF')) cands.push('kbL');
      if (raw.pressed.has('KeyK')) cands.push('kbR');
    }
    for (const id of cands) if (this.isFree(id)) return id;
    return null;
  }

  /** give a device to a slot; returns that player's input */
  claim(id: DeviceId, slot: number): PlayerInput {
    if (slot < 0 || slot >= MAX_SLOTS) throw new Error(`[devices] bad slot ${slot}`);
    const prev = this.slotOf(id);
    if (prev >= 0 && prev !== slot) this.release(prev);
    if (this.slots[slot]) this.release(slot);
    // the solo player settles on the device they were really using
    const solo = this.soloMerged;
    if (solo && kindOf(id) !== 'bot') {
      const act = this.physAtTick;
      if (act && act !== id && act !== solo.device && this.slotOf(act) < 0) solo.setDevice(act);
    }
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
      const m = humans.length === 1 && p === humans[0] && (p.kind === 'kbm' || p.kind === 'pad');
      if (m !== p.merged) { p.merged = m; p.rebuild(); }
    }
  }

  /** menus: every joined device (everything while no human has joined), plus joined bots */
  private menuSources(): Src[] {
    const humans = this.humans;
    const out: Src[] = humans.length ? humans.map((p) => p.source) : [{ kb: input.bindings, mouse: true, pads: 'all' }];
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
