#!/usr/bin/env node
// 核对 apple-font.js（直接读字体文件 + harfbuzz）和 data/apple + apple-shaper.js：字形数据、排字结果（含 o 穿过）逐词比对。
// 先运行 tools/apple-extract.py、tools/apple-rules.py、tools/apple-check.py（用同一份字体）
//   node tools/apple-font-check.mjs path/to/MacintoshSkeletal.otf
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
const R = new URL("..", import.meta.url).pathname;
const read = (f) => JSON.parse(readFileSync(R + "data/apple/" + f, "utf8"));
const appleFont = req(R + "apple-font.js");
const extras = req(R + "apple-extras.js");
const bytes = readFileSync(process.argv[2]);
const font = await appleFont.load(bytes, { hbUrl: R + "vendor/harfbuzzjs/index.mjs" });
console.log(`字体 ${font.source.version}，sha256 ${font.source.sha256.slice(0, 12)}…，${font.source.glyphCount} 个字形`);
const ref = read("glyphs.json");
extras.extend(ref); extras.extend(font.glyphs);
// 字形数据一致？
// 字形数据：Python 和 JS 四舍五入不同，个别坐标会差 0.1，忽略 0.15 以内的差别
const close = (a, b) => typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 0.15 : a && b && typeof a === "object" ? Object.keys({ ...a, ...b }).every((k) => close(a[k], b[k])) : a === b;
let gd = 0;
for (const [n, g] of Object.entries(ref.glyphs)) if (!close(g, font.glyphs.glyphs[n]) && gd++ < 3) console.log("字形数据不同：", n);
console.log(`字形数据不同 ${gd} 个`);
const shaper = req(R + "apple-shaper.js").create(read("rules.json"), ref);
const cases = read("check.json");
if (ref.source && font.source.sha256 !== ref.source.sha256) console.log("注意：data/apple 是用另一份字体生成的，排字结果本来就会有差别");
let bad = 0;
// 字体原样；o 穿过 + p 一笔写完（apple-extras.js 补的两种换写法）
for (const c of cases) for (const extra of [false, true]) {
  const opts = { lang: c.lang, oCross: extra, pJoin: extra };
  const a = shaper.shape(c.text, opts), b = font.shaper.shape(c.text, opts);
  const same = a.length === b.length && a.every((g, i) => g.glyph === b[i].glyph && g.cluster === b[i].cluster && Math.abs(g.x - b[i].x) < 0.5 && Math.abs(g.y - b[i].y) < 0.5);
  if (!same && bad++ < 5) console.log("✗", c.text, extra ? "（o 穿过、p 一笔）" : "", "\n  apple-shaper.js", a.map((g) => g.glyph + "@" + g.x).join(" "), "\n  apple-font.js  ", b.map((g) => g.glyph + "@" + g.x).join(" "));
}
console.log(`排字 ${cases.length * 2 - bad} / ${cases.length * 2} 一致`);
process.exit(bad || gd ? 1 : 0);
