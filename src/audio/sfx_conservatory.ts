// SFX for the conservatory floor — owned by that floor team. Called from boot.
// Palette of sounds: wet leaves, creaking stems, clay, glass, copper and fine steel.
import type { AudioEngine, SfxFn } from '../engine/audio/audio';

const R = (a: number, b: number) => a + Math.random() * (b - a);

export function registerConservatorySfx(a: AudioEngine) {
  const reg = (n: string, fn: SfxFn, o?: { minGap?: number; maxVoices?: number; vol?: number }) => a.register(n, fn, o);

  // ── decor ──
  reg('potHit', (a, t, out) => {
    a.noise(out, t, { dur: 0.05, vol: 0.35, type: 'bandpass', f: 750, q: 2.5 });
    a.tone(out, t, { type: 'triangle', f: 320 * R(0.92, 1.08), f2: 210, dur: 0.07, vol: 0.18 });
  }, { minGap: 0.03 });
  reg('potBreak', (a, t, out) => {
    for (let i = 0; i < 6; i++) a.noise(out, t + i * R(0.015, 0.035), { dur: 0.05, vol: 0.32, type: 'bandpass', f: R(1200, 3200), q: 3 });
    a.tone(out, t, { type: 'sine', f: 170, f2: 70, dur: 0.16, vol: 0.32 });
    a.noise(out, t + 0.05, { dur: 0.25, vol: 0.12, type: 'lowpass', f: 900, f2: 300 });
  });
  reg('frameBreak', (a, t, out) => {
    for (let i = 0; i < 5; i++) a.bell(out, t + i * R(0.01, 0.04), R(2600, 5200), { dur: 0.25, vol: 0.05, ratio: 2.76, index: 3 });
    a.noise(out, t, { dur: 0.12, vol: 0.3, type: 'highpass', f: 4000, f2: 2000 });
    for (let i = 0; i < 3; i++) a.noise(out, t + 0.02 + i * 0.03, { dur: 0.05, vol: 0.3, type: 'bandpass', f: R(500, 1100), q: 2 });
  });
  reg('butterfly', (a, t, out) => {
    for (let i = 0; i < 7; i++) a.noise(out, t + i * 0.028, { dur: 0.012, vol: 0.12 - i * 0.012, type: 'highpass', f: 3500 + i * 200 });
    a.bell(out, t, R(3800, 4600), { dur: 0.4, vol: 0.02, ratio: 2.01, index: 0.6 });
  }, { minGap: 0.15 });

  // ── 孢子囊 Spore Pod ──
  reg('podSwell', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 120, f2: 260, dur: 0.75, vol: 0.14, curve: 'lin', a: 0.25, release: 0.5 });
    a.noise(out, t, { dur: 0.7, vol: 0.12, type: 'bandpass', f: 350, f2: 1400, q: 5, a: 0.4 });
    for (let i = 0; i < 5; i++) a.noise(out, t + 0.1 + i * 0.12, { dur: 0.02, vol: 0.08, type: 'bandpass', f: 900 + i * 180, q: 6 });
  }, { minGap: 0.2, maxVoices: 3 });
  reg('podPuff', (a, t, out) => {
    a.noise(out, t, { dur: 0.32, vol: 0.45, type: 'lowpass', f: 2600, f2: 380, a: 0.01 });
    a.tone(out, t, { type: 'sine', f: 110, f2: 48, dur: 0.18, vol: 0.4 });
    a.noise(out, t + 0.03, { dur: 0.4, vol: 0.08, type: 'highpass', f: 5000, f2: 2500 });
  }, { minGap: 0.08, maxVoices: 3 });
  reg('podWobble', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 260, f2: 180, dur: 0.12, vol: 0.12 });
    a.tone(out, t + 0.07, { type: 'sine', f: 230, f2: 170, dur: 0.12, vol: 0.08 });
  }, { minGap: 0.1 });

  // ── 咬藤 Snapvine ──
  reg('vineRustle', (a, t, out) => {
    for (let i = 0; i < 4; i++) a.noise(out, t + i * R(0.025, 0.05), { dur: 0.03, vol: 0.12, type: 'bandpass', f: R(1800, 4200), q: 2 });
    a.noise(out, t, { dur: 0.15, vol: 0.06, type: 'lowpass', f: 500 });
  }, { minGap: 0.14, maxVoices: 3 });
  reg('vineErupt', (a, t, out) => {
    a.noise(out, t, { dur: 0.3, vol: 0.5, type: 'lowpass', f: 1800, f2: 260 });
    a.tone(out, t, { type: 'sine', f: 130, f2: 45, dur: 0.2, vol: 0.45 });
    a.noise(out, t, { dur: 0.03, vol: 0.25, type: 'highpass', f: 3000 });
  }, { minGap: 0.06 });
  reg('vineWind', (a, t, out) => {
    a.tone(out, t, { type: 'sawtooth', f: 85, f2: 150, dur: 0.5, vol: 0.05, curve: 'lin', a: 0.2 });
    a.noise(out, t, { dur: 0.48, vol: 0.12, type: 'bandpass', f: 600, f2: 1800, q: 6, a: 0.3 });
  }, { minGap: 0.1 });
  reg('vineSnap', (a, t, out) => {
    a.noise(out, t, { dur: 0.035, vol: 0.5, type: 'highpass', f: 2500 });
    a.tone(out, t, { type: 'square', f: 900, f2: 180, dur: 0.06, vol: 0.08 });
    a.tone(out, t, { type: 'triangle', f: 420, f2: 140, dur: 0.1, vol: 0.25 });
    a.noise(out, t + 0.01, { dur: 0.08, vol: 0.2, type: 'bandpass', f: 900, q: 2 });
  }, { minGap: 0.05 });
  reg('vineDig', (a, t, out) => {
    a.noise(out, t, { dur: 0.35, vol: 0.28, type: 'lowpass', f: 1000, f2: 200, a: 0.05 });
    a.tone(out, t, { type: 'sine', f: 90, f2: 50, dur: 0.25, vol: 0.2 });
  }, { minGap: 0.1 });

  // ── 铜蛾 Brass Moth ──
  reg('mothFlap', (a, t, out) => {
    for (let i = 0; i < 3; i++) a.noise(out, t + i * 0.03, { dur: 0.02, vol: 0.07, type: 'bandpass', f: R(1500, 2600), q: 1.5 });
  }, { minGap: 0.2, maxVoices: 2 });
  reg('mothDiveWind', (a, t, out) => {
    a.tone(out, t, { type: 'triangle', f: 700, f2: 1500, dur: 0.45, vol: 0.05, a: 0.2, release: 0.2 });
    for (let i = 0; i < 9; i++) a.noise(out, t + i * 0.045, { dur: 0.015, vol: 0.09, type: 'bandpass', f: 2200, q: 2 });
  }, { minGap: 0.1, maxVoices: 3 });
  reg('mothDive', (a, t, out) => {
    a.noise(out, t, { dur: 0.25, vol: 0.3, type: 'bandpass', f: 900, f2: 3200, q: 1.2, a: 0.03 });
  }, { minGap: 0.05 });
  reg('mothDust', (a, t, out) => {
    a.bell(out, t, R(2000, 2400), { dur: 0.35, vol: 0.06, ratio: 3.5, index: 1 });
    a.noise(out, t, { dur: 0.12, vol: 0.18, type: 'highpass', f: 3000, f2: 1500 });
  }, { minGap: 0.05 });

  // ── 修剪者 Pruner ──
  reg('prunerStep', (a, t, out) => {
    a.bell(out, t, R(1100, 1300), { dur: 0.08, vol: 0.03, ratio: 2.76, index: 2 });
    a.noise(out, t, { dur: 0.015, vol: 0.1, type: 'highpass', f: 3500 });
  }, { minGap: 0.16, maxVoices: 3 });
  reg('prunerWind', (a, t, out) => {
    a.noise(out, t, { dur: 0.45, vol: 0.14, type: 'bandpass', f: 3000, f2: 6500, q: 9, a: 0.3 });
    a.bell(out, t + 0.05, 1760, { dur: 0.5, vol: 0.05, ratio: 2.76, index: 1.2 });
  }, { minGap: 0.1 });
  reg('prunerSnip', (a, t, out) => {
    a.noise(out, t, { dur: 0.05, vol: 0.45, type: 'bandpass', f: 5200, q: 2 });
    a.noise(out, t + 0.06, { dur: 0.04, vol: 0.4, type: 'bandpass', f: 3600, q: 2 });
    a.bell(out, t + 0.06, R(2500, 2800), { dur: 0.25, vol: 0.08, ratio: 2.76, index: 2 });
    a.tone(out, t + 0.06, { type: 'square', f: 420, f2: 110, dur: 0.05, vol: 0.06 });
  }, { minGap: 0.05 });
  reg('prunerDash', (a, t, out) => {
    a.noise(out, t, { dur: 0.2, vol: 0.3, type: 'highpass', f: 1400, f2: 4200, a: 0.02 });
  }, { minGap: 0.05 });

  // ── 荆棘母 Thornmother ──
  reg('motherVolleyWind', (a, t, out) => {
    a.tone(out, t, { type: 'sawtooth', f: 55, f2: 82, dur: 0.8, vol: 0.09, a: 0.3, curve: 'lin' });
    a.noise(out, t, { dur: 0.75, vol: 0.14, type: 'bandpass', f: 300, f2: 1400, q: 3, a: 0.5 });
    a.bell(out, t, 146.8, { dur: 1.4, vol: 0.12, ratio: 1.41, index: 2, bright: 0.3 });
    a.bell(out, t + 0.12, 220, { dur: 1.2, vol: 0.06, ratio: 1.41, index: 1.5 });
  }, { minGap: 0.3 });
  reg('motherVolley', (a, t, out) => {
    a.noise(out, t, { dur: 0.2, vol: 0.4, type: 'bandpass', f: 2600, f2: 700, q: 1.5 });
    for (let i = 0; i < 5; i++) a.bell(out, t + i * 0.012, R(1500, 3400), { dur: 0.2, vol: 0.035, ratio: 2.76, index: 2.5 });
    a.tone(out, t, { type: 'sine', f: 160, f2: 60, dur: 0.15, vol: 0.3 });
  }, { minGap: 0.08 });
  reg('motherRootWind', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 62, f2: 38, dur: 0.9, vol: 0.5, a: 0.25 });
    a.noise(out, t, { dur: 0.85, vol: 0.25, type: 'lowpass', f: 380, f2: 180, a: 0.35 });
    for (let i = 0; i < 6; i++) a.noise(out, t + 0.1 + i * 0.09, { dur: 0.03, vol: 0.1, type: 'bandpass', f: R(500, 1100), q: 4 });
  }, { minGap: 0.3 });
  reg('rootErupt', (a, t, out) => {
    a.noise(out, t, { dur: 0.16, vol: 0.32, type: 'lowpass', f: 2600, f2: 320 });
    a.tone(out, t, { type: 'triangle', f: 210 * R(0.9, 1.1), f2: 80, dur: 0.09, vol: 0.18 });
    a.noise(out, t, { dur: 0.02, vol: 0.18, type: 'highpass', f: 3500 });
  }, { minGap: 0.035, maxVoices: 6 });
  reg('motherWail', (a, t, out) => {
    for (const [f, d] of [[293.7, 0], [349.2, 0.08], [440, 0.16], [554.4, 0.26]] as [number, number][]) a.bell(out, t + d, f, { dur: 2.4, vol: 0.08, ratio: 1.41, index: 1.6 });
    a.noise(out, t, { dur: 1.2, vol: 0.12, type: 'bandpass', f: 1200, f2: 300, q: 1.2, a: 0.1 });
  });

  // ── shared plant death: leafy burst with a soft bell ──
  reg('plantDeath', (a, t, out) => {
    a.noise(out, t, { dur: 0.25, vol: 0.32, type: 'bandpass', f: 1600, f2: 450, q: 1 });
    for (let i = 0; i < 4; i++) a.noise(out, t + 0.02 + i * R(0.02, 0.05), { dur: 0.03, vol: 0.12, type: 'bandpass', f: R(2000, 4000), q: 2 });
    a.bell(out, t, R(1000, 1200), { dur: 0.6, vol: 0.05, ratio: 2.01, index: 1 });
  }, { minGap: 0.04, maxVoices: 4 });
}
