// Synth instruments for the score. Theme: music boxes, tower bells, clockwork percussion.
import type { InstFn } from '../engine/audio/music';

const env = (g: GainNode, t: number, a: number, peak: number, dur: number, rel: number) => {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur + rel);
};

export const INSTRUMENTS: Record<string, InstFn> = {
  // music box: bright FM pluck + faint octave sparkle
  box: (a, out, t, f, _d, v) => {
    a.bell(out, t, f, { dur: 1.8, vol: 0.11 * v, ratio: 4.0, index: 1.6, bright: 0.18 });
    a.tone(out, t, { type: 'sine', f: f * 2, dur: 0.6, vol: 0.015 * v });
  },
  celesta: (a, out, t, f, _d, v) => {
    a.bell(out, t, f, { dur: 1.2, vol: 0.08 * v, ratio: 2.0, index: 1.2, bright: 0.25 });
  },
  towerbell: (a, out, t, f, _d, v) => {
    a.bell(out, t, f, { dur: 4.5, vol: 0.16 * v, ratio: 1.41, index: 2.6, bright: 0.25 });
    a.bell(out, t, f * 2.01, { dur: 3, vol: 0.04 * v, ratio: 2.76, index: 1.5 });
  },
  pluck: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass';
    flt.frequency.setValueAtTime(f * 6, t); flt.frequency.exponentialRampToValueAtTime(f * 1.2, t + 0.3);
    const g = ctx.createGain(); env(g, t, 0.003, 0.14 * v, Math.min(d, 0.4), 0.25);
    o.connect(flt).connect(g).connect(out); o.start(t); o.stop(t + d + 0.8);
  },
  pad: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = 0.6;
    const g = ctx.createGain(); env(g, t, 0.5, 0.035 * v, d, 0.9);
    flt.connect(g).connect(out);
    for (const det of [-7, 7, 0]) {
      const o = ctx.createOscillator(); o.type = det === 0 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(flt); o.start(t); o.stop(t + d + 1.2);
    }
  },
  choir: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const g = ctx.createGain(); env(g, t, 0.6, 0.05 * v, d, 1.0);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 4;
    const mix = ctx.createGain(); mix.gain.value = 1;
    f1.connect(mix); f2.connect(mix); mix.connect(g).connect(out);
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + det * 0.05; const lg = ctx.createGain(); lg.gain.value = 6;
      lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(t + d + 1.5);
      o.connect(f1); o.connect(f2); o.start(t); o.stop(t + d + 1.5);
    }
  },
  strings: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2200;
    const g = ctx.createGain(); env(g, t, 0.015, 0.05 * v, Math.max(0.08, d * 0.8), 0.12);
    flt.connect(g).connect(out);
    for (const det of [-5, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(flt); o.start(t); o.stop(t + d + 0.3);
    }
  },
  lead: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = 0;
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(12, t + 0.25);
    lfo.connect(lg).connect(o.detune);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1800;
    const g = ctx.createGain(); env(g, t, 0.02, 0.035 * v, d, 0.15);
    o.connect(flt).connect(g).connect(out); o.start(t); lfo.start(t); o.stop(t + d + 0.3); lfo.stop(t + d + 0.3);
  },
  bass: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const g = ctx.createGain(); env(g, t, 0.005, 0.22 * v, Math.min(d, 0.5), 0.18);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(800, t); flt.frequency.exponentialRampToValueAtTime(200, t + 0.25);
    flt.connect(g).connect(out);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(flt);
    const s = ctx.createOscillator(); s.type = 'sine'; s.frequency.value = f / 2; const sg = ctx.createGain(); sg.gain.value = 0.8; s.connect(sg).connect(g);
    o.start(t); s.start(t); o.stop(t + d + 0.4); s.stop(t + d + 0.4);
  },
  kick: (a, out, t, _f, _d, v) => {
    a.tone(out, t, { type: 'sine', f: 130, f2: 42, dur: 0.22, vol: 0.5 * v, sweep: 0.12 });
    a.noise(out, t, { dur: 0.015, vol: 0.12 * v, type: 'highpass', f: 3000 });
  },
  snare: (a, out, t, _f, _d, v) => {
    a.noise(out, t, { dur: 0.14, vol: 0.18 * v, type: 'bandpass', f: 1900, q: 0.9 });
    a.tone(out, t, { type: 'triangle', f: 210, f2: 150, dur: 0.07, vol: 0.12 * v });
  },
  hat: (a, out, t, _f, _d, v) => { a.noise(out, t, { dur: 0.03, vol: 0.06 * v, type: 'highpass', f: 8000 }); },
  tick: (a, out, t, _f, _d, v) => {
    a.noise(out, t, { dur: 0.012, vol: 0.12 * v, type: 'highpass', f: 5500 });
    a.tone(out, t, { type: 'square', f: 3200, dur: 0.006, vol: 0.02 * v });
  },
  tock: (a, out, t, _f, _d, v) => {
    a.noise(out, t, { dur: 0.02, vol: 0.12 * v, type: 'bandpass', f: 1400, q: 4 });
    a.tone(out, t, { type: 'sine', f: 820, dur: 0.03, vol: 0.05 * v });
  },
  taiko: (a, out, t, _f, _d, v) => {
    a.tone(out, t, { type: 'sine', f: 90, f2: 50, dur: 0.5, vol: 0.55 * v });
    a.noise(out, t, { dur: 0.12, vol: 0.18 * v, type: 'lowpass', f: 600 });
  },
};
