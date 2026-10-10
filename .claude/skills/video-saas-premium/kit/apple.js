/* ==========================================================================
   video-saas-premium — "Apple details" for SaaS films (seek-safe, GSAP).
   Use them only when the concept calls for them (see references/proceso-creativo.md · C4).
     MKA.zoomThrough  SaaS transition: the old shot flies past the camera, the new one settles from depth
     MKA.typeInto     text typed into a field letter by letter (with MKA.caret blinking)
     MKA.slam         a sent message bubble lands with a small overshoot (iMessage feel)
     MKA.emoji        an Apple emoji pops with a spring, floats, and leaves
     MKA.confetti     a deterministic confetti burst from a point (celebrations, 🎉)
   CSS in kit/apple.css: .mka-glass, .mka-emoji, .mka-caret, .mka-cf.
   Springs use MKL.spring (kit/capas.js + kit/vendor/motion.js) when loaded, else a back-out ease.
   ========================================================================== */
(function (root) {
  const MKA = {};
  const $ = (s) => (typeof s === "string" ? document.querySelector(s) : s);
  const spring = (o, fb) => (root.MKL && root.Motion ? root.MKL.spring(o) : { ease: fb || "back.out(1.6)", duration: (o.visualDuration || 0.4) * 1.6 });

  // mode "in": out-shot grows past camera (1.4×) + blur, in-shot comes from depth (0.74×).
  // mode "out": out-shot shrinks away (0.8×), in-shot arrives from close (1.28×).
  // full: true for full-bleed scenes (own background) → they always enter from ≥1.18× so their edges never show.
  MKA.zoomThrough = (tl, outSel, inSel, t, { mode = "in", full = false, blur = 16, outDur = 0.42, inDur = 0.75 } = {}) => {
    const o = mode === "in" ? 1.4 : 0.8, i0 = full ? 1.18 : (mode === "in" ? 0.74 : 1.28);
    if (outSel) {
      tl.to(outSel, { scale: o, autoAlpha: 0, filter: `blur(${blur}px)`, duration: outDur, ease: "power3.in", transformOrigin: "50% 50%" }, t - 0.32);
      tl.set(outSel, { scale: 1, filter: "blur(0px)" }, t + inDur + 0.15);      // reset so the scene can come back
    }
    tl.fromTo(inSel, { autoAlpha: 0, scale: i0, filter: `blur(${blur}px)`, transformOrigin: "50% 50%" },
      { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: inDur, ease: "expo.out", immediateRender: false }, t - 0.08);
  };

  // Fills `field` with one hidden span per character, reveals them between t0 and t1; clears at `clearAt` (e.g. on send).
  MKA.typeInto = (tl, field, text, t0, t1, { clearAt } = {}) => {
    const f = $(field), wrap = document.createElement("span");
    wrap.innerHTML = [...text].map((c) => `<span style="display:none">${c === " " ? "&nbsp;" : c}</span>`).join("");
    const caret = f.querySelector(".mka-caret"); caret ? f.insertBefore(wrap, caret) : f.appendChild(wrap);
    const ch = [...wrap.children], span = Math.max(0.05, t1 - t0);
    ch.forEach((c, k) => tl.set(c, { display: "inline" }, t0 + (k * span) / ch.length));
    if (clearAt != null) tl.set(ch, { display: "none" }, clearAt);
    return wrap;
  };

  // Hard on/off blink (like a real caret), seek-safe.
  MKA.caret = (tl, sel, t, dur = 3, period = 0.42) =>
    tl.fromTo(sel, { opacity: 1 }, { opacity: 0, duration: period, ease: "steps(1)", repeat: Math.max(1, Math.round(dur / period)) - 1, yoyo: true, immediateRender: false }, t);

  MKA.slam = (tl, el, t, { from = 0.55, y = 60, origin = "100% 100%" } = {}) => {
    const s = spring({ bounce: 0.45, visualDuration: 0.3 });
    return tl.fromTo(el, { autoAlpha: 0, scale: from, y, transformOrigin: origin }, { autoAlpha: 1, scale: 1, y: 0, duration: s.duration, ease: s.ease }, t);
  };

  // Pops at t, floats, leaves at tOut. shake: n small wobbles (anxious emojis like 😵‍💫).
  MKA.emoji = (tl, el, t, tOut, { r0 = -18, r1 = 6, shake = 0 } = {}) => {
    const s = spring({ bounce: 0.5, visualDuration: 0.4 });
    tl.fromTo(el, { autoAlpha: 0, scale: 0.2, rotation: r0, y: 30 }, { autoAlpha: 1, scale: 1, rotation: 0, y: 0, duration: s.duration, ease: s.ease }, t);
    tl.to(el, { y: -18, rotation: r1, duration: Math.max(0.2, tOut - t - 0.3), ease: "sine.inOut" }, t + 0.4);
    if (shake) tl.to(el, { rotation: "+=14", duration: 0.12, yoyo: true, repeat: shake * 2 - 1, ease: "sine.inOut" }, t + 0.35);
    tl.to(el, { autoAlpha: 0, scale: 0.6, duration: 0.22, ease: "power2.in" }, tOut - 0.22);
  };

  // Deterministic burst (same seed → same frame on every render). Pieces are created inside `container` at (x, y).
  MKA.confetti = (tl, container, x, y, t, { n = 34, seed = 11, colors = ["#c9a53a", "#5ee57a", "#ffffff", "#f5ecb2", "#53bdeb", "#e6df92"], spread = 2.4, power = [280, 700], fall = 520 } = {}) => {
    let sd = seed; const rn = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const box = $(container);
    for (let k = 0; k < n; k++) {
      const d = document.createElement("i"); d.className = "mka-cf"; d.style.background = colors[k % colors.length];
      d.style.left = x + "px"; d.style.top = y + "px"; box.appendChild(d);
      const a = -Math.PI / 2 + (rn() - 0.5) * spread, v = power[0] + rn() * (power[1] - power[0]), dx = Math.cos(a) * v, dy = Math.sin(a) * v, r = (rn() - 0.5) * 900;
      tl.fromTo(d, { autoAlpha: 1, x: 0, y: 0, rotation: 0, scale: 0.6 + rn() * 0.7 },
        { keyframes: [{ x: dx * 0.7, y: dy * 0.7, rotation: r * 0.5, duration: 0.38, ease: "power2.out" },
                      { x: dx, y: dy + fall, rotation: r, autoAlpha: 0, duration: 0.95, ease: "power1.in" }], immediateRender: false }, t + rn() * 0.06);
    }
  };

  root.MKA = MKA;
})(window);
