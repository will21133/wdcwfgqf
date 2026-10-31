// Step sequencer with adaptive layers and crossfades.
// Pattern notation (one token per step, space separated):
//   .        rest
//   -        hold previous note one more step
//   C4       note;  C4+E4+G4  chord;  suffix ! accent, ? soft  (e.g. "E5!")
import { AudioEngine, noteFreq } from './audio';

export type Layer = 'base' | 'combat' | 'boss' | 'calm' | 'tension';

export interface TrackDef {
  inst: string;
  layer?: Layer;
  vol?: number;
  pan?: number;
  /** pattern tokens; repeats if shorter than the song */
  p: string;
  /** octave/semitone transpose */
  tr?: number;
}

export interface SongDef {
  bpm: number;
  /** steps per beat (4 = 16ths) */
  spb?: number;
  /** total steps before looping */
  len: number;
  swing?: number;
  tracks: TrackDef[];
  /** initial layer levels */
  layers?: Partial<Record<Layer, number>>;
}

export type InstFn = (a: AudioEngine, out: AudioNode, t: number, f: number, dur: number, vel: number) => void;

interface ParsedTrack { def: TrackDef; steps: ({ notes: number[]; len: number; vel: number } | null)[]; gain: GainNode }

class SongPlayer {
  out: GainNode;
  layerGains = new Map<Layer, GainNode>();
  tracks: ParsedTrack[] = [];
  step = 0;
  nextTime = 0;
  stepDur: number;
  stopped = false;

  constructor(private a: AudioEngine, public def: SongDef, dest: AudioNode, private insts: Record<string, InstFn>) {
    const ctx = a.ctx!;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.stepDur = 60 / def.bpm / (def.spb ?? 4);
    const layers: Layer[] = ['base', 'combat', 'boss', 'calm', 'tension'];
    for (const l of layers) {
      const g = ctx.createGain();
      g.gain.value = def.layers?.[l] ?? (l === 'base' ? 1 : 0);
      g.connect(this.out);
      this.layerGains.set(l, g);
    }
    for (const td of def.tracks) {
      const g = ctx.createGain();
      g.gain.value = td.vol ?? 1;
      if (td.pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = td.pan;
        g.connect(p).connect(this.layerGains.get(td.layer ?? 'base')!);
      } else g.connect(this.layerGains.get(td.layer ?? 'base')!);
      this.tracks.push({ def: td, steps: parsePattern(td.p, td.tr ?? 0), gain: g });
    }
    this.nextTime = ctx.currentTime + 0.08;
  }

  setLayer(l: Layer, v: number, time = 1.5) {
    const g = this.layerGains.get(l);
    if (!g || !this.a.ctx) return;
    g.gain.setTargetAtTime(v, this.a.ctx.currentTime, time / 3);
  }

  schedule(until: number) {
    while (this.nextTime < until && !this.stopped) {
      const swing = this.def.swing ?? 0;
      const sw = this.step % 2 === 1 ? swing * this.stepDur : 0;
      for (const tr of this.tracks) {
        const s = tr.steps[this.step % tr.steps.length];
        if (!s) continue;
        const fn = this.insts[tr.def.inst];
        if (!fn) continue;
        for (const f of s.notes) fn(this.a, tr.gain, this.nextTime + sw, f, s.len * this.stepDur, s.vel);
      }
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % this.def.len;
    }
  }

  /** current position in beats (for visual sync) */
  beat(now: number) {
    return (this.step - (this.nextTime - now) / this.stepDur) / (this.def.spb ?? 4);
  }
}

function parsePattern(p: string, tr: number) {
  const toks = p.trim().split(/\s+/);
  const out: ({ notes: number[]; len: number; vel: number } | null)[] = toks.map(() => null);
  for (let i = 0; i < toks.length; i++) {
    let tk = toks[i];
    if (tk === '.' || tk === '-') continue;
    let vel = 0.8;
    if (tk.endsWith('!')) { vel = 1; tk = tk.slice(0, -1); }
    else if (tk.endsWith('?')) { vel = 0.5; tk = tk.slice(0, -1); }
    let len = 1;
    while (i + len < toks.length && toks[i + len] === '-') len++;
    const notes = tk.split('+').map((n) => noteFreq(n) * Math.pow(2, tr / 12)).filter((f) => f > 0);
    // percussion tokens (x, X) map to a nominal frequency
    if (!notes.length && /^[xXo]$/.test(tk)) notes.push(tk === 'X' ? 2 : 1);
    if (tk === 'X') vel = 1;
    out[i] = { notes, len, vel };
  }
  return out;
}

export class Music {
  private cur: SongPlayer | null = null;
  private fading: SongPlayer[] = [];
  private timer: number | null = null;
  curName = '';
  private songs: Record<string, SongDef> = {};
  private pendingLayers: Partial<Record<Layer, number>> = {};

  constructor(private a: AudioEngine, private insts: Record<string, InstFn>) {}

  define(name: string, s: SongDef) { this.songs[name] = s; }

  play(name: string, fade = 1.2) {
    if (name === this.curName && this.cur) return;
    if (!this.a.ctx) { this.curName = name; return; }
    const def = this.songs[name];
    const ctx = this.a.ctx;
    if (this.cur) {
      const old = this.cur;
      old.out.gain.cancelScheduledValues(ctx.currentTime);
      old.out.gain.setValueAtTime(old.out.gain.value, ctx.currentTime);
      old.out.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
      this.fading.push(old);
      setTimeout(() => { old.stopped = true; old.out.disconnect(); this.fading = this.fading.filter((f) => f !== old); }, fade * 1000 + 400);
    }
    this.curName = name;
    this.cur = null;
    if (!def) return;
    const p = new SongPlayer(this.a, def, this.a.musicBus, this.insts);
    p.out.gain.setValueAtTime(0, ctx.currentTime);
    p.out.gain.linearRampToValueAtTime(1, ctx.currentTime + fade * 0.8);
    this.cur = p;
    for (const [l, v] of Object.entries(this.pendingLayers)) p.setLayer(l as Layer, v!, 0.01);
    this.ensureTimer();
  }

  stop(fade = 1) {
    this.play('__silence__', fade);
    this.curName = '';
  }

  layer(l: Layer, v: number, time = 1.5) {
    this.pendingLayers[l] = v;
    this.cur?.setLayer(l, v, time);
  }
  resetLayers() { this.pendingLayers = {}; }

  beat() { return this.cur && this.a.ctx ? this.cur.beat(this.a.ctx.currentTime) : 0; }

  /** resume after audio unlock */
  resume() {
    if (this.curName && !this.cur) {
      const n = this.curName;
      this.curName = '';
      this.play(n);
    }
  }

  private ensureTimer() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => {
      if (!this.a.ctx) return;
      const until = this.a.ctx.currentTime + 0.18;
      this.cur?.schedule(until);
      for (const f of this.fading) f.schedule(until);
    }, 25);
  }
}
