// Run the F4a onboarding scripts (ONBOARD2 §12.2) and audit them (§12.1).
//
// usage: node tools/scripts/onboard/runall.cjs [name …]        (default: every F4a script)
//   Each script's first step is {"t":0,"url":"<query>"}: the URL it runs on. Screenshots go to
//   tools/out/F4/onboard/<name>_<shot>.png, shot.cjs's log to tools/out/F4/onboard/<name>.log,
//   then tools/stageaudit.cjs checks every log (overlapFrames, demo-desync, page errors, CJK in tiny).
//   BASE=<dev server url> as for every tool.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;
const OUT = path.join(__dirname, '..', '..', 'out', 'F4', 'onboard');
const F4A = ['prologue_ref', 'prologue_ref_en', 'prologue_pad', 'prologue_kbonly', 'prologue_fail', 'prologue_skip', 'run1_lessons', 'gates', 'stage_dock'];
const names = process.argv.slice(2).length ? process.argv.slice(2) : F4A;
fs.mkdirSync(OUT, { recursive: true });
const logs = [];
for (const n of names) {
  const file = path.join(DIR, n + '.json');
  if (!fs.existsSync(file)) { console.log(`skip ${n}: no script`); continue; }
  const steps = JSON.parse(fs.readFileSync(file, 'utf8'));
  const url = steps.find((s) => s.url)?.url ?? '';
  const size = steps.find((s) => s.size)?.size ?? [1280, 720];
  const log = path.join(OUT, n + '.log');
  console.log(`▶ ${n}  ?${url}`);
  const t0 = Date.now();
  let out = '';
  try {
    out = execFileSync('node', [path.join(DIR, '..', '..', 'shot.cjs'), url, path.join(OUT, n + '.png'), '3000', String(size[0]), String(size[1]), file], { encoding: 'utf8', timeout: 30 * 60 * 1000, maxBuffer: 1 << 24 });
  } catch (e) { out = String(e.stdout ?? '') + '\n[pageerror] runner: ' + e.message; }
  fs.writeFileSync(log, out);
  logs.push(log);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s → ${path.relative(process.cwd(), log)}`);
}
try { execFileSync('node', [path.join(DIR, '..', '..', 'stageaudit.cjs'), ...logs], { stdio: 'inherit' }); }
catch { process.exitCode = 1; }
