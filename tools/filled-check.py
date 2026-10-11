"""和 Macintosh Skeletal Filled 对照字母之间的接口（只在本机做，不分发任何东西）。

github.com/npwitk/Macintosh-Skeletal-Filled 从 Apple 的渲染程序里记录了约 14000 对字母的连笔，
做成了实心字体：字母之间插一个零宽的连接字形（_br.*）。这里把每个连接字形单独排成位图、取中心线，
量它到 apple-writer.js 画出的中心线的距离——就是我们估算的接口和 Apple 实际画法差多少。

字体要自己下载（个人、非商业授权，不要放进仓库）。用法：
  venv/bin/pip install uharfbuzz numpy pillow scikit-image scipy
  venv/bin/python tools/filled-check.py path/to/MacintoshSkeletalFilled.otf [词表.txt]
不给词表就用全部 26×26 个两字母组合（前后各加一个 n，放在词中间）。
"""
import json
import os
import subprocess
import sys
import tempfile
from collections import defaultdict

import numpy as np
import uharfbuzz as hb
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from PIL import Image, ImageChops, ImageDraw
from scipy.spatial import cKDTree
from skimage.morphology import skeletonize

ROOT = os.path.join(os.path.dirname(__file__), "..")
font_path = sys.argv[1]
tt = TTFont(font_path)
gs = tt.getGlyphSet()
order = tt.getGlyphOrder()
font = hb.Font(hb.Face(open(font_path, "rb").read()))
K = 1000 / tt["head"].unitsPerEm  # 他们的单位 → Apple 骨架字体的单位


class Poly(BasePen):
    """轮廓 → 折线"""

    def __init__(self):
        super().__init__(gs)
        self.contours, self.cur = [], None

    def _moveTo(self, p):
        self.cur = [p]
        self.contours.append(self.cur)

    def _lineTo(self, p):
        self.cur.append(p)

    def _curveToOne(self, a, b, c):
        p0 = np.array(self.cur[-1])
        for t in np.linspace(0, 1, 12)[1:]:
            u = 1 - t
            self.cur.append(tuple(u * u * u * p0 + 3 * u * u * t * np.array(a) + 3 * u * t * t * np.array(b) + t * t * t * np.array(c)))

    def _qCurveToOne(self, a, b):
        p0 = np.array(self.cur[-1])
        for t in np.linspace(0, 1, 10)[1:]:
            u = 1 - t
            self.cur.append(tuple(u * u * p0 + 2 * u * t * np.array(a) + t * t * np.array(b)))


def centreline(contours):
    """一个字形的轮廓（我们的单位，y 朝下）→ 中心线像素点（1 像素 = 1 单位）"""
    xs = [q[0] for c in contours for q in c]
    ys = [q[1] for c in contours for q in c]
    ox, oy = min(xs) - 5, min(ys) - 5
    w, h = int(max(xs) - ox + 5), int(max(ys) - oy + 5)
    mask = Image.new("1", (w, h), 0)
    for c in contours:  # 奇偶填充
        m = Image.new("1", (w, h), 0)
        ImageDraw.Draw(m).polygon([(a - ox, b - oy) for a, b in c], fill=1)
        mask = ImageChops.logical_xor(mask, m)
    sk = np.argwhere(skeletonize(np.ascontiguousarray(np.array(mask.convert("L")) > 127)))
    return np.c_[sk[:, 1] + ox, sk[:, 0] + oy]


if len(sys.argv) > 2:
    words_file = sys.argv[2]
else:
    words_file = tempfile.mktemp(suffix=".txt")
    letters = "abcdefghijklmnopqrstuvwxyz"
    open(words_file, "w").write("\n".join("n" + a + b + "n" for a in letters for b in letters))
ours_file = tempfile.mktemp(suffix=".json")
subprocess.run(["node", os.path.join(ROOT, "tools", "filled-dump.mjs"), words_file, ours_file], check=True)

rows = []
for item in json.load(open(ours_file)):
    tree = cKDTree(np.array(item["pts"]))
    buf = hb.Buffer()
    buf.add_str(item["word"])
    buf.guess_segment_properties()
    hb.shape(font, buf, {})
    x, prev = 0, "?"
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        if name.startswith("_br."):
            pen = Poly()
            gs[name].draw(pen)
            if pen.contours:
                sk = centreline([[((px + x) * K, -py * K) for px, py in c] for c in pen.contours])
                if len(sk) > 10:
                    d = np.sort(tree.query(sk)[0])[: int(len(sk) * 0.9)]  # 去掉端头骨架分叉
                    rows.append((item["word"], prev, float(d.mean()), float(d.max())))
        else:
            prev = name
        x += pos.x_advance

print(f"接口 {len(rows)} 个：我们的中心线到 Apple 连笔中心线平均 {np.mean([r[2] for r in rows]):.1f}，中位 {np.median([r[2] for r in rows]):.1f}（字体单位，x 高度约 370）")
rows.sort(key=lambda r: -r[2])
for word, prev, mean, mx in rows[:10]:
    print(f"  {word:24} {prev:>22} 之后  平均 {mean:5.1f}  最大 {mx:5.1f}")
