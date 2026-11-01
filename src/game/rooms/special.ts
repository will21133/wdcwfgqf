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
import { pickEvent, EventDef } from '../progression/events';
import { EventOverlay } from '../ui/eventOverlay';
import { G, sfx } from '../G';
import { tr, L, L10n, UI } from '../i18n';
import { TS, T } from '../world/room';
import { col } from '../../art/palette';
import { frand } from '../../engine/rng';
import { Text } from '../ui/text';
import { drawPanel, promptH } from '../ui/widgets';
import { S } from '../strings';
import '../strings/f2';
import { rect } from '../ui/draw';
import type { Player } from '../entities/player';
import type { Loadout } from '../run';

/** the room's host; `who` is the hand a reward belongs to (default: the first one standing) */
export interface RoomHost {
  world: World;
  run: Run;
  rng: RNG;
  openOverlay(o: Overlay): void;
  openChoice(choices: Choice[], header: { title: L10n; sub?: L10n; quote?: L10n; icon?: Sprite; color: string }, after?: () => void, regen?: () => Choice[], who?: Player | null): void;
  offerMemory(patron: Patron, boost?: number, who?: Player | null): void;
  offerHourglass(who?: Player | null): void;
  offerCalibration(who?: Player | null): void;
  grantPart(p: PartDef, who?: Player | null): void;
  toast(icon: Sprite | null, title: string, desc: string, color?: string, slot?: number | null): void;
  unlockDoors(): void;
  center(): { x: number; y: number };
}

// ───────────────────────── Shop ─────────────────────────
let MANMAN: Sprite[] | null = null;

class Manman extends Entity {
  t = 0; say: string; sayT = 4;
  constructor(x: number, y: number, line: L10n) {
    super();
    MANMAN ??= buildManman();
    this.x = x; this.y = y;
    this.say = tr(line);
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
  /** base: the floor's price before anyone's Shop discount */
  constructor(x: number, y: number, private icon: Sprite, private color: string, public name: L10n, private desc: L10n, public base: number, private onBuy: (who: Player | null) => void, private host: RoomHost) {
    super();
    this.x = x; this.y = y;
    this.range = 18;
  }
  /** the price for a hand (its own Shop multiplier); the shared purse pays */
  priceFor(lo: Loadout | null) { return Math.round(this.base * (lo?.mods.shopMul ?? 1)); }
  /** what the nearest hand would pay */
  get price() { const p = this.nearBy ?? this.world.player; return this.priceFor(p ? this.host.run.lo(p.slot) : null); }
  prompt() { return this.sold ? tr(UI.soldOut) : `${tr(this.name)}  ${this.price}`; }
  /** co-op: seconds the nearest hand has held Interact (the shared purse needs a deliberate hold) */
  holdT = 0;
  /** the hand whose hold is under way */
  private holder: Player | null = null;
  update(dt: number) {
    this.t += dt;
    if (this.world.playerCount <= 1) { super.update(dt); return; }
    // co-op (GDD2 §2.3 / §5.8): hold Interact 0.6 s to buy, so nobody spends the shared purse by accident
    super.update(dt);
    const p = this.nearBy;
    if (!p || this.sold || !p.input.down('interact')) { this.holdT = 0; this.holder = null; return; }
    if (this.holder !== p) { this.holder = p; this.holdT = 0; }
    // after a purchase attempt (bought or too poor) the button has to be let go first
    if (this.holdT < 0) return;
    this.holdT += dt;
    if (this.holdT >= SHOP_HOLD) { this.holdT = -1; this.user = p; this.buy(); }
  }
  interact() {
    // co-op purchases go through the hold above; a tap only does something in solo (1.0)
    if (this.world.playerCount > 1) return;
    this.buy();
  }
  private buy() {
    if (this.sold) return;
    const run = this.host.run;
    const who = this.user;
    const price = this.priceFor(who ? run.lo(who.slot) : null);
    if (!run.spendBrass(price)) {
      sfx('denied');
      this.world.fx.banner(this.x, this.y - 40, tr(UI.notEnough), 'R4', 0.8);
      return;
    }
    this.sold = true;
    this.enabled = false;
    sfx('coin');
    sfx('pickupBig', { vol: 0.5 });
    this.world.fx.burst(this.x, this.y - 16, 16, ['W', this.color], 120, 0.4);
    // what you buy is yours (GDD2 §5.8)
    this.onBuy(who);
  }
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
    // co-op: "hold to buy" under the prompt, filling in the buyer's colour
    if (this.near && !this.sold && this.world.playerCount > 1) {
      const k = Math.max(0, this.holdT) / SHOP_HOLD, c = this.nearBy?.color ?? 'B5';
      const px = this.x, py = this.y - this.promptY();
      r.worldUi((ctx, toUi) => {
        const q = toUi(px, py);
        const ph = Math.max(promptH(), Math.ceil(Text.inkH('body')) + 2);
        const ly = Math.round(q.y + ph + 4);
        const label = tr(HOLD_BUY);
        const w = Math.max(44, Math.ceil(Text.measure(label, 'small').w) + 10);
        const x0 = Math.round(q.x - w / 2);
        const a = ctx.globalAlpha;
        ctx.globalAlpha = a * 0.85;
        rect(ctx, x0, ly, w, Math.ceil(Text.lineH('small')) + 5, 'K0');
        ctx.globalAlpha = a;
        rect(ctx, x0 + 1, ly + Math.ceil(Text.lineH('small')) + 3, w - 2, 1, 'K3');
        if (k > 0) rect(ctx, x0 + 1, ly + Math.ceil(Text.lineH('small')) + 2, Math.round((w - 2) * Math.min(1, k)), 2, c);
        Text.draw(ctx, label, q.x, ly + 2 + Text.inkMid('small'), { size: 'small', color: k > 0 ? 'K10' : 'K8', align: 'center', valign: 'middle' });
      });
    }
  }
  promptY() { return 44; }
}

/** co-op: seconds Interact is held to buy (GDD2 §2.3) */
const SHOP_HOLD = 0.6;
const HOLD_BUY = S('f2', 'holdBuy');

export function setupShop(h: RoomHost) {
  const w = h.world, run = h.run, rng = h.rng;
  const c = h.center();
  w.add(new Manman(c.x, c.y - 52, w.rng.pick(SHOP_LINES)));
  const priceMul = 1 + run.floor * 0.12;
  const P = (n: number) => n * priceMul;
  const items: { icon: Sprite; color: string; name: L10n; desc: L10n; price: number; buy: (who: Player | null) => void }[] = [];
  // two parts (one may be shop-only); one more for every extra hand (GDD2 §5.8)
  const parts = 2 + Math.max(0, w.playerCount - 1);
  for (let i = 0; i < parts; i++) {
    const p = rollPart(run, rng, { shop: true, allowCursed: false });
    if (!p || items.some((it) => it.name === p.name)) continue;
    const look = partLook(p);
    items.push({ icon: look.icon, color: look.color, name: p.name, desc: p.desc, price: P([70, 110, 160][p.rarity]), buy: (who) => h.grantPart(p, who) });
  }
  // a memory
  const pat = pickPatron(run, rng);
  items.push({ icon: patronSigil(pat), color: PATRONS[pat].color, name: L(`${PATRONS[pat].name.zh}的回忆`, `${PATRONS[pat].name.en}'s Memory`), desc: L('选择一段回忆。', 'Choose a Memory.'), price: P(130), buy: (who) => h.offerMemory(pat, 0, who) });
  // oil (heal) — the whole team
  items.push({ icon: ICONS.oil, color: 'G3', name: L('一壶机油', 'Can of Oil'), desc: L('恢复 {y:35%} 生命。', 'Heal {y:35%} HP.'), price: P(45), buy: () => { for (const p of w.alive()) { const amt = Math.round(p.maxHp * 0.35); p.hp = Math.min(p.maxHp, p.hp + amt); w.fx.number(p.x, p.y - 26, amt, 'G4', true); } sfx('heal'); } });
  // hourglass or calibration
  if (rng.chance(0.5)) items.push({ icon: ICONS.hourglass, color: 'C3', name: UI.hourglass, desc: L('选择一项回溯强化。', 'Choose a Rewind upgrade.'), price: P(170), buy: (who) => h.offerHourglass(who) });
  else items.push({ icon: ICONS.whetstone, color: 'K9', name: UI.calibration, desc: L('选择一项武器校准。', 'Choose a weapon Calibration.'), price: P(95), buy: (who) => h.offerCalibration(who) });
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
  /** hands that already used it: each hand gets its own choice (GDD2 §5.8) */
  usedBy = new Set<number>();
  constructor(x: number, y: number, private host: RoomHost) { super(); this.x = x; this.y = y; this.range = 26; }
  prompt() { return tr(L('使用修理台', 'Use the bench')); }
  accepts(p: Player) { return !this.usedBy.has(p.slot); }
  interact() {
    if (this.used) return;
    const h = this.host;
    const run = h.run;
    // the hand at the bench chooses for themselves; the bench stays open until every hand has
    const who = this.user ?? h.world.player!;
    if (this.usedBy.has(who.slot)) return;
    const lo = run.lo(who.slot);
    const polishable = lo.memories.filter((m) => m.rarity < 3);
    const choices: Choice[] = [
      {
        id: 'oil', title: L('上油', 'Oil Up'), desc: L(`恢复 {y:40%} 生命（{y:${Math.round(lo.mods.maxHp * 0.4)}}）。`, `Heal {y:40%} HP ({y:${Math.round(lo.mods.maxHp * 0.4)}}).`), icon: ICONS.oil, rarity: 0,
        tag: L('修理', 'Repair'), color: 'G3',
        apply: () => { const p = who; const a = Math.round(p.maxHp * 0.4); p.hp = Math.min(p.maxHp, p.hp + a); h.world.fx.number(p.x, p.y - 26, a, 'G4', true); sfx('heal'); },
      },
    ];
    if (polishable.length) choices.push({
      id: 'polish', title: L('打磨', 'Polish'), desc: L('提升一段回忆的稀有度。', 'Raise the rarity of one Memory.'), icon: ICONS.whetstone, rarity: 2,
      tag: L('修理', 'Repair'), color: 'B5',
      apply: () => {
        h.world.after(0.65, () => h.openChoice(polishable.slice(0, 4 + lo.mods.extraChoice).map((om) => {
          const d = MEMORIES[om.id];
          return {
            id: om.id, title: d.name, desc: d.desc(d.v[Math.min(3, om.rarity + 1)]), icon: patronSigil(d.patron), rarity: Math.min(3, om.rarity + 1),
            tag: L(`${UI.rarity[om.rarity].zh} → ${UI.rarity[om.rarity + 1].zh}`, `${UI.rarity[om.rarity].en} → ${UI.rarity[om.rarity + 1].en}`), color: PATRONS[d.patron].color,
            apply: () => {
              om.rarity++;
              lo.recompute();
              // re-register hooks so new values apply
              h.world.bus.off(om);
              const c = lo.liveCtx(om);
              if (c) d.hook?.(c, d.v[om.rarity]);
            },
          };
        }), { title: L('打磨', 'Polish'), color: 'B5', icon: ICONS.whetstone }, undefined, undefined, who), this);
      },
    });
    this.usedBy.add(who.slot);
    if (h.world.players.every((p) => this.usedBy.has(p.slot))) { this.used = true; this.enabled = false; }
    h.openChoice(choices, { title: UI.rest, sub: L('一次只能做一件事。', 'There is only time for one.'), icon: ICONS.rest, color: 'G3' }, undefined, undefined, who);
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
    // the first hand to walk up decides; gains and costs are theirs (GDD2 §5.8)
    const who = this.user ?? w.player!;
    const lo = h.run.lo(who.slot);
    const ctx = {
      run: h.run, rng: h.rng, player: who, lo,
      memory: (p: Patron, boost?: number) => pending.push(() => h.offerMemory(p, boost, who)),
      hourglass: () => pending.push(() => h.offerHourglass(who)),
      calibration: () => pending.push(() => h.offerCalibration(who)),
      part: (o?: { allowCursed?: boolean; forceCursed?: boolean }) => {
        let p = rollPart(h.run, h.rng, { allowCursed: o?.allowCursed, lo });
        if (o?.forceCursed) {
          const cursed = ['rusted_crown', 'snapped_spring', 'black_sand'].filter((id) => !lo.parts.includes(id));
          if (cursed.length) p = (EVENT_PART_LOOKUP(h.rng.pick(cursed)));
        }
        if (p) pending.push(() => h.grantPart(p!, who));
      },
      heal: (f: number) => { const p = who; const a = Math.round(p.maxHp * f); p.hp = Math.min(p.maxHp, p.hp + a); w.fx.number(p.x, p.y - 26, a, 'G4', true); sfx('heal'); },
      damage: (n: number) => { const p = who; p.hp = Math.max(1, p.hp - n); w.fx.number(p.x, p.y - 26, n, 'R4', true); sfx('hurt'); G.r.params.hurt = 0.6; },
      brass: (n: number) => { h.run.addBrass(n); sfx('coin'); },
      shards: (n: number) => { h.run.shards += n; sfx('shard'); },
      lore: (id: string) => { h.run.lore.push(id); },
    };
    // co-op: the decider's own device drives the event (solo: every device, as in 1.0)
    h.openOverlay(new EventOverlay(this.ev, this.art, h.run, ctx, () => {
      for (const f of pending) f();
      h.unlockDoors();
    }, w.playerCount > 1 ? who.input : undefined));
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
  const ev = pickEvent(h.run, h.rng);
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
    // any hand (or any hand's echo) holds a plate down
    let d = false;
    for (const p of this.world.players) {
      if (p.state === 'alive' && Math.hypot(p.x - this.x, p.y - this.y) < 9) d = true;
      for (const e of p.echoes) if (!e.dead && Math.hypot(e.x - this.x, e.y - this.y) < 9) d = true;
    }
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
  w.add(new Chest(tx * TS + 8, ty * TS + 14, (p) => { if (part) h.grantPart(part, p); }, () => tr(UI.part)));
  // inscription on the floor
  w.fx.banner(c.x, c.y + 60, tr(L('两处机关，须同时按下', 'Two plates — pressed at the same moment')), 'B4', 6);
  h.unlockDoors();
}
