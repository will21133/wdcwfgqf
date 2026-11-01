// Stage audit (ONBOARD2 §4.10, §12.1): reads the logs tools/shot.cjs printed for the onboarding
// scripts and fails if any of them saw teaching text over a hard obstacle.
//
// usage: node tools/stageaudit.cjs tools/out/F4/onboard/*.log
//   Each script ends with {"eval":"__tut.audit()"} (and usually the demo-desync count as
//   {"eval":"__tut.log.filter(e=>e.ev==='demo-desync').length"}): the log line looks like
//   [eval] {"frames":812,"overlapFrames":0,"worst":null}
// Exit 1 when a log has overlapFrames > 0, a desync count > 0, a page error, or no audit line at all.
const fs = require('node:fs');

const files = process.argv.slice(2).filter((f) => fs.existsSync(f));
if (!files.length) { console.error('stageaudit: no log files given (shot.cjs output, one per script)'); process.exit(2); }
let bad = 0;
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  let audit = null, desync = null, errors = 0, tiny = 0;
  for (const l of lines) {
    if (l.includes('[pageerror]')) errors++;
    if (l.includes('[text] CJK in tiny')) tiny++;
    const m = /^\[eval\] (.*)$/.exec(l.trim());
    if (!m) continue;
    let v;
    try { v = JSON.parse(m[1]); } catch { continue; }
    if (v && typeof v === 'object' && 'overlapFrames' in v) audit = v;
    if (v && typeof v === 'object' && 'desync' in v) desync = v.desync;
  }
  // a bare number right after an audit line is the desync count
  for (let i = 0; i < lines.length - 1; i++) if (/overlapFrames/.test(lines[i])) { const n = /^\[eval\] (\d+)$/.exec(lines[i + 1].trim()); if (n) desync = +n[1]; }
  const name = f.replace(/^.*\//, '');
  const problems = [];
  if (!audit) problems.push('no __tut.audit() line');
  else if (audit.overlapFrames > 0) problems.push(`overlapFrames ${audit.overlapFrames}/${audit.frames} (worst: ${JSON.stringify(audit.worst)})`);
  if (desync) problems.push(`demo-desync ${desync}`);
  if (errors) problems.push(`${errors} page error(s)`);
  if (tiny) problems.push(`${tiny} "[text] CJK in tiny"`);
  if (problems.length) { bad++; console.log(`FAIL ${name}: ${problems.join('; ')}`); }
  else console.log(`ok   ${name}: ${audit.frames} frames audited, 0 overlaps${desync === 0 ? ', 0 desync' : ''}`);
}
console.log(bad ? `\n${bad} of ${files.length} failed` : `\nall ${files.length} passed`);
process.exit(bad ? 1 : 0);
