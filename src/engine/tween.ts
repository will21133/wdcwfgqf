import { ease } from './math';

type EaseFn = (t: number) => number;

interface Tween {
  t: number;
  dur: number;
  delay: number;
  fn: (v: number) => void;
  from: number;
  to: number;
  ease: EaseFn;
  done?: () => void;
  tag?: string;
}

/** Tiny tween runner. Each scene/ui owns one so pausing is trivial. */
export class Tweens {
  private list: Tween[] = [];

  to(fn: (v: number) => void, from: number, to: number, dur: number, opts: { ease?: EaseFn; delay?: number; done?: () => void; tag?: string } = {}) {
    const tw: Tween = { t: 0, dur: Math.max(1e-4, dur), delay: opts.delay ?? 0, fn, from, to, ease: opts.ease ?? ease.outCubic, done: opts.done, tag: opts.tag };
    this.list.push(tw);
    fn(from);
    return tw;
  }

  wait(dur: number, done: () => void) {
    return this.to(() => {}, 0, 1, dur, { done });
  }

  cancel(tag: string) { this.list = this.list.filter((t) => t.tag !== tag); }
  clear() { this.list.length = 0; }
  get busy() { return this.list.length > 0; }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.delay > 0) { tw.delay -= dt; continue; }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.from + (tw.to - tw.from) * tw.ease(k));
      if (k >= 1) {
        this.list.splice(i, 1);
        tw.done?.();
      }
    }
  }
}

/** Simple timer helpers used by entities */
export class Timer {
  constructor(public t = 0) {}
  tick(dt: number) { if (this.t > 0) this.t = Math.max(0, this.t - dt); return this.t; }
  get active() { return this.t > 0; }
  set(v: number) { this.t = v; }
}
