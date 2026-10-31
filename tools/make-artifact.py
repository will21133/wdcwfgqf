"""Turn the single-file Vite build into a publishable artifact page.

usage: python3 tools/make-artifact.py dist-single/index.html <out.html>
"""
import re
import sys

src, out = sys.argv[1], sys.argv[2]
html = open(src, encoding='utf-8').read()

styles = '\n'.join(re.findall(r'<style[^>]*>(.*?)</style>', html, re.S))
scripts = re.findall(r'<script type="module"[^>]*>(.*?)</script>', html, re.S)
if not scripts:
    raise SystemExit('no module script found in build')
script = scripts[0]

page = f'''<title>秒针 SECOND HAND</title>
<style>
/* One deliberate dark look: the night of a city frozen at 11:59:59. */
:root {{ --night: #07060d; --dust: #8f7f9c; --brass: #d99c45; color-scheme: dark; }}
html, body {{ height: 100%; }}
body {{ background: var(--night); color: var(--dust); }}
{styles}
#touch-note {{ position: fixed; inset: auto 0 env(safe-area-inset-bottom, 0px) 0; padding: 10px max(16px, env(safe-area-inset-left, 0px)) 10px max(16px, env(safe-area-inset-right, 0px));
  font: 13px/1.4 monospace; color: var(--brass); background: rgba(7, 6, 13, 0.85); text-align: center; pointer-events: none; }}
@media (hover: hover) and (pointer: fine) {{ #touch-note {{ display: none; }} }}
</style>
<canvas id="screen" tabindex="0"></canvas>
<div id="boot">· · ·</div>
<div id="touch-note">秒针需要键盘或 Xbox 手柄 · SECOND HAND needs a keyboard or an Xbox controller</div>
<script type="module">
{script}
</script>
'''
# a closing </script> inside the bundle would break the page
assert '</script>' not in script, 'bundle contains a literal </script>'
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page.encode('utf-8')), 'bytes')
