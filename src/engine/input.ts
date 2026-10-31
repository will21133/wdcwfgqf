// Input: keyboard + mouse + gamepad, action-mapped, rebindable.
// Edge states ("pressed") are latched until consumed by the next fixed update tick.

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'attack' | 'special' | 'dash' | 'rewind' | 'interact'
  | 'pause' | 'confirm' | 'cancel' | 'info';

export const REBINDABLE: Action[] = ['up', 'down', 'left', 'right', 'attack', 'special', 'dash', 'rewind', 'interact', 'info'];

export type Binding = string; // KeyboardEvent.code, or 'Mouse0' / 'Mouse2'

export const DEFAULT_BINDINGS: Record<Action, Binding[]> = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  attack: ['Mouse0', 'KeyJ'],
  special: ['Mouse2', 'KeyK'],
  dash: ['Space', 'ShiftLeft'],
  rewind: ['KeyQ', 'KeyL'],
  interact: ['KeyE', 'KeyF'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'Space', 'KeyE', 'KeyJ', 'NumpadEnter'],
  cancel: ['Escape', 'Backspace', 'KeyK'],
  info: ['Tab', 'KeyI'],
};

// Standard gamepad mapping
const PAD: Record<Action, number[]> = {
  up: [12], down: [13], left: [14], right: [15],
  attack: [2, 7], special: [3, 6], dash: [0], rewind: [5, 4], interact: [1],
  pause: [9], confirm: [0], cancel: [1], info: [8],
};

const KEYBOARD_AIM_KEYS = new Set(['KeyJ', 'KeyK', 'KeyL']);

export class Input {
  bindings: Record<Action, Binding[]> = structuredClone(DEFAULT_BINDINGS);

  private held = new Set<Binding>();
  private pressedLatch = new Set<Binding>();
  private releasedLatch = new Set<Binding>();
  private padHeld = new Set<number>();
  private padPrev = new Set<number>();
  private padPressed = new Set<number>();

  /** pointer in internal (640x360) coords */
  mx = 320; my = 180;
  mouseInside = false;
  /** true when aiming should follow the mouse */
  mouseAim = true;
  lastDevice: 'kbm' | 'pad' = 'kbm';

  padMoveX = 0; padMoveY = 0;
  padAimX = 0; padAimY = 0;
  padConnected = false;

  /** QA autopilot override */
  bot: { move: { x: number; y: number }; aimX: number; aimY: number; held: Set<Action>; pressed: Set<Action> } | null = null;
  /** last key code pressed (for rebinding UI) */
  lastPressedCode: string | null = null;
  /** any key / button pressed this tick */
  anyPressed = false;

  private toInternal: (cx: number, cy: number) => [number, number] = (x, y) => [x, y];

  attach(el: HTMLElement, toInternal: (cx: number, cy: number) => [number, number]) {
    this.toInternal = toInternal;
    const prevent = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace']);
    window.addEventListener('keydown', (e) => {
      if (prevent.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.press(e.code);
      this.lastDevice = 'kbm';
      if (KEYBOARD_AIM_KEYS.has(e.code)) this.mouseAim = false;
    });
    window.addEventListener('keyup', (e) => this.release(e.code));
    window.addEventListener('blur', () => {
      for (const b of this.held) this.releasedLatch.add(b);
      this.held.clear();
    });
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const [x, y] = this.toInternal(e.clientX - r.left, e.clientY - r.top);
      if (Math.abs(x - this.mx) + Math.abs(y - this.my) > 0.5) {
        this.mouseAim = true;
        this.lastDevice = 'kbm';
      }
      this.mx = x; this.my = y;
      this.mouseInside = true;
    });
    el.addEventListener('mouseleave', () => (this.mouseInside = false));
    el.addEventListener('mousedown', (e) => {
      el.focus();
      this.press('Mouse' + e.button);
      this.mouseAim = true;
      this.lastDevice = 'kbm';
    });
    window.addEventListener('mouseup', (e) => this.release('Mouse' + e.button));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }
  wheel = 0;

  private press(code: Binding) {
    if (!this.held.has(code)) this.pressedLatch.add(code);
    this.held.add(code);
    this.lastPressedCode = code;
    this.anyPressed = true;
  }
  private release(code: Binding) {
    if (this.held.has(code)) this.releasedLatch.add(code);
    this.held.delete(code);
  }

  /** poll gamepads once per frame (before update ticks) */
  pollPads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.padConnected = !!gp;
    this.padPrev = new Set(this.padHeld);
    this.padHeld.clear();
    this.padMoveX = this.padMoveY = this.padAimX = this.padAimY = 0;
    if (!gp) return;
    gp.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) this.padHeld.add(i); });
    for (const i of this.padHeld) if (!this.padPrev.has(i)) {
      this.padPressed.add(i);
      this.lastDevice = 'pad';
      this.mouseAim = false;
      this.anyPressed = true;
    }
    const dz = (x: number, y: number, d: number): [number, number] => {
      const m = Math.hypot(x, y);
      if (m < d) return [0, 0];
      const k = Math.min(1, (m - d) / (1 - d)) / m;
      return [x * k, y * k];
    };
    const [lx, ly] = dz(gp.axes[0] ?? 0, gp.axes[1] ?? 0, 0.22);
    const [rx, ry] = dz(gp.axes[2] ?? 0, gp.axes[3] ?? 0, 0.3);
    this.padMoveX = lx; this.padMoveY = ly;
    this.padAimX = rx; this.padAimY = ry;
    if (lx || ly || rx || ry) { this.lastDevice = 'pad'; this.mouseAim = false; }
  }

  down(a: Action): boolean {
    if (this.bot) return this.bot.held.has(a);
    for (const b of this.bindings[a]) if (this.held.has(b)) return true;
    for (const i of PAD[a]) if (this.padHeld.has(i)) return true;
    return false;
  }

  pressed(a: Action): boolean {
    if (this.bot) return this.bot.pressed.has(a);
    for (const b of this.bindings[a]) if (this.pressedLatch.has(b)) return true;
    for (const i of PAD[a]) if (this.padPressed.has(i)) return true;
    return false;
  }

  released(a: Action): boolean {
    for (const b of this.bindings[a]) if (this.releasedLatch.has(b)) return true;
    return false;
  }

  /** consume a single press so two systems don't both react */
  consume(a: Action) {
    if (this.bot) this.bot.pressed.delete(a);
    for (const b of this.bindings[a]) this.pressedLatch.delete(b);
    for (const i of PAD[a]) this.padPressed.delete(i);
  }

  /** movement vector, length <= 1 */
  move(): { x: number; y: number } {
    if (this.bot) return this.bot.move;
    let x = 0, y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    if (x || y) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }
    // pad stick (dpad already handled via bindings above)
    return { x: this.padMoveX, y: this.padMoveY };
  }

  /** UI navigation helper: returns -1/0/1 for an axis with repeat */
  private navDir = { x: 0, y: 0 };
  private navTimer = { x: 0, y: 0 };
  nav(dt: number): { x: number; y: number } {
    const out = { x: 0, y: 0 };
    const sx = Math.sign((this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0) || (Math.abs(this.padMoveX) > 0.5 ? this.padMoveX : 0));
    const sy = Math.sign((this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0) || (Math.abs(this.padMoveY) > 0.5 ? this.padMoveY : 0));
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

  /** called after each fixed update tick */
  endTick() {
    this.pressedLatch.clear();
    this.releasedLatch.clear();
    this.padPressed.clear();
    this.anyPressed = false;
    this.wheel = 0;
  }

  isHeld(code: string) { return this.held.has(code); }
}

export const input = new Input();

/** Human readable key label for prompts (short, pixel-font friendly) */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
    ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', Escape: 'ESC', Enter: 'ENTER', Tab: 'TAB',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'BKSP',
  };
  return map[code] ?? code;
}

export function padLabel(a: Action): string {
  const m: Partial<Record<Action, string>> = {
    attack: 'X', special: 'Y', dash: 'A', rewind: 'RB', interact: 'B', pause: 'START', confirm: 'A', cancel: 'B', info: 'BACK',
  };
  return m[a] ?? '';
}
