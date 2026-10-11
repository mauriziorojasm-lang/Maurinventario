/* ==========================================================================
   video-saas-premium — PREMIUM v4 helpers (Apple/Figma-level SaaS films).
   Directional motion-blur smears, whips, word-synced VO reveals, act timelines.
   Seek-safe: everything is built once at load with tl.fromTo/to/set.

   Usage:
     <script src="kit/premium.js"></script>
     const root = gsap.timeline({ paused: true });
     MKP.use(root);                       // helpers write into the current act timeline
     MKP.words();                         // split every [data-w] ("a *accent* _alert_") into .w spans
     MKP.smearIn("#h1 .w", 0.3);          // words streak in
     MKP.sayIn("#h1 .w", [0.45, 0.76]);   // each word lands when the VO says it (times from ElevenLabs)
     const act = MKP.act();               // new child timeline authored in its own local time…
     …MKP.use(act) … root.add(act, 10);   // …then placed at an offset (retime a whole act in one number)
   ========================================================================== */
(function (root) {
  const MKP = {};
  let tl = null, fid = 0, defs = null;
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  const els = (s) => [].concat(s).flatMap((x) => (typeof x === "string" ? $$(x) : [x]));   // NB: arrays of selectors too

  MKP.use = (t) => { tl = t; return MKP; };
  MKP.act = () => new gsap.core.Timeline();   // child act timeline (not registered; added to root)

  // "Una *petición.*" → spans; *x y* = .acc (brand colour), _x y_ = .al (alert colour); multi-word ranges allowed
  MKP.words = (sel = "[data-w]") => $$(sel).forEach((el) => {
    let acc = false, al = false;
    el.innerHTML = el.dataset.w.split(" ").map((w) => {
      if (w.startsWith("*")) acc = true; if (w.startsWith("_")) al = true; const a = acc, b = al;
      if (w.endsWith("*")) acc = false; if (w.endsWith("_")) al = false;
      return `<span class="w${a ? " acc" : ""}${b ? " al" : ""}">${w.replace(/[*_]/g, "")}</span>`;
    }).join(" ");
  });

  // Per-element directional blur: an SVG feGaussianBlur whose stdDeviation "x y" is tweened.
  MKP.blurOf = (el) => {
    if (!defs) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", 0); svg.setAttribute("height", 0); svg.style.position = "absolute";
      svg.innerHTML = "<defs></defs>"; document.body.prepend(svg); defs = svg.firstChild;
    }
    if (!el._mb) {
      const id = "mkpb" + (++fid);
      defs.insertAdjacentHTML("beforeend", `<filter id="${id}" x="-60%" y="-80%" width="220%" height="260%" color-interpolation-filters="sRGB"><feGaussianBlur id="${id}g" stdDeviation="0.001 0.001"/></filter>`);
      el.style.filter = `url(#${id})`; el._mb = "#" + id + "g";
    }
    return el._mb;
  };

  // Streak in: lateral smear (bx/by) + 3D swing (ry/rx) + scale settle. Words or whole objects.
  MKP.smearIn = (sel, t, o = {}) => {
    const d = o.dur ?? 0.9, st = o.stagger ?? 0.065, dir = o.dir ?? 1;
    els(sel).forEach((el, i) => {
      const ti = t + i * st, g = MKP.blurOf(el);
      tl.fromTo(el, { autoAlpha: 0, x: dir * (o.dx ?? 80), y: o.dy ?? 0, rotationY: dir * (o.ry ?? -55), rotationX: o.rx ?? 0, scale: o.s ?? 0.92, transformPerspective: 900 },
        { autoAlpha: 1, x: 0, y: 0, rotationY: o.ry1 ?? 0, rotationX: o.rx1 ?? 0, scale: 1, duration: d, ease: o.ease || "expo.out" }, ti);
      tl.fromTo(g, { attr: { stdDeviation: `${o.bx ?? 34} ${o.by ?? 0}` } }, { attr: { stdDeviation: "0.001 0.001" }, duration: d * 0.6, ease: "expo.out" }, ti);
    });
  };
  // Each matched element lands at its own time (word-level VO sync).
  MKP.sayIn = (sel, times, o = {}) => els(sel).forEach((el, i) => MKP.smearIn(el, times[i], { stagger: 0, ...o }));

  // Whip out: accelerate away along dx/dy with matching smear.
  MKP.whip = (sel, t, o = {}) => {
    const d = o.dur ?? 0.5, st = o.stagger ?? 0.03;
    els(sel).forEach((el, i) => {
      const ti = t + i * st, g = MKP.blurOf(el);
      tl.to(el, { x: o.dx ?? -420, y: o.dy ?? 0, autoAlpha: 0, scale: o.s ?? 1, rotationY: o.ry ?? 0, duration: d, ease: "power3.in" }, ti);
      tl.to(g, { attr: { stdDeviation: `${o.bx ?? 60} ${o.by ?? 0}` }, duration: d, ease: "power3.in" }, ti);
    });
  };
  // Vertical word swap (rotating word): each .sw rises in at times[i], smeared on Y.
  MKP.swap = (sel, times, o = {}) => els(sel).forEach((s, i) => {
    const g = MKP.blurOf(s);
    tl.fromTo(s, { autoAlpha: 0, yPercent: 70 }, { autoAlpha: 1, yPercent: 0, duration: 0.6, ease: "expo.out" }, times[i]);
    tl.fromTo(g, { attr: { stdDeviation: "0.001 18" } }, { attr: { stdDeviation: "0.001 0.001" }, duration: 0.45, ease: "expo.out" }, times[i]);
    if (times[i + 1] != null) {
      tl.to(s, { autoAlpha: 0, yPercent: -70, duration: 0.3, ease: "power3.in" }, times[i + 1] - 0.15);
      tl.to(g, { attr: { stdDeviation: "0.001 18" }, duration: 0.3, ease: "power3.in" }, times[i + 1] - 0.15);
    }
  });
  // Dark↔light background change as a CUT ON MOTION (never a white flash / bright mask dome).
  MKP.cut = (sel, t, d = 0.18) => tl.fromTo(sel, { autoAlpha: 0 }, { autoAlpha: 1, duration: d, ease: "power1.inOut" }, t);
  MKP.drift = (el, t0, t1, to) => tl.to(el, { ...to, duration: t1 - t0, ease: "sine.inOut" }, t0);
  MKP.press = (el, t) => tl.to(el, { scale: 0.93, duration: 0.09, yoyo: true, repeat: 1, ease: "power1.out" }, t);
  // Accelerating event times (message storms, coin bursts) — deterministic.
  MKP.storm = (t0, t1, g0 = 0.42, k = 0.85, min = 0.1) => { const a = []; let t = t0, g = g0; while (t < t1) { a.push(+t.toFixed(3)); t += g; g = Math.max(min, g * k); } return a; };
  // Freeze: grayscale + dim a group (and the 3D canvas) — the "golpe seco" beat.
  MKP.freeze = (sels, t, until) => {
    tl.fromTo(sels, { filter: "grayscale(0) brightness(1)" }, { filter: "grayscale(1) brightness(0.42)", duration: 0.12, immediateRender: false }, t);
    if (until) tl.set(sels, { filter: "grayscale(0) brightness(1)" }, until);
  };

  root.MKP = MKP;
})(window);
