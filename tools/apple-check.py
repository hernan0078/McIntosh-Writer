"""用 harfbuzz 排一批词，作为 apple-shaper.js 的标准答案，写入 data/apple/check.json；再运行 tools/apple-check.mjs 逐词比对。

词表：所有 1–3 个小写字母的组合、首字母大写的两字母组合、SF-Hello 的词、带重音的词、按语言换写法的例子。

  venv/bin/pip install uharfbuzz
  venv/bin/python tools/apple-check.py [path/to/MacintoshSkeletal.otf]
  node tools/apple-check.mjs
"""
import itertools
import json
import os
import sys

import uharfbuzz as hb
from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
SYSTEM_FONT = "/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/MacintoshSkeletal.otf"
path = sys.argv[1] if len(sys.argv) > 1 else SYSTEM_FONT
order = TTFont(path).getGlyphOrder()
font = hb.Font(hb.Face(open(path, "rb").read()))

low = "abcdefghijklmnopqrstuvwxyz"
words = ["".join(p) for n in (1, 2, 3) for p in itertools.product(low, repeat=n)]
words += [a.upper() + b for a in low for b in low]
words += ["hello", "hallo", "hola", "olá", "bonjour", "ciao", "merhaba", "dobar dan", "xin chào", "ahoj", "hej", "hei",
          "cześć", "salut", "California", "facebook", "merci", "wood", "oxonom", "exam", "mix", "quick", "happy",
          "wave", "owe", "vivid", "book", "work", "world", "awkward", "Über", "façade", "naïve", "smörgåsbord",
          "żółć", "łódź", "crème brûlée", "Ångström", "señor", "São Paulo", "ijsje", "IJssel", "Kraków", "Dvořák",
          "ştiinţă", "Hello World", "the quick brown fox jumps over the lazy dog"]
cases = [{"text": w} for w in words]
cases += [{"text": t, "lang": l} for t, l in [("col·lecció", "CAT"), ("ijsje", "NLD"), ("ştiinţă", "ROM"), ("Kraków", "PLK"),
                                              ("ação", "PTG"), ("ñandú", "ESP"), ("fjord", "NOR"), ("kärlek", "SVE")]]

for c in cases:
    buf = hb.Buffer()
    buf.add_str(c["text"])
    buf.guess_segment_properties()
    if "lang" in c:
        buf.language = {"CAT": "ca", "NLD": "nl", "ROM": "ro", "PLK": "pl", "PTG": "pt", "ESP": "es", "NOR": "no", "SVE": "sv"}[c["lang"]]
    hb.shape(font, buf, {})
    x, out = 0, []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        out.append([order[info.codepoint], info.cluster, x + pos.x_offset, pos.y_offset])
        x += pos.x_advance
    c["hb"] = out

dst = os.path.join(ROOT, "data", "apple", "check.json")
json.dump(cases, open(dst, "w"), ensure_ascii=False, separators=(",", ":"))
print(f"{len(cases)} 个词，写入 {dst}")
