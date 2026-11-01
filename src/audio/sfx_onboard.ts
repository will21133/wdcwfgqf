// F4 sounds (rewind teaching and onboarding; ONBOARD2 §11.2), shared by F4a and F4b.
// Registered at boot from src/game/boot.ts setupAudio(). Quiet, wooden and clockwork: they sit
// under the game's mix and never compete with a hit or a rewind.
//
//   lessonPass   success beat: a rising two-note "tick-tock" (Beat.success)
//   lessonRetry  a fail beat: one soft low tock (never a buzzer)
//   demoStart    the demo frame comes up: a winding click and a felt tap
//   filmWipe     "back to the start": film rattling through a gate, three quick clicks
//   clockJump    the prologue clock jumps a few seconds: escapement ticks running fast
//   glyphPress   a demo bubble's button goes down: a very light click
//   spotPing     a spotlight ring / model-strip cell lights up
//   windUp       the hand gets up in L1: a key winding
//   coachTick    the coach's card appears: a light wooden tap (−12 dB)
//   stampSlam    the success card's stamp word lands: a felt thump under a brass tick
//   demoTick     the demo badge counts a second: a tiny escapement tick
//   gearWhistle  a lesson gear starts to fall: a short falling whistle
//   gearCrash    it lands: a heavy clank and a ring
//   glassDing    a hit rings off the bell jar
//   glassBreak   a paradox shatters it
//   alarmBell    the jar's alarm: a small brass bell, twice
//   clockStrike  the prologue's last stroke (11:59:59): one deep bell
//   propPop      a lesson prop appears / goes away: a soft wooden pop
import type { AudioEngine, SfxFn } from '../engine/audio/audio';

export function registerOnboardSfx(a: AudioEngine): void {
  const reg = (n: string, fn: SfxFn, o?: { minGap?: number; maxVoices?: number; vol?: number }) => a.register(n, fn, o);

  reg('lessonPass', (a, t, out) => {
    a.bell(out, t, 784, { dur: 0.35, vol: 0.09, ratio: 2, index: 1.2 });
    a.bell(out, t + 0.11, 1175, { dur: 0.55, vol: 0.1, ratio: 2, index: 1.2 });
    a.noise(out, t, { dur: 0.012, vol: 0.12, type: 'highpass', f: 3000 });
  }, { minGap: 0.3 });
  reg('lessonRetry', (a, t, out) => {
    a.tone(out, t, { type: 'triangle', f: 330, f2: 260, dur: 0.16, vol: 0.07 });
    a.noise(out, t, { dur: 0.02, vol: 0.08, type: 'bandpass', f: 900, q: 2 });
  }, { minGap: 0.3 });
  reg('demoStart', (a, t, out) => {
    for (let i = 0; i < 4; i++) a.noise(out, t + i * 0.035, { dur: 0.01, vol: 0.12, type: 'bandpass', f: 2200 + i * 200, q: 3 });
    a.tone(out, t + 0.16, { type: 'sine', f: 520, f2: 500, dur: 0.12, vol: 0.05 });
  }, { minGap: 0.5 });
  reg('filmWipe', (a, t, out) => {
    a.noise(out, t, { dur: 0.32, vol: 0.12, type: 'bandpass', f: 1400, f2: 2600, q: 1.5, a: 0.03 });
    for (let i = 0; i < 3; i++) a.noise(out, t + 0.08 + i * 0.06, { dur: 0.008, vol: 0.18, type: 'highpass', f: 3500 });
  }, { minGap: 0.3 });
  reg('clockJump', (a, t, out) => {
    for (let i = 0; i < 6; i++) a.noise(out, t + i * 0.05, { dur: 0.008, vol: i % 2 ? 0.1 : 0.15, type: 'bandpass', f: i % 2 ? 2600 : 1900, q: 4 });
    a.bell(out, t + 0.32, 1046, { dur: 0.4, vol: 0.05, ratio: 3, index: 0.8 });
  }, { minGap: 0.4 });
  reg('glyphPress', (a, t, out) => {
    a.noise(out, t, { dur: 0.006, vol: 0.12, type: 'highpass', f: 4200 });
    a.tone(out, t, { type: 'sine', f: 1500, f2: 1200, dur: 0.03, vol: 0.025 });
  }, { minGap: 0.06 });
  reg('spotPing', (a, t, out) => {
    a.bell(out, t, 1568, { dur: 0.3, vol: 0.04, ratio: 2.5, index: 0.6 });
  }, { minGap: 0.12 });
  reg('windUp', (a, t, out) => {
    for (let i = 0; i < 8; i++) a.noise(out, t + i * (0.07 - i * 0.004), { dur: 0.01, vol: 0.14, type: 'bandpass', f: 1500 + i * 120, q: 3 });
    a.tone(out, t + 0.5, { type: 'triangle', f: 392, f2: 523, dur: 0.18, vol: 0.05 });
  }, { minGap: 0.8 });
  reg('coachTick', (a, t, out) => {
    a.noise(out, t, { dur: 0.018, vol: 0.06, type: 'bandpass', f: 1200, q: 2.5 });
    a.tone(out, t, { type: 'sine', f: 700, f2: 620, dur: 0.05, vol: 0.025 });
  }, { minGap: 0.25 });
  reg('stampSlam', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 140, f2: 70, dur: 0.12, vol: 0.12 });
    a.noise(out, t, { dur: 0.04, vol: 0.1, type: 'lowpass', f: 900 });
    a.bell(out, t + 0.01, 1318, { dur: 0.25, vol: 0.04, ratio: 2, index: 0.7 });
  }, { minGap: 0.2 });
  reg('demoTick', (a, t, out) => {
    a.noise(out, t, { dur: 0.006, vol: 0.07, type: 'bandpass', f: 3200, q: 5 });
  }, { minGap: 0.3 });
  reg('gearWhistle', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 1800, f2: 700, dur: 0.6, vol: 0.035 });
  }, { minGap: 0.2 });
  reg('gearCrash', (a, t, out) => {
    a.tone(out, t, { type: 'triangle', f: 180, f2: 90, dur: 0.18, vol: 0.12 });
    a.noise(out, t, { dur: 0.08, vol: 0.18, type: 'bandpass', f: 1600, q: 1.2 });
    a.bell(out, t + 0.02, 523, { dur: 0.5, vol: 0.06, ratio: 2.7, index: 2 });
  }, { minGap: 0.1 });
  reg('glassDing', (a, t, out) => {
    a.bell(out, t, 2093, { dur: 0.6, vol: 0.07, ratio: 3.5, index: 1.5 });
    a.noise(out, t, { dur: 0.01, vol: 0.06, type: 'highpass', f: 5000 });
  }, { minGap: 0.08 });
  reg('glassBreak', (a, t, out) => {
    for (let i = 0; i < 7; i++) a.bell(out, t + i * 0.025, 1800 + ((i * 739) % 1400), { dur: 0.25, vol: 0.04, ratio: 3.1, index: 2 });
    a.noise(out, t, { dur: 0.35, vol: 0.14, type: 'highpass', f: 2500, a: 0.005 });
  }, { minGap: 0.2 });
  reg('alarmBell', (a, t, out) => {
    for (let i = 0; i < 2; i++) a.bell(out, t + i * 0.16, 1568, { dur: 0.3, vol: 0.07, ratio: 2.4, index: 1.4 });
  }, { minGap: 0.5 });
  reg('clockStrike', (a, t, out) => {
    a.bell(out, t, 196, { dur: 2.6, vol: 0.16, ratio: 2.76, index: 2.2 });
    a.bell(out, t, 392, { dur: 1.8, vol: 0.06, ratio: 2, index: 1 });
  }, { minGap: 1 });
  reg('propPop', (a, t, out) => {
    a.tone(out, t, { type: 'sine', f: 420, f2: 620, dur: 0.07, vol: 0.05 });
    a.noise(out, t, { dur: 0.02, vol: 0.05, type: 'bandpass', f: 1400, q: 2 });
  }, { minGap: 0.05 });
}
