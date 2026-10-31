// Global game context — single place that owns engine services.
import type { Renderer } from '../engine/gfx/renderer';
import type { PixelFont, DigitFont } from '../engine/gfx/font';
import { SceneManager } from '../engine/scene';
import { input } from '../engine/input';
import { audio } from '../engine/audio/audio';
import type { Music } from '../engine/audio/music';

export const G = {
  r: null as unknown as Renderer,
  /** FP12 — body text and every key piece of information */
  font: null as unknown as PixelFont,
  /** FP10 — secondary text: tag chips, flavour, HUD labels */
  small: null as unknown as PixelFont,
  /** FP8 — latin letters and digits only (CJK is routed to `small` with a dev warning) */
  tiny: null as unknown as PixelFont,
  digits: null as unknown as DigitFont,
  digitsSmall: null as unknown as DigitFont,
  scenes: new SceneManager(),
  input,
  audio,
  music: null as unknown as Music,
  time: 0,
  /** real frame counter (for blink effects) */
  frame: 0,
  debug: new URLSearchParams(location.search),
};

export function sfx(name: string, o?: { vol?: number; pitch?: number; pan?: number; [k: string]: unknown }) {
  audio.play(name, o);
}
