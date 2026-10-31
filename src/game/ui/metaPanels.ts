// Workshop panels: Mainspring (meta upgrades), weapon rack, Ledger (codex).
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import { drawScaled, RARITY_TEXT } from './overlay';
import { panel, rect, shardIcon } from './draw';
import { G, sfx } from '../G';
import { tr, L, L10n } from '../i18n';
import { profile, saveProfile, NODES, NodeDef, nodeLevel } from '../save';
import { drawHint } from './prompts';
import { Text } from './text';
import { col } from '../../art/palette';
import { gearFrames, BRASS_GEAR, IRON_GEAR } from '../../art/gear';
import { Sprite, Sprite as SpriteCls } from '../../engine/gfx/sprite';
import { makeCanvas } from '../../engine/gfx/canvas';
import { ROSTERS } from '../world/director';
import { MEMORY_LIST, PATRONS } from '../progression/memories';
import { PARTS, PARTS_BY_ID } from '../progression/parts';
import { patronSigil, ICONS } from '../../art/sprites/icons';
import { partLook } from '../progression/rewards';
import { RAPIER, MAUL, BOW, GEAR_BLADE } from '../../art/sprites/weapons';

let GEAR_ON: Sprite[] | null = null, GEAR_OFF: Sprite[] | null = null;

function shardCounter(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shardIcon(ctx, x, y);
  G.digits.draw(ctx, String(profile.shards), x + 10, y, { fill: 'V4' });
}

// ───────────────────────── Mainspring ─────────────────────────
export class MainspringOverlay implements Overlay {
  blocks = true;
  /** Ines's notes stay hidden (and paused) while this is open */
  hidesNotes = true;
  sel = 0;
  t = 0;
  flash = 0;
  constructor() { GEAR_ON ??= gearFrames(9, 10, BRASS_GEAR, 4, 2); GEAR_OFF ??= gearFrames(9, 10, IRON_GEAR, 4, 2); sfx('uiOpen'); }

  // the weapon column (col 4) must stay clear of the detail panel at x = 400
  private pos(n: NodeDef) { return { x: 96 + n.col * 64, y: 96 + n.row * 52 }; }
  private available(n: NodeDef) { return !n.requires || nodeLevel(n.requires) > 0; }
  private cost(n: NodeDef) { const lv = nodeLevel(n.id); return lv < n.costs.length ? n.costs[lv] : -1; }

  update(dt: number) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    const inp = G.input;
    if (inp.pressed('cancel') || inp.pressed('pause')) { inp.consume('pause'); sfx('uiBack'); return false; }
    const nav = inp.nav(dt);
    if (nav.x || nav.y) {
      // move to the nearest node in that direction
      const cur = this.pos(NODES[this.sel]);
      let best = -1, bd = 1e9;
      NODES.forEach((n, i) => {
        if (i === this.sel) return;
        const p = this.pos(n);
        const dx = p.x - cur.x, dy = p.y - cur.y;
        if (nav.x && Math.sign(dx) !== nav.x) return;
        if (nav.y && Math.sign(dy) !== nav.y) return;
        const d = Math.abs(dx) * (nav.y ? 2.5 : 1) + Math.abs(dy) * (nav.x ? 2.5 : 1);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { this.sel = best; sfx('uiMove'); }
    }
    if (inp.mouseAim) NODES.forEach((n, i) => { const p = this.pos(n); if (Math.hypot(inp.mx - p.x, inp.my - p.y) < 13 && this.sel !== i) { this.sel = i; sfx('uiMove'); } });
    const click = inp.pressed('attack') && inp.mouseAim;
    if (inp.pressed('confirm') || click) {
      const n = NODES[this.sel];
      const c = this.cost(n);
      if (c < 0 || !this.available(n) || profile.shards < c) { sfx('denied'); return true; }
      profile.shards -= c;
      profile.nodes[n.id] = nodeLevel(n.id) + 1;
      if (n.unlockWeapon && !profile.weapons.includes(n.unlockWeapon)) profile.weapons.push(n.unlockWeapon);
      saveProfile();
      this.flash = 0.4;
      sfx('pickupBig');
      sfx('cogWind');
    }
    return true;
  }

  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.8; ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1;
    panel(ctx, 24, 18, 592, 324);
    G.font.draw(ctx, tr(L('发条台', 'The Mainspring')), 40, 28, { color: 'B5' });
    G.small.draw(ctx, tr(L('用时之碎片拧紧你的发条——这些强化永久有效。', 'Wind Time Shards into your spring — these upgrades are permanent.')), 40, 46, { color: 'K8' });
    shardCounter(ctx, 560, 30);
    // connections
    for (const n of NODES) {
      if (!n.requires) continue;
      const a = this.pos(n), b = this.pos(NODES.find((x) => x.id === n.requires)!);
      const on = nodeLevel(n.requires) > 0;
      ctx.fillStyle = col(on ? 'B3' : 'K3');
      const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
      if (a.x === b.x) ctx.fillRect(a.x, y0, 1, Math.abs(a.y - b.y));
      else { ctx.fillRect(x0, b.y, Math.abs(a.x - b.x), 1); ctx.fillRect(a.x, y0, 1, Math.abs(a.y - b.y)); }
    }
    G.small.draw(ctx, tr(L('武器', 'Weapons')), this.pos(NODES.find((n) => n.col === 4)!).x, 66, { align: 'center', color: 'K7' });
    NODES.forEach((n, i) => {
      const p = this.pos(n);
      const lv = nodeLevel(n.id), max = n.costs.length;
      const avail = this.available(n);
      const fr = lv > 0 ? GEAR_ON! : GEAR_OFF!;
      const spin = i === this.sel ? Math.floor(this.t * 6) : 0;
      ctx.globalAlpha = avail ? 1 : 0.4;
      drawScaled(ctx, fr[spin % fr.length], p.x, p.y, 1);
      // level pips
      for (let k = 0; k < max; k++) rect(ctx, p.x - max * 2 + k * 4, p.y + 13, 3, 2, k < lv ? 'B5' : 'K3');
      ctx.globalAlpha = 1;
      if (i === this.sel) {
        // selection frame (fillRects so it snaps to the device grid)
        rect(ctx, p.x - 15, p.y - 15, 30, 1, 'B6'); rect(ctx, p.x - 15, p.y + 14, 30, 1, 'B6');
        rect(ctx, p.x - 15, p.y - 14, 1, 28, 'B6'); rect(ctx, p.x + 14, p.y - 14, 1, 28, 'B6');
      }
    });
    // detail panel
    const n = NODES[this.sel];
    const lv = nodeLevel(n.id), c = this.cost(n);
    const x = 400, y = 74;
    panel(ctx, x, y, 200, 180, { fill: 'K2', rivets: false });
    // name, level and description stack on measured heights so long names never collide
    const nh = Text.draw(ctx, n.name, x + 10, y + 6, { color: lv > 0 ? 'B5' : 'K10', maxW: 180 }).h;
    const ly = y + 6 + nh + 1;
    Text.draw(ctx, `${tr(L('等级', 'Level'))} ${lv}/${n.costs.length}`, x + 10, ly, { size: 'small', color: 'K8' });
    Text.draw(ctx, n.desc(Math.max(1, Math.min(n.costs.length, lv + (c >= 0 ? 1 : 0)))), x + 10, ly + Text.lineH('small') + 4, { color: 'K9', maxW: 180 });
    if (!this.available(n)) Text.draw(ctx, L('需要先解锁前置', 'Requires the previous node'), x + 10, y + 155, { color: 'R4' });
    else if (c < 0) Text.draw(ctx, L('已满级', 'Maxed'), x + 10, y + 155, { color: 'B5' });
    else {
      shardIcon(ctx, x + 10, y + 160);
      G.digits.draw(ctx, `${c}`, x + 22, y + 159, { fill: profile.shards >= c ? 'V4' : 'R4' });
    }
    if (this.flash > 0) { ctx.globalAlpha = this.flash; rect(ctx, x, y, 200, 180, 'B6'); ctx.globalAlpha = 1; }
    drawHint(ctx, 320, 318, [['nav', tr(L('选择', 'Select'))], ['confirm', tr(L('拧紧', 'Wind'))], ['cancel', tr(L('返回', 'Back'))]]);
  }
}

// ───────────────────────── Weapon rack ─────────────────────────
export const WEAPON_INFO: { id: string; name: L10n; desc: L10n; sprite: Sprite }[] = [
  { id: 'rapier', sprite: RAPIER, name: L('秒针细剑', 'Second-Hand Rapier'), desc: L('快速三段刺击，第三段横扫。特技：穿透突刺。残响的最后一击伤害翻倍。', 'Three quick thrusts, the third a sweep. Special: piercing lunge. An echo\'s final strike deals double.') },
  { id: 'maul', sprite: MAUL, name: L('钟摆巨锤', 'Pendulum Maul'), desc: L('缓慢沉重的两段挥击，大范围击退。特技：蓄力回旋。残响每次攻击附带冲击波。', 'Two slow, heavy swings with wide knockback. Special: charged spin. Echo swings release shockwaves.') },
  { id: 'bow', sprite: BOW, name: L('报时长弓', 'Chime Bow'), desc: L('快速射击；按住蓄力射出穿透箭。特技：扇形齐射。残响的箭会追踪。', 'Rapid shots; hold to charge a piercing arrow. Special: fan volley. Echo arrows home in.') },
  { id: 'chakram', sprite: GEAR_BLADE, name: L('齿轮回旋镖', 'Gear Chakram'), desc: L('掷出往返的锯齿齿轮。特技：把齿轮嵌进地面变成炮台。残响的齿轮一分为二。', 'Throw a returning sawtooth gear. Special: embed it as a turret. Echo gears split in two.') },
];

export class WeaponOverlay implements Overlay {
  blocks = true;
  /** Ines's notes stay hidden (and paused) while this is open */
  hidesNotes = true;
  sel = Math.max(0, WEAPON_INFO.findIndex((w) => w.id === profile.weapon));
  t = 0;
  constructor() { sfx('uiOpen'); }
  update(dt: number) {
    this.t += dt;
    const inp = G.input;
    if (inp.pressed('cancel') || inp.pressed('pause')) { inp.consume('pause'); sfx('uiBack'); return false; }
    const nav = inp.nav(dt);
    if (nav.x) { this.sel = (this.sel + nav.x + WEAPON_INFO.length) % WEAPON_INFO.length; sfx('uiMove'); }
    if (inp.pressed('confirm') || (inp.pressed('attack') && inp.mouseAim)) {
      const w = WEAPON_INFO[this.sel];
      if (!profile.weapons.includes(w.id)) { sfx('denied'); return true; }
      profile.weapon = w.id;
      saveProfile();
      sfx('uiSelect');
      return false;
    }
    return true;
  }
  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.8; ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1;
    panel(ctx, 60, 50, 520, 250);
    G.font.draw(ctx, tr(L('武器架', 'Weapon Rack')), 320, 60, { align: 'center', color: 'B5' });
    WEAPON_INFO.forEach((w, i) => {
      const x = 120 + i * 133, y = 130;
      const un = profile.weapons.includes(w.id);
      const sel = i === this.sel;
      panel(ctx, x - 50, y - 46, 100, 92, { fill: sel ? 'K3' : 'K2', border: sel ? 'B5' : 'B1', rivets: false });
      ctx.globalAlpha = un ? 1 : 0.25;
      drawScaled(ctx, w.sprite, x, y - 4, 3);
      ctx.globalAlpha = 1;
      G.small.draw(ctx, un ? tr(w.name) : '???', x, y + 28, { align: 'center', color: un ? (profile.weapon === w.id ? 'B5' : 'K9') : 'K7' });
      if (profile.weapon === w.id) G.small.draw(ctx, tr(L('装备中', 'Equipped')), x, y - 42, { align: 'center', color: 'G4' });
    });
    const w = WEAPON_INFO[this.sel];
    const un = profile.weapons.includes(w.id);
    G.font.draw(ctx, un ? tr(w.desc) : tr(L('在发条台解锁。', 'Unlock it at the Mainspring.')), 80, 196, { color: 'K9', wrap: 480, lineH: 15 });
    drawHint(ctx, 320, 282, [['nav', tr(L('选择', 'Select'))], ['confirm', tr(L('装备', 'Equip'))], ['cancel', tr(L('返回', 'Back'))]]);
  }
}

// ───────────────────────── Ledger (codex) ─────────────────────────
/** render an enemy's real sprite into a small icon by instantiating it against a stub world */
const enemyIconCache = new Map<string, Sprite | null>();
function enemyIcon(def: { id: string; make: (x: number, y: number) => unknown }): Sprite | null {
  if (enemyIconCache.has(def.id)) return enemyIconCache.get(def.id)!;
  let out: Sprite | null = null;
  try {
    const S = 64;
    const [cv, ctx] = makeCanvas(S, S);
    const noop = () => {};
    const fake = { w: ctx, u: ctx, g: ctx, ui2: ctx, lightAt: noop, glowAt: noop, label: noop, worldUi: noop, visible: () => true, params: {} } as any;
    const e = def.make(S / 2, S - 6) as any;
    e.world = { time: 0, player: null, map: { solidAt: () => false, pitAt: () => false, los: () => true }, particles: { spawn: noop }, fx: {}, enemies: [], entities: [], bus: { on: noop, off: noop, emit: noop } };
    e.spawnT = 0; e.age = 0.5; e.flash = 0;
    e.render(fake);
    // trim to content
    const id = ctx.getImageData(0, 0, S, S).data;
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (id[(y * S + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (x1 >= 0) {
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const k = Math.max(1, Math.ceil(Math.max(w, h) / 30));
      const [c2, c2x] = makeCanvas(Math.ceil(w / k), Math.ceil(h / k));
      c2x.imageSmoothingEnabled = false;
      c2x.drawImage(cv, x0, y0, w, h, 0, 0, Math.ceil(w / k), Math.ceil(h / k));
      out = new SpriteCls(c2, Math.ceil(w / k) / 2, Math.ceil(h / k) / 2);
    }
  } catch { out = null; }
  enemyIconCache.set(def.id, out);
  return out;
}

interface Entry { id: string; icon: Sprite | null; name: string; desc: string; seen: boolean; color: string }

export class LedgerOverlay implements Overlay {
  blocks = true;
  /** Ines's notes stay hidden (and paused) while this is open */
  hidesNotes = true;
  tab = 0;
  sel = 0;
  tabs: { name: L10n; entries: () => Entry[] }[] = [
    {
      name: L('敌人', 'Enemies'), entries: () => ROSTERS.flat().map((d) => ({
        id: d.id, icon: profile.seen.enemies.includes(d.id) ? enemyIcon(d) : null, name: d.name ? tr(d.name) : d.id, desc: d.desc ? tr(d.desc) : '', seen: profile.seen.enemies.includes(d.id), color: d.elite ? 'O3' : 'K9',
      })),
    },
    {
      name: L('回忆', 'Memories'), entries: () => MEMORY_LIST.map((m) => ({
        id: m.id, icon: patronSigil(m.patron), name: tr(m.name), desc: `${tr(PATRONS[m.patron].name)} · ${tr(m.desc(m.v[0]))}`, seen: profile.seen.memories.includes(m.id), color: RARITY_TEXT[m.slot === 'legendary' ? 3 : m.slot === 'duo' ? 2 : 0],
      })),
    },
    {
      name: L('零件', 'Parts'), entries: () => PARTS.map((p) => ({
        id: p.id, icon: partLook(p).icon, name: tr(p.name), desc: `${tr(p.desc)}\n{k:${tr(p.flavor)}}`, seen: profile.seen.parts.includes(p.id), color: partLook(p).color,
      })),
    },
    {
      name: L('记录', 'Records'), entries: () => [
        { id: 'runs', icon: ICONS.hourglass, name: tr(L('统计', 'Statistics')), desc: tr(L(`出发 ${profile.runs} 次 · 停摆 ${profile.deaths} 次 · 登顶 ${profile.wins} 次\n最高到达：第 ${profile.bestFloor + 1} 层 · 累计时之碎片 ${profile.totalShards}`, `Runs ${profile.runs} · Stops ${profile.deaths} · Summits ${profile.wins}\nHighest floor: ${profile.bestFloor + 1} · Lifetime shards ${profile.totalShards}`)), seen: true, color: 'B5' },
        { id: 'letter1', icon: ICONS.event, name: tr(L('未寄出的信', 'The Unsent Letter')), desc: tr(L('"……我宁愿让整座城停在你还活着的这一秒。——伊"', '"...I would rather the whole city stand still in the one second you are still alive. — I."')), seen: profile.lore.includes('letter1'), color: 'K10' },
      ],
    },
  ];
  constructor() { sfx('uiOpen'); }
  update(dt: number) {
    const inp = G.input;
    if (inp.pressed('cancel') || inp.pressed('pause')) { inp.consume('pause'); sfx('uiBack'); return false; }
    if (inp.pressed('special') || inp.pressed('rewind') || inp.pressed('info')) { this.tab = (this.tab + 1) % this.tabs.length; this.sel = 0; sfx('uiMove'); }
    const n = this.tabs[this.tab].entries().length;
    const nav = inp.nav(dt);
    if (nav.x) { this.sel = (this.sel + nav.x + n) % n; sfx('uiMove'); }
    if (nav.y) { this.sel = Math.max(0, Math.min(n - 1, this.sel + nav.y * 12)); sfx('uiMove'); }
    return true;
  }
  render(r: Renderer) {
    const ctx = r.ui2;
    ctx.globalAlpha = 0.85; ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, 640, 360); ctx.globalAlpha = 1;
    panel(ctx, 24, 18, 592, 324);
    G.font.draw(ctx, tr(L('账簿', 'The Ledger')), 40, 28, { color: 'B5' });
    this.tabs.forEach((t, i) => {
      const x = 180 + i * 80;
      if (i === this.tab) rect(ctx, x - 4, 26, 72, 16, 'K3');
      G.font.draw(ctx, tr(t.name), x + 32, 28, { align: 'center', color: i === this.tab ? 'K10' : 'K7' });
    });
    const es = this.tabs[this.tab].entries();
    const seenN = es.filter((e) => e.seen).length;
    G.small.draw(ctx, `${seenN}/${es.length}`, 596, 32, { align: 'right', color: 'K7' });
    rect(ctx, 40, 48, 560, 1, 'B1');
    es.forEach((e, i) => {
      const x = 56 + (i % 12) * 46, y = 72 + Math.floor(i / 12) * 34;
      if (i === this.sel) rect(ctx, x - 16, y - 14, 32, 30, 'K3');
      if (e.seen && e.icon) drawScaled(ctx, e.icon, x, y, 1);
      else if (e.seen) { rect(ctx, x - 6, y - 6, 12, 12, 'K4'); G.small.draw(ctx, e.name.slice(0, 1), x, y - 4, { align: 'center', color: e.color }); }
      else G.small.draw(ctx, '?', x, y - 4, { align: 'center', color: 'K7' });
    });
    const e = es[Math.min(this.sel, es.length - 1)];
    rect(ctx, 40, 262, 560, 1, 'B1');
    if (e) {
      G.font.draw(ctx, e.seen ? e.name : '???', 48, 270, { color: e.seen ? e.color : 'K7' });
      G.font.draw(ctx, e.seen ? e.desc : tr(L('尚未发现。', 'Not yet discovered.')), 48, 288, { color: 'K8', wrap: 540, lineH: 14 });
    }
    drawHint(ctx, 320, 326, [['nav', tr(L('选择', 'Select'))], ['special', tr(L('切换页', 'Tab'))], ['cancel', tr(L('返回', 'Back'))]]);
    void PARTS_BY_ID;
  }
}
