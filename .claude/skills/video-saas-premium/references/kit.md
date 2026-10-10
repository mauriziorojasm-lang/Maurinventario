# Kit (API)

Archivos en `kit/`, todos seek-safe (se construyen una vez y solo usan `tl.set/fromTo/to` o dibujan en función del tiempo):

| Archivo | Qué es |
|---|---|
| `premium.js` | `window.MKP`: barridos, whips, sincronización con la voz, actos, cortes, congelado. **Lo principal.** |
| `three-stage.js` | Módulo ES de Three.js: escenario, iPhone, ícono, logo extruido, kit de chat, enlace con el timeline. |
| `apple.js` + `apple.css` | `window.MKA`: transición de zoom, tipeo con cursor, burbuja que golpea, emoji con resorte, confeti; clases de vidrio, emoji y cursor. |
| `capas.js` | `window.MKL`: resortes de Motion como ease de GSAP, Rive al cuadro exacto, cualquier capa dibujada por tiempo. |
| `motion-kit.js` + `.css` | `window.MK`: helpers clásicos (type-on, palabra rotativa, guías, selección y cursor tipo Figma, ventana macOS, iris, cámara, contadores…). |
| `vendor/` | Rive (`rive/canvas_advanced.mjs` + `rive.wasm`) y Motion (`motion.js`), MIT, para renderizar sin CDN. |

## MKL — `kit/capas.js`
Cárgalo **después** de registrar `window.__timelines.main`. Uso completo y ejemplos en [Herramientas](herramientas.md).

| Helper | Qué hace |
|---|---|
| `MKL.spring({bounce, visualDuration, velocity})` o `({stiffness, damping, mass})` | Resorte de motion.dev → `{ ease, duration }` para cualquier tween de GSAP. Necesita `kit/vendor/motion.js`. |
| `MKL.springTo(tl, sel, vars, t, opts)` · `MKL.springFromTo(tl, sel, from, to, t, opts)` | Tween con resorte (la duración la pone el resorte). |
| `MKL.rive({canvas, src, animation \| stateMachine, inputs, start, speed, artboard, fit, align})` | Dibuja un `.riv` en el tiempo exacto. Lineal = scrub exacto; state machine = simulación a pasos fijos con `inputs: [[t, nombre, valor\|"fire"]]`. Devuelve una promesa con `names`; si un nombre no existe, falla con la lista. |
| `MKL.onTime(fn)` | `fn(t)` en cada seek y cada update del timeline principal (encadena, no reemplaza). |
| `MKL.hold(clave, promesa)` | Retiene el primer cuadro hasta que la promesa resuelva (cargas asíncronas). |
| `MKL.riveBase` | Ruta a `vendor/rive/` si moviste el kit. |

## MKP — `kit/premium.js`
Llama primero `MKP.use(tl)`; para un acto: `const a = MKP.act(); MKP.use(a); …; root.add(a, offset)`.

| Helper | Qué hace |
|---|---|
| `MKP.words(sel="[data-w]")` | Parte `data-w="Una *petición.* _cobra_"` en spans `.w` (`.acc` / `.al`, rangos de varias palabras). |
| `MKP.smearIn(sel, t, {dx, dy, ry, rx, ry1, rx1, s, bx, by, dur, stagger, dir})` | Entrada con barrido lateral + giro 3D (palabras u objetos). |
| `MKP.sayIn(sel, tiempos, opts)` | Cada elemento entra en su propio tiempo: sincronía con la voz. |
| `MKP.whip(sel, t, {dx, dy, bx, by, ry, s, dur, stagger})` | Salida acelerada con desenfoque en la dirección del movimiento. |
| `MKP.swap(sel, tiempos)` | Palabra rotativa (spans `.sw` apilados en un inline-block de ancho fijo), barrido vertical. |
| `MKP.cut(sel, t, d=0.18)` | Cambio de fondo como corte en movimiento (sin flash). |
| `MKP.freeze(sels, t, hasta)` | Gris + oscurecido de un grupo o del canvas 3D. |
| `MKP.storm(t0, t1, g0, k)` | Tiempos acelerados deterministas (tormenta de mensajes, monedas). |
| `MKP.drift`, `MKP.press`, `MKP.blurOf(el)` | Deriva lenta · rebote de pulsación · id del filtro de desenfoque. |

## three-stage.js
```html
<script type="importmap">{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/" } }</script>
<script type="module">
  import { THREE, createStage, makePhone, makeTile, makeExtrudedSVG, chatUI, bindTimeline, put } from "./kit/three-stage.js";
</script>
```
| Export | Qué hace |
|---|---|
| `createStage({canvas, dpr=2, fov=30, z=22, rimColor})` | Renderer + escena + cámara + luces + reflejos. 1 unidad ≈ 91.5 px a 1080p (`y px = 540 − y·91.5`). |
| `makePhone(stage, {frame, back, glare})` | iPhone; devuelve `{group, ctx, texture, SW, SH}`: dibuja en `ctx` y pon `texture.needsUpdate = true`. |
| `chatUI(ctx, SW, SH, {VW, accent, bg})` | Kit de chat estilo WhatsApp claro (`begin`, `header`, `compose`, `bubble`, `typing`, `chip`). Para otras apps, dibuja la tuya desde sus capturas. |
| `makeTile(stage, {color, dotColor})` | Ícono de app con brillo y burbuja extruida. |
| `makeExtrudedSVG(stage, svg, {scale, center, depth, materials})` | Logo extruido; `materials` por color de relleno (`"#hex": material`). |
| `put(estado, mesh)` | Aplica `{x,y,z,rx,ry,rz,s,v}` (v > 0.5 = visible). |
| `bindTimeline(t3, render)` | Mueve el 3D con el tiempo de HyperFrames (hf-seek + onUpdate del timeline raíz). Crea `t3` con `new gsap.core.Timeline({paused:true})`. |

## MK — `kit/motion-kit.js` (tiempos absolutos en segundos)
| Helper | What it does |
|---|---|
| `MK.typeOn(tl, el, text, start, {cps, words:[[s,e],…], caret, caretUntil})` | Letter-by-letter typing (constant speed or synced to transcript words), classic blinking caret after. Returns end time. |
| `MK.wordSwap(tl, el, words, times, {dur, charW})` | Rotating word that slides up into place at each time ("Te ayudo con tu → web / app / marca"). Centered; set `--mk-swap-align:left` to left-align. |
| `MK.underline(tl, el, t)` | Draw-in underline under a word. |
| `MK.guides(tl, [{h:y},{v:x}], start, {until, parent})` | Design-tool crosshair lines draw in, hold, fade. |
| `MK.select(tl, el, t, {label, dim, until})` | Figma selection on any element: blue frame, 4 handles, top-left label, optional dimension chip. |
| `MK.cursor(tl, {name, keys:[[t,x,y],…], clicks:[t], hide, alt})` | Figma multiplayer cursor with name tag gliding between points; click = squash. `alt` = purple tag. |
| `MK.macWindow({title, html, dark, id})` | Returns macOS window markup (traffic lights + centered title). |
| `MK.iris(tl, el, t, {shape:"eye"|"circle", close, dur, x, y})` | Shape-mask reveal/hide via clip-path: blinking eye or circular iris. |
| `MK.endCard(tl, el, t, {icon:"ig"|"tiktok", handle})` | Black end card with logo + handle. |
| `MK.theme(brand, {base})` | Apply brand colours (`--mk-paper/ink/accent/accent2/muted/cta`) + inject its @font-face. |
| `MK.reveal(tl, el, t, {stagger, y, dur})` | Premium headline: words rise + de-blur (works inside `.mk-grad-text`). |
| `MK.sweep(tl, el, t)` | Light sweep across a logo/headline. |
| `MK.aurora(tl, el, t0, t1)` | Drifting brand-colour glow background. |
| `MK.tilt3d(tl, el, t, {rx, ry, y})` | 3D entrance for screenshots/windows (parent `.mk-3d`). |
| `MK.camera(tl, el, [[t, scale, x, y], …])` | Push-in / pan on a screenshot. |
| `MK.countUp(tl, el, from, to, t, dur, fmt)` | Seek-safe number count-up. |
| `MK.chat(tl, [{el, t, typing, dots}])` | WhatsApp-style bubbles with typing dots (`.mk-bubble.out/.in`, `.mk-typing`). |
| `MK.stagger(tl, sels, t, {stagger})` | Blur-in staggered entrance for cards/chips. |
CSS helpers: `.mk-aurora .mk-dotgrid .mk-grain .mk-glass .mk-elev .mk-3d .mk-grad-text .mk-cta .mk-chip .mk-chat`.

**MKP (kit/premium.js)** — call `MKP.use(tl)` first; switch to an act with `const a = MKP.act(); MKP.use(a); … root.add(a, offset)`.
| Helper | What it does |
|---|---|
| `MKP.words(sel="[data-w]")` | Split `data-w="Una *petición.* _cobra_"` into `.w` spans (`.acc` / `.al`, multi-word ranges OK). |
| `MKP.smearIn(sel, t, {dx, dy, ry, rx, ry1, rx1, s, bx, by, dur, stagger, dir})` | Lateral smear + 3D swing in (words or objects). |
| `MKP.sayIn(sel, times, opts)` | Each element lands at its own time — VO word sync. |
| `MKP.whip(sel, t, {dx, dy, bx, by, ry, s, dur, stagger})` | Accelerating exit with matching directional blur. |
| `MKP.swap(sel, times)` | Rotating word (`.sw` spans stacked in a fixed-width inline-block), vertical smear. |
| `MKP.cut(sel, t, d=0.18)` | Background change as a cut on motion (no flash). |
| `MKP.freeze(sels, t, until)` | Grayscale + dim group/canvas (don't target elements that already use `blurOf` filters). |
| `MKP.storm(t0, t1, g0, k)` | Accelerating deterministic event times (message storms, coins). |
| `MKP.drift`, `MKP.press`, `MKP.blurOf(el)` | Slow ambient move · press bounce · the per-element blur filter id. |

## MKA — detalles Apple (`kit/apple.js` + `apple.css`)
Detalles tipo Apple, seek-safe. Úsalos solo cuando el concepto los justifica ([C4](proceso-creativo.md#c4-detalles-apple-emojis-tipeo-vidrio-cuándo-sí-y-cuándo-no)). Usa resortes de `MKL.spring` si `capas.js` y `vendor/motion.js` están cargados.

| Helper | Qué hace |
|---|---|
| `MKA.zoomThrough(tl, outSel, inSel, t, {mode, full})` | Transición SaaS. `mode: "in"`: el plano viejo pasa de largo hacia la cámara con desenfoque y el nuevo se asienta desde el fondo. `"out"`: el viejo se aleja y el nuevo llega desde cerca. `full: true` en escenas con fondo propio, para que nunca se les vean los bordes. Deja el plano viejo listo para volver. |
| `MKA.typeInto(tl, field, text, t0, t1, {clearAt})` | Escribe `text` letra por letra dentro de `field` entre `t0` y `t1` (antes del `.mka-caret` si lo hay); lo borra en `clearAt` (al enviar). |
| `MKA.caret(tl, sel, t, dur, period)` | Parpadeo seco del cursor (on/off), seek-safe. No uses una animación CSS: no se puede saltar en el tiempo. |
| `MKA.slam(tl, el, t, {from, y, origin})` | La burbuja enviada aterriza con un pequeño rebote (sensación iMessage). |
| `MKA.emoji(tl, el, t, tOut, {r0, r1, shake})` | Emoji `.mka-emoji` que entra con resorte, flota y se va; `shake` = temblores (😵‍💫). |
| `MKA.confetti(tl, container, x, y, t, {n, seed, colors})` | Ráfaga determinista desde un punto (misma semilla, mismo cuadro). Una por video. |

CSS: `.mka-glass` (vidrio claro) y `.mka-glass.dark`, `.mka-emoji` (Apple Color Emoji en macOS), `.mka-caret` (barra del cursor) y `.mka-cf` (pieza de confeti).

```html
<link rel="stylesheet" href="kit/apple.css">
<script src="kit/vendor/motion.js"></script><script src="kit/capas.js"></script><script src="kit/apple.js"></script>
<script>
  MKA.typeInto(tl, "#field", "Agéndame", 8.2, 8.7, { clearAt: 8.75 }); MKA.caret(tl, "#field .mka-caret", 8.1, 2);
  MKA.slam(tl, "#bubble", 8.75);                          // + sonido: teclas (synth_ui_sfx key-N) y "send"
  MKA.emoji(tl, "#party", 9.3, 10.6); MKA.confetti(tl, "#fx", 1600, 480, 9.35);
  MKA.zoomThrough(tl, "#chat", "#agenda", 10.2, { mode: "in" });
</script>
```
