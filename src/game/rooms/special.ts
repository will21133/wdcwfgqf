// Non-combat rooms: Manman's shop, repair station, frozen-moment events, echo-puzzle vaults.
import type { World } from '../world/world';
import type { Run } from '../run';
import type { RNG } from '../../engine/rng';
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from '../ui/overlay';
import type { Choice } from '../progression/rewards';
import type { Patron } from '../progression/memories';
import type { PartDef } from '../progression/parts';
import { Entity } from '../entities/entity';
import { Interactable, Chest } from '../entities/interact';
import { drawSprite, Sprite } from '../../engine/gfx/sprite';
import { buildManman, CITIZENS, EVENT_OBJECTS, WORKBENCH, PLATE, PEDESTAL } from '../../art/sprites/npcs';
import { ICONS, patronSigil } from '../../art/sprites/icons';
import { rollPart, partLook, pickPatron } from '../progression/rewards';
import { MEMORIES, PATRONS } from '../progression/memories';
import { EVENTS, EventDef } from '../progression/events';
import { EventOverlay } from '../ui/eventOverlay';
import { G, sfx } from '../G';
import { tr, L, L10n, UI } from '../i18n';
import { TS, T } from '../world/room';
import { col } from '../../art/palette';
import { frand } from '../../engine/rng';
import { Text } from '../ui/text';
import { drawPanel } from '../ui/widgets';
import { rect } from '../ui/draw';

export interface RoomHost {
  world: World;
  run: Run;
  rng: RNG;
  openOverlay(o: Overlay): void;
  openChoice(choices: Choice[], header: { title: L10n; sub?: L10n; quote?: L10n; icon?: Sprite; color: string }, after?: () => void): void;
  offerMemory(patron: Patron, boost?: number): void;
  offerHourglass(): void;
  offerCalibration(): void;
  grantPart(p: PartDef): void;
  toast(icon: Sprite | null, title: string, desc: string, color?: string): void;
  unlockDoors(): void;
  center(): { x: number; y: number };
}

// ───────────────────────── Shop ─────────────────────────
let MANMAN: Sprite[] | null = null;

class Manman extends Entity {
  t = 0; say: string; sayT = 4;
  constructor(x: number, y: number) {
    super();
    MANMAN ??= buildManman();
    this.x = x; this.y = y;
    this.say = tr(SHOP_LINES[Math.floor(Math.random() * SHOP_LINES.length)]);
  }
  update(dt: number) { this.t += dt; this.sayT -= dt; }
  renderGround(r: Renderer) { r.w.fillStyle = 'rgba(11,10,20,0.45)'; r.w.beginPath(); r.w.ellipse(Math.round(this.x), Math.round(this.y), 13, 4, 0, 0, Math.PI * 2); r.w.fill(); }
  render(r: Renderer) {
    drawSprite(r.w, MANMAN![Math.floor(this.t * 2) % 4], this.x, this.y);
    r.lightAt(this.x, this.y - 10, 60, 'B4', 0.55);
  }
  renderUnlit(r: Renderer) {
    if (this.sayT <= 0) return;
    const a = Math.min(1, this.sayT, (4 - this.sayT) * 4);
    const say = this.say, sx = this.x, sy = this.y - 44;
    r.worldUi((ctx, toUi) => {
      const q = toUi(sx, sy);
      const w = Math.ceil(Math.min(220, Text.measure(say, 'small').w + 12));
      // bubble height follows the text; it grows upward so the tail stays on Manman
      const h = Math.max(15, Math.ceil(Text.inkH('small')) + 6);
      const x = Math.round(q.x - w / 2), y = Math.round(q.y) - (h - 15);
      ctx.globalAlpha = a;
      // speech bubble: paper body, ink outline, a little tail pointing at Manman
      rect(ctx, x + 1, y - 1, w - 2, 1, 'K0'); rect(ctx, x + 1, y + h, w - 2, 1, 'K0');
      rect(ctx, x, y, 1, h, 'K0'); rect(ctx, x + w - 1, y, 1, h, 'K0');
      rect(ctx, x + 1, y, w - 2, h, 'K10');
      rect(ctx, x + 1, y + h - 1, w - 2, 1, 'K9');
      const tx = Math.round(q.x), ty = y + h;
      rect(ctx, tx - 2, ty, 5, 1, 'K10'); rect(ctx, tx - 1, ty + 1, 3, 1, 'K10'); rect(ctx, tx, ty + 2, 1, 1, 'K10');
      rect(ctx, tx - 3, ty, 1, 1, 'K0'); rect(ctx, tx + 3, ty, 1, 1, 'K0'); rect(ctx, tx - 2, ty + 1, 1, 1, 'K0'); rect(ctx, tx + 2, ty + 1, 1, 1, 'K0'); rect(ctx, tx - 1, ty + 2, 1, 1, 'K0'); rect(ctx, tx + 1, ty + 2, 1, 1, 'K0'); rect(ctx, tx, ty + 3, 1, 1, 'K0');
      Text.draw(ctx, say, q.x, y + (h - 1) / 2, { size: 'small', color: 'K1', shadow: false, align: 'center', valign: 'middle' });
      ctx.globalAlpha = 1;
    });
  }
}

const SHOP_LINES: L10n[] = [
  L('慢——慢——来——', 'Take—your—time—'),
  L('时间停了？我都没注意到。', 'Time stopped? I hadn\'t noticed.'),
  L('黄铜换零件，公平买卖。', 'Brass for parts. Fair and slow.'),
  L('我走了一百年才到这层楼。', 'Took me a century to reach this floor.'),
  L('别急，别急，好东西都在这儿。', 'No rush. The good stuff isn\'t going anywhere.'),
];

class ShopItem extends Interactable {
  sold = false;
  t = frand(0, 5);
  constructor(x: number, y: number, private icon: Sprite, private color: string, public name: L10n, private desc: L10n, public price: number, private onBuy: () => void, private host: RoomHost) {
    super();
    this.x = x; this.y = y;
    this.range = 18;
  }
  prompt() { return this.sold ? tr(UI.soldOut) : `${tr(this.name)}  ${this.price}`; }
  interact() {
    if (this.sold) return;
    const run = this.host.run;
    if (run.brass < this.price) {
      sfx('denied');
      this.world.fx.banner(this.x, this.y - 40, tr(UI.notEnough), 'R4', 0.8);
      return;
    }
    run.brass -= this.price;
    this.sold = true;
    this.enabled = false;
    sfx('coin');
    sfx('pickupBig', { vol: 0.5 });
    this.world.fx.burst(this.x, this.y - 16, 16, ['W', this.color], 120, 0.4);
    this.onBuy();
  }
  update(dt: number) { this.t += dt; super.update(dt); }
  render(r: Renderer) {
    drawSprite(r.w, PEDESTAL, this.x, this.y);
  }
  renderUnlit(r: Renderer) {
    if (!this.sold) {
      const y = this.y - 18 + Math.round(Math.sin(this.t * 2.4) * 1.5);
      r.glowAt(this.x, y, 12, this.color, 0.3);
      drawSprite(r.u, this.icon, this.x, y);
      const affordable = this.host.run.brass >= this.price;
      const price = String(this.price), px = this.x, py = this.y + 3;
      const near = this.near, d = tr(this.desc), color = this.color;
      r.worldUi((ctx, toUi) => {
        const q = toUi(px, py);
        G.digits.draw(ctx, price, q.x, q.y, { fill: affordable ? 'B5' : 'R4', align: 'center' });
        if (!near) return;
        // description card above the item (prompt sits between it and the item)
        const m = Text.measureWrapped(d, 'body', 156);
        const w = Math.ceil(m.w) + 12, h = Math.ceil(m.h) + 6;
        const x = Math.round(q.x - w / 2), y = Math.round(q.y - 70 - h);
        drawPanel(ctx, x, y, w, h, 'dark');
        rect(ctx, x + 2, y + 1, w - 4, 1, color);
        Text.draw(ctx, d, x + 6, y + 1, { maxW: 156, color: 'K9' });
      });
    }
    super.renderUnlit(r);
  }
  promptY() { return 44; }
}

export function setupShop(h: RoomHost) {
  const w = h.world, run = h.run, rng = h.rng;
  const c = h.center();
  w.add(new Manman(c.x, c.y - 52));
  const priceMul = run.mods.shopMul * (1 + run.floor * 0.12);
  const P = (n: number) => Math.round(n * priceMul);
  const items: { icon: Sprite; color: string; name: L10n; desc: L10n; price: number; buy: () => void }[] = [];
  // two parts (one may be shop-only)
  for (let i = 0; i < 2; i++) {
    const p = rollPart(run, rng, { shop: true, allowCursed: false });
    if (!p) continue;
    const look = partLook(p);
    items.push({ icon: look.icon, color: look.color, name: p.name, desc: p.desc, price: P([70, 110, 160][p.rarity]), buy: () => h.grantPart(p) });
  }
  // a memory
  const pat = pickPatron(run, rng);
  items.push({ icon: patronSigil(pat), color: PATRONS[pat].color, name: L(`${PATRONS[pat].name.zh}的回忆`, `${PATRONS[pat].name.en}'s Memory`), desc: L('选择一段回忆。', 'Choose a Memory.'), price: P(130), buy: () => h.offerMemory(pat) });
  // oil (heal)
  items.push({ icon: ICONS.oil, color: 'G3', name: L('一壶机油', 'Can of Oil'), desc: L('恢复 {y:35%} 生命。', 'Heal {y:35%} HP.'), price: P(45), buy: () => { const p = w.player!; const amt = Math.round(p.maxHp * 0.35); p.hp = Math.min(p.maxHp, p.hp + amt); w.fx.number(p.x, p.y - 26, amt, 'G4', true); sfx('heal'); } });
  // hourglass or calibration
  if (rng.chance(0.5)) items.push({ icon: ICONS.hourglass, color: 'C3', name: UI.hourglass, desc: L('选择一项回溯强化。', 'Choose a Rewind upgrade.'), price: P(170), buy: () => h.offerHourglass() });
  else items.push({ icon: ICONS.whetstone, color: 'K9', name: UI.calibration, desc: L('选择一项武器校准。', 'Choose a weapon Calibration.'), price: P(95), buy: () => h.offerCalibration() });
  const n = items.length;
  items.forEach((it, i) => {
    const x = c.x + (i - (n - 1) / 2) * 48;
    w.add(new ShopItem(x, c.y + 10, it.icon, it.color, it.name, it.desc, it.price, it.buy, h));
  });
  h.unlockDoors();
}

// ───────────────────────── Repair station ─────────────────────────
class Workbench extends Interactable {
  used = false;
  constructor(x: number, y: number, private host: RoomHost) { super(); this.x = x; this.y = y; this.range = 26; }
  prompt() { return tr(L('使用修理台', 'Use the bench')); }
  interact() {
    if (this.used) return;
    const h = this.host;
    const run = h.run;
    const polishable = run.memories.filter((m) => m.rarity < 3);
    const choices: Choice[] = [
      {
        id: 'oil', title: L('上油', 'Oil Up'), desc: L(`恢复 {y:40%} 生命（{y:${Math.round(run.mods.maxHp * 0.4)}}）。`, `Heal {y:40%} HP ({y:${Math.round(run.mods.maxHp * 0.4)}}).`), icon: ICONS.oil, rarity: 0,
        tag: L('修理', 'Repair'), color: 'G3',
        apply: () => { const p = h.world.player!; const a = Math.round(p.maxHp * 0.4); p.hp = Math.min(p.maxHp, p.hp + a); h.world.fx.number(p.x, p.y - 26, a, 'G4', true); sfx('heal'); },
      },
    ];
    if (polishable.length) choices.push({
      id: 'polish', title: L('打磨', 'Polish'), desc: L('提升一段回忆的稀有度。', 'Raise the rarity of one Memory.'), icon: ICONS.whetstone, rarity: 2,
      tag: L('修理', 'Repair'), color: 'B5',
      apply: () => {
        setTimeout(() => h.openChoice(polishable.slice(0, 4 + run.mods.extraChoice).map((om) => {
          const d = MEMORIES[om.id];
          return {
            id: om.id, title: d.name, desc: d.desc(d.v[Math.min(3, om.rarity + 1)]), icon: patronSigil(d.patron), rarity: Math.min(3, om.rarity + 1),
            tag: L(`${UI.rarity[om.rarity].zh} → ${UI.rarity[om.rarity + 1].zh}`, `${UI.rarity[om.rarity].en} → ${UI.rarity[om.rarity + 1].en}`), color: PATRONS[d.patron].color,
            apply: () => {
              om.rarity++;
              run.recompute();
              // re-register hooks so new values apply
              h.world.bus.off(om);
              d.hook?.({ ...run.hookCtx!, on: (k, fn) => h.world.bus.on(k, fn, om) }, d.v[om.rarity]);
            },
          };
        }), { title: L('打磨', 'Polish'), color: 'B5', icon: ICONS.whetstone }), 650);
      },
    });
    this.used = true;
    this.enabled = false;
    h.openChoice(choices, { title: UI.rest, sub: L('一次只能做一件事。', 'There is only time for one.'), icon: ICONS.rest, color: 'G3' });
  }
  render(r: Renderer) {
    drawSprite(r.w, WORKBENCH, this.x, this.y);
    r.lightAt(this.x, this.y - 10, 70, 'O3', 0.6);
  }
}

export function setupRest(h: RoomHost) {
  const c = h.center();
  h.world.add(new Workbench(c.x, c.y - 10, h));
  h.unlockDoors();
}

// ───────────────────────── Event ─────────────────────────
class EventStatue extends Interactable {
  used = false;
  t = 0;
  constructor(x: number, y: number, private ev: EventDef, private art: Sprite | null, private host: RoomHost) { super(); this.x = x; this.y = y; this.range = 24; }
  prompt() { return tr(this.ev.title); }
  interact() {
    if (this.used) return;
    this.used = true;
    this.enabled = false;
    const h = this.host;
    const w = h.world;
    const pending: (() => void)[] = [];
    const ctx = {
      run: h.run, rng: h.rng, player: w.player!,
      memory: (p: Patron, boost?: number) => pending.push(() => h.offerMemory(p, boost)),
      hourglass: () => pending.push(() => h.offerHourglass()),
      calibration: () => pending.push(() => h.offerCalibration()),
      part: (o?: { allowCursed?: boolean; forceCursed?: boolean }) => {
        let p = rollPart(h.run, h.rng, { allowCursed: o?.allowCursed });
        if (o?.forceCursed) {
          const cursed = ['rusted_crown', 'snapped_spring', 'black_sand'].filter((id) => !h.run.parts.includes(id));
          if (cursed.length) p = (EVENT_PART_LOOKUP(h.rng.pick(cursed)));
        }
        if (p) pending.push(() => h.grantPart(p!));
      },
      heal: (f: number) => { const p = w.player!; const a = Math.round(p.maxHp * f); p.hp = Math.min(p.maxHp, p.hp + a); w.fx.number(p.x, p.y - 26, a, 'G4', true); sfx('heal'); },
      damage: (n: number) => { const p = w.player!; p.hp = Math.max(1, p.hp - n); w.fx.number(p.x, p.y - 26, n, 'R4', true); sfx('hurt'); G.r.params.hurt = 0.6; },
      brass: (n: number) => { h.run.brass += n; sfx('coin'); },
      shards: (n: number) => { h.run.shards += n; sfx('shard'); },
      lore: (id: string) => { h.run.lore.push(id); },
    };
    h.openOverlay(new EventOverlay(this.ev, this.art, h.run, ctx, () => {
      for (const f of pending) f();
      h.unlockDoors();
    }));
  }
  update(dt: number) { this.t += dt; super.update(dt); }
  renderGround(r: Renderer) { r.w.fillStyle = 'rgba(11,10,20,0.45)'; r.w.beginPath(); r.w.ellipse(Math.round(this.x), Math.round(this.y), 9, 3, 0, 0, Math.PI * 2); r.w.fill(); }
  render(r: Renderer) {
    if (this.art) {
      drawSprite(r.w, this.art, this.x, this.y);
      // frozen shimmer: faint violet outline pulse
      r.g.globalCompositeOperation = 'lighter';
      drawSprite(r.g, this.art, this.x, this.y, { tint: 'V2', alpha: 0.15 + Math.sin(this.t * 2) * 0.06 });
      r.g.globalCompositeOperation = 'source-over';
    }
    r.lightAt(this.x, this.y - 12, 70, 'K9', 0.5);
    // suspended particles around the moment
    if (Math.floor(this.t * 10) % 4 === 0) this.world.particles.spawn({ kind: 'dust', x: this.x + frand(-14, 14), y: this.y - frand(4, 30), vy: frand(-1, 1), life: 2, ramp: ['K10', 'K8'], layer: 'glow', alpha: 0.5 });
  }
}
let EVENT_PART_LOOKUP: (id: string) => PartDef | null = () => null;
export function setPartLookup(f: (id: string) => PartDef | null) { EVENT_PART_LOOKUP = f; }

export function setupEvent(h: RoomHost) {
  const seen = new Set(h.run.eventsSeen);
  const pool = EVENTS.filter((e) => !seen.has(e.id) && (e.minFloor ?? 0) <= h.run.floor);
  const ev = pool.length ? h.rng.pick(pool) : h.rng.pick(EVENTS);
  h.run.eventsSeen.push(ev.id);
  const art = CITIZENS[ev.art] ?? EVENT_OBJECTS[ev.art] ?? null;
  const c = h.center();
  h.world.add(new EventStatue(c.x, c.y - 8, ev, art, h));
}

// ───────────────────────── Vault (echo puzzle) ─────────────────────────
class Plate extends Entity {
  down = false;
  wasDown = false;
  constructor(x: number, y: number) { super(); this.x = x; this.y = y; }
  update() {
    const p = this.world.player;
    let d = !!p && Math.hypot(p.x - this.x, p.y - this.y) < 9;
    if (p) for (const e of p.echoes) if (!e.dead && Math.hypot(e.x - this.x, e.y - this.y) < 9) d = true;
    this.down = d;
    if (d && !this.wasDown) sfx('clank', { vol: 0.4, pan: this.world.pan(this.x) });
    this.wasDown = d;
  }
  renderGround(r: Renderer) {
    drawSprite(r.w, PLATE[this.down ? 1 : 0], this.x, this.y);
    if (this.down) r.lightAt(this.x, this.y, 30, 'O3', 0.6);
  }
}

class Cage extends Entity {
  open = false;
  openT = 0;
  constructor(private tx: number, private ty: number) { super(); this.x = tx * TS + 8; this.y = ty * TS + 16; this.sortBias = 2; }
  added() {
    const m = this.world.map;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) m.set(this.tx + i, this.ty + j, T.BLOCK);
  }
  release() {
    if (this.open) return;
    this.open = true;
    const m = this.world.map;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) m.set(this.tx + i, this.ty + j, T.FLOOR);
    sfx('doorOpen');
    sfx('roomClear');
    this.world.fx.burst(this.x, this.y - 10, 24, ['W', 'B6', 'B4'], 140, 0.5);
  }
  update(dt: number) { if (this.open) this.openT += dt; }
  render(r: Renderer) {
    const lift = Math.min(1, this.openT * 2);
    if (lift >= 1) return;
    const ctx = r.w;
    const x0 = this.tx * TS - 16, y0 = this.ty * TS - 16;
    const h = Math.round(40 * (1 - lift));
    for (let i = 0; i <= 12; i++) {
      const x = x0 + i * 4;
      ctx.fillStyle = col('K0'); ctx.fillRect(x, y0 + 48 - h, 2, h);
      ctx.fillStyle = col('B3'); ctx.fillRect(x, y0 + 48 - h, 1, h);
    }
    ctx.fillStyle = col('B2'); ctx.fillRect(x0, y0 + 48 - h, 50, 2);
  }
}

class VaultLogic extends Entity {
  constructor(private plates: Plate[], private cage: Cage) { super(); }
  update() {
    if (!this.cage.open && this.plates.every((p) => p.down)) this.cage.release();
  }
}

export function setupVault(h: RoomHost) {
  const w = h.world;
  const c = h.center();
  const tx = Math.floor(c.x / TS), ty = Math.floor(c.y / TS) - 1;
  const cage = w.add(new Cage(tx, ty));
  const p1 = w.add(new Plate(c.x - 120, c.y + 30));
  const p2 = w.add(new Plate(c.x + 120, c.y + 30));
  w.add(new VaultLogic([p1, p2], cage));
  const part = rollPart(h.run, h.rng, { allowCursed: false });
  w.add(new Chest(tx * TS + 8, ty * TS + 14, () => { if (part) h.grantPart(part); }, () => tr(UI.part)));
  // inscription on the floor
  w.fx.banner(c.x, c.y + 60, tr(L('两处机关，须同时按下', 'Two plates — pressed at the same moment')), 'B4', 6);
  h.unlockDoors();
}
