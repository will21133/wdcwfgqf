// Records the player's last N seconds at 60Hz: pose, hp, and action events.
// On rewind the recording becomes an Echo's script.

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
}

export type EventType = 'attack' | 'special' | 'specialRelease' | 'dash';
export interface RecEvent { tick: number; type: EventType; combo?: number; angle?: number; charge?: number; dx?: number; dy?: number }

export interface Recording { frames: Frame[]; events: RecEvent[] }

export class Recorder {
  private frames: Frame[] = [];
  private events: RecEvent[] = [];
  tick = 0;
  constructor(public capacity: number) {}

  setWindow(seconds: number) { this.capacity = Math.round(seconds * 60); this.trim(); }

  push(f: Frame) {
    this.frames.push(f);
    this.tick++;
    this.trim();
  }

  event(e: Omit<RecEvent, 'tick'>) {
    this.events.push({ ...e, tick: this.tick });
  }

  private trim() {
    const over = this.frames.length - this.capacity;
    if (over > 0) this.frames.splice(0, over);
    const minTick = this.tick - this.frames.length;
    while (this.events.length && this.events[0].tick < minTick) this.events.shift();
  }

  get length() { return this.frames.length; }
  get seconds() { return this.frames.length / 60; }
  oldest(): Frame | undefined { return this.frames[0]; }
  at(i: number): Frame | undefined { return this.frames[i]; }

  /** take the recording (relative ticks) and clear history */
  take(): Recording {
    const base = this.tick - this.frames.length;
    const rec: Recording = {
      frames: this.frames.slice(),
      events: this.events.map((e) => ({ ...e, tick: e.tick - base })),
    };
    this.frames = [];
    this.events = [];
    return rec;
  }

  clear() { this.frames = []; this.events = []; }
}
