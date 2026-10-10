---
name: video-saas-premium
description: Crea videos de motion graphics premium (nivel Apple / Figma, render 4K60) para un producto, SaaS, app o marca a partir de su web, su Instagram y una idea. No sigue una plantilla. Investiga a fondo la marca (web completa, redes, reseñas, competencia, la UI real), decide qué trabajo tiene que hacer el video y propone 3 conceptos con estructuras propias, anti "AI slop". Con el concepto elegido escoge las herramientas que pide: HyperFrames + GSAP para UI, tipografía y transiciones de zoom; Three.js para 3D y el mundo físico; Motion (motion.dev) para resortes tipo iOS; Rive y Lottie para animaciones existentes; y detalles Apple (emojis, tipeo con cursor, vidrio) solo cuando el concepto los justifica. Recrea la UI real 1:1 desde capturas, sonoriza con la librería gratuita Botanica y un kit natural sintetizado, y usa ElevenLabs para la voz en off y la música. Úsala cuando digan "hazme un video saas de <url>", "video de lanzamiento", "promo de mi app", "motion graphics de mi producto/marca", "video estilo Apple / Figma" o "video premium".
---

# Video SaaS premium

Convierte **un link (web, Instagram…) + una idea** en un video de motion graphics hecho **a la medida de ese producto**.

**No hay una estructura fija.** No existe "el video de esta skill": cada video sale de un proceso creativo sobre *ese* producto. La forma, la duración, el formato, si lleva voz, qué detalles visuales usa y con qué herramientas se hace se deciden en el concepto. Si dos videos de productos distintos se parecen, el proceso falló.

**antes de empezar → investigación → el trabajo del video → 3 conceptos → (capturas) → animatic → construcción → sonido → QA → render**

Habla con la persona en su idioma y en tono cercano. Antes de cada paso largo, explica qué vas a hacer.

`<skill>` = la carpeta de este SKILL.md.

## 0. Antes de empezar (siempre, en tu primera respuesta)

Sin esto el resultado no llega al nivel premium. Revísalo y díselo a la persona **antes** de cualquier otra cosa.

1. Corre `python3 <skill>/scripts/preflight.py`.
2. Manda **un solo mensaje** con **todo** lo que hace falta ([plantilla](references/antes-de-empezar.md#3-el-mensaje-plantilla)):
   - **Herramientas obligatorias** que falten (Node 22+, ffmpeg, Chrome, Python con numpy y Pillow), con el comando exacto. Sin ellas no se puede componer ni renderizar.
   - **Botanica Free SFXs**, gratis en https://mgulifes.gumroad.com/l/botanicafree. **Sin este pack los efectos de sonido quedan pobres.** Es parte del resultado, no un extra.
   - **ElevenLabs** (key guardada en el llavero). **Sin ElevenLabs no hay voz en off ni música generada.** El video quedaría solo con texto y efectos, o con la voz y la música que la persona traiga. Díselo claro para que decida.
   - Lo que la persona te tiene que dar: link, redes, para qué es el video, la idea y los activos de marca.
   - Lo que le pedirás más adelante: capturas de su UI, elegir concepto, voz y música.
3. **No construyas nada** hasta que lo obligatorio esté resuelto. Con el link ya puedes investigar. Lo opcional no bloquea.

Detalle completo en [Antes de empezar](references/antes-de-empezar.md).

## 1. Investigación profunda

Extrae **toda** la información real posible, no solo el hero de la web:
- la web completa (con `scripts/brand_from_url.py` para colores, tipografías, logo y capturas);
- Instagram y otras redes: bio, posts, reels, cómo se mueve la marca y qué preguntan los clientes;
- tiendas de apps, reseñas, competencia;
- el producto real, y su código si es local;
- los activos que ya existan: logo, mascota, `.riv`, `.lottie`.

El resultado va en `investigacion/dossier.md`: hechos con fuente, citas textuales y lo que no sabemos. Cómo hacerlo en [Investigación](references/investigacion.md).

## 2. El trabajo del video

Antes de pensar en efectos, responde en `investigacion/brief.md`:
- dónde se va a ver;
- quién lo ve y en qué estado (scrolleando sin sonido, en una landing, en un pitch);
- qué tiene que entender, sentir y hacer después;
- **¿qué puede hacer el movimiento por este producto que una captura o un texto no pueden?**

De esa respuesta sale el concepto.

## 3. Tres conceptos (la persona elige)

Sigue [Proceso creativo](references/proceso-creativo.md). Propón **3 conceptos que difieran en mecanismo Y en estructura**. Cada uno define:
- su propia forma (plano secuencia, loop, demo en tiempo real, objeto que se transforma, tipografía pura, personaje…);
- duración, formato y ritmo;
- voz sí/no;
- herramientas y detalles visuales;
- personalidad sonora.

"Problema → solución" es una opción más, no la base.

- **¿Te pasaron una referencia?** Analízala primero (`scripts/analizar_referencia.py`), coméntale a la persona qué la hace funcionar y cómo la traducirías, y espera su ok ([C3](references/proceso-creativo.md#c3-cuando-te-pasan-una-referencia)).
- Revisa `~/.video-saas-premium/historial.md`: no repitas la forma ni el mecanismo de los últimos videos.
- Pasa la **prueba del intercambio**: si pones el logo de un competidor y el concepto sigue funcionando, es slop.
- Aplica el criterio de [Cómo piensa un video premium](references/proceso-creativo.md#c2-cómo-piensa-un-video-premium-no-es-estructura-es-criterio):
  - un foco por plano;
  - transiciones con causa;
  - el gesto que define el producto;
  - el mundo físico cuando aporta;
  - ritmo con una idea por momento.
- Decide los **detalles Apple** (emojis, tipeo con cursor, vidrio, celebración) con las preguntas de [C4](references/proceso-creativo.md#c4-detalles-apple-emojis-tipeo-vidrio-cuándo-sí-y-cuándo-no). Suelen sumar, pero cada uno tiene que ganarse su lugar.
- Recomienda uno, explica por qué con el brief en la mano y **deja que la persona elija**.

## 4. Capturas de la UI real (si el concepto muestra interfaz)

Envía una lista corta y concreta de capturas (qué pantalla, en qué estado, claro u oscuro) y **espera**. Lo público lo capturas tú. Mide, muestrea los colores y copia los textos exactos para recrear 1:1. Nunca inventes una UI que existe. Ver [Capturas de UI](references/capturas-ui.md).

## 5. Animatic

Antes de animar todo, arma **6–8 cuadros fijos clave** del concepto elegido (`npx hyperframes snapshot`) y muéstralos. Es el momento barato para corregir el rumbo.

## 6. Construye con las herramientas que el concepto pidió

HyperFrames es siempre el motor de render (determinista, 4K60). Encima se usan **solo** las capas que el concepto necesita:

| El concepto necesita | Herramienta |
|---|---|
| UI real, tipografía, cámara, transiciones de zoom | GSAP + `kit/premium.js`, `kit/motion-kit.js`, `MKA.zoomThrough` |
| El mundo físico sin video (un celular sobre un mostrador, un objeto real), 3D, logo extruido | Three.js · `kit/three-stage.js` |
| UI que se sienta física (hojas, tarjetas, notificaciones tipo iOS) | Motion (motion.dev) · `MKL.spring` en `kit/capas.js` |
| Emojis de Apple, tipeo con cursor, burbuja que golpea, confeti, vidrio | `kit/apple.js` + `kit/apple.css` |
| Personaje o ilustración animada que la marca ya tiene en Rive | Rive · `MKL.rive` en `kit/capas.js` |
| Animaciones ya hechas (After Effects / LottieFiles) | Lottie (adaptador nativo de HyperFrames) |

Detalle, código y límites en [Herramientas](references/herramientas.md). Por ejemplo: no se puede crear un `.riv` desde cero, y nunca se fingen personas en 3D. Lo visual en [Look premium](references/look-premium.md) y la API en [Kit](references/kit.md).

```bash
npx hyperframes init motion --non-interactive --example=blank
cp -R <skill>/kit motion/kit        # premium.js, apple.js/.css, capas.js, three-stage.js, motion-kit.js/.css, vendor/
```

Verifica con `npx hyperframes check .` y **muchos snapshots** (`--at …`), incluidos los cuadros a mitad de cada transición y saltos hacia atrás en el tiempo. Busca:
- texto encimado;
- UI genérica o cortada por el borde;
- dos cosas compitiendo en un plano;
- momentos estáticos;
- cortes duros;
- flashes.

## 7. Sonido

- **Efectos: el sonido describe lo que pasa en pantalla.** Un video con UI suena a interfaz: clics, teclas, "enviado", pops y la vibración del celular. Los whooshes, solo para los movimientos grandes.
  - Clics de **Botanica** (`scripts/sfx_curate.py --out assets/sfx`) + el kit natural sintetizado `scripts/synth_ui_sfx.py` (teclado, send, pop, notificación, vibración).
  - Un sonido = un significado en todo el video; el "escribiendo…" va en silencio. Ver [Efectos](references/sfx.md).
- **Voz** (ElevenLabs, si el concepto la lleva):
  - 4–6 voces con la misma frase, y la persona elige escuchando.
  - Una frase por plano; dice exactamente lo que se lee y cada palabra aparece cuando se pronuncia.
- **Música** (ElevenLabs, si la lleva): 3 muestras → la persona elige.
  - Muestras cortas: `audio_tools.py music`.
  - Pistas largas con su propia intro y drop: `audio_tools.py music-fit`. Pone el drop en la palabra que nombra el producto y te da el pulso para cortar a tempo.
  - Ver [Voz y música](references/voz-y-musica.md).

## 8. Render y cierre

```bash
npx hyperframes render --resolution 4k --fps 60 --quality delivery -o ../video-4k.mp4
```

Compón a 1920×1080 (o 1080×1920 en vertical); el render sale en 4K. Normaliza el audio final a −15 LUFS para redes. Abre el resultado y cuéntale a la persona qué pasa en cada momento. Al final, añade una línea a `~/.video-saas-premium/historial.md` con producto, forma, mecanismo, herramientas, duración, formato y las críticas que hubo.

## Lo que hace premium a un video (y lo que lo vuelve "AI slop")

- **Una idea verdadera sobre ese producto**: decoración no es creatividad.
- **La interfaz es la real.** Se recrea 1:1 desde capturas. Una "terminal oscura cualquiera" o un "chat genérico" delatan a la IA.
- **Movimiento con intención**:
  - cámara que sigue cada acción;
  - transiciones de zoom que nacen de lo que pasó;
  - resortes físicos donde la UI lo pide;
  - 3D real, no CSS falso.
- **Una idea por plano**, a un ritmo que se pueda leer.
- **Detalles Apple solo con causa**: el emoji sale de algo que pasa, el cursor escribe lo que alguien escribe, el vidrio flota sobre contenido.
- **Nunca flashes blancos** ni "cúpulas" de luz: los cambios se esconden en un movimiento.
- **Sonido físico en cada movimiento importante**, sin tapar la voz.
- **Solo hechos**: nada de cifras, reseñas o afirmaciones inventadas.

## Cómo leer las críticas

| Dicen | Significa | Haz |
|---|---|---|
| "se ve AI slop" | UI o componentes genéricos, decoración (contadores, etiquetas "01 /") | Usa capturas reales; quita lo que no defienda una razón de esta marca |
| "se ve horrible / barato" | Texto grande, flashes, fades planos, todo estático | Vuelve al look premium: tipografía pequeña, barridos, cámara, 3D, resortes |
| "no me convence" | Concepto débil | Vuelve al paso 2: otro trabajo del video u otra observación |
| "se parece al anterior / siempre es igual" | Repetiste forma o mecanismo | Revisa el historial y propone formas que no hayas usado |
| "no se entiende / va muy rápido" | Varias ideas en el mismo plano, planos de 1 s | Una idea por plano y una frase que diga qué pasa; ~2 s para leer un chat, ~1,5 s para ver un resultado |
| "va muy lento / aburre" | Planos largos sin energía | Transiciones de zoom, música con pulso y cortes a tempo, sin cargar más cosas por plano |
| "el panel se ve a la mitad" / "se sobreponen" | UI cortada por el borde o capas encima de otras | UI completa en su cuadro, etiquetas en espacio vacío, subtítulos con su zona libre |
| "los sfx no me convencen / no son naturales" | Sonidos de "efecto" en vez del ruido de lo que se ve | Clics para UI, teclas + send + pop para chats, silencio en "escribiendo…"; nada de taps tonales repetidos |
| "la voz / música está fea" | Elegiste por ellos | Dales muestras para que elijan escuchando |
| "no está sincronizado" | Voz colocada por estimación | Marcas de tiempo por palabra y `sayIn` |
| "me gusta pero…" | Concepto aprobado | Arregla solo lo que piden |

Errores conocidos y soluciones: [Errores comunes](references/errores-comunes.md).
