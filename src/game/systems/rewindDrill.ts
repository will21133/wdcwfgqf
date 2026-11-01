// ?drill=perfect (PLAN2 §2 F3 acceptance): a scripted Perfect Rewind check. A training rig drops a
// telegraphed blow on the hand every 3 s; 0.1 s (game time) before it lands the drill presses
// Rewind through the real keyboard path and holds it for a short scrub. The blow lands while the
// hand is intangible inside the Perfect window → 'perfectRewind', and the Sand comes back.
// window.__drill = { attacks, perfects, sandOk } for tools/shot.cjs evals.
import { registerDebugRoute } from '../debugRoutes';
import { Entity } from '../entities/entity';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Player } from '../entities/player';
import { col } from '../../art/palette';
import { TAU } from '../../engine/math';
import { G } from '../G';

const PERIOD = 3, TELE = 0.7, LEAD = 0.1, HOLD_REAL = 0.3;

interface DrillStats { attacks: number; perfects: number; sandOk: number; log: string[] }

class PerfectRig extends Entity {
  private t = 1.2;
  private phase: 'wait' | 'tele' = 'wait';
  private ax = 0; private ay = 0;
  private pressed = false;
  private sandAtPress = 0;
  private releaseAt = -1;
  private pendingCheck = false;
  constructor(private stats: DrillStats) { super(); }
  private get p(): Player | null { return this.world.players[0] ?? null; }
  private key(down: boolean) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: 'KeyQ' })); }
  added() {
    this.world.bus.on('perfectRewind', () => { this.stats.perfects++; this.stats.log.push(`perfect @${this.world.time.toFixed(2)}`); }, this);
  }
  removed() { this.world.bus.off(this); }
  update(dt: number) {
    const p = this.p;
    if (!p) return;
    // releases run on real time (the hand scrubs on real time while the world crawls)
    if (this.releaseAt >= 0 && G.time >= this.releaseAt) { this.key(false); this.releaseAt = -1; }
    if (this.pendingCheck && !p.rw) {
      this.pendingCheck = false;
      // a Perfect Rewind gives back everything it cost
      if (Math.round(p.lo.sand) >= Math.round(this.sandAtPress)) this.stats.sandOk++;
      this.stats.log.push(`sand ${Math.round(this.sandAtPress)} → ${Math.round(p.lo.sand)}`);
      p.lo.sand = p.lo.sandMax;
    }
    this.t -= dt;
    if (this.phase === 'wait') {
      if (this.t <= 0 && !p.rw && p.canRewind().ok) { this.phase = 'tele'; this.t = TELE; this.ax = p.x; this.ay = p.y; this.pressed = false; }
      return;
    }
    if (!this.pressed && this.t <= LEAD) {
      this.pressed = true;
      this.sandAtPress = p.lo.sand;
      this.key(true);
      this.releaseAt = G.time + HOLD_REAL;
    }
    if (this.t <= 0) {
      this.stats.attacks++;
      this.world.hurtPlayers({ t: 'circle', x: this.ax, y: this.ay, r: 18 }, { amount: 8, kind: 'melee', x: this.ax, y: this.ay - 20, knock: 60 });
      this.world.fx.ring(this.ax, this.ay - 2, 4, 26, 0.3, 'M3', 3);
      // the blow has landed (on the held or just-landed hand): settle once the rewind is over
      this.pendingCheck = true;
      this.phase = 'wait';
      this.t = PERIOD - TELE;
    }
  }
  renderGround(r: Renderer) {
    if (this.phase !== 'tele') return;
    const k = 1 - Math.max(0, this.t) / TELE;
    const u = r.u;
    u.strokeStyle = col('M2');
    u.globalAlpha = 0.6;
    u.lineWidth = 1;
    u.beginPath(); u.ellipse(Math.round(this.ax) + 0.5, Math.round(this.ay) + 0.5, 18, 13, 0, 0, TAU); u.stroke();
    u.fillStyle = col('M1');
    u.globalAlpha = 0.25 + k * 0.3;
    u.beginPath(); u.ellipse(Math.round(this.ax), Math.round(this.ay), 18 * k, 13 * k, 0, 0, TAU); u.fill();
    u.globalAlpha = 1;
  }
}

registerDebugRoute('drill=perfect', async (q) => {
  if (q.get('drill') !== 'perfect') return false;
  const [{ Run }, { GameScene }, { Flow }, { ensurePlayers }] = await Promise.all([
    import('../run'), import('../scenes/game'), import('../flow'), import('../players'),
  ]);
  const stats: DrillStats = { attacks: 0, perfects: 0, sandOk: 0, log: [] };
  (window as unknown as { __drill: DrillStats }).__drill = stats;
  const seats = ensurePlayers();
  const seed = Number(q.get('seed') ?? 2);
  const run = new Run({ mode: 'practice', seed, contracts: {}, players: seats.map((inp) => ({ slot: inp.slot, device: inp.device, hand: 'tick', weapon: 'rapier' })) });
  const gs = new GameScene(run, { kind: 'rest', reward: null }, seed);
  Flow.wire(gs);
  G.scenes.set(gs);
  // the rig ticks before the hand, so the key press it makes is seen in the same tick
  const rig = gs.world.add(new PerfectRig(stats));
  gs.world.flushAdds();
  const L = gs.world.entities;
  L.splice(L.indexOf(rig), 1);
  L.unshift(rig);
  return true;
});

// ───────────────────────── ?drill=tickdodge (PLAN2 §2 F3 acceptance) ─────────────────────────
// A cogling charges the hand again and again. When it is about to connect (≤ 30 px out, mid-charge)
// the drill holds the arrow toward it and presses Dash through the real keyboard path: the dash
// carries the hand through the charge, its invulnerability blocks the blow within 0.16 s → Tick-Dodge
// ("TICK!", +25 Sand, the world slows). The drill then swings the hand's weapon at the cogling: that
// hit must be a Counter (crit ×2). window.__drill = { charges, ticks, counters, crits, log }.
interface TickStats { charges: number; ticks: number; counters: number; crits: number; log: string[] }

class TickRig extends Entity {
  private dashed = false;
  private release: string[] = [];
  private releaseAt = -1;
  private swingAt = -1;
  private chase: string[] = [];
  constructor(private stats: TickStats) { super(); }
  private get p(): Player | null { return this.world.players[0] ?? null; }
  private key(code: string, down: boolean) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })); }
  added() {
    this.world.bus.on('tickDodge', () => { this.stats.ticks++; this.stats.log.push(`tick @${this.world.time.toFixed(2)}`); this.swingAt = this.world.time + 0.12; }, this);
    this.world.bus.on('hit', (e) => {
      if (e.info.echo || e.player !== this.p) return;
      if (e.info.counter) this.stats.counters++;
      if (e.info.counter && e.info.crit) this.stats.crits++;
      this.stats.log.push(`hit ${Math.round(e.dealt)}${e.info.counter ? ' COUNTER' : ''}${e.info.crit ? ' crit' : ''}`);
    }, this);
  }
  removed() { this.world.bus.off(this); }
  update() {
    const p = this.p;
    if (!p) return;
    const w = this.world;
    if (this.releaseAt >= 0 && G.time >= this.releaseAt) { for (const k of this.release) this.key(k, false); this.release = []; this.releaseAt = -1; }
    const c = w.enemies.find((e) => !e.dead) as (import('../entities/enemy').Enemy & { state: string }) | undefined;
    p.hp = p.maxHp;
    if (!c) return;
    // the swing after the dodge (the weapon's own code, aimed at the cogling): it must be a Counter.
    // Walk at it (the real keys) until it is in reach, then swing.
    if (this.swingAt >= 0 && w.time >= this.swingAt && this.releaseAt < 0) {
      const d0 = Math.hypot(c.x - p.x, c.y - p.y);
      const want = d0 <= 28 || p.counterT <= 0.15 ? [] : [Math.abs(c.x - p.x) > 6 ? (c.x > p.x ? 'KeyD' : 'KeyA') : '', Math.abs(c.y - p.y) > 6 ? (c.y > p.y ? 'KeyS' : 'KeyW') : ''].filter(Boolean);
      for (const k of this.chase) if (!want.includes(k)) this.key(k, false);
      for (const k of want) if (!this.chase.includes(k)) this.key(k, true);
      this.chase = want;
      if (!want.length) {
        this.swingAt = -1;
        this.stats.log.push(`swing d=${Math.round(d0)} counter=${p.counterT.toFixed(2)}`);
        p.weapon.perform(p, 0, Math.atan2(c.y - 4 - (p.y - 7), c.x - p.x));
      }
      return;
    }
    if (c.state !== 'charge') { if (this.dashed && c.state !== 'windup') this.dashed = false; return; }
    if (this.dashed) return;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d > 30) return;
    this.dashed = true;
    this.stats.charges++;
    const dx = c.x - p.x, dy = c.y - p.y;
    const arrow = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'KeyD' : 'KeyA') : (dy > 0 ? 'KeyS' : 'KeyW');
    this.key(arrow, true);
    this.key('Space', true);
    this.release = [arrow, 'Space'];
    this.releaseAt = G.time + 0.08;
  }
}

registerDebugRoute('drill=tickdodge', async (q) => {
  if (q.get('drill') !== 'tickdodge') return false;
  const [{ Run }, { GameScene }, { Flow }, { ensurePlayers }, { findEnemy }] = await Promise.all([
    import('../run'), import('../scenes/game'), import('../flow'), import('../players'), import('../world/director'),
  ]);
  const stats: TickStats = { charges: 0, ticks: 0, counters: 0, crits: 0, log: [] };
  (window as unknown as { __drill: TickStats }).__drill = stats;
  const seats = ensurePlayers();
  const seed = Number(q.get('seed') ?? 2);
  const run = new Run({ mode: 'practice', seed, contracts: {}, players: seats.map((inp) => ({ slot: inp.slot, device: inp.device, hand: 'tick', weapon: 'rapier' })) });
  const gs = new GameScene(run, { kind: 'rest', reward: null }, seed);
  Flow.wire(gs);
  G.scenes.set(gs);
  const w = gs.world;
  const rig = w.add(new TickRig(stats));
  w.flushAdds();
  const L = w.entities;
  L.splice(L.indexOf(rig), 1);
  L.unshift(rig);
  // the hand stands in the middle of the room; the cogling starts beside it once the hand has walked in
  w.after(1.2, () => {
    const p = w.players[0];
    const def = findEnemy('cogling');
    if (!p || !def) return;
    const c = gs.center();
    p.catchUpTo(c.x, c.y + 10);
    const e = def.make(p.x - 64, p.y);
    e.spawnT = 0.3;
    e.hp = e.maxHp = 5000;
    w.add(e);
  });
  return true;
});
