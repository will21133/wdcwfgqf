# Studio Brief — read this before touching anything

You are a member of a small studio making **《秒针》SECOND HAND**, a 2D pixel-art action roguelite
where the core verb is a 3-second **rewind** that undoes damage taken and spawns an **Echo** of your past self.
Read `docs/GDD.md` (design) and `docs/ART_BIBLE.md` (art rules) first. Quality bar: a commercial
Steam game. Nothing may look like placeholder or "AI slop": every sprite is hand-authored pixel art with
deliberate shading, consistent outlines, and readable silhouettes.

## Tech in one minute
- TypeScript + Vite, no frameworks. Internal resolution **640×360**, tiles **16×16**, 3/4 top-down.
- `npm run typecheck` must pass (it runs `tsc --noEmit`).
- Dev server: `npx vite --host 127.0.0.1 --port <yourPort>`; screenshots with
  `BASE=http://127.0.0.1:<yourPort>/ node tools/shot.cjs "<query>" tools/out/<name>.png 2000 1280 720 [script.json]`
  then **look at the PNG with the Read tool**. Iterate until it looks professional. `tools/scripts/fight.json` shows the
  input-script format (keys, mouse, timed screenshots).
- Useful queries:
  - `scene=room&biome=<0-3>&seed=<n>` — renders a generated room of a biome with real lighting (no player).
  - `floor=<0-3>&seed=<n>&god=1` — plays a combat room on that floor (WASD, mouse aim, LMB attack, RMB special, Space dash, Q rewind).
  - `floor=<n>&god=1&spawn=<id>,<id>` — spawns exactly those enemy ids as one wave (ids from your ROSTER).
  - `scene=art` / `scene=art2` — zoomed sprite sheets (see `src/game/boot.ts`; add your own `scene=art_<floor>` preview there if useful — that is the one shared file you may add a small block to).

## Art API (see the files for details)
- Palette: `src/art/palette.ts` — **only** these named colours. Hue-shifted ramps (K indigo, B brass, R red, O ember,
  T verdigris, C echo-cyan, G foliage, V violet, M magenta, U night-blue, S sand).
  - **C (cyan) is reserved for echoes/rewind/sand.** **M (magenta) is reserved for enemy bullets.** Do not use them for environment or enemy bodies.
  - Enemy bullets: bright core + dark (K0) outline + glow. Telegraphs: red (R3) ground shapes via the Enemy helpers.
- Sprite DSL: `spriteFromDef({ rows: [...], pal: { a: 'K3', ... }, ox, oy })` — rows of chars, '.' = transparent;
  a 1px K0 outline is added automatically. Pivot (ox, oy) = feet centre. See `src/art/sprites/tick.ts` and `src/art/sprites/gearworks.ts` (the reference style).
- Procedural pixel buffers: `PixelBuf` (`src/engine/gfx/canvas.ts`), `blit()` + `rgb()` (`src/art/blit.ts`), `spriteFromBuf()`.
- Rotation: `new RotCache(sprite, 32).get(angle)`. Gears: `src/art/gear.ts`. Palette-swap: `sprite.recolor(['V0',..'V4'])`.
- Drawing at runtime: `drawSprite(ctx, sprite, x, y, { flip, tint, alpha, sx, sy })`.
  Layers on the Renderer `r`: `r.w` lit world, `r.u` unlit overlay (bullets/telegraphs), `r.g` additive glow,
  `r.lightAt(x, y, radius, colorKey, intensity)` dynamic light, `r.glowAt(...)` additive halo.

## Gameplay API
- Enemy base: `src/game/entities/enemy.ts` (state machine via `setState/state/stateT`, `think(dt)`, `moveTo`, `moveDir`,
  `faceTarget`, `angT()/distT()`, `target`, `drawBody(r, sprite)`, `teleLine/teleCircle/teleCone` in `renderTelegraph`,
  `attacking` flag, `isElite`, `debris` palette, `brass` drop range, `sandDrop`). Reference implementations:
  `src/game/entities/enemies/gearworks.ts` (Cogling, Sentry, Spitter, Mite, Brute).
- Damage: `this.world.combat.add({ shape: {t:'circle'|'arc'|'line', ...}, team: 'enemy', life: ticks, info: { amount, kind, owner: this, x, y, knock, fixed? } })`
  or `new Bullet({...})` (`src/game/entities/projectile.ts`) or `player.hurt({...})` for contact.
  `fixed: true` = violet damage that rewind cannot undo — use sparingly, it is a floor-3+ mechanic.
- FX: `this.world.fx` (`ring, burst, dust, smoke, shatter, banner, number, scorch, splash`), `this.world.particles.spawn({...})`,
  `this.world.shake(n)`, `this.world.hitstop(t)`. SFX: `sfx('name', { pan: this.world.pan(this.x) })`.
- Flying enemies: set `canFall = false` so they ignore pits.

## Enemy design rules
1. 1–2 attacks each, **each with a readable tell** (pose change + ground telegraph + sound) of ≥ 0.35 s.
2. Every enemy must be fair: no instant hits, no off-screen shots without warning.
3. Distinct silhouettes and a unique movement pattern per enemy.
4. Animate! Idle bob, walk cycles, wind-up poses, recoil, squash on landing. Use procedural motion where it helps (sin bobs, leg phases, rotating parts).
5. Give each enemy a codex `name`/`desc` (zh + en) in its ROSTER entry.
6. Budget costs: chaff ≈ 1 (group), standard ≈ 2–3, heavy ≈ 4, elite ≈ 14. HP scale: floor 2 ≈ 1.3× floor 1, floor 3 ≈ 1.7×, floor 4 ≈ 2.2×.

## Environment rules (biome plugin)
- Implement `BiomeArt` (`src/art/biomes/types.ts`) in `src/art/biomes/<biome>.ts`. Defaults live in `src/game/world/roomRender.ts`
  (`defaultFloor`, `defaultPits`, `defaultFace`, `defaultCap`, helpers `darken`, `wallish`, `isOpen`, `WALL_H`).
  Paint the floor as **one world-space buffer** (no visible tile repetition), ambient-occlude under walls (use `c.aoTop`),
  keep the environment one value-step darker/less saturated than actors.
- Tall walls are 32px faces (`H === 32`), cut-away south walls are 8px (`H === 8`). Exterior faces (`exterior`) are darker.
- `decorate(w, m, rng)` adds animated props/lights as Entities (see `src/game/entities/props.ts` WallLamp/WallGear for the pattern;
  set `sortBias` so wall-mounted things draw after their wall strip). `m.props` contains generator hints
  (`walllamp`, `wallgear`, `pipe`, `window`, `puddle`, `debris`, `cogpile`) you may reinterpret for your biome.
- Theme colours/lighting: your entry in `src/art/themes.ts` (edit only your own entry).

## File ownership (do not edit files you don't own; if you need an engine change, describe it in your final report)
- Floor 2 team: `src/art/biomes/conservatory.ts`, `src/art/sprites/conservatory.ts`, `src/game/entities/enemies/conservatory.ts`, `src/audio/sfx_conservatory.ts`, theme entry 1.
- Floor 3 team: `.../archive.ts` equivalents, theme entry 2.
- Floor 4 team: `.../clockface.ts` equivalents, theme entry 3.
- Composer: `src/audio/score/*`.
- Everyone may add a small debug preview block to `src/game/boot.ts`.

Commit your work on your branch with clear messages when done.
