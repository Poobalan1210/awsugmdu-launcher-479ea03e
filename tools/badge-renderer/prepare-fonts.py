#!/usr/bin/env python3
"""
Build a subset, base64-encoded webfont pair for embedding into badge SVGs.

Why embed at all: a badge is a portable artefact. If the SVG names a font by
family, it renders in whatever the viewer happens to have installed — so the
same badge looks different in Chrome on macOS, in a Linux CI rasteriser, and in
LinkedIn's preview crawler. Embedding the outlines makes the badge render
identically everywhere and removes the build's dependency on system fonts.

Font choice: Inter (SIL Open Font License 1.1) stands in for Amazon Ember.
Ember is proprietary and not redistributable, so it cannot be embedded. Inter is
a UI-first sans with the same generous apertures and a full weight range, and
its licence explicitly permits embedding.

Subsetting keeps this practical: the full Inter TTF is ~300 KB per weight, but
badges only ever draw a known, small character set, so each weight subsets to a
few KB of woff2.

Run:  ./.venv/bin/python prepare-fonts.py
Out:  fonts.generated.json   (committed-by-build, read by badge-template.js)
"""

import base64
import io
import json
import pathlib
import sys
import urllib.request

from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).parent
OUT = HERE / 'fonts.generated.json'

# Latin: Inter. Resolved from the Google Fonts CSS2 API.
#   300 issuer lockup   500 recipient name   700 role
SOURCES = {
    300: 'https://fonts.gstatic.com/s/inter/v20/'
         'UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuOKfMZg.ttf',
    500: 'https://fonts.gstatic.com/s/inter/v20/'
         'UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf',
    700: 'https://fonts.gstatic.com/s/inter/v20/'
         'UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
}

# Tamil: Noto Sans Tamil, also SIL OFL. Required, not optional — recipient names
# come from registration, the group is in Madurai, and Inter has zero Tamil
# coverage, so a Tamil name would render as tofu boxes on the credential.
TAMIL_SOURCES = {
    500: 'https://fonts.gstatic.com/s/notosanstamil/v31/'
         'ieVc2YdFI3GCY6SyQy1KfStzYKZgzN1z4LKDbeZce-0429tBManUktuex7vGo70R.ttf',
    700: 'https://fonts.gstatic.com/s/notosanstamil/v31/'
         'ieVc2YdFI3GCY6SyQy1KfStzYKZgzN1z4LKDbeZce-0429tBManUktuex7sYpL0R.ttf',
}

# Everything a badge can draw. A generous superset of the current badge set so
# adding a role name does not silently render tofu.
GLYPHS = (
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    'abcdefghijklmnopqrstuvwxyz'
    '0123456789'
    " .,:;'\"!?&/()[]-+*#%@_"
    '\u2013\u2014\u2019\u201c\u201d\u00b7'  # en/em dash, curly quotes, middot
)

# Tamil block U+0B80–U+0BFF, plus the ZWNJ/ZWJ that Tamil conjuncts rely on.
TAMIL_GLYPHS = ''.join(chr(c) for c in range(0x0B80, 0x0C00)) + '\u200c\u200d'
TAMIL_RANGE = 'U+0B80-0BFF, U+200C-200D'


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def read_metrics(ttf: bytes, text: str) -> dict:
    """Per-character advance widths, so the renderer can measure text exactly
    instead of approximating from an average-advance fudge factor."""
    font = TTFont(io.BytesIO(ttf))
    upem = font['head'].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font['hmtx']
    advances = {}
    for ch in text:
        name = cmap.get(ord(ch))
        if name and name in hmtx.metrics:
            advances[ch] = hmtx.metrics[name][0]
    os2 = font['OS/2']
    return {
        'unitsPerEm': upem,
        'capHeight': getattr(os2, 'sCapHeight', None) or int(upem * 0.72),
        'ascender': font['hhea'].ascender,
        'descender': font['hhea'].descender,
        'advances': advances,
    }


def subset_to_woff2(ttf: bytes, text: str) -> tuple[bytes, int, int]:
    font = TTFont(io.BytesIO(ttf))
    before = len(ttf)

    opts = Options()
    opts.layout_features = ['kern', 'liga', 'calt']  # keep kerning
    opts.desubroutinize = True
    opts.hinting = False
    opts.notdef_outline = True
    opts.drop_tables += ['DSIG']

    sub = Subsetter(options=opts)
    sub.populate(text=text)
    sub.subset(font)

    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue(), before, len(buf.getvalue())


def build(label: str, sources: dict, glyphs: str):
    faces, metrics = {}, {}
    print(f'subsetting {label} -> woff2')
    for weight, url in sources.items():
        raw = fetch(url)
        woff2, before, after = subset_to_woff2(raw, glyphs)
        faces[str(weight)] = base64.b64encode(woff2).decode('ascii')
        metrics[str(weight)] = read_metrics(raw, glyphs)
        print(f'  weight {weight}: {before / 1024:6.1f} KB ttf'
              f' -> {after / 1024:5.1f} KB woff2 subset'
              f'  ({100 * after / before:.1f}%)'
              f'  {len(metrics[str(weight)]["advances"])} advances')
    return faces, metrics


def main() -> int:
    try:
        faces, metrics = build('Inter (Latin)', SOURCES, GLYPHS)
        tamil_faces, tamil_metrics = build('Noto Sans Tamil', TAMIL_SOURCES, TAMIL_GLYPHS)
    except Exception as exc:
        print(f'  download/subset failed: {exc}', file=sys.stderr)
        return 1

    payload = {
        'family': 'AWSUGMDU Sans',   # local alias; avoids clashing with an
                                     # installed Inter of a different version
        'source': 'Inter',
        'license': 'SIL Open Font License 1.1',
        'licenseUrl': 'https://openfontlicense.org',
        'glyphs': GLYPHS,
        'faces': faces,
        'metrics': metrics,
        # Same family name, restricted unicode-range. The browser picks the
        # Tamil face only for Tamil codepoints, so mixed Latin/Tamil names in a
        # single <text> element resolve per character with no markup changes.
        'tamil': {
            'source': 'Noto Sans Tamil',
            'license': 'SIL Open Font License 1.1',
            'unicodeRange': TAMIL_RANGE,
            'faces': tamil_faces,
            'metrics': tamil_metrics,
        },
    }
    OUT.write_text(json.dumps(payload), encoding='utf-8')
    total = (sum(len(v) for v in faces.values())
             + sum(len(v) for v in tamil_faces.values()))
    print(f'wrote {OUT.name}  ({total / 1024:.1f} KB base64 total)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
