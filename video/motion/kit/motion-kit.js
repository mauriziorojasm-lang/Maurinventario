/* ==========================================================================
   video-saas-premium — seek-safe GSAP helpers for HyperFrames compositions.
   Every helper takes the composition's paused root timeline `tl` and absolute
   times (seconds), builds its DOM once at load (deterministic) and only uses
   tl.set / tl.fromTo / tl.to, so scrubbing and frame-by-frame render work.
   Usage:  <script src="kit/motion-kit.js"></script>  then  MK.init(stage)
   ========================================================================== */
(function (root) {
  const MK = {};
  let STAGE = null;
  const $ = (s, r = document) => (typeof s === "string" ? r.querySelector(s) : s);
  let uid = 0;
  const id = (p) => `mk-${p}-${++uid}`;

  MK.init = (stage) => { STAGE = $(stage); return MK; };

  /* ---------- kinetic type ---------- */
  // Type `text` into `el` letter by letter. Either constant speed (cps) from `start`,
  // or word-synced: opts.words = [[s,e], ...] one entry per space-separated token.
  // Returns the time the last letter lands.
  MK.typeOn = (tl, el, text, start, opts = {}) => {
    el = $(el); el.classList.add("mk-type");
    const cps = opts.cps || 16, toks = text.split(" ");
    const chars = [];
    toks.forEach((tok, ti) => {
      const letters = [...tok].concat(ti < toks.length - 1 ? [" "] : []);
      const w = opts.words && opts.words[ti];
      letters.forEach((ch, k) => {
        const t = w ? w[0] + ((w[1] - w[0]) * k) / letters.length : start + chars.length / cps;
        chars.push([ch, t]);
      });
    });
    chars.forEach(([ch, t]) => {
      const s = document.createElement("span");
      s.className = "k"; s.id = id("k"); s.textContent = ch;
      s.setAttribute("data-layout-allow-overlap", "true");
      el.appendChild(s);
      tl.set("#" + s.id, { display: "inline" }, t);
    });
    const end = chars.length ? chars[chars.length - 1][1] : start;
    if (opts.caret !== false) {
      const c = document.createElement("span"); c.className = "mk-caret"; c.id = id("c"); el.appendChild(c);
      tl.set("#" + c.id, { opacity: 1 }, 0);
      const until = opts.caretUntil || end + 1.8;
      for (let t = end + 0.3, n = 0; t < until; t += 0.45, n++) tl.set("#" + c.id, { opacity: n % 2 ? 1 : 0 }, t);
      if (opts.caretOff !== false) tl.set("#" + c.id, { opacity: 0 }, until);
    }
    return end;
  };

  // Rotating word: el gets the words; each slides up into view at its time.
  MK.wordSwap = (tl, el, words, times, opts = {}) => {
    el = $(el); el.classList.add("mk-swap"); el.innerHTML = "";
    const d = opts.dur || 0.35;
    const spans = words.map((w) => { const s = document.createElement("span"); s.id = id("w"); s.textContent = w; el.appendChild(s); return s; });
    // the wrapper is as wide as the longest word so the layout doesn't jump
    el.style.minWidth = Math.max(...words.map((w) => w.length)) * (opts.charW || 0.56) + "em";
    spans.forEach((s, i) => {
      const t = times[i];
      tl.fromTo("#" + s.id, { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: d, ease: "power3.out", immediateRender: i === 0 }, t);
      if (i + 1 < spans.length) tl.to("#" + s.id, { yPercent: -100, opacity: 0, duration: d * 0.55, ease: "power3.in" }, times[i + 1] - d * 0.5);
    });
    return el;
  };

  // Hand-drawn style underline that draws in under a word (.mk-underline on the element).
  MK.underline = (tl, el, t, dur = 0.4) => { el = $(el); el.classList.add("mk-underline"); tl.fromTo(el, { "--mk-u": 0 }, { "--mk-u": 1, duration: dur, ease: "power2.inOut" }, t); };

  /* ---------- design guides ---------- */
  // lines: [{h: y}, {v: x}] in stage px. They draw in, hold, then fade.
  MK.guides = (tl, lines, start, opts = {}) => {
    const holdEnd = opts.until || start + 2;
    lines.forEach((l, i) => {
      const g = document.createElement("div"); g.className = "mk-guide " + (l.h != null ? "h" : "v"); g.id = id("g");
      if (l.h != null) g.style.top = l.h + "px"; else g.style.left = l.v + "px";
      (opts.parent ? $(opts.parent) : STAGE).appendChild(g);
      tl.fromTo("#" + g.id, { opacity: 0, [l.h != null ? "scaleX" : "scaleY"]: 0 }, { opacity: 1, [l.h != null ? "scaleX" : "scaleY"]: 1, duration: 0.5, ease: "power3.inOut" }, start + i * 0.08);
      tl.to("#" + g.id, { opacity: 0, duration: 0.3 }, holdEnd);
    });
  };

  /* ---------- Figma ---------- */
  // el must be (or wrap) a .mk-sel element. Adds the blue frame + 4 handles + label.
  MK.select = (tl, el, t, opts = {}) => {
    el = $(el); el.classList.add("mk-sel");
    let f = el.querySelector(":scope > .mk-frame");
    if (!f) {
      f = document.createElement("div"); f.className = "mk-frame"; f.id = id("sel");
      f.innerHTML = "<b></b><b></b><b></b><b></b>" + (opts.label ? `<span class="mk-tag">${opts.label}</span>` : "") + (opts.dim ? `<span class="mk-dim">${opts.dim}</span>` : "");
      el.appendChild(f);
    }
    tl.fromTo("#" + f.id, { autoAlpha: 0, scale: 1.04 }, { autoAlpha: 1, scale: 1, duration: 0.18, ease: "power2.out" }, t);
    if (opts.until) tl.to("#" + f.id, { autoAlpha: 0, duration: 0.15 }, opts.until);
    return f;
  };

  // Multiplayer cursor. keys: [[t, x, y], ...] stage px (tip of the arrow); clicks: [t, ...].
  MK.cursor = (tl, opts) => {
    const c = document.createElement("div"); c.className = "mk-cursor" + (opts.alt ? " alt" : ""); c.id = opts.id || id("cur");
    c.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2.5l15 9-6.6 1.4L9.3 19.5z" fill="#17191d" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>' + (opts.name === null || opts.plain ? "" : `<span>${opts.name || "Tú"}</span>`);
    (opts.parent ? $(opts.parent) : STAGE).appendChild(c);
    const k = opts.keys;
    tl.fromTo("#" + c.id, { autoAlpha: 0, x: k[0][1], y: k[0][2] }, { autoAlpha: 1, duration: 0.2 }, k[0][0]);
    for (let i = 1; i < k.length; i++) tl.to("#" + c.id, { x: k[i][1], y: k[i][2], duration: Math.max(0.2, k[i][0] - k[i - 1][0]), ease: "power3.inOut" }, k[i - 1][0]);
    (opts.clicks || []).forEach((t) => tl.to("#" + c.id, { scale: 0.86, duration: 0.07, yoyo: true, repeat: 1, ease: "power1.out" }, t));
    if (opts.hide) tl.to("#" + c.id, { autoAlpha: 0, duration: 0.2 }, opts.hide);
    return c;
  };

  /* ---------- macOS ---------- */
  MK.macWindow = ({ title = "", html = "", dark = false, id: wid = "" } = {}) =>
    `<div class="mk-win${dark ? " dark" : ""}"${wid ? ` id="${wid}"` : ""}><div class="mk-bar"><i></i><i></i><i></i><span>${title}</span></div><div class="mk-body">${html}</div></div>`;

  /* ---------- mask transitions ---------- */
  // Reveal (open) or hide (close) an element through a shape: "circle" iris or an "eye" that blinks open.
  MK.iris = (tl, el, t, opts = {}) => {
    el = $(el);
    const at = `at ${opts.x || "50%"} ${opts.y || "50%"}`, d = opts.dur || 0.7;
    if ((opts.shape || "circle") === "eye") {
      const closed = `ellipse(62% 0% ${at})`, open = `ellipse(62% 15% ${at})`, full = `ellipse(150% 150% ${at})`;
      if (opts.close) { tl.fromTo(el, { clipPath: full }, { clipPath: open, duration: d * 0.5, ease: "power2.in" }, t); tl.to(el, { clipPath: closed, duration: d * 0.4, ease: "power3.in" }, t + d * 0.5); }
      else { tl.fromTo(el, { clipPath: closed }, { clipPath: open, duration: d * 0.45, ease: "power3.out" }, t); tl.to(el, { clipPath: full, duration: d * 0.55, ease: "power2.in" }, t + d * 0.55); }
    } else {
      const a = `circle(0% ${at})`, b = `circle(150% ${at})`;
      tl.fromTo(el, { clipPath: opts.close ? b : a }, { clipPath: opts.close ? a : b, duration: d, ease: opts.close ? "power3.in" : "power3.out" }, t);
    }
  };

  /* ---------- end card ---------- */
  MK.IG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor"/></svg>';
  MK.TIKTOK = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 3c.4 2.2 1.8 3.7 4 3.9v3.1c-1.5.1-2.9-.4-4-1.2v6.3c0 3.4-2.6 5.9-5.8 5.9S5 18.5 5 15.3c0-3.4 2.9-6 6.4-5.6v3.2c-1.6-.4-3.2.8-3.2 2.4 0 1.4 1.1 2.6 2.6 2.6 1.6 0 2.7-1.2 2.7-3V3h3.1z"/></svg>';
  MK.endCard = (tl, el, t, opts = {}) => {
    el = $(el); el.classList.add("mk-end");
    if (!el.innerHTML.trim()) el.innerHTML = (opts.icon === "tiktok" ? MK.TIKTOK : MK.IG) + `<b>${opts.handle || "@tu_marca"}</b>`;
    tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, t);
    tl.fromTo(el.firstElementChild, { scale: 0.5, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: "back.out(2)" }, t + 0.05);
    tl.fromTo(el.lastElementChild, { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: "power3.out" }, t + 0.25);
  };


  /* ======================= PREMIUM / SaaS-LAUNCH LAYER ======================= */
  // Apply a brand (brand.json from scripts/brand_from_url.py, or a hand-written object):
  // sets --mk-paper/ink/accent/accent2/muted and injects @font-face for the brand fonts.
  MK.theme = (b, opts = {}) => {
    const r = document.documentElement.style, c = b.colors || b;
    if (c.bg) r.setProperty("--mk-paper", c.bg);
    if (c.fg) r.setProperty("--mk-ink", c.fg);
    if (c.accent) r.setProperty("--mk-accent", c.accent);
    if (c.accent2) r.setProperty("--mk-accent2", c.accent2);
    if (c.muted) r.setProperty("--mk-muted", c.muted);
    if (c.cta) r.setProperty("--mk-cta", c.cta);
    const f = b.fonts || {}, base = opts.base || "";
    if (f.files && f.files.length) {
      const css = f.files.map((x) => `@font-face{font-family:"${x.family}";font-weight:${x.weight};font-style:${x.style};src:url(${base}${x.file})}`).join("");
      const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    }
    if (f.display) r.setProperty("--mk-display", `"${f.display}", "RM Display", Arial, sans-serif`);
    if (f.body) r.setProperty("--mk-body", `"${f.body}", "RM Body", Arial, sans-serif`);
  };

  // Premium headline: words rise + de-blur one after another. Returns end time.
  MK.reveal = (tl, el, t, opts = {}) => {
    el = $(el); el.classList.add("mk-reveal");
    if (!el.dataset.mkSplit) {
      const walk = (node) => [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
            const w = document.createElement("span"); w.className = "w"; w.textContent = tok; frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
      walk(el); el.dataset.mkSplit = "1";
    }
    const ws = [...el.querySelectorAll(".w")];
    ws.forEach((w) => { if (!w.id) w.id = id("rw"); });
    const st = opts.stagger ?? 0.08, d = opts.dur ?? 0.7;
    tl.fromTo(ws.map((w) => "#" + w.id), { opacity: 0, y: opts.y ?? 60, filter: "blur(14px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", duration: d, ease: "expo.out", stagger: st }, t);
    return t + st * (ws.length - 1) + d;
  };

  // Light sweep across an element (wraps it). Great on logos / key headlines.
  MK.sweep = (tl, el, t, opts = {}) => {
    el = $(el);
    let s = el.querySelector(":scope > .mk-sweep");
    if (!s) { el.classList.add("mk-sweepwrap"); s = document.createElement("i"); s.className = "mk-sweep"; s.id = id("sw"); el.appendChild(s); }
    tl.fromTo("#" + s.id, { left: "-45%", opacity: 1 }, { left: "120%", opacity: 1, duration: opts.dur || 0.9, ease: "power2.inOut" }, t);
  };

  // Slowly drifting aurora (call once; it moves the two light blobs between t0 and t1).
  MK.aurora = (tl, el, t0, t1) => {
    el = $(el); el.classList.add("mk-aurora");
    tl.fromTo(el, { "--mk-a1x": "20%", "--mk-a1y": "15%", "--mk-a2x": "85%", "--mk-a2y": "75%", rotation: 0 },
      { "--mk-a1x": "70%", "--mk-a1y": "35%", "--mk-a2x": "25%", "--mk-a2y": "60%", rotation: 8, duration: t1 - t0, ease: "sine.inOut" }, t0);
  };

  // 3D entrance for windows / mockups (parent needs .mk-3d for perspective).
  MK.tilt3d = (tl, el, t, opts = {}) => {
    tl.fromTo($(el), { autoAlpha: 0, rotationX: opts.rx ?? 32, rotationY: opts.ry ?? 0, y: opts.y ?? 260, scale: opts.scale ?? 0.88, transformOrigin: "50% 100%" },
      { autoAlpha: 1, rotationX: 0, rotationY: 0, y: 0, scale: 1, duration: opts.dur ?? 1.1, ease: "expo.out" }, t);
  };

  // Camera move on an element (zoom + pan). keys: [[t, scale, x, y], ...] — x/y in px.
  MK.camera = (tl, el, keys, opts = {}) => {
    el = $(el);
    tl.set(el, { scale: keys[0][1], x: keys[0][2], y: keys[0][3], transformOrigin: opts.origin || "50% 50%" }, keys[0][0]);
    for (let i = 1; i < keys.length; i++) tl.to(el, { scale: keys[i][1], x: keys[i][2], y: keys[i][3], duration: Math.max(0.2, keys[i][0] - keys[i - 1][0]), ease: opts.ease || "power3.inOut" }, keys[i - 1][0]);
  };

  // Number count-up (seek-safe via proxy). fmt: (v) => string
  MK.countUp = (tl, el, from, to, t, dur = 1.2, fmt) => {
    el = $(el); const o = { v: from }; fmt = fmt || ((v) => Math.round(v).toLocaleString("es-PE"));
    tl.set(el, { textContent: fmt(from) }, 0);
    tl.to(o, { v: to, duration: dur, ease: "power2.out", onUpdate: () => (el.textContent = fmt(o.v)) }, t);
  };

  // Chat: typing dots then bubble, for each message. msgs: [{el, t, typing:0.6}]
  MK.chat = (tl, msgs) => msgs.forEach((m) => {
    const b = $(m.el); if (!b.id) b.id = id("b");
    if (m.typing && m.dots) {
      const d = $(m.dots); if (!d.id) d.id = id("td");
      tl.fromTo("#" + d.id, { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 0.2 }, m.t - m.typing);
      d.querySelectorAll("i").forEach((dot, k) => { dot.id = dot.id || id("dot"); tl.to("#" + dot.id, { y: -8, duration: 0.18, yoyo: true, repeat: Math.max(1, Math.round(m.typing / 0.36) * 2 - 1), ease: "sine.inOut" }, m.t - m.typing + k * 0.1); });
      tl.to("#" + d.id, { autoAlpha: 0, duration: 0.1 }, m.t - 0.05);
    }
    tl.fromTo("#" + b.id, { autoAlpha: 0, y: 30, scale: 0.92, transformOrigin: b.classList.contains("out") ? "100% 100%" : "0% 100%" }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.8)" }, m.t);
  });

  // Staggered entrance for cards / chips.
  MK.stagger = (tl, sels, t, opts = {}) => tl.fromTo(sels, { autoAlpha: 0, y: opts.y ?? 120, scale: opts.scale ?? 0.94, filter: "blur(10px)" },
    { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: opts.dur ?? 0.8, ease: "expo.out", stagger: opts.stagger ?? 0.12 }, t);

  /* ======================= PREMIUM v2 — motion vocabulary ======================= */
  // Enter with motion blur: element streaks in (blur + stretch along the move) and settles.
  MK.enter = (tl, el, t, opts = {}) => {
    const dx = opts.x ?? 0, dy = opts.y ?? 80, d = opts.dur ?? 0.8;
    tl.fromTo($(el), { autoAlpha: 0, x: dx, y: dy, scale: opts.scale ?? 0.96, filter: `blur(${opts.blur ?? 18}px)` },
      { autoAlpha: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)", duration: d, ease: opts.ease || "expo.out" }, t);
  };
  // Exit with motion blur ("whip"): accelerates out, blurs, fades.
  MK.whip = (tl, el, t, opts = {}) => {
    tl.to($(el), { autoAlpha: 0, x: opts.x ?? 0, y: opts.y ?? -90, scale: opts.scale ?? 1.04, filter: `blur(${opts.blur ?? 20}px)`, duration: opts.dur ?? 0.45, ease: "power3.in" }, t);
  };
  // Morph a container between two shapes without layout tweens: clip-path inset() with round corners.
  // from/to: [top, right, bottom, left, radius] in px (inset from the element's box).
  MK.morph = (tl, el, t, from, to, dur = 0.8) => {
    const c = (a) => `inset(${a[0]}px ${a[1]}px ${a[2]}px ${a[3]}px round ${a[4]}px)`;
    tl.fromTo($(el), { clipPath: c(from) }, { clipPath: c(to), duration: dur, ease: "expo.inOut" }, t);
  };
  // Bloom flash between scenes (element = .pm-flash overlay).
  MK.flash = (tl, el, t, dur = 0.6) => {
    tl.fromTo($(el), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1.6, duration: dur * 0.35, ease: "power2.out" }, t);
    tl.to($(el), { opacity: 0, duration: dur * 0.65, ease: "power2.in" }, t + dur * 0.35);
  };
  // Button / chip press feedback.
  MK.press = (tl, el, t) => tl.to($(el), { scale: 0.93, duration: 0.08, yoyo: true, repeat: 1, ease: "power1.out" }, t);
  // Toggle group: chips[i] lights up in the accent at times[i] (previous one dims back).
  MK.toggle = (tl, chips, times) => {
    const acc = getComputedStyle(document.documentElement).getPropertyValue("--mk-accent").trim() || "#2563eb";
    chips.forEach((c, i) => {
      const el = $(c); if (!el.id) el.id = id("chip");
      const base = getComputedStyle(el); const bg0 = base.backgroundColor, fg0 = base.color;
      tl.to("#" + el.id, { backgroundColor: acc, color: "#ffffff", duration: 0.2 }, times[i]);
      if (times[i + 1] != null) tl.to("#" + el.id, { backgroundColor: bg0, color: fg0, duration: 0.2 }, times[i + 1]);
      MK.press(tl, "#" + el.id, times[i]);
    });
  };
  // Check mark that draws itself (svg.pm-check with circle + path; uses stroke-dasharray 400).
  MK.check = (tl, svg, t) => {
    svg = $(svg); const c = svg.querySelector("circle"), p = svg.querySelector("path");
    [c, p].forEach((e) => { e.style.strokeDasharray = 400; });
    tl.fromTo(c, { strokeDashoffset: 400 }, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out" }, t);
    tl.fromTo(p, { strokeDashoffset: 400 }, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }, t + 0.25);
    tl.fromTo(svg, { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.5, ease: "back.out(2)" }, t);
  };
  // Slow continuous drift (keeps every frame alive — premium pieces are never fully still).
  MK.drift = (tl, el, t0, t1, opts = {}) => tl.fromTo($(el), { x: opts.x0 ?? 0, y: opts.y0 ?? 0, rotation: opts.r0 ?? 0, scale: opts.s0 ?? 1 },
    { x: opts.x1 ?? 0, y: opts.y1 ?? -20, rotation: opts.r1 ?? 0, scale: opts.s1 ?? 1.03, duration: t1 - t0, ease: "sine.inOut", immediateRender: false }, t0);

  /* ======================= PREMIUM v3 — real transitions ======================= */
  // Per-character text reveal. style: "mask" (chars rise from a clipping line — crisp, editorial),
  // "blur" (short blur+scale pop per char), "track" (letter-spacing collapses in). Fast stagger = premium.
  MK.chars = (tl, el, t, opts = {}) => {
    el = $(el); const style = opts.style || "mask";
    if (!el.dataset.mkChars) {
      const txt = el.textContent; el.textContent = "";
      el.style.display = el.style.display || "inline-block";
      [...txt].forEach((ch) => {
        const w = document.createElement("span"); w.className = "mk-ch"; w.id = id("ch");
        w.style.cssText = "display:inline-block;white-space:pre;" + (style === "mask" ? "clip-path:inset(-20% -10% -20% -10%);" : "");
        const inner = document.createElement("span"); inner.style.display = "inline-block"; inner.textContent = ch; inner.id = id("ci");
        w.appendChild(inner); el.appendChild(w);
      });
      el.dataset.mkChars = "1";
    }
    const inners = [...el.querySelectorAll(".mk-ch > span")].map((n) => "#" + n.id);
    const st = opts.stagger ?? 0.022, d = opts.dur ?? 0.6;
    if (style === "mask") tl.fromTo(inners, { yPercent: 140, rotation: 6 }, { yPercent: 0, rotation: 0, duration: d, ease: "expo.out", stagger: st }, t);
    else if (style === "track") tl.fromTo(el, { letterSpacing: "0.4em", autoAlpha: 0, filter: "blur(8px)" }, { letterSpacing: "-0.03em", autoAlpha: 1, filter: "blur(0px)", duration: d * 1.6, ease: "expo.out" }, t);
    else tl.fromTo(inners, { autoAlpha: 0, scale: 1.6, filter: "blur(10px)" }, { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: d * 0.6, ease: "power3.out", stagger: st }, t);
    tl.set(el, { autoAlpha: 1 }, t);
    return t + st * inners.length + d;
  };
  // Chars leave the same way (mask: drop out upward).
  MK.charsOut = (tl, el, t, opts = {}) => {
    const inners = [...$(el).querySelectorAll(".mk-ch > span")].map((n) => "#" + n.id);
    const d = opts.dur ?? 0.45, st = opts.stagger ?? 0.012;
    tl.to(inners, { yPercent: -140, rotation: -4, duration: d, ease: "power3.in", stagger: st }, t);
    tl.set($(el), { autoAlpha: 0 }, t + d + st * inners.length);
  };
  // Vertical "scroll push": A slides up and out while B slides up in, both motion-blurred (one camera move).
  MK.push = (tl, a, b, t, opts = {}) => {
    const dist = opts.dist ?? 140, d = opts.dur ?? 0.7, axis = opts.axis || "y";
    tl.to($(a), { [axis]: -dist, autoAlpha: 0, filter: "blur(14px)", duration: d, ease: "expo.inOut" }, t);
    tl.fromTo($(b), { [axis]: dist, autoAlpha: 0, filter: "blur(14px)" }, { [axis]: 0, autoAlpha: 1, filter: "blur(0px)", duration: d, ease: "expo.inOut" }, t);
  };
  // Zoom-through: the camera flies INTO `a` (scale up + blur) and lands on scene `b` (scale down from big).
  MK.zoomThrough = (tl, a, b, t, opts = {}) => {
    const d = opts.dur ?? 0.8;
    tl.to($(a), { scale: opts.scale ?? 6, autoAlpha: 0, filter: "blur(18px)", duration: d, ease: "expo.in", transformOrigin: opts.origin || "50% 50%" }, t);
    tl.fromTo($(b), { scale: 1.35, autoAlpha: 0, filter: "blur(20px)" }, { scale: 1, autoAlpha: 1, filter: "blur(0px)", duration: d * 1.1, ease: "expo.out" }, t + d * 0.55);
  };
  // Shared-element hand-off: `a` flies & scales onto `b`'s spot while `b` grows out of it.
  // (a, b are absolutely positioned in the same stage; pass b's centre offset relative to a: dx, dy, and size ratio.)
  MK.handoff = (tl, a, b, t, opts = {}) => {
    const d = opts.dur ?? 0.7;
    tl.to($(a), { x: opts.dx ?? 0, y: opts.dy ?? 0, scale: opts.ratio ?? 1.6, autoAlpha: 0, duration: d, ease: "expo.inOut" }, t);
    tl.fromTo($(b), { x: -(opts.dx ?? 0), y: -(opts.dy ?? 0), scale: 1 / (opts.ratio ?? 1.6), autoAlpha: 0 }, { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: d, ease: "expo.inOut" }, t + d * 0.15);
  };
  // 3D flip between two faces (cards, chips, numbers).
  MK.flip = (tl, a, b, t, d = 0.8) => {
    tl.to($(a), { rotationY: 90, autoAlpha: 0, duration: d / 2, ease: "power2.in" }, t);
    tl.fromTo($(b), { rotationY: -90, autoAlpha: 0 }, { rotationY: 0, autoAlpha: 1, duration: d / 2, ease: "power2.out" }, t + d / 2);
  };
  // Touch ripple — the default interaction cue (no named cursor). x,y in stage px.
  MK.tap = (tl, x, y, t, opts = {}) => {
    const r = document.createElement("div"); r.id = id("tap");
    r.style.cssText = `position:absolute;left:${x - 50}px;top:${y - 50}px;width:100px;height:100px;border-radius:50%;pointer-events:none;z-index:70;opacity:0;` +
      `background:radial-gradient(circle, ${opts.color || "rgba(255,255,255,.9)"} 0 30%, transparent 31%);box-shadow:0 0 0 3px ${opts.ring || "rgba(255,255,255,.7)"};`;
    (opts.parent ? $(opts.parent) : STAGE).appendChild(r);
    tl.fromTo("#" + r.id, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 0.7, duration: 0.12, ease: "power2.out" }, t - 0.12);
    tl.to("#" + r.id, { opacity: 0, scale: 1.6, duration: 0.45, ease: "power2.out" }, t);
  };

  root.MK = MK;
})(window);
