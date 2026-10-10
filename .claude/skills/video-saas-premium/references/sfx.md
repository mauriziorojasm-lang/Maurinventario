# Efectos de sonido: el sonido describe lo que pasa

**Regla de oro:** cada sonido es el ruido *físico* de lo que se ve. Si en pantalla alguien escribe en el celular, se oye un teclado; si llega un mensaje, un pop; si se aprieta un botón, un clic. Un video de producto con UI suena **a interfaz** (clics, taps, teclas, pops), no a tráiler de cine. Los whooshes quedan para los movimientos grandes de cámara.

Dos fuentes, en este orden:
1. **Botanica Free SFXs**: los clics y botones de interfaz (abajo).
2. **`scripts/synth_ui_sfx.py`**: un kit sintetizado (sin licencias) con lo que Botanica no trae: teclas de teclado de celular, "enviado", "recibido", notificación, éxito, ticks.

```bash
python3 <skill>/scripts/synth_ui_sfx.py --out assets/sfx/ui
```

### Recetas que suenan naturales
| Lo que pasa en pantalla | Sonido |
|---|---|
| Alguien escribe un mensaje | 5–8 `ui/key-N` con huecos irregulares (0.06–0.11 s), terminando ~0.14 s antes de la burbuja |
| Se envía el mensaje | `ui/send` en el cuadro en que aparece la burbuja |
| Llega una respuesta | `ui/pop` (o `pop-hi`) |
| "Escribiendo…" | **silencio** (en WhatsApp no suena) |
| Llega una notificación | un clic corto distinto por notificación (Magnetic, Granular, Button Cursor) |
| Un celular vibra sobre una mesa | `ui/buzz` (más bajo desde la tercera), y una sola `ui/notify` al principio |
| Aparece un emoji | `ui/pop-hi` muy bajo; si celebra (🎉), un brillo corto de Botanica (`Select, Gratonal, Gleam`) |
| Se aprieta un botón / aparece una pastilla | clic corto de Botanica, alternando 2–3 variantes |
| Algo se confirma (cita creada, check) | clic + select tonal (`Button, Cursor, Select (4)`) |
| Error / cancelación | `Digital, Pulse, Error, Gratonal` |
| Movimiento grande de cámara o cambio de escena | whoosh profundo (Botanica) — uno, no tres |

### Errores que se notan al oído
- **Un mismo sonido con dos significados** (el tap del botón también para el mensaje). Cada sonido significa una sola cosa en todo el video.
- **Taps "tonales" o musicales en un chat**: suenan a efecto, no a teléfono. Para chat, teclas + send + pop.
- **Un whoosh por cada cosa que se mueve.** En UI, la mayoría de los movimientos llevan un clic o nada.

## Botanica (clics de interfaz)

La librería de clics de la skill es **Botanica Free SFXs**. Es gratis: https://mgulifes.gumroad.com/l/botanicafree (si Gumroad pide precio, se pone $0).

- Se descomprime en `~/Downloads` (o en el Escritorio o en Música) y la skill la encuentra sola.
- Son ~34 sonidos de V4, V5 y el Editing Pack: UI "gratonal", granulares, whooshes profundos, glitches y texturas. Suenan a producto tech premium.
- **Úsala siempre primero.** Otro pack solo entra para un rol que Botanica no tenga, y avisándole a la persona.

### Prepararla para el proyecto

```bash
python3 <skill>/scripts/sfx_curate.py --out assets/sfx --per-role 3 --sheet assets/sfx/curados.png
```

El script:
- Mide cada archivo: saturación, ruido de fondo, ataque y cola limpios, forma de la envolvente, estéreo, frecuencia de muestreo.
- Lo clasifica por rol según su nombre y su forma.
- Exporta los mejores **recortados, con fade y normalizados a −1 dBFS** como `<rol>-N.mp3`, más un `manifest.json` que dice el pack y el archivo de origen de cada uno.
- Al final lista los roles que salieron de un pack de respaldo y los que quedaron sin sonido.

Con otro pack de respaldo (el orden de los `--src` es la prioridad):

```bash
python3 <skill>/scripts/sfx_curate.py --src "~/Downloads/Botanica Free SFXs" --src ~/Downloads/OtroPack --out assets/sfx
```

Fuentes de respaldo con uso comercial: Pixabay, Mixkit, Freesound (solo CC0 o CC-BY, revisando cada licencia), YouTube Audio Library.

**Licencia:** los sonidos se usan en tus videos. **No redistribuyas los archivos**: no los subas a un repo público ni los metas en plantillas o skills que compartas. Cada quien descarga el pack.

### Qué trae Botanica y para qué sirve

| Familia (nombre del archivo) | Rol | Úsalo en |
|---|---|---|
| `Gratonal Button, Texter` · `Magnetic, Button` | `ui-click` | clics del cursor, botones, texto que aparece letra a letra |
| `Button, Cursor, Select` · `Select, Dropdown, Menu` | `ui-confirm` | seleccionar, abrir un menú, confirmar |
| `Select, Gratonal, Gleam` · `Text, Button, Gratonal, Shimmer, Pad` | `shimmer` | brillo corto: un check, un dato que aterriza, una palabra de acento |
| `Granular Shine` · `Granular Combo` | `shimmer-long` | revelar el logo, el resultado final, un momento "wow" |
| `Deep, Mini, Whoosh 14` | `whoosh-soft` | palabras y chips que entran (tiene mucho grave: sirve de golpe suave) |
| `Deep, Mini, Whoosh (7)(8)` · `Slice, Cutt, Whoosh` | `whoosh-pass` | zooms de cámara, paneos, un objeto que cruza |
| `Deep, Mini, Whoosh (11)` · `Gratonal Trans` | `whoosh-long` | cambios grandes de escena, vuelos lentos, el logo llegando |
| `Radio, Reverse, Glitch, 404` (el que crece hacia el final) | `reverse` | succión hacia un corte; funciona como riser corto |
| `Glitch, Flicker, Text` · `Glitch, Digital, Noise` · `Whip, Glitch, BadScan, Hack` | `glitch` | cortes tech, errores, "hackeo" (con moderación) |
| `Digital, Pulse, Error, Gratonal` | `ui-error` | un error, algo que falla, el problema |
| `Texture, Rustle, Scaning, Grainy` | `scan` | la IA o el sistema procesando, escaneando, pensando (cama de textura) |
| `Censor Typing` | `typing` | escribir en un input, una terminal o un chat |
| `Cute Vocal` | `vocal` | un personaje o mascota reaccionando (solo si el tono es juguetón) |

### Cuando falta un rol

Primero resuélvelo **con Botanica**. Solo si no funciona, usa el respaldo:

| Falta | Con Botanica |
|---|---|
| `riser` | el `reverse`, o un `whoosh-long` invertido: `ffmpeg -i assets/sfx/whoosh-long-1.mp3 -af areverse assets/sfx/riser-rev-1.mp3` |
| `subdrop` | `whoosh-soft-1` (Deep Mini Whoosh 14) bajado de tono: `ffmpeg -i assets/sfx/whoosh-soft-1.mp3 -af "asetrate=48000*0.7,aresample=48000" assets/sfx/subdrop-1.mp3` |
| `impact` | `ui-click` (Magnetic) + `whoosh-soft` en el mismo cuadro, el whoosh más bajo |
| `ui-pop` / `ui-notify` / teclado / "enviado" | `synth_ui_sfx.py`: `pop`, `notify`, `key-0…7`, `send` |
| `whip` | un `whoosh-pass` recortado a 0.3 s con fade |
| `camera`, `cash` | respaldo con `--src`, solo si el concepto de verdad lo necesita |

## El sonido también es concepto
La ficha del concepto define su **personalidad sonora** (ver [Proceso creativo](proceso-creativo.md)):
- **Interfaz natural** (clics de Botanica + teclas/pops sintetizados): la base para cualquier video donde se ve una UI.
- **Gratonal y granular** (Botanica V5): brillos y transiciones calmas; úsalos para reveals y el logo, no para cada clic.
- **Glitch y texturas**: tech nervioso, seguridad, IA trabajando, "algo se rompe".
- **Vocal y botones elásticos**: juguetón, apps de consumo, mascotas.

No mezcles las tres personalidades en un mismo video.

## Colocación
- **Uno protagonista por movimiento.** No apiles tres whooshes.
- Alinea el **pico** del sonido con el pico del movimiento: `inicio = momento − pico`.
  ```bash
  python3 <skill>/scripts/audio_tools.py peaks assets/sfx/*.mp3
  ```
  Un sonido con pico a 1.26 s que debe golpear en 12.98 empieza en 11.72.
- Volúmenes de partida (archivos normalizados al mismo pico): whooshes 0.2–0.35, UI 0.2–0.45, shimmer 0.2–0.35, texturas `scan` 0.1–0.2 (son cama, no protagonista).
- Revisa que nada tape la voz:
  ```bash
  python3 <skill>/scripts/audio_tools.py check index.html --vo assets/audio/vo-mix.mp3 --music assets/audio/music-mix.mp3
  ```
  Baja los efectos que marque.
- Si el video no lleva voz ni música, los efectos **son** la banda sonora: cuida el silencio entre ellos y deja respirar los `shimmer-long`.
