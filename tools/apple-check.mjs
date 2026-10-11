#!/usr/bin/env node
// 拿 apple-shaper.js 排 data/apple/check.json 里的词，和 harfbuzz 的结果逐个比对（字形名、位置）。
// 先运行 tools/apple-extract.py、tools/apple-rules.py、tools/apple-check.py
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(root, "data", "apple", f), "utf8"));
const { create } = createRequire(import.meta.url)(join(root, "apple-shaper.js"));
const shaper = create(read("rules.json"), read("glyphs.json"));

// uharfbuzz 的 cluster 是第几个 Unicode 字符，换成 JS 字符串下标（BMP 以外的字符占两个下标）
const charToIndex = (text) => {
  const map = {};
  let n = 0, i = 0;
  for (const ch of text) {
    map[n++] = i;
    i += ch.length;
  }
  return map;
};

let bad = 0;
const cases = read("check.json");
for (const c of cases) {
  const ours = shaper.shape(c.text, { lang: c.lang });
  const c2i = charToIndex(c.text);
  const ref = c.hb.map(([glyph, cluster, x, y]) => ({ glyph, cluster: c2i[cluster] ?? cluster, x, y }));
  const same = ours.length === ref.length && ours.every((o, i) =>
    o.glyph === ref[i].glyph && o.cluster === ref[i].cluster && Math.abs(o.x - ref[i].x) < 0.5 && Math.abs(o.y - ref[i].y) < 0.5);
  if (!same) {
    if (bad++ < 15) {
      console.log(`✗ ${c.text}${c.lang ? ` (${c.lang})` : ""}`);
      console.log("  harfbuzz:", ref.map((r) => `${r.glyph}@${r.x}${r.y ? "," + r.y : ""}`).join(" "));
      console.log("  ours:    ", ours.map((r) => `${r.glyph}@${r.x}${r.y ? "," + r.y : ""}`).join(" "));
    }
  }
}
console.log(`${cases.length - bad} / ${cases.length} 一致`);
process.exit(bad ? 1 : 0);
