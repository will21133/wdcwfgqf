// SFX for the archive floor — paper, ink, sand and glass. Called from boot.
import type { AudioEngine, SfxFn } from '../engine/audio/audio';

const R = (a: number, b: number) => a + Math.random() * (b - a);

export function registerArchiveSfx(a: AudioEngine) {
  const reg = (n: string, fn: SfxFn, o?: { minGap?: number; maxVoices?: number; vol?: number }) => a.register(n, fn, o);

  // ── paper ──
  /** a page folds into a dart: two crisp creases */
  reg('pageAim', (a, t, out) => {
    a.noise(out, t, { dur: 0.03, vol: 0.28, type: 'bandpass', f: 4200, q: 2.5 });
    a.noise(out, t + 0.07, { dur: 0.04, vol: 0.32, type: 'bandpass', f: 3300, q: 2.5 });
    a.tone(out, t + 0.07, { type: 'triangle', f: 1900 * R(0.95, 1.05), f2: 2400, dur: 0.05, vol: 0.04 });
  }, { minGap: 0.08 });
  reg('pageDive', (a, t, out) => {
    a.noise(out, t, { dur: 0.22, vol: 0.3, type: 'bandpass', f: 6500, f2: 1800, q: 1.4, a: 0.02 });
  }, { minGap: 0.06 });
  reg('paperHit', (a, t, out) => {
    a.noise(out, t, { dur: 0.06, vol: 0.3, type: 'highpass', f: 2500 });
    a.tone(out, t, { type: 'sine', f: 300, f2: 120, dur: 0.05, vol: 0.12 });
  }, { minGap: 0.05 });
  /** breakable record boxes / tome stacks burst into loose leaves */
  reg('paperBurst', (a, t, out) => {
    for (let i = 0; i < 7; i++) a.noise(out, t + i * R(0.02, 0.05), { dur: R(0.03, 0.07), vol: 0.22 - i * 0.02, type: 'bandpass', f: R(2500, 6000), q: 1.8 });
  }, { minGap: 0.1 });

  // ── ink ──
  reg('houndGrowl', (a, t, out) => {
    // throaty rattle: pulsed low saw under a wet noise bed
    for (let i = 0; i < 7; i++) a.tone(out, t + i * 0.075, { type: 'sawtooth', f: R(68, 82), f2: 55, dur: 0.07, vol: 0.12 });
    a.noise(out, t, { dur: 0.55, vol: 0.12, type: 'lowpass', f: 500, f2: 900, a: 0.2 });
  }, { minGap: 0.2 });
  reg('houndDash', (a, t, out) => {
    a.noise(out, t, { dur: 0.3, vol: 0.35, type: 'bandpass', f: 900, f2: 2600, q: 1.2, a: 0.02 });
    a.tone(out, t, { type: 'sine', f: 140, f2: 60, dur: 0.18, vol: 0.3 });
  });
  reg('inkSplat', (a, t, out) => {
    a.noise(out, t, { dur: 0.12, vol: 0.4, type: 'lowpass', f: 1400, f2: 300 });
    a.tone(out, t, { type: 'sine', f: 220, f2: 70, dur: 0.12, vol: 0.25 });
    a.tone(out, t + 0.05, { type: 'sine', f: 520 * R(0.9, 1.1), f2: 180, dur: 0.06, vol: 0.06 });
  }, { minGap: 0.06 });
  reg('inkStep', (a, t, out) => {
    a.noise(out, t, { dur: 0.08, vol: 0.25, type: 'lowpass', f: 900, f2: 300 });
    a.tone(out, t, { type: 'sine', f: 330, f2: 140, dur: 0.07, vol: 0.08 });
  }, { minGap: 0.3 });

  // ── sand ──
  reg('wraithCast', (a, t, out) => {
    a.noise(out, t, { dur: 0.75, vol: 0.2, type: 'bandpass', f: 1200, f2: 6000, q: 3, a: 0.5 });
    for (let i = 0; i < 4; i++) a.bell(out, t + 0.15 + i * 0.13, 1318.5 * Math.pow(1.122, i), { dur: 0.35, vol: 0.035, ratio: 3.5, index: 1.2 });
  }, { minGap: 0.15 });
  reg('wraithFire', (a, t, out) => {
    a.noise(out, t, { dur: 0.18, vol: 0.45, type: 'highpass', f: 1800, f2: 5000 });
    a.tone(out, t, { type: 'sine', f: 180, f2: 70, dur: 0.12, vol: 0.3 });
  });
  reg('wraithVanish', (a, t, out) => {
    a.noise(out, t, { dur: 0.45, vol: 0.32, type: 'bandpass', f: 5000, f2: 700, q: 1.2 });
    a.bell(out, t, 880, { dur: 0.5, vol: 0.05, ratio: 2.4, index: 1 });
  });
  reg('wraithAppear', (a, t, out) => {
    a.noise(out, t, { dur: 0.45, vol: 0.25, type: 'bandpass', f: 600, f2: 5200, q: 1.5, a: 0.4 });
    a.bell(out, t + 0.4, 1174.7, { dur: 0.6, vol: 0.06, ratio: 2.4, index: 1.2 });
  });

  // ── tome ──
  reg('mimicReveal', (a, t, out) => {
    // leather creak + a riffle of pages
    a.tone(out, t, { type: 'sawtooth', f: 95, f2: 160, dur: 0.3, vol: 0.08, curve: 'lin' });
    a.tone(out, t + 0.12, { type: 'sawtooth', f: 150, f2: 85, dur: 0.25, vol: 0.06, curve: 'lin' });
    for (let i = 0; i < 9; i++) a.noise(out, t + 0.15 + i * 0.03, { dur: 0.02, vol: 0.18, type: 'bandpass', f: R(3000, 6000), q: 2 });
  }, { minGap: 0.2 });
  reg('mimicGrowl', (a, t, out) => {
    for (let i = 0; i < 5; i++) a.noise(out, t + i * 0.06, { dur: 0.03, vol: 0.18, type: 'bandpass', f: R(2500, 4500), q: 2 });
    a.tone(out, t, { type: 'square', f: 110, f2: 90, dur: 0.35, vol: 0.05, a: 0.1 });
  }, { minGap: 0.2 });
  reg('mimicBite', (a, t, out) => {
    a.noise(out, t, { dur: 0.05, vol: 0.5, type: 'bandpass', f: 2200, q: 1.5 });
    a.tone(out, t, { type: 'square', f: 260, f2: 90, dur: 0.06, vol: 0.12 });
    a.tone(out, t, { type: 'sine', f: 120, f2: 50, dur: 0.12, vol: 0.4 });
  });
  reg('mimicRustle', (a, t, out) => {
    for (let i = 0; i < 12; i++) a.noise(out, t + i * 0.045, { dur: 0.03, vol: 0.14 + i * 0.008, type: 'bandpass', f: R(2800, 6500), q: 2 });
  }, { minGap: 0.2 });
  reg('mimicSpit', (a, t, out) => {
    a.noise(out, t, { dur: 0.16, vol: 0.4, type: 'highpass', f: 2200, f2: 6000 });
    for (let i = 0; i < 5; i++) a.noise(out, t + 0.02 + i * 0.025, { dur: 0.025, vol: 0.18, type: 'bandpass', f: R(3500, 7000), q: 2 });
  });
  reg('mimicHop', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 150, f2: 60, dur: 0.1, vol: 0.35 });
    a.noise(out, t, { dur: 0.06, vol: 0.15, type: 'bandpass', f: 1200 });
  }, { minGap: 0.08 });

  // ── hourglass golem: stone, brass, glass — and the violet chime of fixed damage ──
  reg('golemStep', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 62, f2: 34, dur: 0.22, vol: 0.5 });
    a.noise(out, t, { dur: 0.12, vol: 0.18, type: 'lowpass', f: 600, f2: 150 });
  }, { minGap: 0.2 });
  reg('golemWind', (a, t, out) => {
    a.noise(out, t, { dur: 0.8, vol: 0.18, type: 'bandpass', f: 400, f2: 1600, q: 2, a: 0.5 });
    a.tone(out, t, { type: 'sawtooth', f: 55, f2: 75, dur: 0.85, vol: 0.1, a: 0.3, curve: 'lin' });
    // the last grains: a tightening tick
    for (let i = 0; i < 6; i++) a.bell(out, t + 0.2 + i * (0.11 - i * 0.012), 2093, { dur: 0.08, vol: 0.03, ratio: 3.5, index: 1 });
  });
  reg('golemStomp', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 70, f2: 40, dur: 0.3, vol: 0.4 });
    a.noise(out, t, { dur: 0.7, vol: 0.14, type: 'bandpass', f: 700, f2: 2400, q: 2, a: 0.45 });
    for (let i = 0; i < 6; i++) a.bell(out, t + 0.2 + i * (0.1 - i * 0.01), 2093, { dur: 0.08, vol: 0.03, ratio: 3.5, index: 1 });
  });
  reg('golemSlam', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 75, f2: 24, dur: 0.7, vol: 1 });
    a.noise(out, t, { dur: 0.55, vol: 0.6, type: 'lowpass', f: 2200, f2: 120 });
    // inharmonic glass chord = "this can't be rewound"
    for (const [f, d] of [[659.3, 0], [932.3, 0.02], [1396.9, 0.04], [1975.5, 0.06]]) a.bell(out, t + d, f, { dur: 1.4, vol: 0.07, ratio: 1.41, index: 2.5 });
  });
  reg('golemWave', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 85, f2: 40, dur: 0.4, vol: 0.6 });
    a.noise(out, t, { dur: 1.1, vol: 0.3, type: 'lowpass', f: 900, f2: 300, a: 0.05 });
    for (const [f, d] of [[932.3, 0], [1396.9, 0.05]]) a.bell(out, t + d, f, { dur: 1.0, vol: 0.06, ratio: 1.41, index: 2 });
  });
  reg('golemFlip', (a, t, out) => {
    a.bell(out, t, 2349, { dur: 0.4, vol: 0.06, ratio: 2.76, index: 1 });
    a.bell(out, t + 0.5, 2637, { dur: 0.5, vol: 0.06, ratio: 2.76, index: 1 });
    a.noise(out, t + 0.05, { dur: 0.5, vol: 0.14, type: 'bandpass', f: 3000, f2: 1200, q: 1.5, a: 0.1 });
    a.tone(out, t + 0.5, { type: 'sine', f: 110, f2: 70, dur: 0.12, vol: 0.25 });
  });
}
