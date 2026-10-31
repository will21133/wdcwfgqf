import { Renderer } from './engine/gfx/renderer';
import { PixelFont, DigitFont } from './engine/gfx/font';
import { startLoop } from './engine/loop';
import { G } from './game/G';
import font12url from './assets/fonts/fusion-12.woff2?url';
import font10url from './assets/fonts/fusion-10.woff2?url';
import font8url from './assets/fonts/fusion-8.woff2?url';
import { boot } from './game/boot';
import './game/ui/text'; // installs the world-label painter
import { Hints } from './game/ui/hints';
import { Notices } from './game/ui/notices';
import { tickRegistry } from './game/meta/registry';
import * as Registry from './game/meta/registry';
import * as Save from './game/save';
import { flashCap } from './game/settings';

async function loadFonts() {
  const faces = [new FontFace('FP12', `url(${font12url})`), new FontFace('FP10', `url(${font10url})`), new FontFace('FP8', `url(${font8url})`)];
  await Promise.all(faces.map((f) => f.load()));
  for (const f of faces) document.fonts.add(f);
}

const SPEED = Math.max(1, Math.min(8, Number(new URLSearchParams(location.search).get('speed') ?? 1)));

async function main() {
  const screen = document.getElementById('screen') as HTMLCanvasElement;
  await loadFonts();
  const r = new Renderer(screen);
  G.r = r;
  r.resize();
  window.addEventListener('resize', () => r.resize());
  G.font = new PixelFont('FP12', 12, 15);
  G.small = new PixelFont('FP10', 10, 13);
  G.tiny = new PixelFont('FP8', 8, 10, { latinOnly: true, fallback: () => G.small });
  G.digits = new DigitFont(true);
  G.digitsSmall = new DigitFont(false);
  G.input.attach(screen, (x, y) => r.toView(x, y));
  screen.focus();

  (window as any).__G = G;
  // QA / tools handles: registry calls and the live profile (tools/shot.cjs eval steps)
  (window as any).__reg = Registry;
  (window as any).__save = Save;
  (window as any).__hints = Hints;
  window.addEventListener('blur', () => (G.scenes.current as any)?.autoPause?.());
  document.addEventListener('visibilitychange', () => { if (document.hidden) (G.scenes.current as any)?.autoPause?.(); });
  await boot();
  document.getElementById('boot')?.remove();

  startLoop(
    (dt) => {
      // gamepad-only players: any button press also unlocks / resumes audio
      if (G.input.anyPressed && (!G.audio.ctx || G.audio.ctx.state !== 'running')) { const first = !G.audio.ctx; G.audio.unlock(); if (first) G.music.resume(); }
      for (let i = 0; i < SPEED; i++) {
        G.time += dt;
        Hints.update(dt);
        G.scenes.update(dt);
        Notices.update(dt);
        tickRegistry(dt);
        G.input.endTick();
      }
    },
    () => {
      G.frame++;
      G.r.params.time = G.time;
      G.scenes.render(G.r);
      // global layers above every scene: Ines's notes, then achievement / secret / chime toasts
      Hints.render(G.r);
      Notices.render(G.r);
      G.r.params.flash = Math.min(G.r.params.flash, flashCap());
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
