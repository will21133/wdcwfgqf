// Joining and leaving (GDD2 §5.1):
//   JoinPanel           the title's "同行 Together": four slot cards; a free device presses
//                       A / Start / Enter / F (left half) / K (right half) to take a seat, then
//                       readies up; B / Esc leaves. Everyone ready → the workshop.
//   DisconnectOverlay   a joined pad went away: the game pauses until it comes back, or the
//                       others press Start / Esc to carry on without that hand.
//   joinSeat / leaveSeat  claim / release a slot and tell the current room's bus (playerJoin /
//                       playerLeave), so notes and eggs can react. Seats taken on the title (no
//                       world yet) announce themselves on the next world (flushJoinEvents).
//   renderJoinHold      next to a solo player a free device joins by HOLDING its join button
//                       (devices.JOIN_HOLD): the prompt that fills while it is held.
import type { Renderer } from '../../engine/gfx/renderer';
import type { Overlay } from './overlay';
import type { World } from '../world/world';
import { G, sfx } from '../G';
import { devices, MAX_SLOTS, JOIN_HOLD } from '../../engine/devices';
import { raw, padIndex, type DeviceId, type PlayerInput } from '../../engine/input';
import { tr, type L10n } from '../i18n';
import { S } from '../strings';
import { Text } from './text';
import { rect } from './draw';
import { drawPrompt, promptW, promptH, drawStamp, drawPadGlyph, padGlyphW, drawKeycap, keycapW, drawBits } from './widgets';
import { drawHint } from './prompts';
import { drawSlotBadge, drawSlotPlate, slotColor, ROMAN, ROMAN_LATIN, SLOT_SHADES } from '../players';
import { tickFramesFor } from '../entities/player';
import { handDef } from '../progression/hands';
import { ease, clamp } from '../../engine/math';

import '../strings/f2';

const CN_NUM = ['一', '二', '三', '四'];
/** "{n}" → the slot's numeral (第二根 / Hand II) */
export function slotText(key: string, slot: number, roman = false): L10n {
  const s = S('f2', key);
  return { zh: s.zh.replace('{n}', roman ? ROMAN[slot % 4] : CN_NUM[slot % 4]), en: s.en.replace('{n}', ROMAN_LATIN[slot % 4]) };
}

/** what a device is called on a slot card */
export function deviceName(id: DeviceId): L10n {
  if (id === 'kbm') return S('f2', 'devKbm');
  if (id === 'kbL') return S('f2', 'devKbL');
  if (id === 'kbR') return S('f2', 'devKbR');
  if (id.startsWith('pad')) { const s = S('f2', 'devPad'), n = String(padIndex(id) + 1); return { zh: s.zh.replace('{n}', n), en: s.en.replace('{n}', n) }; }
  return S('f2', 'devBot');
}

/** the world of the scene on screen (for bus events), if it has one */
function currentWorld(): World | null {
  const s = G.scenes.current as { world?: World } | null;
  return s?.world ?? null;
}

/** seats taken while no world was on screen (the title): announced on the next world's bus */
const pendingJoins: number[] = [];

/** seat a device in a free slot (or `slot`); emits playerJoin on the current room's bus */
export function joinSeat(id: DeviceId, slot = devices.freeSlot()): PlayerInput | null {
  if (slot < 0 || slot >= MAX_SLOTS) return null;
  const inp = devices.claim(id, slot);
  // refused: that device is the one the solo hand is using
  if (inp.slot !== slot) return null;
  // the press that joined must not also act (dash / confirm / pause) on the same tick
  for (const a of ['confirm', 'dash', 'pause', 'attack', 'interact', 'cancel', 'special'] as const) inp.consume(a);
  const w = currentWorld();
  if (w) w.bus.emit('playerJoin', { slot });
  else if (!pendingJoins.includes(slot)) pendingJoins.push(slot);
  return inp;
}

/** free a slot; emits playerLeave on the current room's bus */
export function leaveSeat(slot: number) {
  if (!devices.input(slot)) return;
  devices.release(slot);
  const i = pendingJoins.indexOf(slot);
  if (i >= 0) { pendingJoins.splice(i, 1); return; }   // joined and left on the title: nothing to tell
  currentWorld()?.bus.emit('playerLeave', { slot });
}

/** the first world after the title: tell its bus about the hands that sat down there */
export function flushJoinEvents(w: World) {
  for (const slot of pendingJoins.splice(0)) if (devices.input(slot)) w.bus.emit('playerJoin', { slot });
}

/** the glyph a device joins with (pads A, keyboard Enter, halves F / K) */
function drawJoinKey(ctx: CanvasRenderingContext2D, id: DeviceId, x: number, y: number): number {
  if (id.startsWith('pad')) return drawPadGlyph(ctx, 'A', x, y);
  return drawKeycap(ctx, id === 'kbL' ? 'F' : id === 'kbR' ? 'K' : 'ENTER', x, y);
}
function joinKeyW(id: DeviceId): number { return id.startsWith('pad') ? padGlyphW('A') : keycapW(id === 'kbL' ? 'F' : id === 'kbR' ? 'K' : 'ENTER'); }

/**
 * Next to a solo player, a free device joins by holding its join button (GDD2 §5.1 hot join;
 * a tap would also be the solo player's dash / confirm, so it must be deliberate). While it is
 * held a plate fills in the new hand's colour; after a tap, the hub shows the hint briefly.
 * UI layer, 640×360 logical; `cy` is the plate's vertical centre.
 */
export function renderJoinHold(ctx: CanvasRenderingContext2D, o: { cy?: number; hint?: boolean } = {}) {
  const h = devices.joinHold;
  const hint = !h && o.hint ? devices.joinHint : null;
  if (!h && !hint) return;
  const id = (h ?? hint)!.id, slot = (h ?? hint)!.slot;
  if (slot < 0) return;
  const label = slotText('holdJoin', slot);
  const ls = Text.lineH('body'), ph = promptH();
  const kw = joinKeyW(id), tw = Math.ceil(Text.measure(label, 'body').w);
  const w = 22 + kw + 6 + tw + 12, hh = Math.max(ph, Math.ceil(ls)) + 12;
  const x = Math.round(320 - w / 2), y = Math.round((o.cy ?? 62) - hh / 2);
  const a = h ? 1 : clamp(hint!.k * 3, 0, 1);
  ctx.globalAlpha = a;
  drawSlotPlate(ctx, slot, x, y, w, hh, { column: 14 });
  drawSlotBadge(ctx, slot, x + 9, y + hh / 2 - 1);
  const ky = Math.round(y + (hh - 4 - ph) / 2);
  drawJoinKey(ctx, id, x + 22, ky);
  Text.draw(ctx, label, x + 22 + kw + 6, ky + ph / 2, { color: 'K10', valign: 'middle' });
  // the fill: a bar along the bottom edge in the new hand's colour
  const bw = w - 20, k = h ? h.k : 0;
  rect(ctx, x + 18, y + hh - 5, bw, 2, 'K0');
  if (k > 0) rect(ctx, x + 18, y + hh - 5, Math.max(1, Math.round(bw * k)), 2, slotColor(slot));
  ctx.globalAlpha = 1;
}
export { JOIN_HOLD };

/**
 * UI-layer banners that name a hand (hot join "Hand II wakes", "joins at the next room", "has
 * left"): a slot plate with the hand's badge and a 12px line, top-centre under the purse; it drops
 * in, holds, then fades. Several stack downwards.
 */
export class SlotBanners {
  private list: { slot: number; text: L10n; t: number; dur: number; dim: boolean }[] = [];
  show(slot: number, text: L10n, dur = 2.8, dim = false) {
    this.list = this.list.filter((b) => b.slot !== slot);
    this.list.push({ slot, text, t: 0, dur, dim });
  }
  update(dt: number) {
    for (const b of this.list) b.t += dt;
    this.list = this.list.filter((b) => b.t < b.dur);
  }
  render(ctx: CanvasRenderingContext2D, top = 46) {
    const lb = Text.lineH('body');
    const hh = Math.ceil(lb) + 10;
    let y = top;
    for (const b of this.list) {
      const kIn = ease.outCubic(clamp(b.t / 0.22, 0, 1)), kOut = clamp((b.dur - b.t) / 0.45, 0, 1);
      const a = Math.min(kIn, kOut);
      if (a <= 0) continue;
      const tw = Math.ceil(Text.measure(b.text, 'body').w);
      const w = tw + 46;
      const x = Math.round(320 - w / 2), yy = Math.round(y - (1 - kIn) * 8);
      ctx.globalAlpha = a;
      drawSlotPlate(ctx, b.slot, x, yy, w, hh, { column: 16, dim: b.dim });
      drawSlotBadge(ctx, b.slot, x + 10, yy + hh / 2, b.dim ? 'K7' : undefined);
      Text.draw(ctx, b.text, x + 26 + tw / 2, yy + hh / 2, { align: 'center', color: b.dim ? 'K8' : 'K10', valign: 'middle' });
      // a short glint runs along the lit top edge as it lands
      if (!b.dim && b.t < 0.6) { const gx = x + 4 + Math.round((w - 12) * ease.outCubic(b.t / 0.6)); rect(ctx, gx, yy + 1, 4, 1, 'W'); }
      ctx.globalAlpha = 1;
      y += hh + 4;
    }
  }
}

// ───────────────────────── title: the join panel ─────────────────────────
/** everyone ready → this long, then the workshop */
const GO_AFTER = 1.2;
/** …and nobody has left for this long (a hand that sat down is not ready yet, which gates it anyway) */
const REJOIN_GRACE = 3;
interface SeatUi { ready: boolean; t: number; readyT: number; justJoined: boolean }

export class JoinPanel implements Overlay {
  blocks = true;
  hidesNotes = true;
  t = 0;
  private seats: (SeatUi | null)[] = [null, null, null, null];
  private goT = -1;
  private closing = -1;
  /** seconds since a hand left (nobody launches while it may be sitting back down) */
  private sinceChange = 9;

  constructor(private onGo: () => void) {
    sfx('uiOpen');
    // the lobby: every seat reads only its own device; a free device's tap joins
    devices.setLobby(true);
    // hands already seated (back from the workshop) keep their seats, not ready yet
    for (const p of devices.players) if (p.kind !== 'bot') this.seats[p.slot] = { ready: false, t: 1, readyT: -1, justJoined: false };
  }

  update(dt: number): boolean {
    this.t += dt;
    this.sinceChange += dt;
    if (this.closing >= 0) { this.closing += dt; devices.setLobby(false); return this.closing < 0.25; }
    if (this.t < 0.2) return true;
    // a free device presses its join button → the next free slot
    const id = devices.joinPressed();
    if (id) {
      const slot = devices.freeSlot();
      if (slot >= 0 && joinSeat(id, slot)) {
        this.seats[slot] = { ready: false, t: 0, readyT: -1, justJoined: true };
        sfx('cogWind');
        devices.input(slot)!.rumble(0.3, 0.3, 120);
        this.goT = -1;
      }
    }
    // each seated hand: confirm = ready, cancel = not ready / leave
    for (let s = 0; s < MAX_SLOTS; s++) {
      const ui = this.seats[s], inp = devices.input(s);
      if (ui && !inp) { this.seats[s] = null; this.sinceChange = 0; continue; }
      if (!inp || inp.kind === 'bot') continue;
      if (!ui) { this.seats[s] = { ready: false, t: 1, readyT: -1, justJoined: false }; continue; }
      ui.t += dt;
      if (ui.readyT >= 0) ui.readyT += dt;
      if (ui.justJoined) { ui.justJoined = false; continue; }
      // K is a keyboard + mouse player's alternate cancel key, but also the right half's join key
      const cancel = inp.pressed('cancel') && !(inp.kind === 'kbm' && inp.pressed('special'));
      if (cancel) {
        inp.consume('cancel');
        if (ui.ready) { ui.ready = false; ui.readyT = -1; sfx('uiBack'); }
        else { leaveSeat(s); this.seats[s] = null; this.sinceChange = 0; sfx('uiBack'); }
        this.goT = -1;
        continue;
      }
      if (!ui.ready && (inp.pressed('confirm') || inp.pressed('interact'))) {
        inp.consume('confirm');
        ui.ready = true; ui.readyT = 0;
        sfx('uiSelect');
        inp.rumble(0.2, 0.4, 90);
      }
    }
    const seated = this.seats.filter(Boolean) as SeatUi[];
    // nobody seated: back closes the panel
    if (!seated.length && G.input.pressed('cancel')) { G.input.consume('cancel'); sfx('uiBack'); this.closing = 0; return true; }
    // everyone seated is ready → a beat, then off to the workshop (a hand that just left gets a
    // moment to sit back down before the others go)
    if (seated.length && seated.every((u) => u.ready)) {
      if (this.goT < 0) { this.goT = 0; sfx('chimeRing', { vol: 0.5 }); }
      this.goT += dt;
      if (this.goT > GO_AFTER && this.sinceChange > REJOIN_GRACE) { this.closing = 0; devices.setLobby(false); this.onGo(); }
    } else this.goT = -1;
    return true;
  }

  render(r: Renderer) {
    const ctx = r.ui2;
    const kIn = ease.outCubic(clamp(this.t / 0.25, 0, 1)) * (this.closing >= 0 ? 1 - clamp(this.closing / 0.25, 0, 1) : 1);
    ctx.globalAlpha = 0.78 * kIn;
    rect(ctx, 0, 0, 640, 360, 'K0');
    ctx.globalAlpha = kIn;
    // header
    const lt = Text.lineH('title'), ls = Text.lineH('small');
    const hy = 18 + Math.round((1 - kIn) * -8);
    Text.draw(ctx, S('f2', 'together'), 320, hy, { size: 'title', align: 'center', color: 'B5', outline: 'K0' });
    Text.draw(ctx, S('f2', 'togetherSub'), 320, hy + lt + 2, { size: 'small', align: 'center', color: 'K8' });
    const ruleY = Math.round(hy + lt + 2 + ls + 5);
    rect(ctx, 200, ruleY, 240, 1, 'B2');
    rect(ctx, 317, ruleY - 2, 6, 5, 'B4');
    // four cards
    const cw = 140, gap = 10, x0 = Math.round(320 - (4 * cw + 3 * gap) / 2);
    const cy = ruleY + 12, ch = Math.min(232, 360 - cy - 40);
    for (let s = 0; s < MAX_SLOTS; s++) {
      const k = ease.outBack(clamp((this.t - 0.05 - s * 0.05) / 0.3, 0, 1));
      const x = x0 + s * (cw + gap), y = cy + Math.round((1 - k) * 30);
      this.drawCard(ctx, s, x, y, cw, ch);
    }
    // footer: what happens next
    const fy = cy + ch + 12;
    const seated = this.seats.filter(Boolean) as SeatUi[];
    if (seated.length && seated.every((u) => u.ready)) {
      Text.draw(ctx, S('f2', 'allReady'), 320, fy + promptH() / 2, { align: 'center', color: Math.floor(this.t * 6) % 2 ? 'B6' : 'B5', valign: 'middle' });
      // how long until we go: a thin brass bar under the line
      const left = Math.max(GO_AFTER - Math.max(0, this.goT), REJOIN_GRACE - this.sinceChange), tot = Math.max(GO_AFTER, REJOIN_GRACE);
      const bw = 120, by = Math.round(fy + promptH() + 3);
      rect(ctx, 320 - bw / 2, by, bw, 2, 'K2');
      rect(ctx, 320 - bw / 2, by, Math.round(bw * clamp(1 - left / tot, 0, 1)), 2, 'B5');
    } else if (seated.length) {
      Text.draw(ctx, S('f2', 'waitReady'), 320, fy + promptH() / 2, { align: 'center', color: 'K8', valign: 'middle' });
    } else {
      drawHint(ctx, 320, fy, [['cancel', tr(S('f2', 'back'))]]);
    }
    ctx.globalAlpha = 1;
  }

  private drawCard(ctx: CanvasRenderingContext2D, s: number, x: number, y: number, w: number, h: number) {
    const ui = this.seats[s];
    const inp = devices.input(s);
    const on = !!ui && !!inp;
    const lb = Text.lineH('body'), ls = Text.lineH('small');
    drawSlotPlate(ctx, s, x, y, w, h, { dim: !on });
    // header strip: badge + numeral
    const hh = Math.max(20, Math.ceil(lb) + 6);
    rect(ctx, x + 2, y + 2, w - 4, hh - 2, on ? SLOT_SHADES[s][2] : 'K1');
    rect(ctx, x + 2, y + hh, w - 4, 1, on ? SLOT_SHADES[s][1] : 'K3');
    drawSlotBadge(ctx, s, x + 12, y + 2 + (hh - 2) / 2, on ? undefined : 'K6');
    Text.draw(ctx, ROMAN[s], x + 21, y + 2 + (hh - 2) / 2, { color: on ? 'K10' : 'K7', valign: 'middle' });
    // the hand on a little brass plinth (dim silhouette when the seat is free)
    const fr = tickFramesFor(s, handDef('tick'));
    const spr = fr.idle.down[Math.floor((G.time + s * 0.3) * 2) % fr.idle.down.length];
    const px = x + w / 2, py = y + hh + 58;
    rect(ctx, px - 18, py + 2, 36, 3, on ? 'B2' : 'K2');
    rect(ctx, px - 16, py + 1, 32, 1, on ? 'B4' : 'K3');
    ctx.save();
    if (!on) ctx.globalAlpha *= 0.28;
    const k3 = 3, sw = spr.w * k3, sh = spr.h * k3;
    const bob = on && ui!.readyT >= 0 && ui!.readyT < 0.3 ? -Math.round(Math.sin((ui!.readyT / 0.3) * Math.PI) * 4) : 0;
    ctx.drawImage(spr.img, Math.round(px - spr.ox * k3), Math.round(py - spr.oy * k3) + bob, sw, sh);
    ctx.restore();
    if (on && ui!.t < 0.35) {
      // join flash: a ring in the slot colour
      const k = ui!.t / 0.35;
      ctx.globalAlpha *= 1 - k;
      const rr = 10 + k * 26;
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; rect(ctx, Math.round(px + Math.cos(a) * rr), Math.round(py - 14 + Math.sin(a) * rr * 0.8), 2, 2, slotColor(s)); }
      ctx.globalAlpha = 1;
    }
    let ty = py + 12;
    if (on) {
      // name, device
      Text.draw(ctx, handDef('tick').name, px, ty, { align: 'center', color: 'K10' });
      ty += lb;
      Text.draw(ctx, handDef('tick').title, px, ty, { size: 'small', align: 'center', color: 'K7', maxW: w - 12 });
      ty += ls + 4;
      // which device drives this seat, on a little dark tag
      const dn = deviceName(inp!.device), dw = Math.ceil(Text.measure(dn, 'small').w) + 10;
      rect(ctx, Math.round(px - dw / 2), Math.round(ty), dw, Math.ceil(ls) + 3, 'K0');
      Text.draw(ctx, dn, px, ty + 1 + Text.inkMid('small') + 0.5, { size: 'small', align: 'center', color: 'K9', valign: 'middle' });
      ty += ls + 3;
      // this hand's own prompts at the bottom of the card
      const ph = promptH();
      const rows: [import('../../engine/input').Action, L10n][] = ui!.ready ? [['cancel', S('f2', 'unready')]] : [['confirm', S('f2', 'ready')], ['cancel', S('f2', 'leave')]];
      let by = y + h - 8 - rows.length * (ph + 4) + 4;
      const ruleY = by - 6;
      rect(ctx, x + 10, ruleY, w - 20, 1, 'K3');
      // ready: a stamp in the space between the name and the prompts
      if (ui!.ready) drawStamp(ctx, S('f2', 'readyStamp'), px, Math.round((ty + ruleY) / 2), slotColor(s), Math.min(0.85, ui!.readyT + 0.02));
      for (const [a, label] of rows) {
        const tw = Math.ceil(Text.measure(label, 'body').w);
        const total = promptW(a, inp) + 4 + tw;
        const bx = Math.round(px - total / 2);
        drawPrompt(ctx, a, bx, by, inp);
        Text.draw(ctx, label, bx + promptW(a, inp) + 4, by + ph / 2, { color: a === 'confirm' ? 'B5' : 'K8', valign: 'middle' });
        by += ph + 4;
      }
    } else {
      // how to join: only the join buttons that can seat someone right now (a keyboard that is
      // already taken does not advertise Enter / F / K), centred in the space under the plinth
      const ph = promptH();
      const kbm = devices.isFree('kbm'), kbl = devices.isFree('kbL'), kbr = devices.isFree('kbR');
      const split = kbl || kbr;
      const gh = lb + 4 + ph + (split ? 6 + ph : 0);
      ty = Math.round(ty + Math.max(0, (y + h - 10 - ty - gh) * 0.4));
      Text.draw(ctx, S('f2', 'pressJoin'), px, ty, { align: 'center', color: Math.floor(this.t * 2 + s) % 2 ? 'K10' : 'K8' });
      ty += lb + 4;
      const gA = padGlyphW('A'), kE = keycapW('ENTER');
      let bx = Math.round(px - (gA + (kbm ? 6 + kE : 0)) / 2);
      drawPadGlyph(ctx, 'A', bx, ty);
      if (kbm) drawKeycap(ctx, 'ENTER', bx + gA + 6, ty);
      if (!split) return;
      ty += ph + 6;
      const kF = kbl ? keycapW('F') : 0, kK = kbr ? keycapW('K') : 0, gap = kbl && kbr ? 3 : 0;
      const label = S('f2', kbl && kbr ? 'splitKb' : kbl ? 'devKbL' : 'devKbR');
      const lw = Math.ceil(Text.measure(label, 'small').w);
      bx = Math.round(px - (kF + gap + kK + 5 + lw) / 2);
      if (kbl) drawKeycap(ctx, 'F', bx, ty);
      if (kbr) drawKeycap(ctx, 'K', bx + kF + gap, ty);
      Text.draw(ctx, label, bx + kF + gap + kK + 5, ty + ph / 2, { size: 'small', color: 'K7', valign: 'middle' });
    }
  }
}

// ───────────────────────── a joined pad went away ─────────────────────────
/** 15×8 controller silhouette; '.' details (d-pad, buttons) are cut out of the body */
const PAD_SHAPE = [
  '..####...####..',
  '.#############.',
  '###.#######.###',
  '##...#####.#.##',
  '###.#######.###',
  '#####.....#####',
  '####.......####',
  '.##.........##.',
];
function drawPadIcon(ctx: CanvasRenderingContext2D, x: number, y: number, c: string) {
  // ink outline around the silhouette, then the body (the cut-outs show the ink through)
  for (let j = 0; j < PAD_SHAPE.length; j++) for (let i = 0; i < 15; i++) if (PAD_SHAPE[j][i] === '#' || (j >= 2 && j <= 4 && i > 1 && i < 13)) rect(ctx, x + i - 1, y + j - 1, 3, 3, 'K0');
  drawBits(ctx, PAD_SHAPE, x, y, c);
}

export class DisconnectOverlay implements Overlay {
  blocks = true;
  hidesNotes = true;
  t = 0;
  done = false;
  constructor(public slot: number, private drop: (slot: number) => void) {
    sfx('uiOpen');
    G.audio.muffle(true, 600);
  }
  private get device(): DeviceId | null { return devices.input(this.slot)?.device ?? null; }
  update(dt: number): boolean {
    this.t += dt;
    const dev = this.device;
    // the seat is gone, or the pad is back: carry on
    if (!dev || !dev.startsWith('pad') || raw.pads[padIndex(dev)]?.connected) { G.audio.muffle(false); sfx('uiSelect'); return false; }
    // GDD2 §5.1: anyone still here presses Start (keyboards: their pause key) to go on without them
    const others = this.others();
    // (nobody else seated but bots: any keyboard Esc or any pad's Start)
    const go = others.length ? others.find((p) => p.pressed('pause')) : raw.pressed.has('Escape') || raw.pads.some((p) => p?.connected && p.pressed.has(9)) ? G.input : null;
    if (this.t > 0.3 && go) {
      go.consume('pause');
      this.drop(this.slot);
      G.audio.muffle(false);
      sfx('uiBack');
      return false;
    }
    return true;
  }
  /** the hands still at the controls */
  private others(): PlayerInput[] { return devices.humans.filter((p) => p.slot !== this.slot); }
  /** one pause prompt per kind of device still seated (a pad's Start, a keyboard's Esc / Backspace) */
  private prompts(): PlayerInput[] {
    const out: PlayerInput[] = [], seen = new Set<string>();
    for (const p of this.others()) {
      const key = p.kind === 'pad' ? 'pad' : p.device;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }
  render(r: Renderer) {
    const ctx = r.ui2;
    const k = ease.outCubic(clamp(this.t / 0.2, 0, 1));
    ctx.globalAlpha = 0.6 * k;
    rect(ctx, 0, 0, 640, 360, 'K0');
    ctx.globalAlpha = k;
    const s = this.slot;
    const lb = Text.lineH('body');
    const title = slotText('lostTitle', s, true), body = S('f2', 'lostBody'), drop = S('f2', 'lostDrop');
    const who: (PlayerInput | null)[] = this.prompts();
    if (!who.length) who.push(null);
    const keysW = who.reduce((a, p, i) => a + promptW('pause', p) + (i ? 9 : 0), 0);
    const w = Math.max(260, Math.ceil(Math.max(Text.measure(title, 'body').w, Text.measure(body, 'body').w, keysW + 4 + Text.measure(drop, 'body').w)) + 60);
    const h = Math.ceil(16 + lb + 8 + lb + 14 + promptH() + 14);
    const x = Math.round(320 - w / 2), y = Math.round(160 - h / 2);
    drawSlotPlate(ctx, s, x, y, w, h, { column: 22 });
    drawSlotBadge(ctx, s, x + 13, y + 16);
    // a little controller that blinks between the hand's colour and dark
    const on = Math.floor(this.t * 2) % 2 === 0;
    drawPadIcon(ctx, x + 6, y + h - 19, on ? slotColor(s) : 'K4');
    let ty = y + 12;
    Text.draw(ctx, title, x + 34, ty, { color: slotColor(s) });
    ty += lb + 6;
    Text.draw(ctx, body, x + 34, ty, { color: 'K9' });
    ty += lb + 12;
    let kx = x + 34;
    who.forEach((p, i) => {
      if (i) { Text.draw(ctx, '/', kx + 2, ty + promptH() / 2, { color: 'K6', valign: 'middle' }); kx += 9; }
      kx += drawPrompt(ctx, 'pause', kx, ty, p);
    });
    Text.draw(ctx, drop, kx + 4, ty + promptH() / 2, { color: 'K8', valign: 'middle' });
    ctx.globalAlpha = 1;
  }
}

/**
 * Scenes that can pause for a lost pad implement this; the hub registers once at import and calls
 * the scene on screen.
 */
export interface DeviceLossHost { onDeviceLost(slot: number): void }
devices.onDisconnect((slot) => {
  const sc = G.scenes.current as Partial<DeviceLossHost> | null;
  sc?.onDeviceLost?.(slot);
});
