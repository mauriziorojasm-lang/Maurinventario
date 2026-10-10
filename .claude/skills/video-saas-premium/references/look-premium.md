# Look premium (calidad de diseño y movimiento)

Esto es **vocabulario y estándar de calidad**, no una estructura. Qué escenas hay, en qué orden, cuánto duran y si hay voz lo decide el concepto ([Proceso creativo](proceso-creativo.md)). Aquí está cómo hacer que cada cosa se vea cara.

## Formato
- Lo define el brief. Compón a **1920×1080** (16:9) o **1080×1920** (9:16) y renderiza a **4K60** (`--resolution 4k --fps 60 --quality delivery`).
- **UIs de escritorio** (paneles web, Gmail, editores) → 16:9: en vertical no se aprecian. **Apps móviles y formato nativo de reel** → 9:16.
- Si hacen falta los dos formatos, **una sola plantilla** con presets de layout (`src/template.html` + un `build.py` propio que con `--vertical` cambia posiciones y tamaños) en vez de dos videos a mano.
- Duración: la del concepto (un loop de 8 s, un reel de 15, un lanzamiento de 40…), nunca "30–40 s porque sí".

## Tipografía
- La fuente de la marca (de `brand_from_url.py`) o, si no tiene una buena, **Inter** o **Geist** (Google Fonts, OFL). En macOS puedes usar **SF Pro** del sistema localmente (`/System/Library/Fonts/SFNS.ttf` copiado al proyecto; no lo redistribuyas).
- Títulos 600 de peso, 60–76 px, `letter-spacing: -0.035em`. Subtítulos tipo píldora de 46 px sobre la UI.
- Una sola frase de acento por línea: `*color de marca*`, `_color de alerta_` (solo en el problema).

## Escenarios
- Salen de la marca (sus colores, sus fondos, sus fotos), no de una fórmula.
- **Claro**: un wallpaper suave con el color de la marca (gradientes radiales) y las ventanas encima con sombra.
- **Oscuro**: `#050707` + brillo del color de marca desde abajo + viñeta.
- Alternar oscuro y claro es una herramienta de contraste (por ejemplo, un problema en oscuro y una solución en claro), no una regla.
- Grano 4–5%.

## Movimiento
- **Barrido direccional por palabra** (`MKP.smearIn`): desplazamiento lateral + giro 3D + desenfoque horizontal (SVG `feGaussianBlur` con `stdDeviation "x y"` animado). Salida con **whip** (`MKP.whip`).
- **Todo vive**: nada estático más de 1 s (deriva lenta, rotación 3D suave).
- **Cambios oscuro ↔ claro**: corte de 0.18 s (`MKP.cut`) escondido bajo un whip o un vuelo de cámara, idealmente en un downbeat de la música. **Nunca** flash blanco.

## Cámara (estilo Screen Studio)
Todas las ventanas viven en `#cam` (`transform-origin: 0 0`):

```js
const cam = (t, [wx, wy], s, d = 0.9, ease = "expo.inOut") =>
  tl.to("#cam", { x: 960 - wx * s, y: 540 - wy * s, scale: s, duration: d, ease }, t);
```

- Zoom in a cada acción (×1.5–2.3), zoom out para mostrar la ventana entera (×1), paneos que siguen el texto que se escribe.
- **Handoff de logo**: el logo 3D llega al centro, la cámara arranca con zoom ×8 sobre el logo de la UI real en el mismo punto y hace zoom out revelando el producto.
- **Warp líquido** entre estados: `feTurbulence` + `feDisplacementMap` con `scale` 0 → 80 → 0.
- El cursor ("Tú") vive dentro de `#cam`, así crece con el zoom; clic = pequeño squash + `MKP.press` sobre el botón.

## 3D (`kit/three-stage.js`)
- **iPhone** procedural (marco de titanio, cristal, cámaras) cuya pantalla es un canvas dibujado en función del tiempo. Recrea ahí la app real (desde capturas).
- **Logo del cliente extruido** desde su SVG (`makeExtrudedSVG`), cerámica blanca + la parte de acento en color.
- **Ícono de app** con brillo (`makeTile`).
- Movimientos: entra girando desde un lado (`ry` −1.25 → −0.3), deriva, **gira de canto para convertirse en otro objeto** (ry = 90° → cambia la visibilidad), el logo llega desde la profundidad (z −30 → 0) y la cámara puede **atravesarlo** (z → 21).

## Gramática de transiciones
| Movimiento | Cómo | Cuándo |
|---|---|---|
| Barrido / whip | `MKP.smearIn` / `MKP.whip` | cada palabra, chip, tarjeta |
| Zoom de cámara | `cam()` | cada acción en la UI |
| Swing 3D | timeline 3D: `x`, `ry` | el teléfono u objeto entra |
| Morph de canto | girar a 90°, cambiar `v` | un objeto se vuelve otro |
| Vuelo / atravesar | 3D `z` −30 → 0 / → 21 | llega el logo; pasar a la siguiente escena |
| Handoff | logo 3D → logo de la UI | entrar al producto |
| Warp líquido | filtro de desplazamiento | la ventana cambia de estado o hace espacio |
| Corte en movimiento | `MKP.cut` (0.18 s) | oscuro ↔ claro |
| Palabra rotativa | `MKP.swap` | "Una API para tu web / app / agente" |
| Congelado | `MKP.freeze` + sub drop | el problema golpea |
| Resorte físico | `MKL.springTo` (motion.dev) | UI que entra o reacciona como en iOS: hojas, tarjetas, notificaciones |
| Zoom a través (SaaS) | `MKA.zoomThrough` | chat → su resultado (*in*), resultado → siguiente gesto (*out*); alterna in/out |
| Entrar en una pantalla | cámara 3D z → 5 + corte | del objeto físico (celular) a la UI que muestra |
| Personaje / animación Rive | `MKL.rive` | la mascota de la marca actúa; inputs a tiempo |

## Patrón de construcción
- Un timeline raíz pausado registrado en `window.__timelines.main`. Cada acto es un **timeline hijo** escrito en su tiempo local (`MKP.act()`), añadido con `root.add(acto, offset)`: reacomodar un acto es cambiar un número.
- El 3D usa su propio `new gsap.core.Timeline({paused:true})` con objetos de estado y `bindTimeline(t3, render)`.
- Titulares: `<div data-w="Una *petición.*">` + `MKP.words()`; las palabras aparecen con `MKP.sayIn(sel, tiemposDeVoz)`.
- Capas externas (resortes, Rive, canvas por tiempo): `kit/capas.js`, ver [Herramientas](herramientas.md).
- Para proyectos grandes: una plantilla en `src/` y un `build.py` que inyecta alineación de voz, logos, QR y la lista de efectos en `index.html` (que la plantilla no quede en la raíz o HyperFrames la verá como segunda composición).

## Ritmo y aire
- Una idea por plano. Referencia que funcionó: ~2 s para leer un chat corto, ~1,5 s para ver su resultado, transiciones de ~0,4 s entre ellos, cortes a tempo de la música.
- **Zonas fijas:** la UI dentro de su propio cuadro, los subtítulos con su franja libre abajo, las etiquetas en espacio vacío (nunca sobre cabeceras o datos).
- Si una escena tiene fondo propio (oscuro, a pantalla completa), en un zoom debe entrar siempre desde ≥1.18× para que no se le vean los bordes.
