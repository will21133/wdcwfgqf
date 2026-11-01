// QA autopilot (?bot=1, ?players=N): plays the real game to catch crashes and gather pacing data.
// One brain per bot-driven slot; each writes its own PlayerInput.bot every tick (PLAN2 §1.3).
import type { GameScene } from '../scenes/game';
import type { Action, BotInput } from '../../engine/input';
import type { Player } from '../entities/player';
import { angleTo } from '../../engine/math';
import { RewardOrb, Chest, Interactable } from '../entities/interact';
import { Door } from '../entities/door';

export type { BotInput };

export const botLog: string[] = [];
(window as any).__botLog = botLog;

interface Brain { lastRoom: string; roomT: number; tapT: number; scene: GameScene | null }
const brains: Brain[] = [];
const brainOf = (slot: number): Brain => (brains[slot] ??= { lastRoom: '', roomT: 0, tapT: 0, scene: null });

/** BFS over walkable tiles from the player's tile to the goal tile; returns the next waypoint */
function pathStep(s: GameScene, px: number, py: number, gx: number, gy: number): { x: number; y: number } | null {
  const m = s.world.map, W = m.w;
  const sx = Math.floor(px / 16), sy = Math.floor(py / 16), ex = Math.floor(gx / 16), ey = Math.floor(gy / 16);
  if (!m.in(ex, ey)) return null;
  const prev = new Int32Array(m.w * m.h).fill(-1);
  const q = [sy * W + sx];
  prev[sy * W + sx] = sy * W + sx;
  const ok = (x: number, y: number) => m.isFloor(x, y) || (x === ex && y === ey);
  while (q.length) {
    const i = q.shift()!;
    const x = i % W, y = (i / W) | 0;
    if (x === ex && y === ey) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * W + nx;
      if (!m.in(nx, ny) || prev[j] >= 0 || !ok(nx, ny)) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  let cur = ey * W + ex;
  if (prev[cur] < 0) return null;
  let next = cur;
  while (prev[cur] !== cur) { next = cur; cur = prev[cur]; }
  if (next === sy * W + sx) return null;
  return { x: (next % W) * 16 + 8, y: ((next / W) | 0) * 16 + 8 };
}

/** one tick of thinking for the bot that drives player `p` */
export function botStep(s: GameScene, p: Player, dt: number) {
  const b: BotInput = { move: { x: 0, y: 0 }, aimX: 0, aimY: 0, held: new Set(), pressed: new Set() };
  p.input.bot = b;
  const w = s.world;
  const br = brainOf(p.slot);
  const key = `${s.run.floor}:${s.run.roomIndex}:${s.opt.kind}`;
  if (key !== br.lastRoom || br.scene !== s) {
    // the room log is the 1.0 format; it comes from the first bot only so co-op runs read the same
    if (p === w.players.find((q) => q.input.kind === 'bot')) botLog.push(`[room] ${key} t=${Math.round(s.run.time)}s hp=${Math.round(p.hp)}${w.playerCount > 1 ? ` players=${w.playerCount}` : ''}`);
    br.lastRoom = key; br.roomT = 0; br.scene = s;
  }
  br.roomT += dt;
  br.tapT -= dt;
  const roomT = br.roomT;
  const tap = (a: Action) => { if (br.tapT <= 0) { b.pressed.add(a); br.tapT = 0.35; } };
  // stopped: try to rewind out (Last Second / self-rescue), otherwise wait for a teammate
  if (p.state === 'stopped' && !s.overlays.some((o) => o.blocks)) { if (Math.random() < 0.04) b.pressed.add('rewind'); if (Math.random() < 0.05) b.pressed.add('confirm'); return; }
  // overlays / death / this hand's own co-op choice panel: confirm
  if (s.overlays.some((o) => o.blocks) || (p.hp <= 0 && p.state !== 'ghost') || s.panelOf(p.slot)) { if (Math.random() < 0.05) b.pressed.add('confirm'); return; }
  const go = (x: number, y: number) => {
    const step = pathStep(s, p.x, p.y, x, y);
    const tx = step ? step.x : x, ty = step ? step.y : y;
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d > 2) b.move = { x: (tx - p.x) / d, y: (ty - p.y) / d };
  };
  // a teammate has stopped: walk over and hold Interact to wind them up (GDD2 §5.5)
  if (p.state === 'alive') {
    let down: Player | null = null, dd = 320;
    for (const q of w.players) if (q !== p && q.state === 'stopped') { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < dd) { dd = d; down = q; } }
    if (down) {
      if (dd > 12) go(down.x, down.y);
      if (dd < 18) b.held.add('interact');
      return;
    }
  }
  const enemies = w.aliveEnemies;
  if (enemies.length) {
    let tgt = enemies[0], bd = 1e9;
    for (const e of enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; tgt = e; } }
    const a = angleTo(p.x, p.y, tgt.x, tgt.y);
    b.aimX = Math.cos(a); b.aimY = Math.sin(a);
    const wpn = s.run.lo(p.slot).weapon;
    const range = wpn === 'bow' || wpn === 'chakram' ? 90 : 26;
    // co-op bots circle on their own side so four of them don't stack on one spot
    const side = p.slot % 2 ? -1 : 1;
    if (bd > range) go(tgt.x, tgt.y);
    else b.move = { x: -Math.sin(a) * 0.6 * side, y: Math.cos(a) * 0.6 * side };
    if (bd < range + 20) { b.pressed.add('attack'); b.held.add('attack'); }
    if (Math.random() < 0.01) b.pressed.add('special');
    const danger = enemies.some((e) => (e as any).attacking && Math.hypot(e.x - p.x, e.y - p.y) < 50);
    if (danger && Math.random() < 0.3) { b.pressed.add('dash'); b.move = { x: -Math.sin(a) * side, y: Math.cos(a) * side }; }
    if (p.hp < p.maxHp * 0.6 && s.run.lo(p.slot).charges > 0 && Math.random() < 0.05) b.pressed.add('rewind');
    return;
  }
  // rewards first (give up after a while; skip vault chests — the cage needs the echo puzzle)
  if (roomT < 12) for (const e of w.entities) {
    if (s.opt.kind === 'vault') break;
    if (e instanceof RewardOrb && !e.dead && e.takes(p)) { go(e.x, e.y); return; }
    if (e instanceof Chest && !(e as any).opened && e.accepts(p)) { go(e.x, e.y + 6); if (Math.hypot(e.x - p.x, e.y - p.y) < 20) tap('interact'); return; }
  }
  // events / workbench: interact once
  if (roomT < 16) for (const e of w.entities) {
    if (e instanceof Interactable && e.enabled && e.accepts(p) && !(e as any).sold && (e.constructor.name === 'EventStatue' || e.constructor.name === 'Workbench')) {
      go(e.x, e.y + 14);
      if ((e as Interactable).near) tap('interact');
      return;
    }
  }
  // head for the first open door
  const door = w.entities.find((e) => e instanceof Door && (e as Door).open) as Door | undefined;
  if (door) {
    if (p.y > door.y + 12) go(door.x, door.y + 8);
    else go(door.x, door.y - 20);
  }
  if (roomT > 90 && Math.floor(roomT) % 30 === 0 && Math.floor(roomT - dt) % 30 !== 0) botLog.push(`[stuck] ${key}`);
}
