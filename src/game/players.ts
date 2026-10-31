// Player slots (GDD2 §5.2): colour, shape badge and roman numeral per slot, plus the debug URLs
// that seat players and bots (?players=N, ?bot=1&players=N, ?devices=kbm,pad0,pad1).
import { G } from './G';
import { devices, MAX_SLOTS } from '../engine/devices';
import type { DeviceId, PlayerInput } from '../engine/input';
import { rumbleAll } from '../engine/rumble';
import { rect } from './ui/draw';
import type { ColorKey } from './ui/text';
import { SLOT_COLOR } from './ui/widgets';
import { hintsHooks } from './ui/hints';

export { SLOT_COLOR };
export const SLOT_SHAPE = ['tri', 'circle', 'square', 'diamond'] as const;
export type SlotShape = (typeof SLOT_SHAPE)[number];
export const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];

/**
 * Tick's body-sprite scarf letters (S highlight, s base, z shade, Z deep shade) per slot.
 * Slot I keeps 1.0's rust red. Brass and night blue get a lighter top and a deeper bottom so the
 * scarf reads against the brass crown and the navy coat.
 */
export const SLOT_SCARF: Partial<Record<string, ColorKey>>[] = [
  {},
  { S: 'B6', s: 'B5', z: 'B3', Z: 'B2' },
  { S: 'G4', s: 'G3', z: 'G2', Z: 'G1' },
  { S: 'K10', s: 'U4', z: 'U3', Z: 'U1' },
];
/** the flowing scarf tail: [near the neck, middle, tip] */
export const SLOT_RAMP: [ColorKey, ColorKey, ColorKey][] = [
  ['R4', 'R3', 'R2'],
  ['B6', 'B5', 'B3'],
  ['G4', 'G3', 'G2'],
  ['K9', 'U4', 'U3'],
];

export const slotColor = (slot: number): ColorKey => SLOT_COLOR[((slot % 4) + 4) % 4];

// shape badges (GDD2 §5.2 ▲ ● ■ ◆), drawn with a 1 px K0 outline; the square is 4×4 so it
// carries the same visual weight as the 5×5 triangle, circle and diamond
const SHAPES: Record<SlotShape, string[]> = {
  tri: ['..#..', '.###.', '.###.', '#####', '#####'],
  circle: ['.###.', '#####', '#####', '#####', '.###.'],
  square: ['####', '####', '####', '####'],
  diamond: ['..#..', '.###.', '#####', '.###.', '..#..'],
};

/** shape badge for a slot, centred on (cx, cy); works on the world, unlit or UI context */
export function drawSlotBadge(ctx: CanvasRenderingContext2D, slot: number, cx: number, cy: number, color?: ColorKey) {
  const s = ((slot % 4) + 4) % 4;
  const rows = SHAPES[SLOT_SHAPE[s]];
  const w = rows[0].length, h = rows.length;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') rect(ctx, x0 + x - 1, y0 + y - 1, 3, 3, 'K0');
  const c = color ?? slotColor(s);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === '#') rect(ctx, x0 + x, y0 + y, 1, 1, c);
}

/** seated players; the first scene that needs one claims slot 0 for the last-used device */
export function ensurePlayers(): PlayerInput[] {
  if (!devices.count) devices.ensureSolo();
  return devices.players;
}

/**
 * Rumble whoever owns a hit / effect: a Player (or anything with a PlayerInput) rumbles its own
 * pad; with no owner, solo play rumbles every pad (1.0) and co-op stays quiet.
 */
export function rumbleOwner(owner: unknown, strong: number, weak: number, ms: number) {
  const inp = (owner as { input?: PlayerInput } | null | undefined)?.input;
  if (inp && typeof inp.rumble === 'function') { inp.rumble(strong, weak, ms); return; }
  if (devices.count <= 1) rumbleAll(strong, weak, ms);
}

/**
 * Debug seating from the URL (boot calls this once):
 *   ?bot=1                 slot I is the QA bot (1.0)
 *   ?bot=1&players=N       N bots
 *   ?players=N             you (every device, as in solo) + N-1 bots
 *   ?devices=kbm,pad0,…    those devices in slots I, II, …; players=N tops up with bots
 */
export function initPlayersFromUrl(q: URLSearchParams = G.debug) {
  const bot = q.has('bot') && q.get('bot') !== '0';
  const list = (q.get('devices') ?? '').split(',').map((s) => s.trim()).filter(Boolean) as DeviceId[];
  const n = Math.max(1, Math.min(MAX_SLOTS, Number(q.get('players') ?? 0) || (list.length || 1)));
  if (!bot && !list.length && !q.has('players')) return;
  for (let slot = 0; slot < n; slot++) {
    const id: DeviceId = list[slot] ?? (bot || slot > 0 ? `bot${slot}` : 'kbm');
    devices.claim(id, slot);
  }
}

// Ines's notes pause the game only in solo (GDD2 §9.2)
hintsHooks.players = () => Math.max(1, devices.count);
