// 钟匠工坊 The Clockmaker's Workshop — the hub between runs.
import type { Scene } from '../../engine/scene';
import type { Renderer } from '../../engine/gfx/renderer';
import { G, sfx } from '../G';
import { Run } from '../run';
import { World } from '../world/world';
import { generateRoom } from '../world/roomgen';
import type { Theme } from '../../art/themes';
import { TS } from '../world/room';
import { Player } from '../entities/player';
import { Entity } from '../entities/entity';
import { Interactable } from '../entities/interact';
import { WallLamp } from '../entities/props';
import { Door } from '../entities/door';
import { HUD } from '../ui/hud';
import { RNG, frand } from '../../engine/rng';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { buildInes, buildInesPortrait, buildTickPortrait, CAT, GRANDFATHER_CLOCK, PENDULUM_BOB, WEAPON_RACK, LEDGER_STAND, MAINSPRING_BENCH } from '../../art/sprites/hub';
import { Overlay } from '../ui/overlay';
import { DialogueOverlay, DLine } from '../ui/dialogue';
import { MainspringOverlay, WeaponOverlay, LedgerOverlay } from '../ui/metaPanels';
import { PauseMenu } from '../ui/pause';
import { profile, saveProfile } from '../save';
import { INES_STORY, INES_IDLE, DEATH_LINES } from '../story';
import { tr, L } from '../i18n';
import { col } from '../../art/palette';
import { damp } from '../../engine/math';
import { ICONS } from '../../art/sprites/icons';
import { shardIcon } from '../ui/draw';
import { Text } from '../ui/text';
import { devices } from '../../engine/devices';
import type { PlayerInput } from '../../engine/input';
import { ensurePlayers, slotColor, ROMAN } from '../players';

export const HUB_THEME: Theme = {
  id: 99, key: 'workshop', name: { zh: '钟匠工坊', en: "The Clockmaker's Workshop" },
  ambient: '#3c3040', clear: '#07060d',
  grade: { tint: [1.04, 1.0, 0.95], lift: [0.03, 0.01, 0.0], sat: 1, contrast: 1.03 },
  slab: ['B0', 'B1', 'S0', 'B2', 'S1'], seam: 'K1',
  grime: ['R0', 'R1', 'B1'], grimeAmount: 0.18,
  plate: ['R0', 'R1', 'R2', 'B4'], plateAmount: 0.25,
  wallBrick: ['R0', 'B0', 'R1', 'B1'], wallMortar: 'K1', wallLip: ['B2', 'B3', 'B4'],
  cap: ['K0', 'B0', 'K1'], capTrim: 'B3',
  pitWater: ['U0', 'U1', 'T1', 'T2', 'U3'], pitFace: ['K4', 'K3', 'K2', 'K1'],
  lamp: 'O3', lampLight: 'O2', dust: 'O3', music: 'hub',
};

let INES: Sprite[] | null = null;
let PORTRAIT: { ines: Sprite; inesTalk: Sprite; tick: Sprite } | null = null;
const portraits = () => (PORTRAIT ??= { ines: buildInesPortrait(0), inesTalk: buildInesPortrait(1), tick: buildTickPortrait() });

class Ines extends Interactable {
  t = 0;
  constructor(x: number, y: number, private hub: HubScene) { super(); this.x = x; this.y = y; INES ??= buildInes(); this.range = 24; }
  prompt() { return tr(L('伊妮丝', 'Ines')); }
  interact() { this.hub.talk(); }
  update(dt: number) { this.t += dt; super.update(dt); }
  renderGround(r: Renderer) { r.w.fillStyle = 'rgba(11,10,20,0.45)'; r.w.beginPath(); r.w.ellipse(Math.round(this.x), Math.round(this.y), 7, 3, 0, 0, Math.PI * 2); r.w.fill(); }
  render(r: Renderer) {
    const p = this.world.player;
    const blink = Math.floor(this.t * 0.6) % 6 === 0 && (this.t * 0.6) % 1 < 0.15;
    const f = blink ? INES![3] : INES![Math.floor(this.t * 2) % 3];
    drawSprite(r.w, f, this.x, this.y, { flip: !!p && p.x < this.x });
  }
  renderUnlit(r: Renderer) {
    super.renderUnlit(r);
    if (this.hub.hasStory() && !this.near) {
      const y = this.y - 34 + Math.round(Math.sin(this.t * 4) * 1.5);
      r.u.fillStyle = col('K0'); r.u.fillRect(Math.round(this.x) - 2, y - 1, 5, 10);
      r.u.fillStyle = col('B5'); r.u.fillRect(Math.round(this.x) - 1, y, 3, 5); r.u.fillRect(Math.round(this.x) - 1, y + 6, 3, 2);
    }
  }
}

class Station extends Interactable {
  constructor(x: number, y: number, private spr: Sprite, private label: () => string, private open: () => void, private light = 'O3') { super(); this.x = x; this.y = y; this.range = 26; }
  prompt() { return this.label(); }
  interact() { this.open(); }
  renderGround(r: Renderer) { r.w.fillStyle = 'rgba(11,10,20,0.4)'; r.w.fillRect(Math.round(this.x - this.spr.w / 2), Math.round(this.y) - 1, this.spr.w, 3); }
  render(r: Renderer) { drawSprite(r.w, this.spr, this.x, this.y); r.lightAt(this.x, this.y - 14, 50, this.light, 0.35); }
}

class Cat extends Entity {
  t = 0;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; }
  update(dt: number) {
    this.t += dt;
    if (Math.floor(this.t * 0.7) !== Math.floor((this.t - dt) * 0.7)) this.world.fx.banner(this.x + 8, this.y - 14, 'z', 'K7', 1.4);
  }
  render(r: Renderer) {
    // cushion
    r.w.fillStyle = col('R1'); r.w.fillRect(Math.round(this.x) - 10, Math.round(this.y) - 3, 20, 4);
    r.w.fillStyle = col('R2'); r.w.fillRect(Math.round(this.x) - 10, Math.round(this.y) - 3, 20, 1);
    drawSprite(r.w, CAT[Math.floor(this.t * 0.8) % 2], this.x, this.y - 2, { sy: 1 + Math.sin(this.t * 2) * 0.03 });
  }
}

class GrandClock extends Entity {
  t = frand(0, 3);
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; }
  update(dt: number) {
    const prev = Math.sin(this.t * Math.PI);
    this.t += dt;
    if (Math.sign(prev) !== Math.sign(Math.sin(this.t * Math.PI))) sfx('step', { vol: 0.12 });
  }
  render(r: Renderer) {
    drawSprite(r.w, GRANDFATHER_CLOCK, this.x, this.y);
    const a = Math.sin(this.t * Math.PI) * 0.35;
    const px = this.x, py = this.y - 21;
    r.w.fillStyle = col('B3');
    for (let k = 0; k < 9; k++) r.w.fillRect(Math.round(px + Math.sin(a) * k), Math.round(py + Math.cos(a) * k), 1, 1);
    drawSprite(r.w, PENDULUM_BOB, px + Math.sin(a) * 10, py + Math.cos(a) * 10);
  }
}

/** wall shelf crowded with little clocks, jars and gears */
class WallShelf extends Entity {
  items: { kind: number; x: number; c: string }[] = [];
  t = frand(0, 9);
  constructor(x: number, y: number, seed: number) {
    super();
    this.x = x; this.y = y; this.sortBias = TS + 4;
    let px = -22;
    let k = seed;
    while (px < 20) {
      k = (k * 9301 + 49297) % 233280;
      const kind = k % 4;
      this.items.push({ kind, x: px, c: ['B4', 'R2', 'T3', 'K8', 'U3'][k % 5] });
      px += kind === 0 ? 9 : kind === 1 ? 6 : 7;
    }
  }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const ctx = r.w, x = Math.round(this.x), y = Math.round(this.y);
    for (const it of this.items) {
      const ix = x + it.x;
      if (it.kind === 0) { // little clock
        ctx.fillStyle = col('K0'); ctx.fillRect(ix - 1, y - 9, 9, 9);
        ctx.fillStyle = col('B3'); ctx.fillRect(ix, y - 8, 7, 7);
        ctx.fillStyle = col('K10'); ctx.fillRect(ix + 1, y - 7, 5, 5);
        const a = this.t * (1 + (ix & 3));
        ctx.fillStyle = col('K1'); ctx.fillRect(ix + 3, y - 5, 1, 1); ctx.fillRect(ix + 3 + Math.round(Math.cos(a) * 2), y - 5 + Math.round(Math.sin(a) * 2), 1, 1);
      } else if (it.kind === 1) { // jar
        ctx.fillStyle = col('K0'); ctx.fillRect(ix - 1, y - 8, 6, 8);
        ctx.fillStyle = col(it.c); ctx.fillRect(ix, y - 6, 4, 6);
        ctx.fillStyle = col('K9'); ctx.fillRect(ix, y - 7, 4, 1); ctx.fillRect(ix, y - 6, 1, 3);
      } else if (it.kind === 2) { // gear on a stand
        ctx.fillStyle = col('K0'); ctx.fillRect(ix - 1, y - 8, 7, 8);
        ctx.fillStyle = col('B4'); ctx.fillRect(ix, y - 7, 5, 5);
        ctx.fillStyle = col('B2'); ctx.fillRect(ix + 2, y - 5, 1, 1); ctx.fillRect(ix + 2, y - 2, 1, 2);
      } else { // books
        for (let b = 0; b < 3; b++) { ctx.fillStyle = col('K0'); ctx.fillRect(ix + b * 2 - 1, y - 9 + (b & 1), 3, 9 - (b & 1)); ctx.fillStyle = col(['R2', 'U2', 'G2'][b]); ctx.fillRect(ix + b * 2, y - 8 + (b & 1), 1, 8 - (b & 1)); }
      }
    }
    // the plank
    ctx.fillStyle = col('K0'); ctx.fillRect(x - 25, y, 50, 4);
    ctx.fillStyle = col('B2'); ctx.fillRect(x - 24, y, 48, 2);
    ctx.fillStyle = col('B3'); ctx.fillRect(x - 24, y, 48, 1);
    ctx.fillStyle = col('B1'); ctx.fillRect(x - 20, y + 2, 2, 3); ctx.fillRect(x + 18, y + 2, 2, 3);
  }
}

/** a cluttered desk with a half-assembled clock and a lamp */
class Desk extends Entity {
  t = 0;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; }
  update(dt: number) { this.t += dt; }
  renderGround(r: Renderer) { r.w.fillStyle = 'rgba(11,10,20,0.4)'; r.w.fillRect(Math.round(this.x) - 18, Math.round(this.y) - 1, 36, 3); }
  render(r: Renderer) {
    const ctx = r.w, x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = col('K0'); ctx.fillRect(x - 19, y - 16, 38, 17);
    ctx.fillStyle = col('B2'); ctx.fillRect(x - 18, y - 15, 36, 4);
    ctx.fillStyle = col('B3'); ctx.fillRect(x - 18, y - 15, 36, 1);
    ctx.fillStyle = col('B1'); ctx.fillRect(x - 17, y - 11, 3, 11); ctx.fillRect(x + 14, y - 11, 3, 11);
    // open clock on the desk
    ctx.fillStyle = col('K0'); ctx.fillRect(x - 9, y - 23, 12, 9);
    ctx.fillStyle = col('B4'); ctx.fillRect(x - 8, y - 22, 10, 7);
    ctx.fillStyle = col('B6'); ctx.fillRect(x - 6, y - 20, 2, 2); ctx.fillRect(x - 2, y - 19, 3, 3);
    // desk lamp
    ctx.fillStyle = col('K0'); ctx.fillRect(x + 6, y - 28, 7, 13);
    ctx.fillStyle = col('T2'); ctx.fillRect(x + 7, y - 27, 5, 3);
    ctx.fillStyle = col('K5'); ctx.fillRect(x + 9, y - 24, 1, 9);
    ctx.fillStyle = col('O4'); ctx.fillRect(x + 8, y - 24, 3, 1);
    r.lightAt(x + 9, y - 20, 60, 'O3', 0.55);
    // scattered screws
    ctx.fillStyle = col('K8'); ctx.fillRect(x - 14, y - 14, 1, 1); ctx.fillRect(x + 2, y - 13, 1, 1);
  }
}

class Plant extends Entity {
  t = frand(0, 9);
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; }
  update(dt: number) { this.t += dt; }
  render(r: Renderer) {
    const ctx = r.w, x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = col('K0'); ctx.fillRect(x - 5, y - 7, 10, 7);
    ctx.fillStyle = col('R1'); ctx.fillRect(x - 4, y - 6, 8, 6);
    ctx.fillStyle = col('R2'); ctx.fillRect(x - 4, y - 6, 8, 1);
    const sway = Math.round(Math.sin(this.t * 1.2));
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.45;
      for (let k = 2; k < 10 - Math.abs(i - 2.5); k++) {
        ctx.fillStyle = col(k > 6 ? 'G3' : 'G2');
        ctx.fillRect(x + Math.round(Math.cos(a) * k) + (k > 5 ? sway : 0), y - 7 + Math.round(Math.sin(a) * k), 1, 1);
      }
    }
  }
}

class Fireplace extends Entity {
  t = 0;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.sortBias = TS + 5; }
  update(dt: number) {
    this.t += dt;
    if (frand() < 0.6) this.world.particles.spawn({ kind: 'px', x: this.x + frand(-8, 8), y: this.y - 4, vy: frand(-35, -15), vx: frand(-4, 4), life: frand(0.3, 0.6), ramp: ['O4', 'O3', 'O2', 'O1'], layer: 'glow', size: 1.5 });
  }
  render(r: Renderer) {
    const ctx = r.w, x = Math.round(this.x), y = Math.round(this.y);
    // stone surround and mantel
    ctx.fillStyle = col('K0'); ctx.fillRect(x - 20, y - 30, 40, 31);
    for (let j = 0; j < 30; j += 5) for (let i = 0; i < 38; i += 8) { ctx.fillStyle = col(((i + j) >> 2) & 1 ? 'K5' : 'K4'); ctx.fillRect(x - 19 + i + ((j / 5) & 1) * 4, y - 29 + j, 7, 4); }
    ctx.fillStyle = col('B2'); ctx.fillRect(x - 22, y - 32, 44, 4);
    ctx.fillStyle = col('B4'); ctx.fillRect(x - 22, y - 32, 44, 1);
    // candles on the mantel
    for (const cx of [x - 16, x + 15]) { ctx.fillStyle = col('K10'); ctx.fillRect(cx, y - 37, 2, 5); ctx.fillStyle = col(Math.sin(this.t * 13 + cx) > 0 ? 'O4' : 'O3'); ctx.fillRect(cx, y - 39, 2, 2); r.lightAt(cx, y - 38, 26, 'O3', 0.4); }
    ctx.fillStyle = col('K0'); ctx.fillRect(x - 12, y - 20, 24, 20);
    ctx.fillStyle = col('K1'); ctx.fillRect(x - 11, y - 19, 22, 19);
    const f = 0.85 + Math.sin(this.t * 11) * 0.08 + Math.sin(this.t * 23) * 0.05;
    for (let i = 0; i < 6; i++) {
      const h = Math.round((6 + Math.sin(this.t * 7 + i * 1.7) * 3) * f);
      ctx.fillStyle = col(i % 2 ? 'O2' : 'O3'); ctx.fillRect(x - 8 + i * 3, y - h - 1, 2, h);
    }
    ctx.fillStyle = col('O4'); ctx.fillRect(x - 3, y - 4, 6, 3);
    r.lightAt(this.x, this.y - 6, 160 * f, 'O2', 0.85);
    r.glowAt(this.x, this.y - 6, 14, 'O3', 0.35 * f);
  }
}

/** Overwind lever: unlocked by winning; raises difficulty and shard rewards */
class OverwindLever extends Interactable {
  t = 0;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.range = 22; }
  prompt() { return tr(L(`超频：${profile.overwind} / ${profile.maxOverwind}`, `Overwind: ${profile.overwind} / ${profile.maxOverwind}`)); }
  interact() {
    profile.overwind = (profile.overwind + 1) % (profile.maxOverwind + 1);
    saveProfile();
    sfx(profile.overwind ? 'cogWind' : 'uiBack');
    this.world.fx.banner(this.x, this.y - 44, profile.overwind
      ? tr(L(`敌人生命 +${15 * profile.overwind}%，伤害 +${10 * profile.overwind}%，碎片 +${20 * profile.overwind}%`, `Enemy HP +${15 * profile.overwind}%, damage +${10 * profile.overwind}%, shards +${20 * profile.overwind}%`))
      : tr(L('超频关闭', 'Overwind off')), profile.overwind ? 'R4' : 'K8', 2);
  }
  update(dt: number) { this.t += dt; super.update(dt); }
  render(r: Renderer) {
    const ctx = r.w, x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = col('K0'); ctx.fillRect(x - 7, y - 10, 14, 10);
    ctx.fillStyle = col('K4'); ctx.fillRect(x - 6, y - 9, 12, 8);
    const a = -Math.PI / 2 - 0.9 + (profile.overwind / Math.max(1, profile.maxOverwind)) * 1.8;
    ctx.strokeStyle = col('K0'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + Math.cos(a) * 12, y - 6 + Math.sin(a) * 12); ctx.stroke();
    ctx.strokeStyle = col('B4'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + Math.cos(a) * 12, y - 6 + Math.sin(a) * 12); ctx.stroke();
    ctx.fillStyle = col('R3'); ctx.fillRect(Math.round(x + Math.cos(a) * 12) - 1, Math.round(y - 6 + Math.sin(a) * 12) - 1, 3, 3);
    r.lightAt(x, y - 6, 30, profile.overwind ? 'R3' : 'B4', 0.4);
  }
}

export interface HubHooks { startRun(): void; title(): void }

export class HubScene implements Scene {
  world!: World;
  hud = new HUD();
  overlays: Overlay[] = [];
  run: Run;
  t = 0;
  private storyIdx: number;
  private greeted = false;
  onQuit?: (run: Run) => void;

  constructor(private hooks: HubHooks, private context: 'start' | 'death' | 'victory' | 'quit' = 'start') {
    this.run = new Run(1);
    this.run.brass = 0;
    this.storyIdx = profile.ines;
  }

  hasStory() { return this.storyIdx < INES_STORY.length && INES_STORY[this.storyIdx].cond(); }

  bankStats() {}

  talk() {
    const P = portraits();
    const toLine = (l: { who: 'ines' | 'tick'; text: { zh: string; en: string } }): DLine => l.who === 'ines'
      ? { name: L('伊妮丝', 'Ines'), portrait: P.ines, portraitTalk: P.inesTalk, text: l.text, color: 'B5' }
      : { name: L('滴答', 'Tick'), portrait: P.tick, text: l.text, color: 'R4', right: true };
    if (this.hasStory()) {
      const lines = INES_STORY[this.storyIdx].lines.map(toLine);
      this.storyIdx++;
      profile.ines = this.storyIdx;
      saveProfile();
      this.overlays.push(new DialogueOverlay(lines));
    } else {
      const pool = this.context === 'death' && !this.greeted ? DEATH_LINES : INES_IDLE;
      this.overlays.push(new DialogueOverlay([toLine({ who: 'ines', text: pool[Math.floor(Math.random() * pool.length)] })]));
    }
    this.greeted = true;
  }

  enter() {
    const map = generateRoom({ rng: new RNG(7), kind: 'hub', biome: 0, exits: 1 });
    const w = new World(map, HUB_THEME, 7);
    w.run = this.run;
    this.world = w;
    for (const p of map.props) if (p.type === 'walllamp') w.add(new WallLamp(p.tx, p.ty, 'O3', 'O2'));
    const c = { x: map.pw / 2, y: map.ph / 2 + 8 };
    // furniture
    w.add(new Ines(c.x - 60, c.y - 30, this));
    w.add(new Station(c.x + 70, c.y - 34, MAINSPRING_BENCH, () => tr(L('发条台', 'Mainspring')), () => this.overlays.push(new MainspringOverlay()), 'B5'));
    w.add(new Station(c.x - 150, c.y + 10, WEAPON_RACK, () => tr(L('武器架', 'Weapon Rack')), () => this.overlays.push(new WeaponOverlay())));
    w.add(new Station(c.x + 150, c.y + 14, LEDGER_STAND, () => tr(L('账簿', 'Ledger')), () => this.overlays.push(new LedgerOverlay())));
    w.add(new Cat(c.x - 20, c.y + 40));
    if (profile.maxOverwind > 0) w.add(new OverwindLever(c.x + 40, c.y - 40));
    const top = map.exits[0] ? (map.exits[0].ty + 1) * TS : 64;
    w.add(new GrandClock(c.x - 200, top + 26));
    w.add(new GrandClock(c.x + 200, top + 26));
    w.add(new Fireplace(c.x - 110, top - 4));
    // shelves along the back wall, a desk beside Ines, plants in the corners
    for (const sx of [c.x - 190, c.x - 40, c.x + 90, c.x + 170]) w.add(new WallShelf(sx, top - 14, Math.round(sx)));
    w.add(new Desk(c.x - 92, c.y - 24));
    w.add(new Plant(c.x - 210, c.y + 70));
    w.add(new Plant(c.x + 214, c.y + 64));
    w.add(new Plant(c.x + 40, top + 10));
    for (const e of map.exits) {
      w.add(new Door(e, { icon: ICONS.boss, label: tr(L('钟塔', 'The Tower')), color: 'B5' }, () => this.depart()));
    }
    // seated players stand in a row below the bench (solo: exactly the 1.0 spot)
    const seats = ensurePlayers();
    seats.forEach((inp, i) => w.add(new Player(c.x + (seats.length > 1 ? (i - (seats.length - 1) / 2) * 22 : 0), c.y + 60, inp)));
    this.clocks = [c.x - 200, c.x + 200].map((x) => ({ x, y: top + 26 }));
    w.cam.snap(c.x, c.y);
    w.flushAdds();
    for (const d of w.entities) if (d instanceof Door) d.unlock();
    G.music.play('hub', 1.5);
    G.r.params.lighting = true;
    // first visit: Ines speaks up shortly after you arrive
    if (this.context === 'start' && this.hasStory() && profile.ines === 0) this.talkIn = 0.9;
  }

  private depart() {
    for (const p of this.world.players) p.locked = true;
    this.hooks.startRun();
  }

  /** the two grandfather clocks a newly joined hand steps out of */
  private clocks: { x: number; y: number }[] = [];

  /**
   * Hot join (GDD2 §5.1), minimal F2a version: a free pad pressing A / Start, or Enter on a free
   * keyboard, seats a new hand who steps out of a grandfather clock. F2c adds the clock-door
   * animation, the HUD pod, leaving (hold View / Esc) and the title's join panel.
   */
  private hotJoin() {
    const id = devices.joinPressed({ split: false });
    if (!id) return;
    const slot = devices.freeSlot();
    if (slot < 0) return;
    const inp = devices.claim(id, slot);
    for (const a of ['confirm', 'dash', 'pause', 'attack'] as const) inp.consume(a);
    this.spawnJoined(inp);
  }

  private spawnJoined(inp: PlayerInput) {
    const w = this.world;
    // II and IV step out of the left clock, III out of the right one (IV a step further in)
    const left = inp.slot % 2 === 1;
    const k = this.clocks[left ? 0 : 1] ?? { x: w.map.pw / 2, y: w.map.ph / 2 };
    const p = w.add(new Player(k.x + (inp.slot >= 3 ? 20 : 0) * (left ? 1 : -1), k.y + 14, inp));
    w.flushAdds();
    p.invuln = 0.6;
    w.fx.ring(p.x, p.y - 8, 3, 26, 0.45, slotColor(inp.slot), 2);
    w.fx.burst(p.x, p.y - 10, 18, ['W', slotColor(inp.slot)], 120, 0.45);
    w.fx.banner(p.x, p.y - 34, tr(L(`第${['一', '二', '三', '四'][inp.slot]}根指针醒了`, `Hand ${ROMAN[inp.slot]} wakes`)), slotColor(inp.slot), 1.8);
    sfx('cogWind');
  }

  private talkIn = -1;

  update(dt: number) {
    this.t += dt;
    // Ines's first line waits while a menu is open (the countdown would otherwise run out under it)
    if (this.talkIn > 0 && !this.overlays.length && (this.talkIn -= dt) <= 0) this.talk();
    const w = this.world;
    const p = w.player!;
    if (this.overlays.length) {
      const o = this.overlays[this.overlays.length - 1];
      if (!o.update(dt)) this.overlays.pop();
      return;
    }
    if (G.input.pressed('pause')) { this.overlays.push(new PauseMenu({ run: this.run, overlays: this.overlays, onQuit: () => this.hooks.title(), bankStats: () => {}, inHub: true })); return; }
    this.hotJoin();
    w.update(dt);
    // keep everyone topped up in the workshop
    for (const q of w.players) q.hp = q.maxHp;
    this.run.charges = this.run.mods.rewindCharges;
    let fx = p.rewindFx;
    if (w.playerCount > 1) {
      let cx = 0, cy = 0;
      for (const q of w.players) { cx += q.x; cy += q.y; fx = Math.max(fx, q.rewindFx); }
      w.cam.follow(cx / w.playerCount, cy / w.playerCount - 10, dt, 6);
    } else w.cam.follow(p.x, p.y - 10, dt, 6);
    const pp = G.r.params;
    pp.rewind = damp(pp.rewind, fx, 18, dt);
    pp.ca = pp.rewind * 2.2;
  }

  render(r: Renderer) {
    const pp = r.params;
    const th = HUB_THEME;
    pp.tint = th.grade.tint; pp.lift = th.grade.lift; pp.saturation = th.grade.sat * (this.overlays.length ? 0.6 : 1); pp.contrast = th.grade.contrast;
    pp.vignette = 0.45; pp.bloom = 0.5; pp.bloomThreshold = 0.6; pp.lighting = true; pp.hurt = 0; pp.fade = 0;
    this.world.render(r);
    r.flushWorldUi();
    const ctx = r.ui2;
    // workshop name and shard counter; the full-screen station panels draw their own header over this area
    const panelOpen = this.overlays.some((o) => o instanceof MainspringOverlay || o instanceof WeaponOverlay || o instanceof LedgerOverlay);
    if (!panelOpen) {
      shardIcon(ctx, 624, 11);
      G.digits.draw(ctx, String(profile.shards), 621, 15 - 4.5 * Text.k, { fill: 'V4', align: 'right' });
      Text.draw(ctx, HUB_THEME.name, 10, 15, { size: 'small', color: 'B4', valign: 'middle' });
    }
    for (const o of this.overlays) o.render(r);
  }
}
