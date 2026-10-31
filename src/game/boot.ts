import { G } from './G';
import { ArtPreview } from './scenes/artPreview';
import { buildTick } from '../art/sprites/tick';
import { RoomPreview } from './scenes/roomPreview';
import { registerSfx } from '../audio/sfx';
import { registerConservatorySfx } from '../audio/sfx_conservatory';
import { registerArchiveSfx } from '../audio/sfx_archive';
import { registerClockfaceSfx } from '../audio/sfx_clockface';
import { Music } from '../engine/audio/music';
import { INSTRUMENTS } from '../audio/instruments';
import { SONGS } from '../audio/songs';
import { GameScene } from './scenes/game';
import { Run } from './run';
import { loadSettings } from './settings';
import { loadProfile } from './save';
import { Flow } from './flow';

function setupAudio() {
  registerSfx(G.audio);
  registerConservatorySfx(G.audio);
  registerArchiveSfx(G.audio);
  registerClockfaceSfx(G.audio);
  G.music = new Music(G.audio, INSTRUMENTS);
  for (const [k, s] of Object.entries(SONGS)) G.music.define(k, s);
  const unlock = () => {
    const first = !G.audio.ctx;
    G.audio.unlock();
    if (first) G.music.resume();
  };
  window.addEventListener('keydown', unlock);
  window.addEventListener('mousedown', unlock);
  window.addEventListener('touchstart', unlock);
  window.addEventListener('gamepadconnected', unlock);
}

export async function boot() {
  setupAudio();
  loadSettings();
  loadProfile();
  const scene = G.debug.get('scene');
  if (scene === 'room') {
    G.scenes.set(new RoomPreview(Number(G.debug.get('seed') ?? 1), Number(G.debug.get('biome') ?? 0)));
    return;
  }
  if (scene === 'art2') {
    const g = await import('../art/sprites/gearworks');
    const c = g.buildCogling(), s = g.buildSentry(), sp = g.buildSpitter(), mi = g.buildMite(), br = g.buildBrute();
    G.scenes.set(new ArtPreview([
      { name: 'cogling', sprites: [...c.roll, c.eye], zoom: 4 },
      { name: 'sentry', sprites: [...s.idle, ...s.walk, s.windup, s.thrust, g.SPEAR], zoom: 4 },
      { name: 'spitter / mite', sprites: [...sp.idle, sp.charge, g.SPIT_BARREL, ...mi.walk, mi.hop], zoom: 4 },
      { name: 'brute + gears', sprites: [...br.idle, br.windup, br.slam, ...g.WALL_GEAR_BIG().slice(0, 2), ...g.WALL_GEAR_SMALL().slice(0, 2)], zoom: 3 },
    ]));
    return;
  }
  if (scene === 'art_conservatory') {
    // Floor 2 team: enemy + decor sprite review (?scene=art_conservatory[&page=1])
    const c = await import('../art/sprites/conservatory');
    G.scenes.set(new ArtPreview(c.previewGroups(Number(G.debug.get('page') ?? 0))));
    return;
  }
  if (scene === 'art') {
    const t = buildTick();
    G.scenes.set(new ArtPreview([
      { name: 'idle down/up/side', sprites: [...t.idle.down, ...t.idle.up, ...t.idle.side], zoom: 3 },
      { name: 'run down', sprites: t.run.down, zoom: 3 },
      { name: 'run side', sprites: t.run.side, zoom: 3 },
      { name: 'dash/hurt/blink', sprites: [t.dash.down, t.dash.side, t.hurt.down, t.hurt.side, t.blink.down, t.blink.side], zoom: 3 },
    ]));
    return;
  }
  if (scene === 'title') { Flow.title(); return; }
  if (scene === 'hub') { Flow.hub('start'); return; }
  if (scene === 'intro') { Flow.intro(); return; }
  const direct = ['seed', 'room', 'floor', 'spawn', 'offer', 'god'].some((k) => G.debug.has(k));
  if (!direct) { Flow.title(); return; }
  // debug: straight into a run
  const seed = Number(G.debug.get('seed') ?? (Math.random() * 1e9) | 0);
  const kind = (G.debug.get('room') as any) ?? 'combat';
  const run = new Run(seed);
  run.floor = Number(G.debug.get('floor') ?? 0);
  run.roomIndex = Number(G.debug.get('roomIndex') ?? 0);
  if (G.debug.get('god')) { run.bonuses.push({ apply: (m) => { m.maxHp = 9999; } }); run.recompute(); run.hp = 9999; }
  if (G.debug.get('brass')) run.brass = Number(G.debug.get('brass'));
  if (G.debug.get('weapon')) run.weapon = G.debug.get('weapon')!;
  const gs = new GameScene(run, { kind, reward: 'memory', patron: (G.debug.get('patron') as any) ?? 'oren' }, seed);
  Flow.wire(gs);
  G.scenes.set(gs);
}
