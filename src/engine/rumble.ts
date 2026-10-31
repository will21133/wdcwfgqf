// Gamepad rumble per pad (Xbox controllers via the Gamepad API "dual-rumble" effect).
// A player's own pad: p.input.rumble(...) (PlayerInput, input.ts). Whole-room events: rumbleAll(...).
export const rumbleSettings = { enabled: true, strength: 1 };

/** which pads rumbleAll() reaches: devices.ts narrows it to the joined players' pads */
export const rumbleTargets = { fn: (): number[] => connected().map((g) => g.index) };

/** QA: effects sent per pad index (tools/padtest4.cjs reads it) */
const counts: number[] = [];
if (typeof window !== 'undefined') (window as any).__rumbles = counts;

/** per pad: don't let small buzzes override a big one in progress */
const bigUntil = new Map<number, number>();

function connected(): Gamepad[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  const out: Gamepad[] = [];
  for (const gp of navigator.getGamepads()) if (gp && gp.connected) out.push(gp);
  return out;
}

/** strong = low-frequency motor, weak = high-frequency motor, ms = duration; one pad (by gp.index) */
export function rumblePad(index: number, strong: number, weak: number, ms: number) {
  if (!rumbleSettings.enabled || index < 0) return;
  const gp = connected().find((g) => g.index === index);
  if (!gp) return;
  const now = performance.now();
  if (strong < 0.5 && now < (bigUntil.get(index) ?? 0)) return;
  if (strong >= 0.5) bigUntil.set(index, now + ms * 0.8);
  const act = (gp as any).vibrationActuator;
  if (!act || typeof act.playEffect !== 'function') return;
  const k = rumbleSettings.strength;
  counts[index] = (counts[index] ?? 0) + 1;
  act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong * k), weakMagnitude: Math.min(1, weak * k) }).catch(() => {});
}

/** every joined player's pad (every connected pad while nobody has joined / solo) */
export function rumbleAll(strong: number, weak: number, ms: number) {
  if (!rumbleSettings.enabled) return;
  for (const i of rumbleTargets.fn()) rumblePad(i, strong, weak, ms);
}
