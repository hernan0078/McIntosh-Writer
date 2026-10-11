// 字体数据的来源，index.html 和 apple.html 共用：
//   · data/apple/（tools/apple-extract.py、tools/apple-rules.py 生成）→ apple-shaper.js 排字
//   · 载入的字体文件（apple-font.js 直接读，harfbuzz 排字），存在浏览器的 IndexedDB 里，下次打开不用再选
// 两种来源的结果一致（tools/apple-font-check.mjs 核对过）。都会先用 apple-extras.js 补上 o.crossed 等。
//
//   const sources = await appleSource.open();
//   sources.list()            → [{ id, label, info }]
//   sources.get(id)           → { label, info, glyphs, shaper, writer }
//   await sources.addFiles(fileList)   → 最后一个载入成功的 id（失败抛错，错误信息是中文）
//   sources.preferred()       → 上次选的 id（没有就是第一个）；sources.remember(id)
//   sources.preferred("compare", false) → 别的用途的记录，没有就是 null
(function (root) {
  const DB = "mcintosh-writer", STORE = "fonts";

  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function savedFonts() {
    try {
      const db = await idb();
      return await new Promise((resolve, reject) => {
        const r = db.transaction(STORE).objectStore(STORE).getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } catch {
      return [];
    }
  }
  async function saveFont(rec) {
    try {
      const db = await idb();
      db.transaction(STORE, "readwrite").objectStore(STORE).put(rec);
    } catch {
      /* 存不了（隐私模式等）就只在这次打开时用 */
    }
  }
  // 界面文案（i18n.js）；单独在 node 里用时退回中文
  const t = (key, vars = {}) => (root.mwI18n ? root.mwI18n.t(key, vars)
    : ({ "source.json": "data/apple（工具生成）", "source.info": `${vars.count} 个字形 · ${vars.hash}` })[key] || key);
  const store = {
    get: (k) => { try { return localStorage.getItem("mcintosh." + k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem("mcintosh." + k, v); } catch { /* 忽略 */ } },
  };

  async function open(opts = {}) {
    const base = opts.dataUrl || "data/apple/";
    const sources = new Map();

    try {
      const [rules, glyphs] = await Promise.all(["rules", "glyphs"].map((f) =>
        fetch(`${base}${f}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })));
      root.appleExtras.extend(glyphs);
      const src = glyphs.source || {};
      sources.set("json", {
        label: t("source.json"),
        info: `${(src.file || "").split("/").pop()} · ${(src.sha256 || "").slice(0, 8)}`,
        glyphs,
        shaper: root.appleShaper.create(rules, glyphs),
        writer: root.appleWriter.create(glyphs),
      });
    } catch {
      /* 没跑过脚本也没关系，载入字体文件就行 */
    }

    async function addRecord(rec) {
      const font = await root.appleFont.load(rec.bytes);
      root.appleExtras.extend(font.glyphs);
      // 系统里那份和 iOS 固件里那份文件名一样，标签带上哈希前 8 位区分
      sources.set(rec.key, {
        label: `${rec.name}（${font.source.sha256.slice(0, 8)}）`,
        info: t("source.info", { count: font.source.glyphCount, hash: font.source.sha256.slice(0, 8) }),
        glyphs: font.glyphs,
        shaper: font.shaper,
        writer: root.appleWriter.create(font.glyphs),
      });
    }
    for (const rec of await savedFonts()) {
      try {
        await addRecord(rec);
      } catch (e) {
        console.warn("载入字体失败", rec.name, e);
      }
    }

    return {
      list: () => [...sources].map(([id, s]) => ({ id, label: s.label, info: s.info })),
      get: (id) => sources.get(id),
      has: (id) => sources.has(id),
      async addFiles(files) {
        let last = null;
        for (const f of files) {
          const rec = { key: `${f.name}·${f.size}`, name: f.name, size: f.size, bytes: await f.arrayBuffer(), added: Date.now() };
          await addRecord(rec); // 不是骨架字体会抛错
          await saveFont(rec);
          last = rec.key;
        }
        return last;
      },
      // 上次选的 id；没有（或已经不在了）时 fallback 为 true 就返回第一个，否则返回 null
      preferred(key = "source", fallback = true) {
        const id = store.get(key);
        return sources.has(id) ? id : fallback ? [...sources.keys()][0] || null : null;
      },
      remember: (id, key = "source") => store.set(key, id),
    };
  }

  // 双击打开（file://）时浏览器不让页面加载 JS 模块和 WebAssembly，读字体用的 harfbuzz 加载不了
  const servedFromFile = typeof location !== "undefined" && location.protocol === "file:";
  const fileHelp = () => `<h2>${t("file.title")}</h2>${t("file.body")}`;

  root.appleSource = { open, servedFromFile, fileHelp };
})(typeof window !== "undefined" ? window : globalThis);
