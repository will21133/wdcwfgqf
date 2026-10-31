// Game flow: title → (intro) → workshop → run → report → workshop …
import { G } from './G';
import { Run, type RunEndKind, type RunConfig } from './run';
import { ensurePlayers } from './players';
import { TitleScene } from './scenes/title';
import { HubScene } from './scenes/hub';
import { GameScene } from './scenes/game';
import { SummaryScene } from './scenes/summary';
import { CutsceneScene, CreditsScene } from './scenes/cutscene';
import { profile, saveProfile, metaBonus, nodeLevel, markSeen } from './save';
import type { Patron } from './progression/memories';
import { LedgerOverlay } from './ui/metaPanels';

const PATRONS: Patron[] = ['oren', 'pip', 'marta', 'fen', 'asu'];

export const Flow = {
  title() {
    G.scenes.go(() => new TitleScene({
      start: () => (profile.introSeen ? Flow.hub('start') : Flow.intro()),
      credits: () => G.scenes.go(() => new CreditsScene(() => Flow.title()), 'fade', 0.6),
      ledger: () => { const t = G.scenes.current as TitleScene; t.overlays.push(new LedgerOverlay()); },
    }), 'fade', 0.6);
  },

  intro() {
    G.scenes.go(() => new CutsceneScene('intro', () => { profile.introSeen = true; saveProfile(); Flow.hub('start'); }), 'fade', 0.8);
  },

  hub(context: 'start' | 'death' | 'victory' | 'quit') {
    G.scenes.go(() => new HubScene({ startRun: (config?: RunConfig) => Flow.startRun(config), title: () => Flow.title() }, context), 'clock', 0.6);
  },

  /** the seated hands as a run config (solo: slot I with your workshop weapon) */
  configFromSeats(seed = (Math.random() * 2 ** 31) | 0): RunConfig {
    const seats = ensurePlayers();
    return {
      mode: 'standard', seed, contracts: {},
      players: seats.map((inp) => ({ slot: inp.slot, device: inp.device, hand: 'tick', weapon: profile.weapon })),
    };
  },

  /** a new run with the meta bonuses applied to every hand */
  newRun(seedOrConfig?: number | RunConfig): Run {
    const config = typeof seedOrConfig === 'object' ? seedOrConfig : Flow.configFromSeats(seedOrConfig);
    const run = new Run({ ...config, players: [] });
    run.bonuses.push(metaBonus());
    run.brass = nodeLevel('brass') * 40;
    run.startFullSand = !!nodeLevel('sand');
    run.startRerolls = nodeLevel('reroll');
    run.luck = nodeLevel('luck') ? 0.08 : 0;
    run.overwind = profile.overwind;
    run.config = config;
    for (const pc of config.players) run.lo(pc.slot);
    for (const lo of run.all) lo.hp = lo.mods.maxHp;
    return run;
  },

  startRun(config?: RunConfig) {
    const run = Flow.newRun(config);
    profile.runs++;
    saveProfile();
    const first = new GameScene(run, { kind: profile.tutorialDone ? 'combat' : 'tutorial', reward: 'memory', patron: run.rng.pick(PATRONS) });
    Flow.wire(first);
    G.scenes.go(() => first, 'clock', 0.8);
  },

  wire(s: GameScene) {
    s.onDeath = (run) => Flow.endRun(run, 'death');
    s.onQuit = (run) => Flow.endRun(run, 'quit');
    s.onVictory = (run) => Flow.endRun(run, 'victory');
  },

  endRun(run: Run, kind: RunEndKind) {
    (window as any).__botLog?.push(`[END] ${kind} floor=${run.floor} room=${run.roomIndex} t=${Math.round(run.time)}s shards=${run.shards}`);
    // bank shards (a fraction is lost on abandon)
    const banked = Math.round((kind === 'quit' ? Math.floor(run.shards * 0.5) : run.shards) * (1 + 0.2 * run.overwind));
    profile.shards += banked;
    profile.totalShards += banked;
    if (kind === 'death') profile.deaths++;
    if (kind === 'victory') { profile.wins++; if (profile.maxOverwind <= profile.overwind) profile.maxOverwind = profile.overwind + 1; }
    profile.bestFloor = Math.max(profile.bestFloor, run.floor);
    if (run.roomIndex > 0 || run.floor > 0) profile.tutorialDone = true;
    for (const id of run.lore) if (!profile.lore.includes(id)) profile.lore.push(id);
    for (const e of run.eventsSeen) markSeen('events', e);
    saveProfile();
    const after = () => (kind === 'victory'
      ? G.scenes.go(() => new CutsceneScene('ending', () => G.scenes.go(() => new CreditsScene(() => Flow.hub('victory')), 'fade', 0.8)), 'fade', 1)
      : Flow.hub(kind));
    G.scenes.go(() => new SummaryScene(run, kind, banked, after), 'fade', kind === 'victory' ? 1.2 : 0.8);
  },
};
