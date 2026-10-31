// WebAudio engine: buses, generated reverb, voice limiting, synthesis primitives.

export type SfxFn = (a: AudioEngine, t: number, out: AudioNode, o: SfxOpts) => void;
export interface SfxOpts { vol?: number; pitch?: number; pan?: number; [k: string]: unknown }
interface SfxEntry { fn: SfxFn; minGap: number; maxVoices: number; vol: number; last: number; voices: number[] }

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  reverb!: ConvolverNode;
  reverbIn!: GainNode;
  musicReverbSend!: GainNode;
  sfxReverbSend!: GainNode;
  lowpass!: BiquadFilterNode;
  noiseBuf!: AudioBuffer;
  private registry = new Map<string, SfxEntry>();
  volumes = { master: 0.8, music: 0.7, sfx: 0.85 };
  private duckUntil = 0;

  /** must be called from a user gesture */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    this.master = ctx.createGain();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 22000;
    this.master.connect(this.lowpass).connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(2.6, 2.4);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    this.reverbIn.connect(this.reverb).connect(revOut).connect(this.master);
    this.musicReverbSend = ctx.createGain();
    this.musicReverbSend.gain.value = 0.35;
    this.musicBus.connect(this.musicReverbSend).connect(this.reverbIn);
    this.sfxReverbSend = ctx.createGain();
    this.sfxReverbSend.gain.value = 0.18;
    this.sfxBus.connect(this.sfxReverbSend).connect(this.reverbIn);
    // noise
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  /** muffle everything (pause menu / rewind) */
  muffle(on: boolean, freq = 900) {
    if (!this.ctx) return;
    this.lowpass.frequency.setTargetAtTime(on ? freq : 22000, this.ctx.currentTime, on ? 0.04 : 0.12);
  }

  /** briefly duck music under a big sfx */
  duck(amount = 0.45, dur = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t < this.duckUntil) return;
    this.duckUntil = t + dur * 0.5;
    const g = this.musicBus.gain;
    const base = this.volumes.music * 0.55;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(base * amount, t + 0.03);
    g.setTargetAtTime(base, t + 0.08, dur / 3);
  }

  private makeIR(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections + diffuse tail, slightly darker over time
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.55 - t * 0.4);
        const er = i < rate * 0.05 && Math.random() < 0.02 ? (Math.random() * 2 - 1) * 0.8 : 0;
        d[i] = (lp * Math.pow(1 - t, decay) + er) * 0.6;
      }
    }
    return buf;
  }

  register(name: string, fn: SfxFn, o: { minGap?: number; maxVoices?: number; vol?: number } = {}) {
    this.registry.set(name, { fn, minGap: o.minGap ?? 0.03, maxVoices: o.maxVoices ?? 6, vol: o.vol ?? 1, last: -1, voices: [] });
  }

  play(name: string, o: SfxOpts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const e = this.registry.get(name);
    if (!e) return;
    const t = this.ctx.currentTime;
    if (t - e.last < e.minGap) return;
    e.voices = e.voices.filter((v) => v > t);
    if (e.voices.length >= e.maxVoices) return;
    e.last = t;
    e.voices.push(t + 0.4);
    let out: AudioNode = this.sfxBus;
    const g = this.ctx.createGain();
    g.gain.value = (o.vol ?? 1) * e.vol;
    if (o.pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p).connect(out);
    } else g.connect(out);
    e.fn(this, t + 0.005, g, o);
  }

  // ───────────── synthesis primitives ─────────────

  /** oscillator with ADSR-ish envelope and optional pitch sweep */
  tone(out: AudioNode, t: number, o: {
    type?: OscillatorType; f: number; f2?: number; sweep?: number; dur: number; a?: number; vol?: number;
    curve?: 'exp' | 'lin'; detune?: number; release?: number;
  }) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.f2 !== undefined) {
      if (o.curve === 'lin') osc.frequency.linearRampToValueAtTime(o.f2, t + (o.sweep ?? o.dur));
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + (o.sweep ?? o.dur));
    }
    const g = ctx.createGain();
    const a = o.a ?? 0.002, v = o.vol ?? 0.5, rel = o.release ?? o.dur;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + a + rel);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + a + rel + 0.05);
    return { osc, g };
  }

  /** filtered noise burst */
  noise(out: AudioNode, t: number, o: {
    dur: number; vol?: number; type?: BiquadFilterType; f?: number; f2?: number; q?: number; a?: number; rate?: number;
  }) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = o.rate ?? 1;
    const flt = ctx.createBiquadFilter();
    flt.type = o.type ?? 'bandpass';
    flt.frequency.setValueAtTime(o.f ?? 2000, t);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    flt.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const a = o.a ?? 0.002;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol ?? 0.5, t + a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + a + o.dur);
    src.connect(flt).connect(g).connect(out);
    const off = Math.random() * 1.5;
    src.start(t, off);
    src.stop(t + a + o.dur + 0.05);
    return { src, flt, g };
  }

  /** FM bell / music box voice */
  bell(out: AudioNode, t: number, f: number, o: { dur?: number; vol?: number; ratio?: number; index?: number; bright?: number } = {}) {
    const ctx = this.ctx!;
    const dur = o.dur ?? 1.2;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    const g = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * (o.ratio ?? 3.5);
    mg.gain.setValueAtTime(f * (o.index ?? 2.2), t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05 + 0.01, t + dur * (o.bright ?? 0.35));
    mod.connect(mg).connect(car.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
    car.connect(g).connect(out);
    car.start(t); mod.start(t);
    car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }
}

export const audio = new AudioEngine();

export const noteFreq = (() => {
  const names: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const cache = new Map<string, number>();
  return (n: string): number => {
    let f = cache.get(n);
    if (f !== undefined) return f;
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    if (!m) return 0;
    let semi = names[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const oct = parseInt(m[3], 10);
    const midi = (oct + 1) * 12 + semi;
    f = 440 * Math.pow(2, (midi - 69) / 12);
    cache.set(n, f);
    return f;
  };
})();
