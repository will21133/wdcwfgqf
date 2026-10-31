import { Renderer } from './engine/gfx/renderer';
import { PixelFont, DigitFont } from './engine/gfx/font';
import { startLoop } from './engine/loop';
import { G } from './game/G';
import font12url from './assets/fonts/fusion-12.woff2?url';
import font8url from './assets/fonts/fusion-8.woff2?url';
import { boot } from './game/boot';

async function loadFonts() {
  const f12 = new FontFace('FP12', `url(${font12url})`);
  const f8 = new FontFace('FP8', `url(${font8url})`);
  await Promise.all([f12.load(), f8.load()]);
  document.fonts.add(f12);
  document.fonts.add(f8);
}

async function main() {
  const screen = document.getElementById('screen') as HTMLCanvasElement;
  await loadFonts();
  const r = new Renderer(screen);
  G.r = r;
  r.resize();
  window.addEventListener('resize', () => r.resize());
  G.font = new PixelFont('FP12', 12, 15);
  G.small = new PixelFont('FP8', 8, 10);
  G.digits = new DigitFont(true);
  G.digitsSmall = new DigitFont(false);
  G.input.attach(screen, (x, y) => r.toView(x, y));
  screen.focus();

  await boot();
  document.getElementById('boot')?.remove();

  startLoop(
    (dt) => {
      G.time += dt;
      G.scenes.update(dt);
      G.input.endTick();
    },
    () => {
      G.frame++;
      G.r.params.time = G.time;
      G.scenes.render(G.r);
      G.r.end();
    },
    () => G.input.pollPads(),
  );
}

main().catch((e) => {
  console.error(e);
  const b = document.getElementById('boot');
  if (b) b.textContent = 'ERROR: ' + (e?.message ?? e);
});
