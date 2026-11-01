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
import { noticesHooks } from './ui/notices';
import type { Player } from './entities/player';
import type { Loadout } from './run';

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

// Ines's notes pause the game only in solo (GDD2 §9.2); with a pod in the bottom-left corner
// (slot III seated) the note card sits above it
hintsHooks.players = () => Math.max(1, devices.count);
hintsHooks.bottom = () => (devices.count > 1 && devices.input(2) ? 314 : 326);
// achievement / chime notices drop below the top-right pod (slot II) in co-op
noticesHooks.top = () => (devices.count > 1 && devices.input(1) ? 44 : 36);

// ───────────────────────── ownership (F2b) ─────────────────────────
/**
 * The hand an attacker belongs to: a Player itself, an echo's player, or anything that carries an
 * `owner` / `player` back-reference (effect entities, bullets, constructs). null for enemies and
 * world hazards.
 */
export function ownerPlayer(owner: unknown, depth = 0): Player | null {
  const o = owner as { kind?: string; team?: string; input?: unknown; slot?: unknown; player?: unknown; owner?: unknown } | null | undefined;
  if (!o || depth > 3) return null;
  if (o.kind === 'player' && o.team === 'player' && o.input && typeof o.slot === 'number') return o as unknown as Player;
  if (o.player) return ownerPlayer(o.player, depth + 1);
  if (o.owner && o.owner !== o) return ownerPlayer(o.owner, depth + 1);
  return null;
}

/** that hand's loadout (or null when the owner is no player) */
export function loOf(owner: unknown): Loadout | null {
  const p = ownerPlayer(owner);
  const run = p?.world?.run;
  return p && run ? run.lo(p.slot) : null;
}

// ───────────────────────── slot plate (HUD pods, co-op panels) ─────────────────────────
/** per slot: [lit top edge, rim, tinted column] */
export const SLOT_SHADES: [ColorKey, ColorKey, ColorKey][] = [['R4', 'R3', 'R0'], ['B6', 'B4', 'B0'], ['G4', 'G3', 'G0'], ['U4', 'U3', 'U0']];

/**
 * A player's plate: ink outline with clipped corners, a rim in the slot colour with a lit top edge,
 * a dark fill. `column` > 0 adds a slot-tinted column on the left (badge + numeral live there).
 * `dim` greys it (stopped / ghost / not joined yet).
 */
export function drawSlotPlate(ctx: CanvasRenderingContext2D, slot: number, x: number, y: number, w: number, h: number, o: { dim?: boolean; column?: number; fillAlpha?: number } = {}) {
  const s = ((slot % 4) + 4) % 4;
  const [light, rim, tint] = o.dim ? (['K6', 'K4', 'K1'] as ColorKey[]) : SLOT_SHADES[s];
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const a = ctx.globalAlpha;
  rect(ctx, x + 1, y, w - 2, h, 'K0'); rect(ctx, x, y + 1, w, h - 2, 'K0');
  rect(ctx, x + 1, y + 1, w - 2, h - 2, rim);
  rect(ctx, x + 2, y + 1, w - 4, 1, light);
  ctx.globalAlpha = a * (o.fillAlpha ?? 0.94);
  rect(ctx, x + 2, y + 2, w - 4, h - 4, 'K1');
  ctx.globalAlpha = a;
  rect(ctx, x + 2, y + 2, w - 4, 1, 'K2');
  if (o.column) {
    rect(ctx, x + 2, y + 2, o.column, h - 4, tint);
    rect(ctx, x + 2 + o.column, y + 2, 1, h - 4, rim);
  }
}

/** latin numerals for the tiny font (the CJK fonts carry Ⅰ–Ⅳ; tiny is latin only) */
export const ROMAN_LATIN = ['I', 'II', 'III', 'IV'];
