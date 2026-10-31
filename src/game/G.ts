// Global game context — single place that owns engine services.
import type { Renderer } from '../engine/gfx/renderer';
import type { PixelFont, DigitFont } from '../engine/gfx/font';
import { SceneManager } from '../engine/scene';
import { input } from '../engine/input';
import { audio } from '../engine/audio/audio';
import type { Music } from '../engine/audio/music';

export const G = {
  r: null as unknown as Renderer,
  font: null as unknown as PixelFont,
  small: null as unknown as PixelFont,
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
