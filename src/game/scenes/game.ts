// In-run scene: one room of the tower.
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import { G, sfx } from '../G';
import { Run } from '../run';
import { World } from '../world/world';
import { generateRoom, RoomKind } from '../world/roomgen';
import { THEMES } from '../../art/themes';
import { TS, T } from '../world/room';
import { Player } from '../entities/player';
import { WallLamp, WallGear, Breakable } from '../entities/props';
import { Door } from '../entities/door';
import { HUD } from '../ui/hud';
import { planWaves, Wave } from '../world/director';
import { RNG } from '../../engine/rng';
import { damp } from '../../engine/math';
import { Dummy } from '../entities/enemies/gearworks';
import { BIOMES } from '../../art/biomes';
import { findEnemy } from '../world/director';

export interface RoomSpec { kind: RoomKind; seed: number; exits: number }

export class GameScene implements Scene {
  world!: World;
  hud = new HUD();
  waves: Wave[] = [];
  waveIdx = -1;
  waveDelay = 1.0;
  cleared = false;
  doors: Door[] = [];
  deathT = 0;
  paused = false;
  t = 0;
  private rng: RNG;

  constructor(public run: Run, public spec: RoomSpec) {
    this.rng = new RNG(spec.seed);
  }

  enter() {
    const run = this.run;
    const th = THEMES[Math.min(run.floor, THEMES.length - 1)];
    const map = generateRoom({ rng: new RNG(this.spec.seed), kind: this.spec.kind, biome: run.floor, exits: this.spec.exits });
    const w = new World(map, th, this.spec.seed);
    w.run = run;
    this.world = w;
    // props
    for (const p of map.props) {
      if (p.type === 'walllamp') w.add(new WallLamp(p.tx, p.ty, th.lamp, th.lampLight));
      else if (p.type === 'wallgear') w.add(new WallGear(p.tx, p.ty, !!p.data?.big));
      else if (p.type === 'crate' || p.type === 'barrel') w.add(new Breakable(p.tx, p.ty, p.type));
    }
    BIOMES[th.id]?.decorate?.(w, map, new RNG(this.spec.seed + 99));
    // player at entry
    const ex = map.entry ? (map.entry.tx + 1) * TS : map.pw / 2;
    const ey = map.entry ? map.entry.ty * TS - 10 : map.ph / 2;
    const p = new Player(ex, ey);
    w.add(p);
    w.cam.snap(ex, ey - 40);
    // doors
    for (const e of map.exits) {
      const d = new Door(e, { icon: null, label: '', color: 'B4' }, (door) => this.leave(door));
      this.doors.push(w.add(d));
    }
    const dbgSpawn = G.debug.get('spawn');
    if (dbgSpawn) {
      // debug: ?spawn=id[,id...]  spawns those enemies as a single wave
      const defs = dbgSpawn.split(',').map((id) => findEnemy(id)).filter((d) => !!d) as any[];
      this.waves = [{ defs }];
    } else if (this.spec.kind === 'combat' || this.spec.kind === 'elite') {
      this.waves = planWaves(this.rng, run.floor, run.roomIndex, this.spec.kind === 'elite');
    } else if (this.spec.kind === 'tutorial') {
      const sp = map.spawnable[Math.floor(map.spawnable.length / 2)];
      w.add(new Dummy(sp.tx * TS + 8, sp.ty * TS + 8));
    }
    if (!this.waves.length) this.cleared = true;
    w.flushAdds();
    G.r.params.lighting = true;
    G.music.play(th.music);
  }

  private spawnWave() {
    const w = this.world;
    const wave = this.waves[this.waveIdx];
    const p = w.player!;
    const spots = w.map.spawnable.filter((s) => Math.hypot(s.tx * TS + 8 - p.x, s.ty * TS + 8 - p.y) > 90);
    this.rng.shuffle(spots);
    let si = 0;
    for (const d of wave.defs) {
      const s = spots[si++ % spots.length];
      const n = d.group ?? 1;
      for (let k = 0; k < n; k++) {
        const ox = (k % 2) * 10 - 5, oy = Math.floor(k / 2) * 10 - 5;
        w.add(d.make(s.tx * TS + 8 + (n > 1 ? ox : 0), s.ty * TS + 8 + (n > 1 ? oy : 0)));
      }
    }
    sfx(this.waveIdx === 0 ? 'waveStart' : 'wave');
    w.bus.emit('waveStart', { wave: this.waveIdx });
  }

  private leave(_d: Door) {
    const run = this.run;
    run.roomIndex++;
    const next: RoomSpec = { kind: run.roomIndex % 5 === 4 ? 'elite' : 'combat', seed: run.rng.int(1, 1e9), exits: run.rng.int(2, 3) };
    this.world.player!.locked = true;
    G.scenes.go(() => new GameScene(run, next), 'clock', 0.5);
  }

  update(dt: number) {
    this.t += dt;
    const w = this.world;
    const p = w.player!;
    if (G.input.pressed('pause')) this.paused = !this.paused;
    if (this.paused) { G.audio.muffle(true, 700); return; }
    w.update(dt);
    // waves
    if (!this.cleared && p.hp > 0) {
      const alive = w.aliveEnemies.length;
      if (this.waveIdx < 0 || (alive <= (this.waveIdx < this.waves.length - 1 ? 1 : 0) && this.waveIdx < this.waves.length - 1)) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) {
          this.waveIdx++;
          this.waveDelay = 0.8;
          this.spawnWave();
        }
      } else if (alive === 0 && this.waveIdx >= this.waves.length - 1) {
        this.onClear();
      }
    }
    // music intensity
    const combat = !this.cleared && w.aliveEnemies.length > 0;
    G.music.layer('combat', combat ? 1 : 0, combat ? 0.8 : 3);
    // camera follow with look-ahead toward aim
    if (p) {
      const look = G.input.mouseAim ? 0.18 : 0;
      const tx = p.x + Math.cos(p.aim) * 40 * look * 2, ty = p.y - 10 + Math.sin(p.aim) * 30 * look * 2;
      w.cam.follow(tx, ty, dt, 7);
    }
    this.hud.update(dt, w);
    // post fx decay
    const pp = G.r.params;
    pp.hurt = Math.max(0, pp.hurt - dt * 2.2);
    pp.flash = Math.max(0, pp.flash - dt * 4);
    pp.rewind = damp(pp.rewind, p.rewindFx, 18, dt);
    pp.ca = pp.rewind * 2.2 + pp.hurt * 1.5;
    // death
    if (p.hp <= 0) {
      this.deathT += dt;
      if (this.deathT < dt * 1.5) w.slowmo(0.25, 1.2);
      if (this.deathT > 2.2 && (G.input.pressed('confirm') || G.input.pressed('attack'))) {
        G.scenes.go(() => new GameScene(new Run(), { kind: 'combat', seed: (Math.random() * 1e9) | 0, exits: 2 }), 'clock', 0.6);
      }
    }
  }

  private onClear() {
    this.cleared = true;
    const w = this.world;
    for (const d of this.doors) d.unlock();
    // entry stays sealed
    sfx('roomClear');
    w.fx.banner(w.player!.x, w.player!.y - 40, '— 清 场 —', 'B5', 1.6);
    w.bus.emit('roomClear', {});
    w.slowmo(0.35, 0.35);
  }

  render(r: Renderer) {
    const th = this.world.theme;
    const pp = r.params;
    pp.tint = th.grade.tint;
    pp.lift = th.grade.lift;
    pp.saturation = th.grade.sat * (this.paused ? 0.3 : 1);
    pp.contrast = th.grade.contrast;
    pp.vignette = 0.42;
    pp.bloom = 0.5;
    pp.bloomThreshold = 0.6;
    pp.lighting = true;
    this.world.render(r);
    this.hud.render(r, this.world);
    const ctx = r.ui2;
    if (this.world.player!.hp <= 0 && this.deathT > 1.0) {
      const a = Math.min(1, (this.deathT - 1.0) / 1.0);
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = '#0b0a14';
      ctx.fillRect(0, 0, 640, 360);
      ctx.globalAlpha = a;
      G.font.draw(ctx, '停 摆', 320, 150, { align: 'center', color: 'R3', outline: 'K0' });
      G.small.draw(ctx, 'THE CLOCK STOPS', 320, 170, { align: 'center', color: 'K7' });
      if (this.deathT > 2.2) G.small.draw(ctx, '按 [攻击] 重新上发条', 320, 200, { align: 'center', color: Math.floor(this.t * 2) % 2 ? 'K10' : 'K7' });
      ctx.globalAlpha = 1;
    }
    if (this.paused) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#0b0a14';
      ctx.fillRect(0, 0, 640, 360);
      ctx.globalAlpha = 1;
      G.font.draw(ctx, '— 暂停 —', 320, 170, { align: 'center', color: 'B5', outline: 'K0' });
    }
  }
}
