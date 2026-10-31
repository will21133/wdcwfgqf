// Extra voices for the score, built from the AudioEngine primitives + raw WebAudio nodes.
// Registered under names that don't collide with ../instruments.ts.
import type { InstFn } from '../../engine/audio/music';
import type { AudioEngine } from '../../engine/audio/audio';

/** attack → sustain until dur-rel → exponential release (same shape as ../instruments.ts) */
// (gain.value is zeroed first: a GainNode passes its default 1.0 until the first automation event,
// which otherwise leaks a one-sample click at the note start.)
const env = (g: GainNode, t: number, a: number, peak: number, dur: number, rel: number) => {
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel));
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur + rel);
};

/** a zero-initialised gain node */
const gain0 = (ctx: BaseAudioContext) => { const g = ctx.createGain(); g.gain.value = 0; return g; };

/** filtered noise burst (like AudioEngine.noise, but click-free at the onset) */
const noise = (a: AudioEngine, out: AudioNode, t: number, o: { dur: number; vol: number; type: BiquadFilterType; f: number; q?: number; a?: number }) => {
  const ctx = a.ctx!;
  const src = ctx.createBufferSource(); src.buffer = a.noiseBuf;
  const flt = ctx.createBiquadFilter(); flt.type = o.type; flt.frequency.value = o.f; flt.Q.value = o.q ?? 1;
  const g = gain0(ctx);
  const at = o.a ?? 0.002;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.vol, t + at);
  g.gain.exponentialRampToValueAtTime(0.0008, t + at + o.dur);
  src.connect(flt).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + at + o.dur + 0.05);
};

/** slow vibrato LFO that fades in after `delay` seconds; returns the depth node to connect to .detune */
const vibrato = (ctx: BaseAudioContext, t: number, end: number, rate: number, cents: number, delay: number) => {
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rate;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(0, t + delay * 0.5);
  depth.gain.linearRampToValueAtTime(cents, t + delay);
  lfo.connect(depth);
  lfo.start(t);
  lfo.stop(end);
  return depth;
};

export const EXTRA_INSTRUMENTS: Record<string, InstFn> = {
  /** concert harp: bright pluck that rings, lower strings ring longer */
  harp: (a, out, t, f, _d, v) => {
    const ctx = a.ctx!;
    const ring = Math.min(2.6, 0.9 + 160 / f);
    const g = gain0(ctx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12 * v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0005, t + ring);
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 0.7;
    flt.frequency.setValueAtTime(Math.min(14000, f * 10), t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2), t + 0.5);
    flt.connect(g).connect(out);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(flt); o2.connect(g2).connect(flt);
    o.start(t); o2.start(t); o.stop(t + ring + 0.05); o2.stop(t + ring + 0.05);
  },

  /** glass harmonica: pure sine partials, soft attack, slow tremolo; sustains for the note length */
  glass: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const len = Math.max(0.2, d);
    const g = ctx.createGain(); env(g, t, 0.07, 0.07 * v, len, 0.7);
    const trem = ctx.createGain(); trem.gain.value = 1;
    const end = t + len + 0.8;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.2;
    const lg = ctx.createGain(); lg.gain.value = 0.16;
    lfo.connect(lg).connect(trem.gain);
    trem.connect(g).connect(out);
    for (const [mul, gv] of [[1, 1], [2, 0.2], [3.003, 0.05]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const og = ctx.createGain(); og.gain.value = gv;
      o.connect(og).connect(trem); o.start(t); o.stop(end);
    }
    lfo.start(t); lfo.stop(end);
  },

  /** sand shaker: soft, slightly swelling high noise grain */
  shaker: (a, out, t, _f, _d, v) => {
    noise(a, out, t, { dur: 0.07, vol: 0.05 * v, type: 'bandpass', f: 6500, q: 1.3, a: 0.018 });
  },

  /** pitched timpani: tuned thud with the drum's 1.5x partial */
  timpani: (a, out, t, f, _d, v) => {
    a.tone(out, t, { type: 'sine', f: f * 1.04, f2: f, sweep: 0.06, dur: 1.6, vol: 0.34 * v });
    a.tone(out, t, { type: 'sine', f: f * 1.5, dur: 0.7, vol: 0.08 * v });
    a.tone(out, t, { type: 'triangle', f: f * 2, dur: 0.3, vol: 0.04 * v });
    noise(a, out, t, { dur: 0.09, vol: 0.12 * v, type: 'lowpass', f: 700 });
  },

  /** brass/horn section: detuned saws through an opening filter, delayed vibrato */
  horn: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const len = Math.max(0.12, d);
    const end = t + len + 0.4;
    const g = ctx.createGain(); env(g, t, 0.05, 0.05 * v, len, 0.22);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 1.1;
    flt.frequency.setValueAtTime(f * 1.2, t);
    flt.frequency.linearRampToValueAtTime(Math.min(5000, f * (3 + 2 * v)), t + 0.09);
    flt.frequency.setTargetAtTime(Math.min(3500, f * 2.6), t + 0.12, 0.25);
    flt.connect(g).connect(out);
    const vib = vibrato(ctx, t, end, 5, 7, 0.4);
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      vib.connect(o.detune); o.connect(flt); o.start(t); o.stop(end);
    }
  },

  /** deep sustained drone: beating sines + soft octave, long swell */
  drone: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const len = Math.max(0.5, d);
    const rel = Math.min(1.5, len * 0.4);
    const g = ctx.createGain(); env(g, t, Math.min(1.2, len * 0.4), 0.09 * v, len, rel);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = Math.min(1600, 300 + f * 3);
    flt.connect(g).connect(out);
    const end = t + len + rel + 0.1;
    for (const [mul, gv, type] of [[1, 1, 'sine'], [1.004, 0.8, 'sine'], [2, 0.25, 'triangle'], [3, 0.06, 'sine']] as const) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
      const og = ctx.createGain(); og.gain.value = gv;
      o.connect(og).connect(flt); o.start(t); o.stop(end);
    }
  },

  /** soft suspended cymbal / crash */
  crash: (a, out, t, _f, _d, v) => {
    noise(a, out, t, { dur: 2.4, vol: 0.06 * v, type: 'highpass', f: 5000, q: 0.4, a: 0.004 });
    noise(a, out, t, { dur: 0.9, vol: 0.045 * v, type: 'bandpass', f: 3200, q: 0.7, a: 0.004 });
  },

  /** reverse swell — "time rewinding" — crescendos across the held length, then cuts off.
   *  Pitched notes add a reversed sine; percussion tokens give pure noise. */
  rewind: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const len = Math.max(0.25, d);
    const g = gain0(ctx);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08 * v, t + len);
    g.gain.linearRampToValueAtTime(0, t + len + 0.03);
    g.connect(out);
    const src = ctx.createBufferSource(); src.buffer = a.noiseBuf; src.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.Q.value = 0.8;
    flt.frequency.setValueAtTime(500, t); flt.frequency.exponentialRampToValueAtTime(7000, t + len);
    src.connect(flt).connect(g);
    src.start(t, Math.random()); src.stop(t + len + 0.05);
    if (f > 20) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.6;
      o.connect(og).connect(g); o.start(t); o.stop(t + len + 0.05);
    }
  },

  /** legato string section: slow bow attack, three detuned saws, delayed vibrato */
  bowed: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const len = Math.max(0.15, d);
    const end = t + len + 0.4;
    const g = ctx.createGain(); env(g, t, Math.min(0.14, len * 0.5), 0.036 * v, len, 0.3);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 0.5;
    flt.frequency.value = Math.min(4200, 1100 + f * 1.6);
    flt.connect(g).connect(out);
    const vib = vibrato(ctx, t, end, 5.2, 9, 0.45);
    for (const det of [-7, 0, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      vib.connect(o.detune); o.connect(flt); o.start(t); o.stop(end);
    }
  },

  /** pizzicato strings */
  pizz: (a, out, t, f, _d, v) => {
    const ctx = a.ctx!;
    const ring = 0.3 + 40 / f;
    const g = gain0(ctx);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, t + ring);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 2;
    flt.frequency.setValueAtTime(Math.min(9000, f * 6), t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(250, f * 1.4), t + 0.12);
    flt.connect(g).connect(out);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    o.connect(flt); o.start(t); o.stop(t + ring + 0.05);
  },

  /** reed (bassoon low / clarinet high): square+saw, nasal filter, delayed vibrato */
  reed: (a, out, t, f, d, v) => {
    const ctx = a.ctx!;
    const len = Math.max(0.08, d * 0.92);
    const end = t + len + 0.2;
    const g = ctx.createGain(); env(g, t, 0.025, 0.055 * v, len, 0.07);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 1.6;
    flt.frequency.value = Math.min(3200, Math.max(700, f * 4));
    flt.connect(g).connect(out);
    const vib = vibrato(ctx, t, end, 5.5, 8, 0.35);
    for (const [type, gv] of [['square', 0.7], ['sawtooth', 0.35]] as const) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = gv;
      vib.connect(o.detune); o.connect(og).connect(flt); o.start(t); o.stop(end);
    }
  },
};
