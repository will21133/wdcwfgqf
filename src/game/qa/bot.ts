// QA autopilot (?bot=1, ?players=N): plays the real game to catch crashes and gather pacing data.
// One brain per bot-driven slot; each writes its own PlayerInput.bot every tick (PLAN2 §1.3).
import type { GameScene } from '../scenes/game';
import type { Action, BotInput } from '../../engine/input';
import type { Player } from '../entities/player';
import { angleTo } from '../../engine/math';
import { RewardOrb, Chest, Interactable } from '../entities/interact';
import { Door } from '../entities/door';
import type { Echo } from '../entities/echo';

export type { BotInput };

export const botLog: string[] = [];
(window as any).__botLog = botLog;

interface Brain { lastRoom: string; roomT: number; tapT: number; scene: GameScene | null; rwHold: number; rwCd: number; taps: number; scrubs: number; forkCd: number; forks: number; forkEcho: Echo | null }
const brains: Brain[] = [];
const brainOf = (slot: number): Brain => (brains[slot] ??= { lastRoom: '', roomT: 0, tapT: 0, scene: null, rwHold: 0, rwCd: 2, taps: 0, scrubs: 0, forkCd: 3, forks: 0, forkEcho: null });
(window as any).__botRewinds = () => brains.map((b) => b && { taps: b.taps, scrubs: b.scrubs, forks: b.forks });

/**
 * Fork like a player would (GDD2 §3.4): mid-fight with Sand to spare, leave an echo, keep fighting,
 * and once it stands armed at the end of its path, walk back into it for a Paradox.
 */
function planFork(p: Player, br: Brain, near: number): boolean {
  if (br.forkCd > 0 || near > 90 || p.rw) return false;
  if (!p.canFork().ok || p.lo.sand < 150 || Math.random() > 0.02) return false;
  br.forkCd = 4;
  br.forks++;
  return true;
}

/**
 * Rewind like a player would (GDD2 §3.2): after a hit the tape can still undo, either tap back to
 * the Shadow or hold to scrub to just before the hit. Returns how long to hold Rewind (0 = not now).
 */
function planRewind(p: Player, br: Brain): number {
  if (br.rwCd > 0 || p.rw || !p.canRewind().ok) return 0;
  const rec = p.rec, n = rec.length;
  let hit = -1;
  for (let i = n - 1; i >= Math.max(0, n - 150); i--) if (rec.at(i).hit > 0) { hit = i; break; }
  if (hit < 0 || Math.random() > 0.08) return 0;
  br.rwCd = 2.5;
  const m = p.mods;
  const back = (n - hit) / 60 + 0.15;
  const hold = m.rewindTapThreshold + Math.max(0, back - 0.1) / (3 / 0.9);
  // scrubMax counts from the press (GDD2 §3.2: auto-confirm 1.2 s after it)
  if (Math.random() < 0.5 || hold > m.scrubMax - 0.05) { br.taps++; return 1 / 60; }
  br.scrubs++;
  return hold;
}

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
  br.rwCd -= dt;
  br.forkCd -= dt;
  // a rewind being held keeps being held until its planned release (a tap is one tick)
  if (br.rwHold > 0) {
    b.held.add('rewind');
    br.rwHold -= dt;
    return;
  }
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
  // a teammate has stopped: pull them back while it is fresh and the Sand is there (even slots), or
  // walk over and hold Interact to wind them up (GDD2 §5.5)
  if (p.state === 'alive') {
    let down: Player | null = null, dd = 320;
    for (const q of w.players) if (q !== p && q.state === 'stopped') { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < dd) { dd = d; down = q; } }
    if (down) {
      const pull = p.slot % 2 === 0 && down.down.t < 2.4 && s.run.lo(p.slot).sand >= 100;
      if (pull) {
        if (dd > 30) go(down.x, down.y);
        else { b.held.add('rewind'); if (!p.pull) b.pressed.add('rewind'); }
        return;
      }
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
    const hold = planRewind(p, br);
    if (hold > 0) { b.pressed.add('rewind'); b.held.add('rewind'); br.rwHold = hold - dt; return; }
    // Fork, then go back into the armed echo when it stands at its end (a Paradox)
    if (planFork(p, br, bd)) {
      b.pressed.add('fork');
      br.forkEcho = null;
      const before = p.echoes.length;
      w.after(0, () => { if (p.echoes.length > before || p.lastEcho?.kind === 'fork') br.forkEcho = p.echoes.filter((e) => e.kind === 'fork').pop() ?? null; });
      return;
    }
    const fe = br.forkEcho;
    if (fe && (fe.dead || fe.phase === 'recall')) br.forkEcho = null;
    else if (fe && fe.armed && fe.phase === 'stand') { go(fe.x, fe.y); return; }
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
