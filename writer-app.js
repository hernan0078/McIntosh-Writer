// 主页面（index.html）：输入文字 → Apple 骨架字体排字、画字 → 一笔书写的动画，可以下载带动画的 SVG。
// 字体来源见 apple-source.js（载入字体文件，或者 tools/ 生成的 data/apple/）。
(async () => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PEN_SPEED = 3200; // 速度 = 1 时，每秒写多少字体单位（hello 约 3 秒）
  const DOT_COST = 90; // 点一个点相当于写多长
  // 字体里存的是笔的半径；Apple 开机画面按 1.55 倍画（Macintosh Skeletal Filled 从渲染程序里读出来的）
  const THEMES = {
    ink: { bg: "#ffffff", ink: "#1d1d1f" },
    night: { bg: "#000000", ink: "#f5f5f7" },
    color: { bg: "#ffffff", ink: "url(#hw-gradient)" },
  };
  const GRADIENT = ["#ff9f0a", "#ff375f", "#bf5af2", "#5e5ce6", "#0a84ff", "#30d158"];

  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r1 = (n) => Math.round(n * 10) / 10;
  const ease = (x) => 0.5 * x + 0.5 * (0.5 - 0.5 * Math.cos(Math.PI * x));
  function easeInverse(y) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (ease(mid) < y) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const pathD = (segs) => `M${r1(segs[0][0])} ${r1(segs[0][1])}` + segs.map((c) => `C${r1(c[2])} ${r1(c[3])} ${r1(c[4])} ${r1(c[5])} ${r1(c[6])} ${r1(c[7])}`).join("");
  const el = (name, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  const { t } = mwI18n;
  mwI18n.apply();
  $("lang").addEventListener("click", (e) => { e.preventDefault(); mwI18n.setLang(mwI18n.other); });

  const stage = $("stage");
  const svg = el("svg", { xmlns: SVG_NS, role: "img" });

  // ---------- 字体来源 ----------
  if (appleSource.servedFromFile) {
    stage.innerHTML = `<div id="setup">${appleSource.fileHelp()}</div>`;
    return;
  }
  const sources = await appleSource.open();
  function fillSources(prefer) {
    const list = sources.list();
    $("src").innerHTML = list.map((s) => `<option value="${s.id}">${s.label}</option>`).join("");
    $("src").value = prefer && sources.has(prefer) ? prefer : sources.preferred() || "";
    $("src").parentElement.style.display = list.length ? "" : "none";
  }
  fillSources();
  const source = () => sources.get($("src").value);

  function showSetup(error) {
    stage.style.background = "#ffffff";
    stage.innerHTML = `<div id="setup"><h2>${t("setup.title")}</h2>${t("setup.body")}${error ? `<p style="color:#b25000">${error}</p>` : ""}</div>`;
  }

  // ---------- 排字、画字 ----------
  function options() {
    return {
      weight: Number($("weight").value),
      speed: Number($("speed").value),
      theme: $("theme").value,
      oCross: !!$("ocross").value,
      pJoin: !!$("pjoin").value,
    };
  }

  // 书写顺序：笔画按 L.paths 的顺序，i、j 的点插在它们的 after 之后
  function sequence(L) {
    const seq = [];
    L.paths.forEach((p, i) => {
      for (const d of L.dots) if (d.after === i) seq.push({ dot: d });
      seq.push({ path: p });
    });
    for (const d of L.dots) if (d.after >= L.paths.length) seq.push({ dot: d });
    return seq;
  }

  // 时间轴：写一笔的时间按长度算，抬笔移动到下一笔的起点也算一点时间
  function timeline(seq, lengths) {
    let t = 0, pen = null;
    const out = seq.map((it, i) => {
      const start = it.dot ? [it.dot.x, it.dot.y] : [it.path.segs[0][0], it.path.segs[0][1]];
      if (pen) {
        const jump = Math.hypot(start[0] - pen[0], start[1] - pen[1]);
        if (jump > 4) t += Math.min(140, 30 + jump * 0.08);
      }
      const cost = it.dot ? DOT_COST : lengths[i];
      const e = { start: t, cost };
      t += cost;
      if (it.dot) pen = start;
      else { const last = it.path.segs[it.path.segs.length - 1]; pen = [last[6], last[7]]; }
      return e;
    });
    for (const e of out) e.total = t;
    return out;
  }

  let state = null, raf = 0;

  function rebuild() {
    cancelAnimationFrame(raf);
    const S = source();
    if (!S) { state = null; showSetup(); return; }
    const opts = options();
    const text = $("text").value;
    const shaped = S.shaper.shape(text, { oCross: opts.oCross, pJoin: opts.pJoin });
    const L = S.writer.layout(shaped);
    const seq = sequence(L);
    const theme = THEMES[opts.theme];
    stage.style.background = theme.bg;
    if (!stage.contains(svg)) stage.replaceChildren(svg);
    svg.replaceChildren();
    const b = L.bounds;
    const maxW = Math.max(34, ...L.paths.map((p) => p.width)) * 2 * opts.weight;
    const pad = maxW / 2 + 40;
    svg.setAttribute("viewBox", `${r1(b.minX - pad)} ${r1(b.minY - pad)} ${r1(b.maxX - b.minX + pad * 2)} ${r1(b.maxY - b.minY + pad * 2)}`);
    if (opts.theme === "color") {
      const defs = el("defs");
      const grad = el("linearGradient", { id: "hw-gradient", gradientUnits: "userSpaceOnUse", x1: b.minX, y1: 0, x2: b.maxX, y2: 0 });
      GRADIENT.forEach((c, i) => grad.appendChild(el("stop", { offset: i / (GRADIENT.length - 1), "stop-color": c })));
      defs.appendChild(grad);
      svg.appendChild(defs);
    }
    const nodes = seq.map((it) => {
      const node = it.dot
        ? el("circle", { cx: r1(it.dot.x), cy: r1(it.dot.y), r: 0, fill: theme.ink })
        : el("path", { d: pathD(it.path.segs), fill: "none", stroke: theme.ink, "stroke-width": r1(it.path.width * 2 * opts.weight), "stroke-linecap": "round", "stroke-linejoin": "round" });
      svg.appendChild(node);
      return node;
    });
    const lengths = nodes.map((n, i) => (seq[i].dot ? 0 : n.getTotalLength()));
    state = { seq, nodes, lengths, time: timeline(seq, lengths), opts, shaped };
    showStatus(shaped);
  }

  function setProgress(c) {
    const { seq, nodes, time, lengths, opts } = state;
    nodes.forEach((node, i) => {
      const f = clamp((c - time[i].start) / time[i].cost, 0, 1);
      if (seq[i].dot) node.setAttribute("r", r1(seq[i].dot.r * 2 * opts.weight * f));
      else {
        const len = lengths[i];
        node.style.strokeDasharray = `${len} ${len + 1}`;
        node.style.strokeDashoffset = len * (1 - f);
        node.style.visibility = f > 0 ? "visible" : "hidden";
      }
    });
  }

  function play() {
    if (!state) rebuild();
    if (!state || !state.nodes.length) return;
    cancelAnimationFrame(raf);
    const total = state.time[0].total;
    const duration = (total / (PEN_SPEED * state.opts.speed)) * 1000;
    const t0 = performance.now();
    const tick = (now) => {
      const x = Math.min(1, (now - t0) / duration);
      setProgress(ease(x) * total);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function showStatus(shaped) {
    const status = $("status");
    status.replaceChildren();
    const text = $("text").value;
    const missing = [...new Set(shaped.filter((g) => g.glyph === ".notdef").map((g) => String.fromCodePoint(text.codePointAt(g.cluster) || 63)))];
    if (missing.length) {
      const warn = document.createElement("span");
      warn.className = "warn";
      warn.textContent = t("status.missing", { chars: missing.join(" ") });
      status.append(warn, " ");
    }
    const S = source();
    if (S) status.append(t("status.font", { name: S.label }));
  }

  // ---------- 导出带动画的 SVG ----------
  function animatedSvg() {
    if (!state || !state.nodes.length) return null;
    const { seq, lengths, time, opts } = state;
    const total = time[0].total;
    const duration = total / (PEN_SPEED * opts.speed);
    const pct = (c) => (easeInverse(clamp(c / total, 0, 1)) * 100).toFixed(3);
    const theme = THEMES[opts.theme];
    const css = [], shapes = [];
    seq.forEach((it, i) => {
      const a = pct(time[i].start);
      const a2 = Math.min(100, Number(a) + 0.01).toFixed(3);
      const z = pct(time[i].start + time[i].cost);
      if (it.dot) {
        const r = r1(it.dot.r * 2 * opts.weight);
        css.push(`@keyframes k${i}{0%,${a}%{r:0px}${z}%,100%{r:${r}px}}`);
        shapes.push(`<circle cx="${r1(it.dot.x)}" cy="${r1(it.dot.y)}" r="${r}" fill="${theme.ink}" style="animation:k${i} ${duration.toFixed(2)}s linear both"/>`);
      } else {
        const len = r1(lengths[i]);
        css.push(`@keyframes k${i}{0%,${a}%{opacity:0;stroke-dashoffset:${len}}${a2}%{opacity:1;stroke-dashoffset:${len}}${z}%,100%{opacity:1;stroke-dashoffset:0}}`);
        shapes.push(`<path d="${pathD(it.path.segs)}" fill="none" stroke="${theme.ink}" stroke-width="${r1(it.path.width * 2 * opts.weight)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${len} ${r1(len + 1)}" style="animation:k${i} ${duration.toFixed(2)}s linear both"/>`);
      }
    });
    const vb = svg.getAttribute("viewBox");
    const [vx, vy, vw, vh] = vb.split(" ");
    const defs = opts.theme === "color"
      ? `<defs><linearGradient id="hw-gradient" gradientUnits="userSpaceOnUse" x1="${vx}" y1="0" x2="${Number(vx) + Number(vw)}" y2="0">${GRADIENT.map((c, i) => `<stop offset="${i / (GRADIENT.length - 1)}" stop-color="${c}"/>`).join("")}</linearGradient></defs>`
      : "";
    const bg = opts.theme === "night" ? `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${theme.bg}"/>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">\n${defs}<style>${css.join("\n")}</style>\n${bg}${shapes.join("\n")}\n</svg>\n`;
  }

  function exportSvg() {
    const file = animatedSvg();
    if (!file) return;
    const name = ($("text").value.trim().replace(/[^\p{L}\p{N}]+/gu, "-") || "hello") + ".svg";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([file], { type: "image/svg+xml" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // 调试 / 其他页面用
  window.mcintoshWriter = { animatedSvg, rebuild, play };

  // ---------- 事件 ----------
  const replay = () => { rebuild(); play(); };
  let typing = 0;
  $("text").addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(replay, 350);
  });
  $("text").addEventListener("keydown", (e) => { if (e.key === "Enter") replay(); });
  $("play").addEventListener("click", replay);
  stage.addEventListener("click", (e) => { if (state) replay(); });
  for (const id of ["weight", "theme", "ocross", "pjoin"]) {
    $(id).addEventListener("input", () => {
      $("weightval").textContent = `${Number($("weight").value).toFixed(2)}×`;
      rebuild();
      if (state) setProgress(Infinity);
    });
  }
  $("speed").addEventListener("input", () => { if (state) state.opts.speed = Number($("speed").value); });
  $("export").addEventListener("click", exportSvg);
  $("src").addEventListener("change", () => { sources.remember($("src").value); replay(); });
  $("file").addEventListener("change", async (e) => {
    try {
      const id = await sources.addFiles(e.target.files);
      if (id) { sources.remember(id); fillSources(id); replay(); }
    } catch (err) {
      showSetup(err.code === "not-skeletal" ? t("error.notSkeletal") : t("error.load", { reason: err.message }));
    }
    e.target.value = "";
  });

  replay();
})();
