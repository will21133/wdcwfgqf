// In-run scene: one room of the tower.
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Sprite } from '../../engine/gfx/sprite';
import { G, sfx } from '../G';
import { Run } from '../run';
import { World } from '../world/world';
import { generateRoom, RoomKind } from '../world/roomgen';
import { RoomTypes } from '../rooms/registry';
import { Routes } from '../routes';
import { GameHooks, roomGrade } from '../hooks';
import { TS } from '../world/room';
import { Player } from '../entities/player';
import { spawnStockProps } from '../world/stockProps';
import { Door } from '../entities/door';
import { HUD } from '../ui/hud';
import { Wave, findEnemy } from '../world/director';
import { RNG } from '../../engine/rng';
import { damp, clamp, ease } from '../../engine/math';
import { botStep } from '../qa/bot';
import { BIOMES } from '../../art/biomes';
import { Overlay, ChoiceOverlay, Toast, ChoiceHeader, type ChoicePlace } from '../ui/overlay';
import { PauseMenu, RunInfoPanel } from '../ui/pause';
import {
  RoomOption, nextOptions, rewardLook, memoryChoices, hourglassChoices, calibrationChoices, rollPart, partLook, Choice, pickPatron,
  ROOMS_PER_FLOOR, rewardKindLook,
} from '../progression/rewards';
import { PATRONS, MEMORIES, Patron } from '../progression/memories';
import { PARTS_BY_ID, PartDef } from '../progression/parts';
import { CAL_BY_ID } from '../progression/calibrations';
import { RewardOrb, Chest } from '../entities/interact';
import { Pickup } from '../entities/pickup';
import { RoomHost, setPartLookup } from '../rooms/special';
import { tr, L, L10n, UI } from '../i18n';
import { ICONS, patronSigil } from '../../art/sprites/icons';
import { rumbleAll } from '../../engine/rumble';
import { ensurePlayers, slotColor } from '../players';
import { devices } from '../../engine/devices';
import { joinSeat, leaveSeat, slotText, DisconnectOverlay, renderJoinHold, SlotBanners, flushJoinEvents } from '../ui/joinPanel';
import { markSeen } from '../save';
import { WEAPON_INFO, SeatWeapons } from '../ui/metaPanels';
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
import { Onboard } from '../onboard/core';

setPartLookup((id) => PARTS_BY_ID[id] ?? null);

// Ines's notes wait while a boss fight is on (GDD2 §9.8 rule 2)
hintsHooks.busy = () => {
  const s = G.scenes.current;
  return s instanceof GameScene && !!s.boss && !s.boss.dead && !s.cleared;
};
const ALL_PATRONS: Patron[] = ['oren', 'pip', 'marta', 'fen', 'asu'];
/** a co-op hand choosing a reward stands anchored: teammates bump off it instead of pushing it */
const CHOOSER_MASS = 1000;

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
  private coop: CoopCam = { glow: [], away: [], stuck: [] };
  /** set by the flow controller (hub/title) */
  onDeath?: (run: Run) => void;
  onVictory?: (run: Run) => void;
  onQuit?: (run: Run) => void;

  constructor(public run: Run, public opt: RoomOption, private seed = run.rng.int(1, 1e9)) {
    this.rng = new RNG(seed);
  }

  enter() {
    const run = this.run;
    const th = Routes.theme(Routes.floor(run));
    // mark this room's one-per-floor kinds before rolling the doors out of it
    if (this.opt.kind === 'shop') run.floorState.shop = true;
    if (this.opt.kind === 'vault') run.floorState.vault = true;
    const fk = (run.floorState.kinds ??= {});
    fk[this.opt.kind] = (fk[this.opt.kind] ?? 0) + 1;
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
    const lane = (x: number) => [ey - 4, ey - 20, ey - 36].every((yy) => !map.solidAt(x - 4, yy) && !map.solidAt(x + 4, yy));
    const ps = seats.map((inp, i) => {
      // co-op: two columns through the doorway, unless a prop just inside blocks one (then the middle)
      let ox = seats.length > 1 ? (i % 2 ? 9 : -9) : 0;
      if (ox && !lane(ex + ox)) ox = 0;
      const oy = i >= 2 ? 11 : 0;
      const pl = new Player(ex + ox, ey + 18 + oy, inp);
      pl.autoWalk = 0.32;
      return w.add(pl);
    });
    w.cam.snap(ex, ey - 40);
    map.exits.forEach((e, i) => {
      const o = this.options[i];
      const look = !o ? { icon: ICONS.boss, color: 'B5', label: L('向上', 'Ascend') } : rewardLook(o);
      const d = w.add(new Door(e, { icon: look.icon, label: tr(look.label), color: look.color }, () => this.leave(o ?? null)));
      d.hold = () => this.anyChoosing();
      this.doors.push(d);
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
    // a hand that joined mid-run catches up: one memory pick per floor already climbed
    for (const pl of ps) {
      const lo = run.lo(pl.slot);
      for (; lo.catchup > 0; lo.catchup--) this.world.after(0.7, () => this.catchUpPick(pl));
    }
    const dbgSpawn = G.debug.get('spawn');
    const kind = this.opt.kind;
    const def = RoomTypes.get(kind);
    if (dbgSpawn && run.roomIndex === 0 && run.floor === Number(G.debug.get('floor') ?? 0)) {
      this.waves = [{ defs: dbgSpawn.split(',').map((id) => findEnemy(id)).filter((d) => !!d) as any }];
    } else def?.build(this);
    // a fight with nothing to fight, and every peaceful room, start cleared
    if (!def?.combat || (!this.waves.length && !this.boss)) this.cleared = true;
    w.flushAdds();
    G.r.params.lighting = true;
    G.music.play(kind === 'shop' ? 'shop' : this.boss ? (run.floor >= 3 ? 'boss_final' : 'boss') : th.music);
    G.music.layer('combat', 0, 0.01);
    G.music.layer('boss', 0, 0.01);
    const off = G.debug.get('offer');
    if (off && run.roomIndex === Number(G.debug.get('roomIndex') ?? 0)) {
      // co-op: every hand gets the offer (one panel each)
      for (const pl of w.playerCount > 1 ? w.players : [null]) {
        if (off === 'hourglass') this.offerHourglass(pl);
        else if (off === 'calibration') this.offerCalibration(pl);
        else if (off === 'part') { const pt = rollPart(run, this.rng, pl ? { lo: run.lo(pl.slot) } : {}); if (pt) this.grantPart(pt, pl); }
        else this.offerMemory(off as Patron, 0, pl);
      }
    }
    if (run.roomIndex === 0 && !this.boss) this.titleCard = { title: tr(th.name), sub: tr(L(`第 ${run.floor + 1} 层`, `FLOOR ${run.floor + 1}`)), t: 0 };
    w.bus.emit('roomStart', { kind });
    flushJoinEvents(w);
    // global hooks (PLAN2 §1.5): the run's first room, then every room (bus fresh, hand hooks registered)
    if (!run.started) { run.started = true; GameHooks.fire.runStart(run); }
    GameHooks.fire.roomStart({ w, run, scene: this, kind });
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
    const coop = this.world.playerCount > 1;
    // co-op: one panel per hand at a time; a second offer waits for the first to close
    if (coop && this.panelOf(pl.slot)) { this.queueFor(pl.slot).push(() => this.openChoice(choices, header, after, regen, pl)); return; }
    const place: ChoicePlace | undefined = coop ? { input: pl.input, rect: this.choiceRect(pl.slot), slot: pl.slot, blocks: this.world.aliveEnemies.length > 0, anchor: this.choiceRect(pl.slot).y > 150 ? 'bottom' : 'top' } : undefined;
    const ov = new ChoiceOverlay(choices, header, (c) => {
      this.world.fx.banner(pl.x, pl.y - 36, tr(c.title), c.color, 1.4);
      pl.input.rumble(0.2, 0.2, 100);
      if (MEMORIES[c.id]) markSeen('memories', c.id);
      after?.();
    }, regen ? () => { if (lo.rerolls <= 0) return null; lo.rerolls--; return regen(); } : undefined, place);
    ov.rerollsLeft = () => lo.rerolls;
    // the choosing hand stands still while the others keep walking (GDD2 §5.8)
    // (and teammates walking into it do not shove it around: it is anchored while it chooses)
    if (coop) { pl.locked = true; pl.mass = CHOOSER_MASS; this.choosing.add(pl); }
    this.openOverlay(ov);
  }

  /** hands with a choice panel open (co-op) and offers waiting behind one */
  private choosing = new Set<Player>();
  private choiceQueue = new Map<number, (() => void)[]>();
  private queueFor(slot: number) { let q = this.choiceQueue.get(slot); if (!q) this.choiceQueue.set(slot, (q = [])); return q; }
  /** this hand's open co-op choice panel */
  panelOf(slot: number): ChoiceOverlay | null {
    for (const o of this.overlays) if (o instanceof ChoiceOverlay && o.place?.slot === slot) return o;
    return null;
  }
  /** is anyone still choosing (doors wait; no new wave starts) */
  anyChoosing(): boolean { return this.choosing.size > 0 || [...this.choiceQueue.values()].some((q) => q.length > 0); }

  /**
   * Where a hand's choice panel sits: its half of the screen (left I / III, right II / IV) under the
   * top pods; with two hands on one side, its quarter (over its own pod).
   */
  choiceRect(slot: number) {
    const slots = this.world.players.map((p) => p.slot);
    const left = slot % 2 === 0;
    const quarters = slots.some((a) => slots.some((b) => a !== b && a % 2 === b % 2));
    const x = left ? 8 : 324, w = 308;
    if (!quarters) return { x, y: 44, w, h: 360 - 44 - 8 };
    // quarters hug their corners (sized to their text) and leave a gap down the middle, where the
    // shared camera keeps the hands
    return { x: left ? 8 : 336, y: slot < 2 ? 4 : 184, w: 296, h: 172 };
  }

  /** after the overlays tick: free hands whose panel closed, open the next queued offer */
  private settlePanels() {
    for (const p of [...this.choosing]) {
      if (this.panelOf(p.slot)) continue;
      this.choosing.delete(p);
      p.mass = 1;
      // (during a boss intro everyone stays put until the intro ends)
      if (!this.leaving && !this.boss?.inIntro) p.locked = false;
    }
    for (const [slot, q] of this.choiceQueue) if (q.length && !this.panelOf(slot)) q.shift()!();
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

  /** a hand that joined mid-run: one memory pick (from any patron) per floor already climbed */
  private catchUpPick(pl: Player) {
    const patron = pickPatron(this.run, this.rng), pd = PATRONS[patron], lo = this.loFor(pl);
    const gen = () => memoryChoices(this.run, lo, this.rng, patron, (om, replaced) => {
      if (replaced) this.world.bus.off(replaced);
      const d = MEMORIES[om.id];
      const c = lo.liveCtx(om);
      if (c) d.hook?.(c, d.v[om.rarity]);
      this.syncPlayer(pl);
    });
    this.openChoice(gen(), { title: L(`${pd.name.zh} · ${pd.title.zh}`, `${pd.name.en}, ${pd.title.en}`), sub: S('f2', 'catchup'), icon: patronSigil(patron), color: pd.color, term: 'memory' }, undefined, gen, pl);
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
    this.toast(look.icon, tr(p.name), tr(p.desc), look.color, this.world.playerCount > 1 ? pl.slot : null);
    this.syncPlayer(pl);
  }

  toast(icon: Sprite | null, title: string, desc: string, color = 'B5', slot: number | null = null) {
    const t = new Toast(icon, title, desc, color, 3.2, slot);
    t.lane = this.overlays.filter((o) => o instanceof Toast).length % 3;
    this.overlays.push(t);
  }
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
    const grade = roomGrade(w.stats.hitsTaken);
    w.bus.emit('roomClear', { grade });
    GameHooks.fire.roomClear({ w, run, scene: this, grade });
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
    // co-op (GDD2 §5.8): memory / hourglass / calibration → one orb per hand in its colour; parts →
    // each hand rolls its own chest. Solo: the single 1.0 orb / chest.
    const hands = w.players.length > 1 ? w.players.slice().sort((a, b) => a.slot - b.slot) : [null];
    const spot = (i: number) => {
      const n = hands.length;
      if (n <= 1) return this.floorNear(c.x, c.y);
      const k = i - (n - 1) / 2;
      return this.floorNear(Math.round(c.x + k * 30), Math.round(c.y + Math.abs(k) * 6));
    };
    const orb = (make: (p: Player) => void) => hands.forEach((h, i) => {
      const s = spot(i);
      w.add(new RewardOrb(s.x, s.y, look.icon, look.color, make, h ? h.slot : null));
    });
    switch (o.reward) {
      case 'memory': orb((p) => this.offerMemory(o.patron ?? 'oren', boost + (o.kind === 'elite' ? 0.15 : 0), p)); break;
      case 'hourglass': orb((p) => this.offerHourglass(p)); break;
      case 'calibration': orb((p) => this.offerCalibration(p)); break;
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
      case 'part': hands.forEach((h, i) => {
        const part = rollPart(run, this.rng, h ? { allowCursed: false, lo: run.lo(h.slot) } : { allowCursed: false });
        const s = spot(i);
        w.add(new Chest(s.x, s.y, (p) => { if (part) this.grantPart(part, p ?? h); }, () => tr(UI.part), h ? h.slot : null));
      }); break;
    }
  }

  /**
   * (x, y) if it stands on open floor, else the centre of the nearest floor tile within 6 tiles (a
   * room whose middle is a shelf island would otherwise float rewards over it, out of reach)
   */
  private floorNear(x: number, y: number): { x: number; y: number } {
    const m = this.world.map;
    const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
    if (m.isFloor(tx, ty)) return { x, y };
    for (let r = 1; r <= 6; r++) {
      let best: { x: number; y: number } | null = null, bd = Infinity;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r || !m.isFloor(tx + i, ty + j)) continue;
        const cx = (tx + i) * TS + 8, cy = (ty + j) * TS + 8, d = Math.hypot(cx - x, cy - y);
        if (d < bd) { bd = d; best = { x: cx, y: cy }; }
      }
      if (best) return best;
    }
    return { x, y };
  }

  /** bank this room's stats into the run */
  bankStats() {
    const run = this.run, s = this.world.stats;
    run.stats.kills += s.kills; run.stats.rewinds += s.rewinds; run.stats.paradoxes += s.paradoxes;
    run.stats.damage += s.damage; run.stats.hitsTaken += s.hitsTaken;
    this.world.stats = { damage: 0, kills: 0, rewinds: 0, paradoxes: 0, hitsTaken: 0 };
  }

  /** the team is walking out (doors chosen) */
  leaving = false;

  private leave(o: RoomOption | null) {
    const run = this.run;
    this.leaving = true;
    for (const pl of this.world.players) { pl.locked = true; pl.syncRun(); }
    this.bankStats();
    if (this.opt.kind === 'boss' || !o) {
      if (Routes.isLast(run)) { this.onVictory?.(run); return; }
      run.floor++;
      run.roomIndex = 0;
      run.floorState = { shop: false, elites: 0, vault: false, kinds: {} };
      for (const lo of run.all) lo.autoRewindLeft = lo.mods.autoRewindPerFloor;
      G.scenes.go(() => this.next({ kind: 'combat', reward: 'memory', patron: this.rng.pick(ALL_PATRONS) }), 'clock', 0.8);
      return;
    }
    // a room kind may sit outside the floor's count (advancesRoom: false, e.g. a secret room)
    if (RoomTypes.get(o.kind)?.advancesRoom !== false) run.roomIndex++;
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
    // a free device can join at any moment (it walks in at the next room); its press is consumed
    this.midRunJoin();
    this.banners.update(dt);
    // a seated pad that went away while no scene could pause for it (summary, cutscene, credits)
    if (!this.leaving) for (const slot of devices.lostSlots()) this.onDeviceLost(slot);
    // overlays: the topmost full-screen blocking overlay owns input; toasts tick underneath.
    // Co-op choice panels each read their own hand's device, so they all tick together (unless a
    // full-screen menu such as pause sits on top of them).
    if (this.overlays.length) {
      const isPanel = (o: Overlay) => o instanceof ChoiceOverlay && o.compact;
      let topFull: Overlay | null = null;
      for (let i = this.overlays.length - 1; i >= 0 && !topFull; i--) if (this.overlays[i].blocks && !isPanel(this.overlays[i])) topFull = this.overlays[i];
      for (let i = this.overlays.length - 1; i >= 0; i--) {
        const o = this.overlays[i];
        const tick = o === topFull || (!o.blocks && !isPanel(o)) || (!topFull && isPanel(o));
        if (tick && !o.update(dt)) this.overlays.splice(i, 1);
      }
      this.settlePanels();
      if (this.overlays.some((o) => o.blocks)) { this.hud.update(dt, w); return; }
    } else if (this.choosing.size || this.choiceQueue.size) this.settlePanels();
    if (G.input.pressed('pause') && !out) {
      // co-op: the menu shows the opener's build and offers them "Leave" (GDD2 §5.1)
      const by = w.players.find((q) => q.input.kind !== 'bot' && q.input.pressed('pause')) ?? p;
      const slot = by.slot;
      this.buildSlot = slot;
      this.leaveItem = devices.humans.length > 1 && by.input.kind !== 'bot' ? { label: slotText('leaveHand', slot, true), act: () => this.leaveHand(slot) } : undefined;
      this.overlays.push(new PauseMenu(this));
      return;
    }
    if (G.input.pressed('info') && !out) {
      // the pocket-watch button: your own build (co-op: whoever pressed it, unless they are
      // holding it to read a choice card)
      const by = w.players.find((q) => q.input.pressed('info')) ?? p;
      if (!this.panelOf(by.slot)) { this.overlays.push(new RunInfoPanel(this.run, by.slot, w.playerCount > 1 && by.input.kind !== 'bot' ? by.input : undefined)); return; }
    }
    w.update(dt);
    if (!w.frozen && !this.cleared) w.bus.emit('tick', { dt });
    if (this.boss) {
      // intro: camera on the boss, player waits
      if (this.boss.inIntro) { w.cam.follow(this.boss.x, this.boss.y - 30, dt, 4); this.hud.update(dt, w); this.postFx(dt, p); return; }
      // after the intro everyone walks again — except a hand still choosing (a catch-up pick)
      if (!this.cleared) for (const pl of w.players) if (pl.locked && !this.choosing.has(pl)) pl.locked = false;
      if (this.boss.phase !== this.bossPhase) { this.bossPhase = this.boss.phase; Hints.hold(4); }
      if (!this.cleared && this.boss.dead) { this.cleared = true; this.onClear(); }
      G.music.layer('boss', this.boss.phase > 0 && !this.boss.dead ? 1 : 0, this.boss.dead ? 4 : 2);
    } else if (!this.cleared && w.alive().length > 0) {
      const alive = w.aliveEnemies.length;
      if (this.waveIdx < 0 || (alive <= (this.waveIdx < this.waves.length - 1 ? 1 : 0) && this.waveIdx < this.waves.length - 1)) {
        // nobody gets ambushed while picking a card (co-op catch-up picks at a room's start)
        if (!this.anyChoosing()) this.waveDelay -= dt;
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

  // ───────────────────────── joining & leaving mid-run (GDD2 §5.1) ─────────────────────────
  /** PauseHost: whose build the pause menu shows, and the co-op "Leave" row */
  buildSlot = 0;
  leaveItem?: { label: L10n; act: () => void };

  /** "Hand II joins at the next room" / "has left" plates (UI layer, top-centre) */
  private banners = new SlotBanners();

  /**
   * A free pad (A / Start) or keyboard (Enter) joins mid-run (next to a solo player: held for
   * devices.JOIN_HOLD, so a solo player picking up another device just keeps playing): the seat is
   * taken now (the press does nothing else), the hand walks in at the next room with a fresh
   * loadout and catches up with one memory pick per floor already climbed. Its pod waits in its
   * corner until then.
   */
  private midRunJoin() {
    if (this.deathT > 0 || this.leaving) return;
    // a lost pad's "continue without them" (Start) is not a join
    if (this.overlays.some((o) => o instanceof DisconnectOverlay)) return;
    const id = devices.joinPressed({ split: false });
    if (!id) return;
    const slot = devices.freeSlot();
    if (slot < 0) return;
    if (!joinSeat(id, slot)) return;
    // the newcomer brings the weapon its seat took from the workshop rack
    const cfg = this.run.config.players;
    if (!cfg.some((pc) => pc.slot === slot) && !this.run.loadouts[slot]) cfg.push({ slot, device: id, hand: 'tick', weapon: SeatWeapons.get(slot) });
    this.run.away.delete(slot);
    this.run.recompute();
    this.hud.pending.push(slot);
    this.banners.show(slot, slotText('joinsNext', slot), 3.2);
    sfx('cogWind');
  }

  /** a hand leaves the run (pause menu, or a lost pad the others gave up on); its build is kept */
  leaveHand(slot: number) {
    const w = this.world;
    const p = w.players.find((q) => q.slot === slot);
    if (p) {
      p.syncRun();
      for (const e of p.echoes) e.kill();
      w.fx.ring(p.x, p.y - 8, 3, 24, 0.4, p.color, 2);
      p.kill();
      this.choosing.delete(p);
      w.players = w.players.filter((q) => q !== p);
      // the one hand left behind is solo now: stopped → its Last Second, a ghost → wound up
      if (w.players.length === 1) Down.nowSolo(w.players[0]);
    }
    this.run.away.add(slot);
    this.run.recompute();
    this.banners.show(slot, slotText('left', slot), 2.2, true);
    for (let i = this.overlays.length - 1; i >= 0; i--) { const o = this.overlays[i]; if (o instanceof ChoiceOverlay && o.place?.slot === slot) this.overlays.splice(i, 1); }
    this.choiceQueue.delete(slot);
    this.hud.pending = this.hud.pending.filter((s) => s !== slot);
    leaveSeat(slot);
    sfx('uiBack');
  }

  /** a joined pad went away: pause until it is back, or drop that hand (DeviceLossHost) */
  onDeviceLost(slot: number) {
    if (this.overlays.some((o) => o instanceof DisconnectOverlay && o.slot === slot)) return;
    this.overlays.push(new DisconnectOverlay(slot, (s) => this.leaveHand(s)));
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
    if (this.world.playerCount > 1) renderCoopEdges(ctx, this.world, this.coop, { boss: !!this.hud.boss });
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
      // the onboarding's death card (F4b) says it all in its own layout: the dim stays, these words step aside
      if (!Onboard.deathCard.active()) {
        G.font.draw(ctx, tr(UI.stopped), 320, 150, { align: 'center', color: 'R3', outline: 'K0' });
        if (this.world.playerCount > 1) Text.draw(ctx, S('f2', 'allStopped'), 320, 178, { align: 'center', color: 'K9', outline: 'K0' });
        if (this.deathT > 2.4) G.font.draw(ctx, tr(UI.retry), 320, 196, { align: 'center', color: Math.floor(this.t * 2) % 2 ? 'K10' : 'K8' });
      }
      ctx.globalAlpha = 1;
    }
    if (!blocking) this.banners.render(ctx, this.world.playerCount > 1 || this.hud.pending.length ? 40 : 30);
    for (const o of this.overlays) o.render(r);
    // a free device holding its join button next to a solo player
    renderJoinHold(ctx, { cy: 62 });
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
