export const STEP = 1 / 60;

/** Fixed-timestep loop: update at 60Hz, render every animation frame. */
export function startLoop(update: (dt: number) => void, render: (alpha: number, frameDt: number) => void, beforeFrame?: () => void) {
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1; // tab switches / hitches
    acc += dt;
    beforeFrame?.();
    let steps = 0;
    while (acc >= STEP && steps < 6) {
      update(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps >= 6) acc = 0;
    render(acc / STEP, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
