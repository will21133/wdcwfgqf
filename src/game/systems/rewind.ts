// 磁带 The tape (PLAN2 §1.8, GDD2 §3.1–3.2): the hand's last few seconds at 60 Hz — pose, HP,
// fixed damage, tempo, who hurt it — plus its action events. A rewind cuts the tape at the target
// frame: the part it skipped becomes the Echo's script, the older part stays (the tape is never
// cleared), so the hand can rewind again at once. The Recorder lives in Loadout.tape and is kept
// across rooms; entering a room prefills it with the hand standing at the entrance.
//
// Frame indices run from 0 (the oldest frame, where the Shadow stands) to length − 1 (the newest).
// Event ticks are absolute (the recorder's push counter); a Recording's ticks are relative to its
// first frame.

export interface Frame {
  x: number; y: number;
  /** facing: 0 down, 1 up, 2 side */
  dir: number;
  flip: boolean;
  /** anim state id + time */
  anim: number; animT: number;
  /** weapon pose */
  wa: number; we: number; wv: number;
  hp: number;
  /** cumulative unrewindable damage taken (for fixed damage rule) */
  fixed: number;
  /** airborne (dash) */
  air: boolean;
  /** tempo points at this frame (P1 ranks; a rewind restores it) */
  tempo: number;
  /** ids of the actors whose damage landed on this frame (null: nobody); a rewind past them marks Culprits */
  culprits: number[] | null;
  /** undoable damage that landed on this frame (red notch on the tape) */
  hit: number;
  /** fixed damage that landed on this frame (violet notch) */
  fixedHit: number;
}

/** heavy / dashAttack: the 2.0 verbs (weapon.ts hook points; P1 gives each weapon its moves) */
export type EventType = 'attack' | 'special' | 'specialRelease' | 'dash' | 'heavy' | 'dashAttack';
export interface RecEvent { tick: number; type: EventType; combo?: number; angle?: number; charge?: number; dx?: number; dy?: number }

export interface Recording { frames: Frame[]; events: RecEvent[] }

/** a standing frame with every field filled (prefill, tests) */
export function blankFrame(x: number, y: number, base: Partial<Frame> = {}): Frame {
  return {
    x, y, dir: 1, flip: false, anim: 0, animT: 0, wa: Math.PI / 2, we: 0, wv: 0, hp: 1, fixed: 0, air: false,
    tempo: 0, culprits: null, hit: 0, fixedHit: 0, ...base,
  };
}

export class Recorder {
  /** ring buffer of frames */
  private buf: Frame[] = [];
  private head = 0;
  private count = 0;
  private events: RecEvent[] = [];
  /** frames pushed so far (absolute tick of the next frame) */
  tick = 0;
  /**
   * seconds left on a burnt tape (a rewind out of a stop burns it for 6 s, GDD2 §3.10): no rewinds
   * until it runs out. Kept on the tape so it survives a room change.
   */
  burnT = 0;

  constructor(public capacity: number) {}

  /** tape length in seconds (the newest frames are kept) */
  setWindow(seconds: number) {
    const cap = Math.max(2, Math.round(seconds * 60));
    if (cap === this.capacity) return;
    const frames = this.toArray();
    this.capacity = cap;
    this.buf = []; this.head = 0; this.count = 0;
    for (const f of frames.slice(-cap)) this.store(f);
    this.trimEvents();
  }

  private store(f: Frame) {
    const cap = this.capacity;
    if (this.count < cap) { this.buf[(this.head + this.count) % cap] = f; this.count++; }
    else { this.buf[this.head] = f; this.head = (this.head + 1) % cap; }
  }

  push(f: Frame) {
    this.store(f);
    this.tick++;
    this.trimEvents();
  }

  event(e: Omit<RecEvent, 'tick'>) {
    this.events.push({ ...e, tick: this.tick });
  }

  /** absolute tick of frame 0 */
  private get base() { return this.tick - this.count; }

  private trimEvents() {
    const minTick = this.base;
    let n = 0;
    while (n < this.events.length && this.events[n].tick < minTick) n++;
    if (n) this.events.splice(0, n);
  }

  get length() { return this.count; }
  get seconds() { return this.count / 60; }
  /** the Shadow's frame */
  oldest(): Frame { return this.at(0); }
  newest(): Frame { return this.at(this.count - 1); }
  at(i: number): Frame {
    const k = Math.max(0, Math.min(this.count - 1, i | 0));
    return this.buf[(this.head + k) % this.capacity];
  }

  /** frames 0..length-1 (a copy of the array, same frame objects) */
  toArray(): Frame[] {
    const out: Frame[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.buf[(this.head + i) % this.capacity]);
    return out;
  }

  /** events between frame i and now (absolute ticks; read-only) */
  eventsFrom(i: number): RecEvent[] {
    const t0 = this.base + i;
    return this.events.filter((e) => e.tick >= t0);
  }
  /** the frame index an absolute-tick event belongs to */
  frameOfEvent(e: RecEvent): number { return Math.max(0, Math.min(this.count - 1, e.tick - this.base)); }

  /**
   * Rewind: frames [i..now] become a Recording (the Echo's script, ticks relative to frame i) and
   * the tape keeps [0..i). The tick counter steps back with it, so new frames continue the tape.
   */
  cutFrom(i: number): Recording {
    i = Math.max(0, Math.min(this.count, i | 0));
    const frames: Frame[] = [];
    for (let k = i; k < this.count; k++) frames.push(this.buf[(this.head + k) % this.capacity]);
    const t0 = this.base + i;
    const events: RecEvent[] = [];
    const keep: RecEvent[] = [];
    for (const e of this.events) {
      if (e.tick >= t0) events.push({ ...e, tick: e.tick - t0 });
      else keep.push(e);
    }
    this.events = keep;
    this.count = i;
    this.tick = t0;
    return { frames, events };
  }

  /** Fork: a copy of the last `fromSec` seconds (the tape is untouched) */
  slice(fromSec: number): Recording {
    const n = Math.max(1, Math.min(this.count, Math.round(fromSec * 60)));
    const i = this.count - n;
    const frames: Frame[] = [];
    for (let k = i; k < this.count; k++) frames.push({ ...this.buf[(this.head + k) % this.capacity] });
    const t0 = this.base + i;
    const events = this.events.filter((e) => e.tick >= t0).map((e) => ({ ...e, tick: e.tick - t0 }));
    return { frames, events };
  }

  /** replace the tape with `frames` copies of the hand standing at (x, y) (room entry, revive, catch-up) */
  prefill(x: number, y: number, frames: number, base: Partial<Frame> = {}): void {
    this.buf = []; this.head = 0; this.count = 0; this.events = [];
    const n = Math.max(0, Math.min(this.capacity, Math.round(frames)));
    for (let k = 0; k < n; k++) this.store(blankFrame(x, y, { ...base, animT: (k / 60) % 1, culprits: null, hit: 0, fixedHit: 0 }));
    this.tick += n;
  }

  /** fixed (violet) damage taken after frame i, up to the newest frame */
  fixedSince(i: number): number {
    if (!this.count) return 0;
    return Math.max(0, this.newest().fixed - this.at(i).fixed);
  }
  tempoAt(i: number): number { return this.count ? this.at(i).tempo : 0; }
  hpAt(i: number): number { return this.count ? this.at(i).hp : 0; }

  /** drop everything (keeps the burn timer) */
  clear() { this.buf = []; this.head = 0; this.count = 0; this.events = []; }

  /** 1.0 API: take the whole tape and clear it */
  take(): Recording { return this.cutFrom(0); }
}
