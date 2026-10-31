# 秒针 SECOND HAND

> **撤销失误，保留胜果。** *Undo your wounds. Keep your victories.*

A 2D pixel-art action roguelite. You are **Tick**, the living second hand of a great clock that stopped at
**11:59:59**. Climb the tower and let the city's last second end.

**The hook:** press **Rewind** to fly back three seconds — the damage you *took* is undone, the damage you *dealt*
is kept — and your past self keeps fighting beside you as an **Echo**, replaying everything you just did.
Touch your own Echo to trigger a **Paradox** explosion.

## Play

```bash
npm install
```

```bash
npm run dev
```

Then open http://127.0.0.1:5173/ . For a standalone, offline single-file build:

```bash
npm run build:single
```

…and open `dist-single/index.html` in a browser.

## Controls

| Action | Keyboard + Mouse | Keyboard only | Xbox controller |
|---|---|---|---|
| Move | WASD | WASD / arrows | Left stick / D-pad |
| Aim | Mouse | move direction (aim assist) | Right stick |
| Attack | Left click | J | X / RT |
| Special | Right click | K | Y / LT |
| Dash | Space | Space / Shift | A |
| **Rewind** | **Q** | **L** | **RB / LB** |
| Interact | E | E / F | B |
| Build info | Tab | Tab / I | View |
| Pause | Esc | Esc / P | Menu |

Controller rumble, screen shake, flashes, language (简体中文 / English), and pixel-perfect scaling are
in Settings.

## What's in the game

- **4 floors**, each with its own art, lighting, enemies and music: the Sunken Gearworks, the Verdigris
  Conservatory, the Sand Archive, and the Clockface. Each floor has 9 rooms and a boss.
- **4 bosses**, each built around the rewind: the Foreman, the Lantern Moth (darkness — your echoes are
  your light), the Archivist (she rewinds too — only echo damage can't be revised), and the Stillness
  (she stops time — only your echoes move).
- **4 weapons**, each with its own echo trait: Second-Hand Rapier, Pendulum Maul, Chime Bow, Gear Chakram.
- **5 patrons**, 45 memories plus 10 duo memories, 11 hourglass (rewind) upgrades, 31 parts (including
  cracked/cursed ones), and weapon calibrations.
- Door-choice room flow with shops, events, repair stations, elite rooms, and echo-puzzle vaults.
- The workshop hub: Ines's story told across runs, the Mainspring meta-progression tree, the weapon rack,
  and the Ledger codex.
- Synthesized adaptive music and sound, fully bilingual text, Xbox controller support.

## Project layout

```
docs/       GDD, art bible, tech design, studio brief, Steam page copy
src/engine  renderer (Canvas2D layers + WebGL2 post), input, audio synth + sequencer, particles, scenes
src/art     palette, hand-authored pixel sprites, biome painters, procedural gears/icons
src/game    gameplay: entities, weapons, combat, rewind, rooms, progression, UI, scenes
src/audio   sound design, instruments, score
electron/   desktop wrapper for the Steam build
tools/      screenshot / QA harness (Playwright)
```

## Credits

Design, code, art, and music: Claude Studio.
Pixel font: [Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font) by TakWolf, SIL Open Font License 1.1
(see `src/assets/fonts/OFL-FusionPixel.txt`).
