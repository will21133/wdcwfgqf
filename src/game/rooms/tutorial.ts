// The F3 tutorial room — retired (ONBOARD2 §4.9 S1 #2, §11.2; F4a). New players learn in the
// prologue《最后一分钟》(scenes/prologue.ts) and the first run's after-fight lessons; runs start in a
// combat room (FlowHooks.firstRoom). The 'tutorial' room kind stays registered with weight 0, so
// ?room=tutorial still loads it for regressions: the training automaton and a couple of coglings,
// without the floor inscriptions and the old coach (they piled text on the action).
import type { World } from '../world/world';

/** kept for the registry's 'tutorial' kind: nothing to set up any more */
export function setupTutorial(_w: World): void {}
