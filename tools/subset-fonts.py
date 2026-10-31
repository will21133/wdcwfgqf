"""Subset the Fusion Pixel webfonts to the characters the game actually uses.

usage: python3 tools/subset-fonts.py            (run automatically by `npm run build` / `build:single`)

Scans every source file under src/ (plus index.html) for non-ASCII characters, adds printable ASCII,
and writes subset woff2 files to build/fonts/. vite.config.ts swaps those in for production builds
when they exist, so the dev server keeps the full fonts and new strings never go missing.
Needs fontTools + brotli (pip install fonttools brotli). Without them it prints a warning and
exits 0: the build then ships the full fonts (larger, still correct).
"""
import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = ['fusion-12', 'fusion-10', 'fusion-8']
SRC_DIR = os.path.join(ROOT, 'src', 'assets', 'fonts')
OUT_DIR = os.path.join(ROOT, 'build', 'fonts')
# glyphs drawn from code points that are composed at runtime rather than written in source
EXTRA = '…—–·•“”‘’「」『』《》【】（）：；，。、？！％／～×÷±←↑→↓↔↕◀▶▸◂▴▾☰'


def used_chars() -> str:
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars.update(EXTRA)
    files = glob.glob(os.path.join(ROOT, 'src', '**', '*.ts'), recursive=True)
    files += glob.glob(os.path.join(ROOT, 'src', '**', '*.json'), recursive=True)
    files.append(os.path.join(ROOT, 'index.html'))
    for f in files:
        try:
            with open(f, encoding='utf-8') as fh:
                for ch in fh.read():
                    if ord(ch) > 0x7E and not (0xD800 <= ord(ch) <= 0xDFFF):
                        chars.add(ch)
        except OSError:
            pass
    return ''.join(sorted(chars))


def main() -> int:
    try:
        from fontTools import subset  # noqa: F401
        from fontTools.ttLib import TTFont
        import brotli  # noqa: F401  (woff2 output)
    except ImportError as e:
        print(f'[subset-fonts] skipped: {e}. Install with `pip install fonttools brotli`; the build ships full fonts.')
        return 0
    from fontTools import subset as ftsubset

    text = used_chars()
    os.makedirs(OUT_DIR, exist_ok=True)
    total_in = total_out = 0
    for name in FONTS:
        src = os.path.join(SRC_DIR, name + '.woff2')
        dst = os.path.join(OUT_DIR, name + '.woff2')
        if not os.path.exists(src):
            print(f'[subset-fonts] missing {src}')
            continue
        font = TTFont(src)
        cmap = font.getBestCmap()
        missing = [c for c in text if ord(c) not in cmap and not c.isspace()]
        opts = ftsubset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.name_languages = ['*']
        opts.notdef_outline = True
        opts.glyph_names = False
        sub = ftsubset.Subsetter(options=opts)
        sub.populate(text=text)
        sub.subset(font)
        font.flavor = 'woff2'
        font.save(dst)
        a, b = os.path.getsize(src), os.path.getsize(dst)
        total_in += a
        total_out += b
        note = f', {len(missing)} chars not in font: {"".join(missing[:20])}' if missing else ''
        print(f'[subset-fonts] {name}: {a // 1024} KB -> {b // 1024} KB ({len(text)} chars{note})')
    print(f'[subset-fonts] total {total_in // 1024} KB -> {total_out // 1024} KB, written to build/fonts/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
