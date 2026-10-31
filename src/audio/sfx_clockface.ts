// SFX for the clockface floor (floor 4) — owned by that floor team. Called from boot.
// Palette of sounds: blued steel (high, ringing), the Great Clock's bells (low FM tolls),
// glassy starlight (bright bells, shimmer noise) and the phantom (reversed / detuned).
import type { AudioEngine, SfxFn } from '../engine/audio/audio';

const R = (a: number, b: number) => a + Math.random() * (b - a);

export function registerClockfaceSfx(a: AudioEngine) {
  const reg = (n: string, fn: SfxFn, o?: { minGap?: number; maxVoices?: number; vol?: number }) => a.register(n, fn, o);

  // ── 分针骑士 Minute Knight ──
  reg('cfKnightWind', (a, t, out) => {
    // blade drawn back: a rising steel scrape and two tight ticks
    a.noise(out, t, { dur: 0.32, vol: 0.16, type: 'bandpass', f: 2600, f2: 6200, q: 5, a: 0.12 });
    a.tone(out, t, { type: 'triangle', f: 880, f2: 1320, dur: 0.3, vol: 0.035, a: 0.15 });
    a.noise(out, t + 0.02, { dur: 0.01, vol: 0.22, type: 'highpass', f: 4200 });
    a.noise(out, t + 0.14, { dur: 0.01, vol: 0.2, type: 'highpass', f: 4600 });
  }, { minGap: 0.08 });
  reg('cfKnightSwing', (a, t, out) => {
    a.noise(out, t, { dur: 0.16, vol: 0.42, type: 'bandpass', f: 4200, f2: 900, q: 1.3, a: 0.01 });
    a.bell(out, t + 0.01, 1480 * R(0.97, 1.03), { dur: 0.35, vol: 0.05, ratio: 2.76, index: 1.2 });
    a.tone(out, t, { type: 'sine', f: 260, f2: 110, dur: 0.1, vol: 0.12 });
  }, { minGap: 0.04 });
  reg('cfKnightGuard', (a, t, out) => {
    // parried on the flat of the minute hand
    a.bell(out, t, 1975 * R(0.97, 1.03), { dur: 0.5, vol: 0.14, ratio: 3.01, index: 3 });
    a.noise(out, t, { dur: 0.05, vol: 0.35, type: 'highpass', f: 3500 });
    a.tone(out, t, { type: 'square', f: 420, f2: 300, dur: 0.04, vol: 0.05 });
  }, { minGap: 0.05 });

  // ── 时针枪兵 Hour Lancer ──
  reg('cfLancerPlant', (a, t, out) => {
    // heavy boots set, ratchet winding up the charge
    a.tone(out, t, { type: 'sine', f: 90, f2: 45, dur: 0.25, vol: 0.55 });
    a.noise(out, t, { dur: 0.12, vol: 0.3, type: 'lowpass', f: 1200, f2: 300 });
    for (let i = 0; i < 8; i++) a.noise(out, t + 0.1 + i * (0.075 - i * 0.004), { dur: 0.012, vol: 0.18, type: 'bandpass', f: 1600 + i * 180, q: 4 });
    a.tone(out, t + 0.08, { type: 'sawtooth', f: 70, f2: 140, dur: 0.6, vol: 0.06, a: 0.3 });
  });
  reg('cfLancerCharge', (a, t, out) => {
    a.noise(out, t, { dur: 0.7, vol: 0.32, type: 'bandpass', f: 500, f2: 2400, q: 0.9, a: 0.04 });
    a.tone(out, t, { type: 'sawtooth', f: 110, f2: 70, dur: 0.6, vol: 0.08 });
    for (let i = 0; i < 6; i++) a.tone(out, t + i * 0.1, { type: 'sine', f: 80, f2: 50, dur: 0.06, vol: 0.25 });
  });
  reg('cfLancerWall', (a, t, out) => {
    // the hour strikes stone: a deep cracked bell
    a.bell(out, t, 196, { dur: 1.6, vol: 0.22, ratio: 1.41, index: 4, bright: 0.25 });
    a.bell(out, t, 523, { dur: 0.7, vol: 0.1, ratio: 2.76, index: 5 });
    a.tone(out, t, { type: 'sine', f: 70, f2: 30, dur: 0.5, vol: 0.8 });
    a.noise(out, t, { dur: 0.35, vol: 0.5, type: 'lowpass', f: 3000, f2: 200 });
  });
  reg('cfLancerShove', (a, t, out) => {
    a.noise(out, t, { dur: 0.14, vol: 0.4, type: 'bandpass', f: 1400, f2: 500, q: 1 });
    a.tone(out, t, { type: 'sine', f: 140, f2: 60, dur: 0.12, vol: 0.4 });
  });

  // ── 星屑 Star Shard ──
  reg('cfShardGlow', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 1200 * R(0.95, 1.05), f2: 3200, dur: 0.55, vol: 0.04, a: 0.35, release: 0.1 });
    a.noise(out, t, { dur: 0.5, vol: 0.06, type: 'highpass', f: 6000, f2: 9000, a: 0.3 });
  }, { minGap: 0.06, maxVoices: 3 });
  reg('cfShardShot', (a, t, out) => {
    a.bell(out, t, 2349 * R(0.96, 1.04), { dur: 0.3, vol: 0.08, ratio: 3.5, index: 1.4 });
    a.tone(out, t, { type: 'square', f: 1800, f2: 600, dur: 0.05, vol: 0.05 });
  }, { minGap: 0.04 });
  reg('cfShardCrack', (a, t, out) => {
    // dying shard: brittle crack, rising whine before the burst
    a.noise(out, t, { dur: 0.04, vol: 0.3, type: 'highpass', f: 5000 });
    a.tone(out, t, { type: 'sine', f: 1500, f2: 4200, dur: 0.45, vol: 0.05, a: 0.3 });
  }, { minGap: 0.05, maxVoices: 3 });
  reg('cfShardBurst', (a, t, out) => {
    for (let i = 0; i < 5; i++) a.bell(out, t + i * 0.018, R(2600, 4200), { dur: 0.35, vol: 0.05, ratio: 2.01, index: 2 });
    a.noise(out, t, { dur: 0.18, vol: 0.4, type: 'highpass', f: 3500, f2: 1500 });
    a.tone(out, t, { type: 'sine', f: 200, f2: 60, dur: 0.15, vol: 0.3 });
  }, { minGap: 0.04, maxVoices: 4 });

  // ── 残响幻影 Echo Phantom ──
  reg('cfPhantomSpawn', (a, t, out) => {
    // your own rewind, played wrong: a reversed swell with detuned bells
    const ctx = a.ctx!;
    const src = ctx.createBufferSource(); src.buffer = a.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.55); g.gain.linearRampToValueAtTime(0, t + 0.62);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 0.7);
    a.bell(out, t + 0.55, 932, { dur: 1.2, vol: 0.07, ratio: 1.41, index: 2.5 });
    a.bell(out, t + 0.56, 987, { dur: 1.2, vol: 0.06, ratio: 1.41, index: 2.5 });
  }, { minGap: 0.2 });
  reg('cfPhantomTele', (a, t, out) => {
    a.noise(out, t, { dur: 0.4, vol: 0.08, type: 'bandpass', f: 900, f2: 2600, q: 6, a: 0.3 });
    a.tone(out, t, { type: 'triangle', f: 466 * R(0.98, 1.02), f2: 494, dur: 0.4, vol: 0.03, a: 0.3 });
  }, { minGap: 0.1, maxVoices: 3 });
  reg('cfPhantomSlash', (a, t, out) => {
    // like your rapier, but backwards and out of tune
    a.noise(out, t, { dur: 0.12, vol: 0.32, type: 'bandpass', f: 1400, f2: 5200, q: 1.6, a: 0.06 });
    a.bell(out, t + 0.05, 1975 * 0.94, { dur: 0.45, vol: 0.06, ratio: 1.41, index: 2 });
    a.bell(out, t + 0.05, 1975 * 1.06, { dur: 0.45, vol: 0.05, ratio: 1.41, index: 2 });
  }, { minGap: 0.04 });

  // ── 钟摆刽子手 Pendulum Executioner ──
  reg('cfPendWind', (a, t, out) => {
    // chain paid out link by link, the case creaks
    for (let i = 0; i < 9; i++) a.noise(out, t + i * 0.06 + R(0, 0.015), { dur: 0.02, vol: 0.2, type: 'bandpass', f: R(2200, 3400), q: 6 });
    a.tone(out, t, { type: 'sawtooth', f: 55, f2: 75, dur: 0.6, vol: 0.07, a: 0.2 });
    a.noise(out, t, { dur: 0.6, vol: 0.06, type: 'bandpass', f: 300, f2: 700, q: 8, a: 0.3 });
  });
  reg('cfPendSwing', (a, t, out) => {
    a.noise(out, t, { dur: 0.42, vol: 0.5, type: 'bandpass', f: 400, f2: 2200, q: 0.9, a: 0.12 });
    a.tone(out, t, { type: 'sine', f: 120, f2: 70, dur: 0.4, vol: 0.18, a: 0.1 });
    a.noise(out, t + 0.2, { dur: 0.02, vol: 0.28, type: 'highpass', f: 3000 }); // the tick at the bottom of the arc
  }, { minGap: 0.1 });
  reg('cfPendLift', (a, t, out) => {
    a.tone(out, t, { type: 'sawtooth', f: 60, f2: 120, dur: 0.7, vol: 0.09, a: 0.4 });
    a.noise(out, t, { dur: 0.7, vol: 0.14, type: 'bandpass', f: 300, f2: 1500, q: 2, a: 0.5 });
    a.bell(out, t + 0.1, 146.8, { dur: 1.2, vol: 0.08, ratio: 1.41, index: 1.5 });
  });
  reg('cfPendSlam', (a, t, out) => {
    // the twelfth stroke that never comes
    a.tone(out, t, { type: 'sine', f: 75, f2: 22, dur: 0.8, vol: 1 });
    a.noise(out, t, { dur: 0.6, vol: 0.7, type: 'lowpass', f: 3000, f2: 100 });
    a.bell(out, t, 98, { dur: 2.6, vol: 0.28, ratio: 1.41, index: 3, bright: 0.2 });
    a.bell(out, t, 293.7, { dur: 1.4, vol: 0.08, ratio: 2.76, index: 4 });
  });
  reg('cfPendWave', (a, t, out) => {
    a.noise(out, t, { dur: 0.55, vol: 0.22, type: 'lowpass', f: 900, f2: 200, a: 0.02 });
  }, { minGap: 0.2 });
}
