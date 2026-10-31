// In-run scene: one room of the tower.
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Sprite } from '../../engine/gfx/sprite';
import { G, sfx } from '../G';
import { Run } from '../run';
import { World } from '../world/world';
import { generateRoom, RoomKind } from '../world/roomgen';
import { THEMES } from '../../art/themes';
import { TS } from '../world/room';
import { Player } from '../entities/player';
import { spawnStockProps } from '../world/stockProps';
import { Door } from '../entities/door';
import { HUD } from '../ui/hud';
import { planWaves, Wave, findEnemy } from '../world/director';
import { RNG } from '../../engine/rng';
import { damp, clamp, ease } from '../../engine/math';
import { Dummy } from '../entities/enemies/gearworks';
import { setupTutorial } from '../rooms/tutorial';
import { botStep } from '../qa/bot';
import { BIOMES } from '../../art/biomes';
import { Overlay, ChoiceOverlay, Toast } from '../ui/overlay';
import { PauseMenu, RunInfoPanel } from '../ui/pause';
import {
  RoomOption, nextOptions, rewardLook, memoryChoices, hourglassChoices, calibrationChoices, rollPart, partLook, Choice,
  ROOMS_PER_FLOOR, FLOORS, rewardKindLook,
} from '../progression/rewards';
import { PATRONS, MEMORIES, Patron } from '../progression/memories';
import { PARTS_BY_ID, PartDef } from '../progression/parts';
import { CAL_BY_ID } from '../progression/calibrations';
import { RewardOrb, Chest } from '../entities/interact';
import { Pickup } from '../entities/pickup';
import { RoomHost, setupShop, setupRest, setupEvent, setupVault, setPartLookup } from '../rooms/special';
import { tr, L, L10n, UI } from '../i18n';
import { ICONS, patronSigil } from '../../art/sprites/icons';
import { rumble } from '../../engine/rumble';
import { makeBoss } from '../world/bosses';
import { markSeen } from '../save';
import { WEAPON_INFO } from '../ui/metaPanels';
import type { Boss } from '../entities/boss';
import { settings } from '../settings';

setPartLookup((id) => PARTS_BY_ID[id] ?? null);
const BOT = G.debug.has('bot');
const ALL_PATRONS: Patron[] = ['oren', 'pip', 'marta', 'fen', 'asu'];

export class GameScene implements Scene, RoomHost {
  world!: World;
  hud = new HUD();
  waves: Wave[] = [];
  waveIdx = -1;
  waveDelay = 1.0;
  cleared = false;
  doors: Door[] = [];
  deathT = 0;
  t = 0;
  rng: RNG;
  overlays: Overlay[] = [];
  options: RoomOption[] = [];
  titleCard: { title: string; sub: string; t: number } | null = null;
  boss: Boss | null = null;
  /** set by the flow controller (hub/title) */
  onDeath?: (run: Run) => void;
  onVictory?: (run: Run) => void;
  onQuit?: (run: Run) => void;

  constructor(public run: Run, public opt: RoomOption, private seed = run.rng.int(1, 1e9)) {
    this.rng = new RNG(seed);
  }

  enter() {
    const run = this.run;
    const th = THEMES[Math.min(run.floor, THEMES.length - 1)];
    // mark this room's one-per-floor kinds before rolling the doors out of it
    if (this.opt.kind === 'shop') run.floorState.shop = true;
    if (this.opt.kind === 'vault') run.floorState.vault = true;
    this.options = this.opt.kind === 'boss' ? [] : nextOptions(run, this.rng, run.floorState, this.opt.kind);
    const exits = this.opt.kind === 'boss' ? 1 : this.options.length;
    const map = generateRoom({ rng: new RNG(this.seed), kind: this.opt.kind, biome: run.floor, exits });
    const w = new World(map, th, this.seed);
    w.run = run;
    this.world = w;
    spawnStockProps(w, map, th);
    BIOMES[th.id]?.decorate?.(w, map, new RNG(this.seed + 99));
    const ex = map.entry ? (map.entry.tx + 1) * TS : map.pw / 2;
    const ey = map.entry ? map.entry.ty * TS - 10 : map.ph / 2;
    const p = new Player(ex, ey + 18);
    p.autoWalk = 0.32;
    w.add(p);
    w.cam.snap(ex, ey - 40);
    map.exits.forEach((e, i) => {
      const o = this.options[i];
      const look = !o ? { icon: ICONS.boss, color: 'B5', label: L('向上', 'Ascend') } : rewardLook(o);
      this.doors.push(w.add(new Door(e, { icon: look.icon, label: tr(look.label), color: look.color }, () => this.leave(o ?? null))));
    });
    w.flushAdds();
    run.registerHooks(w, p);
    w.bus.on('spawn', (e) => { const k = (e.e as any).codexId; if (k) markSeen((e.e as any).isBoss ? 'bosses' : 'enemies', k); }, this);
    run.shieldReady = run.mods.firstHitShield > 0;
    run.onCharge = () => { sfx('charge'); rumble(0.12, 0.25, 90); };
    const dbgSpawn = G.debug.get('spawn');
    const kind = this.opt.kind;
    if (dbgSpawn && run.roomIndex === 0 && run.floor === Number(G.debug.get('floor') ?? 0)) {
      this.waves = [{ defs: dbgSpawn.split(',').map((id) => findEnemy(id)).filter((d) => !!d) as any }];
    } else if (kind === 'combat' || kind === 'elite') {
      this.waves = planWaves(this.rng, run.floor, run.roomIndex, kind === 'elite', run.overwind);
      if (kind === 'elite') run.floorState.elites++;
    } else if (kind === 'boss') {
      const c = this.center();
      const b = makeBoss(run.floor, c.x, c.y - 40);
      if (b) {
        this.boss = w.add(b);
        this.waves = [];
        this.cleared = false;
        p.locked = true;
        this.titleCard = { title: tr(b.bossName), sub: tr(b.bossTitle), t: -0.2 };
      } else this.waves = planWaves(this.rng, run.floor, 8, true, run.overwind);
    } else if (kind === 'tutorial') {
      const c = this.center();
      w.add(new Dummy(c.x, c.y - 30));
      setupTutorial(w);
      // a couple of coglings to practise on once you're ready
      this.waves = [{ defs: [findEnemy('cogling')!, findEnemy('cogling')!].filter(Boolean) }];
      this.waveDelay = 6;
    } else if (kind === 'shop') { run.floorState.shop = true; setupShop(this); }
    else if (kind === 'rest') setupRest(this);
    else if (kind === 'event') setupEvent(this);
    else if (kind === 'vault') { run.floorState.vault = true; setupVault(this); }
    if (!this.waves.length && !this.boss && (kind === 'combat' || kind === 'elite' || kind === 'tutorial' || kind === 'boss')) this.cleared = true;
    if (kind === 'shop' || kind === 'rest' || kind === 'event' || kind === 'vault') this.cleared = true;
    w.flushAdds();
    G.r.params.lighting = true;
    G.music.play(kind === 'shop' ? 'shop' : this.boss ? (run.floor >= 3 ? 'boss_final' : 'boss') : th.music);
    G.music.layer('combat', 0, 0.01);
    G.music.layer('boss', 0, 0.01);
    const off = G.debug.get('offer');
    if (off && run.roomIndex === Number(G.debug.get('roomIndex') ?? 0)) {
      if (off === 'hourglass') this.offerHourglass();
      else if (off === 'calibration') this.offerCalibration();
      else if (off === 'part') { const pt = rollPart(run, this.rng); if (pt) this.grantPart(pt); }
      else this.offerMemory(off as Patron);
    }
    if (run.roomIndex === 0 && !this.boss) this.titleCard = { title: tr(th.name), sub: tr(L(`第 ${run.floor + 1} 层`, `FLOOR ${run.floor + 1}`)), t: 0 };
  }

  // ───────────────────────── RoomHost ─────────────────────────
  openOverlay(o: Overlay) { this.overlays.push(o); }

  openChoice(choices: Choice[], header: { title: L10n; sub?: L10n; quote?: L10n; icon?: Sprite; color: string }, after?: () => void, regen?: () => Choice[]) {
    if (!choices.length) { after?.(); return; }
    const run = this.run;
    const ov = new ChoiceOverlay(choices, header, (c) => {
      const p = this.world.player!;
      this.world.fx.banner(p.x, p.y - 36, tr(c.title), c.color, 1.4);
      rumble(0.2, 0.2, 100);
      if (MEMORIES[c.id]) markSeen('memories', c.id);
      after?.();
    }, regen ? () => { if (run.rerolls <= 0) return null; run.rerolls--; return regen(); } : undefined);
    ov.rerollsLeft = () => run.rerolls;
    this.openOverlay(ov);
  }

  offerMemory(patron: Patron, boost = 0) {
    const pd = PATRONS[patron];
    const applied = (om: import('../run').OwnedMemory, replaced: import('../run').OwnedMemory | null) => {
      if (replaced) this.world.bus.off(replaced);
      const d = MEMORIES[om.id];
      d.hook?.({ ...this.run.hookCtx!, on: (k, fn) => this.world.bus.on(k, fn, om) }, d.v[om.rarity]);
      this.syncPlayer();
    };
    const gen = () => memoryChoices(this.run, this.rng, patron, applied, boost);
    this.openChoice(gen(), { title: L(`${pd.name.zh} · ${pd.title.zh}`, `${pd.name.en}, ${pd.title.en}`), quote: this.rng.pick(pd.lines), icon: patronSigil(patron), color: pd.color }, undefined, gen);
  }

  offerHourglass() {
    this.openChoice(hourglassChoices(this.run, this.rng, () => this.syncPlayer()), { title: UI.hourglass, sub: L('回溯的本质', 'The nature of rewinding'), icon: ICONS.hourglass, color: 'C3' });
  }

  offerCalibration() {
    this.openChoice(calibrationChoices(this.run, this.rng, (id) => {
      CAL_BY_ID[id]?.hook?.({ ...this.run.hookCtx!, on: (k, fn) => this.world.bus.on(k, fn, id) });
      this.syncPlayer();
    }), { title: UI.calibration, sub: WEAPON_INFO.find((x) => x.id === this.run.weapon)?.name, icon: ICONS.whetstone, color: 'K9' });
  }

  grantPart(p: PartDef) {
    markSeen('parts', p.id);
    this.run.parts.push(p.id);
    this.run.recompute();
    p.hook?.({ ...this.run.hookCtx!, on: (k, fn) => this.world.bus.on(k, fn, p.id) });
    const look = partLook(p);
    this.toast(look.icon, tr(p.name), tr(p.desc), look.color);
    this.syncPlayer();
  }

  toast(icon: Sprite | null, title: string, desc: string, color = 'B5') { this.overlays.push(new Toast(icon, title, desc, color)); }
  unlockDoors() { for (const d of this.doors) d.unlock(); }

  center() {
    const m = this.world.map;
    let sx = 0, sy = 0, n = 0;
    for (const s of m.spawnable) { sx += s.tx; sy += s.ty; n++; }
    if (!n) {
      const fl = m.openTiles(1);
      for (const s of fl) { sx += s.tx; sy += s.ty; n++; }
    }
    if (!n) return { x: m.pw / 2, y: m.ph / 2 };
    return { x: Math.round((sx / n) * TS + 8), y: Math.round((sy / n) * TS + 8) };
  }

  /** keep the live player in sync with recomputed stats */
  private syncPlayer() {
    const p = this.world.player;
    if (!p) return;
    const before = p.maxHp;
    p.maxHp = this.run.mods.maxHp;
    if (p.maxHp > before) p.hp += p.maxHp - before;
    p.hp = Math.min(p.maxHp, p.hp);
    this.run.hp = p.hp;
    p.recorder.setWindow(this.run.mods.rewindWindow);
    if (p.dashCharges > this.run.mods.dashCharges) p.dashCharges = this.run.mods.dashCharges;
  }

  // ───────────────────────── flow ─────────────────────────
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

  private onClear() {
    this.cleared = true;
    const w = this.world;
    const run = this.run;
    run.stats.rooms++;
    sfx('roomClear');
    w.fx.banner(w.player!.x, w.player!.y - 40, tr(UI.cleared), 'B5', 1.6);
    w.bus.emit('roomClear', {});
    w.slowmo(0.35, 0.35);
    rumble(0.2, 0.3, 120);
    const c = this.center();
    const o = this.opt;
    if (o.kind === 'elite') for (let i = 0; i < 3 + run.floor; i++) w.add(new Pickup(c.x, c.y, 'shard', 1));
    if (o.kind === 'boss') {
      for (let i = 0; i < 8 + run.floor * 3; i++) w.add(new Pickup(c.x, c.y, 'shard', 1));
      this.spawnReward({ kind: 'combat', reward: 'memory', patron: this.rng.pick(ALL_PATRONS) }, c, 0.3);
      w.add(new Pickup(c.x + 30, c.y, 'heal', Math.round(run.mods.maxHp * 0.5)));
    } else this.spawnReward(o, c);
    this.unlockDoors();
  }

  private spawnReward(o: RoomOption, c: { x: number; y: number }, boost = 0) {
    const w = this.world, run = this.run;
    if (!o.reward) return;
    const look = rewardKindLook(o.reward, o.patron);
    switch (o.reward) {
      case 'memory': w.add(new RewardOrb(c.x, c.y, look.icon, look.color, () => this.offerMemory(o.patron ?? 'oren', boost + (o.kind === 'elite' ? 0.15 : 0)))); break;
      case 'hourglass': w.add(new RewardOrb(c.x, c.y, look.icon, look.color, () => this.offerHourglass())); break;
      case 'calibration': w.add(new RewardOrb(c.x, c.y, look.icon, look.color, () => this.offerCalibration())); break;
      case 'heal': w.add(new RewardOrb(c.x, c.y, look.icon, look.color, () => {
        const p = w.player!; const a = Math.round(p.maxHp * 0.3 * run.mods.healMul);
        p.hp = Math.min(p.maxHp, p.hp + a); w.fx.number(p.x, p.y - 26, a, 'G4', true); sfx('heal');
      })); break;
      case 'brass': for (let i = 0; i < 18 + run.floor * 6; i++) w.add(new Pickup(c.x, c.y, 'brass', 3)); break;
      case 'shards': for (let i = 0; i < 4; i++) w.add(new Pickup(c.x, c.y, 'shard', 1)); break;
      case 'part': {
        const part = rollPart(run, this.rng, { allowCursed: false });
        w.add(new Chest(c.x, c.y, () => { if (part) this.grantPart(part); }, () => tr(UI.part)));
        break;
      }
    }
  }

  /** bank this room's stats into the run */
  bankStats() {
    const run = this.run, s = this.world.stats;
    run.stats.kills += s.kills; run.stats.rewinds += s.rewinds; run.stats.paradoxes += s.paradoxes;
    run.stats.damage += s.damage; run.stats.hitsTaken += s.hitsTaken;
    this.world.stats = { damage: 0, kills: 0, rewinds: 0, paradoxes: 0, hitsTaken: 0 };
  }

  private leave(o: RoomOption | null) {
    const run = this.run;
    const p = this.world.player!;
    p.locked = true;
    run.hp = p.hp;
    this.bankStats();
    if (this.opt.kind === 'boss' || !o) {
      if (run.floor >= FLOORS - 1) { this.onVictory?.(run); return; }
      run.floor++;
      run.roomIndex = 0;
      run.floorState = { shop: false, elites: 0, vault: false };
      run.autoRewindLeft = run.mods.autoRewindPerFloor;
      G.scenes.go(() => this.next({ kind: 'combat', reward: 'memory', patron: this.rng.pick(ALL_PATRONS) }), 'clock', 0.8);
      return;
    }
    run.roomIndex++;
    G.scenes.go(() => this.next(o), 'clock', 0.5);
  }

  private next(o: RoomOption): GameScene {
    const s = new GameScene(this.run, o);
    s.onDeath = this.onDeath;
    s.onVictory = this.onVictory;
    s.onQuit = this.onQuit;
    return s;
  }

  update(dt: number) {
    if (BOT) botStep(this, dt);
    this.t += dt;
    const w = this.world;
    const p = w.player!;
    this.run.time += dt;
    if (this.titleCard) { this.titleCard.t += dt; if (this.titleCard.t > 3.2) this.titleCard = null; }
    // overlays: the topmost blocking overlay owns input; toasts tick underneath
    if (this.overlays.length) {
      const top = this.overlays[this.overlays.length - 1];
      for (let i = this.overlays.length - 1; i >= 0; i--) {
        const o = this.overlays[i];
        if (o === top || !o.blocks) { if (!o.update(dt)) this.overlays.splice(i, 1); }
      }
      if (top.blocks && this.overlays.includes(top)) { this.hud.update(dt, w); return; }
      if (this.overlays.some((o) => o.blocks)) { this.hud.update(dt, w); return; }
    }
    if (G.input.pressed('pause') && p.hp > 0) { this.overlays.push(new PauseMenu(this)); return; }
    if (G.input.pressed('info') && p.hp > 0) { this.overlays.push(new RunInfoPanel(this.run)); return; }
    w.update(dt);
    if (!w.frozen && !this.cleared) w.bus.emit('tick', { dt });
    if (this.boss) {
      // intro: camera on the boss, player waits
      if (this.boss.inIntro) { w.cam.follow(this.boss.x, this.boss.y - 30, dt, 4); this.hud.update(dt, w); this.postFx(dt, p); return; }
      if (p.locked && !this.cleared) p.locked = false;
      if (!this.cleared && this.boss.dead) { this.cleared = true; this.onClear(); }
      G.music.layer('boss', this.boss.phase > 0 && !this.boss.dead ? 1 : 0, this.boss.dead ? 4 : 2);
    } else if (!this.cleared && p.hp > 0) {
      const alive = w.aliveEnemies.length;
      if (this.waveIdx < 0 || (alive <= (this.waveIdx < this.waves.length - 1 ? 1 : 0) && this.waveIdx < this.waves.length - 1)) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) { this.waveIdx++; this.waveDelay = 0.8; this.spawnWave(); }
      } else if (alive === 0 && this.waveIdx >= this.waves.length - 1) this.onClear();
      this.unstick(dt);
    }
    const combat = !this.cleared && w.aliveEnemies.length > 0;
    G.music.layer('combat', combat ? 1 : 0, combat ? 0.8 : 3);
    const aiming = G.input.mouseAim || Math.hypot(G.input.padAimX, G.input.padAimY) > 0.3;
    const look = aiming ? 0.36 : 0;
    w.cam.follow(p.x + Math.cos(p.aim) * 40 * look, p.y - 10 + Math.sin(p.aim) * 30 * look, dt, 7);
    this.hud.update(dt, w);
    this.postFx(dt, p);
    if (p.hp <= 0) {
      this.deathT += dt;
      if (this.deathT < dt * 1.5) { w.slowmo(0.25, 1.2); rumble(0.9, 1, 500); G.music.stop(2); }
      if (this.deathT > 2.4 && (G.input.pressed('confirm') || G.input.pressed('attack'))) {
        this.run.hp = 0;
        this.bankStats();
        if (this.onDeath) this.onDeath(this.run);
        else G.scenes.go(() => new GameScene(new Run(), { kind: 'combat', reward: 'memory', patron: 'oren' }), 'clock', 0.6);
      }
    }
  }

  /** pause when the window loses focus (alt-tab, overlay) */
  autoPause() {
    if (G.debug.has('bot')) return;
    if (this.world?.player && this.world.player.hp > 0 && !this.overlays.some((o) => o.blocks)) this.overlays.push(new PauseMenu(this));
  }

  /** failsafe: an enemy nobody has touched for 40s gets pulled back to reachable ground */
  private stuckT = new Map<number, number>();
  private unstick(dt: number) {
    const w = this.world, p = w.player!;
    for (const e of w.aliveEnemies) {
      if (e.isBoss) continue;
      const t = (this.stuckT.get(e.id) ?? 0) + dt;
      this.stuckT.set(e.id, e.hp < e.maxHp && e.flash > 0 ? 0 : t);
      if (t > 40) {
        const spots = w.map.spawnable.filter((s) => Math.hypot(s.tx * TS + 8 - p.x, s.ty * TS + 8 - p.y) < 160);
        const s = spots.length ? this.rng.pick(spots) : w.map.spawnable[0];
        if (s) { e.x = s.tx * TS + 8; e.y = s.ty * TS + 8; (e as any).spawnT = 0.6; }
        this.stuckT.set(e.id, 0);
      }
    }
  }

  private postFx(dt: number, p: Player) {
    const pp = G.r.params;
    pp.hurt = Math.max(0, pp.hurt - dt * 2.2);
    pp.flash = Math.max(0, pp.flash - dt * 4);
    pp.rewind = damp(pp.rewind, p.rewindFx, 18, dt);
    pp.ca = pp.rewind * 2.2 + pp.hurt * 1.5;
    pp.timestop = damp(pp.timestop, this.world.timeStop, 10, dt);
  }

  render(r: Renderer) {
    const th = this.world.theme;
    const pp = r.params;
    const blocking = this.overlays.some((o) => o.blocks);
    pp.tint = th.grade.tint;
    pp.lift = th.grade.lift;
    pp.saturation = th.grade.sat * (blocking ? 0.55 : 1);
    pp.contrast = th.grade.contrast;
    pp.vignette = 0.42;
    pp.bloom = 0.5;
    pp.bloomThreshold = 0.6;
    pp.lighting = true;
    pp.fade = 0;
    if (!settings.flashes) pp.flash = 0;
    this.world.cam.shakeScale = settings.shake;
    this.world.render(r);
    this.hud.boss = this.boss && !this.boss.inIntro && !this.boss.dead ? this.boss : null;
    this.hud.render(r, this.world);
    const ctx = r.ui2;
    if (this.titleCard) this.renderTitleCard(ctx);
    if (this.world.player!.hp <= 0 && this.deathT > 1.0) {
      const a = Math.min(1, (this.deathT - 1.0) / 1.0);
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = '#0b0a14';
      ctx.fillRect(0, 0, 640, 360);
      ctx.globalAlpha = a;
      G.font.draw(ctx, tr(UI.stopped), 320, 150, { align: 'center', color: 'R3', outline: 'K0' });
      if (this.deathT > 2.4) G.small.draw(ctx, tr(UI.retry), 320, 200, { align: 'center', color: Math.floor(this.t * 2) % 2 ? 'K10' : 'K7' });
      ctx.globalAlpha = 1;
    }
    for (const o of this.overlays) o.render(r);
  }

  private renderTitleCard(ctx: CanvasRenderingContext2D) {
    const t = this.titleCard!.t;
    const a = t < 0.5 ? ease.outCubic(t / 0.5) : t > 2.6 ? 1 - (t - 2.6) / 0.6 : 1;
    if (a <= 0) return;
    const w = Math.round(220 * clamp(t / 0.6, 0, 1));
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = '#0b0a14';
    ctx.fillRect(0, 96, 640, 54);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#d99c45';
    ctx.fillRect(320 - w, 100, w * 2, 1);
    ctx.fillRect(320 - w, 145, w * 2, 1);
    G.small.draw(ctx, this.titleCard!.sub, 320, 106, { align: 'center', color: 'B4' });
    G.font.draw(ctx, this.titleCard!.title, 320, 122, { align: 'center', color: 'K10', outline: 'K0' });
    ctx.globalAlpha = 1;
  }
}

export { ROOMS_PER_FLOOR };
export type { RoomKind };
