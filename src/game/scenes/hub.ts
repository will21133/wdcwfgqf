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

class Fireplace extends Entity {
  t = 0;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; this.sortBias = TS + 5; }
  update(dt: number) {
    this.t += dt;
    if (frand() < 0.6) this.world.particles.spawn({ kind: 'px', x: this.x + frand(-8, 8), y: this.y - 4, vy: frand(-35, -15), vx: frand(-4, 4), life: frand(0.3, 0.6), ramp: ['O4', 'O3', 'O2', 'O1'], layer: 'glow', size: 1.5 });
  }
  render(r: Renderer) {
    const ctx = r.w, x = Math.round(this.x), y = Math.round(this.y);
    ctx.fillStyle = col('K0'); ctx.fillRect(x - 15, y - 22, 30, 22);
    ctx.fillStyle = col('K5'); ctx.fillRect(x - 14, y - 21, 28, 3);
    ctx.fillStyle = col('K4'); ctx.fillRect(x - 14, y - 18, 4, 18); ctx.fillRect(x + 10, y - 18, 4, 18);
    ctx.fillStyle = col('K1'); ctx.fillRect(x - 10, y - 18, 20, 18);
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
    const top = map.exits[0] ? (map.exits[0].ty + 1) * TS : 64;
    w.add(new GrandClock(c.x - 200, top + 26));
    w.add(new GrandClock(c.x + 200, top + 26));
    w.add(new Fireplace(c.x - 110, top - 4));
    for (const e of map.exits) {
      w.add(new Door(e, { icon: ICONS.boss, label: tr(L('钟塔', 'The Tower')), color: 'B5' }, () => this.depart()));
    }
    const p = new Player(c.x, c.y + 60);
    w.add(p);
    w.cam.snap(c.x, c.y);
    w.flushAdds();
    for (const d of w.entities) if (d instanceof Door) d.unlock();
    G.music.play('hub', 1.5);
    G.r.params.lighting = true;
    if (this.context === 'start' && this.hasStory() && profile.ines === 0) setTimeout(() => this.talk(), 900);
  }

  private depart() {
    this.world.player!.locked = true;
    this.hooks.startRun();
  }

  update(dt: number) {
    this.t += dt;
    const w = this.world;
    const p = w.player!;
    if (this.overlays.length) {
      const o = this.overlays[this.overlays.length - 1];
      if (!o.update(dt)) this.overlays.pop();
      return;
    }
    if (G.input.pressed('pause')) { this.overlays.push(new PauseMenu({ run: this.run, overlays: this.overlays, onQuit: () => this.hooks.title(), bankStats: () => {} })); return; }
    w.update(dt);
    // keep the player topped up in the workshop
    p.hp = p.maxHp; this.run.charges = this.run.mods.rewindCharges;
    w.cam.follow(p.x, p.y - 10, dt, 6);
    const pp = G.r.params;
    pp.rewind = damp(pp.rewind, p.rewindFx, 18, dt);
    pp.ca = pp.rewind * 2.2;
  }

  render(r: Renderer) {
    const pp = r.params;
    const th = HUB_THEME;
    pp.tint = th.grade.tint; pp.lift = th.grade.lift; pp.saturation = th.grade.sat * (this.overlays.length ? 0.6 : 1); pp.contrast = th.grade.contrast;
    pp.vignette = 0.45; pp.bloom = 0.5; pp.bloomThreshold = 0.6; pp.lighting = true; pp.hurt = 0; pp.fade = 0;
    this.world.render(r);
    const ctx = r.ui2;
    // shard counter
    shardIcon(ctx, 610, 10);
    ctx.drawImage(G.digitsSmall.render(String(profile.shards), 'V4', 'K0'), 608 - G.digitsSmall.render(String(profile.shards), 'V4', 'K0').width, 11);
    G.small.draw(ctx, tr(HUB_THEME.name), 10, 10, { color: 'B4' });
    for (const o of this.overlays) o.render(r);
  }
}
