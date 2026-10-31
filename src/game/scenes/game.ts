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
import { Overlay, ChoiceOverlay, Toast, ChoiceHeader } from '../ui/overlay';
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
import { rumbleAll } from '../../engine/rumble';
import { ensurePlayers } from '../players';
import { makeBoss } from '../world/bosses';
import { markSeen } from '../save';
import { WEAPON_INFO } from '../ui/metaPanels';
import type { Boss } from '../entities/boss';
import { settings } from '../settings';
import { Hints, hintsHooks } from '../ui/hints';
import { Text } from '../ui/text';
import { col } from '../../art/palette';
import type { Loadout, OwnedMemory } from '../run';
import { coopScale } from '../world/coopScale';
import * as Down from '../systems/downed';
import { coopCamera, renderCoopEdges, type CoopCam } from '../world/coopCamera';
import { S } from '../strings';
import '../strings/f2';

setPartLookup((id) => PARTS_BY_ID[id] ?? null);

// Ines's notes wait while a boss fight is on (GDD2 §9.8 rule 2)
hintsHooks.busy = () => {
  const s = G.scenes.current;
  return s instanceof GameScene && !!s.boss && !s.boss.dead && !s.cleared;
};
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
  private bossPhase = 0;
  /** co-op camera state (tether glow, catch-up timers) */
  private coop: CoopCam = { glow: [], away: [] };
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
    // every seated player walks in through the entry door (solo: exactly the 1.0 spot)
    const seats = ensurePlayers();
    const ps = seats.map((inp, i) => {
      const ox = seats.length > 1 ? (i % 2 ? 9 : -9) : 0, oy = i >= 2 ? 11 : 0;
      const pl = new Player(ex + ox, ey + 18 + oy, inp);
      pl.autoWalk = 0.32;
      return w.add(pl);
    });
    w.cam.snap(ex, ey - 40);
    map.exits.forEach((e, i) => {
      const o = this.options[i];
      const look = !o ? { icon: ICONS.boss, color: 'B5', label: L('向上', 'Ascend') } : rewardLook(o);
      this.doors.push(w.add(new Door(e, { icon: look.icon, label: tr(look.label), color: look.color }, () => this.leave(o ?? null))));
    });
    w.flushAdds();
    // every hand's own inventory hooks, bound to that hand (PLAN2 §1.5)
    run.registerHooks(w);
    w.bus.on('spawn', (e) => { const k = (e.e as any).codexId; if (k) markSeen((e.e as any).isBoss ? 'bosses' : 'enemies', k); }, this);
    for (const pl of ps) {
      const lo = run.lo(pl.slot);
      lo.shieldReady = lo.mods.firstHitShield > 0;
      lo.onCharge = () => { sfx('charge'); pl.input.rumble(0.12, 0.25, 90); };
    }
    const scale = coopScale(ps.length);
    const dbgSpawn = G.debug.get('spawn');
    const kind = this.opt.kind;
    if (dbgSpawn && run.roomIndex === 0 && run.floor === Number(G.debug.get('floor') ?? 0)) {
      this.waves = [{ defs: dbgSpawn.split(',').map((id) => findEnemy(id)).filter((d) => !!d) as any }];
    } else if (kind === 'combat' || kind === 'elite') {
      this.waves = planWaves(this.rng, run.floor, run.roomIndex, kind === 'elite', run.overwind, scale.budget);
      if (kind === 'elite') run.floorState.elites++;
    } else if (kind === 'boss') {
      const c = this.center();
      const b = makeBoss(run.floor, c.x, c.y - 40);
      if (b) {
        this.boss = w.add(b);
        this.waves = [];
        this.cleared = false;
        for (const pl of ps) pl.locked = true;
        this.titleCard = { title: tr(b.bossName), sub: tr(b.bossTitle), t: -0.2 };
      } else this.waves = planWaves(this.rng, run.floor, 8, true, run.overwind, scale.budget);
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
    w.bus.emit('roomStart', { kind });
  }

  /** the hand a reward / choice belongs to (default: the first one standing) */
  private who(p?: Player | null): Player { return p ?? this.world.player!; }
  private loFor(p?: Player | null): Loadout { return this.run.lo(this.who(p).slot); }

  // ───────────────────────── RoomHost ─────────────────────────
  openOverlay(o: Overlay) { this.overlays.push(o); }

  openChoice(choices: Choice[], header: ChoiceHeader, after?: () => void, regen?: () => Choice[], who?: Player | null) {
    if (!choices.length) { after?.(); return; }
    const pl = this.who(who);
    const lo = this.loFor(pl);
    const ov = new ChoiceOverlay(choices, header, (c) => {
      this.world.fx.banner(pl.x, pl.y - 36, tr(c.title), c.color, 1.4);
      pl.input.rumble(0.2, 0.2, 100);
      if (MEMORIES[c.id]) markSeen('memories', c.id);
      after?.();
    }, regen ? () => { if (lo.rerolls <= 0) return null; lo.rerolls--; return regen(); } : undefined);
    ov.rerollsLeft = () => lo.rerolls;
    this.openOverlay(ov);
  }

  offerMemory(patron: Patron, boost = 0, who?: Player | null) {
    const pd = PATRONS[patron];
    const pl = this.who(who), lo = this.loFor(pl);
    const applied = (om: OwnedMemory, replaced: OwnedMemory | null) => {
      if (replaced) this.world.bus.off(replaced);
      const d = MEMORIES[om.id];
      const c = lo.liveCtx(om);
      if (c) d.hook?.(c, d.v[om.rarity]);
      this.syncPlayer(pl);
    };
    const gen = () => memoryChoices(this.run, lo, this.rng, patron, applied, boost);
    this.openChoice(gen(), { title: L(`${pd.name.zh} · ${pd.title.zh}`, `${pd.name.en}, ${pd.title.en}`), quote: this.rng.pick(pd.lines), icon: patronSigil(patron), color: pd.color, term: 'memory' }, undefined, gen, pl);
  }

  offerHourglass(who?: Player | null) {
    const pl = this.who(who), lo = this.loFor(pl);
    this.openChoice(hourglassChoices(lo, this.rng, () => this.syncPlayer(pl)), { title: UI.hourglass, sub: L('回溯的本质', 'The nature of rewinding'), icon: ICONS.hourglass, color: 'C3', term: 'hourglass' }, undefined, undefined, pl);
  }

  offerCalibration(who?: Player | null) {
    const pl = this.who(who), lo = this.loFor(pl);
    this.openChoice(calibrationChoices(lo, this.rng, (id) => {
      const c = lo.liveCtx(lo.key(id));
      if (c) CAL_BY_ID[id]?.hook?.(c);
      this.syncPlayer(pl);
    }), { title: UI.calibration, sub: WEAPON_INFO.find((x) => x.id === lo.weapon)?.name, icon: ICONS.whetstone, color: 'K9', term: 'calibration' }, undefined, undefined, pl);
  }

  grantPart(p: PartDef, who?: Player | null) {
    const pl = this.who(who), lo = this.loFor(pl);
    markSeen('parts', p.id);
    lo.parts.push(p.id);
    lo.recompute();
    const c = lo.liveCtx(lo.key(p.id));
    if (c) p.hook?.(c);
    const look = partLook(p);
    this.toast(look.icon, tr(p.name), tr(p.desc), look.color);
    this.syncPlayer(pl);
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

  /** keep a live hand in sync with its recomputed stats */
  syncPlayer(who?: Player | null) {
    const p = who ?? this.world.player;
    if (!p) return;
    const m = this.run.lo(p.slot).mods;
    const before = p.maxHp;
    p.maxHp = m.maxHp;
    if (p.maxHp > before && p.state === 'alive') p.hp += p.maxHp - before;
    p.hp = Math.min(p.maxHp, p.hp);
    p.syncRun();
    p.recorder.setWindow(m.rewindWindow);
    if (p.dashCharges > m.dashCharges) p.dashCharges = m.dashCharges;
  }

  // ───────────────────────── flow ─────────────────────────
  private spawnWave() {
    const w = this.world;
    const wave = this.waves[this.waveIdx];
    // never spawn on top of anyone standing
    const L = w.alive().length ? w.alive() : w.players;
    let spots = w.map.spawnable.filter((s) => L.every((p) => Math.hypot(s.tx * TS + 8 - p.x, s.ty * TS + 8 - p.y) > 90));
    if (!spots.length) spots = w.map.spawnable.filter((s) => Math.hypot(s.tx * TS + 8 - L[0].x, s.ty * TS + 8 - L[0].y) > 90);
    if (!spots.length) spots = w.map.spawnable.slice();
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
    const bp = w.player!;
    w.fx.banner(bp.x, bp.y - 40, tr(UI.cleared), 'B5', 1.6);
    w.bus.emit('roomClear', {});
    w.slowmo(0.35, 0.35);
    rumbleAll(0.2, 0.3, 120);
    const c = this.center();
    const o = this.opt;
    if (o.kind === 'elite') for (let i = 0; i < 3 + run.floor; i++) w.add(new Pickup(c.x, c.y, 'shard', 1));
    if (o.kind === 'boss') {
      for (let i = 0; i < 8 + run.floor * 3; i++) w.add(new Pickup(c.x, c.y, 'shard', 1));
      this.spawnReward({ kind: 'combat', reward: 'memory', patron: this.rng.pick(ALL_PATRONS) }, c, 0.3);
      w.add(new Pickup(c.x + 30, c.y, 'heal', Math.round(run.lo(bp.slot).mods.maxHp * 0.5)));
    } else this.spawnReward(o, c);
    this.unlockDoors();
  }

  private spawnReward(o: RoomOption, c: { x: number; y: number }, boost = 0) {
    const w = this.world, run = this.run;
    if (!o.reward) return;
    const look = rewardKindLook(o.reward, o.patron);
    // the hand that touches an orb gets that choice (F2c gives each hand its own orb)
    switch (o.reward) {
      case 'memory': w.add(new RewardOrb(c.x, c.y, look.icon, look.color, (p) => this.offerMemory(o.patron ?? 'oren', boost + (o.kind === 'elite' ? 0.15 : 0), p))); break;
      case 'hourglass': w.add(new RewardOrb(c.x, c.y, look.icon, look.color, (p) => this.offerHourglass(p))); break;
      case 'calibration': w.add(new RewardOrb(c.x, c.y, look.icon, look.color, (p) => this.offerCalibration(p))); break;
      case 'heal': w.add(new RewardOrb(c.x, c.y, look.icon, look.color, () => {
        // oil heals the whole team (GDD2 §5.8)
        for (const p of w.alive()) {
          const a = Math.round(p.maxHp * 0.3 * run.lo(p.slot).mods.healMul);
          p.hp = Math.min(p.maxHp, p.hp + a); w.fx.number(p.x, p.y - 26, a, 'G4', true);
        }
        sfx('heal');
      })); break;
      case 'brass': for (let i = 0, n = Math.round((18 + run.floor * 6) * coopScale(w.playerCount).brass); i < n; i++) w.add(new Pickup(c.x, c.y, 'brass', 3)); break;
      case 'shards': for (let i = 0; i < 4; i++) w.add(new Pickup(c.x, c.y, 'shard', 1)); break;
      case 'part': {
        const part = rollPart(run, this.rng, { allowCursed: false });
        w.add(new Chest(c.x, c.y, (p) => { if (part) this.grantPart(part, p); }, () => tr(UI.part)));
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
    for (const pl of this.world.players) { pl.locked = true; pl.syncRun(); }
    this.bankStats();
    if (this.opt.kind === 'boss' || !o) {
      if (run.floor >= FLOORS - 1) { this.onVictory?.(run); return; }
      run.floor++;
      run.roomIndex = 0;
      run.floorState = { shop: false, elites: 0, vault: false };
      for (const lo of run.all) lo.autoRewindLeft = lo.mods.autoRewindPerFloor;
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
    // QA autopilot / AI hands: every bot-driven slot thinks before anything reads input
    for (const pl of this.world.players) if (pl.input.kind === 'bot') botStep(this, pl, dt);
    this.t += dt;
    const w = this.world;
    const p = w.player!;
    const out = w.players.every((q) => Down.isOut(q));
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
    if (G.input.pressed('pause') && !out) { this.overlays.push(new PauseMenu(this)); return; }
    if (G.input.pressed('info') && !out) { this.overlays.push(new RunInfoPanel(this.run)); return; }
    w.update(dt);
    if (!w.frozen && !this.cleared) w.bus.emit('tick', { dt });
    if (this.boss) {
      // intro: camera on the boss, player waits
      if (this.boss.inIntro) { w.cam.follow(this.boss.x, this.boss.y - 30, dt, 4); this.hud.update(dt, w); this.postFx(dt, p); return; }
      if (!this.cleared) for (const pl of w.players) if (pl.locked) pl.locked = false;
      if (this.boss.phase !== this.bossPhase) { this.bossPhase = this.boss.phase; Hints.hold(4); }
      if (!this.cleared && this.boss.dead) { this.cleared = true; this.onClear(); }
      G.music.layer('boss', this.boss.phase > 0 && !this.boss.dead ? 1 : 0, this.boss.dead ? 4 : 2);
    } else if (!this.cleared && w.alive().length > 0) {
      const alive = w.aliveEnemies.length;
      if (this.waveIdx < 0 || (alive <= (this.waveIdx < this.waves.length - 1 ? 1 : 0) && this.waveIdx < this.waves.length - 1)) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) { this.waveIdx++; this.waveDelay = 0.8; this.spawnWave(); }
      } else if (alive === 0 && this.waveIdx >= this.waves.length - 1) this.onClear();
      this.unstick(dt);
    }
    const combat = !this.cleared && w.aliveEnemies.length > 0;
    G.music.layer('combat', combat ? 1 : 0, combat ? 0.8 : 3);
    if (w.playerCount > 1) {
      // co-op: midpoint of everyone standing, no aim look-ahead, a 600×340 tether and catch-up
      // (GDD2 §5.3; world/coopCamera.ts)
      coopCamera(w, this.coop, dt);
    } else {
      const look = p.input.aiming() ? 0.36 : 0;
      w.cam.follow(p.x + Math.cos(p.aim) * 40 * look, p.y - 10 + Math.sin(p.aim) * 30 * look, dt, 7);
    }
    this.hud.update(dt, w);
    this.postFx(dt, p);
    // the run ends when every hand has stopped (solo: once the Last Second has run out)
    if (out) {
      this.deathT += dt;
      if (this.deathT < dt * 1.5) { w.slowmo(0.25, 1.2); rumbleAll(0.9, 1, 500); G.music.stop(2); }
      if (this.deathT > 2.4 && (G.input.pressed('confirm') || G.input.pressed('attack'))) {
        for (const q of w.players) q.syncRun();
        this.bankStats();
        if (this.onDeath) this.onDeath(this.run);
        else G.scenes.go(() => new GameScene(new Run(), { kind: 'combat', reward: 'memory', patron: 'oren' }), 'clock', 0.6);
      }
    }
  }

  /** pause when the window loses focus (alt-tab, overlay) */
  autoPause() {
    if (G.debug.has('bot')) return;
    if (this.world?.alive().length && !this.overlays.some((o) => o.blocks)) this.overlays.push(new PauseMenu(this));
  }

  /** failsafe: an enemy nobody has touched for 40s gets pulled back to reachable ground */
  private stuckT = new Map<number, number>();
  private unstick(dt: number) {
    const w = this.world;
    for (const e of w.aliveEnemies) {
      const p = (w.nearestPlayer(e.x, e.y) ?? w.player)!;
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
    let fx = p.rewindFx;
    for (const pl of this.world.players) fx = Math.max(fx, pl.rewindFx);
    pp.rewind = damp(pp.rewind, fx, 18, dt);
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
    r.flushWorldUi();
    this.hud.boss = this.boss && !this.boss.inIntro && !this.boss.dead ? this.boss : null;
    const ctx = r.ui2;
    // co-op: tether glow on the screen edges and arrows to anyone off screen (under the HUD)
    if (this.world.playerCount > 1) renderCoopEdges(ctx, this.world, this.coop);
    this.hud.render(r, this.world);
    // the floor / boss title card yields to menus and reward screens (it would sit half under them)
    if (this.titleCard && !blocking) this.renderTitleCard(ctx);
    const lp = this.world.players[0];
    if (lp && !blocking) Down.renderLastSecondUi(ctx, lp);
    if (this.world.players.every((q) => Down.isOut(q)) && this.deathT > 1.0) {
      const a = Math.min(1, (this.deathT - 1.0) / 1.0);
      ctx.globalAlpha = a * 0.75;
      ctx.fillStyle = '#0b0a14';
      ctx.fillRect(0, 0, 640, 360);
      ctx.globalAlpha = a;
      G.font.draw(ctx, tr(UI.stopped), 320, 150, { align: 'center', color: 'R3', outline: 'K0' });
      if (this.world.playerCount > 1) Text.draw(ctx, S('f2', 'allStopped'), 320, 178, { align: 'center', color: 'K9', outline: 'K0' });
      if (this.deathT > 2.4) G.font.draw(ctx, tr(UI.retry), 320, 196, { align: 'center', color: Math.floor(this.t * 2) % 2 ? 'K10' : 'K8' });
      ctx.globalAlpha = 1;
    }
    for (const o of this.overlays) o.render(r);
  }

  private renderTitleCard(ctx: CanvasRenderingContext2D) {
    const t = this.titleCard!.t;
    const a = t < 0.5 ? ease.outCubic(t / 0.5) : t > 2.6 ? 1 - (t - 2.6) / 0.6 : 1;
    if (a <= 0) return;
    const w = Math.round(220 * clamp(t / 0.6, 0, 1));
    // floor card: 10px kicker + the floor name at 12px × 2 in a band centred on y 123
    // (96–150 at 100% text; the band grows with the text so the rules never cut it)
    const ls = Text.lineH('small'), lt = Text.lineH('title');
    const H = Math.max(54, Math.ceil(4 + ls + lt + 6));
    const top = Math.round(123 - H / 2);
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = col('K0');
    ctx.fillRect(0, top - 2, 640, H + 4);
    ctx.globalAlpha = a;
    ctx.fillStyle = col('B4');
    ctx.fillRect(320 - w, top, w * 2, 1);
    ctx.fillRect(320 - w, top + H - 1, w * 2, 1);
    const ty = top + Math.round((H - (ls + lt)) / 2) - 1;
    Text.draw(ctx, this.titleCard!.sub, 320, ty, { size: 'small', align: 'center', color: 'B5' });
    Text.draw(ctx, this.titleCard!.title, 320, ty + ls, { size: 'title', align: 'center', color: 'K10', outline: 'K0' });
    ctx.globalAlpha = 1;
  }
}

export { ROOMS_PER_FLOOR };
export type { RoomKind };
