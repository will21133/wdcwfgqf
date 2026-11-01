// Sound design — every effect synthesised (clockwork, brass, glass, steam).
import { AudioEngine, SfxFn } from '../engine/audio/audio';

const R = (a: number, b: number) => a + Math.random() * (b - a);

export function registerSfx(a: AudioEngine) {
  const reg = (n: string, fn: SfxFn, o?: { minGap?: number; maxVoices?: number; vol?: number }) => a.register(n, fn, o);

  // ── player ──
  reg('thrust', (a, t, out) => {
    a.noise(out, t, { dur: 0.09, vol: 0.35, type: 'bandpass', f: 5200, f2: 1400, q: 1.6 });
    a.tone(out, t, { type: 'triangle', f: 1400 * R(0.95, 1.05), f2: 600, dur: 0.05, vol: 0.12 });
  }, { minGap: 0.02 });
  reg('swingHeavy', (a, t, out) => {
    a.noise(out, t, { dur: 0.18, vol: 0.45, type: 'bandpass', f: 2600, f2: 380, q: 1.2, a: 0.02 });
    a.tone(out, t, { type: 'sine', f: 220, f2: 90, dur: 0.12, vol: 0.12 });
  });
  reg('swingEcho', (a, t, out) => {
    a.noise(out, t, { dur: 0.08, vol: 0.18, type: 'bandpass', f: 6000, f2: 2400, q: 2 });
    a.bell(out, t, 2093 * R(0.98, 1.02), { dur: 0.25, vol: 0.05, ratio: 2.01, index: 1 });
  }, { minGap: 0.03 });
  reg('lunge', (a, t, out) => {
    a.noise(out, t, { dur: 0.22, vol: 0.4, type: 'bandpass', f: 1800, f2: 5000, q: 1.2, a: 0.03 });
    a.bell(out, t + 0.05, 1568, { dur: 0.4, vol: 0.08, ratio: 2.76, index: 1.5 });
  });
  reg('dash', (a, t, out) => {
    a.noise(out, t, { dur: 0.14, vol: 0.3, type: 'highpass', f: 1200, f2: 4000, q: 0.7, a: 0.02 });
  });
  reg('dashEcho', (a, t, out) => { a.noise(out, t, { dur: 0.1, vol: 0.12, type: 'highpass', f: 3000, f2: 6000 }); });
  reg('step', (a, t, out) => {
    a.noise(out, t, { dur: 0.015, vol: 0.18, type: 'highpass', f: 4500, q: 1 });
    a.tone(out, t, { type: 'square', f: R(1800, 2200), dur: 0.008, vol: 0.02 });
  }, { minGap: 0.08 });
  reg('hurt', (a, t, out) => {
    a.noise(out, t, { dur: 0.16, vol: 0.55, type: 'lowpass', f: 3000, f2: 400 });
    a.tone(out, t, { type: 'square', f: 260, f2: 90, dur: 0.16, vol: 0.18 });
    a.tone(out, t, { type: 'sine', f: 120, f2: 40, dur: 0.2, vol: 0.5 });
    a.bell(out, t, 740, { dur: 0.5, vol: 0.06, ratio: 1.41, index: 3 });
  });
  reg('playerDeath', (a, t, out) => {
    for (let i = 0; i < 6; i++) a.noise(out, t + i * (0.18 + i * 0.05), { dur: 0.02, vol: 0.3 - i * 0.04, type: 'highpass', f: 3500 });
    a.tone(out, t, { type: 'sine', f: 110, f2: 30, dur: 1.2, vol: 0.5 });
    a.bell(out, t, 220, { dur: 2.5, vol: 0.15, ratio: 1.41, index: 2 });
  });
  reg('heartbeat', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 70, f2: 50, dur: 0.1, vol: 0.5 });
    a.tone(out, t + 0.16, { type: 'sine', f: 62, f2: 45, dur: 0.12, vol: 0.35 });
    a.noise(out, t, { dur: 0.012, vol: 0.08, type: 'highpass', f: 4000 });
  }, { minGap: 0.4 });
  reg('denied', (a, t, out) => {
    a.tone(out, t, { type: 'square', f: 180, dur: 0.05, vol: 0.08 });
    a.tone(out, t + 0.07, { type: 'square', f: 140, dur: 0.07, vol: 0.08 });
  }, { minGap: 0.2 });

  // ── rewind / echo / paradox (signature sounds) ──
  reg('rewind', (a, t, out) => {
    const ctx = a.ctx!;
    // reverse swell: noise with rising gain
    const src = ctx.createBufferSource(); src.buffer = a.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.42);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 0.44);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 0.5);
    // accelerating reverse ticks
    let tt = t;
    for (let i = 0; i < 14; i++) {
      const gap = 0.06 * Math.pow(0.86, i);
      a.noise(out, tt, { dur: 0.012, vol: 0.35, type: 'highpass', f: 3000 + i * 200 });
      a.tone(out, tt, { type: 'square', f: 900 + i * 90, dur: 0.01, vol: 0.04 });
      tt += gap;
    }
    a.tone(out, t, { type: 'sine', f: 300, f2: 1200, dur: 0.42, vol: 0.08, curve: 'exp', a: 0.3, release: 0.12 });
  });
  reg('rewindEnd', (a, t, out) => {
    a.bell(out, t, 1046.5, { dur: 1.4, vol: 0.12, ratio: 3.5, index: 1.4 });
    a.bell(out, t + 0.02, 1568, { dur: 1.2, vol: 0.08, ratio: 3.5, index: 1.2 });
    a.tone(out, t, { type: 'sine', f: 180, f2: 60, dur: 0.25, vol: 0.4 });
    a.noise(out, t, { dur: 0.3, vol: 0.12, type: 'highpass', f: 6000, f2: 2000 });
  });
  // Rewind 2.0 (GDD2 §3.2): press = the tape catches (a short downward wow), scrubbing clicks
  // every 0.5 s, the landing is a hard mechanical click; a Perfect Rewind rings high
  reg('rewindHold', (a, t, out) => {
    a.tone(out, t, { type: 'triangle', f: 1400, f2: 320, dur: 0.16, vol: 0.09, curve: 'exp' });
    a.noise(out, t, { dur: 0.12, vol: 0.14, type: 'bandpass', f: 4200, f2: 900, q: 1.4 });
    a.tone(out, t, { type: 'sine', f: 220, f2: 140, dur: 0.18, vol: 0.18 });
  }, { minGap: 0.1 });
  reg('tapeClick', (a, t, out) => {
    a.noise(out, t, { dur: 0.008, vol: 0.4, type: 'highpass', f: 5200 });
    a.tone(out, t, { type: 'square', f: 1900 * R(0.97, 1.03), dur: 0.006, vol: 0.05 });
    a.tone(out, t + 0.012, { type: 'square', f: 1250, dur: 0.008, vol: 0.035 });
    a.noise(out, t + 0.03, { dur: 0.02, vol: 0.08, type: 'bandpass', f: 900, q: 2 });
  }, { minGap: 0.06 });
  reg('rewindLand', (a, t, out) => {
    a.noise(out, t, { dur: 0.012, vol: 0.55, type: 'highpass', f: 3800 });
    a.tone(out, t, { type: 'square', f: 2600, f2: 1800, dur: 0.012, vol: 0.06 });
    a.tone(out, t, { type: 'sine', f: 140, f2: 70, dur: 0.09, vol: 0.32 });
    a.noise(out, t + 0.025, { dur: 0.03, vol: 0.12, type: 'bandpass', f: 1400, q: 3 });
  }, { minGap: 0.08 });
  reg('perfectRewind', (a, t, out) => {
    a.bell(out, t, 3136, { dur: 1.1, vol: 0.12, ratio: 2.01, index: 1.2 });
    a.bell(out, t + 0.05, 4186, { dur: 0.9, vol: 0.08, ratio: 2.01, index: 0.8 });
    a.noise(out, t, { dur: 0.25, vol: 0.12, type: 'highpass', f: 7000, f2: 3000 });
  }, { minGap: 0.2 });
  reg('echoEnd', (a, t, out) => {
    a.bell(out, t, 2637 * R(0.97, 1.03), { dur: 0.6, vol: 0.06, ratio: 2.76, index: 0.8 });
    a.noise(out, t, { dur: 0.15, vol: 0.1, type: 'highpass', f: 7000 });
  }, { minGap: 0.05 });
  reg('paradox', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 95, f2: 28, dur: 0.7, vol: 0.9 });
    a.noise(out, t, { dur: 0.45, vol: 0.6, type: 'lowpass', f: 6000, f2: 300 });
    for (const [f, d] of [[1318.5, 0], [1760, 0.03], [2349, 0.06], [3136, 0.09]]) a.bell(out, t + d, f, { dur: 1.6, vol: 0.09, ratio: 2.76, index: 2 });
    a.tone(out, t, { type: 'sawtooth', f: 2400, f2: 200, dur: 0.3, vol: 0.06 });
  });
  // F3b (GDD2 §3.4–3.7, §4.1): the echo arming "pip", Fork, Recall, chained blasts, Sync's
  // tick·tock, Tick-Dodge, the Counter, an interrupt and an echo breaking like glass
  reg('echoArm', (a, t, out) => {
    a.bell(out, t, 2793, { dur: 0.22, vol: 0.07, ratio: 2.01, index: 0.6 });
    a.tone(out, t, { type: 'square', f: 3520, dur: 0.01, vol: 0.025 });
  }, { minGap: 0.06 });
  reg('fork', (a, t, out) => {
    a.noise(out, t, { dur: 0.01, vol: 0.45, type: 'highpass', f: 5000 });
    a.tone(out, t, { type: 'triangle', f: 520, f2: 1560, dur: 0.14, vol: 0.08, curve: 'exp' });
    a.bell(out, t + 0.06, 1760, { dur: 0.7, vol: 0.08, ratio: 2.76, index: 1.1 });
    a.bell(out, t + 0.1, 2637, { dur: 0.5, vol: 0.05, ratio: 2.01, index: 0.8 });
  }, { minGap: 0.12 });
  reg('recall', (a, t, out) => {
    a.noise(out, t, { dur: 0.35, vol: 0.3, type: 'bandpass', f: 900, f2: 5200, q: 1.4, a: 0.05 });
    a.tone(out, t, { type: 'sawtooth', f: 180, f2: 720, dur: 0.3, vol: 0.05 });
    a.bell(out, t + 0.25, 2093, { dur: 0.6, vol: 0.07, ratio: 2.01, index: 1 });
  }, { minGap: 0.2 });
  reg('paradoxChain', (a, t, out, o) => {
    const k = Math.pow(1.122, Number((o as { pitch?: number }).pitch ?? 1));
    a.tone(out, t, { type: 'sine', f: 140 * k, f2: 45, dur: 0.4, vol: 0.5 });
    a.noise(out, t, { dur: 0.25, vol: 0.35, type: 'lowpass', f: 6500, f2: 500 });
    a.bell(out, t, 2349 * k, { dur: 1.1, vol: 0.1, ratio: 2.76, index: 1.8 });
  }, { minGap: 0.04, maxVoices: 4 });
  reg('sync', (a, t, out) => {
    a.tone(out, t, { type: 'square', f: 2637, dur: 0.012, vol: 0.06 });
    a.bell(out, t, 1975, { dur: 0.25, vol: 0.07, ratio: 2.01, index: 0.7 });
    a.tone(out, t + 0.07, { type: 'square', f: 1760, dur: 0.012, vol: 0.06 });
    a.bell(out, t + 0.07, 1318.5, { dur: 0.3, vol: 0.07, ratio: 2.01, index: 0.7 });
  }, { minGap: 0.05 });
  reg('chord', (a, t, out, o) => {
    const n = Math.max(3, Math.min(8, Number((o as { pitch?: number }).pitch ?? 3)));
    const k = Math.pow(1.0595, (n - 3) * 2);
    for (const [f, d] of [[1318.5, 0], [1661, 0.025], [1975, 0.05], [2637, 0.075]]) a.bell(out, t + d, f * k, { dur: 0.9, vol: 0.07, ratio: 2.01, index: 0.9 });
    a.tone(out, t, { type: 'square', f: 2637 * k, dur: 0.012, vol: 0.06 });
  }, { minGap: 0.08 });
  reg('tickDodge', (a, t, out) => {
    a.noise(out, t, { dur: 0.006, vol: 0.6, type: 'highpass', f: 6000 });
    a.tone(out, t, { type: 'square', f: 3136, dur: 0.008, vol: 0.08 });
    a.bell(out, t + 0.01, 4186, { dur: 0.6, vol: 0.09, ratio: 2.01, index: 0.5 });
    a.noise(out, t + 0.02, { dur: 0.25, vol: 0.12, type: 'highpass', f: 2500, f2: 7000 });
  }, { minGap: 0.2 });
  reg('counter', (a, t, out) => {
    a.noise(out, t, { dur: 0.12, vol: 0.65, type: 'lowpass', f: 7000, f2: 700 });
    a.tone(out, t, { type: 'sine', f: 180, f2: 38, dur: 0.22, vol: 0.65 });
    a.bell(out, t, 2637, { dur: 0.7, vol: 0.12, ratio: 2.76, index: 2.2 });
  }, { minGap: 0.1 });
  reg('interrupt', (a, t, out) => {
    a.bell(out, t, 784, { dur: 0.6, vol: 0.16, ratio: 2.76, index: 3.5 });
    a.noise(out, t, { dur: 0.08, vol: 0.4, type: 'bandpass', f: 2400, q: 1.2 });
    a.tone(out, t, { type: 'square', f: 420, f2: 160, dur: 0.1, vol: 0.08 });
  }, { minGap: 0.1 });
  reg('echoShatter', (a, t, out) => {
    a.noise(out, t, { dur: 0.22, vol: 0.32, type: 'highpass', f: 5200, f2: 2600 });
    for (let i = 0; i < 4; i++) a.bell(out, t + i * R(0.02, 0.05), R(2600, 4400), { dur: 0.3, vol: 0.05, ratio: 2.76, index: 1 });
  }, { minGap: 0.05 });

  // ── combat impacts ──
  reg('hit', (a, t, out) => {
    a.noise(out, t, { dur: 0.06, vol: 0.5, type: 'lowpass', f: 3500, f2: 800 });
    a.tone(out, t, { type: 'sine', f: 190 * R(0.9, 1.1), f2: 60, dur: 0.09, vol: 0.45 });
    a.tone(out, t, { type: 'square', f: 2600 * R(0.9, 1.1), dur: 0.012, vol: 0.06 });
  }, { minGap: 0.025, maxVoices: 5 });
  reg('hitCrit', (a, t, out) => {
    a.noise(out, t, { dur: 0.1, vol: 0.6, type: 'lowpass', f: 5000, f2: 600 });
    a.tone(out, t, { type: 'sine', f: 160, f2: 40, dur: 0.16, vol: 0.6 });
    a.bell(out, t, 1975 * R(0.97, 1.03), { dur: 0.5, vol: 0.12, ratio: 2.76, index: 2.5 });
  }, { minGap: 0.03 });
  reg('hitEcho', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 160, f2: 70, dur: 0.06, vol: 0.25 });
    a.bell(out, t, 2489 * R(0.95, 1.05), { dur: 0.3, vol: 0.07, ratio: 2.01, index: 1.2 });
  }, { minGap: 0.03, maxVoices: 4 });
  reg('clank', (a, t, out) => {
    a.bell(out, t, 523 * R(0.9, 1.1), { dur: 0.5, vol: 0.18, ratio: 2.76, index: 4 });
    a.noise(out, t, { dur: 0.05, vol: 0.3, type: 'bandpass', f: 2000 });
  });
  reg('death', (a, t, out) => {
    a.noise(out, t, { dur: 0.25, vol: 0.5, type: 'bandpass', f: 1600, f2: 500, q: 0.8 });
    a.tone(out, t, { type: 'sine', f: 140, f2: 40, dur: 0.22, vol: 0.5 });
    for (let i = 0; i < 4; i++) a.bell(out, t + 0.03 + i * R(0.04, 0.09), R(900, 2600), { dur: 0.25, vol: 0.05, ratio: 2.76, index: 3 });
  }, { minGap: 0.04, maxVoices: 4 });
  reg('deathBig', (a, t, out) => {
    a.noise(out, t, { dur: 0.6, vol: 0.7, type: 'lowpass', f: 4000, f2: 200 });
    a.tone(out, t, { type: 'sine', f: 100, f2: 25, dur: 0.8, vol: 0.8 });
    for (let i = 0; i < 9; i++) a.bell(out, t + 0.05 + i * R(0.04, 0.1), R(500, 2600), { dur: 0.4, vol: 0.06, ratio: 2.76, index: 3 });
  });
  reg('bulletWall', (a, t, out) => { a.noise(out, t, { dur: 0.03, vol: 0.2, type: 'highpass', f: 2500 }); }, { minGap: 0.04 });

  // ── enemies ──
  reg('spawn', (a, t, out) => {
    for (let i = 0; i < 6; i++) a.noise(out, t + i * 0.045, { dur: 0.01, vol: 0.18, type: 'highpass', f: 2500 + i * 300 });
    a.tone(out, t, { type: 'triangle', f: 220, f2: 330, dur: 0.3, vol: 0.06 });
  }, { minGap: 0.06, maxVoices: 3 });
  reg('cogWind', (a, t, out) => {
    for (let i = 0; i < 10; i++) a.noise(out, t + i * (0.05 - i * 0.003), { dur: 0.01, vol: 0.2, type: 'bandpass', f: 1800 + i * 150, q: 3 });
  });
  reg('cogCharge', (a, t, out) => {
    a.tone(out, t, { type: 'sawtooth', f: 160, f2: 420, dur: 0.4, vol: 0.08 });
    a.noise(out, t, { dur: 0.4, vol: 0.15, type: 'bandpass', f: 900, f2: 1800, q: 4 });
  });
  reg('sentryWind', (a, t, out) => { a.noise(out, t, { dur: 0.35, vol: 0.15, type: 'bandpass', f: 3000, f2: 5000, q: 6, a: 0.2 }); });
  reg('sentryThrust', (a, t, out) => {
    a.noise(out, t, { dur: 0.1, vol: 0.35, type: 'bandpass', f: 4000, f2: 900, q: 1.5 });
    a.tone(out, t, { type: 'square', f: 300, f2: 120, dur: 0.06, vol: 0.06 });
  });
  reg('spitCharge', (a, t, out) => { a.tone(out, t, { type: 'sine', f: 400, f2: 1400, dur: 0.48, vol: 0.06, a: 0.3, release: 0.1 }); });
  reg('spit', (a, t, out) => {
    a.tone(out, t, { type: 'square', f: 900 * R(0.95, 1.05), f2: 260, dur: 0.07, vol: 0.09 });
    a.noise(out, t, { dur: 0.04, vol: 0.2, type: 'bandpass', f: 2000 });
  }, { minGap: 0.04 });
  reg('miteHop', (a, t, out) => { a.tone(out, t, { type: 'square', f: 1600, f2: 2400, dur: 0.04, vol: 0.04 }); }, { minGap: 0.05 });
  reg('bruteWind', (a, t, out) => {
    a.tone(out, t, { type: 'sawtooth', f: 70, f2: 50, dur: 0.7, vol: 0.12, a: 0.2 });
    a.noise(out, t, { dur: 0.6, vol: 0.12, type: 'bandpass', f: 300, f2: 900, q: 3, a: 0.4 });
  });
  reg('slam', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 80, f2: 25, dur: 0.6, vol: 1 });
    a.noise(out, t, { dur: 0.5, vol: 0.7, type: 'lowpass', f: 2500, f2: 120 });
    a.bell(out, t, 311, { dur: 0.9, vol: 0.1, ratio: 2.76, index: 5 });
  });
  reg('steamWind', (a, t, out) => { a.noise(out, t, { dur: 0.55, vol: 0.12, type: 'highpass', f: 2000, f2: 5000, a: 0.4 }); });
  reg('steam', (a, t, out) => { a.noise(out, t, { dur: 1.3, vol: 0.3, type: 'highpass', f: 3500, f2: 2500, a: 0.05 }); });

  // ── world ──
  reg('splash', (a, t, out) => {
    a.noise(out, t, { dur: 0.35, vol: 0.4, type: 'bandpass', f: 1200, f2: 400, q: 0.8 });
    a.tone(out, t, { type: 'sine', f: 500, f2: 120, dur: 0.15, vol: 0.12 });
  });
  reg('sandSink', (a, t, out) => {
    a.noise(out, t, { dur: 0.5, vol: 0.4, type: 'lowpass', f: 1800, f2: 300, a: 0.05 });
    a.tone(out, t, { type: 'sine', f: 220, f2: 70, dur: 0.4, vol: 0.12 });
  });
  reg('fall', (a, t, out) => { a.tone(out, t, { type: 'sine', f: 700, f2: 120, dur: 0.5, vol: 0.12 }); });
  reg('woodHit', (a, t, out) => {
    a.noise(out, t, { dur: 0.06, vol: 0.4, type: 'bandpass', f: 900, q: 2 });
    a.tone(out, t, { type: 'triangle', f: 220, f2: 140, dur: 0.06, vol: 0.2 });
  }, { minGap: 0.03 });
  reg('woodBreak', (a, t, out) => {
    for (let i = 0; i < 5; i++) a.noise(out, t + i * 0.025, { dur: 0.05, vol: 0.35, type: 'bandpass', f: R(500, 1400), q: 2 });
    a.tone(out, t, { type: 'sine', f: 150, f2: 60, dur: 0.15, vol: 0.3 });
  });
  reg('doorOpen', (a, t, out) => {
    for (let i = 0; i < 10; i++) a.noise(out, t + i * 0.04, { dur: 0.012, vol: 0.2, type: 'bandpass', f: 1400, q: 4 });
    a.tone(out, t, { type: 'triangle', f: 110, f2: 160, dur: 0.5, vol: 0.12 });
  }, { minGap: 0.1 });
  reg('doorEnter', (a, t, out) => { a.noise(out, t, { dur: 0.4, vol: 0.25, type: 'bandpass', f: 600, f2: 3000, q: 1, a: 0.15 }); });
  reg('roomClear', (a, t, out) => {
    const notes = [1174.7, 1396.9, 1760, 2349.3];
    notes.forEach((f, i) => a.bell(out, t + i * 0.09, f, { dur: 1.6, vol: 0.1, ratio: 3.5, index: 1.4 }));
  });
  reg('waveStart', (a, t, out) => {
    a.bell(out, t, 146.8, { dur: 3, vol: 0.25, ratio: 1.41, index: 2.5, bright: 0.2 });
    a.bell(out, t, 293.7, { dur: 2.5, vol: 0.08, ratio: 2.76, index: 2 });
  });
  reg('wave', (a, t, out) => { a.bell(out, t, 174.6, { dur: 2.2, vol: 0.18, ratio: 1.41, index: 2.5, bright: 0.2 }); });
  reg('coin', (a, t, out, o) => {
    const p = (o.pitch as number) ?? 1;
    a.bell(out, t, 1318.5 * p, { dur: 0.25, vol: 0.06, ratio: 2, index: 0.8 });
    a.bell(out, t + 0.05, 1975.5 * p, { dur: 0.35, vol: 0.06, ratio: 2, index: 0.8 });
  }, { minGap: 0.035, maxVoices: 4 });
  reg('sand', (a, t, out) => { a.bell(out, t, R(2800, 3400), { dur: 0.3, vol: 0.04, ratio: 2.01, index: 0.6 }); }, { minGap: 0.04 });
  reg('heal', (a, t, out) => { [784, 988, 1175, 1568].forEach((f, i) => a.bell(out, t + i * 0.06, f, { dur: 0.8, vol: 0.07, ratio: 2, index: 1 })); });
  reg('shard', (a, t, out) => { [1046, 1318, 1568, 2093].forEach((f, i) => a.bell(out, t + i * 0.04, f, { dur: 1.2, vol: 0.07, ratio: 3.5, index: 1.5 })); });
  reg('charge', (a, t, out) => {
    a.bell(out, t, 1760, { dur: 0.9, vol: 0.1, ratio: 3.5, index: 1.2 });
    a.bell(out, t + 0.06, 2637, { dur: 0.9, vol: 0.07, ratio: 3.5, index: 1.2 });
  });
  reg('corrode', (a, t, out) => {
    a.noise(out, t, { dur: 0.4, vol: 0.35, type: 'bandpass', f: 1200, f2: 300, q: 3 });
    a.tone(out, t, { type: 'sawtooth', f: 200, f2: 60, dur: 0.3, vol: 0.08 });
  });
  reg('stasis', (a, t, out) => { a.bell(out, t, 3520, { dur: 0.8, vol: 0.06, ratio: 1.5, index: 3 }); a.tone(out, t, { type: 'sine', f: 1200, f2: 300, dur: 0.3, vol: 0.05 }); }, { minGap: 0.05 });
  reg('stasisBreak', (a, t, out) => {
    a.noise(out, t, { dur: 0.25, vol: 0.45, type: 'highpass', f: 3000, f2: 800 });
    a.bell(out, t, 1864, { dur: 0.8, vol: 0.12, ratio: 1.5, index: 4 });
    a.tone(out, t, { type: 'sine', f: 150, f2: 50, dur: 0.2, vol: 0.4 });
  });

  // ── UI ──
  reg('uiMove', (a, t, out) => { a.noise(out, t, { dur: 0.012, vol: 0.2, type: 'highpass', f: 4000 }); a.tone(out, t, { type: 'square', f: 2400, dur: 0.01, vol: 0.02 }); }, { minGap: 0.03 });
  reg('uiSelect', (a, t, out) => { a.bell(out, t, 1568, { dur: 0.5, vol: 0.1, ratio: 3.5, index: 1.2 }); a.bell(out, t + 0.05, 2349, { dur: 0.5, vol: 0.07, ratio: 3.5, index: 1 }); });
  reg('uiBack', (a, t, out) => { a.bell(out, t, 880, { dur: 0.3, vol: 0.08, ratio: 3.5, index: 1 }); });
  reg('uiOpen', (a, t, out) => {
    for (let i = 0; i < 4; i++) a.noise(out, t + i * 0.03, { dur: 0.01, vol: 0.15, type: 'highpass', f: 3000 });
    a.bell(out, t + 0.1, 1174.7, { dur: 0.6, vol: 0.07, ratio: 3.5, index: 1 });
  });
  reg('pickupBig', (a, t, out) => { [523, 659, 784, 1046, 1318].forEach((f, i) => a.bell(out, t + i * 0.07, f, { dur: 1.2, vol: 0.08, ratio: 3.5, index: 1.4 })); });

  // ── meta notices (registry toasts, Ines's notes) ──
  // achievement / unlock: two bright brass notes, a fifth apart
  reg('notice', (a, t, out) => {
    a.bell(out, t, 1318.5, { dur: 0.9, vol: 0.07, ratio: 2.0, index: 1.1 });
    a.bell(out, t + 0.11, 1975.5, { dur: 1.3, vol: 0.07, ratio: 2.0, index: 1.1 });
  }, { minGap: 0.2 });
  // secret: a falling glassy arpeggio
  reg('secretFound', (a, t, out) => {
    [2637, 2093, 1568, 1318.5].forEach((f, i) => a.bell(out, t + i * 0.06, f, { dur: 1.1, vol: 0.05, ratio: 3.01, index: 1.6 }));
    a.tone(out, t, { type: 'sine', f: 330, dur: 0.8, vol: 0.05 });
  }, { minGap: 0.3 });
  // chime: one deep tower bell with a long tail (hum + strike + tierce)
  reg('chimeRing', (a, t, out) => {
    a.bell(out, t, 196, { dur: 4.5, vol: 0.16, ratio: 2.0, index: 2.2 });
    a.bell(out, t, 392, { dur: 3.2, vol: 0.08, ratio: 1.19, index: 1.4 });
    a.bell(out, t + 0.01, 588, { dur: 2.4, vol: 0.05, ratio: 2.76, index: 1.0 });
    a.noise(out, t, { dur: 0.05, vol: 0.12, type: 'bandpass', f: 2400, q: 2 });
  }, { minGap: 0.5, maxVoices: 2 });
  // Ines's note slides in: paper rustle + soft tick
  reg('notePaper', (a, t, out) => {
    a.noise(out, t, { dur: 0.16, vol: 0.12, type: 'bandpass', f: 3200, f2: 1800, q: 0.8, a: 0.03 });
    a.bell(out, t + 0.05, 1760, { dur: 0.4, vol: 0.035, ratio: 3.5, index: 0.8 });
  }, { minGap: 0.3 });
}
