"""从 Apple 的 hello 骨架字体（MacintoshSkeletal.otf）读出每个字形的中心线笔画，写入 data/apple/glyphs.json。

字体是 Apple 的文件，仓库里不带，提取出来的数据也不提交（data/apple/ 在 .gitignore 里）：
每个人从自己的系统里读一份，在本机生成。

字体在哪：
  macOS 27 自带：/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/MacintoshSkeletal.otf
  iOS 27 固件里同一个 framework 下也有一份（和 macOS 版不完全一样：点更少，o 写成一整笔而不是"进笔 + 圈 + 出笔"）

用法：
  python3 -m venv venv && venv/bin/pip install fonttools
  venv/bin/python tools/apple-extract.py                       # 读 macOS 自带的
  venv/bin/python tools/apple-extract.py path/to/MacintoshSkeletal.otf

字体里的自定义 strk 表是一段 JSON，每个字形：
  info     这个字形和前后字母怎么接：joinsForward / joinsBackward 是接出去 / 接进来的那一笔（只数 Open 笔画），
           joiningOptional* / optional*Kerning 是可以不接时的处理
  strokes  笔画列表，type 是 Open（普通一笔）、Dot（i、j 的点）、Final Attachment Anchor（出笔锚点）；
           deferred 为 "Next Break" 的笔画（i 的点、t 的横……）等到抬笔时再补；
           start / end 里 oncurve 为 false 表示端点只是控制方向的"影子点"，曲线不画到那里，
           target 是这一笔实际收在哪里
  points   [x, y, z, 笔的半径]，单位 em。点是均匀三次 B 样条的控制点（曲线不经过它们）；
           Apple 开机画面的笔宽 = 半径 × 2 × 1.55
这里统一换成字体单位（×1000），y 轴保持朝上（基线 0，x 高度约 370），拼词时再翻转。
"""
import hashlib
import json
import os
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
SYSTEM_FONT = "/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/MacintoshSkeletal.otf"
OUT_DIR = os.path.join(ROOT, "data", "apple")

path = sys.argv[1] if len(sys.argv) > 1 else SYSTEM_FONT
if not os.path.exists(path):
    sys.exit(f"找不到字体：{path}\n请传入 MacintoshSkeletal.otf 的路径（见文件开头的说明）")

raw = open(path, "rb").read()
font = TTFont(path)
if "strk" not in font:
    sys.exit(f"{path} 里没有 strk 表，不是 Apple 的骨架字体")
upm = font["head"].unitsPerEm
strk = json.loads(font["strk"].data)
hmtx = font["hmtx"]
cmap = font.getBestCmap()

r1 = lambda v: round(v * upm, 1)


def point(p):
    x, y, z, w = p
    return [r1(x), r1(y), r1(z), r1(w)] if z else [r1(x), r1(y), 0, r1(w)]


def end_info(e):
    out = {"oncurve": e.get("oncurve", True), "tangency": e.get("tangency", 0), "cap": e.get("cap", "round")}
    if e.get("attachmentRadiusScale", 1) != 1:
        out["attachmentRadiusScale"] = e["attachmentRadiusScale"]
    if "target" in e:
        out["target"] = point(e["target"])
    return out


glyphs = {}
for name, g in strk["glyphs"].items():
    strokes = []
    for s in g["strokes"]:
        item = {"type": s["type"], "points": [point(p) for p in s["points"]]}
        info = s.get("info")
        if info:
            if info.get("deferred", "Not") != "Not":
                item["deferred"] = info["deferred"]
            if "start" in info:
                item["start"] = end_info(info["start"])
            if "end" in info:
                item["end"] = end_info(info["end"])
        strokes.append(item)
    glyphs[name] = {"advance": hmtx[name][0], "info": g["info"], "strokes": strokes}

os2 = font["OS/2"]
data = {
    "note": "Apple MacintoshSkeletal.otf 的中心线笔画（字体单位，y 朝上）。由 tools/apple-extract.py 在本机生成，不要提交或公开",
    "source": {
        "file": os.path.abspath(path),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "version": font["name"].getDebugName(5),
        "glyphCount": len(glyphs),
    },
    "metrics": {"unitsPerEm": upm, "xHeight": os2.sxHeight, "capHeight": os2.sCapHeight,
                "ascender": font["hhea"].ascent, "descender": font["hhea"].descent},
    "cmap": {chr(cp): name for cp, name in sorted(cmap.items()) if name in glyphs},
    "glyphs": glyphs,
}

os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, "glyphs.json")
with open(out, "w") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

lower = [c for c in "abcdefghijklmnopqrstuvwxyz" if c in data["cmap"]]
variants = sum(1 for n in glyphs if n.split(".")[0] in lower and "cyrl" not in n)
print(f"读取 {path}")
print(f"  sha256 {data['source']['sha256'][:16]}…，{len(glyphs)} 个字形，cmap {len(data['cmap'])} 个字符")
print(f"  小写 {len(lower)}/26，连同变体共 {variants} 个字形；x 高度 {os2.sxHeight}，大写高度 {os2.sCapHeight}")
print(f"写入 {out}（{os.path.getsize(out) // 1024} KB）")
