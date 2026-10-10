# video-saas-premium

Skill para **Claude Code** y **Codex** que convierte **tu producto (web, Instagram) + una idea** en un video de motion graphics con nivel de estudio (estilo Apple / Figma), renderizado en **4K a 60 fps**.

**No usa una plantilla.** Cada video sale de un proceso creativo sobre *tu* producto:

```
lo que necesitas → investigación (web, redes, reseñas, tu UI) → el trabajo del video → 3 conceptos → capturas → animatic → construcción → sonido → 4K
```

Guía completa y videos de ejemplo: **[rayyan.contapro.lat/skills/video-saas-premium](https://rayyan.contapro.lat/skills/video-saas-premium)**

## Antes de instalar: lo que necesitas

La skill lo revisa sola al empezar (`scripts/preflight.py`) y te dice qué falta y cómo instalarlo. Para que lo tengas claro desde ya:

**Obligatorio (sin esto no hay video)**
- **Claude Code** o **Codex**.
- **Node 22+**, **ffmpeg**, **Google Chrome** (o Chromium) y **Python 3** con `numpy` y `Pillow` (`python3 -m pip install numpy pillow`).

**Obligatorio para el resultado premium**
- **Botanica Free SFXs**, los efectos de sonido. Gratis: [mgulifes.gumroad.com/l/botanicafree](https://mgulifes.gumroad.com/l/botanicafree) (pon $0 si pide precio). Descomprímelo en Descargas. **Sin este pack los efectos quedan pobres.**

**Necesario para voz y música**
- Una cuenta de **ElevenLabs** con tu API key guardada en el llavero (abajo). **Sin ElevenLabs no hay voz en off ni música generada**: el video va solo con texto y efectos, o con voz y música que tú traigas.

**Bueno saber**
- En **macOS** salen los **emojis de Apple** y la tipografía SF Pro del sistema. En Linux o Windows se usan los emojis de tu sistema y Inter o Geist.

## Qué la hace distinta
- **Investiga antes de diseñar**:
  - tu web completa e Instagram;
  - lo que preguntan tus clientes;
  - tu competencia;
  - tus activos (logo, mascota, animaciones).
- **Concepto a la medida, no estructura fija.** Te propone 3 conceptos con mecanismos y formas distintas, y tú eliges. Lleva un historial para no repetirse.
- **¿Tienes una referencia?** La analiza, te comenta qué la hace funcionar y cómo la aplicaría a tu producto antes de tocar nada.
- **La interfaz es la real**: te pide capturas de tu producto y las recrea 1:1. Nada de dashboards genéricos ("AI slop").
- **Movimiento con causa:**
  - un foco por plano;
  - transiciones de zoom que nacen de lo que acaba de pasar;
  - el gesto que define tu producto, repetido con resultados distintos;
  - montaje al ritmo de la música.
- **La herramienta la elige el concepto**:
  - GSAP para UI y cámara;
  - Three.js para 3D y el mundo físico (tu producto sobre una mesa real, sin personas falsas);
  - Motion para resortes tipo iOS;
  - Rive y Lottie para animaciones que ya tengas.
- **Detalles Apple, solo cuando suman:**
  - emojis que salen de algo que pasa (🎉 que revienta en confeti);
  - tipeo con cursor;
  - burbujas que "golpean" al enviarse;
  - vidrio sobre la UI.
- **Sonido que describe lo que pasa:**
  - clics de Botanica;
  - un kit natural sintetizado: teclas del celular, enviado, recibido, vibración;
  - voz en off de ElevenLabs sincronizada palabra por palabra;
  - música que entra justo cuando aparece tu producto.

## Instalar

Descarga `video-saas-premium.zip` desde [rayyan.contapro.lat/skills/video-saas-premium](https://rayyan.contapro.lat/skills/video-saas-premium) y descomprímelo en la carpeta de skills de tu agente:

**Claude Code**
```sh
unzip ~/Downloads/video-saas-premium.zip -d ~/.claude/skills/
```

**Codex**
```sh
unzip ~/Downloads/video-saas-premium.zip -d ~/.codex/skills/
```

Debe quedar `~/.claude/skills/video-saas-premium/SKILL.md` (o `~/.codex/skills/...`). Reinicia el agente después de instalar.

### ElevenLabs
Tu API key **nunca** se pega en el chat. Guárdala una vez en tu llavero:

```sh
# macOS
security add-generic-password -U -a "$USER" -s elevenlabs-api-key -w 'sk_...'
# Linux / Windows
export ELEVENLABS_API_KEY=sk_...
```

## Usar

Abre una carpeta vacía en el agente y escribe:

> hazme un video de https://tuproducto.com, mi Instagram es @tuproducto

El agente:
1. **Revisa tu equipo** y te dice en un solo mensaje todo lo que falta y lo que te va a pedir.
2. **Investiga** tu web, tus redes, tus reseñas y tu competencia, y te resume lo que entendió.
3. **Define el trabajo del video**: dónde se publica, quién lo ve y qué tiene que lograr.
4. **Te propone 3 conceptos distintos** y tú eliges.
5. **Te pide capturas** de las pantallas que salen en el concepto (⌘⇧4 + Espacio en Mac).
6. **Te muestra un animatic** (cuadros clave) antes de animar todo.
7. **Construye y revisa** el video cuadro por cuadro.
8. **Sonido**: efectos de Botanica y del kit natural; si hay voz o música, eliges escuchando muestras.
9. **Renderiza en 4K** y te abre el archivo.

## Qué hay dentro
- `SKILL.md`: el flujo que sigue el agente.
- `references/`:
  - antes de empezar, investigación y proceso creativo (incluye cuándo usar los detalles Apple);
  - herramientas (GSAP, Three.js y el mundo físico, Motion, Rive, Lottie, detalles Apple);
  - capturas de UI, look premium, voz y música, efectos, API del kit y errores comunes.
- `kit/`: helpers seek-safe para [HyperFrames](https://hyperframes.heygen.com):
  - `premium.js`: barridos y voz sincronizada;
  - `apple.js` + `apple.css`: zoom, tipeo, emoji, confeti, vidrio;
  - `capas.js`: resortes y Rive;
  - `three-stage.js`: 3D;
  - `motion-kit.js`;
  - `vendor/` con Rive y Motion (MIT).
- `scripts/`:
  - `preflight.py`: revisión inicial;
  - `brand_from_url.py`: extraer la marca;
  - `analizar_referencia.py`: estudiar un video de referencia;
  - `eleven_vo.py`: voz y música con ElevenLabs;
  - `audio_tools.py`: voz sincronizada, música (`music` / `music-fit`), picos y mezcla;
  - `sfx_curate.py`: clics de Botanica por rol;
  - `synth_ui_sfx.py`: kit natural sintetizado.
- `examples/starter/`: composición mínima de partida.

## Licencia
Código bajo licencia MIT. Rive (`@rive-app/canvas-advanced`) y Motion vienen incluidos bajo su propia licencia MIT (`kit/vendor/LICENCIAS.md`).

Botanica, las tipografías, los emojis, las voces y la música son de sus autores. Úsalos en tus videos, pero no los redistribuyas. SF Pro y los emojis de Apple solo existen en macOS; Inter y Geist son OFL.

Hecha por [Rayyan](https://rayyan.contapro.lat).
