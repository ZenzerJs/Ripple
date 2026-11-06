"""Build web fonts from Google Fonts' upstream variable TTF files.

Usage: python scripts/subset-brand-fonts.py path/to/downloaded/ttfs
Requires fonttools[woff]. Normal web builds use the committed WOFF2 files.
"""

import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

source = Path(sys.argv[1])
destination = Path(__file__).resolve().parents[1] / "frontend/public/fonts"
characters = set()
for start, end in ((0, 0x24F), (0x370, 0x3FF), (0x2000, 0x206F),
                   (0x20A0, 0x20CF), (0x2100, 0x22FF), (0xFFFD, 0xFFFD)):
    characters.update(range(start, end + 1))

for name in ("Fraunces", "Fraunces-Italic", "Inter", "JetBrainsMono"):
    font = TTFont(source / f"{name}.ttf")
    options = subset.Options()
    options.layout_features = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=characters)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(destination / f"{name}.woff2")
