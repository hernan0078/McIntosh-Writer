#!/usr/bin/env node
// 给 tools/filled-check.py 用：把 apple-writer.js 画出的中心线导出成采样点（每 4 个单位一个）
//   node tools/filled-dump.mjs words.txt out.json      words.txt 每行一个词
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(import.meta.url);
const read = (f) => JSON.parse(readFileSync(join(root, "data", "apple", f), "utf8"));
const glyphs = read("glyphs.json");
req(join(root, "apple-extras.js")).extend(glyphs);
const shaper = req(join(root, "apple-shaper.js")).create(read("rules.json"), glyphs);
const writer = req(join(root, "apple-writer.js")).create(glyphs);
const bez = (c, t) => { const u = 1 - t; return [u*u*u*c[0]+3*u*u*t*c[2]+3*u*t*t*c[4]+t*t*t*c[6], u*u*u*c[1]+3*u*u*t*c[3]+3*u*t*t*c[5]+t*t*t*c[7]]; };

const words = readFileSync(process.argv[2], "utf8").split("\n").map((w) => w.trim()).filter(Boolean);
const out = words.map((word) => {
  const L = writer.layout(shaper.shape(word), { smooth: 0 });
  const pts = [];
  for (const p of L.paths) for (const c of p.segs) {
    const n = Math.max(2, Math.ceil((Math.hypot(c[6] - c[0], c[7] - c[1]) + 1) / 4));
    for (let i = 0; i < n; i++) pts.push(bez(c, i / n).map((v) => Math.round(v * 10) / 10));
  }
  return { word, pts };
});
writeFileSync(process.argv[3], JSON.stringify(out));
