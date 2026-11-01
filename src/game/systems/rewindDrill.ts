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
