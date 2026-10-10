# Herramientas (las elige el concepto)

**HyperFrames es siempre el motor de render**: compone en HTML, mueve el tiempo cuadro por cuadro y garantiza que el render 4K60 salga igual cada vez. Las demás herramientas entran como **capas dentro de la composición**, y solo cuando el concepto las pide. Nunca metas una herramienta "porque se ve pro".

| El concepto necesita | Herramienta | Archivo / API |
|---|---|---|
| UI real recreada, tipografía, cámara, barridos, transiciones | **GSAP** | `kit/premium.js` (MKP), `kit/motion-kit.js` (MK) |
| Objetos 3D, logo extruido, teléfono con UI viva, profundidad real | **Three.js** | `kit/three-stage.js` |
| UI que se mueva como en iOS/macOS: hojas que suben, tarjetas que rebotan, notificaciones, arrastrar y soltar, botones elásticos | **Motion** (motion.dev): resortes físicos | `MKL.spring` en `kit/capas.js` |
| Un personaje, mascota o ilustración articulada que **ya existe** en Rive (o un `.riv` de la comunidad con licencia) | **Rive** | `MKL.rive` en `kit/capas.js` |
| Animaciones **ya hechas** en After Effects o LottieFiles (íconos animados de la marca, ilustraciones) | **Lottie** | adaptador nativo de HyperFrames (`window.__hfLottie`) |
| Grabaciones de pantalla, footage, video de la marca | `<video>` de HyperFrames | ver la skill `hyperframes-core` |
| El **mundo físico sin video** (el celular de la recepción vibrando sobre un mostrador, un producto en una mesa) | **Three.js**: objetos reales con luz, sombras suaves y materiales (madera, cerámica) | `kit/three-stage.js` (ver abajo) |
| Emojis de Apple, tipeo con cursor, burbuja que golpea, confeti, vidrio, transición de zoom | GSAP + `kit/apple.js` / `apple.css` | [Kit · MKA](kit.md#mka--detalles-apple-kitapplejs--applecss), criterio en [C4](proceso-creativo.md#c4-detalles-apple-emojis-tipeo-vidrio-cuándo-sí-y-cuándo-no) |
| Shaders, partículas, efectos generativos | canvas o registry de HyperFrames | `MKL.onTime` para dibujar por tiempo |

## Límites honestos (díselos a la persona)
- **No se puede crear un `.riv` ni un Lottie desde cero.** Se diseñan en el editor de Rive o en After Effects. Lo que sí se puede: usar los que la marca ya tiene o uno de la comunidad con licencia, elegir su animación, dispararle inputs a tiempo y combinarlo con todo lo demás.
- Si un concepto depende de un personaje animado que no existe, propón alternativas: ilustración SVG animada con GSAP, el personaje en 3D con Three.js, o que la persona lo encargue. No lo prometas.
- Todo debe ser **seek-safe**: el render salta a cualquier tiempo, también hacia atrás. Prohibido:
  - `requestAnimationFrame` propio;
  - `Date.now()` o `performance.now()` para animar;
  - autoplay, o animaciones que "corren solas".

## Orden de los scripts

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="kit/vendor/motion.js"></script>       <!-- solo si usas resortes -->
<script src="kit/premium.js"></script>
<script>
  const root = gsap.timeline({ paused: true });
  /* … todos los tweens … */
  window.__timelines = window.__timelines || {}; window.__timelines.main = root; root.seek(0);
</script>
<script src="kit/capas.js"></script>               <!-- después de registrar window.__timelines.main -->
<script> /* MKL.rive(…), MKL.onTime(…) */ </script>
<script type="module"> /* three-stage.js + bindTimeline */ </script>
```

Rive y Motion vienen **dentro del kit** (`kit/vendor/`, licencia MIT): el render no depende de un CDN. Si mueves el kit, define `MKL.riveBase = "ruta/al/kit/vendor/rive/"` antes de `MKL.rive`.

## Motion: resortes físicos

Las curvas de GSAP (`expo.out`) son **curvas**; un resorte es **física**: la masa llega, se pasa un poco y se asienta. Es lo que usan iOS y macOS, por eso la UI recreada se siente "de verdad" cuando se mueve con resortes. Úsalo para **elementos de interfaz**. Para tipografía, los barridos de `MKP` siguen siendo mejores.

```js
// bounce 0 = sin rebote · 0.2 = sobrio (Apple) · 0.35 = juguetón · 0.5 = muy elástico
// visualDuration = cuándo PARECE que llegó (la cola se asienta después)
MKL.springFromTo(tl, "#sheet", { y: 700 }, { y: 0 }, 3.2, { bounce: 0.15, visualDuration: 0.45 });   // hoja de iOS
MKL.springTo(tl, "#card", { scale: 1, rotation: 0 }, 5.0, { bounce: 0.35, visualDuration: 0.5 });  // tarjeta que cae
const s = MKL.spring({ bounce: 0.25 });               // { ease, duration } para usarlo en cualquier tween o stagger
tl.to(".chip", { y: 0, stagger: 0.05, ease: s.ease, duration: s.duration }, 6.1);
```

La curva se calcula con el modelo de resorte de motion.dev y se vuelve un `ease` de GSAP. Queda dentro del timeline principal y por eso es 100 % seek-safe.

## Rive: personajes y animaciones `.riv`

```html
<canvas id="mascota" width="1200" height="1200" style="position:absolute;left:700px;top:240px;width:600px;height:600px"></canvas>
```

```js
// Animación lineal: cada cuadro es exacto; si el archivo la marca como loop, se repite sola
MKL.rive({ canvas: "#mascota", src: "assets/mascota.riv", animation: "wave", start: 2.0 });

// State machine: se simula en pasos fijos de 1/60 s desde 0 (mismo cuadro siempre, también al ir hacia atrás).
// Sus inputs se disparan A TIEMPO (segundos locales desde start): número, true/false o "fire" para triggers
MKL.rive({ canvas: "#mascota", src: "assets/mascota.riv", stateMachine: "State Machine 1", start: 4,
           inputs: [[0.5, "isHappy", true], [2.0, "jump", "fire"], [3.1, "level", 2]] });
```

- **Los nombres** de animaciones, state machines e inputs salen del archivo. Si pones uno que no existe, `MKL.rive` falla con la lista de los que sí hay. Para verlos sin adivinar, corre una vez `MKL.rive({...}).then(r => console.log(r.names))`.
- El canvas al **doble** de su tamaño CSS (para 4K). Es transparente: se compone sobre lo que haya detrás.
- Entra y sale de escena con GSAP sobre el `<canvas>` (opacidad, posición, escala, smear), como cualquier otro elemento.
- Opciones: `artboard`, `fit` (`contain`, `cover`, `fill`…), `align` (`center`, `topLeft`…), `speed`.

## Lottie

Usa el adaptador nativo de HyperFrames: carga con `autoplay: false`, define siempre `loop` y registra la animación:

```js
const anim = lottie.loadAnimation({ container: document.getElementById("icono"), renderer: "svg", loop: false, autoplay: false, path: "assets/icono.json" });
window.__hfLottie = window.__hfLottie || []; window.__hfLottie.push(anim);
```

HyperFrames la lleva al **tiempo global de la composición**: no hay desfase por animación. Un gesto que debe pasar en el segundo 4 tiene que estar en el segundo 4 dentro del archivo. Un ciclo con `loop: true` se repite toda la escena. Muestra u oculta el contenedor con GSAP. Detalle en la skill `hyperframes-animation` (adaptador Lottie).

## Cualquier otra capa dibujada por tiempo

```js
MKL.onTime((t) => { dibujarMiCanvas(t); });   // se llama en cada seek y en cada update del timeline principal
```

Úsalo para canvas 2D, shaders o cualquier cosa que sepa dibujarse "en el segundo t". Si tu capa necesita cargar algo antes del primer cuadro, envuélvelo con `MKL.hold("mi-capa", promesa)`.

## Cómo verificar las capas
- `npx hyperframes check .` sin errores de runtime.
- Snapshots en desorden (`--at 3.5,1.2,2.8`): cada capa debe verse igual que en orden. Si una capa cambia según el orden, no es seek-safe.
- Snapshots en los segundos donde una capa entra y sale, y donde se dispara cada input de Rive.

## El mundo físico en 3D (cuando no hay video)
Si el producto vive en un lugar real y no hay grabaciones, recrea **objetos**, no personas:
- **Superficie:** un plano grande con textura procedural (veta de madera clara, cerámica) dibujada en un `<canvas>` → `CanvasTexture`. Que se note la superficie, no un fondo liso.
- **Luz y sombra:** `renderer.shadowMap.enabled = true` con `VSMShadowMap`, la luz principal con `castShadow` y `shadow.radius` alto (sombra suave); el objeto con `castShadow` y el plano con `receiveShadow`. Una `HemisphereLight` cálida de relleno.
- **El objeto vivo:** el iPhone de `makePhone` con su pantalla dibujada por tiempo (pantalla de bloqueo real de iOS, notificaciones que se apilan). La vibración es una sacudida corta y decreciente en cada notificación, calculada desde el tiempo (seek-safe).
- **La cámara cuenta:** acercamiento lento mientras crece la tensión y luego **entrar en la pantalla** (z → 5) justo antes del corte al chat o la UI.
- **Al volver a la escena 3D**, coloca la cámara y el estado ("calma") **antes** de mostrarla: si no, se ve un cuadro con el estado viejo.
- Nunca personas o manos en 3D "realista": se notan falsas.
