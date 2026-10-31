// P2 sound effects (PLAN2 §0.2 rule 5). Registered at boot from src/game/boot.ts setupAudio().
// Add sounds with reg('name', (a, t, out) => { ... }) — see src/audio/sfx.ts for the synth helpers.
import type { AudioEngine, SfxFn } from '../engine/audio/audio';

export function registerEncountersSfx(a: AudioEngine): void {
  const reg = (n: string, fn: SfxFn, o?: { minGap?: number; maxVoices?: number; vol?: number }) => a.register(n, fn, o);
  void reg;
}
