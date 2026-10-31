import type { Renderer } from './gfx/renderer';
import { VIEW_W, VIEW_H } from './gfx/post';
import { ease } from './math';
import { col } from '../art/palette';

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(r: Renderer): void;
  /** true while scene wants input blocked (e.g. during transition) */
}

type TransKind = 'clock' | 'fade' | 'iris' | 'none';

/**
 * Scene manager with thematic transitions.
 * "clock": twelve 30° wedges sweep closed like a clock hand passing each hour, then reopen.
 */
export class SceneManager {
  current: Scene | null = null;
  private next: (() => Scene) | null = null;
  private kind: TransKind = 'clock';
  private phase: 'idle' | 'closing' | 'opening' = 'idle';
  private t = 0;
  private dur = 0.45;
  private irisX = VIEW_W / 2;
  private irisY = VIEW_H / 2;
  onSwitch?: () => void;

  get transitioning() { return this.phase !== 'idle'; }

  set(s: Scene) {
    this.current?.exit?.();
    this.current = s;
    s.enter?.();
  }

  go(make: () => Scene, kind: TransKind = 'clock', dur = 0.45, focus?: { x: number; y: number }) {
    if (this.phase === 'closing') return;
    this.next = make;
    this.kind = kind;
    this.dur = dur;
    if (focus) { this.irisX = focus.x; this.irisY = focus.y; } else { this.irisX = VIEW_W / 2; this.irisY = VIEW_H / 2; }
    if (kind === 'none') { this.swap(); return; }
    this.phase = 'closing';
    this.t = 0;
  }

  private swap() {
    const mk = this.next!;
    this.next = null;
    this.current?.exit?.();
    this.current = mk();
    this.current.enter?.();
    this.onSwitch?.();
  }

  update(dt: number) {
    if (this.phase === 'closing') {
      this.t += dt;
      if (this.t >= this.dur) {
        this.swap();
        this.phase = 'opening';
        this.t = 0;
      }
    } else if (this.phase === 'opening') {
      this.t += dt;
      if (this.t >= this.dur) this.phase = 'idle';
    }
    // scenes keep updating during "opening" so the reveal is alive
    if (this.phase !== 'closing') this.current?.update(dt);
  }

  render(r: Renderer) {
    this.current?.render(r);
    if (this.phase === 'idle') return;
    const k = Math.min(1, this.t / this.dur);
    // coverage: 0 = open, 1 = fully closed
    const cover = this.phase === 'closing' ? ease.inOutQuad(k) : 1 - ease.inOutQuad(k);
    const ctx = r.ui2;
    if (this.kind === 'fade') {
      ctx.fillStyle = col('K0');
      ctx.globalAlpha = cover;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
      return;
    }
    if (this.kind === 'iris') {
      const maxR = Math.hypot(VIEW_W, VIEW_H);
      const rad = maxR * (1 - cover);
      ctx.fillStyle = col('K0');
      ctx.beginPath();
      ctx.rect(0, 0, VIEW_W, VIEW_H);
      ctx.arc(this.irisX, this.irisY, Math.max(0, rad), 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      if (rad > 2) {
        ctx.strokeStyle = col('B4');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.irisX, this.irisY, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }
    // clock wipe
    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    const R = Math.hypot(VIEW_W, VIEW_H) / 2 + 4;
    const start = -Math.PI / 2;
    // closing: hand sweeps clockwise filling; opening: hand keeps sweeping, revealing
    const sweep = cover * Math.PI * 2;
    const handA = this.phase === 'closing' ? start + sweep : start + (1 - cover) * Math.PI * 2;
    ctx.fillStyle = col('K1');
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    if (this.phase === 'closing') ctx.arc(cx, cy, R, start, start + sweep);
    else ctx.arc(cx, cy, R, handA, start + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // hour ticks on the filled area
    ctx.fillStyle = col('K3');
    for (let i = 0; i < 12; i++) {
      const a = start + (i / 12) * Math.PI * 2;
      const inFill = this.phase === 'closing' ? a <= start + sweep : a >= handA;
      if (!inFill) continue;
      for (let d = 60; d < R; d += 70) {
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      }
    }
    if (cover > 0.001 && cover < 0.999) {
      // brass hand
      ctx.strokeStyle = col('B4');
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(handA) * R, cy + Math.sin(handA) * R);
      ctx.stroke();
      ctx.strokeStyle = col('B6');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(handA) * R, cy + Math.sin(handA) * R);
      ctx.stroke();
      ctx.fillStyle = col('B4');
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col('K1');
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
  }
}
