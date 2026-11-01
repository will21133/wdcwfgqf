// Input 2.0 (PLAN2 §1.3): raw keyboard / mouse / every gamepad by gp.index, one PlayerInput per
// joined slot, and the menu aggregate `input` (= G.input, the 1.0 API: OR of the joined devices,
// every device while nobody has joined). Claims, joining and sequences live in devices.ts.
// Edge states ("pressed" / "released") are latched until the fixed update tick that sees them ends.

import { rumblePad, rumbleAll } from './rumble';

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'attack' | 'special' | 'dash' | 'rewind' | 'fork' | 'interact'
  | 'pause' | 'confirm' | 'cancel' | 'info' | 'tabL' | 'tabR';

export const ACTIONS: readonly Action[] = ['up', 'down', 'left', 'right', 'attack', 'special', 'dash', 'rewind', 'fork', 'interact', 'pause', 'confirm', 'cancel', 'info', 'tabL', 'tabR'];

export type DeviceId = 'kbm' | 'kbL' | 'kbR' | `pad${number}` | `bot${number}`;
/** keyboard layouts: kbm = keyboard + mouse (1.0), kbL / kbR = the two halves of a shared keyboard */
export type KbProfile = 'kbm' | 'kbL' | 'kbR';
export type DeviceKind = 'kbm' | 'kb' | 'pad' | 'bot';

export const REBINDABLE: Action[] = ['up', 'down', 'left', 'right', 'attack', 'special', 'dash', 'rewind', 'fork', 'interact', 'info'];

export type Binding = string; // KeyboardEvent.code, or 'Mouse0' / 'Mouse2'
export type Bindings = Record<Action, Binding[]>;

/** keyboard + mouse (GDD2 §2.1: the kbm and keyboard-only columns, as in 1.0) */
export const DEFAULT_BINDINGS: Bindings = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['Mouse0', 'KeyJ'],
  special: ['Mouse2', 'KeyK'],
  dash: ['Space', 'ShiftLeft'],
  rewind: ['KeyQ', 'KeyL'],
  fork: ['KeyR', 'KeyI'],
  interact: ['KeyE', 'KeyF'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'Space', 'KeyE', 'KeyJ', 'NumpadEnter'],
  cancel: ['Escape', 'Backspace', 'KeyK'],
  info: ['Tab'],
  tabL: ['KeyQ'],
  tabR: ['KeyE'],
};

/** split keyboard (GDD2 §2.2): kbL = left half, kbR = right half; no mouse, aim follows movement */
export const KB_DEFAULTS: Record<KbProfile, Bindings> = {
  kbm: DEFAULT_BINDINGS,
  kbL: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    attack: ['KeyF'], special: ['KeyG'], dash: ['KeyH'],
    rewind: ['KeyR'], fork: ['KeyT'], interact: ['KeyY'], info: ['Tab'],
    pause: ['Escape'], confirm: ['KeyF', 'KeyY'], cancel: ['KeyG', 'Escape'],
    tabL: ['KeyQ'], tabR: ['KeyE'],
  },
  kbR: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    attack: ['KeyK'], special: ['KeyL'], dash: ['Semicolon'],
    rewind: ['KeyO'], fork: ['KeyP'], interact: ['KeyI'], info: ['BracketRight'],
    pause: ['Backspace'], confirm: ['KeyK', 'KeyI', 'Enter'], cancel: ['KeyL', 'Backspace'],
    tabL: ['Comma'], tabR: ['Period'],
  },
};

const cloneB = (b: Bindings): Bindings => Object.fromEntries(ACTIONS.map((a) => [a, b[a].slice()])) as Bindings;
/** live keyboard tables; settings.ts copies each profile's saved rebinds into these objects */
export const KB: Record<KbProfile, Bindings> = { kbm: cloneB(KB_DEFAULTS.kbm), kbL: cloneB(KB_DEFAULTS.kbL), kbR: cloneB(KB_DEFAULTS.kbR) };

/** Xbox / standard mapping: A0 B1 X2 Y3 LB4 RB5 LT6 RT7 View8 Menu9 LS10 RS11 dpad 12–15 */
export const PAD_BUTTONS: Record<Action, number[]> = {
  up: [12], down: [13], left: [14], right: [15],
  attack: [2, 7], special: [3, 6], dash: [0], rewind: [4], fork: [5], interact: [1],
  pause: [9], confirm: [0], cancel: [1], info: [8], tabL: [4], tabR: [5],
};
/** settings: swap the bumpers (GDD2 §2.1: LB rewind / RB fork by default) */
export const padLayout = { swapBumpers: false };
function padButtons(a: Action): number[] {
  if (padLayout.swapBumpers) { if (a === 'rewind') return [5]; if (a === 'fork') return [4]; }
  return PAD_BUTTONS[a];
}

/** names pad buttons get in recentCodes / lastPressedCode */
export const PAD_CODE = ['PadA', 'PadB', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadLT', 'PadRT', 'PadView', 'PadMenu', 'PadLS', 'PadRS', 'PadUp', 'PadDown', 'PadLeft', 'PadRight', 'PadHome'];

/** QA autopilot / AI hand: what a bot is "pressing" this tick */
export interface BotInput { move: { x: number; y: number }; aimX: number; aimY: number; held: Set<Action>; pressed: Set<Action> }

export const kindOf = (id: DeviceId): DeviceKind => (id === 'kbm' ? 'kbm' : id === 'kbL' || id === 'kbR' ? 'kb' : id.startsWith('pad') ? 'pad' : 'bot');
export const padIndex = (id: DeviceId): number => (id.startsWith('pad') ? Number(id.slice(3)) : -1);

const KEYBOARD_AIM_KEYS = new Set(['KeyJ', 'KeyK', 'KeyL']);

/**
 * Forced prompt glyphs (ONBOARD2 §1.7, tests: ?glyph=kbm|kb|pad): every player's prompts use this
 * family, and 'kb' shows the keyboard-only column (J / K / L / I …). null = follow the devices.
 */
export const glyphs = { force: null as null | 'kbm' | 'kb' | 'pad' };
/**
 * Actions whose prompt follows the key the player actually pressed for them (lastCodeFor). Menu
 * actions (confirm, cancel, pause, tabs) share keys with gameplay actions (Space dashes and
 * confirms), so their prompts keep the table's first key.
 */
const TRACKED: ReadonlySet<Action> = new Set<Action>(['up', 'down', 'left', 'right', 'attack', 'special', 'dash', 'rewind', 'fork', 'interact', 'info']);
/**
 * The keyboard-only column (GDD2 §2.1) differs from keyboard + mouse only here: J attack, K special,
 * L rewind, I fork. Movement (WASD), dash (Space) and interact (E) are the same in both.
 */
const COLUMN_ACTIONS: ReadonlySet<Action> = new Set<Action>(['attack', 'special', 'rewind', 'fork']);
/** ticks without a real mouse move after which a J-attacking player counts as keyboard-only (20 s) */
const KB_ONLY_TICKS = 20 * 60;

// ───────────────────────── raw devices ─────────────────────────
export class PadState {
  connected = false;
  id = '';
  held = new Set<number>();
  pressed = new Set<number>();
  released = new Set<number>();
  lx = 0; ly = 0; rx = 0; ry = 0;
  /** the left stick was pushed past half-way last poll (deliberate use, not drift) */
  private pushed = false;
  constructor(readonly index: number) {}
  /** returns true when this poll counts as the player picking the pad up */
  update(gp: Gamepad): boolean {
    let used = false;
    this.connected = true;
    this.id = gp.id;
    const now = new Set<number>();
    gp.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) now.add(i); });
    for (const i of now) if (!this.held.has(i)) { this.pressed.add(i); used = true; }
    for (const i of this.held) if (!now.has(i)) this.released.add(i);
    this.held = now;
    const dz = (x: number, y: number, d: number): [number, number] => {
      const m = Math.hypot(x, y);
      if (m < d) return [0, 0];
      const k = Math.min(1, (m - d) / (1 - d)) / m;
      return [x * k, y * k];
    };
    [this.lx, this.ly] = dz(gp.axes[0] ?? 0, gp.axes[1] ?? 0, 0.22);
    [this.rx, this.ry] = dz(gp.axes[2] ?? 0, gp.axes[3] ?? 0, 0.3);
    const push = Math.hypot(this.lx, this.ly) > 0.5 || Math.hypot(this.rx, this.ry) > 0.5;
    if (push && !this.pushed) used = true;
    this.pushed = push;
    return used;
  }
  lose() {
    this.connected = false;
    for (const i of this.held) this.released.add(i);
    this.held = new Set();
    this.lx = this.ly = this.rx = this.ry = 0;
  }
  clearEdges() { this.pressed.clear(); this.released.clear(); }
  get sticks() { return this.lx !== 0 || this.ly !== 0 || this.rx !== 0 || this.ry !== 0; }
}

export class RawInput {
  held = new Set<Binding>();
  pressed = new Set<Binding>();
  released = new Set<Binding>();
  /** pointer in internal (640x360) coords */
  mx = 320; my = 180;
  mouseInside = false;
  /** 1.0 flag: aim follows the mouse (mouse moved / clicked) rather than a pad or the keyboard aim keys */
  mouseAim = true;
  /** the same flag, but only the keyboard and mouse flip it (a kbm player next to pad players) */
  kbMouseAim = true;
  /** 1.0 lastDevice: the device family used most recently (prompt glyphs while nobody has joined) */
  family: 'kbm' | 'pad' = 'kbm';
  wheel = 0;
  /** any key / button pressed this tick (audio unlock) */
  anyPressed = false;
  /** last key / button code pressed (rebinding UI); pad buttons read 'PadA', 'PadB' … */
  lastPressedCode: string | null = null;
  /**
   * when each keyboard / mouse code was last pressed (a running counter): the prompt for an action
   * shows the key that last triggered it, so a keyboard-only player sees L / I / J (ONBOARD2 §1.7)
   */
  readonly codeSeq = new Map<string, number>();
  private seq = 0;
  /** fixed ticks so far, and the tick of the last real mouse move / click */
  private ticks = 0;
  private mouseTick = -1e9;
  /** which column of the kbm attack binding last attacked (0 = mouse, 1 = J) */
  private attackCol = 0;
  /**
   * the keyboard column this player plays with: 1 (keyboard only: J / K / L / I) after attacking
   * with J and no mouse movement for 20 s; else 0. Prompts for actions never pressed use it.
   */
  get kbColumn(): 0 | 1 {
    if (glyphs.force) return glyphs.force === 'kb' ? 1 : 0;
    return this.attackCol === 1 && this.ticks - this.mouseTick > KB_ONLY_TICKS ? 1 : 0;
  }
  /** every gamepad seen, by gp.index */
  pads: PadState[] = [];
  /** last physical device that pressed something or pushed a stick (mouse motion does not count) */
  lastPhys: DeviceId | null = null;
  /** devices.ts listens here: every key / button code, and pads that went away */
  onCode: ((code: string, dev: DeviceId) => void) | null = null;
  onPadLost: ((index: number) => void) | null = null;

  private toInternal: (cx: number, cy: number) => [number, number] = (x, y) => [x, y];

  attach(el: HTMLElement, toInternal: (cx: number, cy: number) => [number, number]) {
    this.toInternal = toInternal;
    const prevent = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);
    window.addEventListener('keydown', (e) => {
      if (prevent.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.press(e.code);
      this.family = 'kbm';
      if (KEYBOARD_AIM_KEYS.has(e.code)) { this.mouseAim = false; this.kbMouseAim = false; }
    });
    window.addEventListener('keyup', (e) => this.release(e.code));
    window.addEventListener('blur', () => {
      for (const b of this.held) this.released.add(b);
      this.held.clear();
    });
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const [x, y] = this.toInternal(e.clientX - r.left, e.clientY - r.top);
      if (Math.abs(x - this.mx) + Math.abs(y - this.my) > 0.5) {
        this.mouseAim = true;
        this.kbMouseAim = true;
        this.family = 'kbm';
        this.mouseTick = this.ticks;
      }
      this.mx = x; this.my = y;
      this.mouseInside = true;
    });
    el.addEventListener('mouseleave', () => (this.mouseInside = false));
    el.addEventListener('mousedown', (e) => {
      el.focus();
      this.mouseTick = this.ticks;
      this.press('Mouse' + e.button);
      this.mouseAim = true;
      this.kbMouseAim = true;
      this.family = 'kbm';
    });
    window.addEventListener('mouseup', (e) => this.release('Mouse' + e.button));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }

  private press(code: Binding) {
    if (!this.held.has(code)) this.pressed.add(code);
    this.held.add(code);
    this.lastPressedCode = code;
    this.codeSeq.set(code, ++this.seq);
    const ai = KB.kbm.attack.indexOf(code);
    if (ai >= 0) this.attackCol = ai === 0 ? 0 : 1;
    this.anyPressed = true;
    this.lastPhys = 'kbm';
    this.onCode?.(code, 'kbm');
  }
  private release(code: Binding) {
    if (this.held.has(code)) this.released.add(code);
    this.held.delete(code);
  }

  pad(i: number): PadState { return (this.pads[i] ??= new PadState(i)); }

  /** poll every gamepad once per frame (before the update ticks) */
  poll() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const seen = new Set<number>();
    for (const gp of list) {
      if (!gp || !gp.connected) continue;
      seen.add(gp.index);
      const ps = this.pad(gp.index);
      const before = new Set(ps.pressed);
      const used = ps.update(gp);
      for (const i of ps.pressed) if (!before.has(i)) {
        this.anyPressed = true;
        this.family = 'pad';
        this.mouseAim = false;
        const code = PAD_CODE[i] ?? `Pad${i}`;
        this.lastPressedCode = code;
        this.onCode?.(code, `pad${gp.index}`);
      }
      if (ps.sticks) { this.family = 'pad'; this.mouseAim = false; }
      if (used) this.lastPhys = `pad${gp.index}`;
    }
    for (const ps of this.pads) if (ps && ps.connected && !seen.has(ps.index)) { ps.lose(); this.onPadLost?.(ps.index); }
  }

  endTick() {
    this.ticks++;
    this.pressed.clear();
    this.released.clear();
    for (const p of this.pads) p?.clearEdges();
    this.anyPressed = false;
    this.wheel = 0;
  }

  connectedPads(): number[] { const out: number[] = []; for (const p of this.pads) if (p?.connected) out.push(p.index); return out; }
}

export const raw = new RawInput();

// ───────────────────────── sources ─────────────────────────
/** what one view reads: a keyboard table (+ the mouse), some pads, or a bot */
export interface Src {
  kb: Bindings | null;
  mouse: boolean;
  pads: 'all' | number[];
  bot?: () => BotInput | null | undefined;
}

function eachPad(s: Src, fn: (p: PadState) => boolean): boolean {
  if (s.pads === 'all') { for (const p of raw.pads) if (p?.connected && fn(p)) return true; return false; }
  for (const i of s.pads) { const p = raw.pads[i]; if (p?.connected && fn(p)) return true; }
  return false;
}
function kbHas(s: Src, a: Action, set: Set<Binding>): boolean {
  if (!s.kb) return false;
  for (const b of s.kb[a]) if (set.has(b) && (s.mouse || !b.startsWith('Mouse'))) return true;
  return false;
}
/** does any of this source's pads have one of `btn` in its held / pressed / released set
 *  (plain loops: this runs for every action of every view every tick, so no closures) */
const HELD = 0, PRESSED = 1, RELEASED = 2;
function padSet(p: PadState, which: number): Set<number> { return which === HELD ? p.held : which === PRESSED ? p.pressed : p.released; }
function padAny(s: Src, btn: number[], which: number): boolean {
  if (s.pads === 'all') {
    for (const p of raw.pads) if (p?.connected) { const set = padSet(p, which); for (const i of btn) if (set.has(i)) return true; }
    return false;
  }
  for (const pi of s.pads) {
    const p = raw.pads[pi];
    if (!p?.connected) continue;
    const set = padSet(p, which);
    for (const i of btn) if (set.has(i)) return true;
  }
  return false;
}
function srcDown(s: Src, a: Action): boolean {
  if (s.bot) return !!s.bot()?.held.has(a);
  if (kbHas(s, a, raw.held)) return true;
  return padAny(s, padButtons(a), HELD);
}
function srcPressed(s: Src, a: Action): boolean {
  if (s.bot) return !!s.bot()?.pressed.has(a);
  if (kbHas(s, a, raw.pressed)) return true;
  return padAny(s, padButtons(a), PRESSED);
}
function srcReleased(s: Src, a: Action): boolean {
  if (s.bot) return false; // bots: derived from the previous tick (InputView.prevBot)
  if (kbHas(s, a, raw.released)) return true;
  return padAny(s, padButtons(a), RELEASED);
}
function srcConsume(s: Src, a: Action) {
  if (s.bot) { s.bot()?.pressed.delete(a); return; }
  if (s.kb) for (const b of s.kb[a]) if (s.mouse || !b.startsWith('Mouse')) raw.pressed.delete(b);
  const btn = padButtons(a);
  eachPad(s, (p) => { for (const i of btn) p.pressed.delete(i); return false; });
}
const NO_STICK = Object.freeze({ x: 0, y: 0 });
function srcStick(s: Src, right: boolean): { x: number; y: number } {
  const list = s.pads === 'all' ? raw.pads : s.pads;
  for (const e of list) {
    const p = typeof e === 'number' ? raw.pads[e] : e;
    if (!p?.connected) continue;
    const px = right ? p.rx : p.lx, py = right ? p.ry : p.ly;
    if (px || py) return { x: px, y: py };
  }
  return NO_STICK;
}

/** every live view; endTick advances their hold timers */
const views = new Set<InputView>();
/** bumps whenever a view's sources change (the aggregate caches its list) */
export let srcEpoch = 0;
export function bumpSources() { srcEpoch++; }

const STEP = 1 / 60;

abstract class InputView {
  protected abstract srcs(): readonly Src[];
  private holdTicks: Partial<Record<Action, number>> = {};
  private prevBot = new Set<Action>();
  private navDir = { x: 0, y: 0 };
  private navTimer = { x: 0, y: 0 };

  down(a: Action): boolean {
    for (const s of this.srcs()) if (srcDown(s, a)) return true;
    return false;
  }
  pressed(a: Action): boolean {
    for (const s of this.srcs()) if (srcPressed(s, a)) return true;
    return false;
  }
  /** released this tick (keyboard, mouse, pads; bots by comparing with the last tick) */
  released(a: Action): boolean {
    for (const s of this.srcs()) if (srcReleased(s, a)) return true;
    if (this.prevBot.has(a)) { let now = false; for (const s of this.srcs()) if (s.bot && srcDown(s, a)) now = true; return !now; }
    return false;
  }
  /** pressed this tick on one of this view's pads (not the keyboard) */
  pressedOnPad(a: Action): boolean {
    for (const s of this.srcs()) if (!s.bot && padAny(s, padButtons(a), PRESSED)) return true;
    return false;
  }
  /** consume a single press so two systems don't both react; returns whether it was pressed */
  consume(a: Action): boolean {
    const was = this.pressed(a);
    for (const s of this.srcs()) srcConsume(s, a);
    return was;
  }
  /** seconds the action has been held continuously (0 when up; counts fixed ticks) */
  heldFor(a: Action): number { return this.down(a) ? (this.holdTicks[a] ?? 0) * STEP : 0; }

  /** movement vector, length <= 1 */
  move(): { x: number; y: number } {
    const S = this.srcs();
    for (const s of S) if (s.bot) { const b = s.bot(); if (b && (b.move.x || b.move.y)) return b.move; }
    let x = 0, y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    if (x || y) { const l = Math.hypot(x, y); return { x: x / l, y: y / l }; }
    // pad stick (dpad already handled via the button table above)
    for (const s of S) { const st = srcStick(s, false); if (st.x || st.y) return st; }
    return { x: 0, y: 0 };
  }
  /** right stick of this view's pads (first one pushed) */
  stick(): { x: number; y: number } {
    for (const s of this.srcs()) { const st = srcStick(s, true); if (st.x || st.y) return st; }
    return { x: 0, y: 0 };
  }
  protected leftStick(): { x: number; y: number } {
    for (const s of this.srcs()) { const st = srcStick(s, false); if (st.x || st.y) return st; }
    return { x: 0, y: 0 };
  }

  /** UI navigation helper: returns -1/0/1 per axis with key repeat */
  nav(dt: number): { x: number; y: number } {
    const out = { x: 0, y: 0 };
    const ls = this.leftStick();
    const sx = Math.sign((this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0) || (Math.abs(ls.x) > 0.5 ? ls.x : 0));
    const sy = Math.sign((this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0) || (Math.abs(ls.y) > 0.5 ? ls.y : 0));
    for (const k of ['x', 'y'] as const) {
      const v = k === 'x' ? sx : sy;
      if (v !== this.navDir[k]) {
        this.navDir[k] = v;
        if (v !== 0) { out[k] = v; this.navTimer[k] = 0.36; }
      } else if (v !== 0) {
        this.navTimer[k] -= dt;
        if (this.navTimer[k] <= 0) { out[k] = v; this.navTimer[k] = 0.085; }
      }
    }
    return out;
  }

  /** end of a fixed tick: advance hold timers, remember what the bots held */
  tickHold() {
    for (const a of ACTIONS) this.holdTicks[a] = this.down(a) ? (this.holdTicks[a] ?? 0) + 1 : 0;
    this.prevBot.clear();
    for (const s of this.srcs()) if (s.bot) { const b = s.bot(); if (b) for (const a of b.held) this.prevBot.add(a); }
  }
}

// ───────────────────────── one player's input ─────────────────────────
export class PlayerInput extends InputView {
  slot: number;
  device!: DeviceId;
  kind!: DeviceKind;
  /** set every tick by the QA autopilot / AI hand when kind === 'bot' */
  bot?: BotInput;
  /**
   * Solo: the only human player reads every keyboard, the mouse and every pad, exactly like 1.0.
   * devices.ts turns this off as soon as a second human joins.
   */
  merged = false;
  private src: Src = { kb: null, mouse: false, pads: [] };
  private list: Src[] = [this.src];

  constructor(slot: number, device: DeviceId) {
    super();
    this.slot = slot;
    this.setDevice(device);
    views.add(this);
  }

  /** move this player to another device (a solo player settling on the one they really use) */
  setDevice(id: DeviceId) {
    this.device = id;
    this.kind = kindOf(id);
    this.rebuild();
  }

  rebuild() {
    if (this.disposed) return;
    const k = this.kind;
    if (k === 'bot') this.src = { kb: null, mouse: false, pads: [], bot: () => this.bot };
    else if (this.merged) this.src = { kb: KB.kbm, mouse: true, pads: 'all' };
    else if (k === 'kbm') this.src = { kb: KB.kbm, mouse: true, pads: [] };
    else if (k === 'kb') this.src = { kb: KB[this.device as KbProfile], mouse: false, pads: [] };
    else this.src = { kb: null, mouse: false, pads: [padIndex(this.device)] };
    this.list = [this.src];
    bumpSources();
  }

  get source(): Src { return this.src; }
  protected srcs(): readonly Src[] { return this.list; }

  /** keyboard table used for this player's key prompts */
  get bindings(): Bindings { return this.kind === 'kb' ? KB[this.device as KbProfile] : KB.kbm; }
  /** glyph family for prompts (widgets.drawPrompt(..., who)); ?glyph= forces one */
  get lastDevice(): 'kbm' | 'pad' {
    if (glyphs.force) return glyphs.force === 'pad' ? 'pad' : 'kbm';
    return this.merged ? raw.family : this.kind === 'pad' ? 'pad' : 'kbm';
  }
  /**
   * the keyboard / mouse code that last triggered `a` for this player (ONBOARD2 §1.7): a player who
   * rewinds with L sees [L], not [Q]. An action never pressed follows the column the player plays
   * with (raw.kbColumn). null = no keyboard here, a menu action, or nothing to go on (prompts then
   * show the table's first key).
   */
  lastCodeFor(a: Action): string | null {
    if (!TRACKED.has(a)) return null;
    const kb = glyphs.force ? this.bindings : this.src.kb;
    if (!kb) return null;
    const mouse = glyphs.force ? glyphs.force === 'kbm' : this.src.mouse;
    const list = kb[a].filter((b) => mouse || !b.startsWith('Mouse'));
    if (!list.length) return null;
    if (glyphs.force) return glyphs.force === 'kb' && COLUMN_ACTIONS.has(a) ? (list[1] ?? list[0]) : list[0];
    let best: string | null = null, bs = 0;
    for (const b of list) { const n = raw.codeSeq.get(b) ?? 0; if (n > bs) { bs = n; best = b; } }
    if (best) return best;
    return raw.kbColumn === 1 && COLUMN_ACTIONS.has(a) && list[1] ? list[1] : null;
  }
  /** movement keys this player uses: 1 = the arrow keys (the last movement key pressed was one), 0 = WASD */
  moveColumn(): 0 | 1 {
    const kb = glyphs.force ? this.bindings : this.src.kb;
    if (!kb || glyphs.force) return 0;
    let col: 0 | 1 = 0, bs = 0;
    for (const a of ['up', 'down', 'left', 'right'] as const) kb[a].forEach((b, i) => { const n = raw.codeSeq.get(b) ?? 0; if (n > bs) { bs = n; col = i === 0 ? 0 : 1; } });
    return col;
  }
  /** does the mouse aim for this player right now? */
  get mouseAim(): boolean { return this.merged ? raw.mouseAim : this.kind === 'kbm' ? raw.kbMouseAim : false; }
  get usesMouse(): boolean { return this.merged || this.kind === 'kbm'; }
  get pads(): number[] { return this.src.pads === 'all' ? raw.connectedPads() : this.src.pads.slice(); }

  /**
   * Aim direction from (fromX, fromY) in view coordinates (the mouse lives there).
   * 'assist' = no explicit aim: x/y is the movement direction and the caller snaps it to a target.
   */
  aim(fromX: number, fromY: number): { x: number; y: number; kind: 'mouse' | 'stick' | 'assist' | 'none' } {
    if (this.kind === 'bot') {
      const b = this.bot;
      return b && (b.aimX || b.aimY) ? { x: b.aimX, y: b.aimY, kind: 'stick' } : { x: 0, y: 0, kind: 'none' };
    }
    if (this.usesMouse && this.mouseAim) {
      const a = Math.atan2(raw.my - fromY, raw.mx - fromX);
      return { x: Math.cos(a), y: Math.sin(a), kind: 'mouse' };
    }
    const st = this.stick();
    if (Math.hypot(st.x, st.y) > 0.3) return { x: st.x, y: st.y, kind: 'stick' };
    const m = this.move();
    if (m.x || m.y) return { x: m.x, y: m.y, kind: 'assist' };
    return { x: 0, y: 0, kind: 'none' };
  }
  /** 1.0: the body turns to the aim (mouse or right stick) instead of the walking direction */
  facesAim(): boolean {
    if (this.kind === 'bot') return true; // 1.0: the bot left G.input.mouseAim at its default (true)
    if (this.usesMouse && this.mouseAim) return true;
    const st = this.stick();
    return st.x !== 0 || st.y !== 0;
  }
  /** camera look-ahead while aiming (1.0 solo; multiplayer cameras ignore it) */
  aiming(): boolean {
    if (this.kind === 'bot') return true;
    if (this.usesMouse && this.mouseAim) return true;
    const st = this.stick();
    return Math.hypot(st.x, st.y) > 0.3;
  }

  /** rumble only this player's pad (the solo player: every pad, as in 1.0) */
  rumble(strong: number, weak: number, ms: number) {
    if (this.merged) { rumbleAll(strong, weak, ms); return; }
    if (this.kind === 'pad') rumblePad(padIndex(this.device), strong, weak, ms);
  }

  /** the seat was released: this input reads nothing from now on (a stale Player keeps a dead input) */
  private disposed = false;
  dispose() {
    this.disposed = true;
    views.delete(this);
    this.merged = false;
    this.src = { kb: null, mouse: false, pads: [] };
    this.list = [this.src];
    this.bot = undefined;
    bumpSources();
  }
}

// ───────────────────────── menu aggregate (G.input) ─────────────────────────
const ALL_SRC: Src = { kb: KB.kbm, mouse: true, pads: 'all' };

export class Input extends InputView {
  /** 1.0: the keyboard + mouse table (the controls panel and key prompts read it) */
  readonly bindings: Bindings = KB.kbm;
  /** compat: a bot input OR'd into the menus (1.0 QA hook; per-slot bots live on PlayerInput.bot) */
  bot: BotInput | null = null;
  /** set by devices.ts: the sources of every joined player (all devices while nobody has joined) */
  sourceList: () => readonly Src[] = () => [ALL_SRC];
  /** set by devices.ts: runs at the end of every fixed tick */
  onTick: (() => void) | null = null;
  private cache: readonly Src[] = [ALL_SRC];
  private cacheEpoch = -1;
  private botSrc: Src = { kb: null, mouse: false, pads: [], bot: () => this.bot };

  protected srcs(): readonly Src[] {
    if (this.cacheEpoch !== srcEpoch) { this.cache = [...this.sourceList(), this.botSrc]; this.cacheEpoch = srcEpoch; }
    return this.cache;
  }
  private hasMouse(): boolean { return this.srcs().some((s) => s.mouse); }

  get mx() { return raw.mx; }
  get my() { return raw.my; }
  get mouseInside() { return raw.mouseInside; }
  /** true when the mouse is aiming / pointing (and a joined player owns it) */
  get mouseAim() { return raw.mouseAim && this.hasMouse(); }
  get lastDevice(): 'kbm' | 'pad' { return glyphs.force ? (glyphs.force === 'pad' ? 'pad' : 'kbm') : raw.family; }
  set lastDevice(v: 'kbm' | 'pad') { raw.family = v; }
  get padMoveX() { return this.leftStick().x; }
  get padMoveY() { return this.leftStick().y; }
  get padAimX() { return this.stick().x; }
  get padAimY() { return this.stick().y; }
  get padConnected() { return raw.pads.some((p) => p?.connected); }
  get lastPressedCode() { return raw.lastPressedCode; }
  set lastPressedCode(v: string | null) { raw.lastPressedCode = v; }
  get anyPressed() { return raw.anyPressed; }
  get wheel() { return raw.wheel; }

  attach(el: HTMLElement, toInternal: (cx: number, cy: number) => [number, number]) { raw.attach(el, toInternal); }
  /** poll gamepads once per frame (before update ticks) */
  pollPads() { raw.poll(); }
  /** called after each fixed update tick */
  endTick() {
    for (const v of views) v.tickHold();
    this.tickHold();
    this.onTick?.();
    raw.endTick();
  }
  isHeld(code: string) { return raw.held.has(code); }
}

export const input = new Input();

/** Human readable key label for prompts (short, pixel-font friendly) */
export function keyLabel(code: string): string {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad') && code.length === 7) return 'N' + code.slice(6);
  const map: Record<string, string> = {
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
    ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT', Escape: 'ESC', Enter: 'ENTER', NumpadEnter: 'ENTER', Tab: 'TAB',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'BKSP',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
    Minus: '-', Equal: '=', Backquote: '`',
  };
  return map[code] ?? code;
}

/** Xbox button name for an action (1.0 helper; the glyphs themselves live in ui/widgets.ts) */
export function padLabel(a: Action): string {
  const sw = padLayout.swapBumpers;
  const m: Partial<Record<Action, string>> = {
    attack: 'X', special: 'Y', dash: 'A', rewind: sw ? 'RB' : 'LB', fork: sw ? 'LB' : 'RB', interact: 'B',
    pause: 'START', confirm: 'A', cancel: 'B', info: 'BACK', tabL: 'LB', tabR: 'RB',
  };
  return m[a] ?? '';
}
