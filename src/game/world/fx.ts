import type { Renderer } from '../../engine/gfx/renderer';
import type { World } from './world';
import type { Actor } from '../entities/entity';
import { frand, fpick } from '../../engine/rng';
import { G } from '../G';
import { col, rgba } from '../../art/palette';
import { TAU } from '../../engine/math';
import { Text } from '../ui/text';
import { rect } from '../ui/draw';
import { tr, type L10n } from '../i18n';
import { Terms } from '../meta/registry';
import { term as termDef } from '../strings';

interface Num { x: number; y: number; vy: number; vx: number; t: number; str: string; color: string; big: boolean; outline?: string }
interface Ring { x: number; y: number; r0: number; r1: number; t: number; dur: number; color: string; width: number; layer: 'glow' | 'unlit' }
interface Banner { text: string; t: number; dur: number; color: string; x: number; y: number }
/** a slammed-down word over the action (TICK!, COUNTER, INTERRUPT, SYNC …; GDD2 §4.1, §4.5) */
interface Stamp { text: string | L10n; t: number; dur: number; color: string; rule: string; x: number; y: number; small: boolean; plain: L10n | null;
  /** merge key: stamps of one group landing together become one "WORD ×n" */
  group: string | null; n: number;
  /** UI px it was pushed up so it never covers an earlier stamp (only grows, so nothing jumps) */
  lift: number }

const NONE: { x0: number; y0: number; x1: number; y1: number }[] = [];

export class FX {
  nums: Num[] = [];
  rings: Ring[] = [];
  banners: Banner[] = [];
  stamps: Stamp[] = [];
  constructor(private w: World) {}

  update(dt: number) {
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      n.t += dt;
      n.y += n.vy * dt;
      n.x += n.vx * dt;
      n.vy += 140 * dt;
      if (n.vy > 10) n.vy = 10;
      if (n.t > 0.75) this.nums.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.t >= r.dur) this.rings.splice(i, 1);
    }
    for (let i = this.banners.length - 1; i >= 0; i--) {
      this.banners[i].t += dt;
      if (this.banners[i].t > this.banners[i].dur) this.banners.splice(i, 1);
    }
    for (let i = this.stamps.length - 1; i >= 0; i--) {
      this.stamps[i].t += dt;
      if (this.stamps[i].t > this.stamps[i].dur) this.stamps.splice(i, 1);
    }
  }

  render(r: Renderer) {
    const u = r.u;
    for (const rg of this.rings) {
      const k = rg.t / rg.dur;
      const e = 1 - Math.pow(1 - k, 3);
      const rad = rg.r0 + (rg.r1 - rg.r0) * e;
      const ctx = rg.layer === 'glow' ? r.g : u;
      if (rg.layer === 'glow') ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col(rg.color);
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = Math.max(1, rg.width * (1 - k));
      ctx.beginPath();
      ctx.ellipse(Math.round(rg.x), Math.round(rg.y), rad, rad * 0.72, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // numbers and banners are world-anchored UI: crisp, steady during rewind, above the post effects
    // (queued as one persistent callback: it reads the lists when the UI layer is flushed later in
    // this same frame, so nothing is copied or allocated per frame)
    if (!this.nums.length && !this.banners.length && !this.stamps.length) return;
    r.worldUi(this.drawUi);
  }

  private drawUi = (ctx: CanvasRenderingContext2D, toUi: (x: number, y: number) => { x: number; y: number }) => {
    for (const n of this.nums) {
      const pop = n.t < 0.06 ? 2 : 1;
      const a = n.t > 0.55 ? 1 - (n.t - 0.55) / 0.2 : 1;
      if (a <= 0) continue;
      const q = toUi(n.x, n.y);
      // centred on the anchor: 5×7 digits + outline are 9 font px tall
      G.digits.draw(ctx, n.str, q.x, q.y - 4.5 * pop * Text.k, { fill: n.color, hi: n.big ? 'B6' : undefined, outline: n.outline, align: 'center', alpha: a, pop });
    }
    for (const b of this.banners) {
      const k = b.t / b.dur;
      const a = k < 0.1 ? k / 0.1 : k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const yo = k < 0.1 ? (1 - k / 0.1) * 6 : 0;
      const q = toUi(b.x, b.y - yo - k * 8);
      Text.draw(ctx, b.text, q.x, q.y, { color: b.color, align: 'center', outline: 'K0', alpha: a });
    }
    // stamps are laid out oldest first: a later one that would cover an earlier one (COUNTER! on
    // TICK!, SYNC on a stamp next to it) is lifted above it, and stays lifted (acceptance D8)
    this.placed.length = 0;
    for (const st of this.stamps) {
      // slams in at double size for a few frames, settles, rises a little and fades
      const k = st.t / st.dur;
      const slam = st.t < 0.07;
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      if (a <= 0) continue;
      const size = slam ? (st.small ? 'body' : 'title') : st.small ? 'small' : 'body';
      const text = st.n > 1 ? `${tr(st.text)} ×${st.n}` : st.text;
      const q = toUi(st.x, st.y - k * 6);
      const tw = Math.ceil(Text.measure(text, size).w), lh = Math.ceil(Text.lineH(size));
      const plainH = st.plain && !slam ? Math.ceil(Text.lineH('small')) + 2 : 0;
      const pw = st.plain && !slam ? Math.ceil(Text.measure(st.plain, 'small').w) + 6 : 0;
      const bw = Math.max(tw + 10, pw), bh = lh + 3 + plainH;
      let y0 = Math.round(q.y - lh / 2) - 1 - st.lift;
      const x0 = Math.round(q.x - bw / 2);
      for (let guard = 0; guard < 6; guard++) {
        const hit = this.placed.find((b) => x0 < b.x1 && x0 + bw > b.x0 && y0 < b.y1 && y0 + bh > b.y0);
        if (!hit) break;
        const up = y0 + bh - hit.y0 + 2;
        st.lift += up; y0 -= up;
      }
      this.placed.push({ x0, y0, x1: x0 + bw, y1: y0 + bh });
      const cy = y0 + 1 + lh / 2;
      const bx0 = Math.round(q.x - tw / 2) - 5;
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * a * 0.95;
      rect(ctx, bx0, y0, tw + 10, lh + 3, 'K0');
      ctx.globalAlpha = a0 * a;
      rect(ctx, bx0, y0, tw + 10, 1, st.rule);
      rect(ctx, bx0, y0 + lh + 2, tw + 10, 1, st.rule);
      Text.draw(ctx, text, q.x, cy + 1, { size, align: 'center', valign: 'middle', color: st.color, alpha: a });
      // first sight of the word (GDD2 §9.8): its plain line under the stamp
      if (st.plain && !slam) {
        ctx.globalAlpha = a0 * a * 0.95;
        rect(ctx, Math.round(q.x - pw / 2), y0 + lh + 3, pw, plainH, 'K0');
        ctx.globalAlpha = a0;
        Text.draw(ctx, st.plain, q.x, y0 + lh + 4, { size: 'small', align: 'center', color: 'K9', alpha: a });
      }
      ctx.globalAlpha = a0;
    }
  };
  private placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  /** the UI-px boxes the stamps took this frame (term callouts keep off them) */
  stampBoxes(): readonly { x0: number; y0: number; x1: number; y1: number }[] { return this.stamps.length ? this.placed : NONE; }

  /**
   * Quiet a group's stamps (a chain is running: "CHAIN ×N" up top speaks for it). A stamp still
   * teaching its word (plain line under it) is kept.
   */
  quietGroup(group: string) {
    for (const st of this.stamps) if (st.group === group && !st.plain) st.dur = Math.min(st.dur, st.t + 0.25);
  }

  /**
   * A stamp: a short word slammed down over the action (UI layer, crisp). One at a time per spot —
   * a new stamp close to a live one replaces it, so a flurry of syncs never piles up.
   */
  stamp(x: number, y: number, text: string | L10n, color = 'K10', dur = 0.9, o: { rule?: string; small?: boolean; term?: string; group?: string } = {}) {
    // a group's stamps landing within 0.4 s of each other merge: "PARADOX! ×3", not three stamps
    if (o.group) {
      const g = this.stamps.find((s0) => s0.group === o.group && s0.t < 0.4 && Math.abs(s0.x - x) < 160 && Math.abs(s0.y - y) < 90);
      if (g) { g.n++; g.t = Math.min(g.t, 0.07); g.dur = Math.max(g.dur, dur); return; }
    }
    // the same word lands on itself → replaced; a different word (TICK! then COUNTER!) stacks above
    const key = typeof text === 'string' ? text : text.en;
    for (let k = 0; k < 4; k++) {
      let moved = false;
      for (let i = this.stamps.length - 1; i >= 0; i--) {
        const s0 = this.stamps[i];
        if (Math.abs(s0.x - x) >= 40 || Math.abs(s0.y - s0.t / s0.dur * 6 - y) >= 18) continue;
        if ((typeof s0.text === 'string' ? s0.text : s0.text.en) === key) this.stamps.splice(i, 1);
        else { y = s0.y - s0.t / s0.dur * 6 - 20; moved = true; }
      }
      if (!moved) break;
    }
    // `term`: while the player is still learning the word, its plain line hangs under it
    let plain: L10n | null = null;
    if (o.term && Terms.showPlain(o.term)) {
      const td = termDef(o.term);
      plain = td?.plain ?? null;
      // name the term when the stamp itself doesn't ("TICK!" → "卡秒 – 攻击命中前一刻冲刺 → 反击")
      if (td && plain) {
        const says = (lang: 'zh' | 'en') => (typeof text === 'string' ? text : text[lang]).toLowerCase().includes(td.name[lang].toLowerCase().replace(/ ◆$/, ''));
        plain = { zh: says('zh') ? plain.zh : `${td.name.zh} – ${plain.zh}`, en: says('en') ? plain.en : `${td.name.en} – ${plain.en}` };
      }
      Terms.seen(o.term);
      if (plain) dur = Math.max(dur, 1.8);
    }
    this.stamps.push({ text, x, y, t: 0, dur, color, rule: o.rule ?? color, small: !!o.small, plain, group: o.group ?? null, n: 1, lift: 0 });
  }

  /** a damage number; `outline` = the owner's colour round an echo's number (co-op) */
  number(x: number, y: number, amt: number, color: string, big: boolean, outline?: string) {
    const v = Math.round(amt);
    if (v <= 0) return;
    // merge with a very recent number at the same spot (dot ticks)
    this.nums.push({ x: x + frand(-4, 4), y, vy: big ? -95 : -70, vx: frand(-12, 12), t: 0, str: String(v), color, big, outline });
  }

  banner(x: number, y: number, text: string, color = 'K10', dur = 1.1) {
    // a banner landing on one that is still up (two hands' picks, a pick and "cleared") stacks
    // above it instead of printing over it
    for (let k = 0; k < 4; k++) {
      const hit = this.banners.find((b) => b.t < b.dur * 0.8 && Math.abs(b.x - x) < 70 && Math.abs(b.y - b.t / b.dur * 8 - y) < 13);
      if (!hit) break;
      y = hit.y - (hit.t / hit.dur) * 8 - 14;
    }
    this.banners.push({ text, x, y, t: 0, dur, color });
  }

  ring(x: number, y: number, r0: number, r1: number, dur: number, color: string, width = 2, layer: 'glow' | 'unlit' = 'glow') {
    this.rings.push({ x, y, r0, r1, t: 0, dur, color, width, layer });
  }

  hitSparks(x: number, y: number, ang: number, style: 'normal' | 'crit' | 'echo' | 'blood', amt: number) {
    const P = this.w.particles;
    const n = Math.min(14, 4 + Math.floor(amt / 6));
    const ramp = style === 'echo' ? ['C4', 'C3', 'C2'] : style === 'blood' ? ['R4', 'R3', 'R2'] : style === 'crit' ? ['W', 'B6', 'B5', 'O2'] : ['W', 'B6', 'B4'];
    for (let i = 0; i < n; i++) {
      const a = ang + frand(-0.7, 0.7);
      const s = frand(90, 260);
      P.spawn({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: frand(0.12, 0.3), ramp, drag: 8, layer: 'glow', size: 1.5 });
    }
    // impact flash
    P.spawn({ kind: 'smoke', x, y, life: 0.08, ramp: style === 'echo' ? ['C4'] : ['W'], size: style === 'crit' ? 7 : 5, size2: 1, layer: 'glow' });
    // oil / gear chips from automatons
    if (style !== 'echo' && style !== 'blood') {
      for (let i = 0; i < 3; i++) {
        const a = ang + frand(-1, 1);
        P.spawn({ kind: 'debris', x, y, z: 6, vx: Math.cos(a) * frand(30, 90), vy: Math.sin(a) * frand(30, 90), vz: frand(40, 90), grav: 300, life: frand(0.5, 0.9), ramp: [fpick(['B3', 'K6', 'B2'])], size: 1 });
      }
    }
  }

  burst(x: number, y: number, n: number, ramp: string[], speed = 120, life = 0.4, layer: 'world' | 'glow' | 'unlit' = 'glow', kind: 'px' | 'spark' = 'spark') {
    for (let i = 0; i < n; i++) {
      const a = frand(0, TAU), s = frand(speed * 0.3, speed);
      this.w.particles.spawn({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.75, life: frand(life * 0.5, life), ramp, drag: 5, layer, size: 1.5 });
    }
  }

  dust(x: number, y: number, n = 4, dir?: number) {
    for (let i = 0; i < n; i++) {
      const a = dir !== undefined ? dir + Math.PI + frand(-0.8, 0.8) : frand(0, TAU);
      const s = frand(10, 35);
      this.w.particles.spawn({ kind: 'smoke', x: x + frand(-3, 3), y: y + frand(-1, 1), vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - 6, life: frand(0.3, 0.55), ramp: ['K7', 'K6', 'K5'], size: frand(1.5, 2.5), size2: frand(3, 4.5), drag: 4, alpha: 0.55 });
    }
  }

  smoke(x: number, y: number, n = 6, ramp = ['K7', 'K6', 'K5', 'K4']) {
    for (let i = 0; i < n; i++) {
      this.w.particles.spawn({ kind: 'smoke', x: x + frand(-5, 5), y: y + frand(-4, 4), vx: frand(-15, 15), vy: frand(-30, -10), life: frand(0.5, 1), ramp, size: frand(2, 3), size2: frand(5, 8), drag: 2, alpha: 0.6 });
    }
  }

  splash(x: number, y: number) {
    const th = this.w.theme;
    for (let i = 0; i < 14; i++) {
      const a = frand(-Math.PI, 0);
      this.w.particles.spawn({ kind: 'debris', x, y, z: 0, vx: Math.cos(a) * frand(20, 60), vy: Math.sin(a) * frand(5, 20), vz: frand(60, 140), grav: 400, life: frand(0.4, 0.7), ramp: [th.pitWater[4], th.pitWater[3], th.pitWater[2]], size: 1, bounce: 0 });
    }
    this.ring(x, y, 2, 14, 0.4, th.pitWater[4], 1, 'unlit');
    G.audio.play(th.key === 'archive' ? 'sandSink' : th.key === 'clockface' ? 'fall' : 'splash', { pan: this.w.pan(x) });
  }

  /** automaton death: gears, springs, oil decal */
  shatter(a: Actor, palette: string[], scale = 1) {
    const P = this.w.particles;
    const n = Math.round(14 * scale);
    for (let i = 0; i < n; i++) {
      const ang = frand(0, TAU), s = frand(40, 150) * Math.sqrt(scale);
      P.spawn({ kind: 'debris', x: a.x, y: a.y - 2, z: frand(4, a.height * 0.8), vx: Math.cos(ang) * s, vy: Math.sin(ang) * s * 0.7, vz: frand(50, 160), grav: 380, life: frand(0.7, 1.4), ramp: [fpick(palette)], size: frand(1, 2.5), vrot: frand(-10, 10), bounce: 0.45 });
    }
    for (let i = 0; i < 8 * scale; i++) {
      const ang = frand(0, TAU), s = frand(100, 260);
      P.spawn({ kind: 'spark', x: a.x, y: a.y - a.height / 2, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, life: frand(0.15, 0.35), ramp: ['W', 'B6', 'O3', 'O1'], drag: 6, layer: 'glow' });
    }
    this.smoke(a.x, a.y - a.height / 2, Math.round(5 * scale));
    P.spawn({ kind: 'smoke', x: a.x, y: a.y - a.height / 2, life: 0.12, ramp: ['W', 'B6'], size: 10 * scale, size2: 2, layer: 'glow' });
    this.ring(a.x, a.y - 2, 4, 26 * scale, 0.35, 'B5', 2);
    this.oilDecal(a.x, a.y, 5 * scale);
  }

  oilDecal(x: number, y: number, r: number) {
    const c = this.w.dctx;
    c.fillStyle = rgba('K0', 0.35);
    for (let i = 0; i < 6; i++) {
      const rx = frand(r * 0.4, r), ry = rx * 0.55;
      const ox = frand(-r, r), oy = frand(-r * 0.5, r * 0.5);
      c.beginPath();
      c.ellipse(Math.round(x + ox), Math.round(y + oy), rx, ry, 0, 0, TAU);
      c.fill();
    }
  }

  scorch(x: number, y: number, r: number) {
    const c = this.w.dctx;
    c.fillStyle = rgba('K0', 0.25);
    c.beginPath();
    c.ellipse(Math.round(x), Math.round(y), r, r * 0.6, 0, 0, TAU);
    c.fill();
  }

  corrode(x: number, y: number) {
    this.burst(x, y, 18, ['T5', 'T4', 'T3', 'G2'], 140, 0.5);
    this.ring(x, y, 4, 40, 0.4, 'T4', 3);
    G.audio.play('corrode', { pan: this.w.pan(x) });
  }

  stasisRelease(x: number, y: number, amt: number) {
    this.burst(x, y, 16, ['V4', 'V3', 'C3'], 160, 0.45);
    this.ring(x, y, 2, 30, 0.35, 'V4', 3);
    this.w.shake(Math.min(0.35, 0.08 + amt / 200));
    this.w.hitstop(0.06);
    G.audio.play('stasisBreak', { pan: this.w.pan(x) });
  }

  burnTick(t: Actor) {
    for (let i = 0; i < 2; i++)
      this.w.particles.spawn({ kind: 'px', x: t.x + frand(-4, 4), y: t.y - frand(2, t.height), vx: frand(-6, 6), vy: frand(-40, -20), life: frand(0.3, 0.5), ramp: ['O4', 'O3', 'O2', 'O1'], layer: 'glow', size: 1.5 });
  }

  /** soft telegraph helpers are drawn by entities themselves */
}
