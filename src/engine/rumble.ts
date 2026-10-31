// Gamepad rumble (Xbox controllers via the Gamepad API "dual-rumble" effect).
export const rumbleSettings = { enabled: true, strength: 1 };
let lastStrong = 0;

/** strong = low-frequency motor, weak = high-frequency motor, ms = duration */
export function rumble(strong: number, weak: number, ms: number) {
  if (!rumbleSettings.enabled || !navigator.getGamepads) return;
  const now = performance.now();
  // don't let small buzzes override a big one in progress
  if (strong < 0.5 && now < lastStrong) return;
  if (strong >= 0.5) lastStrong = now + ms * 0.8;
  const k = rumbleSettings.strength;
  for (const gp of navigator.getGamepads()) {
    if (!gp || !gp.connected) continue;
    const act = (gp as any).vibrationActuator;
    if (act && typeof act.playEffect === 'function') {
      act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong * k), weakMagnitude: Math.min(1, weak * k) }).catch(() => {});
    }
  }
}
