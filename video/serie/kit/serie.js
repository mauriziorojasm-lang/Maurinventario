/* Motor común de la serie vertical (1080×1920).
   El móvil muestra capturas reales de la app (390×844 CSS, escala 1.6).
   Todo se sincroniza con la voz: VO[k][i] = [palabra, inicio, fin] en segundos globales. */
window.Serie = (tl) => {
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const S = {};
  MKP.use(tl);
  S.V = (k, i) => VO[k][i < 0 ? VO[k].length + i : i][1];
  S.E = (k) => VO[k][VO[k].length - 1][2];
  S.Vs = (k, a = 0, b) => VO[k].slice(a, b === undefined ? undefined : b + 1).map((w) => w[1]);
  const spring = (o) => { const g = window.Motion.spring({ keyframes: [0, 1], ...o }); let T = 0; while (T < 8000 && !g.next(T).done) T += 5; const N = 400, lut = []; for (let i = 0; i <= N; i++) lut.push(g.next((i / N) * T).value); lut[N] = 1; return { duration: T / 1000, ease: (p) => { if (p <= 0) return 0; if (p >= 1) return 1; const x = p * N, i = x | 0; return lut[i] + (lut[i + 1] - lut[i]) * (x - i); } }; };
  S.sp = spring({ bounce: 0.22, visualDuration: 0.45 });
  S.sp2 = spring({ bounce: 0.3, visualDuration: 0.55 });
  S.pop = (sel, t, { r1 = 0, ...from } = {}) => tl.fromTo(sel, { autoAlpha: 0, scale: 0.86, y: 50, ...from }, { autoAlpha: 1, scale: 1, x: 0, y: 0, rotation: r1, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, t);
  S.out = (sel, t, o = {}) => tl.to(sel, { autoAlpha: 0, y: -30, duration: 0.3, ease: "power2.in", ...o }, t);

  /* ---- títulos: palabras que entran (stagger) o cuando se dicen (say) ---- */
  S.title = (id, t, tOut, o = {}) => {
    MKP.smearIn(`${id} .w`, t, { dx: 50, stagger: o.stagger ?? 0.06, dur: 0.7 });
    if (tOut) MKP.whip(`${id} .w`, tOut, { dx: -300, stagger: 0.02, dur: 0.35 });
  };
  S.say = (id, k, a, tOut) => {
    MKP.sayIn(`${id} .w`, S.Vs(k, a), { dx: 50, dur: 0.5 });
    if (tOut) MKP.whip(`${id} .w`, tOut, { dx: -300, stagger: 0.015, dur: 0.32 });
  };

  /* ---- cámara sobre el móvil: (px,py) en px CSS de la pantalla visible ---- */
  const K = 1.75, B = 12;
  S.view = { px: 195, py: 422, s: 1, fx: 540, fy: 1200 };
  S.HOME = { px: 195, py: 422, s: 1, fx: 540, fy: 1200 };
  const xf = (v) => ({ x: v.fx - (B + v.px * K) * v.s, y: v.fy - (B + v.py * K) * v.s, scale: v.s });
  S.camSet = (t, v) => { S.view = { ...S.view, ...v }; tl.set("#dev", xf(S.view), t); };
  S.cam = (t, v, d = 0.8, ease = "expo.inOut") => { S.view = { ...S.view, ...v }; tl.to("#dev", { ...xf(S.view), duration: d, ease }, t); };
  S.phoneIn = (t, v = S.HOME) => { S.camSet(0, v); tl.fromTo("#dev", { autoAlpha: 0, y: xf(v).y + 260, rotation: 4 }, { autoAlpha: 1, y: xf(v).y, rotation: 0, duration: S.sp2.duration, ease: S.sp2.ease, immediateRender: false }, t); };
  S.phoneOut = (t) => tl.to("#dev", { autoAlpha: 0, y: "+=200", duration: 0.45, ease: "power3.in" }, t);

  /* ---- páginas de la app ---- */
  let cur = null; const scrollOf = {};
  S.page = (t, id, o = {}) => {
    const el = "#pg-" + id;
    if (cur && cur !== el) tl.to(cur, { autoAlpha: 0, duration: 0.2, ease: "power1.in" }, t);
    if (o.y !== undefined) { tl.set(el, { y: -o.y }, t); scrollOf[id] = o.y; }
    tl.fromTo(el, { autoAlpha: 0, x: o.x ?? 24 }, { autoAlpha: 1, x: 0, duration: 0.45, ease: "expo.out", immediateRender: false }, t + 0.04);
    cur = el;
  };
  S.scroll = (t, id, y, d = 0.9, ease = "power2.inOut") => { tl.to("#pg-" + id, { y: -y, duration: d, ease }, t); scrollOf[id] = y; };
  S.ring = (t, id, r, tOut, pad = 5) => {
    const el = document.createElement("div"); el.className = "ring"; $("#pg-" + id).appendChild(el);
    Object.assign(el.style, { left: r[0] - pad + "px", top: r[1] - pad + "px", width: r[2] + pad * 2 + "px", height: r[3] + pad * 2 + "px" });
    tl.fromTo(el, { autoAlpha: 0, scale: 1.08 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, t);
    tl.to(el, { autoAlpha: 0, duration: 0.22 }, tOut);
  };
  S.tap = (t, id, x, y) => {
    const el = document.createElement("div"); el.className = "tap"; $("#pg-" + id).appendChild(el);
    Object.assign(el.style, { left: x + "px", top: y + "px" });
    tl.fromTo(el, { autoAlpha: 0, scale: 1.6 }, { autoAlpha: 1, scale: 0.8, duration: 0.18, ease: "power2.out" }, t - 0.18);
    tl.to(el, { autoAlpha: 0, scale: 1.8, duration: 0.35, ease: "power2.out" }, t + 0.02);
  };
  S.toast = (t, text, tOut) => {
    const el = document.createElement("div"); el.className = "toast";
    el.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ad89c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>${text}`;
    $("#scr").appendChild(el);
    tl.fromTo(el, { autoAlpha: 0, y: -16 }, { autoAlpha: 1, y: 0, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, t);
    tl.to(el, { autoAlpha: 0, duration: 0.25 }, tOut);
  };

  /* ---- subtítulos: cada línea de voz en trozos cortos, palabra a palabra ---- */
  S.subs = (keys, o = {}) => {
    const max = o.max ?? 24, hl = new Set((o.hl || []).map((w) => w.toLowerCase()));
    const chunks = [];
    keys.forEach((k) => {
      let c = [];
      VO[k].forEach((w, i) => {
        const len = c.map((x) => x[0]).join(" ").length + w[0].length + 1;
        if (c.length && len > max) { chunks.push(c); c = []; }
        c.push(w);
        if (/[.?!:]$/.test(w[0]) && i < VO[k].length - 1 && c.join(" ").length > 10) { chunks.push(c); c = []; }
      });
      if (c.length) chunks.push(c);
    });
    chunks.forEach((c, n) => {
      const el = document.createElement("div"); el.className = "sb";
      el.innerHTML = c.map((w) => `<span class="w${hl.has(w[0].toLowerCase().replace(/[.,:;?!¿¡…]/g, "")) ? " hl" : ""}">${w[0]}</span>`).join(" ");
      $("#subs").appendChild(el);
      gsap.set(el, { xPercent: -50, autoAlpha: 0 });
      const nx = chunks[n + 1], t0 = c[0][1] - 0.1, tEnd = Math.min(c[c.length - 1][2] + 0.45, nx ? nx[0][1] - 0.2 : 999);
      tl.fromTo(el, { autoAlpha: 0, y: 16, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.18, ease: "power2.out", immediateRender: false }, t0);
      [...el.children].forEach((s, i) => tl.to(s, { opacity: 1, duration: 0.1 }, c[i][1] - 0.03));
      tl.to(el, { autoAlpha: 0, duration: 0.14 }, tEnd);
    });
  };

  /* ---- cierre ---- */
  S.end = (t) => {
    tl.fromTo("#end", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, immediateRender: false }, t);
    tl.set([".card", ".nt", ".xls", ".note", ".mail", ".ttl", "#dev"], { autoAlpha: 0 }, t + 0.36);
    tl.fromTo("#end .tile", { scale: 0.3, rotationY: -70, transformPerspective: 900 }, { scale: 1, rotationY: 0, duration: S.sp2.duration, ease: S.sp2.ease, immediateRender: false }, t + 0.05);
    MKP.smearIn("#end .wm .w", t + 0.2, { dx: 60, dur: 0.8 });
    MKP.smearIn("#end .fin .w", t + 0.55, { dx: 50, stagger: 0.05, dur: 0.7 });
    tl.fromTo(["#end .cta", "#end .url"], { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: S.sp.duration, ease: S.sp.ease, stagger: 0.15, immediateRender: false }, t + 1.0);
  };

  /* ---- serie: etiqueta fija ---- */
  S.tag = (t, tOut) => { tl.fromTo("#tag", { autoAlpha: 0, x: -20 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: "expo.out", immediateRender: false }, t); tl.to("#tag", { autoAlpha: 0, duration: 0.2 }, tOut); };

  gsap.set(["#dev", ".pg", "#end", ".card", ".nt", ".xls", ".note", ".mail"], { autoAlpha: 0 });
  gsap.set(["#end .cta", "#end .url"], { autoAlpha: 0 });
  return S;
};

/* portada: ?cover → estado fijo para capturar la miniatura */
window.SerieCover = (fn) => {
  if (!/cover/.test(location.search)) return false;
  document.body.classList.add("cover");
  fn();
  return true;
};
