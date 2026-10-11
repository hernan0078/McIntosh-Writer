"""从 Apple 骨架字体读出"换写法"和"字距"的规则，写入 data/apple/rules.json（只在本机，不提交）。

网页用 apple-shaper.js 照这些规则排字，不需要字体文件，也不需要 harfbuzz。
导出的是字体里 OpenType 规则的原样结构：
  GSUB（换写法）：ccmp 拆 / 合重音字母，locl 按语言换写法，calt 按前后字母换写法（highEntry、midExit、词首词尾……）
  GPOS（位置）：kern 字距，mark 把重音符号放到字母上
  GDEF：哪些字形是附加符号（规则里"忽略附加符号"要用）

用法（先运行 tools/apple-extract.py；字体路径同它）：
  venv/bin/python tools/apple-rules.py [path/to/MacintoshSkeletal.otf]
"""
import json
import os
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
SYSTEM_FONT = "/System/Library/PrivateFrameworks/SetupAssistantSupportUI.framework/Versions/A/Resources/MacintoshSkeletal.otf"
path = sys.argv[1] if len(sys.argv) > 1 else SYSTEM_FONT
if not os.path.exists(path):
    sys.exit(f"找不到字体：{path}")
font = TTFont(path)

cov = lambda c: list(c.glyphs) if c else []


def attr(obj, *names):
    """fontTools 新旧版本字段名不同（SubstLookupRecord / LookupRecord……），取存在的那个"""
    for n in names:
        if hasattr(obj, n):
            return getattr(obj, n) or []
    return []


def records(recs):
    return [[r.SequenceIndex, r.LookupListIndex] for r in recs]


def gsub_subtable(kind, st):
    if kind == 1:
        return {"map": dict(st.mapping)}
    if kind == 2:
        return {"map": {g: list(seq) for g, seq in st.mapping.items()}}
    if kind == 4:
        return {"ligatures": {first: [[lig.Component, lig.LigGlyph] for lig in ligs] for first, ligs in st.ligatures.items()}}
    if kind == 6 and st.Format == 1:
        rules = {}
        for g, rs in zip(cov(st.Coverage), attr(st, "ChainSubRuleSet", "ChainRuleSet")):
            if rs is None:
                continue
            for r in attr(rs, "ChainSubRule", "ChainRule"):
                rules.setdefault(g, []).append({
                    "backtrack": list(r.Backtrack), "input": list(r.Input), "lookahead": list(r.LookAhead),
                    "lookups": records(attr(r, "SubstLookupRecord", "LookupRecord")),
                })
        return {"format": 1, "rules": rules}
    if kind == 6 and st.Format == 3:
        return {
            "format": 3,
            "backtrack": [cov(c) for c in st.BacktrackCoverage],  # 离当前字形最近的在前
            "input": [cov(c) for c in st.InputCoverage],
            "lookahead": [cov(c) for c in st.LookAheadCoverage],
            "lookups": records(attr(st, "SubstLookupRecord", "LookupRecord")),
        }
    raise SystemExit(f"GSUB 里有没处理的格式：type {kind} format {getattr(st, 'Format', None)}")


def value(v):
    return {k: getattr(v, k) for k in ("XPlacement", "YPlacement", "XAdvance", "YAdvance") if v is not None and getattr(v, k, 0)}


def gpos_subtable(kind, st):
    if kind == 2 and st.Format == 2:
        c1 = st.ClassDef1.classDefs if st.ClassDef1 else {}
        c2 = st.ClassDef2.classDefs if st.ClassDef2 else {}
        pairs = {}
        for i, rec in enumerate(st.Class1Record):
            for j, r2 in enumerate(rec.Class2Record):
                a, b = value(r2.Value1), value(r2.Value2)
                if a or b:
                    pairs[f"{i},{j}"] = [a, b] if b else [a]
        return {"format": 2, "coverage": cov(st.Coverage), "class1": c1, "class2": c2, "pairs": pairs}
    if kind == 2 and st.Format == 1:
        pairs = {}
        for g, ps in zip(cov(st.Coverage), st.PairSet):
            for pv in ps.PairValueRecord:
                a, b = value(pv.Value1), value(pv.Value2)
                if a or b:
                    pairs.setdefault(g, {})[pv.SecondGlyph] = [a, b] if b else [a]
        return {"format": 1, "pairs": pairs}
    if kind == 4:
        marks = {g: [m.Class, m.MarkAnchor.XCoordinate, m.MarkAnchor.YCoordinate]
                 for g, m in zip(cov(st.MarkCoverage), st.MarkArray.MarkRecord)}
        bases = {}
        for g, b in zip(cov(st.BaseCoverage), st.BaseArray.BaseRecord):
            bases[g] = {c: [a.XCoordinate, a.YCoordinate] for c, a in enumerate(b.BaseAnchor) if a is not None}
        return {"marks": marks, "bases": bases}
    raise SystemExit(f"GPOS 里有没处理的格式：type {kind} format {getattr(st, 'Format', None)}")


def table(tag, convert):
    t = font[tag].table
    features = [{"tag": fr.FeatureTag, "lookups": list(fr.Feature.LookupListIndex)} for fr in t.FeatureList.FeatureRecord]
    scripts = {}
    for sr in t.ScriptList.ScriptRecord:
        langs = {"dflt": list(sr.Script.DefaultLangSys.FeatureIndex)} if sr.Script.DefaultLangSys else {}
        for lr in sr.Script.LangSysRecord:
            langs[lr.LangSysTag.strip()] = list(lr.LangSys.FeatureIndex)
        scripts[sr.ScriptTag] = langs
    lookups = []
    for lk in t.LookupList.Lookup:
        kind = lk.LookupType
        subs = list(lk.SubTable)
        if kind in (7, 9):  # 扩展类型：拆开
            kind = subs[0].ExtensionLookupType
            subs = [s.ExtSubTable for s in subs]
        lookups.append({"type": kind, "flag": lk.LookupFlag, "subtables": [convert(kind, s) for s in subs]})
    return {"scripts": scripts, "features": features, "lookups": lookups}


gdef = font["GDEF"].table
data = {
    "note": "Apple MacintoshSkeletal.otf 的 GSUB / GPOS / GDEF 规则（原样结构）。由 tools/apple-rules.py 在本机生成，不要提交或公开",
    "glyphClass": dict(gdef.GlyphClassDef.classDefs) if gdef.GlyphClassDef else {},  # 1 普通 2 连字 3 附加符号 4 组件
    "gsub": table("GSUB", gsub_subtable),
    "gpos": table("GPOS", gpos_subtable),
}
out = os.path.join(ROOT, "data", "apple", "rules.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print(f"GSUB {len(data['gsub']['lookups'])} 组规则，GPOS {len(data['gpos']['lookups'])} 组规则，"
      f"附加符号 {sum(1 for c in data['glyphClass'].values() if c == 3)} 个")
print(f"写入 {out}（{os.path.getsize(out) // 1024} KB）")
