/* ==========================================================================
   video-saas-premium — capas externas dentro de HyperFrames (seek-safe).
   HyperFrames sigue siendo el motor de render (4K60 determinista). Este archivo deja meter,
   SOLO cuando el concepto lo pide:
     · Motion (motion.dev) → resortes físicos tipo iOS como ease de GSAP     MKL.spring / springTo / springFromTo
     · Rive (.riv)         → animaciones lineales o state machines al cuadro  MKL.rive
     · cualquier capa que se dibuje por tiempo (canvas, video, shader)        MKL.onTime
   Lottie no necesita esto: HyperFrames ya lo sincroniza (window.__hfLottie, ver references/herramientas.md).

   Uso (después de registrar window.__timelines.main):
     <script src="https://cdn.jsdelivr.net/npm/motion@13.4.4/dist/motion.js"></script>   (solo si usas springs)
     <script src="kit/capas.js"></script>
     MKL.springTo(tl, "#card", { y: 0, scale: 1 }, 2.4, { bounce: 0.3, visualDuration: 0.5 });
     MKL.rive({ canvas: "#mascota", src: "assets/mascota.riv", animation: "wave", start: 3 });
   ========================================================================== */
(function (root) {
  const MKL = {};
  const rootTl = () => root.__timelines && root.__timelines.main;

  // fn(time) on every HyperFrames seek and every root-timeline update. Chains onUpdate (never replaces it).
  MKL.onTime = (fn) => {
    root.addEventListener("hf-seek", (e) => fn(e.detail.time));
    const r = rootTl();
    if (r) {
      const prev = r.eventCallback("onUpdate");
      r.eventCallback("onUpdate", function () { if (prev) prev.apply(this, arguments); fn(r.time()); });
    } else console.warn("[MKL] registra window.__timelines.main antes de MKL.onTime / MKL.rive");
    fn(r ? r.time() : 0);
  };

  // Hold the first frame until async setup (a .riv download, a decode…) is drawable.
  // Call it synchronously in the same script block that starts the work.
  MKL.hold = (key, promise) => {
    root.__hf = root.__hf || {}; root.__hf.buildReady = root.__hf.buildReady || {};
    root.__hf.buildReady[key] = promise;
    promise.catch((e) => console.error("[MKL] " + key, e));
    return promise;
  };

  /* ---------- Motion: physical springs as a GSAP ease ----------
     Same model as motion.dev / SwiftUI: bounce 0 = no overshoot, 0.3 = playful, 0.5 = very springy;
     visualDuration = when it LOOKS arrived (the tail settles after). Or pass stiffness/damping/mass.
     Returns { ease, duration }; duration = time until the spring is at rest. */
  MKL.spring = ({ bounce = 0.2, visualDuration = 0.5, velocity = 0, stiffness, damping, mass } = {}) => {
    const M = root.Motion;
    if (!M || !M.spring) throw new Error("MKL.spring necesita motion: <script src=\"https://cdn.jsdelivr.net/npm/motion@13.4.4/dist/motion.js\">");
    const g = M.spring(stiffness ? { keyframes: [0, 1], stiffness, damping, mass, velocity } : { keyframes: [0, 1], bounce, visualDuration, velocity });
    let T = 0; while (T < 8000 && !g.next(T).done) T += 5;
    const N = 512, lut = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) lut[i] = g.next((i / N) * T).value;
    lut[N] = 1;
    const ease = (p) => { if (p <= 0) return 0; if (p >= 1) return 1; const x = p * N, i = x | 0; return lut[i] + (lut[i + 1] - lut[i]) * (x - i); };
    return { ease, duration: Math.max(T, 1) / 1000 };
  };
  MKL.springTo = (tl, target, vars, t, o) => { const s = MKL.spring(o); return tl.to(target, { ...vars, duration: s.duration, ease: s.ease }, t); };
  MKL.springFromTo = (tl, target, from, to, t, o) => { const s = MKL.spring(o); return tl.fromTo(target, from, { ...to, duration: s.duration, ease: s.ease }, t); };

  /* ---------- Rive: a .riv drawn at the exact composition time ----------
     MKL.rive({
       canvas,              // <canvas> or selector. Size it 2× its CSS box for 4K output.
       src,                 // local .riv (assets/…)
       artboard,            // optional, default artboard otherwise
       animation,           // linear animation name (default: the first one) → exact scrub, loops if the file loops
       stateMachine,        // OR a state machine name → simulated in fixed 1/60 s steps from 0 (deterministic)
       inputs,              // state machine only: [[t, "name", value]] — number, true/false, or "fire" for triggers (t in local s)
       start = 0, speed = 1, fit = "contain", align = "center", key
     }) → Promise<{ names }>   (every animation / state machine in the artboard; a wrong name throws and lists them)
     Uses the low-level runtime so every frame is drawn synchronously (no rAF), which is what a frame-by-frame render needs. */
  // Runtime vendored in kit/vendor/rive (MIT): renders never depend on a CDN.
  // (HyperFrames may inline this script, leaving currentScript.src empty → fall back to ./kit/; override with MKL.riveBase.)
  const SRC = document.currentScript && document.currentScript.src;
  const KIT = SRC ? new URL(".", SRC).href : new URL("kit/", location.href).href;
  let riveRt = null;
  const riveRuntime = () => riveRt || (riveRt = (async () => {
    const base = MKL.riveBase || KIT + "vendor/rive/";
    const [m, wasm] = await Promise.all([import(base + "canvas_advanced.mjs"), fetch(base + "rive.wasm").then((r) => r.arrayBuffer())]);
    return m.default({ locateFile: (f) => base + f, wasmBinary: wasm });
  })());

  MKL.rive = (o) => MKL.hold(o.key || "rive:" + o.src + ":" + (o.animation || o.stateMachine || ""), (async () => {
    const rive = await riveRuntime();
    const res = await fetch(o.src);
    if (!res.ok) throw new Error("no se pudo cargar " + o.src);
    const file = await rive.load(new Uint8Array(await res.arrayBuffer()));
    const canvas = typeof o.canvas === "string" ? document.querySelector(o.canvas) : o.canvas;
    const renderer = rive.makeRenderer(canvas);
    const sm = o.stateMachine != null, STEP = 1 / 60, start = o.start || 0, speed = o.speed || 1;
    const newArtboard = () => (o.artboard ? file.artboardByName(o.artboard) : file.defaultArtboard());
    let ab = newArtboard();
    const names = {
      artboard: ab.name,
      animations: [...Array(ab.animationCount())].map((_, i) => ab.animationByIndex(i).name),
      stateMachines: [...Array(ab.stateMachineCount())].map((_, i) => ab.stateMachineByIndex(i).name),
    };
    console.info("[MKL.rive]", o.src, JSON.stringify(names));
    if (sm && !names.stateMachines.includes(o.stateMachine)) throw new Error(`state machine "${o.stateMachine}" no existe en ${o.src}: ${JSON.stringify(names)}`);
    if (!sm && o.animation && !names.animations.includes(o.animation)) throw new Error(`animación "${o.animation}" no existe en ${o.src}: ${JSON.stringify(names)}`);
    if (!sm && !names.animations.length) throw new Error(`${o.src} no tiene animaciones lineales: usa stateMachine (${names.stateMachines})`);
    const make = () => {
      if (sm) return new rive.StateMachineInstance(ab.stateMachineByName(o.stateMachine), ab);
      return new rive.LinearAnimationInstance(o.animation ? ab.animationByName(o.animation) : ab.animationByIndex(0), ab);
    };
    let inst = make();

    const draw = () => {
      renderer.clear();
      renderer.save();
      renderer.align(rive.Fit[o.fit || "contain"], rive.Alignment[o.align || "center"],
        { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height }, ab.bounds);
      ab.draw(renderer);
      renderer.restore();
      rive.resolveAnimationFrame();
    };

    // State machine: forward renders advance incrementally; seeking back rebuilds from 0 (same fixed steps → same frame).
    const queue = (o.inputs || []).slice().sort((a, b) => a[0] - b[0]);
    let simT = 0, qi = 0, inputs = {};
    const reset = () => {
      inst.delete(); ab.delete(); ab = newArtboard(); inst = make();
      simT = 0; qi = 0;
      inputs = {}; for (let i = 0; i < inst.inputCount(); i++) { const x = inst.input(i); inputs[x.name] = x; }
      inst.advance(0); ab.advance(0);
    };
    const feed = () => {
      while (qi < queue.length && queue[qi][0] <= simT + 1e-6) {
        const [, n, v] = queue[qi++], x = inputs[n];
        if (!x) { console.warn("[MKL.rive] input inexistente:", n); continue; }
        if (v === "fire") x.asTrigger().fire(); else if (typeof v === "boolean") x.asBool().value = v; else x.asNumber().value = v;
      }
    };
    if (sm) reset();

    const at = (t) => {
      const local = Math.max(0, t - start) * speed;
      if (sm) {
        const T = Math.round(local / STEP) * STEP;
        if (T < simT - 1e-6) reset();
        while (simT < T - 1e-6) { feed(); inst.advance(STEP); ab.advance(STEP); simT += STEP; }
        feed();
      } else {
        inst.time = 0; inst.advance(local); inst.apply(1); ab.advance(0);
      }
      draw();
    };
    MKL.onTime(at);
    return { names };
  })());

  root.MKL = MKL;
})(window);
